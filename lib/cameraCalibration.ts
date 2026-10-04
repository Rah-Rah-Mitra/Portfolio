import {
  BOARD,
  boardCorners,
  cross3,
  inv3,
  mul3,
  mv3,
  project,
  rodrigues,
  rotationVector,
  transpose3,
  type Intrinsics,
  type Mat3,
  type Vec2,
  type Vec3,
} from './cameraModel';

// Zhang (2000) on synthetic detections: one homography per view by normalised
// DLT, a closed-form K from the image of the absolute conic, then Levenberg–
// Marquardt over 8 intrinsics + 6 poses. Deterministic and seeded — the same
// "detections" on every visit and in every test. The known answers are pinned
// in tests/camera-calibration.test.ts; justify a moved number against an
// independent check (e.g. OpenCV calibrateCamera) before re-pinning it.
//
// The linear algebra is deliberately small: one cyclic-Jacobi symmetric eigen-
// solver, one Cholesky solve and inv3. Nothing else.
//
// This module is the solver alone. The six seeded views and their synthetic
// detections, which the Camera Lab draws in its prerendered thumbnails, are in
// lib/cameraCalibrationViews.ts (re-exported here), so components/workbench/
// CameraLab.tsx can import this file on the first Calibrate instead of shipping
// it in the entry chunk.

export * from './cameraCalibrationViews';
import type { SyntheticView } from './cameraCalibrationViews';

// ── linear algebra ───────────────────────────────────────────────────────

// Cyclic Jacobi. Values ascending; vectors[i] is the eigenvector of values[i].
export function symmetricEigen(input: number[][]): { values: number[]; vectors: number[][] } {
  const n = input.length;
  const A = input.map((r) => r.slice());
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    let diag = 0;
    for (let p = 0; p < n; p++) {
      diag += A[p][p] * A[p][p];
      for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    }
    if (off <= 1e-30 * diag) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (A[p][q] === 0) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; }
        for (let k = 0; k < n; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; }
        for (let k = 0; k < n; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
      }
    }
  }
  const vals = A.map((r, i) => r[i]);
  const order = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
  return { values: order.map((i) => vals[i]), vectors: order.map((i) => V.map((r) => r[i])) };
}

// Returns null when A is not (numerically) positive definite.
export function choleskySolve(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (!(s > 0)) return null;
        L[i][i] = Math.sqrt(s);
      } else L[i][j] = s / L[j][j];
    }
  }
  const y = new Array<number>(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}

// The right singular vector of the smallest singular value, via AᵀA.
const nullVector = (rows: number[][]): number[] => {
  const n = rows[0].length;
  const G = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const r of rows) for (let i = 0; i < n; i++) for (let j = i; j < n; j++) G[i][j] += r[i] * r[j];
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) G[i][j] = G[j][i];
  return symmetricEigen(G).vectors[0];
};

// ── geometry ─────────────────────────────────────────────────────────────

// Hartley conditioning: centroid to the origin, mean distance √2.
const conditioner = (pts: Vec2[]): Mat3 => {
  let mx = 0;
  let my = 0;
  pts.forEach(([x, y]) => { mx += x; my += y; });
  mx /= pts.length;
  my /= pts.length;
  let d = 0;
  pts.forEach(([x, y]) => { d += Math.hypot(x - mx, y - my); });
  const s = Math.SQRT2 / (d / pts.length);
  return [[s, 0, -s * mx], [0, s, -s * my], [0, 0, 1]];
};

export function homographyDLT(src: Vec2[], dst: Vec2[]): Mat3 {
  const Ts = conditioner(src);
  const Td = conditioner(dst);
  const rows: number[][] = [];
  for (let i = 0; i < src.length; i++) {
    const x = Ts[0][0] * src[i][0] + Ts[0][2];
    const y = Ts[1][1] * src[i][1] + Ts[1][2];
    const u = Td[0][0] * dst[i][0] + Td[0][2];
    const v = Td[1][1] * dst[i][1] + Td[1][2];
    rows.push([-x, -y, -1, 0, 0, 0, u * x, u * y, u], [0, 0, 0, -x, -y, -1, v * x, v * y, v]);
  }
  const h = nullVector(rows);
  const Hn: Mat3 = [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], h[8]]];
  const TdInv: Mat3 = [[1 / Td[0][0], 0, -Td[0][2] / Td[0][0]], [0, 1 / Td[1][1], -Td[1][2] / Td[1][1]], [0, 0, 1]];
  const H = mul3(TdInv, mul3(Hn, Ts));
  return H.map((r) => r.map((v) => v / H[2][2])) as Mat3;
}

export function zhangIntrinsics(
  Hs: Mat3[],
  opts: { zeroSkew?: boolean } = {},
): { fx: number; fy: number; cx: number; cy: number; skew: number } | null {
  const vij = (H: Mat3, i: number, j: number): number[] => {
    const a = [H[0][i], H[1][i], H[2][i]];
    const b = [H[0][j], H[1][j], H[2][j]];
    return [a[0] * b[0], a[0] * b[1] + a[1] * b[0], a[1] * b[1], a[2] * b[0] + a[0] * b[2], a[2] * b[1] + a[1] * b[2], a[2] * b[2]];
  };
  const rows: number[][] = [];
  for (const H of Hs) {
    rows.push(vij(H, 0, 1));
    const a = vij(H, 0, 0);
    const b = vij(H, 1, 1);
    rows.push(a.map((x, k) => x - b[k]));
  }
  const unit = rows.map((r) => {
    const n = Math.hypot(...r);
    return r.map((x) => x / n);
  });
  // Zero skew is imposed exactly: B12 leaves the unknowns and the null vector is
  // the 5-vector [B11, B22, B13, B23, B33]. (An extra [0 1 0 0 0 0] row would
  // only be one more least-squares equation, and leave a few px of skew in cx.)
  let conic: number[];
  if (opts.zeroSkew === false) conic = nullVector(unit);
  else {
    const v = nullVector(unit.map((r) => [r[0], r[2], r[3], r[4], r[5]]));
    conic = [v[0], 0, v[1], v[2], v[3], v[4]];
  }
  let [B11, B12, B22, B13, B23, B33] = conic;
  if (B11 < 0) [B11, B12, B22, B13, B23, B33] = [-B11, -B12, -B22, -B13, -B23, -B33];
  const den = B11 * B22 - B12 * B12;
  if (!(den > 0)) return null;
  const cy = (B12 * B13 - B11 * B23) / den;
  const lam = B33 - (B13 * B13 + cy * (B12 * B13 - B11 * B23)) / B11;
  if (!(lam / B11 > 0)) return null;
  const fx = Math.sqrt(lam / B11);
  const fy = Math.sqrt((lam * B11) / den);
  const skew = B12 ? (-B12 * fx * fx * fy) / lam : 0;
  // fy (β) here, not fx (α): the paper's appendix prints α, which is a typo.
  const cx = (skew * cy) / fy - (B13 * fx * fx) / lam;
  return { fx, fy, cx, cy, skew };
}

export function poseFromHomography(H: Mat3, K: Mat3): { R: Mat3; t: Vec3 } {
  const Ki = inv3(K);
  const col = (j: number) => mv3(Ki, [H[0][j], H[1][j], H[2][j]]);
  const h1 = col(0);
  const h2 = col(1);
  const h3 = col(2);
  let lam = 1 / Math.hypot(...h1);
  if (h3[2] * lam < 0) lam = -lam; // the board is in front of the camera
  const scale = (v: Vec3): Vec3 => [v[0] * lam, v[1] * lam, v[2] * lam];
  const r1 = scale(h1);
  const r2 = scale(h2);
  const r3 = cross3(r1, r2);
  const Q: Mat3 = [[r1[0], r2[0], r3[0]], [r1[1], r2[1], r3[1]], [r1[2], r2[2], r3[2]]];
  // Nearest rotation: R = Q(QᵀQ)^(−1/2).
  const { values, vectors } = symmetricEigen(mul3(transpose3(Q), Q));
  const V = transpose3(vectors as Mat3); // columns = eigenvectors
  const D: Mat3 = [[1 / Math.sqrt(values[0]), 0, 0], [0, 1 / Math.sqrt(values[1]), 0], [0, 0, 1 / Math.sqrt(values[2])]];
  return { R: mul3(Q, mul3(V, mul3(D, transpose3(V)))), t: scale(h3) };
}

// ── the solver ───────────────────────────────────────────────────────────

export type CalibrationResult =
  | {
      ok: true;
      views: number;
      points: number;
      closedForm: { fx: number; fy: number; cx: number; cy: number; skew: number };
      closedRms: number;
      estimate: Intrinsics;
      stdErr: Intrinsics;
      rms: number;
      iterations: number;
      residuals: Vec2[];
    }
  | { ok: false; reason: string };

const INTRINSIC_KEYS = ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2'] as const;
const toIntrinsics = (q: number[]): Intrinsics =>
  Object.fromEntries(INTRINSIC_KEYS.map((key, k) => [key, q[k]])) as unknown as Intrinsics;

// A point that ends up behind a trial pose costs this much per axis, so the
// step is rejected rather than thrown on.
const BEHIND_PX = 1e6;

export function calibrate(views: Array<SyntheticView | null>, opts: { maxIter?: number } = {}): CalibrationResult {
  const maxIter = opts.maxIter ?? 30;
  const used = views.filter((v): v is SyntheticView => v !== null);
  if (used.length < 3) return { ok: false, reason: 'fewer than 3 usable views' };
  const P = boardCorners();
  const plane = P.map(([x, y]): Vec2 => [x, y]);
  const Hs = used.map((v) => homographyDLT(plane, v.points));
  const k0 = zhangIntrinsics(Hs);
  if (!k0) return { ok: false, reason: 'the closed form found no positive-definite conic' };
  const K0: Mat3 = [[k0.fx, 0, k0.cx], [0, k0.fy, k0.cy], [0, 0, 1]];

  // p = [fx, fy, cx, cy, k1, k2, p1, p2, (ω_i, t_i)×views]; distortion starts at 0.
  let p = [k0.fx, k0.fy, k0.cx, k0.cy, 0, 0, 0, 0];
  for (const H of Hs) {
    const { R, t } = poseFromHomography(H, K0);
    p.push(...rotationVector(R), ...t);
  }

  const residuals = (q: number[]): number[] => {
    const I = toIntrinsics(q);
    const out: number[] = [];
    used.forEach((v, vi) => {
      const o = 8 + 6 * vi;
      const pose = { R: rodrigues([q[o], q[o + 1], q[o + 2]]), t: [q[o + 3], q[o + 4], q[o + 5]] as Vec3 };
      P.forEach((X, i) => {
        const pr = project(X, pose, I);
        if (!pr) out.push(BEHIND_PX, BEHIND_PX);
        else out.push(pr.u - v.points[i][0], pr.v - v.points[i][1]);
      });
    });
    return out;
  };
  const sumSq = (r: number[]) => r.reduce((s, x) => s + x * x, 0);

  // Forward-difference Jacobian, accumulated straight into JᵀJ and Jᵀr.
  const normal = (q: number[], r: number[]) => {
    const n = q.length;
    const m = r.length;
    const J: number[][] = [];
    for (let j = 0; j < n; j++) {
      const h = 1e-6 * Math.max(1, Math.abs(q[j]));
      const qq = q.slice();
      qq[j] += h;
      const rr = residuals(qq);
      J.push(rr.map((x, i) => (x - r[i]) / h));
    }
    const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const g = new Array<number>(n).fill(0);
    for (let a = 0; a < n; a++) {
      for (let i = 0; i < m; i++) g[a] += J[a][i] * r[i];
      for (let b = a; b < n; b++) {
        let s = 0;
        for (let i = 0; i < m; i++) s += J[a][i] * J[b][i];
        A[a][b] = s;
        A[b][a] = s;
      }
    }
    return { A, g };
  };

  let r = residuals(p);
  let cost = sumSq(r);
  const closedRms = Math.sqrt(cost / (r.length / 2));
  let mu = 1e-3;
  let iterations = 0;
  for (; iterations < maxIter; iterations++) {
    const { A, g } = normal(p, r);
    let accepted = false;
    let converged = false;
    for (let tries = 0; tries < 10 && !accepted; tries++) {
      // (JᵀJ + μ·diag JᵀJ)δ = −Jᵀr
      const step = choleskySolve(A.map((row, i) => row.map((x, j) => (i === j ? x * (1 + mu) : x))), g.map((x) => -x));
      if (!step) { mu *= 10; continue; }
      const q = p.map((x, i) => x + step[i]);
      const rq = residuals(q);
      const cq = sumSq(rq);
      if (cq < cost) {
        converged = cost - cq <= 1e-10 * cost;
        p = q;
        r = rq;
        cost = cq;
        mu = Math.max(mu / 10, 1e-12);
        accepted = true;
      } else mu *= 10;
    }
    if (!accepted || converged) { iterations++; break; }
  }

  // ±1σ from σ̂²(JᵀJ)⁻¹ at the solution, for the 8 intrinsics.
  const { A } = normal(p, r);
  const s2 = cost / (r.length - p.length);
  const se = INTRINSIC_KEYS.map((_, k) => {
    const e = new Array<number>(p.length).fill(0);
    e[k] = 1;
    const x = choleskySolve(A, e);
    return x ? Math.sqrt(s2 * x[k]) : NaN;
  });
  const residualPairs: Vec2[] = [];
  for (let i = 0; i < r.length; i += 2) residualPairs.push([r[i], r[i + 1]]);
  return {
    ok: true,
    views: used.length,
    points: used.length * P.length,
    closedForm: k0,
    closedRms,
    estimate: toIntrinsics(p),
    stdErr: toIntrinsics(se),
    // OpenCV's RMS: √(Σ|e|²/N_points), ≈ σ√2 for isotropic noise.
    rms: Math.sqrt(cost / (r.length / 2)),
    iterations,
    residuals: residualPairs,
  };
}

export const BOARD_POINTS = BOARD.cols * BOARD.rows;
