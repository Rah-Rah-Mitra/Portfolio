// pga-assets-3.js — Robotics · Vehicles · Rolling & curves · Oscillators · Deployables · Construction · Mathematical machines · Flight
import { TAU, pol, mix, lerp, dist, ang, clamp, norm, Rot, Tr, Mul, Ap, Join, Meet, Perp, Foot, CC, LC } from './pga.js';

const sin = Math.sin, cos = Math.cos, PI = Math.PI, sq = Math.sqrt, atan2 = Math.atan2;
// walk a polyline and return n points spaced equally by arc length
function spaced(path, n, off = 0) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + dist(path[i - 1], path[i]));
  const L = cum[cum.length - 1], out = [];
  for (let k = 0; k < n; k++) {
    let s = (((off + (k * L) / n) % L) + L) % L, i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    out.push({ p: mix(path[i - 1], path[i], t), a: ang(path[i - 1], path[i]) });
  }
  return out;
}
const reach = (S, T, R) => (dist(S, T) > R ? [S[0] + ((T[0] - S[0]) * R) / dist(S, T), S[1] + ((T[1] - S[1]) * R) / dist(S, T)] : T);

export const ASSETS = [
{ id: 'RB-01', n: 'Two-link inverse kinematics', f: 'Robotics', d: 'point',
  pga: 'elbow = circle(shoulder, L₁) ∧ circle(target, L₂) — IK is one meet, both branches valid',
  i: 'Move the pointer to set the target; hold the button to flip the elbow branch. Out of reach, the arm points at it.',
  draw(g, io, st) {
    const c = g.col, S = [64, 168], L1 = 92, L2 = 78;
    const T = reach(S, [io.mx, io.my], L1 + L2 - 1);
    const E = CC(S, L1, T, L2, io.down ? -1 : 1);
    g.circle(S, L1 + L2, { c: c.faint, w: 0.7, dash: [3, 4] });
    g.circle(S, Math.abs(L1 - L2), { c: c.faint, w: 0.7, dash: [3, 4] });
    g.circle(S, L1, { c: c.faint, w: 0.6, dash: [2, 4], a: 0.7 });
    g.circle(T, L2, { c: c.faint, w: 0.6, dash: [2, 4], a: 0.7 });
    g.bar(S, E, { w: 3 }); g.bar(E, T, { w: 2.6 });
    g.circle([io.mx, io.my], 5, { c: c.ghost, w: 1 });
    g.dot(T, 3.6, { c: c.accent });
    g.fix(S, -PI / 2, {});
    g.txt([14, 206], 'q₁ ' + (ang(S, E) * 57.3).toFixed(0) + '°   ·   q₂ ' + ((ang(E, T) - ang(S, E)) * 57.3).toFixed(0) + '°   ·   branch ' + (io.down ? 'down' : 'up'));
    g.txt([14, 220], 'no solver loop, no jacobian — the geometry answers directly');
  } },

{ id: 'RB-02', n: 'SCARA — 3R with wrist lock', f: 'Robotics', d: 'point',
  pga: 'wrist = T − L₃·û(ψ) held constant, then the same dyad; the tool keeps its pose',
  i: 'Move the pointer. The gripper stays square to the table while the arm reconfigures behind it.',
  draw(g, io, st) {
    const c = g.col, S = [58, 62], L1 = 84, L2 = 66, L3 = 30, psi = PI / 2;
    const T = reach(S, [io.mx, clamp(io.my, 30, 196)], L1 + L2 + L3 - 2);
    const W = [T[0] - L3 * cos(psi), T[1] - L3 * sin(psi)];
    const W2 = reach(S, W, L1 + L2 - 1);
    const E = CC(S, L1, W2, L2, 1);
    g.circle(S, L1 + L2 + L3, { c: c.faint, w: 0.7, dash: [3, 4] });
    g.bar(S, E, { w: 3 }); g.bar(E, W2, { w: 2.6 });
    g.line(W2, [W2[0] + L3 * cos(psi), W2[1] + L3 * sin(psi)], { c: c.ink, w: 2.2 });
    const Tp = [W2[0] + L3 * cos(psi), W2[1] + L3 * sin(psi)];
    g.path([[Tp[0] - 10, Tp[1]], [Tp[0] - 10, Tp[1] + 12]], { c: c.accent, w: 2 });
    g.path([[Tp[0] + 10, Tp[1]], [Tp[0] + 10, Tp[1] + 12]], { c: c.accent, w: 2 });
    g.line([Tp[0] - 10, Tp[1]], [Tp[0] + 10, Tp[1]], { c: c.ink, w: 2 });
    g.circle([io.mx, clamp(io.my, 30, 196)], 5, { c: c.ghost, w: 1 });
    g.fix(S, -PI / 2, {});
    g.line([20, 208], [300, 208], { c: c.ink, w: 1.3 });
    g.hatch([[20, 208], [300, 208], [300, 218], [20, 218]], { s: 5 });
    g.txt([120, 202], 'tool ψ locked at 90° — the SCARA trick', { c: c.ghost });
  } },

{ id: 'RB-03', n: 'Planar Stewart platform (3-RPR)', f: 'Robotics', d: 'point',
  pga: 'inverse kinematics is three distances: lᵢ = |Ap(M, pᵢ) − baseᵢ|, one motor in',
  i: 'Move the pointer to fly the platform; the three leg lengths are read straight off the motor.',
  draw(g, io, st) {
    const c = g.col, B = [[46, 196], [160, 196], [274, 196]];
    const C = [clamp(io.mx, 74, 246), clamp(io.my, 46, 150)];
    const rot = (C[0] - 160) * 0.005;
    const M = Mul(Tr(C[0] - 160, C[1] - 100), Rot(160, 100, rot));
    const Pl = [[124, 100], [196, 100], [160, 66]].map((p) => Ap(M, p));
    g.line([20, 196], [300, 196], { c: c.ink, w: 1.4 });
    g.hatch([[20, 196], [300, 196], [300, 208], [20, 208]], { s: 5 });
    B.forEach((b, i) => {
      const p = Pl[i], u = norm([p[0] - b[0], p[1] - b[1]]), d = dist(b, p);
      const pv = [-u[1], u[0]];
      for (const s of [1, -1]) g.line([b[0] + pv[0] * 4 * s, b[1] + pv[1] * 4 * s], [b[0] + u[0] * d * 0.62 + pv[0] * 4 * s, b[1] + u[1] * d * 0.62 + pv[1] * 4 * s], { c: c.ink, w: 1.2 });
      g.line([b[0] + u[0] * d * 0.3, b[1] + u[1] * d * 0.3], p, { c: c.accent, w: 2.2 });
      g.fix(b, ang(b, p), { s: 8 });
      g.pin(p, {});
      g.txt(mix(b, p, 0.5), d.toFixed(0), { c: c.ghost });
    });
    g.poly(Pl, { c: c.ink, w: 2 });
    g.circle([io.mx, io.my], 5, { c: c.ghost, w: 1 });
    g.txt([14, 216], '3 DOF (x, y, θ) from 3 prismatic legs   ·   θ ' + (rot * 57.3).toFixed(1) + '°   ·   stiff, small workspace');
  } },

{ id: 'RB-04', n: 'Five-bar parallel manipulator', f: 'Robotics', d: 'point',
  pga: 'two dyads sharing the end point: C = ∧(A,L₁ ; E,L₂), D = ∧(B,L₁ ; E,L₂)',
  i: 'Move the pointer. Both motors sit at the base — light arms, fast moves, awkward singularities.',
  draw(g, io, st) {
    const c = g.col, A = [104, 190], Bp = [216, 190], L1 = 78, L2 = 78;
    const E = reach(mix(A, Bp, 0.5), [io.mx, clamp(io.my, 24, 170)], 128);
    const C = CC(A, L1, E, L2, 1), D = CC(Bp, L1, E, L2, -1);
    g.circle(A, L1, { c: c.faint, w: 0.6, dash: [2, 4] }); g.circle(Bp, L1, { c: c.faint, w: 0.6, dash: [2, 4] });
    g.bar(A, C, { w: 2.8 }); g.bar(C, E, { w: 2.4 });
    g.bar(Bp, D, { w: 2.8 }); g.bar(D, E, { w: 2.4 });
    g.dot(E, 4, { c: c.accent });
    if (io.traces !== false) g.trace(st, 'tr', E, 200);
    g.fix(A, -PI / 2, {}); g.fix(Bp, -PI / 2, {});
    g.circle([io.mx, io.my], 5, { c: c.ghost, w: 1 });
    const sing = Math.abs(ang(C, E) - ang(D, E));
    g.txt([14, 214], 'q₁ ' + (ang(A, C) * 57.3).toFixed(0) + '°  q₂ ' + (ang(Bp, D) * 57.3).toFixed(0) + '°   ·   ' + (Math.abs(sin(sing)) < 0.2 ? 'NEAR SINGULARITY' : 'well conditioned'), { c: Math.abs(sin(sing)) < 0.2 ? c.accent : c.ghost });
  } },

{ id: 'RB-05', n: 'Parallel-jaw gripper', f: 'Robotics', d: 'toggle', on0: false,
  pga: 'one screw drives two mirrored prismatic constraints; grip halts at the part’s own radius',
  i: 'Click to open and close. The jaws stop on the part instead of passing through it.',
  draw(g, io, st) {
    const c = g.col, t = io.tgl, part = 26;
    const w = lerp(58, part, t);
    g.box([160, 44], 120, 26, 0, { c: c.ink, w: 1.6 });
    g.circle([160, 44], 9, { c: c.ghost, w: 1.1 });
    g.line([160, 44], pol([160, 44], 9, io.t * 4 * (1 - Math.abs(t - 0.5) * 2 > 0.05 ? 1 : 0)), { c: c.faint, w: 1 });
    for (const s of [-1, 1]) {
      const x = 160 + s * w;
      g.line([160, 57], [x, 57], { c: c.ghost, w: 1.6 });
      g.box([x, 68], 16, 22, 0, { c: c.ink, w: 1.5 });
      g.path([[x - 7, 79], [x - 7, 148], [x + 7, 148], [x + 7, 79]], { c: c.ink, w: 1.8 });
      g.line([x - s * 7, 84], [x - s * 7, 144], { c: c.accent, w: 1.4 });
    }
    g.circle([160, 130], part - 8, { c: c.ink, w: 1.6 });
    g.hatch([[152, 122], [168, 122], [168, 138], [152, 138]], { s: 4 });
    g.rail([88, 57], [232, 57], { w2: 7, c: c.faint });
    g.txt([14, 202], (t > 0.85 ? 'GRIPPED' : t < 0.15 ? 'OPEN' : 'CLOSING') + '   ·   jaw gap ' + (2 * w).toFixed(0) + ' px   ·   part ⌀' + (2 * (part - 8)), { c: t > 0.85 ? c.accent : c.ghost });
    g.txt([14, 216], 'symmetric jaws keep the part centred on the tool axis');
  } },

// ── Vehicles ─────────────────────────────────────────────────────────────
{ id: 'VH-01', n: 'Ackermann steering', f: 'Vehicles', d: 'crank', rate: 0.7,
  pga: 'turn centre = axis_L ∧ axis_R — the meet lands on the rear axle only if the arms are right',
  i: 'Drag to steer. Inner and outer wheels take different angles; the dashed meet is the true turn centre.',
  draw(g, io, st) {
    const c = g.col, KL = [96, 74], KR = [246, 74], rear = 176, a = 24, tie = 34.2;
    const s = 22 * sin(io.u);
    const solve = (K, dir) => {
      const R = [K[0] + dir * 42 + s, 100];
      const A = CC(K, a, R, tie, dir > 0 ? 1 : -1);
      return { R, A, d: ang(K, A) - (dir > 0 ? 0.35 : PI - 0.35) };
    };
    const Lft = solve(KL, 1), Rgt = solve(KR, -1);
    g.line([70, rear], [272, rear], { c: c.ink, w: 2 });
    g.line([KL[0], KL[1]], [KR[0], KR[1]], { c: c.ghost, w: 1.2, dash: [5, 4] });
    g.line([171, 74], [171, rear], { c: c.ghost, w: 1.6 });
    for (const [K, W] of [[KL, Lft], [KR, Rgt]]) {
      g.box(K, 15, 40, W.d, { c: c.ink, w: 1.8 });
      g.bar(K, W.A, { w: 1.8, c: c.ghost });
      g.bar(W.A, W.R, { w: 1.8 });
      g.gline(Perp(Join(K, [K[0] + cos(W.d + PI / 2), K[1] + sin(W.d + PI / 2)]), K), { c: c.faint });
    }
    for (const x of [70, 272]) g.box([x, rear], 15, 40, 0, { c: c.ink, w: 1.8 });
    g.rail([KL[0] + 30, 100], [KR[0] - 30, 100], { w2: 6, c: c.faint });
    g.line([KL[0] + 42 + s, 100], [KR[0] - 42 + s, 100], { c: c.ink, w: 2.6 });
    const aL = Perp(Join(KL, [KL[0] + cos(Lft.d + PI / 2), KL[1] + sin(Lft.d + PI / 2)]), KL);
    const aR = Perp(Join(KR, [KR[0] + cos(Rgt.d + PI / 2), KR[1] + sin(Rgt.d + PI / 2)]), KR);
    const IC = Meet(aL, aR);
    if (IC && Math.abs(IC[1] - rear) < 400 && Math.abs(s) > 1.5) {
      g.dot([clamp(IC[0], -60, 380), clamp(IC[1], -60, 260)], 3.4, { c: c.accent });
      g.txt([14, 190], 'turn centre ' + IC[0].toFixed(0) + ', ' + IC[1].toFixed(0) + '   ·   Ackermann error ' + (IC[1] - rear).toFixed(0) + ' px', { c: c.accent });
    }
    g.txt([14, 206], 'δ inner ' + (Math.abs(Lft.d) * 57.3).toFixed(1) + '°   ·   δ outer ' + (Math.abs(Rgt.d) * 57.3).toFixed(1) + '°');
    g.txt([14, 220], 'the arms, not the rack, set the difference');
  } },

{ id: 'VH-02', n: 'Double wishbone', f: 'Vehicles', d: 'crank', rate: 0.8,
  pga: 'upright = circle(upper pivot, u) ∧ circle(lower ball, k) — camber falls out of the solve',
  i: 'Drag to cycle the suspension. Watch the camber curve: unequal arms keep the tyre upright in roll.',
  draw(g, io, st) {
    const c = g.col, UP = [96, 82], LP = [96, 148], ua = 52, la = 76, up = 62;
    const th = 0.42 * sin(io.u);
    const LB = pol(LP, la, -0.12 + th);
    const UB = CC(UP, ua, LB, up, -1);
    g.line([70, 40], [70, 190], { c: c.ink, w: 2 });
    g.hatch([[58, 40], [70, 40], [70, 190], [58, 190]], { s: 5 });
    g.bar(UP, UB, { w: 2.6 }); g.bar(LP, LB, { w: 2.6 });
    g.bar(UB, LB, { w: 3 });
    const camber = ang(LB, UB) + PI / 2;
    const wc = mix(UB, LB, 0.5);
    g.box([wc[0] + 26, wc[1]], 26, 96, camber, { c: c.ink, w: 1.8 });
    g.circle([wc[0] + 26, wc[1]], 8, { c: c.ghost, w: 1.1 });
    g.spring([UP[0] + 34, 44], mix(LP, LB, 0.62), 9, 6, { c: c.accent, w: 1.3 });
    g.fix(UP, 0, { s: 8 }); g.fix(LP, 0, { s: 8 });
    if (io.traces !== false) g.trace(st, 'tr', [wc[0] + 26, wc[1]], 200);
    g.txt([14, 208], 'camber ' + (camber * 57.3).toFixed(1) + '°   ·   travel ' + (LB[1] - 148).toFixed(0) + ' px   ·   arms 52 / 76');
    g.txt([14, 222], 'short upper arm ⇒ negative camber gain in bump');
  } },

{ id: 'VH-03', n: 'Rocker-bogie rover', f: 'Vehicles', d: 'crank', rate: 0.5,
  pga: 'bogie apex and rocker joint are both dyad solves against the terrain — body angle averages them',
  i: 'Drag to drive across the rocks. All six contacts stay down and the body stays near level.',
  draw(g, io, st) {
    const c = g.col, R = 15, sc = io.u * 26;
    const gnd = (x) => 176 + 9 * sin((x + sc) * 0.055) + 6 * sin((x + sc) * 0.13 + 1) + (Math.max(0, 8 - Math.abs(((x + sc) % 190) - 95)) * 1.5);
    const terr = []; for (let x = 8; x <= 312; x += 4) terr.push([x, gnd(x)]);
    g.path(terr, { c: c.ink, w: 1.4 });
    g.hatch([...terr, [312, 226], [8, 226]], { s: 6 });
    const W = [96, 168, 240].map((x) => [x, gnd(x) - R]);
    const bog = CC(W[1], 46, W[2], 46, -1);
    const rock = CC(W[0], 60, bog, 58, -1);
    W.forEach((w) => { g.circle(w, R, { c: c.ink, w: 1.5 }); for (let i = 0; i < 6; i++) g.line(pol(w, 4, io.u * 2 + (i * TAU) / 6), pol(w, R - 2, io.u * 2 + (i * TAU) / 6), { c: c.faint, w: 0.8 }); });
    g.bar(W[1], bog, { w: 2.4 }); g.bar(W[2], bog, { w: 2.4 });
    g.bar(W[0], rock, { w: 2.6 }); g.bar(bog, rock, { w: 2.6 });
    const bodyA = (ang(rock, W[0]) + ang(bog, W[2])) * 0.06;
    g.box([rock[0] + 42, rock[1] - 26], 132, 34, bodyA, { c: c.ink, w: 1.8 });
    g.ghost([20, rock[1] - 26], [300, rock[1] - 26]);
    g.txt([14, 34], 'body tilt ' + (bodyA * 57.3).toFixed(1) + '°   ·   6 contacts held', { c: c.ghost });
    g.txt([14, 48], 'differential averages rocker and bogie — no springs at all', { c: c.ghost });
  } },

{ id: 'VH-04', n: 'Open differential', f: 'Vehicles', d: 'crank', rate: 1.2,
  pga: 'ω_L + ω_R = 2ω_carrier: the spider gears enforce a sum, not an equality',
  i: 'Drag to drive the ring. Move the pointer left or right to load one wheel — the other speeds up to match.',
  draw(g, io, st) {
    const c = g.col, O = [160, 108], rR = 74, wc = io.u;
    const bias = io.hover ? clamp((io.mx - 160) / 120, -1, 1) : 0.45 * sin(io.t * 0.5);
    const wl = wc * (1 + bias), wr = wc * (1 - bias);
    g.ring(O, rR, 30, wc, {});
    g.gear([O[0] - 40, O[1]], 22, 10, -wl * 2, { pitch: false });
    g.gear([O[0] + 40, O[1]], 22, 10, wr * 2, { pitch: false });
    for (const s of [-1, 1]) {
      const Sp = [O[0], O[1] + s * 40];
      g.gear(Sp, 16, 8, (s * (wl - wr)) / 2 + wc, { pitch: false, hub: false });
      g.line([O[0], O[1]], Sp, { c: c.ghost, w: 2 });
    }
    g.line([O[0] - 62, O[1]], [22, O[1]], { c: c.ink, w: 3 });
    g.line([O[0] + 62, O[1]], [298, O[1]], { c: c.ink, w: 3 });
    g.box([32, O[1]], 12, 52, 0, { c: c.ink, w: 1.6 });
    g.box([288, O[1]], 12, 52, 0, { c: c.ink, w: 1.6 });
    g.dot(O, 2.2, {});
    g.txt([14, 202], 'ω_L ' + wl.toFixed(2) + '   ·   ω_R ' + wr.toFixed(2) + '   ·   sum ' + (wl + wr).toFixed(2) + ' = 2ω_c ' + (2 * wc).toFixed(2));
    g.txt([14, 216], 'lift a wheel and it takes all the speed and none of the torque');
  } },

// ── Rolling & curves ─────────────────────────────────────────────────────
{ id: 'RC-01', n: 'Rolling wheel → cycloid', f: 'Rolling & curves', d: 'crank', rate: 1,
  pga: 'no-slip: M = Tr(s,0) ∘ Rot(hub, s/r); the rim point’s orbit is the cycloid',
  i: 'Drag to roll. The rim marker stops dead at every ground contact — the cusp is real, not drawn.',
  draw(g, io, st) {
    const c = g.col, r = 40, y = 152, s = ((io.u * 30) % 360) - 20;
    const hub = [24 + s, y - r], th = s / r;
    g.line([8, y], [312, y], { c: c.ink, w: 1.4 });
    g.hatch([[8, y], [312, y], [312, 164], [8, 164]], { s: 5 });
    const cy = []; for (let i = 0; i <= 240; i++) { const t = (i / 240) * TAU * 2.4 - 0.5; cy.push([24 + t * r, y - r + r * sin(t - PI / 2 + 0) * 0 - r * cos(t) * 0 + (-r * cos(t)) * 0 + (r * -cos(t) * 0) + (r * sin(t + PI / 2) * 0) + (-r * cos(t + 0)) * 0 - r * cos(t) * 0]); }
    const cyc = []; for (let i = 0; i <= 260; i++) { const t = (i / 260) * TAU * 2.6 - 0.6; cyc.push([24 + t * r + r * sin(-t), y - r + r * cos(-t)]); }
    g.path(cyc, { c: c.faint, w: 0.9 });
    g.circle(hub, r, { c: c.ink, w: 1.5 });
    for (let i = 0; i < 8; i++) g.line(pol(hub, 5, th + (i * TAU) / 8), pol(hub, r - 3, th + (i * TAU) / 8), { c: c.faint, w: 0.8 });
    const rim = pol(hub, r, th + PI / 2);
    g.line(hub, rim, { c: c.accent, w: 1.4 });
    g.dot(rim, 3.4, { c: c.accent });
    g.dot([hub[0], y], 2.6, { c: c.ink });
    g.ghost([hub[0], y], [hub[0], hub[1] - r]);
    g.txt([14, 190], 'travel ' + (s + 20).toFixed(0) + ' px   ·   θ = s/r = ' + (th / TAU).toFixed(2) + ' rev');
    g.txt([14, 204], 'contact point is the instantaneous centre — velocity there is zero');
    g.txt([14, 218], 'a cusp per revolution, arc length 8r per turn');
  } },

{ id: 'RC-02', n: 'Epicycloid', f: 'Rolling & curves', d: 'crank', rate: 0.9,
  pga: 'rolling circle motor composed outside the fixed one: Rot(O,θ) ∘ Rot(centre, −θ·R/r)',
  i: 'Drag to roll the small wheel around the outside. Ratio 4:1 gives four cusps.',
  draw(g, io, st) {
    const c = g.col, O = [150, 108], R = 60, r = 15, th = io.u;
    g.circle(O, R, { c: c.ink, w: 1.4 }); g.dot(O, 2.2, {});
    const cen = pol(O, R + r, th);
    const spin = -th * (R / r) - th;
    g.circle(cen, r, { c: c.ink, w: 1.3 });
    const pen = pol(cen, r, spin);
    g.line(cen, pen, { c: c.accent, w: 1.2 });
    const cv = []; for (let i = 0; i <= 320; i++) { const t = (i / 320) * TAU * (r / R) * 4; const cc = pol(O, R + r, t); cv.push(pol(cc, r, -t * (R / r) - t)); }
    g.path(cv, { c: c.faint, w: 0.95, close: true });
    if (io.traces !== false) g.trace(st, 'tr', pen, 240);
    g.dot(pen, 3.2, { c: c.accent });
    g.circle(O, R + r, { c: c.faint, w: 0.6, dash: [2, 4] });
    g.txt([14, 200], 'R/r = ' + (R / r).toFixed(0) + '   ·   ' + (R / r).toFixed(0) + ' cusps   ·   cardioid at 1:1, nephroid at 2:1');
    g.txt([14, 214], 'the same construction gives gear-tooth epicycloidal flanks');
  } },

{ id: 'RC-03', n: 'Hypocycloid', f: 'Rolling & curves', d: 'crank', rate: 0.9,
  pga: 'rolling inside: at R/r = 2 the trace degenerates to a straight line (Cardan motion)',
  i: 'Drag to roll inside. Ratio 4:1 draws an astroid; the dashed pair shows the 2:1 straight-line case.',
  draw(g, io, st) {
    const c = g.col, O = [150, 108], R = 64, r = 16, th = io.u;
    g.circle(O, R, { c: c.ink, w: 1.4 }); g.dot(O, 2.2, {});
    const cen = pol(O, R - r, th), spin = th * (R / r) - th;
    g.circle(cen, r, { c: c.ink, w: 1.3 });
    const pen = pol(cen, r, spin + PI);
    g.line(cen, pen, { c: c.accent, w: 1.2 });
    const cv = []; for (let i = 0; i <= 360; i++) { const t = (i / 360) * TAU; const cc = pol(O, R - r, t); cv.push(pol(cc, r, t * (R / r) - t + PI)); }
    g.path(cv, { c: c.faint, w: 0.95, close: true });
    const cen2 = pol(O, R / 2, -th * 1.4);
    g.circle(cen2, R / 2, { c: c.faint, w: 0.6, dash: [2, 4] });
    g.line(pol(O, R, -th * 1.4 + 0), pol(O, R, -th * 1.4 + PI), { c: c.ghost, w: 0.8, dash: [4, 3] });
    if (io.traces !== false) g.trace(st, 'tr', pen, 260);
    g.dot(pen, 3.2, { c: c.accent });
    g.txt([14, 200], 'R/r = 4 ⇒ astroid   ·   R/r = 2 ⇒ diameter (dashed)');
    g.txt([14, 214], 'this is how a Cardan gear converts rotation to a straight stroke');
  } },

{ id: 'RC-04', n: 'Spirograph', f: 'Rolling & curves', d: 'crank', rate: 1.6,
  pga: 'pen = Ap(Rot(O,θ) ∘ Rot(centre, kθ), pen offset) — two rotors, one long trace',
  i: 'Drag to draw; move the pointer up or down to move the pen hole and change the pattern.',
  draw(g, io, st) {
    const c = g.col, O = [160, 106], R = 70, r = 27, th = io.u;
    const d = io.hover ? clamp(24 - (io.my - 30) * 0.11, 5, 24) : 17;
    if (st.d !== undefined && Math.abs(st.d - d) > 0.6) st.tr = [];
    st.d = d;
    g.circle(O, R, { c: c.faint, w: 0.9 });
    const cen = pol(O, R - r, th), spin = th * (R / r) - th;
    g.circle(cen, r, { c: c.ghost, w: 1 });
    const pen = pol(cen, d, spin + PI);
    g.line(cen, pen, { c: c.accent, w: 1 });
    const cv = []; for (let i = 0; i <= 900; i++) { const t = (i / 900) * TAU * 27; const cc = pol(O, R - r, t); cv.push(pol(cc, d, t * (R / r) - t + PI)); }
    g.path(cv, { c: c.accent, w: 0.6, a: 0.5 });
    g.dot(pen, 2.6, { c: c.accent });
    g.txt([14, 200], 'R ' + R + ' · r ' + r + ' · pen ' + d.toFixed(0) + '   ·   closes after ' + (r / 1) + ' laps (gcd 1)');
    g.txt([14, 214], 'ratio picks the rosette; pen radius picks how tight it laces');
  } },

{ id: 'RC-05', n: 'Involute generation', f: 'Rolling & curves', d: 'crank', rate: 0.7,
  pga: 'unwind a taut line: pen = tangent point + t·û(tangent) — the gear-tooth flank, generated',
  i: 'Drag to unwind the string off the base circle. That curve is why involute teeth mesh at constant ratio.',
  draw(g, io, st) {
    const c = g.col, O = [116, 122], rb = 44;
    const t = 0.15 + (((io.u * 0.5) % 1.5));
    g.circle(O, rb, { c: c.ink, w: 1.5 }); g.dot(O, 2.2, {});
    const cv = []; for (let i = 0; i <= 90; i++) { const a = (i / 90) * 1.65; const tp = pol(O, rb, a - PI / 2); cv.push([tp[0] + rb * a * cos(a), tp[1] + rb * a * sin(a)]); }
    g.path(cv, { c: c.faint, w: 1 });
    const tp = pol(O, rb, t - PI / 2);
    const pen = [tp[0] + rb * t * cos(t), tp[1] + rb * t * sin(t)];
    g.line(O, tp, { c: c.ghost, w: 0.9, dash: [3, 3] });
    g.line(tp, pen, { c: c.accent, w: 1.5 });
    g.arc(O, rb + 4, -PI / 2, t - PI / 2, { c: c.faint, w: 0.8 });
    g.dot(pen, 3.4, { c: c.accent }); g.dot(tp, 2.4, { c: c.ink });
    const flank = cv.slice(0, 40);
    g.path(flank.map((p) => [p[0] + 108, p[1] - 4]), { c: c.ink, w: 1.6 });
    g.path(flank.map((p) => [280 - (p[0] - O[0]) - (O[0] - 108) * 0 - 0, p[1] - 4]), { c: c.ink, w: 1.6 });
    g.txt([196, 40], 'one tooth flank', { c: c.ghost });
    g.txt([14, 202], 'unwound ' + (rb * t).toFixed(0) + ' px   ·   pressure angle constant along the line of action');
    g.txt([14, 216], 'string length = arc length: that is the whole definition');
  } },

{ id: 'RC-06', n: 'Ball bearing', f: 'Rolling & curves', d: 'crank', rate: 1.4,
  pga: 'cage ω = ω_inner·d_i/(d_i+d_o); each ball spins about its own moving centre',
  i: 'Drag to spin the inner race. The cage runs at 40% of race speed — bearing frequencies, drawn.',
  draw(g, io, st) {
    const c = g.col, O = [160, 108], ri = 34, ro = 74, rb = (ro - ri) / 2, n = 9, wi = io.u;
    const wc = (wi * ri) / (ri + ro);
    g.circle(O, ro, { c: c.ink, w: 1.6 }); g.circle(O, ro + 10, { c: c.ink, w: 1.6 });
    g.circle(O, ri, { c: c.ink, w: 1.6 }); g.circle(O, ri - 11, { c: c.ink, w: 1.6 });
    g.hatch([[O[0] - ro - 10, O[1] - ro - 10], [O[0] + ro + 10, O[1] - ro - 10], [O[0] + ro + 10, O[1] - ro], [O[0] - ro - 10, O[1] - ro]], { s: 4 });
    for (let i = 0; i < 8; i++) g.line(pol(O, ri - 11, wi + (i * TAU) / 8), pol(O, ri, wi + (i * TAU) / 8), { c: c.faint, w: 0.8 });
    g.circle(O, ri + rb, { c: c.faint, w: 0.7, dash: [3, 3] });
    for (let i = 0; i < n; i++) {
      const a = wc + (i * TAU) / n, Cc = pol(O, ri + rb, a);
      const spin = -(wi - wc) * (ri / rb) + a;
      g.circle(Cc, rb, { c: c.ink, w: 1.3 });
      g.line(Cc, pol(Cc, rb - 2, spin), { c: c.accent, w: 1 });
    }
    g.txt([14, 204], 'ω_cage / ω_inner = ' + (ri / (ri + ro)).toFixed(2) + '   ·   ' + n + ' balls   ·   BPFO = ' + (n * (ri / (ri + ro))).toFixed(2) + '×');
    g.txt([14, 218], 'the ratio is why bearing faults show at non-integer orders');
  } },

// ── Oscillators ──────────────────────────────────────────────────────────
{ id: 'OS-01', n: 'Double pendulum', f: 'Oscillators', d: 'grab',
  pga: 'motor chain for placement, Lagrangian integrator for state — PGA holds geometry, not dynamics',
  i: 'Press and drag inside the frame to fling the lower bob; let go and the chaos takes over.',
  draw(g, io, st) {
    const c = g.col, O = [160, 62], l1 = 62, l2 = 58;
    st.a1 ??= 2.2; st.a2 ??= 2.6; st.v1 ??= 0; st.v2 ??= 0;
    const dt = Math.min(0.02, io.dt);
    if (io.down) {
      const T = [io.mx, io.my];
      st.a1 = ang(O, T) - PI / 2 * 0;
      const P1 = pol(O, l1, st.a1);
      st.a2 = ang(P1, T);
      st.v1 = st.v2 = 0;
      st.tr = [];
    } else {
      for (let k = 0; k < 3; k++) {
        const g0 = 900, m1 = 1, m2 = 1;
        const d = st.a1 - st.a2, s = sin(d), cd = cos(d);
        const den = 2 * m1 + m2 - m2 * cos(2 * d);
        const A1 = (-g0 * (2 * m1 + m2) * sin(st.a1 - PI / 2) - m2 * g0 * sin(st.a1 - 2 * st.a2 + PI / 2) - 2 * s * m2 * (st.v2 * st.v2 * l2 + st.v1 * st.v1 * l1 * cd)) / (l1 * den);
        const A2 = (2 * s * (st.v1 * st.v1 * l1 * (m1 + m2) + g0 * (m1 + m2) * sin(st.a1 - PI / 2) + st.v2 * st.v2 * l2 * m2 * cd)) / (l2 * den);
        st.v1 = (st.v1 + A1 * dt) * 0.9995; st.v2 = (st.v2 + A2 * dt) * 0.9995;
        st.a1 += st.v1 * dt; st.a2 += st.v2 * dt;
      }
    }
    const P1 = pol(O, l1, st.a1), P2 = pol(P1, l2, st.a2);
    if (io.traces !== false) g.trace(st, 'tr', P2, 320, { a: 0.45 });
    g.fix(O, -PI / 2, {});
    g.bar(O, P1, { w: 2.4 }); g.bar(P1, P2, { w: 2.2 });
    g.dot(P1, 6, { c: c.ink }); g.dot(P2, 7, { c: c.accent });
    g.circle(O, l1 + l2, { c: c.faint, w: 0.6, dash: [2, 5] });
    g.txt([14, 208], 'θ₁ ' + (st.a1 * 57.3).toFixed(0) + '°  θ₂ ' + (st.a2 * 57.3).toFixed(0) + '°   ·   |ω| ' + (Math.abs(st.v1) + Math.abs(st.v2)).toFixed(1) + ' rad/s');
    g.txt([14, 222], 'deterministic, and still unpredictable past a few seconds');
  } },

{ id: 'OS-02', n: 'Coupled pendulums', f: 'Oscillators', d: 'grab',
  pga: 'two rotors joined by a spring constraint — energy walks from one to the other and back',
  i: 'Drag either bob aside and release. Energy beats between them at the difference of the two normal modes.',
  draw(g, io, st) {
    const c = g.col, A = [104, 46], B = [216, 46], l = 106, k = 2.2;
    st.a ??= 0.5; st.b ??= 0; st.va ??= 0; st.vb ??= 0;
    const dt = Math.min(0.02, io.dt);
    if (io.down) {
      const T = [io.mx, io.my];
      if (io.mx < 160) { st.a = ang(A, T) - PI / 2; st.va = 0; } else { st.b = ang(B, T) - PI / 2; st.vb = 0; }
    } else {
      for (let i = 0; i < 3; i++) {
        const w2 = 900 / l;
        const aa = -w2 * sin(st.a) - k * (st.a - st.b), ab = -w2 * sin(st.b) - k * (st.b - st.a);
        st.va = (st.va + aa * dt) * 0.9998; st.vb = (st.vb + ab * dt) * 0.9998;
        st.a += st.va * dt; st.b += st.vb * dt;
      }
    }
    g.line([76, 40], [244, 40], { c: c.ink, w: 1.8 });
    g.hatch([[76, 30], [244, 30], [244, 40], [76, 40]], { s: 4 });
    const Pa = pol(A, l, st.a + PI / 2), Pb = pol(B, l, st.b + PI / 2);
    g.spring([Pa[0], Pa[1] - 26], [Pb[0], Pb[1] - 26], 10, 5, { c: c.accent, w: 1.2 });
    g.bar(A, Pa, { w: 1.8 }); g.bar(B, Pb, { w: 1.8 });
    g.dot(Pa, 8, { c: c.ink }); g.dot(Pb, 8, { c: c.ink });
    g.ghost([A[0], A[1]], [A[0], A[1] + l + 14]); g.ghost([B[0], B[1]], [B[0], B[1] + l + 14]);
    const ea = st.a * st.a + (st.va * st.va) / (900 / l), eb = st.b * st.b + (st.vb * st.vb) / (900 / l);
    g.plot(24, 178, 120, 30, [ea, eb].map((v) => clamp(v / 0.5, 0, 1)).concat([0]), null, { label: 'energy split' });
    g.txt([160, 196], 'E_A ' + (100 * ea / (ea + eb + 1e-6)).toFixed(0) + '%  ·  E_B ' + (100 * eb / (ea + eb + 1e-6)).toFixed(0) + '%');
    g.txt([160, 210], 'beat period = 2π/Δω');
  } },

{ id: 'OS-03', n: 'Lever escapement', f: 'Oscillators', d: 'crank', rate: 1.6,
  pga: 'oscillator gates a ratchet: the wheel advances one tooth per half period, both pallets locking',
  i: 'Drag to run the balance faster or slower. The wheel only moves when a pallet unlocks — that is the tick.',
  draw(g, io, st) {
    const c = g.col, W = [96, 118], rw = 52, n = 15, Bc = [232, 112], rb = 44;
    const beat = io.u * 3;
    const bal = 1.05 * sin(beat);
    st.w ??= 0; st.side ??= 1;
    if (st.side > 0 && bal < 0) { st.w += TAU / n; st.side = -1; }
    if (st.side < 0 && bal > 0) { st.w += TAU / n; st.side = 1; }
    const pts = [];
    for (let i = 0; i < n; i++) { const a = st.w + (i * TAU) / n; pts.push(pol(W, rw, a), pol(W, rw * 0.82, a + (TAU / n) * 0.55), pol(W, rw * 0.86, a + (TAU / n) * 0.98)); }
    g.path(pts, { close: true, c: c.ink, w: 1.3 });
    g.circle(W, 8, { c: c.ink, w: 1.1 }); g.dot(W, 1.6, {});
    const F = [164, 96], fa = -0.34 * Math.sign(bal || 1);
    g.line(pol(F, 30, PI + fa), pol(F, 30, fa), { c: c.ink, w: 2.6 });
    g.dot(pol(F, 30, PI + fa), 3, { c: c.accent });
    g.dot(pol(F, 30, fa), 3, { c: c.accent });
    g.fix(F, -PI / 2, {});
    g.line(F, pol(F, 26, fa + PI / 2), { c: c.ink, w: 2 });
    g.circle(Bc, rb, { c: c.ghost, w: 1.4 });
    g.circle(Bc, rb - 5, { c: c.faint, w: 0.8 });
    for (let i = 0; i < 4; i++) g.line(pol(Bc, 6, bal + (i * TAU) / 4), pol(Bc, rb - 5, bal + (i * TAU) / 4), { c: c.ink, w: 1.2 });
    g.line(Bc, pol(Bc, rb - 5, bal), { c: c.accent, w: 1.6 });
    g.spring(Bc, pol(Bc, rb - 12, bal + 2.4), 7, 3, { c: c.faint, w: 0.8 });
    g.txt([14, 204], 'balance ' + (bal * 57.3).toFixed(0) + '°   ·   wheel ' + (st.w / (TAU / n)).toFixed(0) + ' teeth   ·   2 ticks per period');
    g.txt([14, 218], 'the impulse arrives only at unlock — an isochronous gate');
  } },

{ id: 'OS-04', n: "Newton's cradle", f: 'Oscillators', d: 'grab',
  pga: 'elastic collision along the join of two centres: the whole impulse transfers, ends swap',
  i: 'Drag an end ball aside and release. Momentum crosses the stack and comes out the far side.',
  draw(g, io, st) {
    const c = g.col, y0 = 46, l = 104, r = 13, n = 5, x0 = 160 - ((n - 1) * 2 * r) / 2;
    st.A ??= 0.62; st.ph ??= 0; st.side ??= -1;
    if (io.down) {
      const s = io.mx < 160 ? -1 : 1;
      const px = x0 + (s < 0 ? 0 : (n - 1) * 2 * r);
      st.A = clamp(Math.abs(ang([px, y0], [io.mx, io.my]) - PI / 2), 0.05, 1.1);
      st.side = s; st.ph = 0;
    } else {
      st.ph += io.dt * sq(900 / l);
      if (st.ph > PI / 2) { st.ph = -PI / 2; st.side *= -1; }
    }
    g.line([60, 34], [260, 34], { c: c.ink, w: 1.8 });
    g.hatch([[60, 24], [260, 24], [260, 34], [60, 34]], { s: 4 });
    const swing = st.A * cos(st.ph);
    for (let i = 0; i < n; i++) {
      const px = x0 + i * 2 * r;
      const isEnd = (st.side < 0 && i === 0) || (st.side > 0 && i === n - 1);
      const a = isEnd ? (st.side < 0 ? -Math.abs(swing) : Math.abs(swing)) : 0;
      const Pp = pol([px, y0], l, a + PI / 2);
      g.line([px - 6, 34], Pp, { c: c.faint, w: 0.9 });
      g.line([px + 6, 34], Pp, { c: c.faint, w: 0.9 });
      g.circle(Pp, r, { c: isEnd ? c.accent : c.ink, w: 1.6 });
      g.dot(Pp, 1.6, { c: c.faint });
    }
    g.ghost([x0 - 20, y0 + l], [x0 + n * 2 * r + 20, y0 + l]);
    g.txt([14, 204], 'amplitude ' + (st.A * 57.3).toFixed(0) + '°   ·   ' + n + ' balls   ·   momentum and energy both conserved');
    g.txt([14, 218], 'the middle balls barely move — they only pass the impulse on');
  } },

{ id: 'OS-05', n: 'Damped mass-spring', f: 'Oscillators', d: 'grab',
  pga: 'x″ = −(k/m)x − (c/m)x′ — the prismatic constraint holds the mass to one line',
  i: 'Drag the mass and release. Hover to read the envelope; the decay is exponential, the period is not affected.',
  draw(g, io, st) {
    const c = g.col, y = 96, x0 = 46, rest = 200;
    st.x ??= rest + 50; st.v ??= 0;
    if (io.down) { st.x = clamp(io.mx, x0 + 60, 300); st.v = 0; }
    else { const k = 90, cc = 2.2; for (let i = 0; i < 3; i++) { const a = -k * (st.x - rest) - cc * st.v; st.v += a * Math.min(0.02, io.dt); st.x += st.v * Math.min(0.02, io.dt); } }
    g.line([x0, 40], [x0, 152], { c: c.ink, w: 2 });
    g.hatch([[x0 - 12, 40], [x0, 40], [x0, 152], [x0 - 12, 152]], { s: 5 });
    g.spring([x0, y], [st.x - 22, y], 12, 9, { c: c.ink, w: 1.2 });
    g.rail([x0 + 10, y + 30], [304, y + 30], { w2: 5, c: c.faint });
    g.box([st.x, y], 44, 48, 0, { c: c.ink, w: 1.9 });
    g.hatch([[st.x - 22, y - 24], [st.x + 22, y - 24], [st.x + 22, y + 24], [st.x - 22, y + 24]], { s: 7, a: 0.5 });
    g.ghost([rest, 30], [rest, 162]);
    g.trace(st, 'ph', [rest + (st.x - rest) * 0.9, 190 - st.v * 0.06], 240, { c: c.accent, a: 0.5, on: io.traces !== false });
    g.txt([14, 176], 'x − x₀ ' + (st.x - rest).toFixed(0) + ' px   ·   v ' + st.v.toFixed(0) + ' px/s   ·   phase portrait below');
    g.txt([14, 222], 'ζ ≈ 0.12 — underdamped: it rings ' + '≈ 8 cycles before it settles');
  } },

// ── Deployables & chains ─────────────────────────────────────────────────
{ id: 'DP-01', n: 'Scissor lift', f: 'Deployables & chains', d: 'toggle', on0: false,
  pga: 'n cells share one angle: height = n·2ℓ·sin(φ), each pin a rotor about the cell centre',
  i: 'Click to raise and lower. One hydraulic input, four cells, straight vertical travel.',
  draw(g, io, st) {
    const c = g.col, n = 4, l = 30, t = io.tgl, ph = lerp(0.34, 1.24, t);
    const dy = 2 * l * sin(ph), w = 2 * l * cos(ph), base = 196, cx = 160;
    g.line([cx - 74, base + 8], [cx + 74, base + 8], { c: c.ink, w: 1.8 });
    g.hatch([[cx - 74, base + 8], [cx + 74, base + 8], [cx + 74, base + 18], [cx - 74, base + 18]], { s: 5 });
    for (let i = 0; i < n; i++) {
      const y0 = base - i * dy, y1 = y0 - dy;
      g.line([cx - w / 2, y0], [cx + w / 2, y1], { c: c.ink, w: 2 });
      g.line([cx + w / 2, y0], [cx - w / 2, y1], { c: c.ink, w: 2 });
      g.pin([cx, (y0 + y1) / 2], { r: 2.6 });
      g.pin([cx - w / 2, y0], { r: 2.3 }); g.pin([cx + w / 2, y0], { r: 2.3 });
    }
    const top = base - n * dy;
    g.box([cx, top - 8], 150, 14, 0, { c: c.ink, w: 1.8 });
    g.line([cx - w / 2, base], [cx + w / 2, base], { c: c.ghost, w: 1.4 });
    const cyl = [cx - w / 2 + 4, base - 2], rod = [cx + w / 2 - 4, base - dy + 2];
    g.line(cyl, mix(cyl, rod, 0.55), { c: c.ink, w: 5 });
    g.line(mix(cyl, rod, 0.5), rod, { c: c.accent, w: 2.4 });
    g.txt([14, 200], (t > 0.5 ? 'RAISED' : 'LOWERED') + '   ·   height ' + (base - top).toFixed(0) + ' px   ·   cell angle ' + (ph * 57.3).toFixed(0) + '°');
    g.txt([14, 214], 'force demand is worst at the bottom, where the angle is flattest');
  } },

{ id: 'DP-02', n: 'Expanding ring (Hoberman cell)', f: 'Deployables & chains', d: 'crank', rate: 0.7,
  pga: 'n angular copies of one scissor pair: Rot(O, 2πk/n) applied to a single solved cell',
  i: 'Drag to breathe the ring open and shut. Every joint is the same part, rotated.',
  draw(g, io, st) {
    const c = g.col, O = [160, 106], n = 12, t = 0.5 + 0.45 * sin(io.u);
    const r1 = lerp(34, 78, t), r2 = lerp(52, 92, t);
    for (let i = 0; i < n; i++) {
      const M = Rot(O[0], O[1], (i * TAU) / n);
      const a = Ap(M, [O[0] + r1, O[1]]);
      const b = Ap(Mul(M, Rot(O[0], O[1], TAU / n)), [O[0] + r1, O[1]]);
      const m1 = Ap(Mul(M, Rot(O[0], O[1], TAU / n / 2)), [O[0] + r2, O[1]]);
      g.line(a, m1, { c: c.ink, w: 1.8 });
      g.line(m1, b, { c: c.ink, w: 1.8 });
      g.pin(a, { r: 2.4 }); g.pin(m1, { r: 2.2 });
      const prev = Ap(Mul(M, Rot(O[0], O[1], -TAU / n / 2)), [O[0] + r2, O[1]]);
      g.line(prev, [a[0] + (a[0] - prev[0]) * 0.92, a[1] + (a[1] - prev[1]) * 0.92], { c: c.ghost, w: 1.2, dash: [] });
    }
    g.circle(O, r1, { c: c.faint, w: 0.7, dash: [3, 3] });
    g.circle(O, r2, { c: c.faint, w: 0.7, dash: [3, 3] });
    g.dot(O, 2, {});
    g.txt([14, 204], 'ratio ' + (r2 / r1).toFixed(2) + '   ·   ⌀ ' + (2 * r2).toFixed(0) + ' px   ·   ' + n + ' identical cells');
    g.txt([14, 218], 'one DOF: hold any joint and the whole ring is set');
  } },

{ id: 'DP-03', n: 'Roller chain on sprockets', f: 'Deployables & chains', d: 'crank', rate: 1.1,
  pga: 'chain path = tangent lines (from Tan) + wrap arcs; links placed at equal arc length',
  i: 'Drag to run the chain. Links are laid along the path by arc length, so pitch stays exact.',
  draw(g, io, st) {
    const c = g.col, A = [86, 110], B = [232, 110], rA = 40, rB = 24, th = io.u;
    const path = [];
    for (let i = 0; i <= 40; i++) { const a = -PI / 2 + (i / 40) * PI; path.push(pol(B, rB, a)); }
    for (let i = 0; i <= 40; i++) { const a = PI / 2 + (i / 40) * PI; path.push(pol(A, rA, a)); }
    path.push(pol(B, rB, -PI / 2));
    g.path(path, { c: c.faint, w: 0.8 });
    const links = spaced(path, 26, th * 22);
    links.forEach((L, i) => {
      const q = links[(i + 1) % links.length];
      g.line(L.p, q.p, { c: c.accent, w: i % 2 ? 1.6 : 2.4 });
      g.dot(L.p, 2.2, { c: c.ink });
    });
    g.gear(A, rA, 15, th, { pitch: false });
    g.gear(B, rB, 9, -th * (rA / rB) + PI, { pitch: false });
    g.fix(A, -PI / 2, { s: 0.1 }); g.fix(B, -PI / 2, { s: 0.1 });
    g.txt([14, 200], 'z 15 : 9   ·   ratio ' + (15 / 9).toFixed(2) + '   ·   26 links   ·   pitch constant');
    g.txt([14, 214], 'a chain is a linkage that keeps re-entering the same mesh');
  } },

{ id: 'DP-04', n: 'Tank track', f: 'Deployables & chains', d: 'crank', rate: 1,
  pga: 'plates ride the hull loop by arc length; each plate’s motor is Tr(p) ∘ Rot(p, tangent)',
  i: 'Drag to drive the track. Plates follow the loop tangent, road wheels roll at the track speed.',
  draw(g, io, st) {
    const c = g.col, y = 128, th = io.u;
    const drive = [252, y - 14], idler = [64, y - 14], rD = 22, rI = 20;
    const path = [];
    for (let i = 0; i <= 30; i++) { const a = -PI / 2 + (i / 30) * PI; path.push(pol(drive, rD, a)); }
    path.push([drive[0], y + 22], [idler[0], y + 22]);
    for (let i = 0; i <= 30; i++) { const a = PI / 2 + (i / 30) * PI; path.push(pol(idler, rI, a)); }
    path.push([idler[0], y - 36], [drive[0], y - 36]);
    g.path(path, { close: true, c: c.faint, w: 0.9 });
    spaced(path, 34, th * 26).forEach((L) => {
      g.box(L.p, 9, 6, L.a, { c: c.ink, w: 1.1 });
    });
    for (let i = 0; i < 4; i++) {
      const w = [96 + i * 40, y + 6];
      g.circle(w, 15, { c: c.ink, w: 1.4 });
      for (let k = 0; k < 5; k++) g.line(pol(w, 4, th * 1.7 + (k * TAU) / 5), pol(w, 13, th * 1.7 + (k * TAU) / 5), { c: c.faint, w: 0.8 });
    }
    g.gear(drive, rD, 11, -th * 1.2, { pitch: false });
    g.circle(idler, rI, { c: c.ink, w: 1.4 });
    g.path([[52, y - 44], [268, y - 44], [268, y - 66], [190, y - 66], [172, y - 80], [80, y - 80], [52, y - 60]], { close: true, c: c.ink, w: 1.6 });
    g.txt([14, 200], 'plates 34   ·   drive sprocket z 11   ·   idler free');
    g.txt([14, 214], 'contact patch is the whole lower run — that is the point');
  } },

{ id: 'DP-05', n: 'Umbrella rib set', f: 'Deployables & chains', d: 'toggle', on0: false,
  pga: 'runner on the shaft (prismatic) drives each rib through a stretcher dyad, ×8 by rotation',
  i: 'Click to open. The runner slides up the shaft and every rib solves to the same angle.',
  draw(g, io, st) {
    const c = g.col, S = [160, 34], t = io.tgl, top = [160, 44];
    const run = [160, lerp(150, 96, t)], rib = 78, str = 44, hub = 12;
    g.line([160, 30], [160, 208], { c: c.ink, w: 2.6 });
    g.box([160, 202], 26, 8, 0, { c: c.ink, w: 1.4 });
    for (const s of [-1, 1]) for (const k of [1, 0.62, 0.3]) {
      const dir = s * k;
      const tip = CC(top, rib, run, str + rib * 0.44, s > 0 ? -1 : 1);
      const tp = [160 + dir * Math.abs(tip[0] - 160), tip[1] * 1];
      const jt = mix(top, tp, 0.52);
      g.line(top, tp, { c: c.ink, w: k > 0.9 ? 2 : 1.4, a: k > 0.9 ? 1 : 0.6 });
      g.line(run, jt, { c: c.ghost, w: k > 0.9 ? 1.6 : 1.1, a: k > 0.9 ? 1 : 0.6 });
      if (k > 0.9) { g.pin(tp, { r: 2.4 }); g.pin(jt, { r: 2.2 }); }
    }
    const canopy = [];
    const tipR = CC(top, rib, run, str + rib * 0.44, -1);
    const dx = Math.abs(tipR[0] - 160), dy = tipR[1];
    for (let i = -1; i <= 1; i += 0.1) canopy.push([160 + i * dx, lerp(44, dy, Math.abs(i)) + (1 - Math.abs(i)) * 0 + 6 * (1 - i * i) * (1 - t) * 0 + 8 * (1 - i * i) * 0]);
    g.path(canopy, { c: c.accent, w: 1.8 });
    g.box(run, 20, 12, 0, { c: c.ink, w: 1.6 });
    g.circle(top, 5, { c: c.ink, w: 1.2 });
    g.txt([14, 200], (t > 0.5 ? 'OPEN' : 'FURLED') + '   ·   rib ' + (ang(top, tipR) * 57.3).toFixed(0) + '°   ·   8 ribs, 1 DOF');
    g.txt([14, 214], 'the stretcher is what turns a slide into a fan');
  } },

// ── Construction equipment ───────────────────────────────────────────────
{ id: 'CS-01', n: 'Excavator arm', f: 'Construction', d: 'point',
  pga: 'base → boom → stick → bucket: each a rotor, the chain solved to the pointer by IK',
  i: 'Move the pointer to place the bucket teeth; the boom and stick solve, the bucket keeps its curl.',
  draw(g, io, st) {
    const c = g.col, Bs = [72, 152], boom = 96, stick = 74;
    const T = reach(Bs, [clamp(io.mx, 40, 306), clamp(io.my, 26, 190)], boom + stick - 2);
    const E = CC(Bs, boom, T, stick, 1);
    g.line([20, 190], [300, 190], { c: c.ink, w: 1.4 });
    g.hatch([[20, 190], [300, 190], [300, 206], [20, 206]], { s: 6 });
    g.path([[36, 190], [40, 172], [108, 172], [112, 190]], { close: true, c: c.ink, w: 1.6 });
    for (const x of [50, 74, 98]) g.circle([x, 184], 7, { c: c.ghost, w: 1.1 });
    g.box([Bs[0], Bs[1] + 4], 62, 30, 0, { c: c.ink, w: 1.7 });
    g.bar(Bs, E, { w: 3.4 }); g.bar(E, T, { w: 2.8 });
    const u = norm([T[0] - E[0], T[1] - E[1]]);
    const bk = [[0, 0], [16, 14], [4, 30], [-14, 20]].map(([a, b]) => [T[0] + u[0] * a - u[1] * b, T[1] + u[1] * a + u[0] * b]);
    g.poly(bk, { c: c.ink, w: 2 });
    for (const [cy0, cy1, f] of [[Bs, E, 0.5], [E, T, 0.45]]) {
      const a = mix(cy0, cy1, 0.12), b = mix(cy0, cy1, f);
      g.line(a, mix(a, b, 0.6), { c: c.ghost, w: 5 });
      g.line(mix(a, b, 0.5), b, { c: c.accent, w: 2.2 });
    }
    g.fix(Bs, -PI / 2, {});
    g.circle([io.mx, io.my], 5, { c: c.ghost, w: 1 });
    g.txt([14, 220], 'boom ' + (ang(Bs, E) * 57.3).toFixed(0) + '°  ·  stick ' + (ang(E, T) * 57.3).toFixed(0) + '°  ·  reach ' + dist(Bs, T).toFixed(0) + ' of ' + (boom + stick));
  } },

{ id: 'CS-02', n: 'Tower crane', f: 'Construction', d: 'crank', rate: 0.5,
  pga: 'trolley = Tr(x,0) on the jib line; the load is a pendulum forced by the trolley’s acceleration',
  i: 'Drag the trolley along the jib. The load swings from its own inertia — stop hard and watch it.',
  draw(g, io, st) {
    const c = g.col, mast = 96, jib = 44, hookL = 74;
    const tx = 150 + 100 * sin(io.u);
    st.a ??= 0; st.v ??= 0; st.px ??= tx;
    const acc = (tx - st.px) / Math.max(0.001, io.dt);
    st.px = tx;
    const dt = Math.min(0.02, io.dt);
    st.v += (-(900 / hookL) * sin(st.a) - acc * 0.0006 - 1.2 * st.v) * dt;
    st.a += st.v * dt;
    g.line([mast - 9, 208], [mast - 9, jib], { c: c.ink, w: 1.6 });
    g.line([mast + 9, 208], [mast + 9, jib], { c: c.ink, w: 1.6 });
    for (let y = jib; y < 208; y += 14) { g.line([mast - 9, y], [mast + 9, y + 7], { c: c.faint, w: 0.8 }); g.line([mast + 9, y], [mast - 9, y + 7], { c: c.faint, w: 0.8 }); }
    g.hatch([[mast - 26, 208], [mast + 26, 208], [mast + 26, 220], [mast - 26, 220]], { s: 5 });
    g.line([56, jib], [296, jib], { c: c.ink, w: 1.8 });
    g.line([56, jib - 12], [296, jib - 12], { c: c.ghost, w: 1 });
    for (let x = 56; x < 296; x += 16) g.line([x, jib], [x + 8, jib - 12], { c: c.faint, w: 0.7 });
    g.line([mast, jib - 12], [mast, 24], { c: c.ink, w: 1.5 });
    g.rope([[mast, 26], [292, jib - 12]]); g.rope([[mast, 26], [60, jib - 12]]);
    g.box([66, jib + 16], 26, 22, 0, { c: c.ink, w: 1.5, hatch: true, hs: 5 });
    g.box([tx, jib + 8], 26, 12, 0, { c: c.ink, w: 1.6 });
    const hook = [tx + hookL * sin(st.a), jib + 8 + hookL * cos(st.a)];
    g.rope([[tx, jib + 12], hook]);
    g.box(hook, 42, 16, st.a, { c: c.ink, w: 1.7 });
    g.ghost([tx, jib + 12], [tx, jib + 12 + hookL + 12]);
    g.txt([14, 200], 'trolley x ' + tx.toFixed(0) + '   ·   swing ' + (st.a * 57.3).toFixed(1) + '°   ·   hoist ' + hookL + ' px');
    g.txt([14, 214], 'anti-sway control is just shaping this acceleration');
  } },

{ id: 'CS-03', n: 'Bascule bridge', f: 'Construction', d: 'toggle', on0: false,
  pga: 'leaf and counterweight are one rigid body about the trunnion: Rot(trunnion, θ) on both',
  i: 'Click to lift the leaf. The counterweight swings into the pier, so the drive only fights friction.',
  draw(g, io, st) {
    const c = g.col, Tn = [176, 128], t = io.tgl, th = -t * 1.16;
    g.line([12, 152], [Tn[0] - 34, 152], { c: c.ink, w: 2 });
    g.hatch([[12, 152], [Tn[0] - 34, 152], [Tn[0] - 34, 226], [12, 226]], { s: 7 });
    g.line([292, 152], [312, 152], { c: c.ink, w: 2 });
    g.path([[Tn[0] - 34, 152], [Tn[0] - 34, 200], [Tn[0] + 40, 200], [Tn[0] + 40, 152]], { c: c.ink, w: 1.6 });
    g.hatch([[Tn[0] - 34, 200], [Tn[0] + 40, 200], [Tn[0] + 40, 226], [Tn[0] - 34, 226]], { s: 7 });
    const M = Rot(Tn[0], Tn[1], th);
    const leaf = [[Tn[0] - 6, Tn[1] - 10], [Tn[0] + 118, Tn[1] - 10], [Tn[0] + 118, Tn[1] + 2], [Tn[0] - 6, Tn[1] + 2]].map((p) => Ap(M, p));
    const cw = [[Tn[0] - 14, Tn[1] + 6], [Tn[0] - 52, Tn[1] + 34], [Tn[0] - 20, Tn[1] + 56], [Tn[0] + 2, Tn[1] + 22]].map((p) => Ap(M, p));
    g.poly(leaf, { c: c.ink, w: 2 });
    for (let i = 1; i < 6; i++) { const a = Ap(M, [Tn[0] - 6 + i * 20, Tn[1] - 10]), b = Ap(M, [Tn[0] - 6 + i * 20 - 10, Tn[1] + 2]); g.line(a, b, { c: c.faint, w: 0.8 }); }
    g.poly(cw, { c: c.ghost, w: 1.6, hatch: true, hs: 5 });
    g.circle(Tn, 7, { c: c.ink, w: 1.5 }); g.dot(Tn, 1.8, {});
    g.ghost([Tn[0], Tn[1]], [Tn[0] + 130, Tn[1]]);
    g.arc(Tn, 42, th, 0, { c: c.faint, w: 0.9 });
    g.txt([14, 190], (t > 0.5 ? 'RAISED' : 'CLOSED') + '   ·   leaf ' + (-th * 57.3).toFixed(0) + '°   ·   balanced about the trunnion', { c: t > 0.5 ? c.accent : c.ghost });
    g.txt([14, 218], 'span ' + 124 + ' px · counterweight moment matched at every angle');
  } },

{ id: 'CS-04', n: 'Forklift mast (2:1 free lift)', f: 'Construction', d: 'crank', rate: 0.6,
  pga: 'chain over the inner-mast sheave doubles the ram: carriage = Tr(0, −2s) for ram travel s',
  i: 'Drag to lift. The carriage always rises twice as far and twice as fast as the inner mast.',
  draw(g, io, st) {
    const c = g.col, x = 176, base = 202, t = 0.5 + 0.5 * sin(io.u);
    const s = t * 52, inner = base - s, carr = base - 2 * s;
    g.path([[x - 30, base], [x - 30, 40], [x - 22, 40], [x - 22, base]], { close: true, c: c.ink, w: 1.5 });
    g.path([[x + 22, base], [x + 22, 40], [x + 30, 40], [x + 30, base]], { close: true, c: c.ink, w: 1.5 });
    g.path([[x - 18, inner], [x - 18, inner - 130], [x - 12, inner - 130], [x - 12, inner]], { close: true, c: c.ghost, w: 1.4 });
    g.path([[x + 12, inner], [x + 12, inner - 130], [x + 18, inner - 130], [x + 18, inner]], { close: true, c: c.ghost, w: 1.4 });
    const sh = [x, inner - 134];
    g.sheave(sh, 9, -s / 9);
    g.rope([[x - 15, inner - 6], [x - 9, sh[1]]]);
    g.arc(sh, 9, PI, TAU, { c: c.accent, w: 1.35 });
    g.rope([[x + 9, sh[1]], [x + 9, carr - 40]]);
    g.line([x - 22, inner - 4], [x + 22, inner - 4], { c: c.ghost, w: 1.6 });
    g.box([x, carr - 26], 52, 40, 0, { c: c.ink, w: 1.8 });
    g.line([x - 26, carr - 6], [x - 26, carr + 6], { c: c.ink, w: 2 });
    g.path([[x - 26, carr + 6], [x - 74, carr + 6]], { c: c.ink, w: 2.6 });
    g.path([[x + 26, carr + 6], [x + 74, carr + 6]], { c: c.ink, w: 2.6 });
    g.box([x - 50, carr - 12], 44, 30, 0, { c: c.accent, w: 1.5 });
    g.line([90, base], [280, base], { c: c.ink, w: 1.6 });
    g.hatch([[90, base], [280, base], [280, 214], [90, 214]], { s: 5 });
    g.txt([14, 190], 'ram ' + s.toFixed(0) + ' px   ·   carriage ' + (2 * s).toFixed(0) + ' px   ·   ratio 2:1');
    g.txt([14, 204], 'the free-lift stage clears the roof of a container');
  } },

// ── Mathematical machines ────────────────────────────────────────────────
{ id: 'MM-01', n: 'Orrery', f: 'Mathematical machines', d: 'crank', rate: 0.8,
  pga: 'strict hierarchy: M_moon = M_sun ∘ M_earth ∘ M_local — the reason PGA suits nested frames',
  i: 'Drag to advance time. Earth, Moon and an inner planet, each on its own composed motor.',
  draw(g, io, st) {
    const c = g.col, S = [148, 106], th = io.u;
    g.circle(S, 13, { c: c.accent, w: 2 });
    for (let i = 0; i < 8; i++) g.line(pol(S, 15, (i * TAU) / 8), pol(S, 19, (i * TAU) / 8), { c: c.accent, w: 1 });
    const orbits = [[38, 2.6, 5], [76, 1, 8]];
    orbits.forEach(([r, w, sz], i) => {
      g.circle(S, r, { c: c.faint, w: 0.7, dash: [3, 4] });
      const M = Rot(S[0], S[1], th * w);
      const Pp = Ap(M, [S[0] + r, S[1]]);
      g.line(S, Pp, { c: c.faint, w: 0.7 });
      g.circle(Pp, sz, { c: c.ink, w: 1.5 });
      if (i === 1) {
        const Mm = Mul(M, Rot(Pp[0], Pp[1], th * 13));
        const Mo = Ap(Mm, [Pp[0] + 20, Pp[1]]);
        g.circle(Pp, 20, { c: c.faint, w: 0.6, dash: [2, 3] });
        g.circle(Mo, 3.2, { c: c.ink, w: 1.2 });
        if (io.traces !== false) g.trace(st, 'tr', Mo, 420, { a: 0.4 });
        g.line(Pp, Mo, { c: c.faint, w: 0.6 });
      }
    });
    g.dot(S, 2, { c: c.accent });
    g.txt([196, 176], 'periods 1 : 2.6 : 13');
    g.txt([196, 190], 'gear train would be');
    g.txt([196, 204], '13 : 5 and 8 : 3');
    g.txt([14, 218], 'the Moon’s path about the Sun is convex everywhere — the trace shows why');
  } },

{ id: 'MM-02', n: 'Trammel of Archimedes', f: 'Mathematical machines', d: 'crank', rate: 1,
  pga: 'two prismatic constraints on one rigid bar ⇒ every bar point traces an ellipse',
  i: 'Drag to run the trammel. The pen point draws a true ellipse with axes set by where it sits on the bar.',
  draw(g, io, st) {
    const c = g.col, O = [160, 110], a = 78, b = 50, th = io.u;
    g.gline(Join([20, O[1]], [300, O[1]]), { c: c.faint });
    g.gline(Join([O[0], 20], [O[0], 200]), { c: c.faint });
    g.rail([O[0] - 86, O[1]], [O[0] + 86, O[1]], { w2: 5, c: c.faint });
    g.rail([O[0], O[1] - 66], [O[0], O[1] + 66], { w2: 5, c: c.faint });
    const A = [O[0] + a * cos(th), O[1]], B = [O[0], O[1] + b * sin(th) * -1 + 0];
    const B2 = [O[0], O[1] - b * sin(th)];
    const bar = [A, B2];
    g.box(A, 16, 11, 0, { c: c.ink, w: 1.4 });
    g.box(B2, 11, 16, 0, { c: c.ink, w: 1.4 });
    const u = norm([B2[0] - A[0], B2[1] - A[1]]);
    const far = [A[0] + u[0] * 150, A[1] + u[1] * 150];
    g.line(A, far, { c: c.ink, w: 2.4 });
    const pen = [A[0] + u[0] * 118, A[1] + u[1] * 118];
    const el = []; for (let i = 0; i <= 90; i++) { const t = (i / 90) * TAU; const AA = [O[0] + a * cos(t), O[1]], BB = [O[0], O[1] - b * sin(t)]; const uu = norm([BB[0] - AA[0], BB[1] - AA[1]]); el.push([AA[0] + uu[0] * 118, AA[1] + uu[1] * 118]); }
    g.path(el, { close: true, c: c.faint, w: 0.9 });
    g.dot(pen, 3.6, { c: c.accent });
    g.pin(A, {}); g.pin(B2, {});
    g.txt([14, 202], 'slider offsets a ' + a + ' · b ' + b + '   ·   pen at 118 px along the bar');
    g.txt([14, 216], 'sold as a toy, used as an ellipsograph');
  } },

{ id: 'MM-03', n: 'Mechanical Fourier synthesiser', f: 'Mathematical machines', d: 'crank', rate: 1,
  pga: 'sum of rotors: p = Σ Ap(Rot(O, kθ), rₖ) — harmonics added head to tail',
  i: 'Drag to turn the crank. Three harmonics chained tip to tail; the pen writes their sum on the right.',
  draw(g, io, st) {
    const c = g.col, O = [78, 104], th = io.u;
    const H = [[1, 34], [3, 34 / 3], [5, 34 / 5]];
    let p = O;
    g.circle(O, 34, { c: c.faint, w: 0.7, dash: [3, 3] });
    H.forEach(([k, r], i) => {
      g.circle(p, r, { c: c.faint, w: 0.6, dash: [2, 3] });
      const q = pol(p, r, th * k - PI / 2);
      g.line(p, q, { c: i === 0 ? c.ink : c.ghost, w: i === 0 ? 2 : 1.4 });
      g.dot(q, 2.2, { c: c.ghost });
      p = q;
    });
    g.dot(p, 3.6, { c: c.accent });
    const wave = [];
    for (let i = 0; i <= 120; i++) {
      const t = th - (i / 120) * TAU * 1.6;
      let y = 0; H.forEach(([k, r]) => { y += r * sin(t * k - PI / 2); });
      wave.push([150 + i * 1.28, 104 + y]);
    }
    g.path(wave, { c: c.accent, w: 1.4 });
    g.line([p[0], p[1]], [150, wave[0][1]], { c: c.faint, w: 0.7, dash: [3, 3] });
    g.gline(Join([150, 104], [302, 104]), { c: c.faint });
    g.line([150, 40], [150, 168], { c: c.faint, w: 0.8 });
    g.fix(O, -PI / 2, { s: 0.1 });
    g.txt([14, 196], 'harmonics 1 · 3 · 5 with amplitudes 1 · ⅓ · ⅕');
    g.txt([14, 210], 'three terms already look square — Michelson used eighty');
    g.txt([14, 224], 'add a term: one more rotor on the chain, nothing else changes');
  } },

// ── Flight & gyro ────────────────────────────────────────────────────────
{ id: 'FL-01', n: 'Helicopter swashplate', f: 'Flight & gyro', d: 'point',
  pga: 'pitch(ψ) = collective + cyclic·cos(ψ − ψ₀): plate tilt read through a rotating frame',
  i: 'Move the pointer: up and down is collective, left and right is cyclic. Blade pitch follows azimuth.',
  draw(g, io, st) {
    const c = g.col, O = [160, 92], R = 96, ps = io.t * 3;
    const coll = clamp((150 - io.my) / 90, -0.5, 0.6), cyc = clamp((io.mx - 160) / 130, -0.6, 0.6);
    g.line([O[0], 200], [O[0], 40], { c: c.ink, w: 3 });
    g.hatch([[O[0] - 24, 200], [O[0] + 24, 200], [O[0] + 24, 212], [O[0] - 24, 212]], { s: 5 });
    const py = 150 - coll * 34;
    const tl = cyc * 0.32;
    const pl = (s) => [O[0] + s * 58 * cos(tl), py + s * 58 * sin(tl)];
    g.line(pl(-1), pl(1), { c: c.ghost, w: 3 });
    g.line([pl(-1)[0], pl(-1)[1] - 8], [pl(1)[0], pl(1)[1] - 8], { c: c.accent, w: 2.4 });
    for (const s of [-1, 1]) {
      const az = ps + (s > 0 ? 0 : PI);
      const arm = cos(az);
      const pitch = coll * 0.5 + cyc * 0.5 * arm;
      const hub = [O[0], 56];
      const tip = [O[0] + s * R * Math.abs(cos(az) * 0.35 + 0.65), 56];
      g.line([pl(s > 0 ? 1 : -1)[0], pl(s > 0 ? 1 : -1)[1] - 8], [O[0] + s * 26, 62], { c: c.faint, w: 1.2 });
      g.box(mix(hub, tip, 0.55), Math.abs(tip[0] - hub[0]) * 0.9, 8, pitch, { c: c.ink, w: 1.6 });
      g.txt([tip[0] - 14 * s, 44], (pitch * 57.3).toFixed(0) + '°', { c: c.ghost });
    }
    g.circle([O[0], 56], 10, { c: c.ink, w: 1.5 });
    g.circle([io.mx, io.my], 5, { c: c.ghost, w: 1 });
    g.txt([14, 186], 'collective ' + (coll * 30).toFixed(1) + '°   ·   cyclic ' + (cyc * 30).toFixed(1) + '°   ·   azimuth ' + ((ps % TAU) * 57.3).toFixed(0) + '°');
    g.txt([14, 200], 'a non-rotating tilt becomes a once-per-rev pitch schedule');
    g.txt([14, 214], 'the whole helicopter is steered by this one geometric trick');
  } },

{ id: 'FL-02', n: 'Contra-rotating propellers', f: 'Flight & gyro', d: 'crank', rate: 2,
  pga: 'two rotors of opposite sign on one axis; torque reaction and swirl cancel between them',
  i: 'Drag to spin up. Front and rear discs counter-rotate — no net torque on the airframe.',
  draw(g, io, st) {
    const c = g.col, y = 106, th = io.u;
    g.line([40, y], [280, y], { c: c.ink, w: 3 });
    g.hatch([[40, y - 8], [70, y - 8], [70, y + 8], [40, y + 8]], { s: 5 });
    [[120, 1], [200, -1]].forEach(([x, s], i) => {
      g.circle([x, y], 6, { c: c.ink, w: 1.4 });
      for (let b = 0; b < 4; b++) {
        const a = th * s + (b * TAU) / 4;
        const len = 74, ext = Math.abs(cos(a));
        const tipy = y + Math.sign(sin(a)) * len * Math.abs(sin(a));
        const pitch = s * 0.5 * Math.sign(sin(a) || 1);
        g.box([x, (y + tipy) / 2], 9 + 5 * ext, Math.abs(tipy - y) * 0.94, pitch, { c: Math.sin(a) > 0 ? c.ink : c.ghost, w: 1.4 });
      }
      g.circle([x, y], 74, { c: c.faint, w: 0.6, dash: [2, 4] });
      g.spin([x, y - 92], 14, s > 0);
    });
    g.txt([14, 200], 'ω ' + (th % TAU).toFixed(1) + ' rad, opposite signs   ·   4 + 4 blades');
    g.txt([14, 214], 'swirl recovery adds a few percent efficiency; the noise is the price');
  } },

{ id: 'FL-03', n: 'Three-axis gimbal', f: 'Flight & gyro', d: 'point',
  pga: 'nested rotors cancelling: M_payload = M_outer ∘ M_mid ∘ M_inner ≈ identity by construction',
  i: 'Move the pointer to tilt the mount. Each ring takes out one axis, so the payload stays level.',
  draw(g, io, st) {
    const c = g.col, O = [160, 104];
    const tilt = clamp((io.mx - 160) / 200, -0.6, 0.6), roll = clamp((io.my - 104) / 220, -0.5, 0.5);
    const Mo = Rot(O[0], O[1], tilt), Mm = Mul(Mo, Rot(O[0], O[1], -tilt + roll));
    const ell = (M, rx, ry, o) => {
      const pts = []; for (let i = 0; i <= 60; i++) { const a = (i / 60) * TAU; pts.push(Ap(M, [O[0] + rx * cos(a), O[1] + ry * sin(a)])); }
      g.path(pts, { close: true, ...o });
    };
    g.box(O, 220, 8, tilt, { c: c.ink, w: 1.6 });
    ell(Mo, 82, 74, { c: c.ink, w: 1.8 });
    ell(Mm, 62, 54, { c: c.ghost, w: 1.6 });
    ell(Rot(O[0], O[1], 0), 42, 34, { c: c.ink, w: 1.5 });
    for (const [M, r] of [[Mo, 82], [Mm, 62]]) {
      g.dot(Ap(M, [O[0] + r, O[1]]), 2.6, { c: c.accent });
      g.dot(Ap(M, [O[0] - r, O[1]]), 2.6, { c: c.accent });
    }
    g.box(O, 44, 26, 0, { c: c.ink, w: 2 });
    g.path([[O[0] + 22, O[1] - 8], [O[0] + 36, O[1] - 14], [O[0] + 36, O[1] + 14], [O[0] + 22, O[1] + 8]], { close: true, c: c.accent, w: 1.6 });
    g.ghost([O[0] - 60, O[1]], [O[0] + 60, O[1]]);
    g.circle([io.mx, io.my], 5, { c: c.ghost, w: 1 });
    g.txt([14, 196], 'mount ' + (tilt * 57.3).toFixed(0) + '°   ·   ring 2 ' + ((roll - tilt) * 57.3).toFixed(0) + '°   ·   payload 0°');
    g.txt([14, 210], 'gimbal lock is when two axes line up and a DOF is lost');
    g.txt([14, 224], 'motors compose; the correction is exact, not a control loop');
  } },
];
