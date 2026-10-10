import { ringArea, type Pts, type Rect, type SheetGeometry } from './decode';
import type { View } from './paint';
import { stairLabels } from './paint';
import { project } from './project';

// What a sheet says in words (docs/portfolio/desk-drawing-set.md §3 "Labels").
// Labels are DOM text over the canvas — crisp, and set whole, never typed out
// (reading copy never animates). Two kinds:
//  - room labels: at most 12 a sheet, only a named room of at least 9 m² whose
//    label fits inside it; the flats' unit numbers first, then the rooms outside
//    any flat, then the first flat's rooms, largest first;
//  - geometry labels: what an inferred or unusual piece of the drawing is (a lift
//    core, a region that is no room, a stair's risers). Uncapped and required: a
//    piece of geometry whose label cannot be placed is not described, and a label
//    that does not fit inside its piece stands beside it on a leader.
// Pure: the width of a text comes from an injected measure (the film's canvas).

export type LabelKind = 'room' | 'unit' | 'geometry';

export interface Label {
  text: string;
  kind: LabelKind;
  /** Box, canvas px. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** For a label on a leader: the point it describes, px. */
  leader: [number, number] | null;
}

/** Width of a label's box (its text, tracking and padding), px. */
export type Measure = (text: string, kind: LabelKind) => number;

export const LABEL_HEIGHT: Readonly<Record<LabelKind, number>> = { room: 13, unit: 15, geometry: 13 };
export const MAX_ROOM_LABELS = 12;

/** A fallback measure: 6.0 px a character plus tracking and padding (the font not loaded yet). */
export const fallbackMeasure: Measure = (text, kind) => text.length * (kind === 'unit' ? 6.4 : 6.0) + 8;

const overlaps = (a: Pick<Label, 'x' | 'y' | 'w' | 'h'>, b: Pick<Label, 'x' | 'y' | 'w' | 'h'>, gap = 2) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

const P = [0, 0];

/** A ring's box on screen, px. */
const screenBox = (v: View, ring: Pts, z = 0): Rect => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    if (!project(v.pose, v.b, v.frame, ring[i], ring[i + 1], z, P)) continue;
    x0 = Math.min(x0, P[0]); x1 = Math.max(x1, P[0]); y0 = Math.min(y0, P[1]); y1 = Math.max(y1, P[1]);
  }
  return { x0, y0, x1, y1 };
};

const rectScreen = (v: View, r: Rect, z = 0): Rect => {
  const pts = new Float64Array([r.x0, r.y0, r.x1, r.y0, r.x1, r.y1, r.x0, r.y1]);
  return screenBox(v, pts, z);
};

/** A ring on screen, px (a plan's rings stay axis-aligned there). */
const screenRing = (v: View, ring: Pts, z = 0): Float64Array => {
  const out = new Float64Array(ring.length);
  for (let i = 0; i < ring.length; i += 2) {
    project(v.pose, v.b, v.frame, ring[i], ring[i + 1], z, P);
    out[i] = P[0];
    out[i + 1] = P[1];
  }
  return out;
};

/**
 * A label box inside a room's outline (not just its bounding box: an L-shaped room's
 * box takes in its neighbours): its corners, grown by the margin, inside the ring, and
 * none of the ring's corners inside it. Exact for a rectilinear room on a plan.
 */
const insideRing = (box: Pick<Label, 'x' | 'y' | 'w' | 'h'>, ring: Float64Array, margin = 2): boolean => {
  const x0 = box.x - margin; const y0 = box.y - margin; const x1 = box.x + box.w + margin; const y1 = box.y + box.h + margin;
  for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) if (!insideRingPx(ring, x, y)) return false;
  for (let i = 0; i < ring.length; i += 2) if (ring[i] > x0 && ring[i] < x1 && ring[i + 1] > y0 && ring[i + 1] < y1) return false;
  return true;
};

const insideRingPx = (ring: Float64Array, x: number, y: number): boolean => {
  let hit = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const yi = ring[i + 1];
    const yj = ring[j + 1];
    if ((yi > y) !== (yj > y) && x < ((ring[j] - ring[i]) * (y - yi)) / (yj - yi) + ring[i]) hit = !hit;
  }
  return hit;
};

const inside = (box: Pick<Label, 'x' | 'y' | 'w' | 'h'>, r: Rect, margin = 2) =>
  box.x >= r.x0 + margin && box.y >= r.y0 + margin && box.x + box.w <= r.x1 - margin && box.y + box.h <= r.y1 - margin;

/** Where labels may go: the canvas (a sheet's dimensions and leaders stand outside its drawing area). */
export interface Bounds { x: number; y: number; w: number; h: number }

const within = (box: Pick<Label, 'x' | 'y' | 'w' | 'h'>, b: Bounds) =>
  box.x >= b.x && box.y >= b.y && box.x + box.w <= b.x + b.w && box.y + box.h <= b.y + b.h;

/** The room labels of a plan sheet, placed. */
export const roomLabels = (g: SheetGeometry, v: View, measure: Measure, max = MAX_ROOM_LABELS, taken: Label[] = []): Label[] => {
  const out: Label[] = [];
  const anchorOf = new Map(g.anchors.map((a) => [a.ring, a]));
  const area = (i: number) => Math.abs(ringArea(g.rooms[i]));
  const tryPlace = (ring: number, text: string, kind: LabelKind) => {
    if (out.length >= max || !text) return;
    const a = anchorOf.get(ring);
    if (!a || !project(v.pose, v.b, v.frame, a.x, a.y, 0, P)) return;
    const w = measure(text.toUpperCase(), kind);
    const h = LABEL_HEIGHT[kind];
    const box = { x: P[0] - w / 2, y: P[1] - h / 2, w, h };
    if (!insideRing(box, screenRing(v, g.rooms[ring])) || !within(box, v.frame)) return;
    if ([...taken, ...out].some((o) => overlaps(o, box))) return;
    out.push({ text: text.toUpperCase(), kind, ...box, leader: null });
  };
  // 1. Unit numbers, each in its flat's largest labelled room.
  g.groups.forEach(([first, count], gi) => {
    if (gi === 0 || !g.units[gi]) return;
    const rings = [...Array(count).keys()].map((k) => first + k).filter((i) => anchorOf.has(i)).sort((a, b) => area(b) - area(a));
    if (rings.length) tryPlace(rings[0], g.units[gi], 'unit');
  });
  // 2. The rooms outside any flat, largest first.
  const [c0, cn] = g.groups[0] ?? [0, 0];
  [...Array(cn).keys()].map((k) => c0 + k).filter((i) => anchorOf.has(i)).sort((a, b) => area(b) - area(a))
    .forEach((i) => tryPlace(i, g.labels[i], 'room'));
  // 3. The first flat's rooms, largest first (a unit's number already sits in its largest).
  if (g.groups.length > 1) {
    const [f0, fn] = g.groups[1];
    [...Array(fn).keys()].map((k) => f0 + k).filter((i) => anchorOf.has(i)).sort((a, b) => area(b) - area(a))
      .forEach((i) => tryPlace(i, g.labels[i], 'room'));
  }
  return out;
};

/**
 * Places a geometry label: inside `target` (px) if it fits, else beside it — right,
 * left, below, above — on a leader. null when it fits nowhere in the frame.
 */
export const placeGeometryLabel = (text: string, target: Rect, v: View, measure: Measure, taken: readonly Label[], bounds: Bounds = v.frame): Label | null => {
  const w = measure(text, 'geometry');
  const h = LABEL_HEIGHT.geometry;
  const cx = (target.x0 + target.x1) / 2;
  const cy = (target.y0 + target.y1) / 2;
  const options: [number, number, boolean][] = [
    [cx - w / 2, cy - h / 2, false],
    [target.x1 + 10, cy - h / 2, true],
    [target.x0 - 10 - w, cy - h / 2, true],
    [cx - w / 2, target.y1 + 8, true],
    [cx - w / 2, target.y0 - 8 - h, true],
  ];
  for (const [x, y, leader] of options) {
    const box = { x, y, w, h };
    if (!leader && !inside(box, target, 1)) continue;
    if (!within(box, bounds)) continue;
    if (taken.some((o) => overlaps(o, box))) continue;
    return { text, kind: 'geometry', ...box, leader: leader ? [cx, cy] : null };
  }
  return null;
};

/** The geometry labels a plan sheet needs: its inferred cores, its large voids, its stairs, a partial sheet's outline. */
export const geometryLabels = (g: SheetGeometry, v: View, measure: Measure, taken: Label[] = [], bounds: Bounds = v.frame): Label[] => {
  const out: Label[] = [];
  const add = (text: string, target: Rect) => {
    const label = placeGeometryLabel(text, target, v, measure, [...taken, ...out], bounds);
    if (label) out.push(label);
  };
  // A small sheet keeps its words to what it most needs: the cores below 4 px/m and
  // the stairs below 6 px/m would bury the plan they describe. (A core is never
  // filled, so without its label it is simply an unlabelled gap.)
  const scale = v.frame.h / (2 * v.pose.k);
  if (scale >= 4) {
    for (const c of g.cores) {
      const lifts = c.lifts === 1 ? '1 LIFT' : `${c.lifts} LIFTS`;
      add(c.aligned ? `LIFT CORE · ${lifts} (INFERRED, ALIGNED BELOW)` : `LIFT CORE · ${lifts} (INFERRED)`, rectScreen(v, c));
    }
  }
  for (const r of g.voids) if ((r.x1 - r.x0) * (r.y1 - r.y0) >= 40) add('NOT A ROOM IN THE DATA', rectScreen(v, r));
  if (scale >= 6) {
    for (const s of stairLabels(g)) {
      if (!project(v.pose, v.b, v.frame, s.x, s.y, 0, P)) continue;
      add(s.text, { x0: P[0] - 2, y0: P[1] - 2, x1: P[0] + 2, y1: P[1] + 2 });
    }
  }
  if (g.partial) {
    const box = screenBox(v, g.fp);
    add('OUTLINE OF L1 BELOW', { x0: box.x0, y0: box.y0, x1: box.x0 + 4, y1: box.y0 + 4 });
  }
  return out;
};
