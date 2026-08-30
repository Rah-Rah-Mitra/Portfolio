// pga-rig.js — planar constraint dynamics for the workbench rigging.
// Verlet points + distance constraints (the same numerical core the ganja.js
// PGA dynamics demos integrate); a production build can swap this for
// ganja.js PGA motors/forques without changing callers.
export function makeRig() { return { pts: [], cons: [] }; }
export function addPoint(rig, x, y, o = {}) {
  rig.pts.push({ x, y, px: x, py: y, m: o.m ?? 1, pin: !!o.pin });
  return rig.pts.length - 1;
}
export function link(rig, a, b, o = {}) {
  const A = rig.pts[a], B = rig.pts[b];
  rig.cons.push({ a, b, len: o.len ?? Math.hypot(B.x - A.x, B.y - A.y), stiff: o.stiff ?? 1, rope: !!o.rope });
}
export function step(rig, o = {}) {
  const dt = o.dt ?? 1 / 60, g = o.gy ?? 900, damp = o.damp ?? 0.995, iter = o.iter ?? 4;
  for (const p of rig.pts) {
    if (p.pin) continue;
    const vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
    p.px = p.x; p.py = p.y;
    p.x += vx; p.y += vy + g * dt * dt;
  }
  for (let k = 0; k < iter; k++) for (const c of rig.cons) {
    const A = rig.pts[c.a], B = rig.pts[c.b];
    let dx = B.x - A.x, dy = B.y - A.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    if (c.rope && d < c.len) continue;
    const diff = (d - c.len) / d * 0.5 * c.stiff;
    const wa = A.pin ? 0 : 1 / A.m, wb = B.pin ? 0 : 1 / B.m, w = wa + wb || 1;
    if (!A.pin) { A.x += dx * diff * 2 * wa / w; A.y += dy * diff * 2 * wa / w; }
    if (!B.pin) { B.x -= dx * diff * 2 * wb / w; B.y -= dy * diff * 2 * wb / w; }
  }
}
// Critically-damp-ish spring integrator: returns [pos, vel].
export function spring(cur, vel, target, k = 120, d = 14, dt = 1 / 60) {
  const a = k * (target - cur) - d * vel;
  vel += a * dt; cur += vel * dt;
  return [cur, vel];
}
// Cable routed over a list of sheave nodes [[x,y],…]; each span sags by `sag` px.
// The path need not be straight or monotonic — doglegs over deflection sheaves are the point.
export function routePath(nodes, sag = 6) {
  let d = `M${nodes[0][0].toFixed(1)} ${nodes[0][1].toFixed(1)}`;
  for (let i = 1; i < nodes.length; i++) {
    const [x0, y0] = nodes[i - 1], [x1, y1] = nodes[i];
    const vert = Math.abs(x1 - x0) < Math.abs(y1 - y0);
    const cx = vert ? (x0 + x1) / 2 + sag : (x0 + x1) / 2;
    const cy = vert ? (y0 + y1) / 2 : Math.max(y0, y1) + sag;
    d += ` Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}
// Samples a laid-out <path> so riders can sit on the cable: at(x) for a span that
// advances in x, atLen(s) + tangent for anything routed (verticals, doglegs).
export function pathSampler(pathEl, n = 64) {
  const len = pathEl.getTotalLength();
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(pathEl.getPointAtLength((len * i) / n));
  return {
    len,
    at(x) {
      let i = 1;
      while (i < pts.length - 1 && pts[i].x < x) i++;
      const a = pts[i - 1], b = pts[i];
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return { y: a.y + (b.y - a.y) * t, ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
    },
    atLen(s) { return pathEl.getPointAtLength(Math.max(0, Math.min(len, s))); },
    tangent(s) {
      const a = pathEl.getPointAtLength(Math.max(0, Math.min(len, s)));
      const b = pathEl.getPointAtLength(Math.max(0, Math.min(len, s + 4)));
      return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    },
  };
}
// Sagging cable path between two anchors (quadratic, sag in px).
export function sagPath(x1, y1, x2, y2, sag) {
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${((x1 + x2) / 2).toFixed(1)} ${(Math.max(y1, y2) + sag).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}
