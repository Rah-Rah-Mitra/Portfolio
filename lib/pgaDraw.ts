// pgaDraw.ts — blueprint drawing kit. Every mechanism draws through this so the
// set reads as one drawing. Ported from design/mockups/pga-draw.js, trimmed to
// the methods the six mounted mechanisms use (gear/ring/rack/spring/arrow/spin/
// plot/ghost are in the mockup copy if a later one needs them).
//
// One deliberate divergence from the mockup: it defaulted `txt` to col.ghost
// (--color-neutral-500), which at 9.5px measures ~2.8:1 on the light ground and
// breaks the contrast rule CLAUDE.md pins. Rasterised text is invisible to axe,
// so that would have passed CI while failing the rule. The palette here splits
// the two uses — `label` (--color-neutral-700) for text, `ghost` for hairline
// construction lines — and `txt` defaults to `label`.
import { TAU, dist, mix, norm, pol, type MV, type Pt } from './pga';

export interface Palette {
  ink: string;
  accent: string;
  ghost: string;
  faint: string;
  paper: string;
  label: string;
}

export interface Style {
  c?: string;
  f?: string;
  w?: number;
  a?: number;
  dash?: number[];
  fill?: string;
  close?: boolean;
}

export interface Kit {
  W: number;
  H: number;
  col: Palette;
  reset(): void;
  st(o?: Style): Style;
  line(a: Pt, b: Pt, o?: Style): void;
  path(pts: Pt[], o?: Style): void;
  circle(c: Pt, r: number, o?: Style): void;
  arc(c: Pt, r: number, a0: number, a1: number, o?: Style): void;
  dot(c: Pt, r?: number, o?: Style): void;
  pin(c: Pt, o?: Style & { r?: number }): void;
  fix(c: Pt, dir?: number, o?: Style & { s?: number; r?: number }): void;
  bar(a: Pt, b: Pt, o?: Style & { pins?: boolean; r?: number }): void;
  rail(a: Pt, b: Pt, o?: Style & { w2?: number; ticks?: number }): void;
  box(c: Pt, w: number, h: number, a?: number, o?: Style): Pt[];
  poly(pts: Pt[], o?: Style & { hatch?: boolean; hs?: number }): void;
  hatch(pts: Pt[], o?: Style & { s?: number }): void;
  sheave(c: Pt, r: number, ph?: number, o?: Style): void;
  rope(pts: Pt[], o?: Style): void;
  gline(l: MV, o?: Style): void;
  trace(st: Record<string, unknown>, key: string, p: Pt, n?: number, o?: Style & { on?: boolean }): void;
  txt(p: Pt, s: string, o?: Style & { font?: string; al?: CanvasTextAlign; bl?: CanvasTextBaseline }): void;
}

export function kit(cv: HTMLCanvasElement, W: number, H: number, col: Palette): Kit {
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const pp = (pts: Pt[]) => { for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]); };
  const g = { W, H, col } as Kit;

  // Called only from an effect — never the render pass. App.tsx is prerendered,
  // so devicePixelRatio must not be read during render.
  g.reset = () => {
    const d = Math.min(2, (typeof window === 'undefined' ? 1 : window.devicePixelRatio) || 1);
    if (cv.width !== Math.round(W * d)) { cv.width = Math.round(W * d); cv.height = Math.round(H * d); }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.font = '500 9.5px Barlow, sans-serif';
    g.st();
  };
  g.st = (o: Style = {}) => {
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
    const u: Pt = [Math.cos(dir), Math.sin(dir)], p: Pt = [-u[1], u[0]], s = o.s ?? 9;
    const a: Pt = [c[0] + u[0] * s + p[0] * s * 0.8, c[1] + u[1] * s + p[1] * s * 0.8];
    const b: Pt = [c[0] + u[0] * s - p[0] * s * 0.8, c[1] + u[1] * s - p[1] * s * 0.8];
    g.path([c, a, b], { close: true, c: o.c || col.ink, w: 1 });
    g.hatch([a, b, [b[0] + u[0] * 4, b[1] + u[1] * 4], [a[0] + u[0] * 4, a[1] + u[1] * 4]], { s: 3.4 });
    g.pin(c, o);
  };
  g.bar = (a, b, o = {}) => { g.line(a, b, { c: o.c || col.ink, w: o.w ?? 2.4 }); if (o.pins !== false) { g.pin(a, o); g.pin(b, o); } };
  g.rail = (a, b, o = {}) => {
    const u = norm([b[0] - a[0], b[1] - a[1]]), p: Pt = [-u[1], u[0]], w = o.w2 ?? 5;
    for (const s of [1, -1]) g.line([a[0] + p[0] * w * s, a[1] + p[1] * w * s], [b[0] + p[0] * w * s, b[1] + p[1] * w * s], { c: o.c || col.ghost, w: 0.9 });
    const n = o.ticks ?? 0;
    for (let i = 0; i <= n; i++) { const q = mix(a, b, i / n); g.line([q[0] + p[0] * w, q[1] + p[1] * w], [q[0] + p[0] * (w + 3), q[1] + p[1] * (w + 3)], { c: col.faint, w: 0.8 }); }
  };
  g.box = (c, w, h, a = 0, o = {}) => {
    const co = Math.cos(a), si = Math.sin(a);
    const q: Pt[] = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [c[0] + x * co - y * si, c[1] + x * si + y * co] as Pt);
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
  g.sheave = (c, r, ph = 0, o = {}) => {
    g.circle(c, r, { c: o.c || col.ink, w: o.w ?? 1.3, fill: o.fill ?? col.paper });
    g.circle(c, r * 0.28, { c: o.c || col.ink, w: 1 });
    for (let i = 0; i < 4; i++) g.line(pol(c, r * 0.3, ph + (i * TAU) / 4), pol(c, r * 0.88, ph + (i * TAU) / 4), { c: col.faint, w: 0.9 });
    g.dot(c, 1.3, { c: o.c || col.ink });
  };
  g.rope = (pts, o = {}) => g.path(pts, { c: o.c || col.accent, w: o.w ?? 1.35, a: o.a ?? 1 });
  // draw a PGA line (a·e1 + b·e2 + c·e0) clipped to the frame
  g.gline = (l, o = {}) => {
    const a = l[2], b = l[4], c = l[1], hits: Pt[] = [];
    if (Math.abs(b) > 1e-9) { hits.push([0, -(c + a * 0) / b], [W, -(c + a * W) / b]); }
    if (Math.abs(a) > 1e-9) { hits.push([-(c + b * 0) / a, 0], [-(c + b * H) / a, H]); }
    const ok = hits.filter((p) => p[0] >= -1 && p[0] <= W + 1 && p[1] >= -1 && p[1] <= H + 1);
    if (ok.length >= 2) g.line(ok[0], ok[1], { c: o.c || col.ghost, w: o.w ?? 0.85, dash: o.dash ?? [5, 4] });
  };
  g.trace = (st, key, p, n = 150, o = {}) => {
    const a = (st[key] ||= []) as Pt[];
    const last = a[a.length - 1];
    if (!last || dist(last, p) > 1.1) a.push([p[0], p[1]]);
    if (a.length > n) a.splice(0, a.length - n);
    if (o.on !== false && a.length > 2) g.path(a, { c: o.c || col.accent, w: o.w ?? 0.85, a: o.a ?? 0.55 });
  };
  g.txt = (p, s, o = {}) => {
    ctx.save();
    ctx.font = o.font || '500 9.5px Barlow, sans-serif';
    ctx.fillStyle = o.c || col.label;
    ctx.globalAlpha = o.a ?? 1;
    ctx.textAlign = o.al || 'left';
    ctx.textBaseline = o.bl || 'alphabetic';
    ctx.fillText(s, p[0], p[1]);
    ctx.restore();
  };
  return g;
}
