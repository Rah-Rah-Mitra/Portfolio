// pga.ts — 2D Projective Geometric Algebra, P(R*_{2,0,1}).
// Ported from design/mockups/pga.js (the 2026-09 Industry design-system drop),
// trimmed to what the six mechanisms in lib/pgaMechanisms.ts actually use. The
// mockup file stays the reference copy; the exports dropped here (perpv, idealP,
// ApAll, distPL, Meet, Perp, Foot, LC, Tan, roll) are two-liners, re-portable
// from it if a later mechanism needs them.
//
// Basis blades keyed by bitmask over (e0,e1,e2) -> bits 1,2,4:
//   0:1  1:e0  2:e1  4:e2  3:e01  5:e02  6:e12  7:e012
// Metric: e0^2 = 0, e1^2 = e2^2 = +1.
//   point (x,y) = e12 + x·e02 - y·e01      (w = e12 coefficient)
//   line  ax+by+c=0 = a·e1 + b·e2 + c·e0
//   rotor about P by θ = cos(θ/2) - sin(θ/2)·P̂   (θ>0 = CCW in maths axes)
//   translator by (dx,dy) = 1 + (dx/2)·e01 + (dy/2)·e02
// Coordinates are canvas coordinates: x right, y DOWN, so positive θ reads
// clockwise on screen.

export type Pt = [number, number];
export type MV = Float64Array;

export const TAU = Math.PI * 2;
export const pol = (c: Pt, r: number, a: number): Pt => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const mix = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const ang = (a: Pt, b: Pt) => Math.atan2(b[1] - a[1], b[0] - a[0]);
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const norm = (v: Pt): Pt => { const n = Math.hypot(v[0], v[1]) || 1; return [v[0] / n, v[1] / n]; };

const pc = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);

// Geometric product table: T[a][b] = {m: resulting blade, s: sign} or null (annihilates).
const T: ({ m: number; s: number } | null)[][] = (() => {
  const t: ({ m: number; s: number } | null)[][] = [];
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

export function gp(A: MV, B: MV): MV {
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

export function rev(A: MV): MV {
  const R = new Float64Array(8);
  for (let a = 0; a < 8; a++) { const k = pc(a); R[a] = (((k * (k - 1)) / 2) & 1) ? -A[a] : A[a]; }
  return R;
}

export function P(x: number, y: number): MV { const m = new Float64Array(8); m[6] = 1; m[5] = x; m[3] = -y; return m; }
export function xy(Q: MV): Pt { const w = Q[6] || 1e-9; return [Q[5] / w, -Q[3] / w]; }
export function L(a: number, b: number, c: number): MV { const m = new Float64Array(8); m[2] = a; m[4] = b; m[1] = c; return m; }

export function Rot(cx: number, cy: number, th: number): MV {
  const c = Math.cos(th / 2), s = Math.sin(th / 2), m = new Float64Array(8);
  m[0] = c; m[6] = -s; m[5] = -s * cx; m[3] = s * cy;
  return m;
}
export function Tr(dx: number, dy: number): MV { const m = new Float64Array(8); m[0] = 1; m[3] = dx / 2; m[5] = dy / 2; return m; }
export function Mul(...ms: MV[]): MV { return ms.reduce((a, b) => gp(a, b)); }
export function Mot(cx: number, cy: number, th: number, tx = 0, ty = 0): MV { return gp(Tr(tx, ty), Rot(cx, cy, th)); }

// Sandwich: M p M~ — the one operation that moves every part of every mechanism.
export function Ap(M: MV, p: Pt): Pt { return xy(gp(gp(M, P(p[0], p[1])), rev(M))); }

// Normalised motor interpolation (motor "slerp" — the geodesic between two poses).
export function Slerp(A: MV, B: MV, t: number): MV {
  const R = new Float64Array(8);
  const dot = A[0] * B[0] + A[6] * B[6], sgn = dot < 0 ? -1 : 1;
  for (let i = 0; i < 8; i++) R[i] = A[i] * (1 - t) + sgn * B[i] * t;
  const n = Math.hypot(R[0], R[6]) || 1;
  for (let i = 0; i < 8; i++) R[i] /= n;
  return R;
}

// join, in closed coefficient form.
export function Join(p: Pt, q: Pt): MV { return L(p[1] - q[1], q[0] - p[0], p[0] * q[1] - q[0] * p[1]); }

// Circle ∩ circle, built as radical line ∧ centre line then offset along the
// radical direction. Clamps (h -> 0) instead of returning NaN when the dyad is
// unreachable, so a driven linkage degrades gracefully at its limits.
export function CC(c1: Pt, r1: number, c2: Pt, r2: number, s = 1): Pt {
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1];
  const d = Math.hypot(dx, dy) || 1e-9;
  const a = (d * d + r1 * r1 - r2 * r2) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const ux = dx / d, uy = dy / d;
  return [c1[0] + a * ux - s * h * uy, c1[1] + a * uy + s * h * ux];
}
