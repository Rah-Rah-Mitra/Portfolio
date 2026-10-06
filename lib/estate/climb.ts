import type { Vec2, Vec3 } from './frames';

// "Take stairs" in Walk mode (plan §8.5). A stair's walking path comes from
// upstream <ID>_web.json: from the lower floor's landing centre, along flight
// 1, across the mid landing, along flight 2, to the upper floor's landing
// centre; block-local Z up, m. These are pure functions over that polyline; the
// engine supplies dt, the motion flag and the cancels, and chains storeys while
// the key is held.
//
// Progress is horizontal arc length, because that is what the speed is: 2.0 m/s
// in plan, about 4.5 s a storey on the dog-leg stairs. The two landing centres
// are stacked in plan, so the start projection is in 3-D, where the feet height
// tells them apart. The view looks 1 m ahead along the path, which turns the
// corners at the landings smoothly instead of snapping 180°, blended 70/30 with
// the heading the visitor had when the climb began.
//
// Headings here are block-local plan angles (radians CCW from +x), not the three
// camera's yaw: frames.threeYawToHeading and headingToThreeYaw convert.
//
// Per-frame calls (stepClimb, climbPose) allocate nothing when given `out`.

/** Horizontal speed along the path, m/s. */
export const CLIMB_SPEED = 2.0;
/** Share of the view heading taken from the path; the rest is the heading at the start. */
export const CLIMB_PATH_WEIGHT = 0.7;
/** How far ahead along the path the view looks, m. */
export const CLIMB_LOOK_AHEAD = 1.0;
/** Path distance over which the gap between the walker and the projected point closes, m. */
export const CLIMB_APPROACH = 1.0;

// A segment shorter than this in plan is vertical; it counts its rise instead,
// so position stays a function of progress. Upstream paths have none.
const FLAT = 1e-6;

export interface StairPath {
  /** Points, xyz interleaved, block-local m. */
  readonly xyz: Float64Array;
  /** Cumulative progress at each point, m: horizontal length (a vertical segment's rise). */
  readonly cum: Float64Array;
  /** Total progress, m. */
  readonly length: number;
  readonly count: number;
}

/** Prepare a path [[x, y, z], …]. Throws on fewer than two points, a non-finite coordinate, or zero length. */
export const stairPath = (points: ArrayLike<ArrayLike<number>>): StairPath => {
  const count = points.length;
  if (count < 2) throw new RangeError(`a stair path needs at least 2 points, got ${count}`);
  const xyz = new Float64Array(count * 3);
  const cum = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    const p = points[i];
    if (!p || p.length < 3) throw new RangeError(`stair path point ${i} is not [x, y, z]`);
    for (let k = 0; k < 3; k += 1) {
      if (!Number.isFinite(p[k])) throw new RangeError(`stair path point ${i} has ${p[k]}`);
      xyz[3 * i + k] = p[k];
    }
    if (i > 0) {
      const dx = xyz[3 * i] - xyz[3 * i - 3], dy = xyz[3 * i + 1] - xyz[3 * i - 2], dz = xyz[3 * i + 2] - xyz[3 * i - 1];
      const plan = Math.hypot(dx, dy);
      cum[i] = cum[i - 1] + (plan >= FLAT ? plan : Math.abs(dz));
    }
  }
  const length = cum[count - 1];
  if (!(length > 0)) throw new RangeError('stair path has zero length');
  return { xyz, cum, length, count };
};

const clampS = (path: StairPath, s: number) => (s <= 0 ? 0 : s >= path.length ? path.length : s);

/** The point at progress `s` (clamped to the path), block-local m. The ends are exact. */
export const pointAt = (path: StairPath, s: number, out: Vec3 = [0, 0, 0]): Vec3 => {
  const { xyz, cum, count } = path;
  const t = clampS(path, s);
  // Last segment whose start is at or before t.
  let a = 0, b = count - 2;
  while (a < b) { const m = (a + b + 1) >>> 1; if (cum[m] <= t) a = m; else b = m - 1; }
  const span = cum[a + 1] - cum[a];
  const u = span > 0 ? (t - cum[a]) / span : 0;
  // (1 − u)·p + u·q, not p + u·(q − p), so u = 1 returns q to the last bit.
  for (let k = 0; k < 3; k += 1) out[k] = (1 - u) * xyz[3 * a + k] + u * xyz[3 * a + 3 + k];
  return out;
};

export interface PathProjection {
  /** Progress of the nearest point, m. */
  s: number;
  /** 3-D distance from the query to it, m. */
  distance: number;
}

/** The nearest point of the path to p, in 3-D; ties go to the earliest. */
export const projectOntoPath = (
  path: StairPath, p: ArrayLike<number>, out: PathProjection = { s: 0, distance: 0 },
): PathProjection => {
  const { xyz, cum, count } = path;
  const px = p[0], py = p[1], pz = p[2];
  let best = Infinity, bestS = 0;
  for (let i = 0; i + 1 < count; i += 1) {
    const ax = xyz[3 * i], ay = xyz[3 * i + 1], az = xyz[3 * i + 2];
    const dx = xyz[3 * i + 3] - ax, dy = xyz[3 * i + 4] - ay, dz = xyz[3 * i + 5] - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    let u = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = ax + u * dx - px, ey = ay + u * dy - py, ez = az + u * dz - pz;
    const d2 = ex * ex + ey * ey + ez * ez;
    if (d2 < best) {
      best = d2;
      // Progress is linear in u along a straight segment.
      bestS = cum[i] + u * (cum[i + 1] - cum[i]);
    }
  }
  out.s = bestS;
  out.distance = Math.sqrt(best);
  return out;
};

export type ClimbDirection = 'up' | 'down';
export type ClimbState = 'running' | 'done' | 'cancelled';

export interface Climb {
  readonly path: StairPath;
  /** +1 up the path (towards its last point), −1 down it. */
  readonly dir: 1 | -1;
  /** Where the start projected to, m of progress. */
  readonly from: number;
  /** The end it heads for: path.length up, 0 down. */
  readonly to: number;
  /** Current progress, m. */
  s: number;
  state: ClimbState;
  /** The walker's start position minus the projected point; fades out over CLIMB_APPROACH, zeroed by a cut. */
  readonly offset: Vec3;
  /** The view heading at the start as a unit vector, block-local ([0, 0] when none was given). */
  readonly startDir: Vec2;
}

export interface ClimbPose {
  /** Feet position, block-local m. */
  x: number;
  y: number;
  z: number;
  /** View heading, radians counter-clockwise from block-local +x (frames.headingToThreeYaw for the camera). */
  heading: number;
  /** True once the climb has ended, by arriving, a cut or a cancel. */
  done: boolean;
}

const newPose = (): ClimbPose => ({ x: 0, y: 0, z: 0, heading: 0, done: false });
const A: Vec3 = [0, 0, 0];
const B: Vec3 = [0, 0, 0];
const PROJ: PathProjection = { s: 0, distance: 0 };

const cut = (climb: Climb, s: number, state: ClimbState) => {
  climb.s = s;
  climb.state = state;
  climb.offset[0] = 0; climb.offset[1] = 0; climb.offset[2] = 0;
};

/**
 * Begin a climb from the walker's feet `from` (block-local m) and view heading
 * (block-local radians CCW from +x; non-finite for none). Starts at the nearest
 * point of the path rather than its first, so a walker already on the flight
 * carries on from there; the gap to that point closes over the first
 * CLIMB_APPROACH m, so the start does not jump. While motion is halted the
 * climb cuts straight to its end. Throws RangeError on a non-finite `from`,
 * which would otherwise turn every pose of the climb to NaN.
 */
export const startClimb = (
  path: StairPath, from: ArrayLike<number>, heading: number, direction: ClimbDirection, halted: boolean,
): Climb => {
  if (!from || from.length < 3 || !Number.isFinite(from[0]) || !Number.isFinite(from[1]) || !Number.isFinite(from[2])) {
    throw new RangeError(`startClimb: the walker's position must be three finite numbers, got [${Array.from(from ?? []).join(', ')}]`);
  }
  const dir = direction === 'up' ? 1 : -1;
  const s0 = projectOntoPath(path, from, PROJ).s;
  pointAt(path, s0, A);
  const climb: Climb = {
    path, dir, from: s0, to: dir > 0 ? path.length : 0, s: s0, state: 'running',
    offset: [from[0] - A[0], from[1] - A[1], from[2] - A[2]],
    startDir: Number.isFinite(heading) ? [Math.cos(heading), Math.sin(heading)] : [0, 0],
  };
  if (halted || s0 === climb.to) cut(climb, climb.to, 'done');
  return climb;
};

// The direction of travel at s: towards the point CLIMB_LOOK_AHEAD further on,
// or, within that of the end, from the point that far back. NaN-free: (0, 0)
// only for a path with no extent in plan.
const travelDirection = (climb: Climb, out: Vec2): Vec2 => {
  const { path, dir, s } = climb;
  pointAt(path, s, A);
  pointAt(path, s + dir * CLIMB_LOOK_AHEAD, B);
  let tx = B[0] - A[0], ty = B[1] - A[1];
  if (Math.hypot(tx, ty) < FLAT) {
    pointAt(path, s - dir * CLIMB_LOOK_AHEAD, B);
    tx = A[0] - B[0]; ty = A[1] - B[1];
  }
  const n = Math.hypot(tx, ty);
  out[0] = n >= FLAT ? tx / n : 0;
  out[1] = n >= FLAT ? ty / n : 0;
  return out;
};

const T: Vec2 = [0, 0];

/** The pose at the climb's current progress. */
export const climbPose = (climb: Climb, out: ClimbPose = newPose()): ClimbPose => {
  const { path, from, to, s, offset, startDir } = climb;
  pointAt(path, s, A);
  const span = Math.min(CLIMB_APPROACH, Math.abs(to - from));
  const w = span > 0 ? Math.max(0, 1 - Math.abs(s - from) / span) : 0;
  const x = A[0] + w * offset[0], y = A[1] + w * offset[1], z = A[2] + w * offset[2];
  travelDirection(climb, T);
  // Two unit vectors at 0.7 and 0.3 never cancel, even pointing opposite ways.
  const vx = CLIMB_PATH_WEIGHT * T[0] + (1 - CLIMB_PATH_WEIGHT) * startDir[0];
  const vy = CLIMB_PATH_WEIGHT * T[1] + (1 - CLIMB_PATH_WEIGHT) * startDir[1];
  out.x = x; out.y = y; out.z = z;
  out.heading = Math.hypot(vx, vy) > 0 ? Math.atan2(vy, vx) : 0;
  out.done = climb.state !== 'running';
  return out;
};

/**
 * Advance a running climb by dt seconds and return its pose. Reaching the end
 * lands exactly on it and ends the climb. When motion is halted mid-climb, a
 * cut to the end. A finished or cancelled climb no longer moves.
 */
export const stepClimb = (climb: Climb, dt: number, halted: boolean, out: ClimbPose = newPose()): ClimbPose => {
  if (climb.state === 'running') {
    if (halted) {
      cut(climb, climb.to, 'done');
    } else if (dt > 0 && Number.isFinite(dt)) {
      const s = climb.s + climb.dir * CLIMB_SPEED * dt;
      if (climb.dir > 0 ? s >= climb.to : s <= climb.to) cut(climb, climb.to, 'done');
      else climb.s = s;
    }
  }
  return climbPose(climb, out);
};

/**
 * Stop a running climb. 'here' (a movement key or drag) leaves the walker where
 * it is, on the flight. 'nearest-end' (Esc, plan §8.3) lands on whichever end of
 * the path is nearer along it; at the midpoint, the one it was heading for.
 */
export const cancelClimb = (
  climb: Climb, land: 'here' | 'nearest-end', out: ClimbPose = newPose(),
): ClimbPose => {
  if (climb.state === 'running') {
    if (land === 'here') {
      climb.state = 'cancelled';
    } else {
      const back = climb.s, ahead = climb.path.length - climb.s;
      cut(climb, back < ahead ? 0 : ahead < back ? climb.path.length : climb.to, 'cancelled');
    }
  }
  return climbPose(climb, out);
};

/** Seconds left at CLIMB_SPEED; 0 once it has ended. */
export const climbRemaining = (climb: Climb): number =>
  climb.state === 'running' ? Math.abs(climb.to - climb.s) / CLIMB_SPEED : 0;
