// pga-assets-1.js — Rigid motions · Pulleys & cable · Gears · Motion transformers · Constraints
import { TAU, pol, mix, lerp, dist, ang, clamp, norm, P, xy, L, Rot, Tr, Mul, Mot, Ap, Slerp, Join, Meet, Perp, Foot, CC, LC, Tan } from './pga.js';

const sin = Math.sin, cos = Math.cos, PI = Math.PI, hyp = Math.hypot;
// External mesh phasing as a constraint: tooth of A falls in a gap of B.
export const mesh = (phA, nA, nB, al) => al + PI + PI / nB - (nA / nB) * (phA - al);
export const meshInt = (phP, nP, nR, al) => al + (nP / nR) * (phP - al) + PI / nR;

export const ASSETS = [
{ id: 'RM-01', n: 'Screw motion', f: 'Rigid motions', d: 'crank', rate: 1.1,
  pga: 'M = Tr(d·û) ∘ Rot(axis, θ), both about one axis — a single motor, not two steps',
  i: 'Drag ← → to advance the screw by hand; release and it resumes. Marker rides the helix it sweeps.',
  draw(g, io, st) {
    const x0 = 42, x1 = 280, y = 104, R = 40, turns = 3, c = g.col;
    const hel = []; for (let i = 0; i <= 200; i++) { const t = i / 200; hel.push([lerp(x0, x1, t), y + R * sin(t * TAU * turns) * 0.62]); }
    g.path(hel, { c: c.faint, w: 0.9 });
    g.ghost([x0, y], [x1, y]);
    const t = (io.u * 0.11) % 1, a = t * TAU * turns;
    const M = Mul(Tr((x1 - x0) * t, 0), Rot(x0, y, a * 0.001));
    const bp = Ap(M, [x0, y]);
    g.box(bp, 30, 46, 0, { c: c.ink, w: 1.4 });
    for (const s of [-1, 1]) g.line([bp[0] - 15, bp[1] + s * 12], [bp[0] + 15, bp[1] + s * 12], { c: c.faint, w: 0.8 });
    const m = [lerp(x0, x1, t), y + R * sin(a) * 0.62];
    g.line([m[0], y], m, { c: c.accent, w: 0.9 }); g.dot(m, 3.2, { c: c.accent });
    g.fix([x0, y], -PI / 2, {}); g.fix([x1, y], -PI / 2, {});
    g.txt([x0, 206], 'θ ' + (a / TAU).toFixed(2) + ' rev   ·   d ' + (t * turns).toFixed(2) + ' pitch   ·   ratio locked');
  } },

{ id: 'RM-02', n: 'Orbit + counter-rotation', f: 'Rigid motions', d: 'crank', rate: 0.8,
  pga: 'child = Rot(sun, ωt) ∘ Rot(planet, ∓ωt): compose, or cancel, the parent spin',
  i: 'Drag to scrub both orbits. Left body counter-rotates (face fixed to the stars), right is tidally locked.',
  draw(g, io, st) {
    const c = g.col;
    for (const [cx, cnt, lbl] of [[86, -1, 'counter-rotating'], [232, 0, 'tidally locked']]) {
      const C = [cx, 100], r = 54, th = io.u;
      g.circle(C, r, { c: c.faint, w: 0.8, dash: [3, 3] });
      g.circle(C, 13, { c: c.ink, w: 1.3 }); g.dot(C, 1.6, {});
      const orb = Rot(C[0], C[1], th);
      const p = Ap(orb, [C[0] + r, C[1]]);
      const spin = Mul(Rot(p[0], p[1], cnt === 0 ? 0 : -th));
      const body = [[p[0] - 9, p[1] - 9], [p[0] + 9, p[1] - 9], [p[0] + 9, p[1] + 9], [p[0] - 9, p[1] + 9]].map((q) => Ap(spin, q));
      g.poly(body, { c: c.ink, w: 1.3 });
      g.line(Ap(spin, [p[0], p[1]]), Ap(spin, [p[0] + 15, p[1]]), { c: c.accent, w: 1.2 });
      g.line(C, p, { c: c.ghost, w: 0.8, dash: [4, 3] });
      g.txt([cx, 188], lbl, { al: 'center' });
    }
    g.txt([160, 208], 'same orbit motor, one composed spin apart', { al: 'center' });
  } },

{ id: 'RM-03', n: 'Rotation about a moving axis', f: 'Rigid motions', d: 'crank', rate: 1,
  pga: 'M(t) = Tr(s(t),0) ∘ Rot(O, θ(t)) — the rotor’s centre is itself translated each frame',
  i: 'Drag to drive. The dashed line is the instantaneous axis; the trace is what a tip point writes.',
  draw(g, io, st) {
    const c = g.col, y = 78, x0 = 56, x1 = 264;
    g.rail([x0, y], [x1, y], { ticks: 8 });
    const s = (sin(io.u * 0.7) * 0.5 + 0.5), ax = lerp(x0, x1, s), th = io.u * 1.6;
    const M = Mul(Tr(ax - x0, 0), Rot(x0, y, th));
    const tip = Ap(M, [x0 + 62, y]);
    const base = [ax, y];
    g.ghost([ax, 20], [ax, 206]);
    g.bar(base, tip, { w: 2.6 });
    g.box(base, 22, 14, 0, { c: c.ink, w: 1.2 });
    if (io.traces !== false) g.trace(st, 'tr', tip, 260);
    g.dot(tip, 3, { c: c.accent });
    g.txt([x0, 214], 'axis x ' + ax.toFixed(0) + '   ·   θ ' + ((th % TAU) / TAU).toFixed(2) + ' rev');
  } },

{ id: 'RM-04', n: 'Motor interpolation', f: 'Rigid motions', d: 'crank', rate: 0.55,
  pga: 'M(t) = normalise((1−t)·M₀ + t·M₁) — the geodesic between two poses, one screw',
  i: 'Drag to scrub t between the two ghost poses. Interpolating the motor rotates and translates together.',
  draw(g, io, st) {
    const c = g.col;
    const shape = [[0, 0], [46, 0], [46, 13], [15, 13], [15, 44], [0, 44]];
    const M0 = Mot(30, 40, 0.15, 0, 0), M1 = Mot(30, 40, 2.25, 168, 96);
    const t = (sin(io.u) * 0.5 + 0.5);
    for (const [M, a] of [[M0, 0.35], [M1, 0.35]]) g.poly(shape.map((p) => Ap(M, [p[0] + 30, p[1] + 40])), { c: c.ghost, w: 0.9, a });
    const M = Slerp(M0, M1, t);
    const pts = shape.map((p) => Ap(M, [p[0] + 30, p[1] + 40]));
    g.poly(pts, { c: c.ink, w: 1.5 });
    g.dot(pts[0], 3, { c: c.accent });
    if (io.traces !== false) g.trace(st, 'tr', pts[0], 200);
    for (let k = 0; k <= 8; k++) { const q = Ap(Slerp(M0, M1, k / 8), [30, 40]); g.dot(q, 1.3, { c: c.faint }); }
    g.txt([16, 214], 't = ' + t.toFixed(2) + '   ·   linear blend of matrices would shear; the motor does not');
  } },

{ id: 'RM-05', n: 'Translation along a rotating axis', f: 'Rigid motions', d: 'crank', rate: 1,
  pga: 'p = Rot(O, θ) ∘ Tr(s, 0) applied to O — order matters; the reverse order is RM-03',
  i: 'Drag to drive. Slider runs out along the arm while the arm turns — the trace is an Archimedean spiral.',
  draw(g, io, st) {
    const c = g.col, O = [160, 112];
    const th = io.u, s = 20 + ((io.u * 9) % 74);
    g.circle(O, 96, { c: c.faint, w: 0.7, dash: [3, 3] });
    const armEnd = Ap(Rot(O[0], O[1], th), [O[0] + 96, O[1]]);
    g.rail(O, armEnd, { w2: 4 });
    g.line(O, armEnd, { c: c.ink, w: 2.2 });
    const p = Ap(Mul(Rot(O[0], O[1], th), Tr(s, 0)), O);
    g.box(p, 15, 11, th, { c: c.ink, w: 1.3 });
    if (io.traces !== false) g.trace(st, 'tr', p, 300);
    g.dot(p, 2.6, { c: c.accent });
    g.fix(O, -PI / 2, {});
    g.txt([12, 214], 'r = ' + s.toFixed(0) + ' px   ·   θ ' + ((th % TAU) / TAU).toFixed(2) + ' rev');
  } },

{ id: 'RM-06', n: 'Nested frames (parent → child)', f: 'Rigid motions', d: 'crank', rate: 0.9,
  pga: 'M₃ = M₁ ∘ M₂ ∘ M₃ — each frame stores only its local motor; the chain multiplies',
  i: 'Drag to drive the root. Three nested revolute frames; the tip writes an epitrochoid.',
  draw(g, io, st) {
    const c = g.col, O = [150, 104], r = [50, 32, 20], k = [1, -2.3, 3.7];
    let M = Rot(O[0], O[1], io.u * k[0]), cur = O;
    g.fix(O, -PI / 2, {});
    for (let i = 0; i < 3; i++) {
      const nxt = Ap(M, [cur[0] + r[i], cur[1]]);
      g.circle(cur, r[i], { c: c.faint, w: 0.6, dash: [2, 3] });
      g.bar(cur, nxt, { w: 2.6 - i * 0.5 });
      if (i < 2) M = Mul(M, Rot(nxt[0], nxt[1], io.u * k[i + 1]));
      cur = nxt;
    }
    if (io.traces !== false) g.trace(st, 'tr', cur, 420);
    g.dot(cur, 3, { c: c.accent });
    g.txt([12, 214], 'ω 1 : −2.3 : 3.7   ·   one multiply per joint, no matrix stack');
  } },

// ── Pulleys & cable ────────────────────────────────────────────────────────
{ id: 'PU-01', n: 'Fixed pulley', f: 'Pulleys & cable', d: 'crank', rate: 0.7,
  pga: 'sheave = Rot(pin, s/r); rope span = join(tangent pt, load pt), length invariant',
  i: 'Drag ← → to haul. One fixed sheave only turns the rope — 1:1, no mechanical advantage.',
  draw(g, io, st) {
    const c = g.col, C = [160, 52], r = 24;
    const s = (sin(io.u) * 0.5 + 0.5) * 56;
    g.line([104, 18], [216, 18], { c: c.ink, w: 1.6 }); g.hatch([[104, 8], [216, 8], [216, 18], [104, 18]], { s: 4 });
    g.line([160, 18], [160, 28], { c: c.ink, w: 1.3 });
    g.sheave(C, r, s / r);
    const L1 = [C[0] - r, C[1] + 46 + s], L2 = [C[0] + r, C[1] + 102 - s];
    g.rope([[C[0] - r, C[1]], L1]); g.rope([[C[0] + r, C[1]], L2]);
    g.arc(C, r, PI, TAU, { c: c.accent, w: 1.35 });
    g.box([L1[0], L1[1] + 15], 34, 26, 0, { c: c.ink, w: 1.4 }); g.hatch([[L1[0] - 17, L1[1] + 2], [L1[0] + 17, L1[1] + 2], [L1[0] + 17, L1[1] + 28], [L1[0] - 17, L1[1] + 28]], { s: 5 });
    g.line([L2[0] - 9, L2[1]], [L2[0] + 9, L2[1]], { c: c.ink, w: 2.4 });
    g.txt([28, 214], 'MA 1:1   ·   rope 1 fall   ·   travel = pull');
  } },

{ id: 'PU-02', n: 'Movable pulley', f: 'Pulleys & cable', d: 'crank', rate: 0.7,
  pga: 'block point solved from constant rope length: 2·|anchor→block| + free end = L',
  i: 'Drag to haul. The block hangs in the bight — load rises half as far, at half the force.',
  draw(g, io, st) {
    const c = g.col, A = [112, 30], r = 22;
    const s = (sin(io.u) * 0.5 + 0.5) * 60, by = 158 - s / 2;
    g.line([70, 22], [230, 22], { c: c.ink, w: 1.6 }); g.hatch([[70, 12], [230, 12], [230, 22], [70, 22]], { s: 4 });
    const B = [138, by];
    g.sheave(B, r, s / r);
    g.rope([[A[0], 22], [B[0] - r, B[1]]]);
    g.arc(B, r, PI, TAU + 0.02, { c: c.accent, w: 1.35 });
    g.rope([[B[0] + r, B[1]], [B[0] + r, 96 - s / 2], [232, 70 + s * 0.5]]);
    g.sheave([232, 46], 16, -s / 16);
    g.rope([[248, 46], [248, 130 - s]]);
    g.line([239, 130 - s], [257, 130 - s], { c: c.ink, w: 2.4 });
    g.line([B[0], B[1] + r], [B[0], B[1] + r + 12], { c: c.ink, w: 1.2 });
    g.box([B[0], B[1] + r + 26], 36, 26, 0, { c: c.ink, w: 1.4, hatch: true, hs: 5 });
    g.txt([22, 214], 'MA 2:1   ·   2 falls carry the load   ·   travel = pull / 2');
  } },

{ id: 'PU-03', n: 'Block and tackle 4:1', f: 'Pulleys & cable', d: 'crank', rate: 0.7,
  pga: 'n falls ⇒ load motor = Tr(0, −s/n); each fall is a join between sheave tangents',
  i: 'Drag to haul the fall. Two double blocks, four rope parts — quarter the force, four times the pull.',
  draw(g, io, st) {
    const c = g.col, r = 13;
    const s = (sin(io.u) * 0.5 + 0.5) * 76, ly = 152 - s / 4;
    g.line([84, 24], [244, 24], { c: c.ink, w: 1.6 }); g.hatch([[84, 14], [244, 14], [244, 24], [84, 24]], { s: 4 });
    const U = [[136, 46], [166, 46]], D = [[136, ly], [166, ly]];
    g.path([[122, 32], [180, 32], [180, 60], [122, 60]], { close: true, c: c.ghost, w: 0.9 });
    g.path([[122, ly - 14], [180, ly - 14], [180, ly + 14], [122, ly + 14]], { close: true, c: c.ghost, w: 0.9 });
    U.forEach((p, i) => g.sheave(p, r, s / r * (i ? -1 : 1)));
    D.forEach((p, i) => g.sheave(p, r, -s / r * (i ? -1 : 1)));
    g.rope([[U[0][0] - r, U[0][1]], [D[0][0] - r, D[0][1]]]);
    g.rope([[D[0][0] + r, D[0][1]], [U[1][0] - r, U[1][1]]]);
    g.rope([[U[1][0] + r, U[1][1]], [D[1][0] + r, D[1][1]]]);
    g.rope([[D[1][0] - r, D[1][1]], [D[1][0] - r, D[1][1]]]);
    g.arc(D[0], r, 0.1, PI - 0.1, { c: c.accent, w: 1.3 }); g.arc(D[1], r, 0.1, PI - 0.1, { c: c.accent, w: 1.3 });
    g.arc(U[0], r, PI, TAU, { c: c.accent, w: 1.3 }); g.arc(U[1], r, PI, TAU, { c: c.accent, w: 1.3 });
    g.rope([[U[0][0] + r, U[0][1]], [244, U[0][1]], [244, 92 + s]]);
    g.line([236, 92 + s], [252, 92 + s], { c: c.ink, w: 2.4 });
    g.line([151, ly + 14], [151, ly + 24], { c: c.ink, w: 1.2 });
    g.box([151, ly + 38], 42, 26, 0, { c: c.ink, w: 1.4, hatch: true, hs: 5 });
    g.txt([16, 214], 'MA 4:1   ·   4 falls   ·   ignore friction and 25 kg holds 100 kg');
  } },

{ id: 'PU-04', n: 'Differential (Weston) hoist', f: 'Pulleys & cable', d: 'crank', rate: 0.9,
  pga: 'two radii on one rotor ⇒ lift per turn = π(R − r); MA = 2R/(R − r)',
  i: 'Drag to work the hand chain. Two pocket wheels on one axle — the difference of radii is the lift.',
  draw(g, io, st) {
    const c = g.col, C = [150, 60], R = 32, r = 22;
    const th = io.u, lift = (th * (R - r)) / 2;
    g.line([96, 22], [212, 22], { c: c.ink, w: 1.6 }); g.hatch([[96, 12], [212, 12], [212, 22], [96, 22]], { s: 4 });
    g.line([150, 22], [150, 28], { c: c.ink, w: 1.3 });
    g.circle(C, R, { c: c.ink, w: 1.3 }); g.circle(C, r, { c: c.ghost, w: 1 });
    for (let i = 0; i < 12; i++) { const a = th + (i * TAU) / 12; g.dot(pol(C, R, a), 1.5, { c: c.faint }); g.dot(pol(C, r, a - th * 2), 1.2, { c: c.faint }); }
    g.dot(C, 1.6, {});
    const by = 150 - (lift % 40);
    const B = [186, by];
    g.sheave(B, 15, -th);
    g.rope([[C[0] - R, C[1]], [B[0] - 15, B[1]]]);
    g.arc(B, 15, PI - 0.1, TAU + 0.1, { c: c.accent, w: 1.3 });
    g.rope([[B[0] + 15, B[1]], [C[0] + r, C[1]]]);
    g.rope([[C[0] - r, C[1]], [92, C[1] + 18], [92, 176]]);
    g.rope([[C[0] + R, C[1]], [C[0] + R, 120], [92, 176]]);
    g.box([B[0], B[1] + 30], 34, 24, 0, { c: c.ink, w: 1.4, hatch: true, hs: 5 });
    g.txt([16, 214], 'R 32 / r 22   ·   MA ' + ((2 * R) / (R - r)).toFixed(1) + ':1   ·   self-holding');
  } },

{ id: 'PU-05', n: 'Winch drum', f: 'Pulleys & cable', d: 'crank', rate: 1.2,
  pga: 'wound length = ∫r(θ)dθ with r growing per layer — the rope’s own spiral is the state',
  i: 'Drag to wind or pay out. Rope spools onto the drum; effective radius grows with each layer.',
  draw(g, io, st) {
    const c = g.col, C = [92, 108], th = io.u;
    const wound = clamp(((sin(io.u * 0.5) * 0.5 + 0.5)), 0, 1), R = 20 + wound * 14;
    for (let i = 0; i < 3; i++) g.circle(C, 20 + i * 5, { c: c.faint, w: 0.7, a: wound > i / 3 ? 1 : 0.25 });
    g.circle(C, R, { c: c.accent, w: 1.3 });
    g.circle(C, 38, { c: c.ink, w: 1.4 });
    for (let i = 0; i < 6; i++) g.line(pol(C, 6, th + (i * TAU) / 6), pol(C, 36, th + (i * TAU) / 6), { c: c.faint, w: 0.8 });
    g.circle(C, 6, { c: c.ink, w: 1.1 });
    g.fix([C[0], C[1] + 38], -PI / 2, { s: 12 });
    const S = [232, 46];
    g.sheave(S, 16, th * 1.4);
    g.rope([pol(C, R, -PI / 2), [S[0] - 16, S[1]]]);
    g.arc(S, 16, PI, TAU - 0.4, { c: c.accent, w: 1.35 });
    const hy = 92 + (1 - wound) * 74;
    g.rope([[S[0] + 15, S[1] + 4], [S[0] + 15, hy]]);
    g.box([S[0] + 15, hy + 16], 34, 26, 0, { c: c.ink, w: 1.4, hatch: true, hs: 5 });
    g.line([196, 22], [268, 22], { c: c.ink, w: 1.5 }); g.line([232, 22], [232, 30], { c: c.ink, w: 1.2 });
    g.txt([16, 214], 'r_eff ' + R.toFixed(0) + ' px   ·   layer ' + (1 + Math.floor(wound * 2.9)) + ' of 3   ·   torque falls as it fills');
  } },

{ id: 'PU-06', n: 'Capstan', f: 'Pulleys & cable', d: 'crank', rate: 1,
  pga: 'wrap β turns about the drum axis ⇒ T_out = T_in·e^{μβ} (Euler–Eytelwein)',
  i: 'Drag to turn the capstan. Wrapped turns multiply hold force — the rope, not the hand, does the gripping.',
  draw(g, io, st) {
    const c = g.col, C = [152, 104], R = 40, th = io.u, turns = 2.6, mu = 0.3;
    g.circle(C, R + 9, { c: c.faint, w: 0.8 });
    g.circle(C, R - 2, { c: c.ink, w: 1.4 });
    for (let i = 0; i < 8; i++) g.line(pol(C, R - 2, th + (i * TAU) / 8), pol(C, R + 8, th + (i * TAU) / 8), { c: c.faint, w: 0.9 });
    const spiral = [];
    for (let i = 0; i <= 120; i++) { const t = i / 120; spiral.push(pol(C, R + 1 + t * 7, th * -1 + PI * 0.5 + t * TAU * turns)); }
    g.rope(spiral, { w: 1.5 });
    g.rope([[36, 174], spiral[0]]);
    g.rope([spiral[spiral.length - 1], [268, 52]]);
    g.arrow([36, 174], [58, 166], { c: c.accent, w: 1.2 });
    g.arrow([252, 58], [274, 50], { c: c.accent, w: 1.2 });
    g.circle(C, 5, { c: c.ink, w: 1.1 }); g.fix(C, -PI / 2, { s: 0.1 });
    g.txt([36, 190], 'T_in', { c: c.accent }); g.txt([246, 44], 'T_out', { c: c.accent });
    g.txt([16, 214], 'β ' + turns.toFixed(1) + ' turns · μ ' + mu + '   ·   ratio e^{μβ} = ' + Math.exp(mu * turns * TAU).toFixed(0) + ':1');
  } },

{ id: 'PU-07', n: 'Cable car on a span', f: 'Pulleys & cable', d: 'crank', rate: 0.5,
  pga: 'carriage = Foot(track line, hanger) offset by sag; haul loop drives it, gravity aligns it',
  i: 'Drag to run the carriage between towers. Track cable sags, hanger stays plumb, haul rope loops.',
  draw(g, io, st) {
    const c = g.col, A = [40, 54], B = [280, 84], sag = 34;
    const track = []; for (let i = 0; i <= 60; i++) { const t = i / 60; track.push([lerp(A[0], B[0], t), lerp(A[1], B[1], t) + sag * 4 * t * (1 - t)]); }
    g.path([[40, 54], [40, 196]], { c: c.ink, w: 2 }); g.path([[280, 84], [280, 196]], { c: c.ink, w: 2 });
    g.hatch([[24, 190], [56, 190], [56, 200], [24, 200]], { s: 4 }); g.hatch([[264, 190], [296, 190], [296, 200], [264, 200]], { s: 4 });
    g.path(track, { c: c.ink, w: 1.5 });
    const haul = track.map((p) => [p[0], p[1] + 26]);
    g.rope(haul, { a: 0.75 });
    const t = sin(io.u) * 0.5 + 0.5, i = Math.round(t * 60), p = track[i];
    const tg = ang(track[Math.max(0, i - 1)], track[Math.min(60, i + 1)]);
    g.sheave([p[0], p[1] - 6], 8, io.u * 3);
    g.line([p[0], p[1] + 2], [p[0], p[1] + 22], { c: c.ink, w: 1.4 });
    g.box([p[0], p[1] + 40], 40, 34, 0, { c: c.ink, w: 1.5 });
    g.line([p[0] - 20, p[1] + 32], [p[0] + 20, p[1] + 32], { c: c.faint, w: 0.8 });
    g.txt([16, 214], 'sag ' + sag + ' px   ·   grade ' + (tg * 57.3).toFixed(0) + '°   ·   track + haul are separate constraints');
  } },

// ── Gears ────────────────────────────────────────────────────────────────
{ id: 'GR-01', n: 'Spur pair (external)', f: 'Gears', d: 'crank', rate: 1,
  pga: 'ph₂ = α+π+π/n₂ − (n₁/n₂)(ph₁−α): mesh written as a phase constraint on the centre line',
  i: 'Drag to turn the driver. Teeth stay meshed at any speed — the phase relation is solved, not keyframed.',
  draw(g, io, st) {
    const c = g.col, A = [110, 106], nA = 20, rA = 52, nB = 12, rB = 31.2, B = [A[0] + rA + rB, A[1]];
    const al = ang(A, B), ph = io.u;
    g.gline(Join(A, B), { c: c.faint });
    g.gear(A, rA, nA, ph, {});
    g.gear(B, rB, nB, mesh(ph, nA, nB, al), {});
    g.fix(A, -PI / 2, { s: 0.1 }); g.fix(B, -PI / 2, { s: 0.1 });
    g.spin(A, rA * 0.55, true); g.spin(B, rB * 0.5, false);
    g.txt([16, 202], 'z 20 : 12   ·   ratio 1 : ' + (nA / nB).toFixed(2) + '   ·   direction reverses');
    g.txt([16, 216], 'contact travels the common tangent; pitch circles dashed');
  } },

{ id: 'GR-02', n: 'Internal ring + pinion', f: 'Gears', d: 'crank', rate: 1,
  pga: 'internal mesh keeps the sign: ph_R = α + (n_P/n_R)(ph_P−α) + π/n_R',
  i: 'Drag to drive the pinion. Inside a ring the output turns the same way as the input.',
  draw(g, io, st) {
    const c = g.col, C = [160, 104], nR = 30, rR = 76, nP = 12, rP = 30.4;
    const Pc = [C[0], C[1] + rR - rP], al = ang(C, Pc), ph = io.u;
    g.ring(C, rR, nR, meshInt(ph, nP, nR, al), {});
    g.gear(Pc, rP, nP, ph, {});
    g.fix(Pc, -PI / 2, { s: 0.1 }); g.dot(C, 2, { c: c.ghost });
    g.ghost(C, Pc);
    g.spin(Pc, rP * 0.5, true); g.spin(C, rR * 0.9, true);
    g.txt([16, 202], 'z 12 → 30   ·   ratio 1 : 0.40   ·   same direction, compact centre distance');
    g.txt([16, 216], 'ring is the output; carrier fixed');
  } },

{ id: 'GR-03', n: 'Rack and pinion', f: 'Gears', d: 'crank', rate: 1,
  pga: 'rotation → translation: Tr(−r·θ, 0) on the rack, driven by Rot(pin, θ)',
  i: 'Drag ← → to slide the rack; the pinion is forced to turn. Runs either way — it is a reversible pair.',
  draw(g, io, st) {
    const c = g.col, C = [160, 88], n = 14, r = 42, pitch = (TAU * r) / n;
    const ph = io.u, off = -r * ph;
    g.gear(C, r, n, ph, {});
    g.fix(C, -PI / 2, { s: 0.1 });
    g.rack([20, C[1] + r], [300, C[1] + r], pitch, off + pitch * 0.5, { c: c.ink, h: -7, body: -12 });
    g.ghost([20, C[1] + r], [300, C[1] + r]);
    g.arrow([120, 168], [200, 168], { c: c.accent, w: 1.2 });
    g.txt([16, 202], 'pitch ' + pitch.toFixed(1) + ' px   ·   x = −rθ   ·   travel per rev = ' + (TAU * r).toFixed(0) + ' px');
    g.txt([16, 216], 'steering, presses, elevators — the workhorse conversion');
  } },

{ id: 'GR-04', n: 'Gear train with idler', f: 'Gears', d: 'crank', rate: 1,
  pga: 'ratio ignores the idler; only its sign survives — three coupled phase constraints',
  i: 'Drag the left gear. The middle idler restores the original direction without changing the ratio.',
  draw(g, io, st) {
    const c = g.col, y = 108, nA = 16, rA = 40, nI = 10, rI = 25, nB = 16, rB = 40;
    const A = [58, y], I = [A[0] + rA + rI, y], B = [I[0] + rI + rB, y], ph = io.u;
    const phI = mesh(ph, nA, nI, 0), phB = mesh(phI, nI, nB, 0);
    g.gear(A, rA, nA, ph, {}); g.gear(I, rI, nI, phI, {}); g.gear(B, rB, nB, phB, {});
    [A, I, B].forEach((p) => g.fix(p, -PI / 2, { s: 0.1 }));
    g.spin(A, 20, true); g.spin(I, 13, false); g.spin(B, 20, true);
    g.txt([16, 202], 'z 16 · 10 · 16   ·   ratio 1 : 1   ·   idler only flips direction');
    g.txt([16, 216], 'use it to bridge a centre distance you cannot shorten');
  } },

{ id: 'GR-05', n: 'Compound gear train', f: 'Gears', d: 'crank', rate: 1.4,
  pga: 'two stages on a shared shaft: ratio = (n₁/n₂)·(n₃/n₄), motors multiplied',
  i: 'Drag the input. Two stages on one shaft multiply, giving 6.25:1 in the space of one pair.',
  draw(g, io, st) {
    const c = g.col, nA = 10, rA = 24, nB = 25, rB = 60, nC = 10, rC = 24, nD = 25, rD = 60;
    const A = [46, 60], B = [A[0] + rA + rB, 60], Cc = B, D = [Cc[0] + rC + rD, 148];
    const ph = io.u, phB = mesh(ph, nA, nB, ang(A, B));
    g.gear(A, rA, nA, ph, {});
    g.gear(B, rB, nB, phB, {});
    g.gear(Cc, rC, nC, phB, { pitch: false, hub: false });
    g.gear(D, rD, nD, mesh(phB, nC, nD, ang(Cc, D)), {});
    g.line(B, [B[0], B[1]], { c: c.ink, w: 3 });
    [A, B, D].forEach((p) => g.fix(p, -PI / 2, { s: 0.1 }));
    g.txt([16, 202], 'stage 1 · 2.5   stage 2 · 2.5   →   total ' + ((nB / nA) * (nD / nC)).toFixed(2) + ':1');
    g.txt([16, 216], 'compounding beats one big wheel for space and cost');
  } },

{ id: 'GR-06', n: 'Planetary (epicyclic)', f: 'Gears', d: 'crank', rate: 1.6,
  pga: 'carrier motor Rot(O, ωc) composed with each planet’s own spin; ring fixed ⇒ ωc = ω_s·n_s/(n_s+n_r)',
  i: 'Drag the sun. Ring held, carrier is the output — the classic 3.43:1 reduction, coaxial.',
  draw(g, io, st) {
    const c = g.col, O = [160, 100], nS = 14, rS = 30, nP = 10, rP = 21.4, nR = 34, rR = 73;
    const ws = io.u, wc = (ws * nS) / (nS + nR), rc = rS + rP;
    g.ring(O, rR, nR, PI / nR, {});
    g.gear(O, rS, nS, ws, {});
    for (let i = 0; i < 3; i++) {
      const a = wc + (i * TAU) / 3, Pp = pol(O, rc, a);
      const spin = -(ws - wc) * (nS / nP) + a * (1 + nS / nP);
      g.gear(Pp, rP, nP, mesh(ws, nS, nP, a), { pitch: false });
      g.line(O, Pp, { c: c.ghost, w: 2.2, a: 0.9 });
      g.pin(Pp, {});
    }
    g.circle(O, rc, { c: c.faint, w: 0.7, dash: [3, 3] });
    g.dot(O, 2, {});
    g.txt([16, 202], 'sun 14 · planet 10 · ring 34   ·   carrier out ' + ((nS + nR) / nS).toFixed(2) + ':1');
    g.txt([16, 216], 'three planets share the load and cancel bearing forces');
  } },

{ id: 'GR-07', n: 'Worm and worm wheel', f: 'Gears', d: 'crank', rate: 1.6,
  pga: 'one worm turn = one tooth: ph_wheel = ph_worm / n, axes skew — the non-back-drivable pair',
  i: 'Drag to turn the worm. Huge reduction in one step, and the output cannot drive the input back.',
  draw(g, io, st) {
    const c = g.col, W = [92, 66], n = 24, rW = 46, Wc = [176, 128];
    const ph = io.u;
    g.path([[54, 46], [54, 86], [150, 86], [150, 46]], { close: true, c: c.ink, w: 1.4 });
    for (let i = 0; i < 9; i++) {
      const x = 56 + (((i * 11 + ph * 11 / TAU * 11) % 99));
      g.path([[x, 46], [x + 6, 66], [x, 86]], { c: c.accent, w: 1.1 });
    }
    g.line([26, 66], [54, 66], { c: c.ink, w: 2.4 }); g.line([150, 66], [176, 66], { c: c.ink, w: 2.4 });
    g.fix([34, 66], PI / 2, { s: 8 }); g.fix([168, 66], PI / 2, { s: 8 });
    g.gear(Wc, rW, n, ph / n, {});
    g.fix(Wc, -PI / 2, { s: 0.1 });
    g.ghost([102, 92], [Wc[0], Wc[1] - rW]);
    g.txt([16, 202], 'single-start worm · z 24   ·   ratio 24:1   ·   self-locking');
    g.txt([16, 216], 'axes cross at 90° — the mesh is a screw pair, not rolling');
  } },

// ── Motion transformers ──────────────────────────────────────────────────
{ id: 'MT-01', n: 'Geneva indexing drive', f: 'Motion transformers', d: 'crank', rate: 1.1,
  pga: 'pin ∈ slot while |pin−C₂| ≤ a; outside, the lock arc holds ph₂ at the nearest detent',
  i: 'Drag to turn the driver. Continuous in, quarter-turn steps out — dwell is geometric, not timed.',
  draw(g, io, st) {
    const c = g.col, C1 = [92, 116], a = 46, C2 = [C1[0] + a * Math.SQRT2, 116], rF = 52;
    const th = io.u * 1.4;
    const pin = pol(C1, a, th);
    const d = dist(C2, pin);
    let b = st.b ?? PI;
    if (d <= a * 1.02) b = ang(C2, pin);
    else { const q = PI / 2; b = Math.round(b / q) * q; }
    st.b = b;
    g.circle(C2, rF, { c: c.ink, w: 1.4 });
    for (let i = 0; i < 4; i++) {
      const al = b + (i * TAU) / 4;
      const s0 = pol(C2, a * 0.42, al), s1 = pol(C2, rF + 3, al);
      g.rail(s0, s1, { w2: 4.5, c: c.ink });
      g.line(s0, s1, { c: c.paper, w: 8 });
      g.arc(C2, rF, al + 0.42, al + TAU / 4 - 0.42, { c: c.ink, w: 2 });
    }
    g.circle(C1, 26, { c: c.ink, w: 1.4 });
    g.line(C1, pin, { c: c.ink, w: 2.4 });
    g.dot(pin, 4, { c: c.accent });
    g.fix(C1, -PI / 2, { s: 0.1 }); g.fix(C2, -PI / 2, { s: 0.1 });
    g.txt([16, 202], (d <= a * 1.02 ? 'ENGAGED — indexing' : 'LOCKED — dwell') + '   ·   4 slots · 90° per turn');
    g.txt([16, 216], 'film advance, tool changers, bottling lines');
  } },

{ id: 'MT-02', n: 'Ratchet and pawl', f: 'Motion transformers', d: 'crank', rate: 1.3,
  pga: 'integrate only positive Δθ: oscillation in, monotone rotation out (a one-way constraint)',
  i: 'Drag to rock the lever. Forward strokes add rotation, return strokes slip — the wheel never gives it back.',
  draw(g, io, st) {
    const c = g.col, C = [162, 112], R = 62, n = 16;
    const armA = -0.55 + 0.5 * sin(io.u);
    st.prev ??= armA; st.w ??= 0;
    const dA = armA - st.prev; if (dA > 0) st.w += dA; st.prev = armA;
    const pts = [];
    for (let i = 0; i < n; i++) { const a0 = st.w + (i * TAU) / n; pts.push(pol(C, R, a0), pol(C, R * 0.8, a0 + TAU / n * 0.98)); }
    g.path(pts, { close: true, c: c.ink, w: 1.3 });
    g.circle(C, R * 0.22, { c: c.ink, w: 1.1 }); g.dot(C, 1.5, {});
    const hp = pol(C, R + 22, armA);
    g.line(C, hp, { c: c.ghost, w: 2.6 });
    const tip = pol(C, R - 2, armA + 0.1);
    g.bar(hp, tip, { w: 2, c: c.accent });
    const hold = [C[0] - 4, C[1] - R - 26];
    g.bar(hold, pol(C, R - 2, -PI / 2 + 0.12), { w: 1.8 });
    g.fix(hold, -PI / 2, { s: 8 }); g.fix(C, -PI / 2, { s: 0.1 });
    g.txt([16, 202], 'output ' + (st.w / TAU).toFixed(2) + ' rev   ·   ' + n + ' teeth · step ' + (360 / n).toFixed(0) + '°');
    g.txt([16, 216], 'socket wrench, jack, winder — rectified motion');
  } },

{ id: 'MT-03', n: 'Lead screw and nut', f: 'Motion transformers', d: 'crank', rate: 1.4,
  pga: 'pure screw: Tr(p·θ/2π, 0) ∘ Rot(axis, θ) — the nut is constrained to the axis line',
  i: 'Drag to turn the screw. Pitch sets the trade — fine pitch, more force, less speed.',
  draw(g, io, st) {
    const c = g.col, y = 100, x0 = 44, x1 = 288, p = 16;
    const th = io.u, x = 74 + ((th * p) / TAU % 150);
    g.line([x0, y - 12], [x1, y - 12], { c: c.ink, w: 1.2 });
    g.line([x0, y + 12], [x1, y + 12], { c: c.ink, w: 1.2 });
    for (let s = -p * 2; s < x1 - x0 + p; s += p) {
      const xa = x0 + s + ((th * p) / TAU % p);
      if (xa < x0 - 2 || xa > x1) continue;
      g.line([xa, y - 12], [Math.min(x1, xa + 8), y + 12], { c: c.faint, w: 0.9 });
    }
    g.fix([x0, y], PI, { s: 12 }); g.fix([x1, y], 0, { s: 12 });
    g.box([x, y], 30, 40, 0, { c: c.ink, w: 1.6 });
    g.line([x - 15, y - 20], [x + 15, y - 20], { c: c.accent, w: 1.2 });
    g.arrow([x, y + 30], [x + 30, y + 30], { c: c.accent, w: 1.1 });
    g.spin([x0 + 12, y], 20, true);
    g.txt([16, 202], 'pitch ' + p + ' px/rev   ·   θ ' + (th / TAU).toFixed(2) + ' rev   ·   x ' + (x - 74).toFixed(0) + ' px');
    g.txt([16, 216], 'jacks, vices, CNC axes — a screw is a wound-up ramp');
  } },

{ id: 'MT-04', n: 'Universal (Cardan) joint', f: 'Motion transformers', d: 'crank', rate: 1.2,
  pga: 'θ₂ = atan(tanθ₁ / cosβ): equal average speed, unequal instantaneous speed',
  i: 'Drag to turn the input. The plot is the velocity ripple that makes engineers fit joints in pairs.',
  draw(g, io, st) {
    const c = g.col, J = [150, 92], b = 0.5, th = io.u;
    const th2 = Math.atan2(sin(th), cos(th) * cos(b));
    g.line([32, 92], J, { c: c.ink, w: 2.6 });
    const out = [J[0] + 108 * cos(b), J[1] + 108 * sin(b)];
    g.line(J, out, { c: c.ink, w: 2.6 });
    g.fix([44, 92], -PI / 2, { s: 9 }); g.fix([out[0] - 14, out[1] - 7], -PI / 2, { s: 9 });
    for (const [a, ax, col2] of [[th, 0, c.accent], [th2, b, c.ink]]) {
      const u = [cos(ax), sin(ax)], pv = [-u[1], u[0]];
      const e0 = [J[0] + pv[0] * 26 * cos(a) + u[0] * 6 * (ax ? 1 : -1), J[1] + pv[1] * 26 * cos(a) + u[1] * 6 * (ax ? 1 : -1)];
      const e1 = [J[0] - pv[0] * 26 * cos(a) + u[0] * 6 * (ax ? 1 : -1), J[1] - pv[1] * 26 * cos(a) + u[1] * 6 * (ax ? 1 : -1)];
      g.path([e0, [J[0] + u[0] * 20 * (ax ? 1 : -1), J[1] + u[1] * 20 * (ax ? 1 : -1)], e1], { c: col2, w: 1.6 });
      g.dot(e0, 2.4, { c: col2 }); g.dot(e1, 2.4, { c: col2 });
    }
    g.circle(J, 7, { c: c.ink, w: 1.3 });
    g.ghost([J[0], J[1]], [J[0] + 60, J[1]]);
    const vals = []; for (let i = 0; i <= 48; i++) { const a = (i / 48) * TAU; vals.push((cos(b) / (1 - sin(b) ** 2 * cos(a) ** 2) - 0.85) / 0.32); }
    g.plot(206, 152, 92, 44, vals, (th % TAU) / TAU, { label: 'ω₂/ω₁ ripple' });
    g.txt([16, 214], 'β ' + (b * 57.3).toFixed(0) + '°   ·   ±' + (((1 / cos(b) - cos(b)) / 2) * 100).toFixed(0) + '% speed error per turn');
  } },

// ── Constraints ──────────────────────────────────────────────────────────
{ id: 'CN-01', n: 'Point on line', f: 'Constraints', d: 'point',
  pga: 'foot = l ∧ Perp(l, p) — meet of the line with the perpendicular through p',
  i: 'Move the pointer inside the frame. The solved point is the meet; the dashed line is the perpendicular.',
  draw(g, io, st) {
    const c = g.col, l = Join([30, 190], [292, 66]);
    g.gline(l, { c: c.ink, w: 1.3, dash: [] });
    const p = [io.mx, io.my], f = Foot(l, p);
    g.gline(Perp(l, p), { c: c.faint });
    g.line(p, f, { c: c.accent, w: 1.1, dash: [3, 3] });
    g.circle(p, 4.5, { c: c.ghost, w: 1.1 });
    g.dot(f, 4, { c: c.accent });
    g.txt([16, 200], 'distance ' + dist(p, f).toFixed(1) + ' px — the residual the solver drives to zero');
    g.txt([16, 214], 'one equation, one degree of freedom removed');
  } },

{ id: 'CN-02', n: 'Point on circle', f: 'Constraints', d: 'point',
  pga: 'nearest point = C + r·normalise(p − C); the circle is a distance constraint, not a curve',
  i: 'Move the pointer. The point snaps to the circle along the radius — inside or outside, same rule.',
  draw(g, io, st) {
    const c = g.col, C = [160, 108], r = 66;
    g.circle(C, r, { c: c.ink, w: 1.3 });
    g.dot(C, 2.4, {});
    const p = [io.mx, io.my], u = norm([p[0] - C[0], p[1] - C[1]]), q = [C[0] + u[0] * r, C[1] + u[1] * r];
    g.line(C, p, { c: c.faint, w: 0.8, dash: [4, 3] });
    g.line(q, p, { c: c.accent, w: 1.1, dash: [3, 3] });
    g.circle(p, 4.5, { c: c.ghost, w: 1.1 });
    g.dot(q, 4, { c: c.accent });
    g.arc(C, 14, 0, ang(C, p), { c: c.accent, w: 1 });
    g.txt([16, 200], '|p−C| ' + dist(p, C).toFixed(1) + '   ·   r 66   ·   error ' + (dist(p, C) - r).toFixed(1));
    g.txt([16, 214], 'this is the dyad every linkage solve is built from');
  } },

{ id: 'CN-03', n: 'Rolling contact (no slip)', f: 'Constraints', d: 'crank', rate: 1,
  pga: 'r₁θ₁ = −r₂θ₂: equal arc length at the contact point, marks stay opposite forever',
  i: 'Drag to roll. Tick marks meet at the contact point every turn — the no-slip condition, drawn.',
  draw(g, io, st) {
    const c = g.col, r1 = 60, r2 = 36, A = [104, 106], B = [A[0] + r1 + r2, 106];
    const t1 = io.u, t2 = -t1 * (r1 / r2);
    g.circle(A, r1, { c: c.ink, w: 1.4 }); g.circle(B, r2, { c: c.ink, w: 1.4 });
    for (let i = 0; i < 12; i++) g.line(pol(A, r1 - 7, t1 + (i * TAU) / 12), pol(A, r1, t1 + (i * TAU) / 12), { c: c.faint, w: 0.9 });
    for (let i = 0; i < 12; i++) g.line(pol(B, r2 - 6, t2 + (i * TAU) / 12), pol(B, r2, t2 + (i * TAU) / 12), { c: c.faint, w: 0.9 });
    g.line(pol(A, 0, t1), pol(A, r1, t1), { c: c.accent, w: 1.3 });
    g.line(pol(B, 0, t2), pol(B, r2, t2), { c: c.accent, w: 1.3 });
    const K = [A[0] + r1, 106];
    g.dot(K, 3.4, { c: c.accent });
    g.ghost([K[0], 26], [K[0], 190]);
    g.fix(A, -PI / 2, { s: 0.1 }); g.fix(B, -PI / 2, { s: 0.1 });
    g.txt([16, 202], 'arc A ' + (r1 * (t1 % TAU)).toFixed(0) + ' = arc B ' + Math.abs(r2 * (t2 % TAU)).toFixed(0) + ' px   ·   slip 0');
    g.txt([16, 216], 'gears are this constraint with teeth added to guarantee it');
  } },

{ id: 'CN-04', n: 'Tangency from a point', f: 'Constraints', d: 'point',
  pga: 'tangent pts = circle ∧ circle(centre = midpoint(C,p), r = |C−p|/2) — Thales, as a meet',
  i: 'Move the pointer outside the circle to swing the two tangents; inside, the solution vanishes.',
  draw(g, io, st) {
    const c = g.col, C = [136, 108], r = 52;
    g.circle(C, r, { c: c.ink, w: 1.3 }); g.dot(C, 2.2, {});
    const p = [io.mx, io.my], d = dist(C, p);
    const M = mix(C, p, 0.5);
    g.circle(M, d / 2, { c: c.faint, w: 0.7, dash: [3, 3] });
    g.circle(p, 4.5, { c: c.ghost, w: 1.1 });
    if (d > r + 1) {
      for (const s of [1, -1]) {
        const T = Tan(C, r, p, s);
        g.line(p, T, { c: c.accent, w: 1.2 });
        g.line(C, T, { c: c.faint, w: 0.8 });
        g.dot(T, 3.4, { c: c.accent });
      }
      g.txt([16, 202], 'tangent length ' + Math.sqrt(d * d - r * r).toFixed(1) + ' px   ·   2 real solutions');
    } else g.txt([16, 202], 'pointer inside the circle — no real tangent', { c: c.accent });
    g.txt([16, 216], 'belt wrap, cam pressure angle and reeving all start here');
  } },
];
