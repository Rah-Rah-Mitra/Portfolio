import type { Vec2 } from './frames';
import type { NavRoom } from './nav';
import { flatRing, pointInRing } from './storeys';
import { nearestWalkable, type WalkFile, type WalkPose } from './walk';

// Plan (plan §8.1, §7.3): one storey of one building, seen from 55° above the
// horizon and cut at its floor + 1.2 m. Pure, so node tests and the engine run
// the same rules: the cut's steps, the storey Plan opens on, cycling through a
// storey's rooms, where "walk in" aims inside a room, the click's ray meeting
// the floor, and the words a pick is shown and said with.

/** The cut above the storey's floor, m: §7.3's floor + 1.2 m. */
export const PLAN_CUT_DEFAULT = 1.2;
/** `[` and `]` move it this much, m… */
export const PLAN_CUT_STEP = 0.3;
/** …between these: low enough to read the furniture, high enough to see the doors' heads cut. */
export const PLAN_CUT_MIN = 0.3;
export const PLAN_CUT_MAX = 2.4;
/** The view's elevation above the horizon (§8.1's 55°), as camera-controls' polar angle from straight down. */
export const PLAN_ELEVATION_DEG = 55;
export const PLAN_POLAR = ((90 - PLAN_ELEVATION_DEG) * Math.PI) / 180;
/** Walking in looks for a walkable cell this far from the room's centre, m. */
export const WALK_IN_REACH = 4;

/** The cut one step lower (-1) or higher (1), held inside [PLAN_CUT_MIN, PLAN_CUT_MAX], on a 0.1 m grid. */
export const stepCut = (cut: number, step: -1 | 1): number => {
  const next = Math.round((cut + step * PLAN_CUT_STEP) * 10) / 10;
  return Math.min(PLAN_CUT_MAX, Math.max(PLAN_CUT_MIN, next));
};

/**
 * The storey Plan opens on when none is named: the first typical storey (a
 * block's L2, the first flats above the void deck; the car park's L2 deck),
 * else L1 (the hawker centre, all of whose storeys are special). An index.
 */
export const defaultPlanStorey = (typical: readonly boolean[]): number => {
  const first = typical.indexOf(true);
  return first >= 0 ? first : 0;
};

/**
 * The next room after `current` going `step` (-1 up the list, 1 down it),
 * wrapping at both ends; from no pick (-1) ↓ starts at the first and ↑ at the
 * last. -1 when there are no rooms.
 */
export const cycleRoom = (current: number, step: -1 | 1, count: number): number => {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return step > 0 ? 0 : count - 1;
  return (current + step + count) % count;
};

/** Area centroid of an open ring; the vertex mean for a degenerate one. */
export const ringCentroid = (ring: readonly Vec2[], out: Vec2 = [0, 0]): Vec2 => {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  if (Math.abs(a) > 1e-9) {
    out[0] = cx / (3 * a);
    out[1] = cy / (3 * a);
    return out;
  }
  let sx = 0;
  let sy = 0;
  for (const [x, y] of ring) { sx += x; sy += y; }
  out[0] = ring.length ? sx / ring.length : 0;
  out[1] = ring.length ? sy / ring.length : 0;
  return out;
};

const ANCHOR_GRID = 12;

/**
 * Where walking into a room aims, block-local: its area centroid when that lies
 * inside the outline, else the box centre when that does, else the inside
 * point of a 12 × 12 grid over the box nearest the centroid (an L-shaped room's
 * centroid can fall in the notch). A vertex as the last resort.
 */
export const roomAnchor = (room: Pick<NavRoom, 'poly' | 'box'>, out: Vec2 = [0, 0]): Vec2 => {
  const ring = flatRing(room.poly);
  const c = ringCentroid(room.poly, out);
  if (pointInRing(c[0], c[1], ring)) return c;
  const [x0, y0, x1, y1] = room.box;
  const bx = (x0 + x1) / 2;
  const by = (y0 + y1) / 2;
  const tx = c[0];
  const ty = c[1];
  if (pointInRing(bx, by, ring)) { out[0] = bx; out[1] = by; return out; }
  let best = Infinity;
  let px = room.poly[0][0];
  let py = room.poly[0][1];
  for (let iy = 0; iy < ANCHOR_GRID; iy += 1) {
    const y = y0 + ((iy + 0.5) / ANCHOR_GRID) * (y1 - y0);
    for (let ix = 0; ix < ANCHOR_GRID; ix += 1) {
      const x = x0 + ((ix + 0.5) / ANCHOR_GRID) * (x1 - x0);
      if (!pointInRing(x, y, ring)) continue;
      const d = (x - tx) * (x - tx) + (y - ty) * (y - ty);
      if (d < best) { best = d; px = x; py = y; }
    }
  }
  out[0] = px;
  out[1] = py;
  return out;
};

const SCRATCH: WalkPose = { x: 0, y: 0, z: 0, layer: -1 };

/**
 * Where walking into a room puts the walker, block-local, into `out`: the
 * walkable cell nearest roomAnchor (within WALK_IN_REACH) when its floor is on
 * storey `storey` itself; else, of a 12 × 12 grid of points inside the room, the
 * one nearest the anchor whose own cell is walkable on that storey (a stair
 * room's middle is often a tread of the flight coming up, the storey below's);
 * else the first answer, whatever its storey. False when the room has no floor
 * within reach at all (a closed substation).
 */
export const walkInPoint = (
  walk: WalkFile, room: Pick<NavRoom, 'poly' | 'box' | 'z'>, ffl: number, storey: number, out: WalkPose,
): boolean => {
  const anchor = roomAnchor(room, [0, 0]);
  const z = ffl + room.z;
  const found = nearestWalkable(walk, anchor[0], anchor[1], z, WALK_IN_REACH, out);
  if (found && out.layer === storey) return true;
  const ring = flatRing(room.poly);
  const [x0, y0, x1, y1] = room.box;
  const reach = walk.header.cell * 1.5;
  let best = Infinity;
  for (let iy = 0; iy < ANCHOR_GRID; iy += 1) {
    const y = y0 + ((iy + 0.5) / ANCHOR_GRID) * (y1 - y0);
    for (let ix = 0; ix < ANCHOR_GRID; ix += 1) {
      const x = x0 + ((ix + 0.5) / ANCHOR_GRID) * (x1 - x0);
      if (!pointInRing(x, y, ring)) continue;
      const d = (x - anchor[0]) * (x - anchor[0]) + (y - anchor[1]) * (y - anchor[1]);
      if (d >= best || !nearestWalkable(walk, x, y, z, reach, SCRATCH) || SCRATCH.layer !== storey) continue;
      best = d;
      out.x = SCRATCH.x; out.y = SCRATCH.y; out.z = SCRATCH.z; out.layer = SCRATCH.layer;
    }
  }
  // No cell on the storey itself: the first answer stands (`out` was only written on a find).
  return best < Infinity || found;
};

/**
 * Where a ray (estate frame, any direction length) meets the horizontal plane
 * z = `floorZ`, into `out` [x, y]; null when it runs level or away from it.
 */
export const rayFloor = (origin: ArrayLike<number>, direction: ArrayLike<number>, floorZ: number, out: Vec2 = [0, 0]): Vec2 | null => {
  const dz = direction[2];
  if (!(Math.abs(dz) > 1e-9)) return null;
  const t = (floorZ - origin[2]) / dz;
  if (!(t > 0)) return null;
  out[0] = origin[0] + t * direction[0];
  out[1] = origin[1] + t * direction[1];
  return out;
};

/** A room as the HUD and the list show it: '#05-104 · Living / Dining', or 'Common corridor'. */
export const roomText = (room: { label: string; flat: string | null }): string =>
  room.flat ? `${room.flat} · ${room.label}` : room.label;

/** A pick as it is said: 'Unit 05-104, Living / Dining, 3 of 105'. */
export const roomSpoken = (room: { label: string; flat: string | null }, index: number, count: number): string =>
  `${room.flat ? `Unit ${room.flat.replace(/^#/, '')}, ` : ''}${room.label}, ${index + 1} of ${count}`;

/** The cut as the HUD prints it, '+1.20 M', and says it, '1.2 metres above the floor'. */
export const cutText = (cut: number): string => `+${cut.toFixed(2)} M`;
export const cutSpoken = (cut: number): string => `Cut ${Number(cut.toFixed(1))} metres above the floor`;
