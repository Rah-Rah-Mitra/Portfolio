// Checks that run on what a GLB decodes to, not on the float64 soup it was
// built from (plan §6.2 steps 8–9). Quantisation moves every vertex by up to
// about a step (scale / 32767 at 16 bits): it can flatten a 5 mm road marking
// onto the asphalt under it, or open a seam the exact checks never saw.
// Imports nothing.

const cross = (ax, ay, az, bx, by, bz) => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];

// The unit normal and plane offset of triangle t, or null when degenerate.
const plane = (p, t) => {
  const o = t * 9;
  const n = cross(p[o + 3] - p[o], p[o + 4] - p[o + 1], p[o + 5] - p[o + 2], p[o + 6] - p[o], p[o + 7] - p[o + 1], p[o + 8] - p[o + 2]);
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-12) return null;
  n[0] /= len; n[1] /= len; n[2] /= len;
  return { n, d: n[0] * p[o] + n[1] * p[o + 1] + n[2] * p[o + 2] };
};

// The two in-plane axes of a normal: drop its dominant component.
const dropAxis = (n) => {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  return ax >= ay && ax >= az ? [1, 2] : ay >= az ? [0, 2] : [0, 1];
};

const project = (p, t, [u, v]) => {
  const o = t * 9;
  return [[p[o + u], p[o + v]], [p[o + 3 + u], p[o + 3 + v]], [p[o + 6 + u], p[o + 6 + v]]];
};

// Separating-axis overlap of two 2-D triangles: the smallest overlap over the
// six edge normals (negative when separated, 0 when they only touch).
const overlap2d = (a, b) => {
  let least = Infinity;
  for (const tri of [a, b]) {
    for (let e = 0; e < 3; e += 1) {
      const p0 = tri[e], p1 = tri[(e + 1) % 3];
      const ex = p1[0] - p0[0], ey = p1[1] - p0[1]; const l = Math.hypot(ex, ey);
      if (l < 1e-12) continue;
      const nx = -ey / l, ny = ex / l;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const q of a) { const s = q[0] * nx + q[1] * ny; if (s < a0) a0 = s; if (s > a1) a1 = s; }
      for (const q of b) { const s = q[0] * nx + q[1] * ny; if (s < b0) b0 = s; if (s > b1) b1 = s; }
      least = Math.min(least, Math.min(a1, b1) - Math.max(a0, b0));
    }
  }
  return least;
};

/**
 * Whether triangles t and u of a soup would z-fight at any depth precision:
 * facing the same way (normals within `cos`), on one plane (every vertex of
 * each within `planeTol` of the other's plane), and overlapping in that plane
 * by more than `slack` in every separating direction. Slots are not compared.
 */
export const pairCoplanar = (soup, t, u, { planeTol = 2.5e-4, cos = 0.9995, slack = 1e-3 } = {}) => {
  const p = soup.pos;
  const a = plane(p, t); const b = plane(p, u);
  if (!a || !b) return false;
  if (a.n[0] * b.n[0] + a.n[1] * b.n[1] + a.n[2] * b.n[2] < cos) return false;
  for (let v = 0; v < 3; v += 1) {
    const o = u * 9 + v * 3;
    if (Math.abs(a.n[0] * p[o] + a.n[1] * p[o + 1] + a.n[2] * p[o + 2] - a.d) > planeTol) return false;
  }
  for (let v = 0; v < 3; v += 1) {
    const o = t * 9 + v * 3;
    if (Math.abs(b.n[0] * p[o] + b.n[1] * p[o + 1] + b.n[2] * p[o + 2] - b.d) > planeTol) return false;
  }
  const axes = dropAxis(a.n);
  return overlap2d(project(p, t, axes), project(p, u, axes)) > slack;
};

/**
 * Every pair of triangles of different palette slots that pairCoplanar()
 * accepts, found through a hash on (normal, plane offset, 2-D cell). A pair
 * whose normals straddle a bucket is missed; the guard below only ever asks
 * about the decoded file, so a miss there can hide a z-fight but never invent
 * one. `soup`-like: { count, pos (9 per triangle), slot }. Returns [[t, u]].
 */
export const coplanarPairs = (soup, { planeTol = 2.5e-4, cos = 0.9995, slack = 1e-3, cell = 2, dStep = 2e-3 } = {}) => {
  const p = soup.pos;
  const info = new Array(soup.count);
  const buckets = new Map();
  const nKey = (n) => `${Math.round(n[0] * 40)},${Math.round(n[1] * 40)},${Math.round(n[2] * 40)}`;
  for (let t = 0; t < soup.count; t += 1) {
    const pl = plane(p, t);
    if (!pl) continue;
    const tri = project(p, t, dropAxis(pl.n));
    const lo = [Math.min(tri[0][0], tri[1][0], tri[2][0]), Math.min(tri[0][1], tri[1][1], tri[2][1])];
    const hi = [Math.max(tri[0][0], tri[1][0], tri[2][0]), Math.max(tri[0][1], tri[1][1], tri[2][1])];
    const rec = { nk: nKey(pl.n), dk: Math.round(pl.d / dStep), cells: [] };
    for (let x = Math.floor(lo[0] / cell); x <= Math.floor(hi[0] / cell); x += 1) {
      for (let y = Math.floor(lo[1] / cell); y <= Math.floor(hi[1] / cell); y += 1) {
        rec.cells.push(`${x},${y}`);
        const k = `${rec.nk}|${rec.dk}|${x},${y}`;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(t);
      }
    }
    info[t] = rec;
  }
  const out = [];
  for (let t = 0; t < soup.count; t += 1) {
    const a = info[t];
    if (!a) continue;
    const seen = new Set();
    for (const c of a.cells) {
      for (const dk of [a.dk - 1, a.dk, a.dk + 1]) {
        for (const u of buckets.get(`${a.nk}|${dk}|${c}`) ?? []) {
          if (u <= t || seen.has(u)) continue;
          seen.add(u);
          if (soup.slot[u] === soup.slot[t]) continue;
          if (pairCoplanar(soup, t, u, { planeTol, cos, slack })) out.push([t, u]);
        }
      }
    }
  }
  return out;
};

/** How many coplanar overlapping pairs of different slots a soup holds (see coplanarPairs). */
export const coplanarOverlaps = (soup, opts) => {
  const pairs = coplanarPairs(soup, opts);
  return { pairs: pairs.length, examples: pairs.slice(0, 5).map(([a, b]) => ({ a, b })) };
};

/**
 * The z-fight guard: the pairs a file's quantisation made coplanar. Every
 * decoded pair that is coplanar (0.25 mm) and overlapping by more than `slack`
 * is looked up, through `map` (decoded → built triangle, from matchMap), in
 * the built soup; it is new unless the built pair already lay within 1 mm and
 * overlapped at all. Pre-existing coplanar faces (upstream's own) are not the
 * pack's to fix and are reported, not refused. Returns { decoded, existing, created: [[t, u]] }.
 */
export const quantisationZFights = (built, decoded, map, { slack }) => {
  const pairs = coplanarPairs(decoded, { planeTol: 2.5e-4, slack });
  const created = [];
  for (const [g1, g2] of pairs) {
    if (!pairCoplanar(built, map[g1], map[g2], { planeTol: 1e-3, slack: 0 })) created.push([g1, g2]);
  }
  return { decoded: pairs.length, existing: pairs.length - created.length, created };
};

/**
 * Pairs every triangle of `got` with a distinct triangle of `want` of the same
 * slot whose vertices lie within `tol` (any cyclic order; winding is kept).
 * Returns { problem: null | string, map } where map[g] is the `want` index of
 * decoded triangle g. Hashes centroids on a `tol × 4` grid.
 */
export const matchMap = (want, got, tol) => {
  const map = new Int32Array(got.count).fill(-1);
  if (want.count !== got.count) return { problem: `${got.count} triangles decoded, ${want.count} built`, map };
  const cell = tol * 4;
  const grid = new Map();
  const pw = want.pos; const pg = got.pos;
  const centroid = (p, t) => { const o = t * 9; return [(p[o] + p[o + 3] + p[o + 6]) / 3, (p[o + 1] + p[o + 4] + p[o + 7]) / 3, (p[o + 2] + p[o + 5] + p[o + 8]) / 3]; };
  const key = (c) => `${Math.floor(c[0] / cell)},${Math.floor(c[1] / cell)},${Math.floor(c[2] / cell)}`;
  for (let t = 0; t < want.count; t += 1) {
    const k = key(centroid(pw, t));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(t);
  }
  const used = new Uint8Array(want.count);
  const close = (o1, o2) => Math.abs(pw[o1] - pg[o2]) <= tol && Math.abs(pw[o1 + 1] - pg[o2 + 1]) <= tol && Math.abs(pw[o1 + 2] - pg[o2 + 2]) <= tol;
  const same = (w, g) => {
    for (let r = 0; r < 3; r += 1) {
      let ok = true;
      for (let v = 0; v < 3 && ok; v += 1) ok = close(w * 9 + ((v + r) % 3) * 3, g * 9 + v * 3);
      if (ok) return true;
    }
    return false;
  };
  for (let g = 0; g < got.count; g += 1) {
    const c = centroid(pg, g);
    const [cx, cy, cz] = [Math.floor(c[0] / cell), Math.floor(c[1] / cell), Math.floor(c[2] / cell)];
    let found = -1;
    for (let dx = -1; dx <= 1 && found < 0; dx += 1) for (let dy = -1; dy <= 1 && found < 0; dy += 1) for (let dz = -1; dz <= 1 && found < 0; dz += 1) {
      for (const w of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
        if (!used[w] && want.slot[w] === got.slot[g] && same(w, g)) { found = w; break; }
      }
    }
    if (found < 0) {
      const o = g * 9;
      return { problem: `decoded triangle ${g} (slot ${got.slot[g]}, first vertex ${[pg[o], pg[o + 1], pg[o + 2]].map((v) => v.toFixed(4)).join(', ')}) has no built triangle within ${(tol * 1000).toFixed(2)} mm`, map };
    }
    used[found] = 1;
    map[g] = found;
  }
  return { problem: null, map };
};

/** matchMap's verdict alone: null, or the first decoded triangle with no built one within `tol`. */
export const matchWithin = (want, got, tol) => matchMap(want, got, tol).problem;

/**
 * The interior's seams on what a reader decodes (see grid.mjs): every vertex
 * the built T (relative to its floor, placed at each typical storey's FFL)
 * shares with that storey's R must decode to one point in both, or the edges
 * the two meshes share open into a dotted line. Shared means equal to 10 µm in
 * the built soups; each decoded copy is the nearest decoded vertex within
 * `tol` of the built point (one quantisation step plus a little). `typical`
 * lists [storey index, FFL] pairs; R triangles carry their storey index.
 * Returns { shared, apart, missing, maxApart, first } (first: a description of
 * the first fault, or null).
 */
export const seamGaps = ({ builtT, builtR, decT, decR, typical, tol, same = 1e-5 }) => {
  const K = 1e5;
  const key = (x, y, z) => `${Math.round(x * K)},${Math.round(y * K)},${Math.round(z * K)}`;
  // Decoded vertices on a hash grid of cell `tol`: T relative to its floor, R absolute with its storey.
  const index = (soup, keep) => {
    const grid = new Map();
    const p = soup.pos;
    for (let t = 0; t < soup.count; t += 1) {
      if (keep && !keep(t)) continue;
      for (let v = 0; v < 3; v += 1) {
        const o = t * 9 + v * 3;
        const k = `${Math.floor(p[o] / tol)},${Math.floor(p[o + 1] / tol)},${Math.floor(p[o + 2] / tol)}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(p[o], p[o + 1], p[o + 2]);
      }
    }
    return grid;
  };
  const nearest = (grid, x, y, z) => {
    let best = null; let bd = tol;
    const cx = Math.floor(x / tol), cy = Math.floor(y / tol), cz = Math.floor(z / tol);
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
      const list = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
      if (!list) continue;
      for (let i = 0; i < list.length; i += 3) {
        const d = Math.hypot(list[i] - x, list[i + 1] - y, list[i + 2] - z);
        if (d <= bd) { bd = d; best = [list[i], list[i + 1], list[i + 2]]; }
      }
    }
    return best;
  };
  const tIndex = index(decT);
  const out = { shared: 0, apart: 0, missing: 0, maxApart: 0, first: null };
  for (const [s, ffl] of typical) {
    const tKeys = new Set();
    const bt = builtT.pos;
    for (let o = 0; o < builtT.count * 9; o += 3) tKeys.add(key(bt[o], bt[o + 1] + ffl, bt[o + 2]));
    const rIndex = index(decR, (t) => decR.storey[t] === s);
    const seen = new Set();
    const br = builtR.pos;
    for (let t = 0; t < builtR.count; t += 1) {
      if (builtR.storey[t] !== s) continue;
      for (let v = 0; v < 3; v += 1) {
        const o = t * 9 + v * 3;
        const k = key(br[o], br[o + 1], br[o + 2]);
        if (!tKeys.has(k) || seen.has(k)) continue;
        seen.add(k);
        out.shared += 1;
        const r = nearest(rIndex, br[o], br[o + 1], br[o + 2]);
        const tt = nearest(tIndex, br[o], br[o + 1] - ffl, br[o + 2]);
        if (!r || !tt) {
          out.missing += 1;
          out.first ??= `storey ${s}: no decoded ${r ? 'T' : 'R'} vertex within ${(tol * 1000).toFixed(2)} mm of (${[br[o], br[o + 1], br[o + 2]].map((c) => c.toFixed(4)).join(', ')})`;
          continue;
        }
        const d = Math.hypot(r[0] - tt[0], r[1] - (tt[1] + ffl), r[2] - tt[2]);
        if (d > same) {
          out.apart += 1;
          out.first ??= `storey ${s}: T and R decode (${[br[o], br[o + 1], br[o + 2]].map((c) => c.toFixed(4)).join(', ')}) ${(d * 1000).toFixed(3)} mm apart`;
        }
        out.maxApart = Math.max(out.maxApart, d);
      }
    }
  }
  return out;
};
