// The furniture stand-in (plan §6.2 step 6d): what a kit is drawn as beyond the
// tier's furniture radius. One box over the whole kit, in the slot with the
// most triangles, turned a hawker table (a tile top over a steel pedestal of
// 100 triangles) into a dark full-height crate beside full stools. The
// stand-in follows the kit's height profile instead. Imports only the soup.
//
// The kit is split at its main top surface — the height carrying the most
// upward-facing area (a table top, a seat, a counter top) — into up to three
// layers: the slab under that surface, down to the nearest downward face below
// it (the top's own underside); what rises above it (a backrest); and what
// holds it up (a pedestal, end frames, a counter body). Each layer is one box
// over its own triangles' bounds, in the slot covering the most area in that
// layer (a tie goes to the lower slot). A face no camera can see is left out:
// one on the kit's floor, and one buried against the slab where the layer lies
// within the slab's footprint (or the slab within the layer's). A kit with no
// layer but the slab — a letterbox bank — is one box without its floor face.

import { Soup } from './soup.mjs';

const EPS = 1e-3; // 1 mm: heights within it are one height
const UP = 0.9;   // |n·y| above this is a horizontal face

const QUADS = {
  zLo: [0, 2, 3, 1], zHi: [4, 5, 7, 6], bottom: [0, 1, 5, 4], top: [2, 6, 7, 3], xLo: [0, 4, 6, 2], xHi: [1, 3, 7, 5],
};

/** Pushes the outward-wound faces of the box [lo, hi] named in `faces` (QUADS keys); a face of zero area is skipped. */
export const pushBox = (soup, [lo, hi], slot, faces = Object.keys(QUADS)) => {
  const v = (i) => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
  const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const flat = { zLo: [0, 1], zHi: [0, 1], bottom: [0, 2], top: [0, 2], xLo: [1, 2], xHi: [1, 2] };
  for (const name of faces) {
    const [u, w] = flat[name];
    if (!(ext[u] > 0) || !(ext[w] > 0)) continue;
    const [a, b, c, d] = QUADS[name];
    soup.push(...v(a), ...v(b), ...v(c), slot, 0);
    soup.push(...v(a), ...v(c), ...v(d), slot, 0);
  }
  return soup;
};

// Per triangle: area, unit normal y, y range.
const measure = (soup, t) => {
  const p = soup.pos; const o = t * 9;
  const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
  const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  return {
    area: len / 2,
    ny: len > 0 ? ny / len : 0,
    lo: Math.min(p[o + 1], p[o + 4], p[o + 7]),
    hi: Math.max(p[o + 1], p[o + 4], p[o + 7]),
    cy: (p[o + 1] + p[o + 4] + p[o + 7]) / 3,
  };
};

const xzContains = (outer, inner) => outer[0][0] <= inner[0][0] + 1e-6 && outer[1][0] >= inner[1][0] - 1e-6
  && outer[0][2] <= inner[0][2] + 1e-6 && outer[1][2] >= inner[1][2] - 1e-6;

/**
 * The layers of a kit (soup in the kit's own frame, glTF Y-up), as
 * { top, base, layers: [{ name: 'slab'|'above'|'below', box: [lo, hi], slot }] }:
 * `top` is the main top surface's height, `base` the slab's underside.
 * `skip(slot)` leaves triangles out of the analysis (glass). Returns null for
 * an empty kit.
 */
export const kitProfile = (kit, { skip = () => false } = {}) => {
  const tris = [];
  for (let t = 0; t < kit.count; t += 1) if (!skip(kit.slot[t])) tris.push({ t, slot: kit.slot[t], ...measure(kit, t) });
  if (!tris.length) return null;
  const floor = Math.min(...tris.map((x) => x.lo));
  const roof = Math.max(...tris.map((x) => x.hi));
  // The main top surface: the height (to 1 mm) with the most upward-facing area; a tie goes to the higher.
  const upArea = new Map();
  const mmOf = (y) => Math.round(y * 1000);
  for (const x of tris) if (x.ny > UP) { const k = mmOf(x.cy); upArea.set(k, (upArea.get(k) ?? 0) + x.area); }
  let top = roof;
  if (upArea.size) {
    let best = -1;
    for (const [k, a] of [...upArea].sort((m, n) => n[0] - m[0])) if (a > best + 1e-12) { best = a; top = k / 1000; }
  }
  // Its slab reaches down to the nearest downward face below it, else to the floor (heights to the millimetre).
  let base = floor;
  for (const x of tris) if (x.ny < -UP && x.cy < top - EPS && mmOf(x.cy) / 1000 > base) base = mmOf(x.cy) / 1000;
  const groups = { slab: [], above: [], below: [] };
  for (const x of tris) {
    if (x.hi > top + EPS) groups.above.push(x);
    else if (x.lo < base - EPS) groups.below.push(x);
    else groups.slab.push(x);
  }
  const layer = (name, list, ylo, yhi) => {
    if (!list.length) return null;
    const lo = [Infinity, ylo, Infinity]; const hi = [-Infinity, yhi, -Infinity];
    const area = new Map();
    for (const x of list) {
      const o = x.t * 9;
      for (let v = 0; v < 3; v += 1) for (const k of [0, 2]) {
        const c = kit.pos[o + v * 3 + k];
        if (c < lo[k]) lo[k] = c;
        if (c > hi[k]) hi[k] = c;
      }
      area.set(x.slot, (area.get(x.slot) ?? 0) + x.area);
    }
    let slot = -1; let most = -1;
    for (const [s, a] of [...area].sort((m, n) => m[0] - n[0])) if (a > most + 1e-12) { most = a; slot = s; }
    return { name, box: [lo, hi], slot };
  };
  const slab = layer('slab', groups.slab, groups.below.length ? base : floor, top);
  const above = layer('above', groups.above, top, Math.max(...groups.above.map((x) => x.hi), top));
  const below = layer('below', groups.below, floor, base);
  return { top, base, layers: [above, slab, below].filter((l) => l !== null) };
};

/**
 * The stand-in soup for a kit (its own frame): kitProfile's boxes with their
 * hidden faces left out. Every triangle carries storey 0, as the kit's own
 * triangles do (instances take their storey from _STOREY).
 */
export const standInSoup = (kit, opts = {}) => {
  const out = new Soup(36);
  const profile = kitProfile(kit, opts);
  if (!profile) return out;
  const by = Object.fromEntries(profile.layers.map((l) => [l.name, l]));
  const { slab, above, below } = by;
  const floorY = Math.min(...profile.layers.map((l) => l.box[0][1]));
  const sides = ['zLo', 'zHi', 'xLo', 'xHi'];
  if (slab) {
    const faces = ['top', ...sides];
    const buried = below && xzContains(below.box, slab.box);
    if (!buried && slab.box[0][1] > floorY + EPS) faces.push('bottom');
    pushBox(out, slab.box, slab.slot, faces);
  }
  if (above) {
    const faces = ['top', ...sides];
    if (!(slab && xzContains(slab.box, above.box))) faces.push('bottom');
    pushBox(out, above.box, above.slot, faces);
  }
  if (below) {
    const faces = [...sides]; // its bottom stands on the kit's floor
    if (!(slab && xzContains(slab.box, below.box))) faces.push('top');
    pushBox(out, below.box, below.slot, faces);
  }
  return out;
};
