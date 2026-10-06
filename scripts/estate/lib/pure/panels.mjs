// Façade panels (plan §6.2 step 6b): one 2-triangle panel per window, on the
// glass's mid-plane, and one per exterior door, on the closed leaf's mid-plane
// inside the leaf solid; and the check that no panel lies within 2 mm of a
// detail (D) face it would z-fight with. Imports only sibling pure modules.

import { pointInRings, ringCentroid, transformPoint } from './geom.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };

/**
 * The mid-plane rectangle of a box given in some local frame (min, max) and
 * placed by `matrix` (column-major): the box's thinnest axis is the normal.
 * Returns { origin, u, v, n, w, h } in the matrix's target frame, where the
 * rectangle is origin + a·u + b·v for a ∈ [0, w], b ∈ [0, h].
 */
export const midPlanePanel = (min, max, matrix) => {
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const thin = ext[0] <= ext[1] && ext[0] <= ext[2] ? 0 : ext[1] <= ext[2] ? 1 : 2;
  const [ia, ib] = [0, 1, 2].filter((k) => k !== thin);
  const mid = (min[thin] + max[thin]) / 2;
  const corner = (a, b) => {
    const p = [0, 0, 0];
    p[thin] = mid; p[ia] = a; p[ib] = b;
    return transformPoint(matrix, p[0], p[1], p[2]);
  };
  const o = corner(min[ia], min[ib]);
  const pu = corner(max[ia], min[ib]);
  const pv = corner(min[ia], max[ib]);
  const du = sub(pu, o); const dv = sub(pv, o);
  const w = Math.hypot(...du); const h = Math.hypot(...dv);
  const u = norm(du); const v = norm(dv);
  return { origin: o, u, v, n: norm(cross(u, v)), w, h, thickness: ext[thin] };
};

/**
 * A window's panel: the glass's mid-plane (its thinnest axis), spanning the
 * whole window mesh in the other two axes — the opening, not just the pane, so
 * no ring of frame-width hole shows once D's frames are no longer drawn.
 */
export const openingPanel = (glassBox, wholeBox, matrix) => {
  const ext = [0, 1, 2].map((k) => glassBox[1][k] - glassBox[0][k]);
  const thin = ext[0] <= ext[1] && ext[0] <= ext[2] ? 0 : ext[1] <= ext[2] ? 1 : 2;
  const lo = wholeBox[0].slice(); const hi = wholeBox[1].slice();
  lo[thin] = glassBox[0][thin]; hi[thin] = glassBox[1][thin];
  return midPlanePanel(lo, hi, matrix);
};

/** The four corners of a panel, counter-clockwise about its normal. */
export const panelCorners = (p) => {
  const at = (a, b) => [p.origin[0] + p.u[0] * a + p.v[0] * b, p.origin[1] + p.u[1] * a + p.v[1] * b, p.origin[2] + p.u[2] * a + p.v[2] * b];
  return [at(0, 0), at(p.w, 0), at(p.w, p.h), at(0, p.h)];
};

/** One panel covering several coplanar ones (a double leaf), in the first's frame. */
export const mergePanels = (panels) => {
  if (panels.length === 1) return panels[0];
  const base = panels[0];
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const p of panels) {
    for (const c of panelCorners(p)) {
      const d = sub(c, base.origin);
      const a = dot(d, base.u), b = dot(d, base.v);
      a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
    }
  }
  const origin = [base.origin[0] + base.u[0] * a0 + base.v[0] * b0, base.origin[1] + base.u[1] * a0 + base.v[1] * b0, base.origin[2] + base.u[2] * a0 + base.v[2] * b0];
  return { ...base, origin, w: a1 - a0, h: b1 - b0 };
};

/** Reverses a panel's facing (swaps u and v), keeping the same rectangle. */
export const flipPanel = (p) => ({ ...p, u: p.v, v: p.u, w: p.h, h: p.w, n: [-p.n[0], -p.n[1], -p.n[2]] });

const PROBES = [0.3, 0.6, 1, 1.5, 2, 3, 4, 6, 8];
const ROOM_PROBES = [0.35, 0.6];

// The panel's centre and plan normal in block-local Z-up: glTF (x, y, z) → (x, −z).
const planFrame = (panel) => {
  const c = panelCorners(panel);
  const nx = panel.n[0]; const ny = -panel.n[2];
  const len = Math.hypot(nx, ny);
  return { px: (c[0][0] + c[2][0]) / 2, py: -(c[0][2] + c[2][2]) / 2, ux: len ? nx / len : 0, uy: len ? ny / len : 0, len };
};

const ringArea = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(a) / 2;
};

/**
 * Turns a panel to face out of the room it closes. Probes 0.35 m (then 0.6 m)
 * either side in plan and finds the room each probe stands in (`rooms`:
 * [{ polygon, external }] on the panel's storey, block-local). It faces the
 * side that is open air (no room, or an external one) when the other is
 * enclosed — a window looks out of its flat — and, between two enclosed rooms,
 * the larger, which is the public side: a front door faces the corridor, a
 * shopfront the hall. Returns { panel, decided }.
 */
export const facePanelFromRooms = (panel, rooms) => {
  const f = planFrame(panel);
  if (f.len < 1e-6) return { panel, decided: false };
  const roomAt = (x, y) => rooms.find((r) => pointInRings(x, y, [r.polygon])) ?? null;
  // 0 = open air, 1 = an enclosed room, ranked by area beyond that.
  const rank = (room) => (room === null || room.external ? { enclosed: false, area: Infinity } : { enclosed: true, area: room.area ?? ringArea(room.polygon) });
  for (const d of ROOM_PROBES) {
    const front = rank(roomAt(f.px + f.ux * d, f.py + f.uy * d));
    const back = rank(roomAt(f.px - f.ux * d, f.py - f.uy * d));
    if (front.enclosed !== back.enclosed) return { panel: front.enclosed ? flipPanel(panel) : panel, decided: true };
    if (front.enclosed && back.enclosed && Math.abs(front.area - back.area) > 0.5) {
      return { panel: front.area < back.area ? flipPanel(panel) : panel, decided: true };
    }
  }
  return { panel, decided: false };
};

/**
 * Turns a panel (glTF Y-up, block-local) to face out of the building: probes
 * ever further along ±normal in plan and takes the first distance at which
 * exactly one side leaves the footprint (block-local Z-up rings, holes
 * included, even-odd). With no decision it faces away from the footprint's
 * centroid. Returns { panel, decided }.
 */
export const facePanelOut = (panel, rings) => {
  const c = panelCorners(panel);
  const cx = (c[0][0] + c[2][0]) / 2; const cz = (c[0][2] + c[2][2]) / 2;
  // glTF (x, y, z) → block-local plan (x, −z).
  const nx = panel.n[0]; const ny = -panel.n[2];
  const len = Math.hypot(nx, ny);
  if (len < 1e-6) return { panel, decided: false }; // horizontal: leave as built
  const px = cx; const py = -cz; const ux = nx / len; const uy = ny / len;
  for (const d of PROBES) {
    const front = pointInRings(px + ux * d, py + uy * d, rings);
    const back = pointInRings(px - ux * d, py - uy * d, rings);
    if (front !== back) return { panel: front ? flipPanel(panel) : panel, decided: true };
  }
  const [gx, gy] = ringCentroid(rings[0]);
  const away = (px - gx) * ux + (py - gy) * uy;
  return { panel: away < 0 ? flipPanel(panel) : panel, decided: false };
};

/**
 * Adds a panel's two triangles to a soup, and with `doubleSided` two more
 * facing the other way (a door panel: which side is outdoors is a guess at a
 * lift landing or a stair discharge, and F is drawn one-sided). Returns how
 * many triangles it added.
 */
export const pushPanel = (soup, panel, slot, storey = 0, { doubleSided = false } = {}) => {
  const [a, b, c, d] = panelCorners(panel);
  soup.push(...a, ...b, ...c, slot, storey);
  soup.push(...a, ...c, ...d, slot, storey);
  if (!doubleSided) return 2;
  soup.push(...a, ...c, ...b, slot, storey);
  soup.push(...a, ...d, ...c, slot, storey);
  return 4;
};

// ---- the 2 mm check -------------------------------------------------------------------

const triAxisOverlap = (tri, rect, axis) => {
  let t0 = Infinity, t1 = -Infinity, r0 = Infinity, r1 = -Infinity;
  for (const p of tri) { const s = p[0] * axis[0] + p[1] * axis[1]; t0 = Math.min(t0, s); t1 = Math.max(t1, s); }
  for (const p of rect) { const s = p[0] * axis[0] + p[1] * axis[1]; r0 = Math.min(r0, s); r1 = Math.max(r1, s); }
  return Math.min(t1, r1) - Math.max(t0, r0);
};

/**
 * Whether a D triangle (three [x, y, z]) would z-fight with a panel: nearly
 * parallel (|cos| > 0.999), every vertex within `tol` of the panel's plane,
 * and the two overlapping in that plane by more than `slack` in every
 * separating direction (so faces that only touch at an edge do not count).
 */
export const triangleNearPanel = (panel, tri, tol = 0.002, slack = 1e-4) => {
  const tn = norm(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])));
  if (Math.abs(dot(tn, panel.n)) < 0.999) return false;
  for (const p of tri) if (Math.abs(dot(sub(p, panel.origin), panel.n)) > tol) return false;
  const uv = tri.map((p) => { const d = sub(p, panel.origin); return [dot(d, panel.u), dot(d, panel.v)]; });
  const rect = [[0, 0], [panel.w, 0], [panel.w, panel.h], [0, panel.h]];
  const axes = [[1, 0], [0, 1]];
  for (let e = 0; e < 3; e += 1) {
    const a = uv[e], b = uv[(e + 1) % 3];
    const ex = b[0] - a[0], ey = b[1] - a[1]; const l = Math.hypot(ex, ey);
    if (l > 0) axes.push([-ey / l, ex / l]);
  }
  return axes.every((axis) => triAxisOverlap(uv, rect, axis) > slack);
};

/**
 * Plan step 6b's check over whole sets: `panels` against every triangle of a
 * soup (D, baked), with a 1 m spatial hash. Returns the offending pairs as
 * { panel: index, tri: index }, at most `limit` of them.
 */
export const panelsNearSoup = (panels, soup, tol = 0.002, limit = 20) => {
  const cell = 1;
  const grid = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const p = soup.pos;
  for (let t = 0; t < soup.count; t += 1) {
    const o = t * 9;
    const lo = [0, 1, 2].map((k) => Math.floor((Math.min(p[o + k], p[o + 3 + k], p[o + 6 + k]) - tol) / cell));
    const hi = [0, 1, 2].map((k) => Math.floor((Math.max(p[o + k], p[o + 3 + k], p[o + 6 + k]) + tol) / cell));
    for (let x = lo[0]; x <= hi[0]; x += 1) for (let y = lo[1]; y <= hi[1]; y += 1) for (let z = lo[2]; z <= hi[2]; z += 1) {
      const k = key(x, y, z);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(t);
    }
  }
  const hits = [];
  panels.forEach((panel, pi) => {
    const corners = panelCorners(panel);
    const lo = [0, 1, 2].map((k) => Math.floor((Math.min(...corners.map((c) => c[k])) - tol) / cell));
    const hi = [0, 1, 2].map((k) => Math.floor((Math.max(...corners.map((c) => c[k])) + tol) / cell));
    const seen = new Set();
    for (let x = lo[0]; x <= hi[0]; x += 1) for (let y = lo[1]; y <= hi[1]; y += 1) for (let z = lo[2]; z <= hi[2]; z += 1) {
      for (const t of grid.get(key(x, y, z)) ?? []) {
        if (seen.has(t)) continue;
        seen.add(t);
        const o = t * 9;
        const tri = [[p[o], p[o + 1], p[o + 2]], [p[o + 3], p[o + 4], p[o + 5]], [p[o + 6], p[o + 7], p[o + 8]]];
        if (triangleNearPanel(panel, tri, tol) && hits.length < limit) hits.push({ panel: pi, tri: t });
      }
    }
  });
  return hits;
};
