import {
  SENSOR,
  boardCorners,
  intrinsicsOf,
  orbitPose,
  project,
  type CameraScene,
  type Pose,
  type Vec2,
} from './cameraModel';

// The render-time half of the Zhang calibration (FIG. 06b): six seeded views of
// the board and their synthetic detections. The Camera Lab draws these as
// thumbnails in the prerender, so they ship with the page; the solver that
// consumes them is lib/cameraCalibration.ts, fetched on the first Calibrate.
// Deterministic and seeded — the same "detections" on every visit and in every
// test (tests/camera-calibration.test.ts pins them).

export const CALIBRATION_SEED = 4277;
export const DEFAULT_NOISE_PX = 0.2;
export const NOISE_RANGE = { min: 0, max: 1, step: 0.05 } as const;

export interface CalibrationView {
  distanceM: number;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  aim: Vec2;
}

// Six tilted views spread over the board — enough independent homographies for
// the absolute conic, and enough corner radius to pin k1.
export const CAL_VIEWS: readonly CalibrationView[] = [
  { distanceM: 0.62, yawDeg: -28, pitchDeg: 12, rollDeg: 6, aim: [0.12, 0.05] },
  { distanceM: 0.62, yawDeg: 28, pitchDeg: 12, rollDeg: -6, aim: [-0.12, 0.05] },
  { distanceM: 0.62, yawDeg: -24, pitchDeg: -14, rollDeg: -8, aim: [0.12, -0.05] },
  { distanceM: 0.62, yawDeg: 24, pitchDeg: -14, rollDeg: 8, aim: [-0.12, -0.05] },
  { distanceM: 0.58, yawDeg: 6, pitchDeg: 32, rollDeg: 14, aim: [0, 0] },
  { distanceM: 0.66, yawDeg: -34, pitchDeg: -6, rollDeg: -16, aim: [0, 0] },
];

// ── deterministic noise ──────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box–Muller, cosine branch only — one draw pair per sample keeps the stream
// order trivially reproducible.
export function gaussian(rand: () => number): number {
  let u = 0;
  while (u <= 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── synthetic detections ─────────────────────────────────────────────────

export interface SyntheticView {
  pose: Pose;
  distanceM: number;
  points: Vec2[];
}

const MARGIN_PX = 8;

// Each view starts at its nominal distance scaled with focal length, then backs
// off ×1.06 until all 54 corners sit 8 px inside the frame (12 tries). Noise is
// drawn after the fit, in a fixed order — views, corners row-major, u then v —
// and a rejected view draws nothing, so the stream never shifts.
export function synthesizeViews(
  s: CameraScene,
  opts: { noisePx?: number; seed?: number } = {},
): Array<SyntheticView | null> {
  const noisePx = opts.noisePx ?? DEFAULT_NOISE_PX;
  const I = intrinsicsOf(s);
  const P = boardCorners();
  const rand = mulberry32(opts.seed ?? CALIBRATION_SEED);
  const inside = (o: { u: number; v: number } | null) =>
    o !== null && o.u >= MARGIN_PX && o.u <= SENSOR.widthPx - MARGIN_PX && o.v >= MARGIN_PX && o.v <= SENSOR.heightPx - MARGIN_PX;
  return CAL_VIEWS.map((view) => {
    let d = (view.distanceM * s.focalMm) / 35;
    for (let step = 0; step < 12; step++, d *= 1.06) {
      const pose = orbitPose({ ...view, distanceM: d }, [view.aim[0], view.aim[1], 0]);
      const ideal = P.map((X) => project(X, pose, I));
      if (!ideal.every(inside)) continue;
      return {
        pose,
        distanceM: d,
        points: ideal.map((o): Vec2 => {
          const { u, v } = o as { u: number; v: number };
          const du = noisePx * gaussian(rand);
          const dv = noisePx * gaussian(rand);
          return [u + du, v + dv];
        }),
      };
    }
    return null;
  });
}
