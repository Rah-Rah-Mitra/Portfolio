// Façade edge lines (plan §6.2 step 6f): edges where two faces meet at 60° or
// more and that are at least 0.5 m long, the longest `max` per building, each
// inheriting a storey tag from its faces. Imports nothing.

const Q = 1e4; // weld at 0.1 mm

/**
 * Feature edges of a soup. Returns [{ a: [x,y,z], b: [x,y,z], storey, slot,
 * length }] sorted by length (desc), then by position, so the cut at `max` is
 * deterministic. Only edges shared by exactly two faces count (an edge of an
 * isolated panel is not a fold). The storey is the lower of the two faces'.
 */
export const featureEdges = (soup, { minAngleDeg = 60, minLength = 0.5, max = 6000 } = {}) => {
  const p = soup.pos;
  const normals = new Float64Array(soup.count * 3);
  for (let t = 0; t < soup.count; t += 1) {
    const o = t * 9;
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
    const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    normals[t * 3] = nx / l; normals[t * 3 + 1] = ny / l; normals[t * 3 + 2] = nz / l;
  }
  const vkey = (o) => `${Math.round(p[o] * Q)},${Math.round(p[o + 1] * Q)},${Math.round(p[o + 2] * Q)}`;
  const edges = new Map();
  for (let t = 0; t < soup.count; t += 1) {
    const o = t * 9;
    const ks = [vkey(o), vkey(o + 3), vkey(o + 6)];
    for (let e = 0; e < 3; e += 1) {
      const i = e, j = (e + 1) % 3;
      const forward = ks[i] < ks[j];
      const key = forward ? `${ks[i]}|${ks[j]}` : `${ks[j]}|${ks[i]}`;
      let rec = edges.get(key);
      if (!rec) {
        const oi = o + (forward ? i : j) * 3, oj = o + (forward ? j : i) * 3;
        rec = { a: [p[oi], p[oi + 1], p[oi + 2]], b: [p[oj], p[oj + 1], p[oj + 2]], faces: [] };
        edges.set(key, rec);
      }
      rec.faces.push(t);
    }
  }
  const cosMax = Math.cos((minAngleDeg * Math.PI) / 180);
  const out = [];
  for (const rec of edges.values()) {
    if (rec.faces.length !== 2) continue;
    const [f, g] = rec.faces;
    const c = normals[f * 3] * normals[g * 3] + normals[f * 3 + 1] * normals[g * 3 + 1] + normals[f * 3 + 2] * normals[g * 3 + 2];
    // The angle between the faces' normals; 0 for a flat continuation.
    if (c > cosMax) continue;
    const length = Math.hypot(rec.b[0] - rec.a[0], rec.b[1] - rec.a[1], rec.b[2] - rec.a[2]);
    if (length < minLength) continue;
    out.push({ a: rec.a, b: rec.b, length, storey: Math.min(soup.storey[f], soup.storey[g]), slot: soup.slot[f] });
  }
  out.sort((x, y) => y.length - x.length || x.a[0] - y.a[0] || x.a[1] - y.a[1] || x.a[2] - y.a[2] || x.b[0] - y.b[0] || x.b[1] - y.b[1] || x.b[2] - y.b[2]);
  return out.slice(0, max);
};
