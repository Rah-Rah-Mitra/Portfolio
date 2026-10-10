import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { SCALE_LADDER } from '../lib/drawings/compose';
import { boundsOf, decodeSheet, insideRing, ringArea, type Rect, type SheetGeometry } from '../lib/drawings/decode';
import {
  fallbackMeasure, geometryLabels, LABEL_HEIGHT, MAX_ROOM_LABELS, placeGeometryLabel, roomLabels, type Bounds, type Label,
} from '../lib/drawings/labels';
import { stairLabels, viewOf, type View } from '../lib/drawings/paint';
import { planPose, project, pxPerMetre, type Frame } from '../lib/drawings/project';
import { SHEET_LOADERS } from '../lib/drawings/sheetLoaders.generated';
import { SITES } from '../lib/drawings/site.generated';

// What the desk's plan sheets say in words (lib/drawings/labels.ts; plan §3
// "Labels"; docs/portfolio/desk-drawing-set.md §4), over the committed sheets of
// all 14 buildings and every step of compose.ts's scale ladder, measured with the
// deterministic fallbackMeasure (the font-not-loaded widths), so every placement
// here is exact. Room labels are capped at 12 a sheet,
// unit numbers first, each inside its room and the frame with a 2 px gap between
// any two; geometry labels say what an inferred or unusual piece is (a lift core,
// the car park's ramp void, a stair's risers, the hawker centre's partial L2) and
// stand beside a piece too small to hold them, on a leader. Labels are set whole:
// no API takes a progress, so reading copy can never be typed out.

const sheets = new Map<string, Map<string, SheetGeometry>>();

beforeAll(async () => {
  for (const site of SITES) {
    const mod = await SHEET_LOADERS[site.id]();
    sheets.set(site.id, new Map(mod.SHEETS.map((s) => [s.key, decodeSheet(site, s)])));
  }
});

const sheet = (id: string, key: string): SheetGeometry => {
  const g = sheets.get(id)?.get(key);
  if (!g) throw new Error(`no sheet ${id} ${key}`);
  return g;
};

const eachSheet = (fn: (id: string, key: string, g: SheetGeometry) => void) => {
  for (const [id, byKey] of sheets) for (const [key, g] of byKey) fn(id, key, g);
};

/** Every scale compose.ts may draw a plan at, px/m (4 and 6 are the two label gates). */
const LADDER: readonly number[] = SCALE_LADDER;

/**
 * A north-up plan view at `s` px/m, centred on the footprint, the frame the
 * footprint plus `pad` px a side, set off the canvas origin so frame.x/y count.
 */
const planView = (g: SheetGeometry, s: number, pad = 400): View => {
  const b = boundsOf([g.fp]);
  const frame: Frame = { x: 40, y: 24, w: (b.x1 - b.x0) * s + 2 * pad, h: (b.y1 - b.y0) * s + 2 * pad };
  return viewOf(planPose((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, frame.h / (2 * s)), frame);
};

const at = (v: View, x: number, y: number): [number, number] => {
  const out = [0, 0];
  expect(project(v.pose, v.b, v.frame, x, y, 0, out)).toBe(true);
  return [out[0], out[1]];
};

/** A ring's box on screen, px (recomputed here, not taken from labels.ts). */
const screenRect = (v: View, ring: Float64Array): Rect => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    const [x, y] = at(v, ring[i], ring[i + 1]);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
};

const rectOf = (v: View, r: Rect): Rect => screenRect(v, new Float64Array([r.x0, r.y0, r.x1, r.y0, r.x1, r.y1, r.x0, r.y1]));

type Box = Pick<Label, 'x' | 'y' | 'w' | 'h'>;
/** Closer than `gap` px on both axes. */
const tooClose = (a: Box, b: Box, gap = 2) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
const insideRect = (b: Box, r: Rect, margin: number) =>
  b.x >= r.x0 + margin - 1e-9 && b.y >= r.y0 + margin - 1e-9 && b.x + b.w <= r.x1 - margin + 1e-9 && b.y + b.h <= r.y1 - margin + 1e-9;
const insideBounds = (b: Box, f: Bounds) =>
  b.x >= f.x - 1e-9 && b.y >= f.y - 1e-9 && b.x + b.w <= f.x + f.w + 1e-9 && b.y + b.h <= f.y + f.h + 1e-9;

const groupOf = (g: SheetGeometry, ring: number) => g.groups.findIndex(([first, count]) => ring >= first && ring < first + count);
const area = (g: SheetGeometry, ring: number) => Math.abs(ringArea(g.rooms[ring]));

/** The room a placed room label names: the anchored ring whose anchor is the label's centre and whose name (or flat) it prints. */
const ownerOf = (g: SheetGeometry, v: View, l: Label): number => {
  const mx = l.x + l.w / 2;
  const my = l.y + l.h / 2;
  const hits = g.anchors.filter((a) => {
    const [x, y] = at(v, a.x, a.y);
    if (Math.abs(x - mx) > 1e-6 || Math.abs(y - my) > 1e-6) return false;
    return l.kind === 'unit' ? g.units[groupOf(g, a.ring)] === l.text : g.labels[a.ring].toUpperCase() === l.text;
  });
  expect(hits, `${l.kind} "${l.text}" has exactly one anchored owner`).toHaveLength(1);
  return hits[0].ring;
};

const texts = (labels: readonly Label[]) => labels.map((l) => l.text);

describe('room labels', () => {
  it('sets at most 12 a sheet: BLK 509’s typical floor fills the cap at 24 px/m, its ten unit numbers first', () => {
    expect(MAX_ROOM_LABELS).toBe(12);
    const g = sheet('BLK_509', 'TYP');
    const out = roomLabels(g, planView(g, 24), fallbackMeasure);
    expect(out).toHaveLength(MAX_ROOM_LABELS);
    expect(out.slice(0, 10).map((l) => [l.kind, l.text])).toEqual(
      ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110'].map((u) => ['unit', u]),
    );
    expect(out.slice(10).map((l) => [l.kind, l.text])).toEqual([['room', 'COMMON CORRIDOR'], ['room', 'STAIR 4']]);
    // `max` is a cap, not a target: three are three unit numbers.
    expect(texts(roomLabels(g, planView(g, 24), fallbackMeasure, 3))).toEqual(['101', '102', '103']);
    expect(roomLabels(g, planView(g, 24), fallbackMeasure, 0)).toEqual([]);
  });

  it('on every sheet of all 14 buildings and the whole ladder: ≤ 12, no two within 2 px, each inside its room’s screen box and the frame', () => {
    let placed = 0;
    let sheetsSeen = 0;
    eachSheet((id, key, g) => {
      sheetsSeen += 1;
      for (const s of LADDER) {
        const v = planView(g, s);
        const out = roomLabels(g, v, fallbackMeasure);
        const where = `${id} ${key} @ ${s} px/m`;
        expect(out.length, where).toBeLessThanOrEqual(MAX_ROOM_LABELS);
        out.forEach((a, i) => out.slice(i + 1).forEach((b) => expect(tooClose(a, b), `${where}: "${a.text}" / "${b.text}"`).toBe(false)));
        for (const l of out) {
          expect(l.leader, where).toBeNull();
          expect(l.h).toBe(LABEL_HEIGHT[l.kind]);
          expect(insideRect(l, screenRect(v, g.rooms[ownerOf(g, v, l)]), 2), `${where}: "${l.text}" in its room’s box`).toBe(true);
          expect(insideBounds(l, v.frame), `${where}: "${l.text}" in the frame`).toBe(true);
        }
        placed += out.length;
      }
    });
    expect(sheetsSeen).toBe(41);
    expect(placed).toBeGreaterThan(300);
  });

  it('unit numbers first (each in its flat’s largest labelled room), then the rooms outside any flat, then the first flat’s, largest first; no other flat’s rooms are named', () => {
    let units = 0;
    eachSheet((id, key, g) => {
      for (const s of LADDER) {
        const v = planView(g, s);
        const out = roomLabels(g, v, fallbackMeasure);
        const where = `${id} ${key} @ ${s} px/m`;
        let lastRank = -1;
        let lastArea = Infinity;
        for (const l of out) {
          const ring = ownerOf(g, v, l);
          const group = groupOf(g, ring);
          if (l.kind === 'unit') {
            expect(group, where).toBeGreaterThan(0);
            const largest = g.anchors.map((a) => a.ring).filter((r) => groupOf(g, r) === group).sort((a, b) => area(g, b) - area(g, a))[0];
            expect(ring, `${where}: unit ${l.text} sits in its flat’s largest labelled room`).toBe(largest);
            units += 1;
          } else {
            expect(group, `${where}: "${l.text}" is outside any flat or in the first flat`).toBeLessThanOrEqual(1);
          }
          const rank = l.kind === 'unit' ? 0 : group + 1;
          expect(rank, `${where}: "${l.text}" in order`).toBeGreaterThanOrEqual(lastRank);
          if (rank !== lastRank) lastArea = Infinity;
          if (rank > 0) {
            expect(area(g, ring), `${where}: "${l.text}" largest first`).toBeLessThanOrEqual(lastArea + 1e-9);
            lastArea = area(g, ring);
          }
          lastRank = rank;
        }
      }
    });
    expect(units).toBeGreaterThan(100);
    // BLK 501's typical floor at 24 px/m, in words.
    const g = sheet('BLK_501', 'TYP');
    expect(roomLabels(g, planView(g, 24), fallbackMeasure).map((l) => `${l.kind}:${l.text}`)).toEqual([
      'unit:101', 'unit:103', 'unit:105', 'unit:107',
      'room:LIFT LOBBY / COMMON CORRIDOR', 'room:STAIR 1', 'room:STAIR 2',
      'room:KITCHEN', 'room:BEDROOM 2', 'room:BEDROOM 3',
    ]);
  });

  it('names nothing without an anchor: BLK 501 L1’s 2.3 m² bin centre stays unnamed, a sheet stripped of anchors says nothing, the car park’s nameless lots never speak', () => {
    const l1 = sheet('BLK_501', 'L1');
    const bin = l1.labels.indexOf('Bin centre 1');
    expect(bin).toBeGreaterThanOrEqual(0);
    expect(l1.anchors.some((a) => a.ring === bin)).toBe(false);
    expect(area(l1, bin)).toBeLessThan(9);
    expect(texts(roomLabels(l1, planView(l1, 24), fallbackMeasure))).toEqual(['VOID DECK', 'RESIDENTS\' COMMITTEE CENTRE', 'STAIR 1', 'STAIR 2']);
    eachSheet((id, key, g) => {
      expect(roomLabels({ ...g, anchors: [] }, planView(g, 24), fallbackMeasure), `${id} ${key}`).toEqual([]);
    });
    const deck = sheet('MSCP_513', 'TYP');
    expect(deck.labels.filter((t) => t === '').length).toBeGreaterThan(150);
    for (const s of LADDER) for (const l of roomLabels(deck, planView(deck, s), fallbackMeasure)) expect(l.text).not.toBe('');
  });

  it('keeps out of what was already placed and out of a frame that cuts the building', () => {
    const g = sheet('BLK_509', 'TYP');
    const v = planView(g, 24);
    const all = roomLabels(g, v, fallbackMeasure);
    // Everything taken: nothing placed.
    expect(roomLabels(g, v, fallbackMeasure, MAX_ROOM_LABELS, [{ text: 'X', kind: 'geometry', ...v.frame, leader: null }])).toEqual([]);
    // One label taken where unit 101 stands: 101 goes, the rest stay and none comes within 2 px of it.
    const u101 = all.find((l) => l.text === '101')!;
    const taken: Label = { ...u101, text: '28200', kind: 'geometry' };
    const out = roomLabels(g, v, fallbackMeasure, MAX_ROOM_LABELS, [taken]);
    expect(texts(out)).not.toContain('101');
    expect(texts(out)).toContain('102');
    for (const l of out) expect(tooClose(l, taken)).toBe(false);
    // A frame 600 × 300 px over the slab's middle: only what lies wholly inside it.
    const b = boundsOf([g.fp]);
    const frame: Frame = { x: 0, y: 0, w: 600, h: 300 };
    const cut = viewOf(planPose((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, frame.h / (2 * 24)), frame);
    const inCut = roomLabels(g, cut, fallbackMeasure);
    expect(inCut.length).toBeGreaterThan(0);
    expect(inCut.length).toBeLessThan(all.length);
    for (const l of inCut) expect(insideBounds(l, frame), l.text).toBe(true);
  });

  it('drops what no longer fits as the sheet shrinks: BLK 501’s flats are named at 12 px/m, nothing on its typical floor below 6', () => {
    const g = sheet('BLK_501', 'TYP');
    expect(texts(roomLabels(g, planView(g, 12), fallbackMeasure))).toEqual(['101', '103', '105', '107', 'LIFT LOBBY / COMMON CORRIDOR']);
    for (const s of [5.9, 4.8, 2.4, 1.2, 0.6]) expect(roomLabels(g, planView(g, s), fallbackMeasure), `${s} px/m`).toEqual([]);
    // A wider measure (the real font, wider than the fallback) only ever drops labels; none overflows.
    const wide = (t: string, k: Label['kind']) => fallbackMeasure(t, k) * 1.5;
    const narrow = roomLabels(g, planView(g, 24), fallbackMeasure);
    const widened = roomLabels(g, planView(g, 24), wide);
    expect(widened.length).toBeLessThanOrEqual(narrow.length);
    for (const l of widened) expect(insideRect(l, screenRect(planView(g, 24), g.rooms[ownerOf(g, planView(g, 24), l)]), 2)).toBe(true);
  });

  // A room label stands inside the room itself, not only its box: an L-shaped or
  // wrap-around room's box takes in its neighbours (labels.ts insideRing).
  it('a room label stands inside its room’s outline, not only inside its box', () => {
    const leaks: string[] = [];
    for (const [id, key, s] of [['BLK_510', 'L1', 24], ['BLK_501', 'L1', 2.4], ['BLK_502', 'TYP', 24]] as const) {
      const g = sheet(id, key);
      const v = planView(g, s);
      for (const l of roomLabels(g, v, fallbackMeasure)) {
        const ring = g.rooms[ownerOf(g, v, l)];
        const px = pxPerMetre(v.pose, v.frame);
        const cx = v.frame.x + v.frame.w / 2;
        const cy = v.frame.y + v.frame.h / 2;
        let out = 0;
        for (let i = 0; i <= 8; i += 1) {
          for (let j = 0; j <= 4; j += 1) {
            const sx = l.x + 0.5 + ((l.w - 1) * i) / 8;
            const sy = l.y + 0.5 + ((l.h - 1) * j) / 4;
            if (!insideRing(ring, v.pose.cx + (sx - cx) / px, v.pose.cy - (sy - cy) / px)) out += 1;
          }
        }
        if (out) leaks.push(`${id} ${key} @ ${s}: "${l.text}" ${out}/45 points outside its room`);
      }
    }
    expect(leaks).toEqual([]);
  });
});

describe('geometry labels', () => {
  const geo = (g: SheetGeometry, s: number) => {
    const v = planView(g, s);
    return geometryLabels(g, v, fallbackMeasure, roomLabels(g, v, fallbackMeasure));
  };
  const cores = (labels: readonly Label[]) => texts(labels).filter((t) => t.startsWith('LIFT CORE'));
  const risers = (labels: readonly Label[]) => texts(labels).filter((t) => / · \d+ R × \d+$/.test(t));

  it('says a lift core is INFERRED, and ALIGNED BELOW on a block’s roof — only at 4 px/m and up', () => {
    const typ = sheet('BLK_501', 'TYP');
    expect(cores(geo(typ, 4))).toEqual(['LIFT CORE · 2 LIFTS (INFERRED)']);
    expect(cores(geo(typ, 3.99))).toEqual([]);
    expect(cores(geo(sheet('BLK_501', 'RF'), 4.8))).toEqual(['LIFT CORE · 2 LIFTS (INFERRED, ALIGNED BELOW)']);
    expect(cores(geo(sheet('BLK_509', 'RF'), 12))).toEqual(Array(3).fill('LIFT CORE · 2 LIFTS (INFERRED, ALIGNED BELOW)'));
    expect(cores(geo(sheet('NC_514', 'L1'), 12))).toEqual(['LIFT CORE · 1 LIFT (INFERRED)']);
    // Everywhere: never under 4 px/m, always INFERRED, ALIGNED BELOW only on a roof, and only for a core the sheet has.
    eachSheet((id, key, g) => {
      for (const s of LADDER) {
        const said = cores(geo(g, s));
        if (s < 4) expect(said, `${id} ${key} @ ${s}`).toEqual([]);
        expect(said.length).toBeLessThanOrEqual(g.cores.length);
        for (const t of said) {
          expect(t).toMatch(/^LIFT CORE · (1 LIFT|[2-9] LIFTS) \(INFERRED(, ALIGNED BELOW)?\)$/);
          if (t.includes('ALIGNED BELOW')) expect(key, `${id} ${key}`).toBe('RF');
        }
      }
    });
    for (const site of SITES.filter((x) => x.kind === 'block')) {
      const rf = sheet(site.id, 'RF');
      expect(rf.cores.length, site.id).toBeGreaterThan(0);
      expect(rf.cores.every((c) => c.aligned), `${site.id}'s roof cores line up with the typical floor's`).toBe(true);
    }
  });

  it('counts a stair’s risers (UP · 21 R × 171 on BLK 501 L1) only at 6 px/m and up, on a leader to the stair', () => {
    const g = sheet('BLK_501', 'L1');
    expect(stairLabels(g).map((s) => s.text)).toEqual(['UP · 21 R × 171', 'UP · 21 R × 171']);
    const v = planView(g, 6);
    const six = geometryLabels(g, v, fallbackMeasure, roomLabels(g, v, fallbackMeasure)).filter((l) => l.text.startsWith('UP'));
    expect(texts(six)).toEqual(['UP · 21 R × 171', 'UP · 21 R × 171']);
    stairLabels(g).forEach((s, i) => {
      const [x, y] = at(v, s.x, s.y);
      expect(six[i].leader![0]).toBeCloseTo(x, 9);
      expect(six[i].leader![1]).toBeCloseTo(y, 9);
    });
    expect(risers(geo(g, 5.99))).toEqual([]);
    expect(risers(geo(sheet('BLK_501', 'RF'), 12))).toEqual(['DN · 16 R × 175', 'DN · 16 R × 175']);
    eachSheet((id, key, s) => {
      for (const px of LADDER.filter((p) => p < 6)) expect(risers(geo(s, px)), `${id} ${key} @ ${px}`).toEqual([]);
    });
  });

  it('says NOT A ROOM IN THE DATA once on each car-park deck, for the 364 m² ramp void — inside it when it fits, beside it when not', () => {
    for (const key of ['L1', 'TYP']) {
      const g = sheet('MSCP_513', key);
      const ramp = g.voids.find((r) => (r.x1 - r.x0) * (r.y1 - r.y0) >= 40)!;
      expect((ramp.x1 - ramp.x0) * (ramp.y1 - ramp.y0)).toBeCloseTo(364.32, 1);
      expect(g.voids.filter((r) => (r.x1 - r.x0) * (r.y1 - r.y0) < 40)).toHaveLength(2);
      for (const s of LADDER) expect(texts(geo(g, s)).filter((t) => t === 'NOT A ROOM IN THE DATA'), `${key} @ ${s}`).toHaveLength(1);
      const big = planView(g, 12);
      const inside = geometryLabels(g, big, fallbackMeasure).find((l) => l.text === 'NOT A ROOM IN THE DATA')!;
      expect(inside.leader).toBeNull();
      expect(insideRect(inside, rectOf(big, ramp), 1)).toBe(true);
      const small = planView(g, 2.4);
      const beside = geometryLabels(g, small, fallbackMeasure).find((l) => l.text === 'NOT A ROOM IN THE DATA')!;
      const r = rectOf(small, ramp);
      expect(beside.leader).toEqual([(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]);
    }
    eachSheet((id, key, g) => {
      if (id === 'MSCP_513' && key !== 'RF') return;
      for (const s of [24, 2.4]) expect(texts(geo(g, s)), `${id} ${key}`).not.toContain('NOT A ROOM IN THE DATA');
    });
  });

  it('marks NC 514’s L2 as OUTLINE OF L1 BELOW at every scale, and no full sheet', () => {
    const l2 = sheet('NC_514', 'L2');
    expect(l2.partial).toBe(true);
    for (const s of LADDER) expect(texts(geo(l2, s)).filter((t) => t === 'OUTLINE OF L1 BELOW'), `@ ${s}`).toHaveLength(1);
    const v = planView(l2, 8);
    const label = geometryLabels(l2, v, fallbackMeasure).find((l) => l.text === 'OUTLINE OF L1 BELOW')!;
    const fp = screenRect(v, l2.fp);
    expect(label.leader).toEqual([fp.x0 + 2, fp.y0 + 2]); // the footprint's top-left corner
    eachSheet((id, key, g) => {
      if (g.partial) return;
      for (const s of [24, 2.4]) expect(texts(geo(g, s)), `${id} ${key}`).not.toContain('OUTLINE OF L1 BELOW');
    });
    expect([...sheets].flatMap(([id, m]) => [...m].filter(([, g]) => g.partial).map(([k]) => `${id} ${k}`))).toEqual(['NC_514 L2']);
  });

  it('keeps a 2 px gap from each other and from what was taken, inside the bounds it is given', () => {
    let placed = 0;
    eachSheet((id, key, g) => {
      for (const s of LADDER) {
        const v = planView(g, s);
        const bounds: Bounds = { x: v.frame.x + 4, y: v.frame.y + 4, w: v.frame.w - 8, h: v.frame.h - 8 };
        const taken = roomLabels(g, v, fallbackMeasure);
        const out = geometryLabels(g, v, fallbackMeasure, taken, bounds);
        const where = `${id} ${key} @ ${s}`;
        for (const l of out) {
          expect(l.kind).toBe('geometry');
          expect(l.h).toBe(LABEL_HEIGHT.geometry);
          expect(insideBounds(l, bounds), `${where}: "${l.text}"`).toBe(true);
          for (const t of taken) expect(tooClose(l, t), `${where}: "${l.text}" / "${t.text}"`).toBe(false);
        }
        out.forEach((a, i) => out.slice(i + 1).forEach((b) => expect(tooClose(a, b), `${where}: "${a.text}" / "${b.text}"`).toBe(false)));
        placed += out.length;
      }
    });
    expect(placed).toBeGreaterThan(400);
  });
});

describe('placeGeometryLabel', () => {
  const frame: Frame = { x: 0, y: 0, w: 400, h: 300 };
  const v = viewOf(planPose(0, 0, 15), frame);
  const TEXT = 'NOT A ROOM IN THE DATA'; // 22 characters: 140 px, 13 px high
  const W = fallbackMeasure(TEXT, 'geometry');

  it('measures with the fallback widths: 6.0 px a character (6.4 for a unit number) + 8, 13 / 15 / 13 px high', () => {
    expect(W).toBe(140);
    expect(fallbackMeasure('101', 'unit')).toBeCloseTo(27.2, 9);
    expect(fallbackMeasure('KITCHEN', 'room')).toBe(50);
    expect(LABEL_HEIGHT).toEqual({ room: 13, unit: 15, geometry: 13 });
  });

  it('sets the label inside its target, centred, when it fits (1 px clear)', () => {
    const l = placeGeometryLabel(TEXT, { x0: 50, y0: 50, x1: 250, y1: 150 }, v, fallbackMeasure, [])!;
    expect(l).toEqual({ text: TEXT, kind: 'geometry', x: 150 - W / 2, y: 100 - 6.5, w: W, h: 13, leader: null });
    // 1 px short of the clearance: beside it instead.
    const tight = placeGeometryLabel(TEXT, { x0: 50, y0: 50, x1: 50 + W + 1, y1: 150 }, v, fallbackMeasure, [])!;
    expect(tight.leader).not.toBeNull();
  });

  it('falls back to a leader beside the target: right, else left, else below, else above', () => {
    const near = { x0: 100, y0: 100, x1: 110, y1: 110 };
    const right = placeGeometryLabel(TEXT, near, v, fallbackMeasure, [])!;
    expect(right).toMatchObject({ x: 120, y: 98.5, leader: [105, 105] });
    const atRightEdge = { x0: 300, y0: 100, x1: 310, y1: 110 };
    expect(placeGeometryLabel(TEXT, atRightEdge, v, fallbackMeasure, [])).toMatchObject({ x: 300 - 10 - W, y: 98.5, leader: [305, 105] });
    const narrow: Bounds = { x: 0, y: 0, w: 160, h: 300 };
    const mid = { x0: 70, y0: 100, x1: 90, y1: 110 };
    expect(placeGeometryLabel(TEXT, mid, v, fallbackMeasure, [], narrow)).toMatchObject({ x: 80 - W / 2, y: 118, leader: [80, 105] });
    const short: Bounds = { x: 0, y: 0, w: 160, h: 125 };
    expect(placeGeometryLabel(TEXT, mid, v, fallbackMeasure, [], short)).toMatchObject({ x: 80 - W / 2, y: 100 - 8 - 13, leader: [80, 105] });
    // Something already there moves it on to the next place.
    const blocker: Label = { ...right, text: 'X' };
    const moved = placeGeometryLabel(TEXT, { x0: 200, y0: 100, x1: 210, y1: 110 }, v, fallbackMeasure, [{ ...blocker, x: 220 }])!;
    expect(moved.x).toBe(200 - 10 - W);
    expect(moved.leader).toEqual([205, 105]);
  });

  it('returns null when nothing fits in the bounds, or every place is taken', () => {
    expect(placeGeometryLabel(TEXT, { x0: 10, y0: 10, x1: 20, y1: 20 }, v, fallbackMeasure, [], { x: 0, y: 0, w: 120, h: 40 })).toBeNull();
    const all: Label = { text: 'X', kind: 'geometry', ...frame, leader: null };
    expect(placeGeometryLabel(TEXT, { x0: 100, y0: 100, x1: 110, y1: 110 }, v, fallbackMeasure, [all])).toBeNull();
    // The bounds default to the view's frame.
    const tinyFrame = viewOf(planPose(0, 0, 15), { x: 0, y: 0, w: 100, h: 60 });
    expect(placeGeometryLabel(TEXT, { x0: 40, y0: 20, x1: 60, y1: 40 }, tinyFrame, fallbackMeasure, [])).toBeNull();
  });
});

describe('labels are set whole, never animated', () => {
  const source = readFileSync(fileURLToPath(new URL('../lib/drawings/labels.ts', import.meta.url)), 'utf8');
  const file = ts.createSourceFile('labels.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  it('takes no progress: every exported function’s parameters are fixed, and the module reads no clock or frame', () => {
    const params: Record<string, string[]> = {};
    for (const st of file.statements) {
      if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      for (const d of st.declarationList.declarations) {
        if (d.initializer && ts.isArrowFunction(d.initializer)) params[d.name.getText(file)] = d.initializer.parameters.map((p) => p.name.getText(file));
      }
    }
    expect(params).toEqual({
      fallbackMeasure: ['text', 'kind'],
      roomLabels: ['g', 'v', 'measure', 'max', 'taken'],
      placeGeometryLabel: ['text', 'target', 'v', 'measure', 'taken', 'bounds'],
      geometryLabels: ['g', 'v', 'measure', 'taken', 'bounds'],
    });
    for (const list of Object.values(params)) for (const p of list) expect(p).not.toMatch(/^(t|ms|now|time|elapsed|progress|alpha)$/);
    expect(source).not.toMatch(/\b(Date|performance|requestAnimationFrame|setTimeout|setInterval|globalAlpha|opacity|Math\.random)\b/);
  });

  it('a label is its whole text and a box: no field for alpha or visible characters, its width its full text’s, the same call the same labels', () => {
    const iface = file.statements.find((st): st is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(st) && st.name.text === 'Label')!;
    expect(iface.members.map((m) => m.name!.getText(file))).toEqual(['text', 'kind', 'x', 'y', 'w', 'h', 'leader']);
    for (const [id, key, s] of [['BLK_509', 'TYP', 24], ['BLK_501', 'L1', 6], ['MSCP_513', 'TYP', 12], ['NC_514', 'L2', 8]] as const) {
      const g = sheet(id, key);
      const v = planView(g, s);
      const run = () => {
        const rooms = roomLabels(g, v, fallbackMeasure);
        return [...rooms, ...geometryLabels(g, v, fallbackMeasure, rooms)];
      };
      const once = run();
      expect(once.length, `${id} ${key}`).toBeGreaterThan(0);
      expect(run()).toEqual(once);
      for (const l of once) {
        expect(Object.keys(l)).toEqual(['text', 'kind', 'x', 'y', 'w', 'h', 'leader']);
        expect(l.w).toBe(fallbackMeasure(l.text, l.kind));
        expect(l.text).toBe(l.text.toUpperCase());
      }
    }
  });
});
