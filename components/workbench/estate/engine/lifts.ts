import { projectOntoPath, stairPath, type PathProjection, type StairPath } from '../../../../lib/estate/climb';
import type { EstateStoreyTag } from '../../../../lib/estate/ids';
import { liftNear, type EstateNav, type LiftNear, type NavLift, type NavStair } from '../../../../lib/estate/nav';
import { nearestWalkable, type WalkFile, type WalkPose } from '../../../../lib/estate/walk';

// Stairs and lifts in Walk (plan §8.5): what the walker is offered where it
// stands, where a lift ride lands, and how the storey strip routes to a level.
// Pure (no three, no DOM), so node tests pin it; engine/controls/walkMode.ts
// runs it. Everything is block-local Z up (the walk grid's and the nav file's
// frame); storeys are indices into the building's storeys (ids.ts, the walk
// layer).
//
// Lifts: within LIFT_REACH of a landing the chip offers the levels that lift
// serves; a ride is a LIFT_FADE_MS fade to paper and back, arriving
// LIFT_ARRIVAL_OUT m out from the target landing (along the landing's facing,
// out of the car), snapped to the nearest walkable cell within LIFT_SNAP m. No
// car or shaft is drawn and nothing downloads: the building's interior and walk
// grid are already resident, a storey change only moves the band.
//
// Stairs: within STAIR_REACH of a stair's walking line (3-D, so the flights
// stacked over each other are told apart by the feet height) the chip offers
// the storey above and below through that core; Take stairs follows the line
// (lib/estate/climb.ts).
//
// The strip: Dijkstra over the storeys, a lift ride costing LIFT_COST and each
// stair flight STAIR_COST, so a level the lifts serve is one ride and one they
// do not (RF in every residential block, V6) is a ride to the highest served
// level and then the stair path; no route is a disabled button with a reason.

/** A lift landing offers its levels within this, m (nav.ts LIFT_REACH). */
export const LIFT_REACH = 1.5;
/** One way of a ride's fade to paper, ms (out, then the cut, then back in). */
export const LIFT_FADE_MS = 250;
/** A ride lands this far out from the target landing, along its facing, m. */
export const LIFT_ARRIVAL_OUT = 1.2;
/** …snapped to the nearest walkable cell within this, m. */
export const LIFT_SNAP = 1.5;
/** The stair chip is offered within this of a stair's walking line, m (3-D). */
export const STAIR_REACH = 1.5;
/** Within this of a line's end (m of progress) the walker is at that landing, not on the flight. */
export const STAIR_END_REACH = 1.0;
/** A routed stair leg starting farther than this from its line fades to the line's start first, m. */
export const STAIR_CUT_REACH = 2.0;
/** Dijkstra weights: a ride, a flight. A flight costs a little more, so a level the lifts serve goes by lift. */
export const LIFT_COST = 1;
export const STAIR_COST = 1.1;

/** 'Lift 2' → 'LIFT 2'. */
export const liftLabel = (lift: Pick<NavLift, 'name'>): string => lift.name.toUpperCase();

/** 'L5-STAIR2' → 'STAIR 2'; a room without a stair number falls back to the stair's own name in capitals. */
export const stairLabel = (stair: Pick<NavStair, 'room' | 'name'>): string => {
  const m = /STAIR\s*(\d+)/i.exec(stair.room);
  return m ? `STAIR ${m[1]}` : stair.name.toUpperCase();
};

/** The lift chip: 'LIFT 2 · CHOOSE A LEVEL'. */
export const liftChip = (lift: Pick<NavLift, 'name'>): string => `${liftLabel(lift)} · CHOOSE A LEVEL`;

/** A ride's caption: 'LIFT 2 · L5 → L12'. */
export const rideCaption = (label: string, from: EstateStoreyTag, to: EstateStoreyTag): string => `${label} · ${from} → ${to}`;

/** The stair chip: 'STAIR 2 · ▲ L6 · ▼ L4', a missing direction left out. */
export const stairChip = (label: string, up: EstateStoreyTag | null, down: EstateStoreyTag | null): string =>
  `${label}${up ? ` · ▲ ${up}` : ''}${down ? ` · ▼ ${down}` : ''}`;

/** The strip's reason for a level nothing reaches. */
export const noRouteReason = (tag: EstateStoreyTag): string => `No lift or stair reaches ${tag}`;

// ---- stair lines -------------------------------------------------------------------

const PATHS = new WeakMap<EstateNav, readonly (StairPath | null)[]>();

/** Each stair's walking line as a climb.ts StairPath (null where upstream wrote none), cached per nav file. */
export const stairPaths = (nav: EstateNav): readonly (StairPath | null)[] => {
  let paths = PATHS.get(nav);
  if (!paths) {
    paths = Object.freeze(nav.stairs.map((s) => {
      if (s.path.length < 2) return null;
      try { return stairPath(s.path); } catch { return null; }
    }));
    PATHS.set(nav, paths);
  }
  return paths;
};

const storeyIndex = (nav: EstateNav, tag: EstateStoreyTag): number => {
  for (let i = 0; i < nav.storeys.length; i += 1) if (nav.storeys[i].tag === tag) return i;
  return -1;
};

/** A stair of the building by index into nav.stairs, and which way to walk its line. */
export interface StairChoice {
  stair: number;
  dir: 'up' | 'down';
  /** The storey index the climb ends on. */
  to: number;
}

/**
 * The stair to take one storey `dir` from storey `from` whose near end (its
 * line's start going up, its end going down) is nearest plan point (x, y), or
 * null when no stair leaves that way. Fills `out`.
 */
export const stairFor = (nav: EstateNav, from: number, dir: 'up' | 'down', x: number, y: number, out: StairChoice): StairChoice | null => {
  const paths = stairPaths(nav);
  const tag = nav.storeys[from]?.tag;
  if (tag === undefined) return null;
  let best = Infinity;
  let found = -1;
  for (let i = 0; i < nav.stairs.length; i += 1) {
    const s = nav.stairs[i];
    const path = paths[i];
    if (!path) continue;
    if (dir === 'up' ? s.storey !== tag : s.to !== tag) continue;
    const k = dir === 'up' ? 0 : 3 * (path.count - 1);
    const d = Math.hypot(path.xyz[k] - x, path.xyz[k + 1] - y);
    if (d < best) { best = d; found = i; }
  }
  if (found < 0) return null;
  out.stair = found;
  out.dir = dir;
  out.to = storeyIndex(nav, dir === 'up' ? nav.stairs[found].to : nav.stairs[found].storey);
  return out.to >= 0 ? out : null;
};

/** EstateStairOffer without its text: the core's label and the two ways out, as stair choices. */
export interface StairOfferState {
  label: string;
  up: StairChoice | null;
  down: StairChoice | null;
  /** 3-D distance from the feet to the nearest line, m. */
  distance: number;
}

const PROJ: PathProjection = { s: 0, distance: 0 };
const P3 = [0, 0, 0];

/**
 * The stair core the walker at block-local (x, y, feetZ) on storey `storey` is
 * in, if any line touching that storey passes within `reach` (3-D): ▲ continues
 * up through that core, ▼ down. At a landing the core's flights above and below
 * are both offered; on a flight, its own two ends. Fills `out`, or returns null.
 */
export const stairOffer = (
  nav: EstateNav, storey: number, x: number, y: number, feetZ: number, out: StairOfferState, reach = STAIR_REACH,
): StairOfferState | null => {
  const paths = stairPaths(nav);
  const tag = nav.storeys[storey]?.tag;
  if (tag === undefined) return null;
  const below = storey > 0 ? nav.storeys[storey - 1].tag : null;
  P3[0] = x; P3[1] = y; P3[2] = feetZ;
  let best = reach;
  let found = -1;
  let bestS = 0;
  for (let i = 0; i < nav.stairs.length; i += 1) {
    const s = nav.stairs[i];
    const path = paths[i];
    if (!path) continue;
    // Lines from this storey up, and from the one below up to it (the flight
    // the walker may be standing on, or about to walk down).
    if (s.storey !== tag && !(below !== null && s.storey === below && s.to === tag)) continue;
    projectOntoPath(path, P3, PROJ);
    if (PROJ.distance <= best) { best = PROJ.distance; found = i; bestS = PROJ.s; }
  }
  if (found < 0) return null;
  const s = nav.stairs[found];
  const path = paths[found]!;
  const a = storeyIndex(nav, s.storey);
  const b = storeyIndex(nav, s.to);
  if (a < 0 || b < 0) return null;
  const atBottom = bestS <= STAIR_END_REACH;
  const atTop = path.length - bestS <= STAIR_END_REACH;
  const startX = path.xyz[0], startY = path.xyz[1];
  const endX = path.xyz[3 * (path.count - 1)], endY = path.xyz[3 * (path.count - 1) + 1];
  let up: StairChoice | null = null;
  let down: StairChoice | null = null;
  if (atTop && !atBottom) {
    // On the upper landing: back down this line, or on up the core from there.
    down = { stair: found, dir: 'down', to: a };
    up = stairFor(nav, b, 'up', endX, endY, { stair: -1, dir: 'up', to: -1 });
    if (up && !nearEnd(paths[up.stair], 0, endX, endY)) up = null;
  } else if (atBottom && !atTop) {
    // On the lower landing: up this line, or down the core from there.
    up = { stair: found, dir: 'up', to: b };
    down = stairFor(nav, a, 'down', startX, startY, { stair: -1, dir: 'down', to: -1 });
    if (down && !nearEnd(paths[down.stair], 1, startX, startY)) down = null;
  } else {
    // On the flight: its two ends.
    up = { stair: found, dir: 'up', to: b };
    down = { stair: found, dir: 'down', to: a };
  }
  out.label = stairLabel(s);
  out.up = up;
  out.down = down;
  out.distance = best;
  return out;
};

/** Does `path`'s start (end 0) or end (end 1) lie within a landing's reach of plan point (x, y)? Same core, stacked. */
const nearEnd = (path: StairPath | null, end: 0 | 1, x: number, y: number): boolean => {
  if (!path) return false;
  const k = end === 0 ? 0 : 3 * (path.count - 1);
  return Math.hypot(path.xyz[k] - x, path.xyz[k + 1] - y) <= 2 * STAIR_REACH;
};

// ---- lifts --------------------------------------------------------------------------

const NEAR: LiftNear = { lift: null as unknown as NavLift, landing: null as unknown as LiftNear['landing'], distance: 0 };

/** The lift offered at block-local (x, y) on storey `storey` (within LIFT_REACH of its landing), or null. */
export const liftOffer = (nav: EstateNav, storey: number, x: number, y: number, reach = LIFT_REACH): NavLift | null =>
  liftNear(nav, storey, x, y, NEAR, reach)?.lift ?? null;

/** The lift with a landing on `storey` nearest plan point (x, y), however far, that also lands on `to` (any served level when −1). */
export const nearestLift = (nav: EstateNav, storey: number, x: number, y: number, to = -1): NavLift | null => {
  const tag = nav.storeys[storey]?.tag;
  const toTag = to >= 0 ? nav.storeys[to]?.tag : undefined;
  if (tag === undefined) return null;
  let best = Infinity;
  let found: NavLift | null = null;
  for (const lift of nav.lifts) {
    const landing = lift.landings[tag];
    if (!landing) continue;
    if (toTag !== undefined && !lift.landings[toTag]) continue;
    const d = Math.hypot(landing.xy[0] - x, landing.xy[1] - y);
    if (d < best) { best = d; found = lift; }
  }
  return found;
};

/** Levels a lift serves that have a landing, bottom-up (the popover's buttons). */
export const servedLevels = (lift: NavLift): EstateStoreyTag[] => lift.served.filter((tag) => lift.landings[tag] !== undefined);

/** Where a ride lands, block-local: the snapped cell and the heading out of the car (radians CCW from +x). */
export interface Arrival extends WalkPose {
  heading: number;
}

/**
 * The arrival of a ride on `lift` to storey index `to`: LIFT_ARRIVAL_OUT out
 * from its landing along the landing's facing, snapped to the nearest walkable
 * cell within LIFT_SNAP of that storey's floor. Fills `out`; false when the lift
 * has no landing there or nothing walkable is in reach.
 */
export const liftArrival = (nav: EstateNav, walk: WalkFile, lift: NavLift, to: number, out: Arrival): boolean => {
  const storey = nav.storeys[to];
  const landing = storey ? lift.landings[storey.tag] : undefined;
  if (!storey || !landing) return false;
  const fx = landing.facing[0], fy = landing.facing[1];
  const n = Math.hypot(fx, fy) || 1;
  const x = landing.xy[0] + (fx / n) * LIFT_ARRIVAL_OUT;
  const y = landing.xy[1] + (fy / n) * LIFT_ARRIVAL_OUT;
  if (!nearestWalkable(walk, x, y, storey.ffl, LIFT_SNAP, out)) return false;
  // A snap that found a floor on a neighbouring storey (a stair beside the lobby) is no arrival.
  if (out.layer !== to) {
    if (!nearestWalkable(walk, landing.xy[0], landing.xy[1], storey.ffl, LIFT_SNAP, out) || out.layer !== to) return false;
  }
  out.heading = Math.atan2(fy, fx);
  return true;
};

/**
 * Where a routed stair leg starts: its line's near end (start going up, end
 * going down), snapped within LIFT_SNAP on the storey it leaves, heading along
 * the line's first segment that way. Fills `out`; false when nothing walkable.
 */
export const stairStart = (nav: EstateNav, walk: WalkFile, choice: StairChoice, out: Arrival): boolean => {
  const path = stairPaths(nav)[choice.stair];
  if (!path) return false;
  const last = path.count - 1;
  const k0 = choice.dir === 'up' ? 0 : 3 * last;
  const k1 = choice.dir === 'up' ? 3 : 3 * (last - 1);
  const x = path.xyz[k0], y = path.xyz[k0 + 1], z = path.xyz[k0 + 2];
  if (!nearestWalkable(walk, x, y, z, LIFT_SNAP, out)) return false;
  out.heading = Math.atan2(path.xyz[k1 + 1] - y, path.xyz[k1] - x);
  return true;
};

// ---- routes (the storey strip) -------------------------------------------------------

export type RouteLeg =
  | { readonly kind: 'lift'; readonly from: number; readonly to: number }
  | { readonly kind: 'stairs'; readonly from: number; readonly to: number };

export interface Route {
  readonly legs: readonly RouteLeg[];
  readonly summary: 'lift' | 'stairs' | 'lift+stairs';
}

/**
 * The cheapest way from storey `from` to storey `to` (indices): rides between
 * any two landings of one lift (LIFT_COST), flights between adjacent storeys
 * (STAIR_COST each, either way). null when nothing reaches it, or from === to.
 */
export const planRoute = (nav: EstateNav, from: number, to: number): Route | null => {
  const n = nav.storeys.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return null;
  const tags = nav.storeys.map((s) => s.tag);
  // Adjacency: stairs (both ways) and lifts (every pair of landings).
  const stairUp = new Uint8Array(n);
  for (const s of nav.stairs) {
    if (s.path.length < 2) continue;
    const a = tags.indexOf(s.storey);
    const b = tags.indexOf(s.to);
    if (a >= 0 && b === a + 1) stairUp[a] = 1;
  }
  const liftAt: number[][] = nav.lifts.map((lift) => tags.map((t, i) => (lift.landings[t] && lift.served.includes(t) ? i : -1)).filter((i) => i >= 0));
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const via = new Uint8Array(n); // 1 lift, 2 stairs
  const done = new Uint8Array(n);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i += 1) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === to) break;
    done[u] = 1;
    const relax = (v: number, cost: number, kind: 1 | 2) => {
      if (v < 0 || v >= n || done[v]) return;
      const d = dist[u] + cost;
      if (d < dist[v] - 1e-9) { dist[v] = d; prev[v] = u; via[v] = kind; }
    };
    if (u + 1 < n && stairUp[u]) relax(u + 1, STAIR_COST, 2);
    if (u > 0 && stairUp[u - 1]) relax(u - 1, STAIR_COST, 2);
    for (const stops of liftAt) {
      if (!stops.includes(u)) continue;
      for (const v of stops) if (v !== u) relax(v, LIFT_COST, 1);
    }
  }
  if (!(dist[to] < Infinity)) return null;
  const legs: RouteLeg[] = [];
  for (let v = to; v !== from; v = prev[v]) legs.push({ kind: via[v] === 1 ? 'lift' : 'stairs', from: prev[v], to: v });
  legs.reverse();
  const lift = legs.some((l) => l.kind === 'lift');
  const stairs = legs.some((l) => l.kind === 'stairs');
  return { legs, summary: lift && stairs ? 'lift+stairs' : lift ? 'lift' : 'stairs' };
};

/** One storey on Walk's strip (engineApi EstateWalkLevel). */
export interface WalkLevel {
  tag: EstateStoreyTag;
  ffl: number;
  route: 'here' | 'lift' | 'stairs' | 'lift+stairs' | null;
  reason: string | null;
}

/** The strip from storey `from`: every storey, bottom-up, with its route summary or the reason none exists. */
export const walkLevels = (nav: EstateNav, from: number): WalkLevel[] =>
  nav.storeys.map((s, i) => {
    if (i === from) return { tag: s.tag, ffl: s.ffl, route: 'here' as const, reason: null };
    const route = planRoute(nav, from, i);
    return { tag: s.tag, ffl: s.ffl, route: route ? route.summary : null, reason: route ? null : noRouteReason(s.tag) };
  });

// ---- the fade -----------------------------------------------------------------------

/** A ride's paper layer: opaque share at `elapsedMs` (out over LIFT_FADE_MS, the cut, back in), and whether the cut is due. */
export interface FadeState {
  opacity: number;
  /** The cut (teleport) belongs to this frame or an earlier one. */
  cut: boolean;
  done: boolean;
}

export const fadeAt = (elapsedMs: number, out: FadeState = { opacity: 0, cut: false, done: false }): FadeState => {
  const t = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : Infinity;
  if (t < LIFT_FADE_MS) {
    out.opacity = t / LIFT_FADE_MS;
    out.cut = false;
    out.done = false;
  } else if (t < 2 * LIFT_FADE_MS) {
    out.opacity = 1 - (t - LIFT_FADE_MS) / LIFT_FADE_MS;
    out.cut = true;
    out.done = false;
  } else {
    out.opacity = 0;
    out.cut = true;
    out.done = true;
  }
  return out;
};
