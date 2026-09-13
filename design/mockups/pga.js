// pga.js — 2D Projective Geometric Algebra, P(R*_{2,0,1}).
// Basis blades keyed by bitmask over (e0,e1,e2) -> bits 1,2,4:
//   0:1  1:e0  2:e1  4:e2  3:e01  5:e02  6:e12  7:e012
// Metric: e0^2 = 0, e1^2 = e2^2 = +1.
// Conventions used throughout the asset library:
//   point (x,y) = e12 + x·e02 - y·e01      (w = e12 coefficient)
//   line  ax+by+c=0 = a·e1 + b·e2 + c·e0
//   rotor about P by θ = cos(θ/2) - sin(θ/2)·P̂   (θ>0 = CCW in maths axes)
//   translator by (dx,dy) = 1 + (dx/2)·e01 + (dy/2)·e02
//     (a translation IS a rotation about the ideal point perpendicular to it)
// Coordinates are canvas coordinates: x right, y DOWN, so positive θ reads
// clockwise on screen. Every mechanism below places its parts with motors.

export const TAU = Math.PI * 2;
export const pol = (c, r, a) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
export const lerp = (a, b, t) => a + (b - a) * t;
export const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const norm = (v) => { const n = Math.hypot(v[0], v[1]) || 1; return [v[0] / n, v[1] / n]; };
export const perpv = (v) => [-v[1], v[0]];

const pc = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);

// Geometric product table: T[a][b] = {m: resulting blade, s: sign} or null (annihilates).
const T = (() => {
  const t = [];
  for (let a = 0; a < 8; a++) {
    t[a] = [];
    for (let b = 0; b < 8; b++) {
      if (a & b & 1) { t[a][b] = null; continue; }   // e0^2 = 0
      let s = 1;
      for (let i = 0; i < 3; i++) {
        if (!((b >> i) & 1)) continue;
        let c = 0;
        for (let j = i + 1; j < 3; j++) if ((a >> j) & 1) c++;
        if (c & 1) s = -s;
      }
      t[a][b] = { m: a ^ b, s };
    }
  }
  return t;
})();

export function gp(A, B) {
  const R = new Float64Array(8);
  for (let a = 0; a < 8; a++) {
    const va = A[a]; if (!va) continue;
    const Ta = T[a];
    for (let b = 0; b < 8; b++) {
      const vb = B[b]; if (!vb) continue;
      const e = Ta[b]; if (!e) continue;
      R[e.m] += e.s * va * vb;
    }
  }
  return R;
}

export function rev(A) {
  const R = new Float64Array(8);
  for (let a = 0; a < 8; a++) { const k = pc(a); R[a] = (((k * (k - 1)) / 2) & 1) ? -A[a] : A[a]; }
  return R;
}

export function P(x, y) { const m = new Float64Array(8); m[6] = 1; m[5] = x; m[3] = -y; return m; }
export function xy(Q) { const w = Q[6] || 1e-9; return [Q[5] / w, -Q[3] / w]; }
export function idealP(dx, dy) { const m = new Float64Array(8); m[5] = dx; m[3] = -dy; return m; }
export function L(a, b, c) { const m = new Float64Array(8); m[2] = a; m[4] = b; m[1] = c; return m; }

export function Rot(cx, cy, th) {
  const c = Math.cos(th / 2), s = Math.sin(th / 2), m = new Float64Array(8);
  m[0] = c; m[6] = -s; m[5] = -s * cx; m[3] = s * cy;
  return m;
}
export function Tr(dx, dy) { const m = new Float64Array(8); m[0] = 1; m[3] = dx / 2; m[5] = dy / 2; return m; }
export function Mul(...ms) { return ms.reduce((a, b) => gp(a, b)); }
export function Mot(cx, cy, th, tx = 0, ty = 0) { return gp(Tr(tx, ty), Rot(cx, cy, th)); }

// Sandwich: M p M~ — the one operation that moves every part of every mechanism.
export function Ap(M, p) { return xy(gp(gp(M, P(p[0], p[1])), rev(M))); }
export function ApAll(M, pts) { return pts.map((p) => Ap(M, p)); }

// Normalised motor interpolation (motor "slerp" — the geodesic between two poses).
export function Slerp(A, B, t) {
  const R = new Float64Array(8);
  let dot = A[0] * B[0] + A[6] * B[6], sgn = dot < 0 ? -1 : 1;
  for (let i = 0; i < 8; i++) R[i] = A[i] * (1 - t) + sgn * B[i] * t;
  const n = Math.hypot(R[0], R[6]) || 1;
  for (let i = 0; i < 8; i++) R[i] /= n;
  return R;
}

// join / meet, in closed coefficient form.
export function Join(p, q) { return L(p[1] - q[1], q[0] - p[0], p[0] * q[1] - q[0] * p[1]); }
export function Meet(l, m) {
  const d = l[2] * m[4] - m[2] * l[4];
  if (Math.abs(d) < 1e-12) return null;
  return [(l[4] * m[1] - m[4] * l[1]) / d, (l[1] * m[2] - m[1] * l[2]) / d];
}
export function Perp(l, p) { return L(-l[4], l[2], l[4] * p[0] - l[2] * p[1]); }
export function Foot(l, p) { return Meet(l, Perp(l, p)); }
export function distPL(l, p) { return Math.abs(l[2] * p[0] + l[4] * p[1] + l[1]) / (Math.hypot(l[2], l[4]) || 1); }

// Circle ∩ circle, built as radical line ∧ centre line then offset along the
// radical direction. Clamps (h -> 0) instead of returning NaN when the dyad is
// unreachable, so a driven linkage degrades gracefully at its limits.
export function CC(c1, r1, c2, r2, s = 1) {
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1];
  let d = Math.hypot(dx, dy) || 1e-9;
  const a = (d * d + r1 * r1 - r2 * r2) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const ux = dx / d, uy = dy / d;
  return [c1[0] + a * ux - s * h * uy, c1[1] + a * uy + s * h * ux];
}
// Line ∩ circle (nearest / farthest along the line direction).
export function LC(a, b, c, r, s = 1) {
  const u = norm([b[0] - a[0], b[1] - a[1]]);
  const f = [a[0] - c[0], a[1] - c[1]];
  const B = 2 * (f[0] * u[0] + f[1] * u[1]);
  const C = f[0] * f[0] + f[1] * f[1] - r * r;
  const disc = Math.max(0, B * B - 4 * C);
  const t = (-B + s * Math.sqrt(disc)) / 2;
  return [a[0] + u[0] * t, a[1] + u[1] * t];
}
// Tangent point on a circle from an external point (PGA: meet of the circle
// with the circle on diameter [c,p] — here in closed form).
export function Tan(c, r, p, s = 1) {
  const d = Math.max(r + 0.001, dist(c, p));
  const a = Math.acos(clamp(r / d, -1, 1));
  return pol(c, r, ang(c, p) + s * a);
}
// Rolling-contact phase: how far a wheel of radius r has rotated after travelling s.
export const roll = (s, r) => s / r;
