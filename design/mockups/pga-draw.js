// pga-draw.js — blueprint drawing kit. Every asset draws through this so the
// whole library reads as one drawing set (Industry tokens, hairlines, marks).
import { TAU, pol, mix, ang, dist, norm } from './pga.js';

export function kit(cv, W, H, col) {
  const ctx = cv.getContext('2d');
  const g = { W, H, ctx, col };
  const pp = (pts) => { for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]); };

  g.reset = () => {
    const d = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * d)) { cv.width = Math.round(W * d); cv.height = Math.round(H * d); }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.font = '500 9.5px Barlow, sans-serif';
    g.st();
  };
  g.st = (o = {}) => {
    ctx.strokeStyle = o.c || col.ink;
    ctx.fillStyle = o.f || o.c || col.ink;
    ctx.lineWidth = o.w ?? 1.15;
    ctx.globalAlpha = o.a ?? 1;
    ctx.setLineDash(o.dash || []);
    return o;
  };
  g.line = (a, b, o) => { g.st(o); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
  g.path = (pts, o = {}) => { if (pts.length < 2) return; g.st(o); ctx.beginPath(); pp(pts); if (o.close) ctx.closePath(); if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); } ctx.stroke(); };
  g.circle = (c, r, o = {}) => { g.st(o); ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(0.2, r), 0, TAU); if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); } ctx.stroke(); };
  g.arc = (c, r, a0, a1, o = {}) => { g.st(o); ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(0.2, r), a0, a1); ctx.stroke(); };
  g.dot = (c, r = 3, o = {}) => { g.st(o); ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, TAU); ctx.fillStyle = o.f || o.c || col.ink; ctx.fill(); };
  // hinge: open pin
  g.pin = (c, o = {}) => { g.circle(c, o.r ?? 3.1, { c: o.c || col.ink, w: o.w ?? 1.15, fill: col.paper }); };
  // grounded pivot: pin + hatched base, `dir` points away from ground
  g.fix = (c, dir = Math.PI / 2, o = {}) => {
    const u = [Math.cos(dir), Math.sin(dir)], p = [-u[1], u[0]], s = o.s ?? 9;
    const a = [c[0] + u[0] * s + p[0] * s * 0.8, c[1] + u[1] * s + p[1] * s * 0.8];
    const b = [c[0] + u[0] * s - p[0] * s * 0.8, c[1] + u[1] * s - p[1] * s * 0.8];
    g.path([c, a, b], { close: true, c: o.c || col.ink, w: 1 });
    g.hatch([a, b, [b[0] + u[0] * 4, b[1] + u[1] * 4], [a[0] + u[0] * 4, a[1] + u[1] * 4]], { s: 3.4 });
    g.pin(c, o);
  };
  g.bar = (a, b, o = {}) => { g.line(a, b, { c: o.c || col.ink, w: o.w ?? 2.4 }); if (o.pins !== false) { g.pin(a, o); g.pin(b, o); } };
  g.rail = (a, b, o = {}) => {
    const u = norm([b[0] - a[0], b[1] - a[1]]), p = [-u[1], u[0]], w = o.w2 ?? 5;
    for (const s of [1, -1]) g.line([a[0] + p[0] * w * s, a[1] + p[1] * w * s], [b[0] + p[0] * w * s, b[1] + p[1] * w * s], { c: o.c || col.ghost, w: 0.9 });
    const n = o.ticks ?? 0, d = dist(a, b);
    for (let i = 0; i <= n; i++) { const q = mix(a, b, i / n); g.line([q[0] + p[0] * w, q[1] + p[1] * w], [q[0] + p[0] * (w + 3), q[1] + p[1] * (w + 3)], { c: col.faint, w: 0.8 }); }
    return d;
  };
  g.box = (c, w, h, a = 0, o = {}) => {
    const co = Math.cos(a), si = Math.sin(a);
    const q = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [c[0] + x * co - y * si, c[1] + x * si + y * co]);
    g.path(q, { close: true, ...o });
    return q;
  };
  g.poly = (pts, o = {}) => { g.path(pts, { close: true, ...o }); if (o.hatch) g.hatch(pts, { s: o.hs || 4 }); };
  g.hatch = (pts, o = {}) => {
    ctx.save(); ctx.beginPath(); pp(pts); ctx.closePath(); ctx.clip();
    g.st({ c: o.c || col.faint, w: 0.7, a: o.a ?? 1 });
    const s = o.s ?? 4.5;
    for (let k = -H; k < W + H; k += s) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + H, H); ctx.stroke(); }
    ctx.restore();
  };
  g.gear = (c, r, n, ph = 0, o = {}) => {
    const ro = r * (1 + 2.0 / n) * (o.ro ?? 1), ri = r * (1 - 2.0 / n) * (o.ri ?? 1), tw = (Math.PI / n) * 0.5;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = ph + (i * TAU) / n;
      pts.push(pol(c, ri, a - tw * 1.55), pol(c, ro, a - tw * 0.65), pol(c, ro, a + tw * 0.65), pol(c, ri, a + tw * 1.55));
    }
    g.path(pts, { close: true, c: o.c || col.ink, w: o.w ?? 1.15, fill: o.fill });
    if (o.pitch !== false) g.circle(c, r, { c: col.faint, w: 0.7, dash: [3, 3] });
    if (o.hub !== false) { g.circle(c, Math.max(2.2, r * 0.2), { c: o.c || col.ink, w: 1 }); g.line(pol(c, r * 0.2, ph), pol(c, ri * 0.92, ph), { c: col.accent, w: 1.1 }); }
    return pts;
  };
  // internal (ring) gear: teeth point inward
  g.ring = (c, r, n, ph = 0, o = {}) => {
    const ro = r * (1 + 2.0 / n), ri = r * (1 - 2.0 / n), tw = (Math.PI / n) * 0.5, pts = [];
    for (let i = 0; i < n; i++) {
      const a = ph + (i * TAU) / n;
      pts.push(pol(c, ro, a - tw * 1.55), pol(c, ri, a - tw * 0.65), pol(c, ri, a + tw * 0.65), pol(c, ro, a + tw * 1.55));
    }
    g.path(pts, { close: true, c: o.c || col.ink, w: o.w ?? 1.15 });
    g.circle(c, ro * 1.1, { c: o.c || col.ink, w: 1.15 });
    g.circle(c, r, { c: col.faint, w: 0.7, dash: [3, 3] });
  };
  g.rack = (a, b, pitch, off = 0, o = {}) => {
    const u = norm([b[0] - a[0], b[1] - a[1]]), p = [-u[1], u[0]], d = dist(a, b), h = o.h ?? 6;
    const pts = [];
    let s = ((off % pitch) + pitch) % pitch - pitch;
    pts.push(a);
    for (; s < d + pitch; s += pitch) {
      const q = (t, k) => [a[0] + u[0] * Math.min(d, Math.max(0, t)) + p[0] * k, a[1] + u[1] * Math.min(d, Math.max(0, t)) + p[1] * k];
      pts.push(q(s, 0), q(s + pitch * 0.22, h), q(s + pitch * 0.56, h), q(s + pitch * 0.78, 0));
    }
    pts.push(b);
    g.path(pts, { c: o.c || col.ink, w: o.w ?? 1.15 });
    g.path([a, b, [b[0] + p[0] * -(o.body ?? 10), b[1] + p[1] * -(o.body ?? 10)], [a[0] + p[0] * -(o.body ?? 10), a[1] + p[1] * -(o.body ?? 10)]].slice(1), { c: o.c || col.ink, w: o.w ?? 1.15 });
  };
  g.sheave = (c, r, ph = 0, o = {}) => {
    g.circle(c, r, { c: o.c || col.ink, w: o.w ?? 1.3, fill: o.fill ?? col.paper });
    g.circle(c, r * 0.28, { c: o.c || col.ink, w: 1 });
    for (let i = 0; i < 4; i++) g.line(pol(c, r * 0.3, ph + (i * TAU) / 4), pol(c, r * 0.88, ph + (i * TAU) / 4), { c: col.faint, w: 0.9 });
    g.dot(c, 1.3, { c: o.c || col.ink });
  };
  g.rope = (pts, o = {}) => g.path(pts, { c: o.c || col.accent, w: o.w ?? 1.35, a: o.a ?? 1 });
  g.spring = (a, b, n = 8, amp = 5, o = {}) => {
    const u = norm([b[0] - a[0], b[1] - a[1]]), p = [-u[1], u[0]], d = dist(a, b), pts = [a];
    for (let i = 0; i <= n; i++) {
      const t = (i + 0.5) / (n + 1), s = i % 2 ? 1 : -1;
      pts.push([a[0] + u[0] * d * t + p[0] * amp * s, a[1] + u[1] * d * t + p[1] * amp * s]);
    }
    pts.push(b);
    g.path(pts, { c: o.c || col.ink, w: o.w ?? 1.1 });
  };
  g.ghost = (a, b, o = {}) => g.line(a, b, { c: o.c || col.ghost, w: 0.8, dash: [4, 3], a: o.a ?? 0.9 });
  // draw a PGA line (a·e1 + b·e2 + c·e0) clipped to the frame
  g.gline = (l, o = {}) => {
    const a = l[2], b = l[4], c = l[1], hits = [];
    if (Math.abs(b) > 1e-9) { hits.push([0, -(c + a * 0) / b], [W, -(c + a * W) / b]); }
    if (Math.abs(a) > 1e-9) { hits.push([-(c + b * 0) / a, 0], [-(c + b * H) / a, H]); }
    const ok = hits.filter((p) => p[0] >= -1 && p[0] <= W + 1 && p[1] >= -1 && p[1] <= H + 1);
    if (ok.length >= 2) g.line(ok[0], ok[1], { c: o.c || col.ghost, w: o.w ?? 0.85, dash: o.dash ?? [5, 4] });
  };
  g.trace = (st, key, p, n = 150, o = {}) => {
    const a = (st[key] ||= []);
    const last = a[a.length - 1];
    if (!last || dist(last, p) > 1.1) a.push([p[0], p[1]]);
    if (a.length > n) a.splice(0, a.length - n);
    if (o.on !== false && a.length > 2) g.path(a, { c: o.c || col.accent, w: o.w ?? 0.85, a: o.a ?? 0.55 });
  };
  g.arrow = (a, b, o = {}) => {
    g.line(a, b, o);
    const t = ang(a, b), s = o.s ?? 4.5;
    g.path([pol(b, s, t + 2.5), b, pol(b, s, t - 2.5)], { c: o.c || col.ink, w: o.w ?? 1.1 });
  };
  g.spin = (c, r, cw = true, o = {}) => {
    const a0 = -0.8, a1 = 1.9;
    g.arc(c, r, a0, a1, { c: o.c || col.ghost, w: 0.9 });
    const e = pol(c, r, cw ? a1 : a0), t = (cw ? a1 + Math.PI / 2 : a0 - Math.PI / 2);
    g.path([pol(e, 4, t + 2.5), e, pol(e, 4, t - 2.5)], { c: o.c || col.ghost, w: 0.9 });
  };
  g.txt = (p, s, o = {}) => {
    ctx.save();
    ctx.font = o.font || '500 9.5px Barlow, sans-serif';
    ctx.fillStyle = o.c || col.ghost;
    ctx.globalAlpha = o.a ?? 1;
    ctx.textAlign = o.al || 'left';
    ctx.textBaseline = o.bl || 'alphabetic';
    ctx.fillText(s, p[0], p[1]);
    ctx.restore();
  };
  // small displacement plot: vals = array of 0..1, marker at index m
  g.plot = (x, y, w, h, vals, m, o = {}) => {
    g.path([[x, y], [x, y + h], [x + w, y + h]], { c: col.faint, w: 0.8 });
    const pts = vals.map((v, i) => [x + (i / (vals.length - 1)) * w, y + h - v * h]);
    g.path(pts, { c: o.c || col.accent, w: 1 });
    if (m != null) { const p = pts[Math.max(0, Math.min(pts.length - 1, Math.round(m * (vals.length - 1))))]; g.dot(p, 2.4, { c: col.accent }); g.line([p[0], y + h], p, { c: col.faint, w: 0.7, dash: [2, 2] }); }
    if (o.label) g.txt([x, y - 3], o.label);
  };
  return g;
}
