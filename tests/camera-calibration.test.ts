import { describe, expect, it } from 'vitest';
import {
  CAL_VIEWS,
  calibrate,
  choleskySolve,
  gaussian,
  homographyDLT,
  mulberry32,
  poseFromHomography,
  symmetricEigen,
  synthesizeViews,
  zhangIntrinsics,
} from '../lib/cameraCalibration';
import {
  DEFAULT_SCENE,
  boardCorners,
  boardHomography,
  intrinsicMatrix,
  intrinsicsOf,
  mul3,
  orbitPose,
  project,
  type CameraScene,
  type Mat3,
  type Vec2,
} from '../lib/cameraModel';

// Zhang's method on seeded synthetic detections. The PRNG, view-geometry and
// noiseless results are pinned exactly; the noisy fit is held to its own ±3σ,
// because that is the claim the lab's table makes.

const D = DEFAULT_SCENE;
const scene = (patch: Partial<CameraScene>): CameraScene => ({ ...D, ...patch });
const plane = boardCorners().map(([x, y]): Vec2 => [x, y]);

describe('calibration — deterministic noise', () => {
  it('reproduces the mulberry32 stream and its first gaussian', () => {
    const rand = mulberry32(4277);
    expect(rand()).toBe(0.29766421020030975);
    expect(rand()).toBe(0.16956413793377578);
    expect(rand()).toBe(0.7318336262833327);
    expect(gaussian(mulberry32(4277))).toBeCloseTo(0.7537199707516087, 12);
  });
});

describe('calibration — linear algebra', () => {
  const reconstructs = (A: number[][]) => {
    const { values, vectors } = symmetricEigen(A);
    const n = A.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let a = 0;
        let dot = 0;
        for (let k = 0; k < n; k++) {
          a += vectors[k][i] * values[k] * vectors[k][j];
          dot += vectors[i][k] * vectors[j][k];
        }
        expect(Math.abs(a - A[i][j])).toBeLessThan(1e-12 * Math.max(1, Math.abs(A[i][j])));
        expect(Math.abs(dot - (i === j ? 1 : 0))).toBeLessThan(1e-12);
      }
    }
    return values;
  };

  it('diagonalises a symmetric matrix by Jacobi sweeps', () => {
    const values = reconstructs([[2, 1, 0], [1, 2, 0], [0, 0, 3]]);
    [1, 3, 3].forEach((v, i) => expect(values[i]).toBeCloseTo(v, 12));
    // A fixed 9×9 SPD matrix: MᵀM + I from a seeded M.
    const rand = mulberry32(9);
    const M = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => rand() - 0.5));
    const A = M.map((_, i) => M.map((__, j) => M.reduce((s, row) => s + row[i] * row[j], 0) + (i === j ? 1 : 0)));
    const spd = reconstructs(A);
    expect(spd[0]).toBeGreaterThan(0);
    expect(spd).toEqual([...spd].sort((a, b) => a - b));
  });

  it('solves SPD systems and refuses indefinite ones', () => {
    const x = choleskySolve([[4, 2], [2, 3]], [2, 1])!;
    expect(x[0]).toBeCloseTo(0.5, 12);
    expect(x[1]).toBeCloseTo(0, 12);
    expect(choleskySolve([[1, 2], [2, 1]], [1, 1])).toBeNull();
  });
});

describe('calibration — geometry', () => {
  const pose = orbitPose(D);
  const I = intrinsicsOf(D);
  const H = boardHomography(pose, I);

  it('recovers the board homography by normalised DLT', () => {
    const I0 = { ...I, k1: 0 };
    const dst = boardCorners().map((X): Vec2 => {
      const p = project(X, pose, I0)!;
      return [p.u, p.v];
    });
    const got = homographyDLT(plane, dst);
    got.forEach((r, i) => r.forEach((v, j) => expect(Math.abs(v - H[i][j])).toBeLessThan(1e-8 * Math.max(1, Math.abs(H[i][j])))));
  });

  it('recovers R and t from H and K', () => {
    const { R, t } = poseFromHomography(H, intrinsicMatrix(I));
    R.forEach((r, i) => r.forEach((v, j) => expect(Math.abs(v - pose.R[i][j])).toBeLessThan(1e-9)));
    t.forEach((v, i) => expect(Math.abs(v - pose.t[i])).toBeLessThan(1e-9));
    const det = R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
    expect(det).toBeCloseTo(1, 12);
  });
});

describe('calibration — synthetic views', () => {
  it('fits six views in frame at their nominal distances', () => {
    const views = synthesizeViews(D, { noisePx: 0 });
    expect(views.every(Boolean)).toBe(true);
    expect(views.map((v) => v!.distanceM)).toEqual([0.62, 0.62, 0.62, 0.62, 0.58, 0.66]);
    for (const v of views) {
      for (const [u, w] of v!.points) {
        expect(u).toBeGreaterThanOrEqual(8);
        expect(u).toBeLessThanOrEqual(1432);
        expect(w).toBeGreaterThanOrEqual(8);
        expect(w).toBeLessThanOrEqual(952);
      }
    }
    expect(views[0]!.points[0][0]).toBeCloseTo(151.4596, 4);
    expect(views[0]!.points[0][1]).toBeCloseTo(156.7962, 4);
  });

  it('pins the noise draw order', () => {
    const p = synthesizeViews(D, { noisePx: 0.2 })[0]!.points[0];
    expect(p[0]).toBeCloseTo(151.610304, 6);
    expect(p[1]).toBeCloseTo(156.91321, 6);
  });
});

describe('calibration — closed form', () => {
  it('is exact without distortion and biased with it', () => {
    const exact = calibrate(synthesizeViews(scene({ k1: 0 }), { noisePx: 0 }));
    expect(exact.ok).toBe(true);
    if (exact.ok) {
      expect(Math.abs(exact.closedForm.fx - 1400)).toBeLessThan(1e-6);
      expect(Math.abs(exact.closedForm.fy - 1400)).toBeLessThan(1e-6);
      expect(Math.abs(exact.closedForm.cx - 720)).toBeLessThan(1e-6);
      expect(Math.abs(exact.closedForm.cy - 480)).toBeLessThan(1e-6);
    }
    // k1 = −0.08 bends the "plane": the conic is fitted to the wrong homographies.
    const Hs = synthesizeViews(D, { noisePx: 0 }).map((v) => homographyDLT(plane, v!.points));
    const biased = zhangIntrinsics(Hs)!;
    expect(Math.abs(biased.fx - 1400)).toBeGreaterThan(10);
    // Hard B12 = 0 solve; numpy's SVD of the same 5-column system, and a Cholesky
    // of the recovered B, both give 1418.3914. (The old soft row gave 1418.766.)
    expect(biased.fx).toBeCloseTo(1418.391, 3);
  });

  it('imposes zero skew exactly, not as one more least-squares row', () => {
    // A wide, strongly distorted lens is where a soft [0 1 0 0 0 0] row leaks:
    // it left skew −6.70 px, folded into cx (705.03 instead of 707.84).
    const s = scene({ focalMm: 20, k1: 0.3, k2: 0.1 });
    const Hs = synthesizeViews(s, { noisePx: 0 }).map((v) => homographyDLT(plane, v!.points));
    const k = zhangIntrinsics(Hs)!;
    expect(k.skew).toBe(0);
    expect(k.fx).toBeCloseTo(696.596, 3);
    expect(k.fy).toBeCloseTo(744.041, 3);
    expect(k.cx).toBeCloseTo(707.835, 3);
    expect(k.cy).toBeCloseTo(502.469, 3);
  });

  it('solves skew and uses β (not the appendix’s α) for cx', () => {
    const Kt: Mat3 = [[1700, 30, 610], [0, 1650, 390], [0, 0, 1]];
    const Hs = CAL_VIEWS.map((v) => {
      const p = orbitPose(v, [v.aim[0], v.aim[1], 0]);
      return mul3(Kt, [[p.R[0][0], p.R[0][1], p.t[0]], [p.R[1][0], p.R[1][1], p.t[1]], [p.R[2][0], p.R[2][1], p.t[2]]]);
    });
    const k = zhangIntrinsics(Hs, { zeroSkew: false })!;
    expect(Math.abs(k.fx - 1700)).toBeLessThan(1e-6);
    expect(Math.abs(k.fy - 1650)).toBeLessThan(1e-6);
    expect(Math.abs(k.skew - 30)).toBeLessThan(1e-6);
    expect(Math.abs(k.cx - 610)).toBeLessThan(1e-6);
    expect(Math.abs(k.cy - 390)).toBeLessThan(1e-6);
  });
});

describe('calibration — Levenberg–Marquardt', () => {
  it('recovers every intrinsic from noiseless detections', () => {
    const cal = calibrate(synthesizeViews(D, { noisePx: 0 }));
    expect(cal.ok).toBe(true);
    if (!cal.ok) return;
    expect(Math.abs(cal.estimate.fx - 1400)).toBeLessThan(1e-6);
    expect(Math.abs(cal.estimate.fy - 1400)).toBeLessThan(1e-6);
    expect(Math.abs(cal.estimate.cx - 720)).toBeLessThan(1e-6);
    expect(Math.abs(cal.estimate.cy - 480)).toBeLessThan(1e-6);
    expect(Math.abs(cal.estimate.k1 + 0.08)).toBeLessThan(1e-6);
    expect(Math.abs(cal.estimate.k2)).toBeLessThan(1e-9);
    expect(Math.abs(cal.estimate.p1)).toBeLessThan(1e-9);
    expect(Math.abs(cal.estimate.p2)).toBeLessThan(1e-9);
    expect(cal.rms).toBeLessThan(1e-8);
    expect(cal.iterations).toBeLessThanOrEqual(30);
  });

  it('lands within 3σ of the truth with 0.2 px noise', () => {
    const cal = calibrate(synthesizeViews(D, { noisePx: 0.2 }));
    expect(cal.ok).toBe(true);
    if (!cal.ok) return;
    expect(cal.views).toBe(6);
    expect(cal.points).toBe(324);
    expect(cal.residuals).toHaveLength(324);
    expect(cal.rms).toBeGreaterThan(0.26);
    expect(cal.rms).toBeLessThan(0.31);
    expect(cal.closedRms).toBeGreaterThan(1);
    const truth = intrinsicsOf(D);
    for (const key of ['fx', 'fy', 'cx', 'cy', 'k1', 'k2'] as const) {
      expect(Math.abs(cal.estimate[key] - truth[key])).toBeLessThan(3 * cal.stdErr[key]);
    }
    expect(cal.estimate.fx).toBeCloseTo(1400.34, 2);
    expect(cal.estimate.cx).toBeCloseTo(719.18, 2);
    expect(cal.estimate.k1).toBeCloseTo(-0.0802, 4);
    expect(cal.stdErr.fx).toBeCloseTo(0.95, 1);
  });

  it('still fits a wide, strongly pincushioned, off-centre lens', () => {
    const s = scene({ focalMm: 20, k1: 0.3, k2: 0.1, cxOffsetPx: 40, cyOffsetPx: -20 });
    const views = synthesizeViews(s);
    views.forEach((v) => expect(v!.distanceM).toBeGreaterThan(0.39));
    const cal = calibrate(views);
    expect(cal.ok).toBe(true);
    if (!cal.ok) return;
    expect(Math.abs(cal.estimate.fx - 800)).toBeLessThan(1.5);
    expect(cal.iterations).toBeLessThanOrEqual(30);
  });

  it('refuses fewer than three views, and is deterministic', () => {
    const views = synthesizeViews(D);
    expect(calibrate([views[0], views[1], null, null, null, null]).ok).toBe(false);
    expect(calibrate(views)).toEqual(calibrate(views));
  });
});
