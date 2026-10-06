import { localToEstate, type Vec3 } from '../../../../../lib/estate/frames';
import { pointInPolygon, polygonDistance } from '../../../../../lib/estate/storeys';

// Which building a ray or a point belongs to (plan §8.1, §8.7): click and tap
// select, double-click and double-tap fly to, and the location chip names the
// building the camera frames. Pure: estate-frame tuples in, an index into
// pack.sites (= ESTATE_SITE_IDS) out. No three, no GPU read-back.
//
// Each building is its footprint ring (pack site `footprint`, block-local plan)
// placed in the estate and extruded from z 0 to the roof (`roofTop`). That is
// exact for every block's plan outline, where a bounding box would claim the
// open courtyard of an L-shaped block or the void beside a point block's wing.
// The pack bounds are kept as a cheap first test.
//
// The click rules live here too: a press is a click when it travels at most
// CLICK_SLOP_PX and lasts at most CLICK_MAX_MS; a second click within
// DOUBLE_MS and DOUBLE_SLOP_PX of the first is a double. A press that becomes
// a drag, a second finger, or a cancel is no click at all.

export interface Prism {
  /** Index in pack.sites. */
  index: number;
  /** The footprint in the estate frame: x0, y0, x1, y1, … */
  ring: Float64Array;
  /** The same ring as pairs, for storeys.ts' polygon tests. */
  pairs: ReadonlyArray<readonly [number, number]>;
  zMin: number;
  zMax: number;
  /** Estate-frame box: the pack bounds widened to hold the ring and the roof. */
  min: Vec3;
  max: Vec3;
}

/** What a pack site carries that picking needs. A PackBuilding fits. */
export interface PrismSource {
  at: ArrayLike<number>;
  footprint: ReadonlyArray<ArrayLike<number>>;
  roofTop: number;
  bounds: readonly [ArrayLike<number>, ArrayLike<number>];
}

export const buildPrisms = (sites: readonly PrismSource[]): Prism[] => sites.map((site, index) => {
  const n = site.footprint.length;
  const ring = new Float64Array(2 * n);
  const pairs: Array<readonly [number, number]> = [];
  const p: Vec3 = [0, 0, 0];
  const placement = { at: site.at };
  const min: Vec3 = [site.bounds[0][0], site.bounds[0][1], Math.min(0, site.bounds[0][2])];
  const max: Vec3 = [site.bounds[1][0], site.bounds[1][1], Math.max(site.roofTop, site.bounds[1][2])];
  for (let i = 0; i < n; i += 1) {
    localToEstate([site.footprint[i][0], site.footprint[i][1], 0], placement, p);
    ring[2 * i] = p[0];
    ring[2 * i + 1] = p[1];
    pairs.push([p[0], p[1]]);
    if (p[0] < min[0]) min[0] = p[0];
    if (p[1] < min[1]) min[1] = p[1];
    if (p[0] > max[0]) max[0] = p[0];
    if (p[1] > max[1]) max[1] = p[1];
  }
  return { index, ring, pairs, zMin: 0, zMax: Math.max(site.roofTop, 0.5), min, max };
});

/** Ray parameter where the ray (origin + t·dir) enters the box, or Infinity. */
export const rayBox = (o: ArrayLike<number>, d: ArrayLike<number>, min: ArrayLike<number>, max: ArrayLike<number>): number => {
  let t0 = 0;
  let t1 = Infinity;
  for (let k = 0; k < 3; k += 1) {
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < min[k] || o[k] > max[k]) return Infinity;
      continue;
    }
    let a = (min[k] - o[k]) / d[k];
    let b = (max[k] - o[k]) / d[k];
    if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return Infinity;
  }
  return t0;
};

/**
 * Ray parameter of the first hit on the prism (its walls, roof or floor), 0
 * when the origin is inside it, Infinity for a miss. `dir` need not be unit
 * length; t is in its units.
 */
export const rayPrism = (o: ArrayLike<number>, d: ArrayLike<number>, prism: Prism): number => {
  if (rayBox(o, d, prism.min, prism.max) === Infinity) return Infinity;
  const { ring, pairs, zMin, zMax } = prism;
  if (o[2] >= zMin && o[2] <= zMax && pointInPolygon(o[0], o[1], pairs)) return 0;
  let best = Infinity;
  // Roof and floor.
  if (Math.abs(d[2]) > 1e-12) {
    const roof = (zMax - o[2]) / d[2];
    if (roof > 0 && pointInPolygon(o[0] + roof * d[0], o[1] + roof * d[1], pairs)) best = roof;
    const floor = (zMin - o[2]) / d[2];
    if (floor > 0 && floor < best && pointInPolygon(o[0] + floor * d[0], o[1] + floor * d[1], pairs)) best = floor;
  }
  // Walls: each edge's vertical face.
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const ax = ring[2 * j], ay = ring[2 * j + 1];
    const ex = ring[2 * i] - ax, ey = ring[2 * i + 1] - ay;
    const denom = d[0] * ey - d[1] * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const wx = ax - o[0], wy = ay - o[1];
    const t = (wx * ey - wy * ex) / denom;
    const s = (wx * d[1] - wy * d[0]) / denom;
    if (t <= 0 || t >= best || s < 0 || s > 1) continue;
    const z = o[2] + t * d[2];
    if (z >= zMin && z <= zMax) best = t;
  }
  return best;
};

export interface PrismHit { index: number; t: number }

/** The nearest building the ray hits, or null. */
export const pickPrism = (o: ArrayLike<number>, d: ArrayLike<number>, prisms: readonly Prism[], out: PrismHit = { index: -1, t: Infinity }): PrismHit | null => {
  out.index = -1;
  out.t = Infinity;
  for (const prism of prisms) {
    const t = rayPrism(o, d, prism);
    if (t < out.t) {
      out.t = t;
      out.index = prism.index;
    }
  }
  return out.index >= 0 ? out : null;
};

/** The building whose plan outline is nearest (x, y), within `margin` m (0 inside it), or −1. */
export const siteNear = (x: number, y: number, prisms: readonly Prism[], margin: number): number => {
  let best = -1;
  let bestDistance = margin;
  for (const prism of prisms) {
    if (x < prism.min[0] - margin || x > prism.max[0] + margin || y < prism.min[1] - margin || y > prism.max[1] + margin) continue;
    const distance = polygonDistance(x, y, prism.pairs);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = prism.index;
      if (distance === 0) break;
    }
  }
  return best;
};

/** The building a point (estate frame) is in or beside: within `margin` m of its outline and no higher than `margin` above its roof; else −1. */
export const siteAround = (x: number, y: number, z: number, prisms: readonly Prism[], margin: number): number => {
  let best = -1;
  let bestDistance = margin;
  for (const prism of prisms) {
    if (z > prism.zMax + margin || z < prism.zMin - margin) continue;
    if (x < prism.min[0] - margin || x > prism.max[0] + margin || y < prism.min[1] - margin || y > prism.max[1] + margin) continue;
    const distance = polygonDistance(x, y, prism.pairs);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = prism.index;
    }
  }
  return best;
};

// ---- clicks and taps -------------------------------------------------------------------

export const CLICK_SLOP_PX = 5;
export const CLICK_MAX_MS = 500;
export const DOUBLE_MS = 400;
export const DOUBLE_SLOP_PX = 10;
/**
 * A finger (or pen) travels farther in a tap than a mouse in a click: platform
 * touch slop is about 8–16 px, so 5 px turned many taps into drags (no select,
 * no double-tap fly-to). Touch and pen get these instead.
 */
export const TOUCH_CLICK_SLOP_PX = 12;
export const TOUCH_DOUBLE_SLOP_PX = 30;

export type ClickKind = 'click' | 'double';

interface Press { id: number; x: number; y: number; t: number; travel: number; slop: number; doubleSlop: number }

/**
 * Turns pointer presses into clicks and doubles. Primary button (or a touch or
 * pen contact) only; a second pointer down while one is pressed cancels both,
 * so a pinch never selects. Times on one clock (event.timeStamp).
 */
export class ClickTracker {
  private press: Press | null = null;
  private poisoned = false;
  private lastClick: { x: number; y: number; t: number } | null = null;

  /** `pointerType` is PointerEvent.pointerType: anything but 'mouse' gets the touch slop. */
  down(id: number, x: number, y: number, t: number, primary: boolean, pointerType = 'mouse'): void {
    if (this.press !== null || !primary) {
      // A second pointer (pinch, two-finger pan) or another button: no click from either.
      this.poisoned = this.press !== null;
      this.press = null;
      this.lastClick = null;
      return;
    }
    this.poisoned = false;
    const coarse = pointerType !== 'mouse';
    this.press = {
      id, x, y, t, travel: 0,
      slop: coarse ? TOUCH_CLICK_SLOP_PX : CLICK_SLOP_PX,
      doubleSlop: coarse ? TOUCH_DOUBLE_SLOP_PX : DOUBLE_SLOP_PX,
    };
  }

  move(id: number, x: number, y: number): void {
    const p = this.press;
    if (!p || p.id !== id) return;
    const travel = Math.hypot(x - p.x, y - p.y);
    if (travel > p.travel) p.travel = travel;
  }

  /** The press ended: 'click', 'double' or null (a drag, a long press, a pinch). */
  up(id: number, x: number, y: number, t: number): ClickKind | null {
    const p = this.press;
    if (!p || p.id !== id) {
      if (this.poisoned && this.press === null) this.poisoned = false;
      return null;
    }
    this.press = null;
    this.move(id, x, y);
    const travel = Math.max(p.travel, Math.hypot(x - p.x, y - p.y));
    if (this.poisoned || travel > p.slop || t - p.t > CLICK_MAX_MS) {
      this.lastClick = null;
      return null;
    }
    const last = this.lastClick;
    if (last && t - last.t <= DOUBLE_MS && Math.hypot(x - last.x, y - last.y) <= p.doubleSlop) {

      this.lastClick = null;
      return 'double';
    }
    this.lastClick = { x, y, t };
    return 'click';
  }

  cancel(): void {
    this.press = null;
    this.lastClick = null;
    this.poisoned = false;
  }
}
