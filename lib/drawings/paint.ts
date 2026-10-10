import { insideRing, type Door, type Massing, type Pts, type Rect, type Seg, type SheetGeometry } from './decode';
import type { InkLayer, Inks } from './ink';
import { basis, depth, project, type Basis, type Frame, type Pose } from './project';

// The drawing set's painters (docs/portfolio/desk-drawing-set.md §2, §3). Each one
// draws a finished layer in one pass, with no state of its own; the film's effects
// reveal, fade, wipe or move what they draw. Coordinates are CSS px in the
// canvas's own frame (the context is already scaled for the device pixel ratio).
//
// A plan sheet is drawn as layers so the effects can bring them in apart:
//  - lines: the footprint, the rooms, the shared boundaries (dashed), the slab
//    edges, and the door openings cut through them (DRAW-IN reveals this layer
//    through the pen mask, so it is painted once, into a cache);
//  - poché: the wall fill, one even-odd fill (the thin gaps between spaces);
//  - jambs and lift landing ticks; treads; dimension chains.
// Hidden lines in 3D come from painting far to near over opaque paper faces.
// Nothing here draws a swing, a hinge, glazing or a hatch: the data holds none.

export type Ctx = CanvasRenderingContext2D;

export interface View { pose: Pose; b: Basis; frame: Frame }

export const viewOf = (pose: Pose, frame: Frame): View => ({ pose, b: basis(pose), frame });

const P = [0, 0];

const pt = (v: View, x: number, y: number, z: number): boolean => project(v.pose, v.b, v.frame, x, y, z, P);

const style = (ctx: Ctx, inks: Inks, layer: InkLayer, widthScale = 1) => {
  const ink = inks[layer];
  ctx.strokeStyle = ink.color;
  ctx.fillStyle = ink.color;
  ctx.lineWidth = Math.max(0.5, ink.width * widthScale);
  ctx.setLineDash(ink.dash ? [...ink.dash] : []);
};

/** Adds a ring at height z to the current path (closed). */
export const ringPath = (ctx: Ctx, v: View, ring: Pts, z = 0, dx = 0, dy = 0) => {
  let open = false;
  for (let i = 0; i < ring.length; i += 2) {
    if (!pt(v, ring[i] + dx, ring[i + 1] + dy, z)) { open = false; continue; }
    if (open) ctx.lineTo(P[0], P[1]); else { ctx.moveTo(P[0], P[1]); open = true; }
  }
  if (open) ctx.closePath();
};

const rectPath = (ctx: Ctx, v: View, r: Rect, z = 0) => {
  if (pt(v, r.x0, r.y0, z)) ctx.moveTo(P[0], P[1]);
  if (pt(v, r.x1, r.y0, z)) ctx.lineTo(P[0], P[1]);
  if (pt(v, r.x1, r.y1, z)) ctx.lineTo(P[0], P[1]);
  if (pt(v, r.x0, r.y1, z)) ctx.lineTo(P[0], P[1]);
  ctx.closePath();
};

const segPath = (ctx: Ctx, v: View, s: Seg, z = 0, trim = 0) => {
  const lo = s.lo + trim;
  const hi = s.hi - trim;
  if (hi <= lo) return;
  if (s.axis === 0) {
    if (pt(v, lo, s.k, z)) ctx.moveTo(P[0], P[1]);
    if (pt(v, hi, s.k, z)) ctx.lineTo(P[0], P[1]);
  } else {
    if (pt(v, s.k, lo, z)) ctx.moveTo(P[0], P[1]);
    if (pt(v, s.k, hi, z)) ctx.lineTo(P[0], P[1]);
  }
};

const lineTo3 = (ctx: Ctx, v: View, x: number, y: number, z: number, move: boolean) => {
  if (!pt(v, x, y, z)) return;
  if (move) ctx.moveTo(P[0], P[1]); else ctx.lineTo(P[0], P[1]);
};

/** The plan's px per metre at the frame's centre plane. */
const pxPerM = (v: View) => v.frame.h / (2 * v.pose.k);

/** A door's opening rectangle (between its faces, across its width). */
export const doorRect = (d: Door, pad = 0): Rect => (d.axis === 0
  ? { x0: d.x - d.w / 2, y0: d.y + d.o1 - pad, x1: d.x + d.w / 2, y1: d.y + d.o2 + pad }
  : { x0: d.x + d.o1 - pad, y0: d.y - d.w / 2, x1: d.x + d.o2 + pad, y1: d.y + d.w / 2 });

/** Doors whose opening lies in the wall fill (all but the car park roof's two island doors). */
export const doorsInPoche = (g: SheetGeometry): Door[] => g.doors.filter((d) => {
  const r = doorRect(d);
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  return !g.rooms.some((ring, i) => !g.skip.has(i) && insideRing(ring, cx, cy));
});

// ---- plan layers -------------------------------------------------------------------------

/**
 * The wall fill: one even-odd fill of the footprint, the rooms (less the islands
 * inside another room), the lift cores, the voids, the open-air strips and the
 * door openings — what is left is exactly the thin unroomed space. None on a
 * partial sheet.
 */
export const paintPoche = (ctx: Ctx, v: View, g: SheetGeometry, inks: Inks, z = 0, alpha = 1) => {
  if (g.partial || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ringPath(ctx, v, g.fp, z);
  g.rooms.forEach((ring, i) => { if (!g.skip.has(i)) ringPath(ctx, v, ring, z); });
  for (const c of g.cores) rectPath(ctx, v, c, z);
  for (const r of g.voids) rectPath(ctx, v, r, z);
  for (const r of g.bands) rectPath(ctx, v, r, z);
  for (const d of doorsInPoche(g)) rectPath(ctx, v, doorRect(d), z);
  style(ctx, inks, 'poche');
  ctx.fill('evenodd');
  ctx.restore();
};

/**
 * Cuts drawn line work away: on a cache (no ground) by erasing, on an opaque
 * plate by painting the plate's own face colour over it.
 */
const cut = (ctx: Ctx, ground: string | null, draw: () => void) => {
  ctx.save();
  if (ground) { ctx.strokeStyle = ground; ctx.fillStyle = ground; } else ctx.globalCompositeOperation = 'destination-out';
  ctx.setLineDash([]);
  draw();
  ctx.restore();
};

export interface LinesOptions {
  z?: number;
  /** The plate's face colour when drawing on an opaque plate (3D); null on a transparent cache. */
  ground?: string | null;
  /** Leave out the footprint (the site plan draws it). */
  footprint?: boolean;
}

/**
 * The plan's line work: the footprint (dashed on a partial sheet), the rooms, the
 * slab edges beside open-air strips, the shared boundaries (dashed), and the door
 * openings cut through the rooms' faces.
 */
export const paintPlanLines = (ctx: Ctx, v: View, g: SheetGeometry, inks: Inks, opts: LinesOptions = {}) => {
  const z = opts.z ?? 0;
  const ground = opts.ground ?? null;
  const s = pxPerM(v);
  ctx.save();
  // Rooms.
  ctx.beginPath();
  for (const ring of g.rooms) ringPath(ctx, v, ring, z);
  style(ctx, inks, 'room');
  ctx.stroke();
  // The footprint.
  if (opts.footprint !== false) {
    ctx.beginPath();
    ringPath(ctx, v, g.fp, z);
    style(ctx, inks, g.partial ? 'hidden' : 'hero');
    ctx.stroke();
  }
  // Slab edges: the footprint beside an open-air strip is a slab's edge, not a wall.
  if (g.slabs.length) {
    cut(ctx, ground, () => {
      ctx.beginPath();
      for (const seg of g.slabs) segPath(ctx, v, seg, z);
      ctx.lineWidth = inks.hero.width + 1.2;
      ctx.stroke();
    });
    ctx.beginPath();
    for (const seg of g.slabs) segPath(ctx, v, seg, z);
    style(ctx, inks, 'slab');
    ctx.stroke();
  }
  // Shared boundaries: two spaces meeting with no wall, dashed.
  if (g.shared.length) {
    const trim = 1.5 / s;
    cut(ctx, ground, () => {
      ctx.beginPath();
      for (const seg of g.shared) segPath(ctx, v, seg, z, trim);
      ctx.lineWidth = inks.room.width + 1.2;
      ctx.stroke();
    });
    ctx.beginPath();
    for (const seg of g.shared) segPath(ctx, v, seg, z, trim);
    style(ctx, inks, 'shared');
    ctx.stroke();
  }
  // Door openings: a gap between the two faces, across the door's width.
  if (g.doors.length) {
    const pad = (inks.room.width + 1) / s;
    cut(ctx, ground, () => {
      ctx.beginPath();
      for (const d of g.doors) rectPath(ctx, v, doorRect(d, pad), z);
      ctx.fill();
    });
  }
  ctx.restore();
};

/** Jambs at both ends of each opening, and each lift landing as a tick facing out of its car. */
export const paintJambs = (ctx: Ctx, v: View, g: SheetGeometry, inks: Inks, z = 0, alpha = 1) => {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  for (const d of g.doors) {
    for (const end of [-d.w / 2, d.w / 2]) {
      if (d.axis === 0) { lineTo3(ctx, v, d.x + end, d.y + d.o1, z, true); lineTo3(ctx, v, d.x + end, d.y + d.o2, z, false); }
      else { lineTo3(ctx, v, d.x + d.o1, d.y + end, z, true); lineTo3(ctx, v, d.x + d.o2, d.y + end, z, false); }
    }
  }
  // A landing tick: 0.6 m across the lobby side, at the stored point.
  for (const l of g.lifts) {
    const ax = l.fy !== 0 ? 0.3 : 0;
    const ay = l.fx !== 0 ? 0.3 : 0;
    lineTo3(ctx, v, l.x - ax, l.y - ay, z, true);
    lineTo3(ctx, v, l.x + ax, l.y + ay, z, false);
    lineTo3(ctx, v, l.x, l.y, z, true);
    lineTo3(ctx, v, l.x - 0.25 * l.fx, l.y - 0.25 * l.fy, z, false);
  }
  style(ctx, inks, 'jamb');
  ctx.stroke();
  ctx.restore();
};

/** Total risers on a sheet (TREAD TICK-IN reveals them one by one). */
export const riserCount = (g: SheetGeometry): number => g.flights.reduce((n, f) => n + f.risers, 0);

/**
 * Each flight: its risers at every going, the stringers either side, the walking
 * line with an arrow at the top. `shown` risers per flight are drawn (all by
 * default), in walking order.
 */
export const paintTreads = (ctx: Ctx, v: View, g: SheetGeometry, inks: Inks, z = 0, shown = Infinity) => {
  if (!g.flights.length || shown <= 0) return;
  ctx.save();
  ctx.beginPath();
  for (const f of g.flights) {
    const len = Math.hypot(f.ex - f.sx, f.ey - f.sy);
    if (len < 1e-6) continue;
    const ux = (f.ex - f.sx) / len;
    const uy = (f.ey - f.sy) / len;
    const nx = -uy * (f.width / 2);
    const ny = ux * (f.width / 2);
    const n = Math.min(f.risers, shown);
    for (let i = 0; i < n; i += 1) {
      const t = f.risers > 1 ? (i * len) / (f.risers - 1) : 0;
      const cx = f.sx + ux * t;
      const cy = f.sy + uy * t;
      lineTo3(ctx, v, cx + nx, cy + ny, z, true);
      lineTo3(ctx, v, cx - nx, cy - ny, z, false);
    }
    if (shown >= f.risers) {
      lineTo3(ctx, v, f.sx + nx, f.sy + ny, z, true);
      lineTo3(ctx, v, f.ex + nx, f.ey + ny, z, false);
      lineTo3(ctx, v, f.sx - nx, f.sy - ny, z, true);
      lineTo3(ctx, v, f.ex - nx, f.ey - ny, z, false);
    }
  }
  style(ctx, inks, 'tread');
  ctx.stroke();
  // The walking line and its arrow, once every riser is down.
  if (shown >= Math.max(...g.flights.map((f) => f.risers))) {
    ctx.beginPath();
    const byStair = new Map<number, typeof g.flights>();
    for (const f of g.flights) (byStair.get(f.stair) ?? byStair.set(f.stair, []).get(f.stair)!).push(f);
    for (const flights of byStair.values()) {
      flights.forEach((f, i) => {
        lineTo3(ctx, v, f.sx, f.sy, z, i === 0);
        lineTo3(ctx, v, f.ex, f.ey, z, false);
      });
      // UP ends at the top of the last flight; DN (a storey nothing climbs from) at the
      // foot of the first. The barbs trail back along the flight the tip is on.
      const up = flights[0].dir > 0;
      const at = up ? flights[flights.length - 1] : flights[0];
      const len = Math.hypot(at.ex - at.sx, at.ey - at.sy) || 1;
      const ux = (at.ex - at.sx) / len;
      const uy = (at.ey - at.sy) / len;
      const tip = up ? [at.ex, at.ey] : [at.sx, at.sy];
      const back = up ? -1 : 1;
      const a = 0.28;
      lineTo3(ctx, v, tip[0] + back * ux * a - uy * a * 0.6, tip[1] + back * uy * a + ux * a * 0.6, z, true);
      lineTo3(ctx, v, tip[0], tip[1], z, false);
      lineTo3(ctx, v, tip[0] + back * ux * a + uy * a * 0.6, tip[1] + back * uy * a - ux * a * 0.6, z, false);
    }
    style(ctx, inks, 'jamb');
    ctx.stroke();
  }
  ctx.restore();
};

/** Each stair's label: 'UP · 21 R × 171' (the sum of its flights' risers, the stored riser in mm), and where its walking line starts. */
export const stairLabels = (g: SheetGeometry): { text: string; x: number; y: number; stair: number }[] => {
  const byStair = new Map<number, typeof g.flights>();
  for (const f of g.flights) (byStair.get(f.stair) ?? byStair.set(f.stair, []).get(f.stair)!).push(f);
  return [...byStair.entries()].map(([stair, flights]) => {
    const risers = flights.reduce((n, f) => n + f.risers, 0);
    const xs = flights.flatMap((f) => [f.sx, f.ex]);
    const ys = flights.flatMap((f) => [f.sy, f.ey]);
    return {
      text: `${flights[0].dir > 0 ? 'UP' : 'DN'} · ${risers} R × ${flights[0].riserMm}`,
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
      stair,
    };
  });
};

// ---- dimension chains -----------------------------------------------------------------------

export interface Dimension {
  /** World endpoints of the measured extent (plan, z = 0) and the side the chain stands off to. */
  a: [number, number];
  b: [number, number];
  /** The offset direction (unit, world plan) and distance, m. */
  off: [number, number];
  dist: number;
  /** '28200' (mm). */
  text: string;
}

/** The plan's overall width and depth from its footprint, offset to the top and the right of the sheet as drawn. */
export const planDimensions = (g: SheetGeometry, v: View): Dimension[] => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (let i = 0; i < g.fp.length; i += 2) {
    x0 = Math.min(x0, g.fp[i]); x1 = Math.max(x1, g.fp[i]);
    y0 = Math.min(y0, g.fp[i + 1]); y1 = Math.max(y1, g.fp[i + 1]);
  }
  const s = pxPerM(v);
  const dist = 30 / s; // 30 px out
  const mm = (m: number) => String(Math.round(m * 1000));
  // Screen-up and screen-right in the plan's world axes.
  const up: [number, number] = [v.b.ux, v.b.uy];
  const right: [number, number] = [v.b.rx, v.b.ry];
  const along = (dir: [number, number]): Dimension => {
    // The extent perpendicular to `dir`'s axis, measured along the other world axis.
    const horizontal = Math.abs(dir[1]) > 0.5; // offset north/south → measure x
    if (horizontal) {
      const y = dir[1] > 0 ? y1 : y0;
      return { a: [x0, y], b: [x1, y], off: [0, Math.sign(dir[1])], dist, text: mm(x1 - x0) };
    }
    const x = dir[0] > 0 ? x1 : x0;
    return { a: [x, y0], b: [x, y1], off: [Math.sign(dir[0]), 0], dist, text: mm(y1 - y0) };
  };
  return [along(up), along(right)];
};

/** A dimension chain at `t` ∈ [0, 1] of its tick-in: extension lines, then the line from both ends, then the ticks. Returns where its value goes (px), once drawn. */
export const paintDimension = (ctx: Ctx, v: View, d: Dimension, inks: Inks, t: number): [number, number] | null => {
  if (t <= 0) return null;
  const ext = Math.min(1, t / 0.375);
  const line = Math.min(1, Math.max(0, (t - 0.375) / 0.625));
  const ox = d.off[0] * d.dist;
  const oy = d.off[1] * d.dist;
  ctx.save();
  style(ctx, inks, 'dim');
  ctx.beginPath();
  for (const p of [d.a, d.b]) {
    lineTo3(ctx, v, p[0] + ox * 0.25, p[1] + oy * 0.25, 0, true);
    lineTo3(ctx, v, p[0] + ox * (0.25 + 0.95 * ext), p[1] + oy * (0.25 + 0.95 * ext), 0, false);
  }
  if (line > 0) {
    const mx = (d.a[0] + d.b[0]) / 2;
    const my = (d.a[1] + d.b[1]) / 2;
    for (const p of [d.a, d.b]) {
      lineTo3(ctx, v, p[0] + ox, p[1] + oy, 0, true);
      lineTo3(ctx, v, p[0] + (mx - p[0]) * line + ox, p[1] + (my - p[1]) * line + oy, 0, false);
    }
  }
  ctx.stroke();
  let at: [number, number] | null = null;
  if (line >= 1) {
    // 45° ticks at both ends.
    ctx.beginPath();
    ctx.lineWidth = 1.1;
    for (const p of [d.a, d.b]) {
      if (!pt(v, p[0] + ox, p[1] + oy, 0)) continue;
      ctx.moveTo(P[0] - 3, P[1] + 3);
      ctx.lineTo(P[0] + 3, P[1] - 3);
    }
    ctx.stroke();
    if (pt(v, (d.a[0] + d.b[0]) / 2 + ox, (d.a[1] + d.b[1]) / 2 + oy, 0)) at = [P[0], P[1]];
  }
  ctx.restore();
  return at;
};

// ---- the site plan ---------------------------------------------------------------------------

export interface SiteScene {
  extent: Rect;
  kerbs: Pts[];
  buildings: Massing[];
}

export interface SiteOptions {
  hero: string | null;
  /** The hero's lid (a light fill over its footprint), 0–1. */
  lid?: number;
  /** Draw the extent frame (E1 draws it partially itself). */
  extent?: boolean;
  /** Context alpha (the dolly fades it). */
  context?: number;
}

/** The estate's extent frame (the neat line), kerbs, every building's footprint, the hero's in the hero ink with its lid. */
export const paintSite = (ctx: Ctx, v: View, scene: SiteScene, inks: Inks, opts: SiteOptions) => {
  ctx.save();
  const context = opts.context ?? 1;
  if (context > 0) {
    ctx.globalAlpha = context;
    if (opts.extent !== false) {
      ctx.beginPath();
      rectPath(ctx, v, scene.extent);
      style(ctx, inks, 'extent');
      ctx.stroke();
    }
    ctx.beginPath();
    for (const line of scene.kerbs) {
      for (let i = 0; i < line.length; i += 2) lineTo3(ctx, v, line[i], line[i + 1], 0, i === 0);
    }
    style(ctx, inks, 'kerb');
    ctx.stroke();
    ctx.beginPath();
    for (const b of scene.buildings) if (b.id !== opts.hero) ringPath(ctx, v, b.fp);
    style(ctx, inks, 'context');
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const hero = scene.buildings.find((b) => b.id === opts.hero);
  if (hero) {
    if (opts.lid && opts.lid > 0) {
      ctx.globalAlpha = opts.lid;
      ctx.beginPath();
      ringPath(ctx, v, hero.fp);
      style(ctx, inks, 'lid');
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ringPath(ctx, v, hero.fp);
    style(ctx, inks, 'hero');
    ctx.stroke();
  }
  ctx.restore();
};

/** E1 RULE-IN: the extent frame by arc length, both ways from its corner nearest `from` (px). */
export const paintRuleIn = (ctx: Ctx, v: View, extent: Rect, inks: Inks, t: number, from: [number, number]) => {
  if (t <= 0) return;
  const corners: [number, number][] = [[extent.x0, extent.y0], [extent.x1, extent.y0], [extent.x1, extent.y1], [extent.x0, extent.y1]];
  const px = corners.map(([x, y]) => (pt(v, x, y, 0) ? [P[0], P[1]] : [0, 0]));
  let start = 0;
  px.forEach((p, i) => { if (Math.hypot(p[0] - from[0], p[1] - from[1]) < Math.hypot(px[start][0] - from[0], px[start][1] - from[1])) start = i; });
  const half = Math.min(1, t) * 2; // each way covers two sides
  ctx.save();
  style(ctx, inks, 'extent');
  ctx.beginPath();
  for (const dirn of [1, -1]) {
    let left = half;
    let at = start;
    ctx.moveTo(px[at][0], px[at][1]);
    while (left > 0) {
      const next = (at + dirn + 4) % 4;
      const f = Math.min(1, left);
      ctx.lineTo(px[at][0] + (px[next][0] - px[at][0]) * f, px[at][1] + (px[next][1] - px[at][1]) * f);
      left -= f;
      at = next;
    }
  }
  ctx.stroke();
  ctx.restore();
};

// ---- axonometric plates ----------------------------------------------------------------------

export interface PlateOptions {
  z: number;
  /** The plate's rooms, wall fill and openings (false: its outline only, a stacked storey). */
  detail: boolean;
  /** Plate alpha (TILT fades plates in). */
  alpha?: number;
  /** Translate the plate in the plan (block-local → estate), m. */
  dx?: number;
  dy?: number;
}

/** One storey as an opaque plate at its height: the slab (paper), its outline, and (detail) its plan. */
export const paintPlate = (ctx: Ctx, v: View, g: SheetGeometry, inks: Inks, opts: PlateOptions) => {
  const alpha = opts.alpha ?? 1;
  if (alpha <= 0) return;
  const dx = opts.dx ?? 0;
  const dy = opts.dy ?? 0;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ringPath(ctx, v, g.fp, opts.z, dx, dy);
  style(ctx, inks, 'face');
  ctx.fill();
  if (opts.detail) {
    const shifted = dx || dy ? shiftView(v, dx, dy) : v;
    paintPoche(ctx, shifted, g, inks, opts.z);
    paintPlanLines(ctx, shifted, g, inks, { z: opts.z, ground: inks.face.color, footprint: false });
  }
  ctx.beginPath();
  ringPath(ctx, v, g.fp, opts.z, dx, dy);
  style(ctx, inks, g.partial ? 'hidden' : 'plate');
  ctx.stroke();
  ctx.restore();
};

/** A view whose pose sees the world moved by (dx, dy): draws block-local geometry at its estate position. */
export const shiftView = (v: View, dx: number, dy: number): View => ({ ...v, pose: { ...v.pose, cx: v.pose.cx - dx, cy: v.pose.cy - dy } });

// ---- massing ----------------------------------------------------------------------------------

export interface MassingOptions {
  /** The hero building: drawn in the massing ink with its storey lines; the rest in the context ink. */
  hero: string | null;
  /** Context alpha (the dolly-zoom brings the estate in). */
  context?: number;
  /** Heights scaled by this (LIFT TO PLAN flattens the estate into its site plan). */
  zScale?: number;
  /** Draw the hero only up to this level, its upper part as hidden dashes (CUT IN PLACE). */
  cut?: number | null;
  /** The hero's heights up to this share of its roof level (STACK and SILHOUETTE raise it). */
  heroRise?: number;
  /** Storey lines on the hero's front faces. */
  storeys?: boolean;
  /** Face fill alpha. */
  faces?: number;
}

/** Where the view looks from: the eye for a perspective pose, a point far back along the view for an orthographic one. */
const eyeOf = (v: View): [number, number, number] => {
  const d = v.pose.p > 0 ? v.pose.k / v.pose.p : 1e6;
  return [v.pose.cx - v.b.fx * d, v.pose.cy - v.b.fy * d, v.pose.cz - v.b.fz * d];
};

/**
 * Buildings as massing, far to near, each face that faces the eye filled with the
 * paper colour and outlined, so nearer buildings hide what is behind them. A
 * building stops at its roof level; the roof's enclosed rooms (stair cores) stand
 * on it by their clear height. Nothing higher: the pack's roofTop is a tag.
 */
export const paintMassing = (ctx: Ctx, v: View, buildings: readonly Massing[], inks: Inks, opts: MassingOptions) => {
  const zs = opts.zScale ?? 1;
  const context = opts.context ?? 1;
  const faces = opts.faces ?? 1;
  const eye = eyeOf(v);
  const order = buildings
    .map((b) => {
      let cx = 0; let cy = 0;
      for (let i = 0; i < b.fp.length; i += 2) { cx += b.fp[i]; cy += b.fp[i + 1]; }
      const n = b.fp.length / 2;
      return { b, d: depth(v.b, v.pose, cx / n, cy / n, 0) };
    })
    .sort((a, b) => b.d - a.d);
  ctx.save();
  for (const { b } of order) {
    const hero = b.id === opts.hero;
    if (!hero && context <= 0) continue;
    const alpha = hero ? 1 : context;
    const roof = b.ffl[b.ffl.length - 1] * (hero ? (opts.heroRise ?? 1) : 1) * zs;
    const cut = hero && opts.cut != null ? Math.min(roof, opts.cut * zs) : null;
    const top = cut ?? roof;
    const levels = hero && opts.storeys ? b.ffl.slice(1, -1).map((f) => f * zs).filter((f) => f < top) : [];
    prism(ctx, v, b.fp, 0, top, eye, inks, hero ? 'massing' : 'context', alpha, faces, levels);
    if (cut !== null && cut < roof) {
      // Above the cut: the rest of the hero as hidden lines.
      ctx.save();
      ctx.globalAlpha = alpha;
      style(ctx, inks, 'hidden');
      ctx.beginPath();
      ringPath(ctx, v, b.fp, roof);
      for (let i = 0; i < b.fp.length; i += 2) {
        lineTo3(ctx, v, b.fp[i], b.fp[i + 1], cut, true);
        lineTo3(ctx, v, b.fp[i], b.fp[i + 1], roof, false);
      }
      ctx.stroke();
      ctx.restore();
    } else {
      for (const c of b.caps) prism(ctx, v, c.ring, roof, roof + c.h * zs, eye, inks, hero ? 'massing' : 'context', alpha, faces, []);
    }
  }
  ctx.restore();
};

/** A vertical prism: faces toward the eye far to near (fill + outline), then its top. */
const prism = (
  ctx: Ctx, v: View, ring: Pts, z0: number, z1: number, eye: readonly number[], inks: Inks, layer: InkLayer,
  alpha: number, faces: number, levels: readonly number[],
) => {
  if (z1 <= z0 + 1e-6) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ringPath(ctx, v, ring, z0);
    style(ctx, inks, layer);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const n = ring.length / 2;
  const front: { i: number; d: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const ax = ring[2 * i]; const ay = ring[2 * i + 1];
    const bx = ring[(2 * i + 2) % ring.length]; const by = ring[(2 * i + 3) % ring.length];
    // Outward normal of a counter-clockwise ring: the edge turned right.
    const nx = by - ay; const ny = -(bx - ax);
    const mx = (ax + bx) / 2; const my = (ay + by) / 2;
    if (nx * (eye[0] - mx) + ny * (eye[1] - my) > 1e-9) front.push({ i, d: depth(v.b, v.pose, mx, my, (z0 + z1) / 2) });
  }
  front.sort((a, b) => b.d - a.d);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const { i } of front) {
    const ax = ring[2 * i]; const ay = ring[2 * i + 1];
    const bx = ring[(2 * i + 2) % ring.length]; const by = ring[(2 * i + 3) % ring.length];
    ctx.beginPath();
    lineTo3(ctx, v, ax, ay, z0, true);
    lineTo3(ctx, v, bx, by, z0, false);
    lineTo3(ctx, v, bx, by, z1, false);
    lineTo3(ctx, v, ax, ay, z1, false);
    ctx.closePath();
    if (faces > 0) {
      ctx.save();
      ctx.globalAlpha = alpha * faces;
      style(ctx, inks, 'face');
      ctx.fill();
      ctx.restore();
    }
    style(ctx, inks, layer);
    ctx.stroke();
    if (levels.length) {
      ctx.beginPath();
      for (const z of levels) { lineTo3(ctx, v, ax, ay, z, true); lineTo3(ctx, v, bx, by, z, false); }
      ctx.save();
      ctx.lineWidth = Math.max(0.5, inks[layer].width * 0.6);
      ctx.stroke();
      ctx.restore();
    }
  }
  // The top, over the faces it closes.
  ctx.beginPath();
  ringPath(ctx, v, ring, z1);
  if (faces > 0) {
    ctx.save();
    ctx.globalAlpha = alpha * faces;
    style(ctx, inks, 'face');
    ctx.fill();
    ctx.restore();
  }
  style(ctx, inks, layer);
  ctx.stroke();
  ctx.restore();
};

// ---- vertical links (EXPLODED) ------------------------------------------------------------------

export interface LinkSet {
  /** Stair links through each stair room's centre: [x, y]. */
  stairs: [number, number][];
  /** Lift links through each landing: [x, y]. */
  lifts: [number, number][];
}

/** Stair rooms' centres and lift landings, from the sheets that have them (block-local). */
export const linksOf = (sheets: readonly SheetGeometry[]): LinkSet => {
  const stairs = new Map<string, [number, number]>();
  const lifts = new Map<string, [number, number]>();
  for (const g of sheets) {
    g.codes.forEach((code, i) => {
      if (!/STAIR/.test(code) || stairs.has(code)) return;
      const r = g.rooms[i];
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (let k = 0; k < r.length; k += 2) { x0 = Math.min(x0, r[k]); x1 = Math.max(x1, r[k]); y0 = Math.min(y0, r[k + 1]); y1 = Math.max(y1, r[k + 1]); }
      stairs.set(code, [(x0 + x1) / 2, (y0 + y1) / 2]);
    });
    for (const l of g.lifts) if (!lifts.has(String(l.lift))) lifts.set(String(l.lift), [l.x, l.y]);
  }
  return { stairs: [...stairs.values()], lifts: [...lifts.values()] };
};

/** Vertical links from z0 rising to z0 + (z1 − z0)·t, block-local points drawn at (dx, dy). */
export const paintLinks = (ctx: Ctx, v: View, links: LinkSet, inks: Inks, z0: number, z1: number, t: number, alpha = 1, dx = 0, dy = 0) => {
  if (t <= 0 || alpha <= 0) return;
  const top = z0 + (z1 - z0) * Math.min(1, t);
  ctx.save();
  ctx.globalAlpha *= alpha;
  for (const [layer, points] of [['stairLink', links.stairs], ['liftLink', links.lifts]] as const) {
    ctx.beginPath();
    for (const [x, y] of points) { lineTo3(ctx, v, x + dx, y + dy, z0, true); lineTo3(ctx, v, x + dx, y + dy, top, false); }
    style(ctx, inks, layer);
    ctx.stroke();
  }
  ctx.restore();
};

// ---- level ruler and crop marks -------------------------------------------------------------------

/** Where a level ruler's ticks fall, px: one per level up to `upTo`. */
export const rulerTicks = (v: View, x: number, y: number, levels: readonly number[], upTo = Infinity): [number, number][] => {
  const out: [number, number][] = [];
  for (const z of levels) {
    if (z > upTo + 1e-9) break;
    if (pt(v, x, y, z)) out.push([P[0], P[1]]);
  }
  return out;
};

/** A level ruler at (x, y): a vertical line, a 6 px tick at every level up to `upTo`. */
export const paintRuler = (ctx: Ctx, v: View, x: number, y: number, levels: readonly number[], inks: Inks, upTo = Infinity) => {
  const ticks = rulerTicks(v, x, y, levels, upTo);
  if (ticks.length < 2) return;
  ctx.save();
  style(ctx, inks, 'ruler');
  ctx.beginPath();
  ctx.moveTo(ticks[0][0], ticks[0][1]);
  ctx.lineTo(ticks[ticks.length - 1][0], ticks[ticks.length - 1][1]);
  for (const [tx, ty] of ticks) { ctx.moveTo(tx - 6, ty); ctx.lineTo(tx, ty); }
  ctx.stroke();
  ctx.restore();
};

/** Crop marks at a frame's corners (14 px arms, just outside it). */
export const paintCropMarks = (ctx: Ctx, f: Frame, inks: Inks) => {
  ctx.save();
  style(ctx, inks, 'crop');
  ctx.beginPath();
  const arm = 14;
  const gap = 4;
  for (const [x, y, sx, sy] of [[f.x, f.y, -1, -1], [f.x + f.w, f.y, 1, -1], [f.x + f.w, f.y + f.h, 1, 1], [f.x, f.y + f.h, -1, 1]]) {
    ctx.moveTo(x + sx * gap, y); ctx.lineTo(x + sx * (gap + arm), y);
    ctx.moveTo(x, y + sy * gap); ctx.lineTo(x, y + sy * (gap + arm));
  }
  ctx.stroke();
  ctx.restore();
};
