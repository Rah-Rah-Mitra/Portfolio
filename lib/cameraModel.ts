import type { CameraLabSnapshot } from '../types';

// The Camera Lab's single synthetic scene: one camera, one checkerboard, four
// models read off the same numbers. Pure — no DOM, no React — so the prerender,
// the tests and the browser all derive identical figures from it.
//
// Conventions (OpenCV's, right-handed): world X right, Y DOWN, Z into the board;
// metres. The board lies on Z_w = 0, centred on the origin. Lens and sensor are
// in mm; image coordinates are px from the top-left, u right, v down.
//
// The known answers in tests/camera-model.test.ts are pinned: a number that
// moves means the math moved. Justify it against an independent check (e.g.
// OpenCV) before re-pinning; never just update the expectation.

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];
export type CameraMode = 'intrinsics' | 'extrinsics' | 'optics' | 'stereo';

export const CAMERA_MODES: ReadonlyArray<{ id: CameraMode; label: string; question: string; tag: string }> = [
  { id: 'intrinsics', label: 'Intrinsics', question: 'Where does a ray land on the sensor?', tag: 'PINHOLE K · BROWN–CONRADY' },
  { id: 'extrinsics', label: 'Extrinsics', question: 'Where is the camera, and how is it turned?', tag: 'POSE [R | t] · BOARD HOMOGRAPHY' },
  { id: 'optics', label: 'Optics', question: 'Which corners are sharp?', tag: 'THIN LENS · c ≤ 1 PX' },
  { id: 'stereo', label: 'Stereo', question: 'How far is each corner, and how sure is that?', tag: 'RECTIFIED STEREO · δZ ∝ Z²' },
];

export const isCameraMode = (v: unknown): v is CameraMode =>
  typeof v === 'string' && CAMERA_MODES.some((m) => m.id === v);

// 25 µm pixels are deliberately coarse: the numbers stay legible at 1 dp.
export const SENSOR = { widthMm: 36, heightMm: 24, widthPx: 1440, heightPx: 960, pitchMm: 0.025 } as const;
export const BOARD = { cols: 9, rows: 6, squareM: 0.05 } as const;
// One pixel: blur below it is invisible to a corner detector.
export const COC_MM = 0.025;
export const F_STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16] as const;
export const NAMED_CORNERS = [
  { id: 'TL', index: 0 },
  { id: 'TR', index: 8 },
  { id: 'MID', index: 22 },
  { id: 'BL', index: 45 },
  { id: 'BR', index: 53 },
] as const;

const D2R = Math.PI / 180;

// ── scene ────────────────────────────────────────────────────────────────

export interface CameraScene {
  focalMm: number;
  cxOffsetPx: number;
  cyOffsetPx: number;
  k1: number;
  k2: number;
  p1: number;
  p2: number;
  distanceM: number;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  fNumber: number;
  focusM: number;
  baselineM: number;
  disparitySigmaPx: number;
}

export const DEFAULT_SCENE: CameraScene = {
  focalMm: 35,
  cxOffsetPx: 0,
  cyOffsetPx: 0,
  k1: -0.08,
  k2: 0,
  p1: 0,
  p2: 0,
  distanceM: 0.9,
  yawDeg: 25,
  pitchDeg: 15,
  rollDeg: 0,
  fNumber: 2.8,
  focusM: 0.9,
  baselineM: 0.12,
  disparitySigmaPx: 0.25,
};

// fNumber's step is 0: it snaps to F_STOPS instead of a grid.
export const SCENE_RANGES: Record<keyof CameraScene, { min: number; max: number; step: number }> = {
  focalMm: { min: 20, max: 85, step: 1 },
  cxOffsetPx: { min: -40, max: 40, step: 1 },
  cyOffsetPx: { min: -40, max: 40, step: 1 },
  k1: { min: -0.3, max: 0.3, step: 0.01 },
  k2: { min: -0.1, max: 0.1, step: 0.01 },
  p1: { min: -0.005, max: 0.005, step: 0.0005 },
  p2: { min: -0.005, max: 0.005, step: 0.0005 },
  distanceM: { min: 0.5, max: 1.6, step: 0.01 },
  yawDeg: { min: -40, max: 40, step: 1 },
  pitchDeg: { min: -30, max: 30, step: 1 },
  rollDeg: { min: -30, max: 30, step: 1 },
  fNumber: { min: 1.4, max: 16, step: 0 },
  focusM: { min: 0.4, max: 3, step: 0.01 },
  baselineM: { min: 0.04, max: 0.3, step: 0.01 },
  disparitySigmaPx: { min: 0.05, max: 1, step: 0.05 },
};

const decimalsOf = (step: number) => {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
};

// Snap to the step without leaving float dust (−0.08 must stay −0.08, not
// −0.08000000000000002, or the readouts and the tests drift).
export const snapToStep = (value: number, step: number): number => {
  if (!(step > 0)) return value;
  const snapped = Number((Math.round(value / step) * step).toFixed(decimalsOf(step)));
  return snapped === 0 ? 0 : snapped;
};

export const nearestStop = (n: number): number =>
  F_STOPS.reduce<number>((best, stop) => (Math.abs(stop - n) < Math.abs(best - n) ? stop : best), F_STOPS[0]);

export function clampScene(s: Partial<CameraScene>): CameraScene {
  const out = { ...DEFAULT_SCENE };
  (Object.keys(SCENE_RANGES) as Array<keyof CameraScene>).forEach((key) => {
    const raw = s[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return;
    const { min, max, step } = SCENE_RANGES[key];
    const clamped = Math.min(max, Math.max(min, raw));
    out[key] = key === 'fNumber' ? nearestStop(clamped) : snapToStep(clamped, step);
  });
  return out;
}

// ── intrinsics ───────────────────────────────────────────────────────────

export interface Intrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  k1: number;
  k2: number;
  p1: number;
  p2: number;
}

export function intrinsicsOf(s: CameraScene): Intrinsics {
  const f = s.focalMm / SENSOR.pitchMm;
  return {
    fx: f,
    fy: f,
    cx: SENSOR.widthPx / 2 + s.cxOffsetPx,
    cy: SENSOR.heightPx / 2 + s.cyOffsetPx,
    k1: s.k1,
    k2: s.k2,
    p1: s.p1,
    p2: s.p2,
  };
}

export const intrinsicMatrix = (i: Intrinsics): Mat3 => [[i.fx, 0, i.cx], [0, i.fy, i.cy], [0, 0, 1]];

export function fieldOfViewDeg(s: CameraScene): { h: number; v: number } {
  return {
    h: (2 * Math.atan(SENSOR.widthMm / 2 / s.focalMm)) / D2R,
    v: (2 * Math.atan(SENSOR.heightMm / 2 / s.focalMm)) / D2R,
  };
}

// ── 3×3 helpers ──────────────────────────────────────────────────────────

export const mul3 = (A: Mat3, B: Mat3): Mat3 => {
  const r = (i: number): Vec3 => [0, 1, 2].map((j) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]) as Vec3;
  return [r(0), r(1), r(2)];
};
export const mv3 = (A: Mat3, v: Vec3): Vec3 => [
  A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2],
  A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2],
  A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2],
];
export const transpose3 = (A: Mat3): Mat3 => [
  [A[0][0], A[1][0], A[2][0]],
  [A[0][1], A[1][1], A[2][1]],
  [A[0][2], A[1][2], A[2][2]],
];
export function inv3(A: Mat3): Mat3 {
  const [a, b, c] = A[0];
  const [d, e, f] = A[1];
  const [g, h, i] = A[2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [
    [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}
export const rotX = (a: number): Mat3 => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
export const rotY = (a: number): Mat3 => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
export const rotZ = (a: number): Mat3 => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const column = (A: Mat3, j: number): Vec3 => [A[0][j], A[1][j], A[2][j]];

// ── pose: a look-at orbit about the target ───────────────────────────────

export interface Pose {
  R: Mat3;
  t: Vec3;
  C: Vec3;
  Rwc: Mat3;
}

// R_wc = R_y(ψ)·R_x(−θ)·R_z(φ); the camera sits ρ behind the target along its own
// optical axis. Because the target is on that axis, t = (0, 0, ρ) for every pose
// — C carries the position.
export function orbitPose(
  o: Pick<CameraScene, 'distanceM' | 'yawDeg' | 'pitchDeg' | 'rollDeg'>,
  target: Vec3 = [0, 0, 0],
): Pose {
  const Rwc = mul3(rotY(o.yawDeg * D2R), mul3(rotX(-o.pitchDeg * D2R), rotZ(o.rollDeg * D2R)));
  const fwd = column(Rwc, 2);
  const C: Vec3 = [target[0] - o.distanceM * fwd[0], target[1] - o.distanceM * fwd[1], target[2] - o.distanceM * fwd[2]];
  const R = transpose3(Rwc);
  const RC = mv3(R, C);
  return { R, t: [-RC[0], -RC[1], -RC[2]], C, Rwc };
}

export function rodrigues(w: Vec3): Mat3 {
  const th = Math.hypot(w[0], w[1], w[2]);
  if (th < 1e-12) return [[1, -w[2], w[1]], [w[2], 1, -w[0]], [-w[1], w[0], 1]];
  const k: Vec3 = [w[0] / th, w[1] / th, w[2] / th];
  const K: Mat3 = [[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]];
  const KK = mul3(K, K);
  const s = Math.sin(th);
  const c = 1 - Math.cos(th);
  const r = (i: number): Vec3 => [0, 1, 2].map((j) => (i === j ? 1 : 0) + s * K[i][j] + c * KK[i][j]) as Vec3;
  return [r(0), r(1), r(2)];
}

// The scene keeps every rotation under 60°, so the near-π branch is not needed.
export function rotationVector(R: Mat3): Vec3 {
  const c = Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2));
  const th = Math.acos(c);
  if (th < 1e-9) return [0, 0, 0];
  const s = 2 * Math.sin(th);
  return [((R[2][1] - R[1][2]) / s) * th, ((R[0][2] - R[2][0]) / s) * th, ((R[1][0] - R[0][1]) / s) * th];
}

// ── projection: pinhole K + Brown–Conrady (OpenCV, k3 = 0) ───────────────

export function distort(xy: Vec2, i: Pick<Intrinsics, 'k1' | 'k2' | 'p1' | 'p2'>): Vec2 {
  const [x, y] = xy;
  const r2 = x * x + y * y;
  const rad = 1 + i.k1 * r2 + i.k2 * r2 * r2;
  return [
    x * rad + 2 * i.p1 * x * y + i.p2 * (r2 + 2 * x * x),
    y * rad + i.p1 * (r2 + 2 * y * y) + 2 * i.p2 * x * y,
  ];
}

export const toCamera = (X: Vec3, pose: { R: Mat3; t: Vec3 }): Vec3 => {
  const c = mv3(pose.R, X);
  return [c[0] + pose.t[0], c[1] + pose.t[1], c[2] + pose.t[2]];
};

export function project(X: Vec3, pose: { R: Mat3; t: Vec3 }, i: Intrinsics): { u: number; v: number; z: number } | null {
  const c = toCamera(X, pose);
  if (c[2] <= 1e-6) return null;
  const [xd, yd] = distort([c[0] / c[2], c[1] / c[2]], i);
  return { u: i.fx * xd + i.cx, v: i.fy * yd + i.cy, z: c[2] };
}

export const undistorted = (i: Intrinsics): Intrinsics => ({ ...i, k1: 0, k2: 0, p1: 0, p2: 0 });

// q = r² (normalised) at the farthest frame corner.
export function frameCornerQ(i: Intrinsics): number {
  const corners: Vec2[] = [[0, 0], [SENSOR.widthPx, 0], [0, SENSOR.heightPx], [SENSOR.widthPx, SENSOR.heightPx]];
  return Math.max(...corners.map(([u, v]) => ((u - i.cx) / i.fx) ** 2 + ((v - i.cy) / i.fy) ** 2));
}

// Smallest positive root of g(q) = dr_d/dr = 1 + 3k1·q + 5k2·q², or Infinity.
export function foldQ(i: Pick<Intrinsics, 'k1' | 'k2'>): number {
  const { k1, k2 } = i;
  if (Math.abs(k2) < 1e-15) return k1 < 0 ? -1 / (3 * k1) : Infinity;
  const a = 5 * k2;
  const b = 3 * k1;
  const disc = b * b - 4 * a;
  if (disc < 0) return Infinity;
  const roots = [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)].filter((q) => q > 0);
  return roots.length ? Math.min(...roots) : Infinity;
}

// Signed radial shift of the farthest frame corner; negative is barrel (inward).
export function frameCornerShiftPx(s: CameraScene): number {
  const i = intrinsicsOf(s);
  const q = frameCornerQ(i);
  return Math.sqrt(q) * i.fx * (s.k1 * q + s.k2 * q * q);
}

// Radial-only check (tangential terms ignored, and the UI says so): g > 0 at
// q = 0, at the frame corner, and at the vertex of g when that lies between.
// Under barrel distortion the frame is filled by rays BEYOND the pinhole corner,
// so a fold there still lands inside the image: the fold's peak image radius
// must also clear the frame corner (fx = fy, so normalised radii compare
// directly). f = 20 mm, k1 = −0.2 passes the g tests but peaks at 688 px, with
// the frame corner 865 px out.
export function distortionMonotonic(s: CameraScene): boolean {
  const I = intrinsicsOf(s);
  const q = frameCornerQ(I);
  const g = (x: number) => 1 + 3 * s.k1 * x + 5 * s.k2 * x * x;
  if (!(g(0) > 0) || !(g(q) > 0)) return false;
  if (s.k2 > 0) {
    const vertex = (-3 * s.k1) / (10 * s.k2);
    if (vertex > 0 && vertex < q && !(g(vertex) > 0)) return false;
  }
  const qf = foldQ(I);
  if (Number.isFinite(qf) && !(Math.sqrt(qf) * (1 + s.k1 * qf + s.k2 * qf * qf) > Math.sqrt(q))) return false;
  return true;
}

// ── the board ────────────────────────────────────────────────────────────

// 9×6 inner corners, row-major: index = 9j + i.
export function boardCorners(): Vec3[] {
  const { cols, rows, squareM: q } = BOARD;
  const out: Vec3[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) out.push([(i - (cols - 1) / 2) * q, (j - (rows - 1) / 2) * q, 0]);
  return out;
}

// The outer board is 10×7 squares; the 35 with (i + j) even are dark.
export const BOARD_HALF: Vec2 = [((BOARD.cols + 1) * BOARD.squareM) / 2, ((BOARD.rows + 1) * BOARD.squareM) / 2];

export function boardDarkSquares(): Vec3[][] {
  const q = BOARD.squareM;
  const out: Vec3[][] = [];
  for (let j = 0; j < BOARD.rows + 1; j++) {
    for (let i = 0; i < BOARD.cols + 1; i++) {
      if ((i + j) % 2) continue;
      const x = -BOARD_HALF[0] + i * q;
      const y = -BOARD_HALF[1] + j * q;
      out.push([[x, y, 0], [x + q, y, 0], [x + q, y + q, 0], [x, y + q, 0]]);
    }
  }
  return out;
}

// Distortion-free plane-to-image map: H = K[r1 r2 t]/t_z, so H33 = 1.
export function boardHomography(pose: Pick<Pose, 'R' | 't'>, i: Intrinsics): Mat3 {
  const { R, t } = pose;
  const M: Mat3 = [[R[0][0], R[0][1], t[0]], [R[1][0], R[1][1], t[1]], [R[2][0], R[2][1], t[2]]];
  const H = mul3(intrinsicMatrix(i), M);
  const s = H[2][2];
  return H.map((r) => r.map((v) => v / s)) as Mat3;
}

// ── optics: thin lens ────────────────────────────────────────────────────

export interface ThinLens {
  apertureMm: number;
  hyperfocalMm: number;
  nearMm: number;
  farMm: number; // may be Infinity
  dofMm: number;
  imageDistanceMm: number;
  breathing: number;
  blurMm(zMm: number): number;
  blurPx(zMm: number): number;
}

// Z is depth along the optical axis (Z_c), which is exactly the thin-lens object
// distance with the pinhole taken as the lens centre.
export function thinLens(s: CameraScene): ThinLens {
  const f = s.focalMm;
  const N = s.fNumber;
  const focus = s.focusM * 1000;
  const A = f / N;
  const H = (f * f) / (N * COC_MM) + f;
  const near = (focus * (H - f)) / (H + focus - 2 * f);
  const far = focus < H ? (focus * (H - f)) / (H - focus) : Infinity;
  const v = (f * focus) / (focus - f);
  const blurMm = (z: number) => ((A * Math.abs(z - focus)) / z) * (f / (focus - f));
  return {
    apertureMm: A,
    hyperfocalMm: H,
    nearMm: near,
    farMm: far,
    dofMm: far - near,
    imageDistanceMm: v,
    breathing: v / f,
    blurMm,
    blurPx: (z: number) => blurMm(z) / SENSOR.pitchMm,
  };
}

// ── stereo: a rectified pair ─────────────────────────────────────────────

export interface StereoRig {
  right: Pose;
  disparityPx(zM: number): number;
  depthSigmaM(zM: number): number;
  depthIntervalM(zM: number): [number, number];
  range1PctM: number;
}

// The right camera shares K and R, displaced B along the left camera's own x
// axis — so the pair is rectified by construction and v_L = v_R.
export function stereoRig(s: CameraScene): StereoRig {
  const left = orbitPose(s);
  const { fx } = intrinsicsOf(s);
  const B = s.baselineM;
  const sd = s.disparitySigmaPx;
  const xc = column(left.Rwc, 0);
  const C: Vec3 = [left.C[0] + B * xc[0], left.C[1] + B * xc[1], left.C[2] + B * xc[2]];
  const RC = mv3(left.R, C);
  const fB = fx * B;
  return {
    right: { R: left.R, t: [-RC[0], -RC[1], -RC[2]], C, Rwc: left.Rwc },
    disparityPx: (z) => fB / z,
    depthSigmaM: (z) => (z * z * sd) / fB,
    depthIntervalM: (z) => {
      const d = fB / z;
      return [fB / (d + sd), d > sd ? fB / (d - sd) : Infinity];
    },
    range1PctM: (0.01 * fB) / sd,
  };
}

// ── the single derivation every view reads ───────────────────────────────

export interface CornerState {
  index: number;
  X: Vec3;
  u: number;
  v: number;
  z: number;
  inFrame: boolean;
  blurPx: number;
  sharp: boolean;
  disparityPx: number;
  depthSigmaMm: number;
}

export interface ProjectionTrace {
  world: Vec3;
  camera: Vec3;
  normalized: Vec2;
  r2: number;
  distorted: Vec2;
  pixel: Vec2;
}

export interface SceneSummary {
  scene: CameraScene;
  intrinsics: Intrinsics;
  K: Mat3;
  pose: Pose;
  H: Mat3;
  rvec: Vec3;
  rvecDeg: number;
  corners: CornerState[];
  inFrame: number;
  sharp: number;
  zMin: number;
  zMax: number;
  lens: ThinLens;
  stereo: StereoRig;
  monotonic: boolean;
  cornerShiftPx: number;
  fov: { h: number; v: number };
  probe: ProjectionTrace;
  // The Extrinsics view through K alone: H has no distortion term, so the pixel
  // it prints and the corners it counts in frame must not have one either.
  pinhole: { probe: ProjectionTrace; inFrame: number };
}

const inFrameAt = (u: number, v: number) => u >= 0 && u <= SENSOR.widthPx && v >= 0 && v <= SENSOR.heightPx;

export function traceProjection(X: Vec3, pose: Pick<Pose, 'R' | 't'>, i: Intrinsics): ProjectionTrace {
  const camera = toCamera(X, pose);
  const normalized: Vec2 = [camera[0] / camera[2], camera[1] / camera[2]];
  const distorted = distort(normalized, i);
  return {
    world: X,
    camera,
    normalized,
    r2: normalized[0] ** 2 + normalized[1] ** 2,
    distorted,
    pixel: [i.fx * distorted[0] + i.cx, i.fy * distorted[1] + i.cy],
  };
}

export function summarizeScene(s: CameraScene): SceneSummary {
  const intrinsics = intrinsicsOf(s);
  const pose = orbitPose(s);
  const lens = thinLens(s);
  const stereo = stereoRig(s);
  const rvec = rotationVector(pose.R);
  const corners = boardCorners().map((X, index): CornerState => {
    const z = toCamera(X, pose)[2];
    const p = project(X, pose, intrinsics);
    const u = p ? p.u : NaN;
    const v = p ? p.v : NaN;
    const blurMm = lens.blurMm(z * 1000);
    return {
      index,
      X,
      u,
      v,
      z,
      inFrame: p !== null && inFrameAt(u, v),
      blurPx: blurMm / SENSOR.pitchMm,
      sharp: blurMm <= COC_MM,
      disparityPx: stereo.disparityPx(z),
      depthSigmaMm: stereo.depthSigmaM(z) * 1000,
    };
  });
  const zs = corners.map((c) => c.z);
  const ideal = undistorted(intrinsics);
  const pinholeInFrame = boardCorners().filter((X) => {
    const p = project(X, pose, ideal);
    return p !== null && inFrameAt(p.u, p.v);
  }).length;
  return {
    scene: s,
    intrinsics,
    K: intrinsicMatrix(intrinsics),
    pose,
    H: boardHomography(pose, intrinsics),
    rvec,
    rvecDeg: Math.hypot(...rvec) / D2R,
    corners,
    inFrame: corners.filter((c) => c.inFrame).length,
    sharp: corners.filter((c) => c.sharp).length,
    zMin: Math.min(...zs),
    zMax: Math.max(...zs),
    lens,
    stereo,
    monotonic: distortionMonotonic(s),
    cornerShiftPx: frameCornerShiftPx(s),
    fov: fieldOfViewDeg(s),
    probe: traceProjection(boardCorners()[NAMED_CORNERS[0].index], pose, intrinsics),
    pinhole: {
      probe: traceProjection(boardCorners()[NAMED_CORNERS[0].index], pose, ideal),
      inFrame: pinholeInFrame,
    },
  };
}

export function sharpCountAt(s: CameraScene, fNumber: number): number {
  const lens = thinLens({ ...s, fNumber });
  const pose = orbitPose(s);
  return boardCorners().filter((X) => lens.blurMm(toCamera(X, pose)[2] * 1000) <= COC_MM).length;
}

// ── outward: the world-event snapshot and the number format ──────────────

// CameraLabSnapshot keeps the retired four-calculator shape; this adapts to it.
export function toSnapshot(s: CameraScene, mode: CameraMode): CameraLabSnapshot {
  const i = intrinsicsOf(s);
  const { C } = orbitPose(s);
  return {
    mode,
    intrinsics: {
      imageWidthPx: SENSOR.widthPx,
      imageHeightPx: SENSOR.heightPx,
      focalLengthMm: s.focalMm,
      sensorWidthMm: SENSOR.widthMm,
      sensorHeightMm: SENSOR.heightMm,
      principalX: i.cx,
      principalY: i.cy,
      k1: s.k1,
      k2: s.k2,
    },
    extrinsics: { camera: C, yawDegrees: s.yawDeg, pitchDegrees: s.pitchDeg, rollDegrees: s.rollDeg, object: [0, 0, 0] },
    optics: { fNumber: s.fNumber, focalLengthMm: s.focalMm, objectDistanceMm: s.distanceM * 1000, focusDistanceMm: s.focusM * 1000 },
    stereo: { focalPx: i.fx, baselineMeters: s.baselineM, disparityPx: (i.fx * s.baselineM) / s.distanceM, referenceDepthMeters: s.distanceM },
  };
}

// Fixed decimals with a true minus (U+2212) and '∞'. A value that rounds to zero
// prints unsigned, so a readout never shows "−0.0".
export function fmt(n: number, digits: number): string {
  if (Number.isNaN(n)) return '—';
  if (n === Infinity) return '∞';
  if (n === -Infinity) return '−∞';
  const body = Math.abs(n).toFixed(digits);
  return n < 0 && /[1-9]/.test(body) ? `−${body}` : body;
}
