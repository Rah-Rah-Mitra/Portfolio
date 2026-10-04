import {
  BOARD,
  BOARD_HALF,
  F_STOPS,
  NAMED_CORNERS,
  SENSOR,
  boardCorners,
  boardDarkSquares,
  clampScene,
  distort,
  fmt,
  foldQ,
  frameCornerQ,
  mv3,
  project,
  sharpCountAt,
  undistorted,
  type CameraMode,
  type CameraScene,
  type Intrinsics,
  type Pose,
  type SceneSummary,
  type Vec2,
  type Vec3,
} from './cameraModel';

// Figure geometry and prose for the Camera Lab, as plain strings and numbers.
// No JSX: the component only places what this module computes, so the SSR
// output, the aria-labels and the tests all read one set of numbers. Every path
// coordinate is rounded to 1 dp, which also keeps server and browser markup
// identical when their trig differs in the last ulp.

export const PLAN = { w: 300, h: 300, scale: 110, ox: 150, oy: 96 } as const;
export const IMAGE_VIEW = { x: -10, y: -10, w: 380, h: 260, frameW: 360, frameH: 240, scale: 0.25 } as const;
export const CHART = { w: 720, h: 112, x0: 56, x1: 704, y0: 10, y1: 80 } as const;

const D2R = Math.PI / 180;
const N_CORNERS = BOARD.cols * BOARD.rows;

// ── primitives ───────────────────────────────────────────────────────────

const num = (n: number) => {
  const v = Math.round(n * 10) / 10;
  return String(v === 0 ? 0 : v);
};
// Positions handed to the component (labels, dots, markers) are rounded too:
// 2 dp keeps the known answers testable and the markup stable across engines.
const r2 = (n: number) => {
  const v = Math.round(n * 100) / 100;
  return v === 0 ? 0 : v;
};
const rp = (p: Vec2): Vec2 => [r2(p[0]), r2(p[1])];
const finite = (p: Vec2 | null | undefined): p is Vec2 => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

// A null (or non-finite point) lifts the pen; the next point starts a new M.
export function pathOf(pts: Array<Vec2 | null>, close = false): string {
  let out = '';
  let pen = false;
  for (const p of pts) {
    if (!finite(p)) { pen = false; continue; }
    out += `${pen ? 'L' : 'M'}${num(p[0])} ${num(p[1])}`;
    pen = true;
  }
  return close && out ? `${out}Z` : out;
}

// True top-down view: X right (matching u), +Z up the screen, camera at the bottom.
export const toPlan = (p: Vec3): Vec2 => [PLAN.ox + PLAN.scale * p[0], PLAN.oy - PLAN.scale * p[2]];
export const toImage = (u: number, v: number): Vec2 => [u * IMAGE_VIEW.scale, v * IMAGE_VIEW.scale];

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const col = (M: Pose['Rwc'], j: number): Vec3 => [M[0][j], M[1][j], M[2][j]];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Short arrowhead strokes at `to`, pointing away from `from` (screen space).
const arrow = (from: Vec2, to: Vec2, size = 5): string => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-6)) return '';
  const [ux, uy] = [dx / len, dy / len];
  const wing = (s: number): Vec2 => [to[0] - size * ux + s * size * 0.5 * -uy, to[1] - size * uy + s * size * 0.5 * ux];
  return pathOf([from, to]) + pathOf([wing(1), to, wing(-1)]);
};

// Inverse of toPlan for a drag: ψ from the bearing, ρ from the ground distance
// (the camera height is ρ·sinθ, so the plan sees ρ·cosθ). Clamped and stepped.
export function orbitFromPlanPoint(pt: Vec2, s: CameraScene): Pick<CameraScene, 'distanceM' | 'yawDeg'> {
  const x = (pt[0] - PLAN.ox) / PLAN.scale;
  const z = (PLAN.oy - pt[1]) / PLAN.scale;
  const yawDeg = Math.atan2(-x, -z) / D2R;
  const distanceM = Math.hypot(x, z) / Math.cos(s.pitchDeg * D2R);
  const next = clampScene({ ...s, yawDeg, distanceM });
  return { distanceM: next.distanceM, yawDeg: next.yawDeg };
}

// ── plan ─────────────────────────────────────────────────────────────────

export type PlanOverlay =
  | { mode: 'intrinsics'; hfovLabelAt: Vec2; anchor: 'start' | 'end' }
  | { mode: 'extrinsics'; worldAxes: string; camAxes: string; yawArc: string; yawLabelAt: Vec2; labels: Array<{ at: Vec2; text: string }> }
  | { mode: 'optics'; focus: string; near: string; far: string; band: string; labelAt: Vec2 }
  | { mode: 'stereo'; right: { at: Vec2; headingDeg: number }; rightFrustum: string; baseline: string; baselineLabelAt: Vec2; rays: string };

const FRAME_PX: Vec2[] = [[0, 0], [SENSOR.widthPx, 0], [SENSOR.widthPx, SENSOR.heightPx], [0, SENSOR.heightPx]];

// The pinhole (undistorted) frustum: four frame-corner rays to a fixed depth.
const frustumPath = (pose: Pose, I: Intrinsics, depth: number): string => {
  const apex = toPlan(pose.C);
  const far = FRAME_PX.map(([u, v]) => toPlan(add(pose.C, mv3(pose.Rwc, [(u - I.cx) / I.fx, (v - I.cy) / I.fy, 1]), depth)));
  return far.map((p) => pathOf([apex, p])).join('') + pathOf(far, true);
};

// The plane Z_c = D, sliced through the camera's mid-plane: the frame's width at D.
const depthSlice = (pose: Pose, I: Intrinsics, depth: number): [Vec2, Vec2] => {
  const xc = col(pose.Rwc, 0);
  const zc = col(pose.Rwc, 2);
  const at = (a: number) => toPlan(add(add(pose.C, zc, depth), xc, a));
  return [at((-depth * I.cx) / I.fx), at((depth * (SENSOR.widthPx - I.cx)) / I.fx)];
};

const headingOf = (pose: Pose) => {
  const f = col(pose.Rwc, 2);
  return Math.atan2(f[0], f[2]) / D2R;
};

// Infinite far limits are drawn to a depth well past the sheet; the viewBox clips.
const OFF_SHEET_M = 6;

export function planFigure(sum: SceneSummary, mode: CameraMode): {
  grid: string;
  axes: string;
  board: [Vec2, Vec2];
  boardTicks: string;
  camera: { at: Vec2; headingDeg: number };
  frustum: string;
  axis: string;
  overlay: PlanOverlay;
} {
  const { pose, intrinsics: I, scene: s } = sum;
  const step = 0.25 * PLAN.scale;
  const grid: string[] = [];
  for (let k = -5; k <= 5; k++) if (k) grid.push(pathOf([[PLAN.ox + k * step, 0], [PLAN.ox + k * step, PLAN.h]]));
  for (let k = -7; k <= 3; k++) if (k) grid.push(pathOf([[0, PLAN.oy - k * step], [PLAN.w, PLAN.oy - k * step]]));
  const apex = toPlan(pose.C);
  const fwd = col(pose.Rwc, 2);
  const reach = s.distanceM + 0.25;
  const headingDeg = headingOf(pose);
  const ticks = boardCorners()
    .slice(0, BOARD.cols)
    .map((X) => {
      const [x, y] = toPlan(X);
      return pathOf([[x, y - 4], [x, y + 4]]);
    })
    .join('');

  let overlay: PlanOverlay;
  if (mode === 'intrinsics') {
    const right = apex[0] <= PLAN.ox;
    overlay = { mode, hfovLabelAt: rp([apex[0] + (right ? 12 : -12), Math.min(apex[1] + 16, PLAN.h - 8)]), anchor: right ? 'start' : 'end' };
  } else if (mode === 'extrinsics') {
    const origin = toPlan([0, 0, 0]);
    const xc = col(pose.Rwc, 0);
    const xEnd = toPlan([0.15, 0, 0]);
    const zEnd = toPlan([0, 0, 0.15]);
    const cxEnd = toPlan(add(pose.C, xc, 0.12));
    const czEnd = toPlan(add(pose.C, fwd, 0.12));
    // ψ is measured from world +Z (straight up the sheet) to the heading.
    const r = 22;
    const h = headingDeg * D2R;
    const start: Vec2 = [apex[0], apex[1] - r];
    const end: Vec2 = [apex[0] + r * Math.sin(h), apex[1] - r * Math.cos(h)];
    const yawArc = `${pathOf([apex, [apex[0], apex[1] - r - 6]])}M${num(start[0])} ${num(start[1])}A${r} ${r} 0 0 ${h >= 0 ? 1 : 0} ${num(end[0])} ${num(end[1])}`;
    const mid = h / 2;
    const away = (p: Vec2, q: Vec2, k: number): Vec2 => {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      return rp([q[0] + ((q[0] - p[0]) / d) * k, q[1] + ((q[1] - p[1]) / d) * k]);
    };
    overlay = {
      mode,
      worldAxes: arrow(origin, xEnd) + arrow(origin, zEnd),
      camAxes: arrow(apex, cxEnd, 4) + arrow(apex, czEnd, 4),
      yawArc,
      yawLabelAt: rp([apex[0] + (r + 8) * Math.sin(mid) + (h >= 0 ? 2 : -2), apex[1] - (r + 8) * Math.cos(mid)]),
      labels: [
        { at: away(origin, xEnd, 7), text: 'X' },
        { at: away(origin, zEnd, 7), text: 'Z' },
        { at: away(apex, cxEnd, 7), text: 'xc' },
        { at: away(apex, czEnd, 7), text: 'zc' },
      ],
    };
  } else if (mode === 'optics') {
    const lens = sum.lens;
    const nearM = lens.nearMm / 1000;
    const farM = Number.isFinite(lens.farMm) ? lens.farMm / 1000 : OFF_SHEET_M;
    const focus = depthSlice(pose, I, s.focusM);
    const near = depthSlice(pose, I, nearM);
    const far = depthSlice(pose, I, Math.min(farM, OFF_SHEET_M));
    overlay = {
      mode,
      focus: pathOf(focus),
      near: pathOf(near),
      far: Number.isFinite(lens.farMm) ? pathOf(far) : '',
      band: pathOf([near[0], near[1], far[1], far[0]], true),
      labelAt: rp([clamp(focus[1][0] + 5, 8, PLAN.w - 56), clamp(focus[1][1] + 3, 14, PLAN.h - 6)]),
    };
  } else {
    const { right } = sum.stereo;
    const rAt = toPlan(right.C);
    const back: Vec2 = [-Math.sin(headingDeg * D2R), Math.cos(headingDeg * D2R)];
    const midB: Vec2 = [(apex[0] + rAt[0]) / 2, (apex[1] + rAt[1]) / 2];
    const target = toPlan([0, 0, 0]);
    overlay = {
      mode,
      right: { at: rp(rAt), headingDeg: r2(headingDeg) },
      rightFrustum: frustumPath(right, I, reach),
      baseline: pathOf([apex, rAt]),
      baselineLabelAt: rp([midB[0] + back[0] * 18, midB[1] + back[1] * 18]),
      rays: pathOf([apex, target]) + pathOf([rAt, target]),
    };
  }

  return {
    grid: grid.join(''),
    axes: pathOf([[0, PLAN.oy], [PLAN.w, PLAN.oy]]) + pathOf([[PLAN.ox, 0], [PLAN.ox, PLAN.h]]),
    board: [rp(toPlan([-BOARD_HALF[0], 0, 0])), rp(toPlan([BOARD_HALF[0], 0, 0]))],
    boardTicks: ticks,
    camera: { at: rp(apex), headingDeg: r2(headingDeg) },
    frustum: frustumPath(pose, I, reach),
    axis: pathOf([apex, toPlan(add(pose.C, fwd, reach))]),
    overlay,
  };
}

// ── image ────────────────────────────────────────────────────────────────

const imageAt = (X: Vec3, pose: Pick<Pose, 'R' | 't'>, I: Intrinsics): Vec2 | null => {
  const p = project(X, pose, I);
  return p ? toImage(p.u, p.v) : null;
};

// Every edge goes through the full model sample by sample, so distortion bends it.
const sampledLoop = (corners: Vec3[], perEdge: number, pose: Pick<Pose, 'R' | 't'>, I: Intrinsics): string => {
  const pts: Array<Vec2 | null> = [];
  corners.forEach((a, k) => {
    const b = corners[(k + 1) % corners.length];
    for (let i = 0; i < perEdge; i++) pts.push(imageAt(lerp3(a, b, i / perEdge), pose, I));
  });
  return pts.every(finite) ? pathOf(pts, true) : '';
};

const OUTLINE: Vec3[] = [
  [-BOARD_HALF[0], -BOARD_HALF[1], 0],
  [BOARD_HALF[0], -BOARD_HALF[1], 0],
  [BOARD_HALF[0], BOARD_HALF[1], 0],
  [-BOARD_HALF[0], BOARD_HALF[1], 0],
];

// Blur discs are drawn ×10 and capped so a badly defocused corner cannot paint
// over the whole frame; the readouts carry the exact value.
const DISC_MAX = 14;

const radialWord = (sum: SceneSummary) =>
  !sum.monotonic ? 'FOLDED' : sum.cornerShiftPx < -0.05 ? 'BARREL' : sum.cornerShiftPx > 0.05 ? 'PINCUSHION' : 'NO RADIAL';

export function imageFigure(sum: SceneSummary, mode: CameraMode): {
  squares: string[];
  border: string;
  corners: Array<{ at: Vec2; inFrame: boolean; sharp: boolean; discR: number }>;
  probe: Vec2;
  principal: Vec2;
  field?: string[];
  ideal?: string;
  axes?: { x: string; y: string; z: string; labels: Array<{ at: Vec2; text: string }> };
  stereo?: { rightBorder: string; rightCorners: Vec2[]; rows: Array<{ y: number; from: number; to: number; label: string }> };
  tag: string;
} {
  const { pose, scene: s } = sum;
  // Stereo is shown rectified, which means undistorted: v_L = v_R exactly.
  // Extrinsics is drawn through H, which has no distortion term either, so
  // H·[X Y 1] reproduces every pixel the view prints.
  const pinhole = mode === 'stereo' || mode === 'extrinsics';
  const I = pinhole ? undistorted(sum.intrinsics) : sum.intrinsics;
  const P = boardCorners();
  const corners = sum.corners
    .map((c) => {
      const p = pinhole ? project(c.X, pose, I) : { u: c.u, v: c.v };
      return {
        at: p ? rp(toImage(p.u, p.v)) : ([NaN, NaN] as Vec2),
        inFrame: pinhole ? !!p && p.u >= 0 && p.u <= SENSOR.widthPx && p.v >= 0 && p.v <= SENSOR.heightPx : c.inFrame,
        sharp: c.sharp,
        discR: r2(Math.min(DISC_MAX, 1.25 * c.blurPx)),
      };
    })
    .filter((c) => finite(c.at));
  const probe = imageAt(P[NAMED_CORNERS[0].index], pose, I) ?? ([0, 0] as Vec2);
  const base = {
    squares: boardDarkSquares().map((sq) => sampledLoop(sq, 4, pose, I)).filter(Boolean),
    border: sampledLoop(OUTLINE, 20, pose, I),
    corners,
    probe: rp(probe),
    principal: rp(toImage(I.cx, I.cy)),
  };

  if (mode === 'intrinsics') {
    // Ideal frame lines pushed through the distortion; samples past 0.9 of the
    // fold radius are dropped so a folded polynomial cannot draw loops.
    const qFold = 0.9 * foldQ(I);
    const line = (a: Vec2, b: Vec2) => {
      const pts: Array<Vec2 | null> = [];
      for (let k = 0; k < 16; k++) {
        const u = a[0] + ((b[0] - a[0]) * k) / 15;
        const v = a[1] + ((b[1] - a[1]) * k) / 15;
        const xy: Vec2 = [(u - I.cx) / I.fx, (v - I.cy) / I.fy];
        if (xy[0] ** 2 + xy[1] ** 2 >= qFold) { pts.push(null); continue; }
        const [xd, yd] = distort(xy, I);
        pts.push(toImage(I.fx * xd + I.cx, I.fy * yd + I.cy));
      }
      return pathOf(pts);
    };
    const field: string[] = [];
    for (let k = 0; k <= 6; k++) field.push(line([(k * SENSOR.widthPx) / 6, 0], [(k * SENSOR.widthPx) / 6, SENSOR.heightPx]));
    for (let k = 0; k <= 4; k++) field.push(line([0, (k * SENSOR.heightPx) / 4], [SENSOR.widthPx, (k * SENSOR.heightPx) / 4]));
    return {
      ...base,
      field: field.filter(Boolean),
      ideal: pathOf(OUTLINE.map((X) => imageAt(X, pose, undistorted(I))), true),
      tag: `k1 ${fmt(s.k1, 2)} · ${radialWord(sum)}`,
    };
  }

  if (mode === 'extrinsics') {
    const origin = imageAt([0, 0, 0], pose, I);
    const axis = (end: Vec3) => pathOf(Array.from({ length: 9 }, (_, k) => imageAt(lerp3([0, 0, 0], end, k / 8), pose, I)));
    const label = (end: Vec3, text: string) => {
      const tip = imageAt(end, pose, I);
      if (!finite(origin) || !finite(tip)) return null;
      const d = Math.hypot(tip[0] - origin[0], tip[1] - origin[1]) || 1;
      return { at: rp([tip[0] + ((tip[0] - origin[0]) / d) * 7, tip[1] + ((tip[1] - origin[1]) / d) * 7]), text };
    };
    return {
      ...base,
      axes: {
        x: axis([0.1, 0, 0]),
        y: axis([0, 0.1, 0]),
        z: axis([0, 0, 0.1]),
        labels: [label([0.1, 0, 0], 'X'), label([0, 0.1, 0], 'Y'), label([0, 0, 0.1], 'Z')].filter(
          (l): l is { at: Vec2; text: string } => l !== null,
        ),
      },
      tag: 'H: BOARD PLANE → IMAGE',
    };
  }

  if (mode === 'optics') return { ...base, tag: 'BLUR DISCS ×10' };

  const { right } = sum.stereo;
  const rows = NAMED_CORNERS.filter((c) => c.id !== 'TR' && c.id !== 'BL').map((c) => {
    const l = project(P[c.index], pose, I);
    const r = project(P[c.index], right, I);
    if (!l || !r) return null;
    return { y: r2(l.v * IMAGE_VIEW.scale), from: r2(r.u * IMAGE_VIEW.scale), to: r2(l.u * IMAGE_VIEW.scale), label: `d ${fmt(l.u - r.u, 1)}` };
  });
  return {
    ...base,
    stereo: {
      rightBorder: sampledLoop(OUTLINE, 1, right, I),
      rightCorners: P.map((X) => imageAt(X, right, I)).filter(finite).map(rp),
      rows: rows.filter((r): r is { y: number; from: number; to: number; label: string } => r !== null),
    },
    tag: 'RECTIFIED PAIR',
  };
}

// ── chart strip ──────────────────────────────────────────────────────────

type Mark = { at: Vec2; kind: 'dot' | 'tick' | 'marker'; label?: string };
type Tick = { at: number; label: string };

// Smallest 1-2-5 step at or above v.
const nice125 = (v: number) => {
  const e = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * e >= v * (1 - 1e-12)) return m * e;
  return 10 * e;
};

const scaleX = (lo: number, hi: number) => (t: number) => r2(CHART.x0 + ((clamp(t, lo, hi) - lo) / (hi - lo)) * (CHART.x1 - CHART.x0));
const scaleY = (lo: number, hi: number) => (v: number) => r2(CHART.y1 - ((v - lo) / (hi - lo)) * (CHART.y1 - CHART.y0));

// A barrel fold can sit past the pinhole frame corner yet still land inside the
// image (see distortionMonotonic). Its radius in px then, so the radial strip can
// run on past the corner and show the hatch the FOLDED verdict refers to.
const foldPastCornerPx = (sum: SceneSummary): number | null => {
  if (sum.monotonic) return null;
  const qf = foldQ(sum.intrinsics);
  return Number.isFinite(qf) && qf > frameCornerQ(sum.intrinsics) ? Math.sqrt(qf) * sum.intrinsics.fx : null;
};

// Plot a series clipped at yMax: the curve leaves through the top edge at the
// interpolated crossing instead of running flat along it.
const clippedSeries = (pts: Vec2[], yMax: number, X: (t: number) => number, Y: (v: number) => number): string => {
  const out: Array<Vec2 | null> = [];
  pts.forEach(([t, v], k) => {
    const prev = pts[k - 1];
    const inside = v <= yMax;
    if (prev && (prev[1] <= yMax) !== inside) {
      const f = (yMax - prev[1]) / (v - prev[1]);
      out.push([X(prev[0] + (t - prev[0]) * f), Y(yMax)]);
      if (!inside) out.push(null);
    }
    if (inside) out.push([X(t), Y(v)]);
  });
  return pathOf(out);
};

export function chartFigure(sum: SceneSummary, mode: CameraMode): {
  curve?: string;
  band?: [number, number];
  hatch?: Array<[number, number]>;
  marks: Mark[];
  guide?: string;
  xTicks: Tick[];
  yTicks: Tick[];
  label: string;
} {
  const { scene: s, intrinsics: I } = sum;
  const mid = (CHART.y0 + CHART.y1) / 2;

  if (mode === 'intrinsics') {
    const rCorner = Math.sqrt(frameCornerQ(I)) * I.fx;
    const rFold = foldPastCornerPx(sum);
    const rMax = rFold === null ? rCorner : 1.15 * rFold;
    const shift = (r: number) => {
      const q = (r / I.fx) ** 2;
      return r * (s.k1 * q + s.k2 * q * q);
    };
    const g = (r: number) => {
      const q = (r / I.fx) ** 2;
      return 1 + 3 * s.k1 * q + 5 * s.k2 * q * q;
    };
    const samples = Array.from({ length: 121 }, (_, k) => (rMax * k) / 120);
    const yMax = nice125(Math.max(1, ...samples.map((r) => Math.abs(shift(r)))));
    const X = scaleX(0, rMax);
    const Y = scaleY(-yMax, yMax);
    const hatch: Array<[number, number]> = [];
    let runStart: number | null = null;
    samples.forEach((r, k) => {
      const bad = g(r) <= 0;
      if (bad && runStart === null) runStart = r;
      if ((!bad || k === samples.length - 1) && runStart !== null) {
        hatch.push([X(runStart), X(bad ? r : samples[k - 1])]);
        runStart = null;
      }
    });
    const edge = Math.max(I.cx, SENSOR.widthPx - I.cx);
    const xTicks: Tick[] = [];
    for (let r = 0; r <= rMax; r += 200) xTicks.push({ at: X(r), label: String(r) });
    return {
      curve: pathOf(samples.map((r): Vec2 => [X(r), Y(shift(r))])),
      hatch,
      guide: pathOf([[CHART.x0, Y(0)], [CHART.x1, Y(0)]]),
      marks: [
        { at: [X(edge), CHART.y0], kind: 'marker', label: 'EDGE' },
        { at: [X(rCorner), CHART.y0], kind: 'marker', label: 'CORNER' },
      ],
      xTicks,
      yTicks: [
        { at: Y(yMax), label: `+${fmt(yMax, yMax < 1 ? 1 : 0)}` },
        { at: Y(0), label: '0' },
        { at: Y(-yMax), label: fmt(-yMax, yMax < 1 ? 1 : 0) },
      ],
      label: 'RADIAL SHIFT Δr (PX) vs RADIUS r (PX)',
    };
  }

  if (mode === 'extrinsics') {
    const X = scaleX(0.3, 2);
    return {
      band: [X(sum.zMin), X(sum.zMax)],
      marks: [
        ...sum.corners.map((c): Mark => ({ at: [X(c.z), mid], kind: 'tick' })),
        { at: [X(s.distanceM), CHART.y0], kind: 'marker', label: `ρ ${fmt(s.distanceM, 2)} m` },
      ],
      xTicks: [0.5, 1, 1.5, 2].map((z) => ({ at: X(z), label: `${fmt(z, 1)} m` })),
      yTicks: [],
      label: `CORNER DEPTH Z (M) · Z ${fmt(sum.zMin, 3)}–${fmt(sum.zMax, 3)} m`,
    };
  }

  if (mode === 'optics') {
    const lens = sum.lens;
    const X = scaleX(0.3, 3);
    const Y = scaleY(0, 6);
    const zs = Array.from({ length: 271 }, (_, k) => 0.3 + k * 0.01);
    if (!zs.some((z) => Math.abs(z - s.focusM) < 1e-9)) zs.push(s.focusM);
    zs.sort((a, b) => a - b);
    const far = Number.isFinite(lens.farMm) ? lens.farMm / 1000 : 3;
    return {
      curve: clippedSeries(zs.map((z): Vec2 => [z, lens.blurPx(z * 1000)]), 6, X, Y),
      hatch: [[X(lens.nearMm / 1000), X(far)]],
      guide: pathOf([[CHART.x0, Y(1)], [CHART.x1, Y(1)]]),
      marks: [
        ...sum.corners.filter((c) => c.blurPx <= 6).map((c): Mark => ({ at: [X(c.z), Y(c.blurPx)], kind: 'dot' })),
        { at: [X(s.focusM), CHART.y0], kind: 'marker', label: `s ${fmt(s.focusM, 2)} m` },
      ],
      xTicks: [0.5, 1, 1.5, 2, 2.5, 3].map((z) => ({ at: X(z), label: `${fmt(z, 1)} m` })),
      yTicks: [0, 1, 2, 4, 6].map((v) => ({ at: Y(v), label: v === 1 ? '1 px' : String(v) })),
      label: 'BLUR c(Z) (PX) vs DEPTH Z (M)',
    };
  }

  const { stereo } = sum;
  const X = scaleX(0.3, 7);
  const yMax = nice125(stereo.depthSigmaM(7) * 1000);
  const Y = scaleY(0, yMax);
  const zs = Array.from({ length: 135 }, (_, k) => 0.3 + k * 0.05);
  const z1 = stereo.range1PctM;
  const guideEnd = Math.min(7, yMax / 10);
  return {
    curve: clippedSeries(zs.map((z): Vec2 => [z, stereo.depthSigmaM(z) * 1000]), yMax, X, Y),
    band: [X(sum.zMin), X(sum.zMax)],
    guide: pathOf([[X(0.3), Y(3)], [X(guideEnd), Y(guideEnd * 10)]]),
    marks: [
      { at: [X(s.distanceM), Y(stereo.depthSigmaM(s.distanceM) * 1000)], kind: 'dot' },
      ...(z1 <= 7 ? [{ at: [X(z1), CHART.y0] as Vec2, kind: 'marker' as const, label: `1 % at ${fmt(z1, 2)} m` }] : []),
    ],
    xTicks: [1, 2, 3, 4, 5, 6, 7].map((z) => ({ at: X(z), label: `${z} m` })),
    yTicks: [0, yMax / 2, yMax].map((v) => ({ at: Y(v), label: v === yMax ? `${fmt(v, v < 1 ? 1 : 0)} mm` : fmt(v, v < 1 ? 1 : 0) })),
    label: `DEPTH σ δZ (MM) vs Z (M) · 1 % at ${fmt(z1, 2)} m`,
  };
}

// ── prose ────────────────────────────────────────────────────────────────

const deg = (n: number) => `${fmt(n, 0)}°`;
const m3 = (n: number) => fmt(n, 3);
const vec = (v: Vec3 | Vec2, digits: number) => `(${v.map((x) => fmt(x, digits)).join(', ')})`;
const boardPoint = (X: Vec3) => `(${fmt(X[0], 3)}, ${fmt(X[1], 3)}, 0)`;

const firstAllSharpStop = (s: CameraScene) => F_STOPS.find((n) => sharpCountAt(s, n) === N_CORNERS);

const turned = (s: CameraScene) => {
  const parts: string[] = [];
  if (s.yawDeg) parts.push(`${deg(Math.abs(s.yawDeg))} ${s.yawDeg > 0 ? 'right' : 'left'}`);
  if (s.pitchDeg) parts.push(`${deg(Math.abs(s.pitchDeg))} ${s.pitchDeg > 0 ? 'down' : 'up'}`);
  const base = parts.length ? `turned ${parts.join(' and ')}` : 'square-on to it';
  return s.rollDeg ? `${base}, rolled ${deg(s.rollDeg)}` : base;
};

export function answerFor(sum: SceneSummary, mode: CameraMode): string {
  const { scene: s, intrinsics: I } = sum;

  if (mode === 'intrinsics') {
    const first = `At f = ${s.focalMm} mm, K scales every ray by fx = ${fmt(I.fx, 0)} px about the principal point (${fmt(I.cx, 0)}, ${fmt(I.cy, 0)}), so, before distortion, the ${SENSOR.widthPx} px frame spans ${fmt(sum.fov.h, 1)}°.`;
    const shift = sum.cornerShiftPx;
    let second: string;
    if (!sum.monotonic) second = 'The distortion polynomial folds back inside the frame (dr_d/dr ≤ 0): not a physical lens.';
    else if (Math.abs(shift) <= 0.05) second = 'Radial distortion moves the frame corners less than 0.1 px.';
    else {
      const terms = [s.k1 ? `k1 = ${fmt(s.k1, 2)}` : '', s.k2 ? `k2 = ${fmt(s.k2, 2)}` : ''].filter(Boolean).join(', ');
      second = shift < 0
        ? `Radial ${terms} pulls the frame corners ${fmt(-shift, 1)} px inward: barrel distortion.`
        : `Radial ${terms} pushes the frame corners ${fmt(shift, 1)} px outward: pincushion distortion.`;
    }
    const tangential = s.p1 || s.p2 ? ' Tangential p1, p2 shift the image asymmetrically, as a decentred lens does.' : '';
    return `${first} ${second}${tangential}`;
  }

  if (mode === 'extrinsics') {
    const { probe: p, inFrame } = sum.pinhole;
    const out = `The camera sits ${fmt(s.distanceM, 2)} m from the board centre, ${turned(s)}. Corner TL, at ${boardPoint(p.world)} m on the board, is at ${vec(p.camera, 3)} m in the camera frame, and H maps it to ${vec(p.pixel, 1)} px, before lens distortion.`;
    return inFrame < N_CORNERS ? `${out} ${inFrame} of ${N_CORNERS} corners are in frame.` : out;
  }

  if (mode === 'optics') {
    const lens = sum.lens;
    const range = Number.isFinite(lens.farMm)
      ? `from ${m3(lens.nearMm / 1000)} to ${m3(lens.farMm / 1000)} m`
      : `from ${m3(lens.nearMm / 1000)} m to infinity`;
    let tail: string;
    if (sum.sharp === N_CORNERS) tail = `so all ${N_CORNERS} corners are sharp.`;
    else {
      const board = s.yawDeg || s.pitchDeg ? 'the tilted board' : 'the board';
      const stop = firstAllSharpStop(s);
      const hint = stop ? `at f/${stop} all ${N_CORNERS} would be.` : `even at f/16 only ${sharpCountAt(s, 16)} would be.`;
      tail = `so ${sum.sharp} of ${N_CORNERS} corners on ${board} are sharp; ${hint}`;
    }
    return `Focused at ${fmt(s.focusM, 2)} m at f/${s.fNumber}, everything ${range} blurs less than one pixel, ${tail}`;
  }

  const { stereo } = sum;
  return `A second camera ${fmt(s.baselineM * 1000, 0)} mm to the right sees the target shifted ${fmt(stereo.disparityPx(s.distanceM), 1)} px. Depth is fx·B/d = ${m3(s.distanceM)} m; matching to ±${fmt(s.disparitySigmaPx, 2)} px pins it to ±${fmt(stereo.depthSigmaM(s.distanceM) * 1000, 1)} mm, and the error grows with Z²: 1 % at ${fmt(stereo.range1PctM, 2)} m.`;
}

export function metricsFor(sum: SceneSummary, mode: CameraMode): Array<[label: string, value: string]> {
  const { scene: s, intrinsics: I } = sum;
  if (mode === 'intrinsics') {
    return [
      ['FX = FY (PX)', fmt(I.fx, 1)],
      ['PINHOLE FOV H × V', `${fmt(sum.fov.h, 1)}° × ${fmt(sum.fov.v, 1)}°`],
      ['PRINCIPAL POINT', `${fmt(I.cx, 0)}, ${fmt(I.cy, 0)}`],
      ['SHIFT AT FRAME CORNER', `${fmt(sum.cornerShiftPx, 1)} px`],
    ];
  }
  if (mode === 'extrinsics') {
    return [
      ['CAMERA CENTRE C (M)', sum.pose.C.map((v) => fmt(v, 3)).join(', ')],
      ['ROTATION VECTOR ω', sum.rvec.map((v) => fmt(v, 3)).join(', ')],
      ['|ω|', `${fmt(sum.rvecDeg, 2)}°`],
      ['CORNERS IN FRAME', `${sum.pinhole.inFrame} / ${N_CORNERS}`],
    ];
  }
  if (mode === 'optics') {
    const lens = sum.lens;
    return [
      ['APERTURE A', `${fmt(lens.apertureMm, 1)} mm`],
      ['HYPERFOCAL', `${fmt(lens.hyperfocalMm / 1000, 2)} m`],
      ['DEPTH OF FIELD', `${m3(lens.nearMm / 1000)}–${m3(lens.farMm / 1000)} m`],
      ['SHARP CORNERS', `${sum.sharp} / ${N_CORNERS}`],
    ];
  }
  const { stereo } = sum;
  const ds = sum.corners.map((c) => c.disparityPx);
  return [
    ['DISPARITY AT TARGET', `${fmt(stereo.disparityPx(s.distanceM), 1)} px`],
    ['DEPTH σ AT TARGET', `${fmt(stereo.depthSigmaM(s.distanceM) * 1000, 2)} mm`],
    ['BOARD DISPARITY', `${fmt(Math.min(...ds), 1)}–${fmt(Math.max(...ds), 1)} px`],
    ['1 % ERROR UP TO', `${fmt(stereo.range1PctM, 2)} m`],
  ];
}

// The aria-labels: the same numbers the readouts print, in a sentence each.
export function figureLabels(sum: SceneSummary, mode: CameraMode): { plan: string; image: string; chart: string } {
  const { scene: s, intrinsics: I, lens, stereo } = sum;
  const where = `the camera ${fmt(s.distanceM, 2)} m from the board centre, ${turned(s)}`;
  const inFrame = `${sum.inFrame} of ${N_CORNERS} corners in frame`;
  if (mode === 'intrinsics') {
    const rFold = foldPastCornerPx(sum);
    const runOn = rFold === null ? '' : ` It runs on past the corner to the fold at ${fmt(rFold, 1)} px, hatched, where dr_d/dr turns negative.`;
    return {
      plan: `Plan, top view: ${where}; its pinhole frustum spans ${fmt(sum.fov.h, 1)}° horizontally.`,
      image: `Rendered image, ${SENSOR.widthPx} × ${SENSOR.heightPx} px: the checkerboard with ${radialWord(sum).toLowerCase()} distortion (k1 ${fmt(s.k1, 2)}, k2 ${fmt(s.k2, 2)}), frame corners shifted ${fmt(sum.cornerShiftPx, 1)} px, principal point at (${fmt(I.cx, 0)}, ${fmt(I.cy, 0)}); ${inFrame}.`,
      chart: `Radial shift against radius, from the centre to the frame corner at ${fmt(Math.sqrt(frameCornerQ(I)) * I.fx, 1)} px, where it reaches ${fmt(sum.cornerShiftPx, 1)} px.${runOn}`,
    };
  }
  if (mode === 'extrinsics') {
    return {
      plan: `Plan, top view: ${where}; camera centre at x ${fmt(sum.pose.C[0], 3)} m, z ${fmt(sum.pose.C[2], 3)} m, yaw ψ ${deg(s.yawDeg)} from the board normal.`,
      image: `Rendered image: the board through H (pinhole, no lens distortion), with the world X, Y and Z axes drawn at its centre; corner TL lands at ${vec(sum.pinhole.probe.pixel, 1)} px; ${sum.pinhole.inFrame} of ${N_CORNERS} corners in frame.`,
      chart: `Depths of the ${N_CORNERS} corners in the camera frame, from ${m3(sum.zMin)} to ${m3(sum.zMax)} m, around the ${fmt(s.distanceM, 2)} m target distance.`,
    };
  }
  if (mode === 'optics') {
    const far = Number.isFinite(lens.farMm) ? `${m3(lens.farMm / 1000)} m` : 'infinity';
    return {
      plan: `Plan, top view: ${where}; focus plane at ${fmt(s.focusM, 2)} m, and the hatched band from ${m3(lens.nearMm / 1000)} m to ${far} is the depth of field at f/${s.fNumber}.`,
      image: `Rendered image with blur discs drawn ten times their size: ${sum.sharp} of ${N_CORNERS} corners are sharp (blur at most 1 px); corner TL blurs ${fmt(sum.corners[0].blurPx, 2)} px.`,
      chart: `Blur against depth at f/${s.fNumber} focused at ${fmt(s.focusM, 2)} m; it stays under 1 px from ${m3(lens.nearMm / 1000)} m to ${far}.`,
    };
  }
  return {
    plan: `Plan, top view: two parallel cameras ${fmt(s.baselineM * 1000, 0)} mm apart (a rectified pair); the left one is aimed at the target ${m3(s.distanceM)} m away, and both have sight lines drawn to it.`,
    image: `Rectified pair: the right camera's board is shifted left along the same rows; disparity at the target is ${fmt(stereo.disparityPx(s.distanceM), 1)} px.`,
    chart: `Depth uncertainty against depth for ±${fmt(s.disparitySigmaPx, 2)} px matching: ±${fmt(stereo.depthSigmaM(s.distanceM) * 1000, 1)} mm at the target, growing with Z² to 1 % at ${fmt(stereo.range1PctM, 2)} m.`,
  };
}
