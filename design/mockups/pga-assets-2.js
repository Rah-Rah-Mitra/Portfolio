// pga-assets-2.js — Linkages · Cams · Engines
import { TAU, pol, mix, lerp, dist, ang, clamp, norm, Rot, Tr, Mul, Mot, Ap, Join, Meet, Perp, Foot, CC, LC } from './pga.js';

const sin = Math.sin, cos = Math.cos, PI = Math.PI, sq = Math.sqrt;
// slider-crank closed form: piston offset along the bank axis
const slider = (r, l, th) => r * cos(th) + sq(Math.max(1, l * l - (r * sin(th)) ** 2));

export const ASSETS = [
{ id: 'LK-01', n: 'Four-bar crank-rocker', f: 'Linkages', d: 'crank', rate: 1.1,
  pga: 'C = circle(B, b) ∧ circle(D, c) — the dyad solve; branch chosen once and kept',
  i: 'Drag to turn the crank. The trace is the coupler curve — the reason four-bars are still designed by hand.',
  draw(g, io, st) {
    const c = g.col, A = [86, 176], D = [236, 176], a = 32, b = 140, r = 78;
    const th = io.u;
    const B = Ap(Rot(A[0], A[1], th), [A[0] + a, A[1]]);
    const C = CC(B, b, D, r, -1);
    const E = [B[0] + (C[0] - B[0]) * 0.52 - (C[1] - B[1]) * 0.34, B[1] + (C[1] - B[1]) * 0.52 + (C[0] - B[0]) * 0.34];
    g.circle(A, a, { c: c.faint, w: 0.7, dash: [3, 3] });
    if (io.traces !== false) g.trace(st, 'tr', E, 300);
    g.path([B, C, E], { close: true, c: c.ghost, w: 0.9, a: 0.8 });
    g.bar(A, B, { w: 2.6 }); g.bar(B, C, { w: 2.6 }); g.bar(C, D, { w: 2.6 });
    g.dot(E, 3.4, { c: c.accent });
    g.fix(A, -PI / 2, {}); g.fix(D, -PI / 2, {});
    g.ghost(A, D);
    g.txt([14, 208], 'a 32 · b 140 · c 78 · d 150   ·   Grashof: 182 < 218 ⇒ crank rocks');
    g.txt([14, 220], 'rocker sweep ' + (Math.abs(ang(D, C) * 57.3 + 90)).toFixed(0) + '°');
  } },

{ id: 'LK-02', n: 'Slider-crank', f: 'Linkages', d: 'crank', rate: 1.3,
  pga: 'slider = line(axis) ∧ circle(B, l): a line–circle meet instead of a circle–circle one',
  i: 'Drag to turn the crank. Rotation becomes stroke; the rod angle is what makes the motion non-sinusoidal.',
  draw(g, io, st) {
    const c = g.col, O = [84, 116], r = 40, l = 132, th = io.u;
    const B = Ap(Rot(O[0], O[1], th), [O[0] + r, O[1]]);
    const Pp = [O[0] + slider(r, l, th), O[1]];
    g.circle(O, r, { c: c.faint, w: 0.7, dash: [3, 3] });
    g.rail([O[0] + l - r + 4, O[1]], [O[0] + l + r + 14, O[1]], { w2: 17, ticks: 4 });
    g.gline(Join([0, O[1]], [1, O[1]]), { c: c.faint });
    g.bar(O, B, { w: 2.8 }); g.bar(B, Pp, { w: 2.4 });
    g.box(Pp, 26, 30, 0, { c: c.ink, w: 1.6 });
    g.fix(O, -PI / 2, {});
    g.arrow([O[0] + l - r, 174], [O[0] + l + r, 174], { c: c.accent, w: 1.1 });
    g.txt([14, 208], 'stroke 2r = ' + 2 * r + ' px   ·   rod ratio l/r = ' + (l / r).toFixed(1));
    g.txt([14, 220], 'x = r·cosθ + √(l² − r²sin²θ)   ·   the engine primitive');
  } },

{ id: 'LK-03', n: 'Scotch yoke', f: 'Linkages', d: 'crank', rate: 1.3,
  pga: 'pin constrained to a prismatic slot ⇒ x = r·cosθ exactly — a true sine, no rod term',
  i: 'Drag to turn the crank. Compare the plot with LK-02: the yoke is pure harmonic motion.',
  draw(g, io, st) {
    const c = g.col, O = [92, 100], r = 42, th = io.u;
    const pin = Ap(Rot(O[0], O[1], th), [O[0] + r, O[1]]);
    const x = O[0] + r * cos(th);
    g.circle(O, r, { c: c.faint, w: 0.7, dash: [3, 3] });
    g.line(O, pin, { c: c.ink, w: 2.6 }); g.dot(O, 2, {});
    g.path([[x - 12, O[1] - 52], [x + 12, O[1] - 52], [x + 12, O[1] + 52], [x - 12, O[1] + 52]], { close: true, c: c.ink, w: 1.6 });
    g.line([x - 12, O[1] - 52], [x - 12, O[1] + 52], { c: c.paper, w: 3 });
    g.rail([x - 12, O[1] - 52], [x - 12, O[1] + 52], { w2: 0.5, c: c.faint });
    g.line([x + 12, O[1]], [274, O[1]], { c: c.ink, w: 2.6 });
    g.box([264, O[1]], 22, 26, 0, { c: c.ink, w: 1.5 });
    g.dot(pin, 4, { c: c.accent });
    g.fix(O, -PI / 2, {});
    const vals = []; for (let i = 0; i <= 48; i++) vals.push(0.5 + 0.48 * cos((i / 48) * TAU));
    g.plot(30, 168, 120, 40, vals, ((th % TAU) + TAU) % TAU / TAU, { label: 'x(θ) — pure cosine' });
    g.txt([176, 200], 'stroke ' + 2 * r + ' px   ·   no rod obliquity');
  } },

{ id: 'LK-04', n: 'Whitworth quick-return', f: 'Linkages', d: 'crank', rate: 1.1,
  pga: 'slotted lever direction = join(pivot, pin); ram = axis ∧ circle(tip, rod)',
  i: 'Drag to drive. Cutting stroke slow, return fast — the asymmetry comes from the offset pivot alone.',
  draw(g, io, st) {
    const c = g.col, O = [118, 148], r = 34, Q = [118, 196], R = 96, th = io.u;
    const pin = Ap(Rot(O[0], O[1], th), [O[0] + r, O[1]]);
    const al = ang(Q, pin);
    const tip = pol(Q, R, al);
    const ram = LC(tip, [tip[0] + 1, tip[1]], [0, 0], 0, 1);
    const rod = 96, ry = 46;
    const rx = tip[0] + sq(Math.max(1, rod * rod - (tip[1] - ry) ** 2));
    g.circle(O, r, { c: c.faint, w: 0.7, dash: [3, 3] });
    g.rail(Q, pol(Q, R + 6, al), { w2: 5, c: c.ink });
    g.line(Q, tip, { c: c.ink, w: 1.4 });
    g.line(O, pin, { c: c.ghost, w: 2.4 });
    g.dot(pin, 4, { c: c.accent });
    g.rail([120, ry], [292, ry], { w2: 14, ticks: 4 });
    g.bar(tip, [rx, ry], { w: 2.2 });
    g.box([rx, ry], 28, 22, 0, { c: c.ink, w: 1.6 });
    g.fix(O, 0, { s: 8 }); g.fix(Q, -PI / 2, {});
    g.txt([14, 210], 'ram x ' + rx.toFixed(0) + '   ·   lever ' + (al * 57.3).toFixed(0) + '°   ·   ratio ≈ 1.9 : 1');
    g.txt([14, 222], 'shapers and slotting machines ran on this');
  } },

{ id: 'LK-05', n: 'Over-centre toggle clamp', f: 'Linkages', d: 'toggle', on0: false,
  pga: 'at lock the two links are collinear: the join degenerates, so dF/dx → ∞',
  i: 'Click to throw the handle. Force multiplies without limit as the links line up — that is the lock.',
  draw(g, io, st) {
    const c = g.col, A = [72, 60], B0 = [72, 156], t = io.tgl;
    const hA = lerp(-2.1, -0.42, t);
    const H = pol(A, 74, hA);
    const linkL = 62, plate = 168;
    const jy = lerp(96, 150, t), J = [A[0] + 22 + 30 * (1 - t), jy];
    const foot = CC(J, linkL, [A[0] + 132, plate], 0.001, 1);
    const py = clamp(J[1] + sq(Math.max(1, linkL * linkL - (A[0] + 132 - J[0]) ** 2)), 0, 999);
    const Pp = [A[0] + 132, Math.min(plate, py)];
    g.line([40, plate + 14], [292, plate + 14], { c: c.ink, w: 1.8 });
    g.hatch([[40, plate + 14], [292, plate + 14], [292, plate + 26], [40, plate + 26]], { s: 5 });
    g.box([A[0] + 132, plate + 4], 108, 18, 0, { c: c.ink, w: 1.4 });
    g.bar(A, J, { w: 2.6 });
    g.bar(J, Pp, { w: 2.6 });
    g.line(A, H, { c: c.accent, w: 3.4 });
    g.dot(H, 4, { c: c.accent });
    g.box(Pp, 26, 14, 0, { c: c.ink, w: 1.6 });
    g.fix(A, 0, { s: 10 });
    g.ghost([A[0], A[1]], [A[0], plate]);
    const col = t > 0.9 ? c.accent : c.ghost;
    g.txt([14, 206], t > 0.9 ? 'LOCKED — links collinear, mechanical advantage unbounded' : 'OPEN — click to throw', { c: col });
    g.txt([14, 220], 'handle ' + (hA * 57.3 + 180).toFixed(0) + '°   ·   over-centre by design, not by friction');
  } },

{ id: 'LK-06', n: 'Bell crank', f: 'Linkages', d: 'crank', rate: 0.8,
  pga: 'two dyads on one rotor: each rod end = its axis line ∧ circle(arm end, rod)',
  i: 'Drag to drive the horizontal push-rod. The crank turns a straight pull through 90°, with a lever ratio.',
  draw(g, io, st) {
    const c = g.col, C = [150, 130], r1 = 62, r2 = 40, th = -0.5 + 0.5 * sin(io.u);
    const A1 = pol(C, r1, th + PI), A2 = pol(C, r2, th + PI / 2);
    const L1 = 78, L2 = 70;
    const sx = A1[0] - sq(Math.max(1, L1 * L1 - (A1[1] - 130) ** 2));
    const S1 = [sx, 130];
    const sy = A2[1] - sq(Math.max(1, L2 * L2 - (A2[0] - 240) ** 2));
    const S2 = [240, sy];
    g.rail([26, 130], [96, 130], { w2: 11, ticks: 3 });
    g.rail([240, 30], [240, 96], { w2: 11, ticks: 3 });
    g.path([A1, C, A2], { c: c.ink, w: 3 });
    g.arc(C, 15, ang(C, A1), ang(C, A2), { c: c.faint, w: 0.9 });
    g.bar(S1, A1, { w: 2.2 }); g.bar(A2, S2, { w: 2.2 });
    g.box(S1, 26, 20, 0, { c: c.ink, w: 1.5 }); g.box(S2, 20, 24, 0, { c: c.ink, w: 1.5 });
    g.fix(C, -PI / 2, {});
    g.arrow([44, 158], [92, 158], { c: c.accent, w: 1.1 });
    g.arrow([268, 92], [268, 44], { c: c.accent, w: 1.1 });
    g.txt([14, 206], 'arms 62 / 40   ·   ratio 1.55 : 1   ·   input ⟂ output');
    g.txt([14, 220], 'brakes, throttles, aircraft controls');
  } },

{ id: 'LK-07', n: 'Lazy tongs', f: 'Linkages', d: 'toggle', on0: true,
  pga: 'n identical scissor cells: reach = n·2ℓ·cos(φ/2), one angle drives the whole chain',
  i: 'Click to extend or retract. Six cells multiply a short input into a long, straight-line reach.',
  draw(g, io, st) {
    const c = g.col, n = 6, l = 34, t = io.tgl;
    const ph = lerp(1.32, 0.34, t);
    const dx = 2 * l * cos(ph / 2), h = 2 * l * sin(ph / 2);
    const y = 108;
    for (let i = 0; i < n; i++) {
      const x0 = 26 + i * dx;
      g.line([x0, y - h / 2], [x0 + dx, y + h / 2], { c: c.ink, w: 2 });
      g.line([x0, y + h / 2], [x0 + dx, y - h / 2], { c: c.ink, w: 2 });
      g.pin([x0 + dx / 2, y], { r: 2.6 });
      g.pin([x0, y - h / 2], { r: 2.4 }); g.pin([x0, y + h / 2], { r: 2.4 });
    }
    const tipX = 26 + n * dx;
    g.pin([tipX, y - h / 2], { r: 2.4 }); g.pin([tipX, y + h / 2], { r: 2.4 });
    g.fix([26, y - h / 2], PI, { s: 9 }); g.fix([26, y + h / 2], PI, { s: 9 });
    g.box([tipX + 10, y], 16, h + 6, 0, { c: c.accent, w: 1.6 });
    g.ghost([26, y], [300, y]);
    g.arrow([26, 178], [tipX, 178], { c: c.accent, w: 1.1 });
    g.txt([14, 200], 'reach ' + (tipX - 26).toFixed(0) + ' px   ·   cell angle ' + (ph * 57.3).toFixed(0) + '°   ·   gain ' + n + '×');
    g.txt([14, 214], 'the same cell repeated is the whole design — see DP-01 for the vertical case');
  } },

{ id: 'LK-08', n: 'Peaucellier–Lipkin cell', f: 'Linkages', d: 'crank', rate: 0.9,
  pga: 'inversion: |OA|·|OP| = s² − r², so a circle through O maps to a straight line — exactly',
  i: 'Drag to sweep the driving crank. P runs dead straight — no approximation, unlike LK-09.',
  draw(g, io, st) {
    const c = g.col, O = [58, 116], q = 32, Q = [O[0] + q, O[1]], s = 66, r = 36;
    const phi = 0.92 * sin(io.u);
    const A = pol(Q, q, phi + PI);
    const dOA = dist(O, A) || 1;
    const B = CC(O, s, A, r, 1), Cp = CC(O, s, A, r, -1);
    const k = s * s - r * r;
    const Pp = [O[0] + ((A[0] - O[0]) * k) / (dOA * dOA), O[1] + ((A[1] - O[1]) * k) / (dOA * dOA)];
    g.circle(Q, q, { c: c.faint, w: 0.7, dash: [3, 3] });
    g.bar(Q, A, { w: 1.8, c: c.ghost });
    g.bar(O, B, { w: 2.2 }); g.bar(O, Cp, { w: 2.2 });
    g.bar(A, B, { w: 2 }); g.bar(A, Cp, { w: 2 });
    g.bar(B, Pp, { w: 2 }); g.bar(Cp, Pp, { w: 2 });
    if (io.traces !== false) g.trace(st, 'tr', Pp, 220, { c: c.accent });
    g.ghost([O[0] + k / (2 * q), 24], [O[0] + k / (2 * q), 208]);
    g.dot(Pp, 4, { c: c.accent });
    g.fix(O, -PI / 2, {}); g.fix(Q, -PI / 2, {});
    g.txt([14, 208], 's 66 · r 36 · q 32   ·   |OA|·|OP| = ' + k + '   ·   x_P = ' + (O[0] + k / (2 * q)).toFixed(0));
    g.txt([14, 220], 'the 1864 answer to Watt’s straight-line problem');
  } },

{ id: 'LK-09', n: 'Chebyshev straight-line', f: 'Linkages', d: 'crank', rate: 1,
  pga: 'coupler midpoint of a 4:5:2:5 four-bar — approximate, but with only four links',
  i: 'Drag to drive. The mid-coupler point holds a straight path across the middle third of its travel.',
  draw(g, io, st) {
    const c = g.col, k = 9, A = [142, 188], D = [A[0] + 4 * k, 188], cr = 5 * k, cp = 2 * k;
    const th = -PI / 2 + 1.15 * sin(io.u);
    const B = pol(A, cr, th);
    const Cc = CC(B, cp, D, cr, -1);
    const M = mix(B, Cc, 0.5);
    if (io.traces !== false) g.trace(st, 'tr', M, 260);
    g.bar(A, B, { w: 2.4 }); g.bar(B, Cc, { w: 2.4 }); g.bar(Cc, D, { w: 2.4 });
    g.dot(M, 3.6, { c: c.accent });
    g.ghost([84, M[1]], [300, M[1]]);
    g.ghost([84, 188 - 4.5 * k], [300, 188 - 4.5 * k]);
    g.fix(A, -PI / 2, {}); g.fix(D, -PI / 2, {});
    g.txt([14, 208], 'links 4 : 5 : 2 : 5   ·   midpoint height ' + (188 - M[1]).toFixed(0) + ' px');
    g.txt([14, 220], 'deviation under a pixel across the flat — good enough to build');
  } },

{ id: 'LK-10', n: 'Walking leg (coupler gait)', f: 'Linkages', d: 'crank', rate: 1.2,
  pga: 'foot = coupler frame extended: Ap(motor(B→C), local foot point) — one crank, whole gait',
  i: 'Drag to walk the crank. The traced foot path is the gait: flat stance below, high swing above.',
  draw(g, io, st) {
    const c = g.col, A = [116, 58], D = [186, 58], a = 20, b = 84, r = 54;
    const th = io.u;
    const B = pol(A, a, th);
    const Cc = CC(B, b, D, r, 1);
    const u = norm([Cc[0] - B[0], Cc[1] - B[1]]);
    const F = [Cc[0] + u[0] * 62 - u[1] * 26, Cc[1] + u[1] * 62 + u[0] * 26];
    g.line([16, 198], [304, 198], { c: c.ink, w: 1.4 });
    g.hatch([[16, 198], [304, 198], [304, 210], [16, 210]], { s: 5 });
    if (io.traces !== false) g.trace(st, 'tr', F, 400, { a: 0.7 });
    g.circle(A, a, { c: c.faint, w: 0.7, dash: [3, 3] });
    g.bar(A, B, { w: 2.4 }); g.bar(B, Cc, { w: 2.2 }); g.bar(Cc, D, { w: 2.2 });
    g.path([B, Cc, F], { close: true, c: c.ghost, w: 1, a: 0.85 });
    g.bar(Cc, F, { w: 2.6 });
    g.dot(F, 3.6, { c: c.accent });
    g.fix(A, -PI / 2, {}); g.fix(D, -PI / 2, {});
    g.txt([14, 224], 'one DOF · foot height ' + (198 - F[1]).toFixed(0) + ' px   ·   exact Jansen and Klann constants: queued');
  } },

// ── Cams ─────────────────────────────────────────────────────────────────
{ id: 'CM-01', n: 'Eccentric disc + roller follower', f: 'Cams', d: 'crank', rate: 1.2,
  pga: 'disc centre = Ap(Rot(shaft, θ), centre + e); follower = axis ∧ offset circle',
  i: 'Drag to turn the cam. An eccentric circle gives exactly harmonic lift — the simplest cam there is.',
  draw(g, io, st) {
    const c = g.col, S = [104, 128], e = 20, R = 46, rr = 13, th = io.u;
    const Dc = Ap(Rot(S[0], S[1], th), [S[0] + e, S[1]]);
    const fy = Dc[1] - (R + rr);
    g.circle(Dc, R, { c: c.ink, w: 1.5 });
    g.circle(Dc, 3, { c: c.faint, w: 0.9 });
    g.circle(S, e, { c: c.faint, w: 0.7, dash: [3, 3] });
    g.dot(S, 2.2, {});
    g.circle([S[0], fy], rr, { c: c.ink, w: 1.4 });
    g.line([S[0], fy], [S[0], 22], { c: c.ink, w: 3 });
    g.rail([S[0] - 0, 26], [S[0], 60], { w2: 9, c: c.ghost });
    g.ghost([S[0], 20], [S[0], 190]);
    g.fix(S, -PI / 2, { s: 0.1 });
    const vals = []; for (let i = 0; i <= 48; i++) vals.push(0.5 + 0.46 * -cos((i / 48) * TAU));
    g.plot(190, 96, 104, 46, vals, (((th % TAU) + TAU) % TAU) / TAU, { label: 'lift s(θ)' });
    g.txt([190, 168], 'e 20 · R 46 · roller 13');
    g.txt([190, 182], 'lift 2e = 40 px');
    g.txt([14, 214], 'pressure angle peaks at mid-lift — where cams wear');
  } },

{ id: 'CM-02', n: 'Heart cam + flat follower', f: 'Cams', d: 'crank', rate: 0.9,
  pga: 'flat-face contact = max over φ of r(θ+φ)·cosφ — a supporting-line solve each frame',
  i: 'Drag to turn. The constant-velocity rise and fall reads as straight ramps on the plot.',
  draw(g, io, st) {
    const c = g.col, S = [110, 118], r0 = 26, h = 34, th = io.u;
    const prof = (p) => { const x = (((p % TAU) + TAU) % TAU) / TAU; return r0 + h * (x < 0.5 ? x * 2 : 2 - x * 2); };
    const pts = []; for (let i = 0; i <= 160; i++) { const p = (i / 160) * TAU; pts.push(pol(S, prof(p - th), p)); }
    g.path(pts, { close: true, c: c.ink, w: 1.5 });
    let s = 0; for (let i = -30; i <= 30; i++) { const f = (i / 30) * 1.2; s = Math.max(s, prof(-PI / 2 - th + f) * cos(f)); }
    const fy = S[1] - s;
    g.line([S[0] - 40, fy], [S[0] + 40, fy], { c: c.ink, w: 2.4 });
    g.box([S[0], fy - 12], 26, 22, 0, { c: c.ink, w: 1.4 });
    g.line([S[0], fy - 22], [S[0], 22], { c: c.ink, w: 3 });
    g.rail([S[0], 26], [S[0], 54], { w2: 9, c: c.ghost });
    g.circle(S, r0, { c: c.faint, w: 0.7, dash: [3, 3] }); g.dot(S, 2.2, {});
    const vals = []; for (let i = 0; i <= 48; i++) { const x = i / 48; vals.push(x < 0.5 ? x * 2 : 2 - x * 2); }
    g.plot(196, 104, 100, 44, vals, (((th % TAU) + TAU) % TAU) / TAU, { label: 'constant velocity' });
    g.txt([196, 168], 'base 26 · rise 34 px');
    g.txt([14, 214], 'infinite acceleration at the corners — real cams round them');
  } },

{ id: 'CM-03', n: 'Snail (drop) cam', f: 'Cams', d: 'crank', rate: 0.9,
  pga: 'r(φ) rises monotonically then drops: the follower is released, gravity does the return',
  i: 'Drag to turn. Slow lift, instant drop — how a striking clock or a trip hammer resets.',
  draw(g, io, st) {
    const c = g.col, S = [112, 116], r0 = 22, h = 44, th = io.u;
    const prof = (p) => { const x = (((p % TAU) + TAU) % TAU) / TAU; return r0 + h * Math.min(1, x / 0.86); };
    const pts = []; for (let i = 0; i <= 170; i++) { const p = (i / 170) * TAU * 0.995; pts.push(pol(S, prof(p - th), p)); }
    pts.push(pol(S, r0, -th));
    g.path(pts, { close: true, c: c.ink, w: 1.5 });
    const s = prof(-PI / 2 - th);
    const fy = S[1] - s;
    g.line([S[0], fy], [S[0], 24], { c: c.ink, w: 3 });
    g.path([[S[0] - 8, fy + 10], [S[0], fy], [S[0] + 8, fy + 10]], { c: c.accent, w: 1.6 });
    g.rail([S[0], 28], [S[0], 56], { w2: 9, c: c.ghost });
    g.circle(S, r0, { c: c.faint, w: 0.7, dash: [3, 3] }); g.dot(S, 2.2, {});
    const vals = []; for (let i = 0; i <= 48; i++) { const x = i / 48; vals.push(Math.min(1, x / 0.86)); }
    g.plot(200, 106, 96, 44, vals, (((th % TAU) + TAU) % TAU) / TAU, { label: 'knife-edge lift' });
    g.txt([200, 170], 'drop at 310°');
    g.txt([14, 214], 'knife-edge follower: highest contact stress, simplest geometry');
  } },

{ id: 'CM-04', n: 'Disc cam + oscillating follower', f: 'Cams', d: 'crank', rate: 1,
  pga: 'solve β so |roller(β) − cam| = r(φ) + r_roller — a one-dimensional contact bisection',
  i: 'Drag to turn. The arm angle is solved against the profile each frame, not driven by a curve.',
  draw(g, io, st) {
    const c = g.col, S = [116, 122], r0 = 30, h = 26, th = io.u, Q = [258, 62], L = 92, rr = 11;
    const prof = (p) => r0 + h * (0.5 - 0.5 * cos(2 * (((p % TAU) + TAU) % TAU)));
    const pts = []; for (let i = 0; i <= 170; i++) { const p = (i / 170) * TAU; pts.push(pol(S, prof(p - th), p)); }
    g.path(pts, { close: true, c: c.ink, w: 1.5 });
    let lo = 1.9, hi = 3.5;
    for (let k = 0; k < 22; k++) {
      const m = (lo + hi) / 2, Rp = pol(Q, L, m);
      const d = dist(S, Rp) - (prof(ang(S, Rp) - th) + rr);
      if (d > 0) lo = m; else hi = m;
    }
    const b = (lo + hi) / 2, Rp = pol(Q, L, b);
    g.arc(Q, L, 1.9, 3.5, { c: c.faint, w: 0.7, dash: [3, 3] });
    g.line(Q, Rp, { c: c.ink, w: 2.6 });
    g.circle(Rp, rr, { c: c.ink, w: 1.4 });
    g.line(S, Rp, { c: c.accent, w: 0.8, dash: [3, 2] });
    g.fix(Q, -PI / 2, {}); g.circle(S, r0, { c: c.faint, w: 0.7, dash: [3, 3] }); g.dot(S, 2.2, {});
    g.txt([14, 202], 'arm ' + ((b - 1.9) * 57.3).toFixed(0) + '° of ' + ((1.6) * 57.3).toFixed(0) + '° sweep   ·   twin-lobe cam, 2 beats/rev');
    g.txt([14, 216], 'valve gear, textile machinery, indexing arms');
  } },

{ id: 'CM-05', n: 'Cam from a displacement law', f: 'Cams', d: 'crank', rate: 0.9,
  pga: 'motion → geometry: r(φ) = r₀ + s(φ) generated from the diagram, then rolled to the follower',
  i: 'Drag to turn; hover higher or lower in the frame to reshape the rise — the profile regenerates live.',
  draw(g, io, st) {
    const c = g.col, S = [108, 122], r0 = 26, th = io.u;
    const h = io.hover ? clamp(52 - (io.my - 40) * 0.34, 8, 48) : 30;
    const law = (x) => {
      x = ((x % 1) + 1) % 1;
      if (x < 0.3) { const t = x / 0.3; return t - sin(TAU * t) / TAU; }
      if (x < 0.45) return 1;
      if (x < 0.75) { const t = (x - 0.45) / 0.3; return 1 - (t - sin(TAU * t) / TAU); }
      return 0;
    };
    const prof = (p) => r0 + h * law((((p % TAU) + TAU) % TAU) / TAU);
    const pts = []; for (let i = 0; i <= 190; i++) { const p = (i / 190) * TAU; pts.push(pol(S, prof(p - th), p)); }
    g.path(pts, { close: true, c: c.ink, w: 1.5 });
    const rr = 11, s = prof(-PI / 2 - th);
    const fy = S[1] - s - rr;
    g.circle([S[0], fy], rr, { c: c.ink, w: 1.4 });
    g.line([S[0], fy], [S[0], 26], { c: c.ink, w: 3 });
    g.rail([S[0], 28], [S[0], 54], { w2: 9, c: c.ghost });
    g.circle(S, r0, { c: c.faint, w: 0.7, dash: [3, 3] }); g.dot(S, 2.2, {});
    const vals = []; for (let i = 0; i <= 60; i++) vals.push(law(i / 60));
    g.plot(196, 100, 104, 48, vals, (((th % TAU) + TAU) % TAU) / TAU, { label: 'rise · dwell · fall · dwell' });
    g.txt([196, 164], 'cycloidal blend');
    g.txt([196, 178], 'lift ' + h.toFixed(0) + ' px');
    g.txt([14, 214], 'this is the useful direction: state the motion, get the part');
  } },

// ── Engines ──────────────────────────────────────────────────────────────
{ id: 'EN-01', n: 'Single cylinder + valve train', f: 'Engines', d: 'crank', rate: 2.2,
  pga: 'crank motor drives piston (line ∧ circle) and camshaft at θ/2 — one clock, four strokes',
  i: 'Drag to turn the crank. Valves are opened by cam lobes at half crank speed; the stroke label follows.',
  draw(g, io, st) {
    const c = g.col, O = [104, 176], r = 26, l = 86, th = io.u;
    const py = O[1] - slider(r, l, th - PI / 2);
    const B = pol(O, r, th - PI / 2);
    g.path([[O[0] - 30, 62], [O[0] - 30, 150], [O[0] + 30, 150], [O[0] + 30, 62]], { c: c.ink, w: 1.6 });
    g.hatch([[O[0] - 40, 44], [O[0] + 40, 44], [O[0] + 40, 62], [O[0] - 40, 62]], { s: 5 });
    g.path([[O[0] - 40, 62], [O[0] - 40, 44], [O[0] + 40, 44], [O[0] + 40, 62]], { c: c.ink, w: 1.6 });
    g.box([O[0], py], 56, 26, 0, { c: c.ink, w: 1.8 });
    g.bar(B, [O[0], py], { w: 2.2 });
    g.circle(O, r + 14, { c: c.ghost, w: 1.2 });
    g.line(O, pol(O, r + 12, th * 1 - PI / 2), { c: c.faint, w: 1 });
    g.fix(O, -PI / 2, { s: 0.1 });
    const ph = (((th / 2) % TAU) + TAU) % TAU;
    const lobe = (a) => Math.max(0, cos(a)) ** 6 * 12;
    const iv = lobe(ph - 0.2), ev = lobe(ph - PI - 0.1);
    for (const [x, open, lbl] of [[O[0] - 18, iv, 'IN'], [O[0] + 18, ev, 'EX']]) {
      const Cc = [x, 26];
      g.circle(Cc, 9, { c: c.ghost, w: 1.1 });
      g.line(Cc, pol(Cc, 9, ph * (lbl === 'IN' ? 1 : 1) - PI / 2), { c: c.faint, w: 1 });
      g.line([x, 36], [x, 52 + open], { c: c.ink, w: 2.4 });
      g.path([[x - 9, 52 + open], [x + 9, 52 + open], [x, 60 + open]], { close: true, c: open > 1 ? c.accent : c.ink, w: 1.4 });
      g.txt([x - 6, 20], lbl, { c: c.ghost });
    }
    const strokes = ['INTAKE', 'COMPRESSION', 'POWER', 'EXHAUST'];
    const si = Math.floor((((th % (2 * TAU)) + 2 * TAU) % (2 * TAU)) / (PI / 1)) % 4;
    g.txt([176, 120], strokes[si], { c: c.accent, font: '600 14px "Barlow Condensed", sans-serif' });
    g.txt([176, 138], 'crank ' + ((th / TAU) % 1).toFixed(2) + ' rev');
    g.txt([176, 152], 'cam at θ/2 — 1 lobe pass');
    g.txt([176, 166], 'per 2 crank turns');
    g.txt([14, 214], 'bore ' + 56 + ' · stroke ' + 2 * r + ' · rod ' + l + ' px');
  } },

{ id: 'EN-02', n: 'Inline-four', f: 'Engines', d: 'crank', rate: 2.4,
  pga: 'four throws at 0·180·180·0 on one rotor; each piston its own line ∧ circle solve',
  i: 'Drag to turn. Throw phasing gives the 1-3-4-2 firing order and the balance an inline-four is known for.',
  draw(g, io, st) {
    const c = g.col, y = 178, r = 20, l = 74, th = io.u, ph = [0, PI, PI, 0], xs = [56, 126, 196, 266];
    g.line([28, y + 26], [292, y + 26], { c: c.ink, w: 1.6 });
    g.hatch([[28, y + 26], [292, y + 26], [292, y + 36], [28, y + 36]], { s: 5 });
    g.line([40, y], [284, y], { c: c.ghost, w: 1.2 });
    xs.forEach((x, i) => {
      const O = [x, y], a = th - PI / 2 + ph[i];
      const py = y - slider(r, l, a);
      g.path([[x - 20, 40], [x - 20, 120], [x + 20, 120], [x + 20, 40]], { c: c.ink, w: 1.4 });
      g.hatch([[x - 26, 30], [x + 26, 30], [x + 26, 40], [x - 26, 40]], { s: 4.5 });
      g.box([x, py], 38, 20, 0, { c: c.ink, w: 1.6 });
      const B = pol(O, r, a);
      g.bar(B, [x, py], { w: 2 });
      g.circle(O, r, { c: c.faint, w: 0.7, dash: [2, 3] });
      g.dot(O, 2, {});
      g.txt([x - 3, y + 18], String(i + 1), { c: c.ghost });
    });
    g.txt([14, 210], 'firing order 1-3-4-2   ·   throws 0° 180° 180° 0°   ·   ' + (((th / TAU) % 1) * 720).toFixed(0) + '° into the cycle');
    g.txt([14, 222], 'primary forces cancel in pairs; secondary does not — the inline-four buzz');
  } },

{ id: 'EN-03', n: 'V8, 90° banks', f: 'Engines', d: 'crank', rate: 2,
  pga: 'per-bank motor: rotate the axis, then solve the same slider dyad in the rotated frame',
  i: 'Drag to turn. Four throws at 90°, two rods per throw — every bank sees an even 90° firing interval.',
  draw(g, io, st) {
    const c = g.col, O = [160, 176], r = 22, l = 78, th = io.u;
    const banks = [-PI / 4, PI / 4];
    const thr = [0, PI / 2, PI, (3 * PI) / 2];
    g.circle(O, r, { c: c.faint, w: 0.7, dash: [2, 3] });
    g.circle(O, 30, { c: c.ghost, w: 1.1 });
    banks.forEach((bk, bi) => {
      const dir = [sin(bk), -cos(bk)];
      for (let i = 0; i < 4; i++) {
        const a = th - PI / 2 + thr[i] + (bi ? 0 : 0);
        const off = (i - 1.5) * 15;
        const base = [O[0] + dir[0] * 26 + -dir[1] * off * 0, O[1] + dir[1] * 26];
        const s = slider(r, l, a - bk) - 26 + i * 0;
        const Pp = [O[0] + dir[0] * (s + 30 + i * 12), O[1] + dir[1] * (s + 30 + i * 12)];
        const B = pol(O, r, a);
        g.bar(B, Pp, { w: 1.6, pins: false });
        g.box(Pp, 26, 15, bk, { c: c.ink, w: 1.4 });
        g.dot(B, 2, { c: c.accent });
      }
      const far = [O[0] + dir[0] * 132, O[1] + dir[1] * 132];
      g.line([O[0] + dir[0] * 34 - dir[1] * 30, O[1] + dir[1] * 34 + dir[0] * 30], [far[0] - dir[1] * 30, far[1] + dir[0] * 30], { c: c.ink, w: 1.4 });
      g.line([O[0] + dir[0] * 34 + dir[1] * 34, O[1] + dir[1] * 34 - dir[0] * 34], [far[0] + dir[1] * 34, far[1] - dir[0] * 34], { c: c.ink, w: 1.4 });
    });
    g.dot(O, 2.4, {});
    g.fix(O, -PI / 2, { s: 0.1 });
    g.txt([14, 208], '90° V · 4 throws · 8 rods   ·   firing every 90° of crank');
    g.txt([14, 222], 'flat-plane crank shown; a cross-plane crank reorders the same geometry');
  } },

{ id: 'EN-04', n: 'Radial five', f: 'Engines', d: 'crank', rate: 1.8,
  pga: 'five cylinder axes = five rotated frames sharing one crank pin; s = e·cosψ + √(l²−e²sin²ψ)',
  i: 'Drag to turn. One crank pin, five rods — the piston nearest top-dead-centre changes every 144°.',
  draw(g, io, st) {
    const c = g.col, O = [160, 118], e = 18, l = 74, th = io.u;
    const pin = pol(O, e, th);
    g.circle(O, e, { c: c.faint, w: 0.7, dash: [2, 3] });
    g.circle(O, 26, { c: c.ghost, w: 1.2 });
    for (let i = 0; i < 5; i++) {
      const psi = -PI / 2 + (i * TAU) / 5;
      const dir = [cos(psi), sin(psi)];
      const s = e * cos(th - psi) + sq(Math.max(1, l * l - (e * sin(th - psi)) ** 2));
      const Pp = [O[0] + dir[0] * s, O[1] + dir[1] * s];
      const B = [O[0] + dir[0] * (s + 22), O[1] + dir[1] * (s + 22)];
      g.line([O[0] + dir[0] * 30 - dir[1] * 17, O[1] + dir[1] * 30 + dir[0] * 17], [O[0] + dir[0] * 96 - dir[1] * 17, O[1] + dir[1] * 96 + dir[0] * 17], { c: c.ink, w: 1.3 });
      g.line([O[0] + dir[0] * 30 + dir[1] * 17, O[1] + dir[1] * 30 - dir[0] * 17], [O[0] + dir[0] * 96 + dir[1] * 17, O[1] + dir[1] * 96 - dir[0] * 17], { c: c.ink, w: 1.3 });
      g.path([[O[0] + dir[0] * 96 - dir[1] * 17, O[1] + dir[1] * 96 + dir[0] * 17], [O[0] + dir[0] * 96 + dir[1] * 17, O[1] + dir[1] * 96 - dir[0] * 17]], { c: c.ink, w: 1.3 });
      g.box(Pp, 30, 16, psi + PI / 2, { c: c.ink, w: 1.5 });
      g.bar(pin, Pp, { w: 1.6, pins: false });
      g.txt([O[0] + dir[0] * 106 - 3, O[1] + dir[1] * 106 + 3], String(i + 1), { c: c.ghost });
    }
    g.dot(pin, 3.4, { c: c.accent });
    g.dot(O, 2.2, {});
    g.txt([14, 214], 'firing order 1-3-5-2-4   ·   e ' + e + ' · rod ' + l + '   ·   master rod carries the four slaves');
  } },

{ id: 'EN-05', n: 'Wankel rotary', f: 'Engines', d: 'crank', rate: 1.5,
  pga: 'rotor motor = Tr(e·[cos3α, sin3α]) ∘ Rot(centre, α): 3:1 shaft-to-rotor, geometrically',
  i: 'Drag to turn the eccentric shaft. Rotor tips stay on the epitrochoid housing at every angle.',
  draw(g, io, st) {
    const c = g.col, O = [160, 112], e = 16, R = 62, al = io.u / 3;
    const hs = []; for (let i = 0; i <= 200; i++) { const p = (i / 200) * TAU; hs.push([O[0] + e * cos(3 * p) + R * cos(p), O[1] + e * sin(3 * p) + R * sin(p)]); }
    g.path(hs, { close: true, c: c.ink, w: 1.6 });
    const Cc = [O[0] + e * cos(3 * al), O[1] + e * sin(3 * al)];
    g.circle(O, e, { c: c.faint, w: 0.7, dash: [3, 3] });
    g.line(O, Cc, { c: c.ghost, w: 2 });
    const M = Mul(Tr(Cc[0] - O[0], Cc[1] - O[1]), Rot(O[0], O[1], al));
    const tips = [0, 1, 2].map((i) => Ap(M, [O[0] + R * cos((i * TAU) / 3), O[1] + R * sin((i * TAU) / 3)]));
    const face = [];
    for (let i = 0; i < 3; i++) {
      const a0 = tips[i], a1 = tips[(i + 1) % 3];
      const m = mix(a0, a1, 0.5), nrm = norm([m[0] - Cc[0], m[1] - Cc[1]]);
      const bulge = [m[0] + nrm[0] * 13, m[1] + nrm[1] * 13];
      face.push(a0, mix(mix(a0, bulge, 0.6), bulge, 0.4), bulge, mix(mix(a1, bulge, 0.6), bulge, 0.4));
    }
    g.path(face, { close: true, c: c.ink, w: 1.5 });
    g.circle(Cc, 9, { c: c.ghost, w: 1.1 });
    tips.forEach((t) => g.dot(t, 2.6, { c: c.accent }));
    g.dot(O, 2.2, {});
    g.txt([14, 206], 'shaft 3α : rotor α   ·   e ' + e + ' · R ' + R + '   ·   3 chambers, 1 rotor');
    g.txt([14, 220], 'housing is the epitrochoid the tips generate — geometry, not tolerance');
  } },
];
