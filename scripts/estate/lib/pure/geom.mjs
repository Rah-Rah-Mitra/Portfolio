// Small geometry helpers for the pack tool. Imports nothing. Matrices are glTF
// column-major mat4 arrays (gltf-transform's getWorldMatrix).

/** Determinant of a mat4's upper 3×3: negative for a mirroring transform. */
export const det3 = (m) =>
  m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);

/** out = M · (x, y, z, 1). */
export const transformPoint = (m, x, y, z, out = [0, 0, 0]) => {
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out;
};

/** out = M · (x, y, z, 0): a direction. */
export const transformDir = (m, x, y, z, out = [0, 0, 0]) => {
  out[0] = m[0] * x + m[4] * y + m[8] * z;
  out[1] = m[1] * x + m[5] * y + m[9] * z;
  out[2] = m[2] * x + m[6] * y + m[10] * z;
  return out;
};

/** a · b (column-major mat4). */
export const multiply = (a, b) => {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
    let s = 0;
    for (let k = 0; k < 4; k += 1) s += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = s;
  }
  return out;
};

/** Twice the area vector of triangle i of a soup-like position array. */
export const triNormal = (p, o, out = [0, 0, 0]) => {
  const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
  const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
  out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx;
  return out;
};

/** Six times the signed volume a triangle sweeps to the origin, about `c`. */
const tetra6 = (p, o, c) => {
  const ax = p[o] - c[0], ay = p[o + 1] - c[1], az = p[o + 2] - c[2];
  const bx = p[o + 3] - c[0], by = p[o + 4] - c[1], bz = p[o + 5] - c[2];
  const cx = p[o + 6] - c[0], cy = p[o + 7] - c[1], cz = p[o + 8] - c[2];
  return ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
};

const vertexKey = (p, o, q) => `${Math.round(p[o] * q)},${Math.round(p[o + 1] * q)},${Math.round(p[o + 2] * q)}`;

/**
 * Connected components of a soup's triangles (sharing a vertex position to
 * 0.1 mm), as arrays of triangle indices, ordered by their lowest triangle.
 */
export const components = (soup, indices = null) => {
  const list = indices ?? Array.from({ length: soup.count }, (_, i) => i);
  const parent = new Int32Array(list.length).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const owner = new Map();
  const p = soup.pos;
  list.forEach((t, li) => {
    for (let v = 0; v < 3; v += 1) {
      const key = vertexKey(p, t * 9 + v * 3, 1e4);
      const prev = owner.get(key);
      if (prev === undefined) owner.set(key, li);
      else { const a = find(prev), b = find(li); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
    }
  });
  const groups = new Map();
  list.forEach((t, li) => {
    const r = find(li);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(t);
  });
  return [...groups.values()];
};

/**
 * Whether a component is closed: every edge (welded to 0.1 mm) is used by an
 * even number of its triangles, so a signed volume means something.
 */
export const isClosed = (soup, tris) => {
  const edges = new Map();
  const p = soup.pos;
  for (const t of tris) {
    const k = [0, 1, 2].map((v) => vertexKey(p, t * 9 + v * 3, 1e4));
    for (let e = 0; e < 3; e += 1) {
      const a = k[e], b = k[(e + 1) % 3];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const n of edges.values()) if (n % 2) return false;
  return true;
};

/** Six times the signed volume of a set of triangles (positive when outward-wound). */
export const signedVolume6 = (soup, tris) => {
  if (!tris.length) return 0;
  const p = soup.pos; const o = tris[0] * 9;
  const c = [p[o], p[o + 1], p[o + 2]];
  let v = 0;
  for (const t of tris) v += tetra6(p, t * 9, c);
  return v;
};

/**
 * Plan step 5 for closed solids: flips every closed component whose signed
 * volume is negative, so front faces face out. Open components are left as
 * they are (a volume means nothing there). Returns { closed, open, flipped }.
 */
export const orientClosedSolids = (soup, indices = null) => {
  const out = { closed: 0, open: 0, flipped: 0, flippedTris: 0 };
  for (const comp of components(soup, indices)) {
    if (!isClosed(soup, comp)) { out.open += 1; continue; }
    out.closed += 1;
    const v = signedVolume6(soup, comp);
    if (v < 0) { out.flipped += 1; out.flippedTris += comp.length; for (const t of comp) soup.flip(t); }
  }
  return out;
};

/** Plan step 5 for open site surfaces: nearly flat triangles face up (+y). Returns how many it flipped. */
export const faceUp = (soup, indices = null, minUp = 0.5) => {
  let flipped = 0;
  const n = [0, 0, 0];
  const list = indices ?? Array.from({ length: soup.count }, (_, i) => i);
  for (const t of list) {
    triNormal(soup.pos, t * 9, n);
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len > 0 && -n[1] / len > minUp) { soup.flip(t); flipped += 1; }
  }
  return flipped;
};

/** Squared distance from point p to triangle (a, b, c), all [x, y, z]. Ericson, RTCD §5.1.5. */
export const pointTriangleDistance2 = (p, a, b, c) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const at = (q) => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
  const lerp = (u, v, t) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return at(a);
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return at(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(lerp(a, b, d1 / (d1 - d3)));
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return at(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(lerp(a, c, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return at(lerp(b, c, (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return at([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
};

/** The q-quantile (0–1) of a numeric array, nearest-rank, without mutating it. */
export const quantile = (values, q) => {
  if (!values.length) return 0;
  const sorted = Float64Array.from(values).sort();
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[rank];
};

/** Even-odd point-in-polygon over one or more rings of [x, y]. */
export const pointInRings = (x, y, rings) => {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
};

/** Area-weighted centroid of a ring (shoelace); the vertex mean for a degenerate ring. */
export const ringCentroid = (ring) => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const n = ring.length || 1;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
};

/**
 * An upstream open pose (web.json doors[].open: a row-major 3×4 matrix in
 * block-local Z-up) as a column-major mat4 in glTF Y-up: C · O · C⁻¹, where C
 * takes (x, y, z) to (x, z, −y). Pre-multiply a closed leaf's world matrix by
 * it to open the leaf (plan §6.2 step 3), so no pose formula is re-derived here.
 */
export const openPoseYup = (o) => {
  if (!Array.isArray(o) || o.length !== 12 || o.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new Error('an open pose must be 12 finite numbers (row-major 3×4)');
  }
  const O = [[o[0], o[1], o[2], o[3]], [o[4], o[5], o[6], o[7]], [o[8], o[9], o[10], o[11]], [0, 0, 0, 1]];
  const C = [[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]];
  const Ci = [[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0], [0, 0, 0, 1]];
  const mul = (a, b) => a.map((row, r) => b[0].map((_, c) => row.reduce((s, v, k) => s + v * b[k][c], 0)));
  const M = mul(mul(C, O), Ci);
  const out = [];
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) out.push(M[r][c] === 0 ? 0 : M[r][c]);
  return out;
};

/** Squared distance from (px, py, pz) to triangle o of a position array, allocation-free (Ericson §5.1.5). */
export const pointTriDist2 = (px, py, pz, t, o) => {
  const ax = t[o], ay = t[o + 1], az = t[o + 2];
  const abx = t[o + 3] - ax, aby = t[o + 4] - ay, abz = t[o + 5] - az;
  const acx = t[o + 6] - ax, acy = t[o + 7] - ay, acz = t[o + 8] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const sq = (x, y, z) => (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2;
  if (d1 <= 0 && d2 <= 0) return sq(ax, ay, az);
  const bpx = px - t[o + 3], bpy = py - t[o + 4], bpz = pz - t[o + 5];
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return sq(t[o + 3], t[o + 4], t[o + 5]);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return sq(ax + abx * v, ay + aby * v, az + abz * v); }
  const cpx = px - t[o + 6], cpy = py - t[o + 7], cpz = pz - t[o + 8];
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return sq(t[o + 6], t[o + 7], t[o + 8]);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return sq(ax + acx * w, ay + acy * w, az + acz * w); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return sq(t[o + 3] + (t[o + 6] - t[o + 3]) * w, t[o + 4] + (t[o + 7] - t[o + 4]) * w, t[o + 5] + (t[o + 8] - t[o + 5]) * w);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return sq(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w);
};

/**
 * The massing error (plan §6.2 step 6a): the 0.9 quantile of how far the
 * points `pts` (flat xyz) sit from the nearest triangle of `tris` (flat, 9 per
 * triangle), in metres.
 */
export const surfaceErrorP90 = (pts, tris) => {
  const n = pts.length / 3;
  const d = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let best = Infinity;
    for (let o = 0; o < tris.length; o += 9) {
      const v = pointTriDist2(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], tris, o);
      if (v < best) best = v;
    }
    d[i] = Math.sqrt(best);
  }
  return quantile(d, 0.9);
};
