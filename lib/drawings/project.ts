import type { DrawingPoster } from './types';

// The drawing set's projector (docs/portfolio/desk-drawing-set.md §5): one camera
// model for every view the desk draws, so a camera move is a pose interpolation.
//
//   r = (sin ψ, −cos ψ, 0)   u = (cos ψ sin φ, sin ψ sin φ, cos φ)   f = (cos ψ cos φ, sin ψ cos φ, −sin φ)
//   v = P − C;  x = v·r;  y = v·u;  z = v·f;  q = 1 + z p / k  (behind the eye when q < 1e−3);  g = 1/q
//   s = frame.h / 2k;  X = frame centre + s (x g − σx k);  Y = frame centre − s (y g − σ k)
//
// ψ turns the view about the vertical (90° looks north-up in plan), φ is how far
// the view looks down (90° straight down), C is the point at the frame's centre,
// k half the frame's height in metres at C, p = tan(vfov/2) the perspective
// strength (0 is orthographic: the plan and the axonometric), σ and σx the lens
// shift in units of k. The eye sits k/p behind C. With the pack's aerialNE camera
// this is the poster's own shifted pinhole: the estate's corners land where the
// poster has them (tests/drawing-project.test.ts). The engine's aerialPose turns
// its camera instead of shifting it (it keystones by up to 2 %), and lives in the
// engine folder this code may not import (tests/estate-boundary.test.ts).

export interface Pose {
  psi: number;
  phi: number;
  cx: number;
  cy: number;
  cz: number;
  k: number;
  p: number;
  sigma: number;
  sigmaX: number;
}

/** A rectangle in CSS pixels: where a pose's frame lands. */
export interface Frame { x: number; y: number; w: number; h: number }

export const DEG = Math.PI / 180;
/** The poster's own view: the axonometric uses its rotation, so a dolly-zoom turns nothing. */
export const AXO_PSI = 225 * DEG;
export const AXO_PHI = 30 * DEG;
export const NORTH_UP = 90 * DEG;

export interface Basis { rx: number; ry: number; ux: number; uy: number; uz: number; fx: number; fy: number; fz: number }

export const basis = (pose: Pick<Pose, 'psi' | 'phi'>): Basis => {
  const sp = Math.sin(pose.psi);
  const cp = Math.cos(pose.psi);
  const sf = Math.sin(pose.phi);
  const cf = Math.cos(pose.phi);
  return { rx: sp, ry: -cp, ux: cp * sf, uy: sp * sf, uz: cf, fx: cp * cf, fy: sp * cf, fz: -sf };
};

/**
 * Projects (X, Y, Z) into `out[o]`, `out[o + 1]` (CSS px). Returns false — and
 * writes nothing — for a point behind the eye. `b` is basis(pose), passed in so a
 * painter computes it once per frame.
 */
export const project = (pose: Pose, b: Basis, frame: Frame, X: number, Y: number, Z: number, out: Float64Array | number[], o = 0): boolean => {
  const vx = X - pose.cx;
  const vy = Y - pose.cy;
  const vz = Z - pose.cz;
  const x = vx * b.rx + vy * b.ry;
  const y = vx * b.ux + vy * b.uy + vz * b.uz;
  const z = vx * b.fx + vy * b.fy + vz * b.fz;
  const q = 1 + (z * pose.p) / pose.k;
  if (q < 1e-3) return false;
  const g = 1 / q;
  const s = frame.h / (2 * pose.k);
  out[o] = frame.x + frame.w / 2 + s * (x * g - pose.sigmaX * pose.k);
  out[o + 1] = frame.y + frame.h / 2 - s * (y * g - pose.sigma * pose.k);
  return true;
};

/** Depth along the view (larger is further), for painting far to near. */
export const depth = (b: Basis, pose: Pose, X: number, Y: number, Z: number): number =>
  (X - pose.cx) * b.fx + (Y - pose.cy) * b.fy + (Z - pose.cz) * b.fz;

/** Pixels per metre at the frame's centre plane. */
export const pxPerMetre = (pose: Pose, frame: Frame): number => frame.h / (2 * pose.k);

/** Rotate v by the unit quaternion q = (x, y, z, w) (the pack's AerialView convention). */
export const rotateByQuat = (q: readonly number[], v: readonly number[]): [number, number, number] => {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [vx + qw * tx + (qy * tz - qz * ty), vy + qw * ty + (qz * tx - qx * tz), vz + qw * tz + (qx * ty - qy * tx)];
};

/**
 * The poster camera as a pose: upstream's Blender camera (looking down its local
 * −Z, +Y up), rotated by the pack's quaternion, its centre where the view ray meets
 * the ground (estate z = 0), its lens shift in units of k (Blender measures shift
 * in units of the larger image side). Throws on a rolled camera, which no pose
 * here can express.
 */
export const posterPose = (poster: DrawingPoster): Pose => {
  const f = rotateByQuat(poster.quat, [0, 0, -1]);
  const r = rotateByQuat(poster.quat, [1, 0, 0]);
  if (Math.abs(r[2]) > 1e-4) throw new Error('drawing set: the poster camera is rolled');
  if (!(f[2] < -1e-3)) throw new Error('drawing set: the poster camera does not look down');
  const d = -poster.eye[2] / f[2];
  const p = Math.tan((poster.vfovDeg * DEG) / 2);
  const larger = 2 * Math.max(poster.aspect, 1);
  return {
    psi: Math.atan2(r[0], -r[1]),
    phi: Math.asin(-f[2]),
    cx: poster.eye[0] + f[0] * d,
    cy: poster.eye[1] + f[1] * d,
    cz: 0,
    k: d * p,
    p,
    sigma: poster.shift[1] * larger,
    sigmaX: poster.shift[0] * larger,
  };
};

/**
 * The rectangle a poster-shaped image fills when it covers `box` (object-fit:
 * cover, centred): what the Estate window's poster occupies on screen, so line
 * work drawn into it registers with the picture.
 */
export const coverFrame = (box: Frame, aspect: number): Frame => {
  if (box.w / box.h > aspect) {
    const h = box.w / aspect;
    return { x: box.x, y: box.y + (box.h - h) / 2, w: box.w, h };
  }
  const w = box.h * aspect;
  return { x: box.x + (box.w - w) / 2, y: box.y, w, h: box.h };
};

/** The largest `aspect` rectangle inside `box`, centred (object-fit: contain). */
export const containFrame = (box: Frame, aspect: number): Frame => {
  if (box.w / box.h > aspect) {
    const w = box.h * aspect;
    return { x: box.x + (box.w - w) / 2, y: box.y, w, h: box.h };
  }
  const h = box.w / aspect;
  return { x: box.x, y: box.y + (box.h - h) / 2, w: box.w, h };
};

const shortArc = (a: number, b: number): number => {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

/**
 * A camera move's pose at t ∈ [0, 1]: ψ by the short arc, k log-linear (a zoom
 * reads evenly), everything else linear. From an orthographic pose to the poster
 * this is the dolly-zoom: p grows from 0 while k holds the centre plane's scale.
 */
export const lerpPose = (a: Pose, b: Pose, t: number): Pose => (t <= 0 ? { ...a } : t >= 1 ? { ...b } : {
  psi: a.psi + shortArc(a.psi, b.psi) * t,
  phi: a.phi + (b.phi - a.phi) * t,
  cx: a.cx + (b.cx - a.cx) * t,
  cy: a.cy + (b.cy - a.cy) * t,
  cz: a.cz + (b.cz - a.cz) * t,
  k: Math.exp(Math.log(a.k) + (Math.log(b.k) - Math.log(a.k)) * t),
  p: a.p + (b.p - a.p) * t,
  sigma: a.sigma + (b.sigma - a.sigma) * t,
  sigmaX: a.sigmaX + (b.sigmaX - a.sigmaX) * t,
});

/**
 * The orthographic pose at (ψ, φ) that fits `points` (x, y, z triples) in a frame
 * of `aspect` with `margin` (a fraction of the frame kept clear on each side): its
 * centre is the points' box centre in the view plane, its k the smallest that
 * holds them.
 */
export const fitOrtho = (psi: number, phi: number, points: ArrayLike<number>, aspect: number, margin = 0.06): Pose => {
  const b = basis({ psi, phi });
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    const X = points[i]; const Y = points[i + 1]; const Z = points[i + 2];
    const x = X * b.rx + Y * b.ry;
    const y = X * b.ux + Y * b.uy + Z * b.uz;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  // The view-plane centre back in world space, on the plane z·f through the points' middle.
  let zMid = 0;
  let n = 0;
  for (let i = 0; i < points.length; i += 3) { zMid += points[i] * b.fx + points[i + 1] * b.fy + points[i + 2] * b.fz; n += 1; }
  zMid /= Math.max(1, n);
  const cx = xm * b.rx + ym * b.ux + zMid * b.fx;
  const cy = xm * b.ry + ym * b.uy + zMid * b.fy;
  const cz = ym * b.uz + zMid * b.fz;
  const half = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / aspect, 1e-6);
  return { psi, phi, cx, cy, cz, k: half / (1 - 2 * margin), p: 0, sigma: 0, sigmaX: 0 };
};

/** The plan pose: looking straight down, `k` metres from the centre to the frame's top. */
export const planPose = (cx: number, cy: number, k: number, psi = NORTH_UP, cz = 0): Pose =>
  ({ psi, phi: 90 * DEG, cx, cy, cz, k, p: 0, sigma: 0, sigmaX: 0 });
