// pgaMechanisms.ts — six working mechanisms from the 2026-09 PGA library drop.
//
// Nothing here is keyframed: every part is placed by a motor (the sandwich
// M p M~) and its dependents are solved from constraints each frame — circle ∩
// circle for a dyad, a slot/lock predicate for the Geneva, a normalised motor
// blend for the pose geodesic.
//
// Six, not the 83 in design/mockups/pga-assets-*.js. The rest are a mechanism
// catalogue; these six are the ones that say something about the work on this
// site, which is why each carries a `why`. Draw bodies are ported verbatim from
// the approved mockups — only types and the two TS-hostile destructuring loops
// (RM-04, CS-01) were touched.
import { TAU, Ap, CC, Join, Mot, Slerp, ang, clamp, dist, mix, norm, pol, type Pt } from './pga';
import type { Kit } from './pgaDraw';

const sin = Math.sin, PI = Math.PI;

// A target beyond reach is pulled onto the workspace boundary, so a driven
// linkage points at what it cannot touch instead of going imaginary.
const reach = (S: Pt, T: Pt, R: number): Pt =>
  (dist(S, T) > R ? [S[0] + ((T[0] - S[0]) * R) / dist(S, T), S[1] + ((T[1] - S[1]) * R) / dist(S, T)] : T);

/** Per-frame input. `u` is the drive scalar; `traces` follows prefers-reduced-motion. */
export interface Io {
  u: number;
  t: number;
  dt: number;
  mx: number;
  my: number;
  hover: boolean;
  down: boolean;
  traces: boolean;
}

/** Per-mechanism scratch state. Deliberately untyped: each mechanism owns its own keys. */
export type St = Record<string, any>;

export interface Mechanism {
  id: string;
  /** Display name. */
  n: string;
  /** Family, as printed in the source library. */
  f: string;
  /** Drive: 'crank' auto-advances and scrubs on drag; 'point' follows the pointer. */
  d: 'crank' | 'point';
  /** Auto-advance rate for 'crank'. */
  rate?: number;
  /** The algebra, in one line. */
  pga: string;
  /** How to drive it, and what to watch. */
  i: string;
  /** Why this mechanism is on this site. */
  why: string;
  draw(g: Kit, io: Io, st: St): void;
}

export const MECHANISMS: readonly Mechanism[] = [
  {
    id: 'RB-01', n: 'Two-link inverse kinematics', f: 'Robotics', d: 'point',
    pga: 'elbow = circle(shoulder, L₁) ∧ circle(target, L₂) — IK is one meet, both branches valid',
    i: 'Move the pointer to set the target; hold the button to flip the elbow branch. Out of reach, the arm points at it.',
    why: 'The planar case of the pose problem behind the robotics-vision work — solved by intersecting two circles, with no solver loop and no Jacobian.',
    draw(g, io, _st) {
      const c = g.col, S: Pt = [64, 168], L1 = 92, L2 = 78;
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
    },
  },
  {
    id: 'MT-01', n: 'Geneva indexing drive', f: 'Motion transformers', d: 'crank', rate: 1.1,
    pga: 'pin ∈ slot while |pin−C₂| ≤ a; outside, the lock arc holds ph₂ at the nearest detent',
    i: 'Drag to turn the driver. Continuous in, quarter-turn steps out — dwell is geometric, not timed.',
    why: 'The rotary-index primitive under any put-away or pick line: the dwell that lets a station act is a property of the geometry, not a timer someone tuned.',
    draw(g, io, st) {
      const c = g.col, C1: Pt = [92, 116], a = 46, C2: Pt = [C1[0] + a * Math.SQRT2, 116], rF = 52;
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
    },
  },
  {
    id: 'CS-04', n: 'Forklift mast (2:1 free lift)', f: 'Construction', d: 'crank', rate: 0.6,
    pga: 'chain over the inner-mast sheave doubles the ram: carriage = Tr(0, −2s) for ram travel s',
    i: 'Drag to lift. The carriage always rises twice as far and twice as fast as the inner mast.',
    why: 'Warehouse materials handling in its simplest honest form — one sheave buying a 2:1 ratio, the constraint that decides whether a load clears a container roof.',
    draw(g, io, _st) {
      const c = g.col, x = 176, base = 202, t = 0.5 + 0.5 * sin(io.u);
      const s = t * 52, inner = base - s, carr = base - 2 * s;
      g.path([[x - 30, base], [x - 30, 40], [x - 22, 40], [x - 22, base]], { close: true, c: c.ink, w: 1.5 });
      g.path([[x + 22, base], [x + 22, 40], [x + 30, 40], [x + 30, base]], { close: true, c: c.ink, w: 1.5 });
      g.path([[x - 18, inner], [x - 18, inner - 130], [x - 12, inner - 130], [x - 12, inner]], { close: true, c: c.ghost, w: 1.4 });
      g.path([[x + 12, inner], [x + 12, inner - 130], [x + 18, inner - 130], [x + 18, inner]], { close: true, c: c.ghost, w: 1.4 });
      const sh: Pt = [x, inner - 134];
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
    },
  },
  {
    id: 'CS-01', n: 'Excavator arm', f: 'Construction', d: 'point',
    pga: 'base → boom → stick → bucket: each a rotor, the chain solved to the pointer by IK',
    i: 'Move the pointer to place the bucket teeth; the boom and stick solve, the bucket keeps its curl.',
    why: 'The same dyad as the robot arm, driven by hydraulics instead of servos — the geometry does not care which, and that portability is the point.',
    draw(g, io, _st) {
      const c = g.col, Bs: Pt = [72, 152], boom = 96, stick = 74;
      const T = reach(Bs, [clamp(io.mx, 40, 306), clamp(io.my, 26, 190)], boom + stick - 2);
      const E = CC(Bs, boom, T, stick, 1);
      g.line([20, 190], [300, 190], { c: c.ink, w: 1.4 });
      g.hatch([[20, 190], [300, 190], [300, 206], [20, 206]], { s: 6 });
      g.path([[36, 190], [40, 172], [108, 172], [112, 190]], { close: true, c: c.ink, w: 1.6 });
      for (const x of [50, 74, 98]) g.circle([x, 184], 7, { c: c.ghost, w: 1.1 });
      g.box([Bs[0], Bs[1] + 4], 62, 30, 0, { c: c.ink, w: 1.7 });
      g.bar(Bs, E, { w: 3.4 }); g.bar(E, T, { w: 2.8 });
      const u = norm([T[0] - E[0], T[1] - E[1]]);
      const bk: Pt[] = ([[0, 0], [16, 14], [4, 30], [-14, 20]] as Pt[]).map(([a, b]) => [T[0] + u[0] * a - u[1] * b, T[1] + u[1] * a + u[0] * b] as Pt);
      g.poly(bk, { c: c.ink, w: 2 });
      const cyl: [Pt, Pt, number][] = [[Bs, E, 0.5], [E, T, 0.45]];
      for (const [cy0, cy1, f] of cyl) {
        const a = mix(cy0, cy1, 0.12), b = mix(cy0, cy1, f);
        g.line(a, mix(a, b, 0.6), { c: c.ghost, w: 5 });
        g.line(mix(a, b, 0.5), b, { c: c.accent, w: 2.2 });
      }
      g.fix(Bs, -PI / 2, {});
      g.circle([io.mx, io.my], 5, { c: c.ghost, w: 1 });
      g.txt([14, 220], 'boom ' + (ang(Bs, E) * 57.3).toFixed(0) + '°  ·  stick ' + (ang(E, T) * 57.3).toFixed(0) + '°  ·  reach ' + dist(Bs, T).toFixed(0) + ' of ' + (boom + stick));
    },
  },
  {
    id: 'RM-04', n: 'Motor interpolation', f: 'Rigid motions', d: 'crank', rate: 0.55,
    pga: 'M(t) = normalise((1−t)·M₀ + t·M₁) — the geodesic between two poses, one screw',
    i: 'Drag to scrub t between the two ghost poses. Interpolating the motor rotates and translates together.',
    why: 'What a digital twin needs and matrix blending cannot give: interpolate the motor and the body screws between poses; interpolate the matrices and it shears.',
    draw(g, io, st) {
      const c = g.col;
      const shape: Pt[] = [[0, 0], [46, 0], [46, 13], [15, 13], [15, 44], [0, 44]];
      const M0 = Mot(30, 40, 0.15, 0, 0), M1 = Mot(30, 40, 2.25, 168, 96);
      const t = (sin(io.u) * 0.5 + 0.5);
      for (const M of [M0, M1]) g.poly(shape.map((p) => Ap(M, [p[0] + 30, p[1] + 40])), { c: c.ghost, w: 0.9, a: 0.35 });
      const M = Slerp(M0, M1, t);
      const pts = shape.map((p) => Ap(M, [p[0] + 30, p[1] + 40]));
      g.poly(pts, { c: c.ink, w: 1.5 });
      g.dot(pts[0], 3, { c: c.accent });
      if (io.traces !== false) g.trace(st, 'tr', pts[0], 200);
      for (let k = 0; k <= 8; k++) { const q = Ap(Slerp(M0, M1, k / 8), [30, 40]); g.dot(q, 1.3, { c: c.faint }); }
      g.txt([16, 214], 't = ' + t.toFixed(2) + '   ·   linear blend of matrices would shear; the motor does not');
    },
  },
  {
    id: 'MM-03', n: 'Mechanical Fourier synthesiser', f: 'Mathematical machines', d: 'crank', rate: 1,
    pga: 'sum of rotors: p = Σ Ap(Rot(O, kθ), rₖ) — harmonics added head to tail',
    i: 'Drag to turn the crank. Three harmonics chained tip to tail; the pen writes their sum on the right.',
    why: 'Frequency decomposition as a linkage. The same sum that image and signal pipelines run in software, here made out of three cranks.',
    draw(g, io, _st) {
      const c = g.col, O: Pt = [78, 104], th = io.u;
      const H: [number, number][] = [[1, 34], [3, 34 / 3], [5, 34 / 5]];
      let p: Pt = O;
      g.circle(O, 34, { c: c.faint, w: 0.7, dash: [3, 3] });
      H.forEach(([k, r], i) => {
        g.circle(p, r, { c: c.faint, w: 0.6, dash: [2, 3] });
        const q = pol(p, r, th * k - PI / 2);
        g.line(p, q, { c: i === 0 ? c.ink : c.ghost, w: i === 0 ? 2 : 1.4 });
        g.dot(q, 2.2, { c: c.ghost });
        p = q;
      });
      g.dot(p, 3.6, { c: c.accent });
      const wave: Pt[] = [];
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
    },
  },
];

export const MECHANISM_FRAME = { w: 320, h: 230 } as const;
