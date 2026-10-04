import { describe, expect, it } from 'vitest';
import {
  CAMERA_MODES,
  DEFAULT_SCENE,
  boardCorners,
  boardDarkSquares,
  boardHomography,
  clampScene,
  distort,
  distortionMonotonic,
  fieldOfViewDeg,
  fmt,
  foldQ,
  frameCornerShiftPx,
  intrinsicMatrix,
  intrinsicsOf,
  isCameraMode,
  mul3,
  mv3,
  orbitPose,
  project,
  rodrigues,
  rotationVector,
  sharpCountAt,
  stereoRig,
  summarizeScene,
  thinLens,
  toSnapshot,
  transpose3,
  type CameraScene,
  type Mat3,
  type Vec2,
  type Vec3,
} from '../lib/cameraModel';
import {
  IMAGE_VIEW,
  answerFor,
  chartFigure,
  figureLabels,
  imageFigure,
  metricsFor,
  orbitFromPlanPoint,
  pathOf,
  planFigure,
  toPlan,
} from '../lib/cameraFigure';

// Every known answer below is pinned. A number that moves here moved the
// physics, not the presentation: justify it against an independent check (e.g.
// OpenCV) before re-pinning, never just update the expectation.

const D = DEFAULT_SCENE;
const scene = (patch: Partial<CameraScene>): CameraScene => ({ ...D, ...patch });
const close3 = (a: Vec3, b: Vec3, digits: number) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));
const det3 = (A: Mat3) =>
  A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
const POSES: Array<Pick<CameraScene, 'distanceM' | 'yawDeg' | 'pitchDeg' | 'rollDeg'>> = [
  { distanceM: 0.9, yawDeg: 25, pitchDeg: 15, rollDeg: 0 },
  { distanceM: 0.5, yawDeg: -40, pitchDeg: 30, rollDeg: 30 },
  { distanceM: 1.6, yawDeg: 40, pitchDeg: -30, rollDeg: -30 },
  { distanceM: 1.2, yawDeg: 0, pitchDeg: 0, rollDeg: 0 },
  { distanceM: 0.7, yawDeg: -12, pitchDeg: 7, rollDeg: 19 },
  { distanceM: 1.0, yawDeg: 33, pitchDeg: -21, rollDeg: -4 },
];

describe('camera model — intrinsics', () => {
  it('derives K and the field of view from a 35 mm lens on 25 µm pixels', () => {
    const i = intrinsicsOf(D);
    expect(i.fx).toBe(1400);
    expect(i.fy).toBe(1400);
    expect(i.cx).toBe(720);
    expect(i.cy).toBe(480);
    const fov = fieldOfViewDeg(D);
    expect(fov.h).toBeCloseTo(54.4322, 4);
    expect(fov.v).toBeCloseTo(37.8493, 4);
    expect(intrinsicMatrix(i)).toEqual([[1400, 0, 720], [0, 1400, 480], [0, 0, 1]]);
  });
});

describe('camera model — pose', () => {
  it('orbits the target: C, t = (0, 0, ρ) and R match the prototype', () => {
    const p = orbitPose(D);
    close3(p.C, [-0.367396, -0.232937, -0.787883], 6);
    p.t.forEach((v, k) => expect(Math.abs(v - [0, 0, 0.9][k])).toBeLessThan(1e-12));
    close3(p.R[0], [0.906308, 0, -0.422618], 6);
    close3(p.R[1], [-0.109382, 0.965926, -0.23457], 6);
    close3(p.R[2], [0.408218, 0.258819, 0.875426], 6);
  });

  it('keeps R a proper rotation, and the sign conventions honest', () => {
    for (const o of POSES) {
      const { R, t } = orbitPose(o);
      const RtR = mul3(transpose3(R), R);
      RtR.forEach((r, i) => r.forEach((v, j) => expect(Math.abs(v - (i === j ? 1 : 0))).toBeLessThan(1e-12)));
      expect(Math.abs(det3(R) - 1)).toBeLessThan(1e-12);
      // The target is on the optical axis, so t = (0, 0, ρ) for every pose.
      expect(Math.abs(t[0])).toBeLessThan(1e-12);
      expect(Math.abs(t[1])).toBeLessThan(1e-12);
      expect(Math.abs(t[2] - o.distanceM)).toBeLessThan(1e-12);
    }
    // Yaw +25: the camera is on the left, turned right. Pitch +15: above, looking down.
    expect(orbitPose(D).C[0]).toBeLessThan(0);
    expect(orbitPose(D).C[1]).toBeLessThan(0);
  });

  it('round-trips rotation vectors through Rodrigues', () => {
    const w = rotationVector(orbitPose(D).R);
    close3(w, [0.257623, -0.433821, -0.057114], 6);
    expect((Math.hypot(...w) * 180) / Math.PI).toBeCloseTo(29.0932, 4);
    for (const o of POSES) {
      const { R } = orbitPose(o);
      const back = rodrigues(rotationVector(R));
      back.forEach((r, i) => r.forEach((v, j) => expect(Math.abs(v - R[i][j])).toBeLessThan(1e-12)));
    }
    expect(rodrigues([0, 0, 0]).map((r) => r.map((v) => v + 0))).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  });
});

describe('camera model — projection and distortion', () => {
  it('applies Brown–Conrady exactly as OpenCV writes it (k3 = 0)', () => {
    const [x, y] = [0.3, -0.2];
    const [k1, k2, p1, p2] = [0.1, -0.02, 0.001, -0.002];
    const r2 = x * x + y * y;
    const rad = 1 + k1 * r2 + k2 * r2 * r2;
    const want: Vec2 = [x * rad + 2 * p1 * x * y + p2 * (r2 + 2 * x * x), y * rad + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y];
    const got = distort([x, y], { k1, k2, p1, p2 });
    expect(Math.abs(got[0] - want[0])).toBeLessThan(1e-15);
    expect(Math.abs(got[1] - want[1])).toBeLessThan(1e-15);
  });

  it('projects the board corners to the prototype pixels', () => {
    const pose = orbitPose(D);
    const I = intrinsicsOf(D);
    for (const s of [D, scene({ k1: 0.3, p1: 0.005 })]) {
      const c = project([0, 0, 0], pose, intrinsicsOf(s))!;
      expect(Math.abs(c.u - 720)).toBeLessThan(1e-9);
      expect(Math.abs(c.v - 480)).toBeLessThan(1e-9);
    }
    const P = boardCorners();
    const tl = project(P[0], pose, I)!;
    expect(tl.u).toBeCloseTo(398.9262, 4);
    expect(tl.v).toBeCloseTo(304.8786, 4);
    expect(tl.z).toBeCloseTo(0.786004, 6);
    const tl0 = project(P[0], pose, { ...I, k1: 0 })!;
    expect(tl0.u).toBeCloseTo(397.1439, 4);
    expect(tl0.v).toBeCloseTo(303.9066, 4);
    const br = project(P[53], pose, I)!;
    expect(br.u).toBeCloseTo(969.4334, 4);
    expect(br.v).toBeCloseTo(616.047, 4);
    expect(br.z).toBeCloseTo(1.013996, 6);
    const mid = project(P[22], pose, I)!;
    expect(mid.u).toBeCloseTo(720, 4);
    expect(mid.v).toBeCloseTo(442.1664, 4);
    // Behind the camera: C − forward.
    const fwd = mv3(pose.Rwc, [0, 0, 1]);
    expect(project([pose.C[0] - fwd[0], pose.C[1] - fwd[1], pose.C[2] - fwd[2]], pose, I)).toBeNull();
  });

  it('lays out a 9×6 board, row-major, with 35 dark squares', () => {
    const P = boardCorners();
    expect(P).toHaveLength(54);
    close3(P[0], [-0.2, -0.125, 0], 12);
    close3(P[1], [-0.15, -0.125, 0], 12);
    close3(P[53], [0.2, 0.125, 0], 12);
    expect(boardDarkSquares()).toHaveLength(35);
  });

  it('builds the distortion-free board homography', () => {
    const pose = orbitPose(D);
    const I = intrinsicsOf(D);
    const H = boardHomography(pose, I);
    const want = [[1736.3864, 207.0552, 720], [47.567, 1640.5881, 480], [0.4536, 0.2876, 1]];
    H.forEach((r, i) => r.forEach((v, j) => expect(v).toBeCloseTo(want[i][j], 4)));
    for (const X of boardCorners()) {
      const h = mv3(H, [X[0], X[1], 1]);
      const p = project(X, pose, { ...I, k1: 0 })!;
      expect(Math.abs(h[0] / h[2] - p.u)).toBeLessThan(1e-9);
      expect(Math.abs(h[1] / h[2] - p.v)).toBeLessThan(1e-9);
    }
  });

  it('measures the frame-corner shift and guards against folding', () => {
    expect(frameCornerShiftPx(D)).toBeCloseTo(-26.447, 3);
    expect(distortionMonotonic(D)).toBe(true);
    expect(distortionMonotonic(scene({ focalMm: 20, k1: -0.3, k2: -0.1 }))).toBe(false);
    expect(distortionMonotonic(scene({ focalMm: 20, k1: -0.3, k2: 0.1 }))).toBe(true);
    expect(distortionMonotonic(scene({ focalMm: 20, k1: 0.3, k2: 0.1 }))).toBe(true);
    // Barrel past the pinhole corner: g > 0 all the way to it, but the frame is
    // filled by rays beyond it. At 20 mm, k1 −0.2 the image radius peaks at 688.5 px
    // (fold at q 1.667) with the frame corner 865.3 px out: folded inside the frame.
    expect(distortionMonotonic(scene({ focalMm: 20, k1: -0.2, k2: 0 }))).toBe(false);
    expect(distortionMonotonic(scene({ focalMm: 24, k1: -0.3, k2: 0 }))).toBe(false);
    // …while the same k1 on the 35 mm lens peaks past its corner, and stays physical.
    expect(distortionMonotonic(scene({ k1: -0.3, k2: 0 }))).toBe(true);
    expect(foldQ(D)).toBeCloseTo(4.166667, 6);
    expect(foldQ({ k1: -0.3, k2: -0.1 })).toBeCloseTo(0.776305, 6);
    expect(foldQ({ k1: 0.3, k2: -0.1 })).toBeCloseTo(2.576305, 6);
    expect(foldQ({ k1: -0.3, k2: 0.1 })).toBe(Infinity);
  });
});

describe('camera model — thin lens', () => {
  it('gives the depth of field for f/2.8 focused at 0.9 m', () => {
    const lens = thinLens(D);
    expect(lens.apertureMm).toBe(12.5);
    expect(Math.abs(lens.hyperfocalMm - 17535)).toBeLessThan(1e-9);
    expect(lens.nearMm).toBeCloseTo(857.6096, 4);
    expect(lens.farMm).toBeCloseTo(946.7989, 4);
    expect(lens.dofMm).toBeCloseTo(89.1893, 4);
    expect(lens.imageDistanceMm).toBeCloseTo(36.4162, 4);
    expect(lens.breathing).toBeCloseTo(1.040462, 6);
    expect(lens.blurMm(900)).toBe(0);
    expect(lens.blurPx(786.004)).toBeCloseTo(2.9342, 4);
  });

  it('puts exactly the circle of confusion at both DoF limits', () => {
    for (const [focalMm, fNumber, focusMm] of [[35, 2.8, 900], [85, 1.4, 3000], [20, 16, 400], [50, 8, 2500]]) {
      const lens = thinLens(scene({ focalMm, fNumber, focusM: focusMm / 1000 }));
      expect(Math.abs(lens.blurMm(lens.nearMm) - 0.025)).toBeLessThan(1e-12);
      expect(Math.abs(lens.blurMm(lens.farMm) - 0.025)).toBeLessThan(1e-12);
    }
    expect(thinLens(scene({ focalMm: 20, fNumber: 16, focusM: 3 })).farMm).toBe(Infinity);
  });

  it('agrees with the retired image-side blur formula', () => {
    const [f, N, Z, s] = [50, 4, 2000, 3000];
    const v = (x: number) => (f * x) / (x - f);
    const retired = ((f / N) * Math.abs(v(Z) - v(s))) / v(Z);
    const lens = thinLens(scene({ focalMm: f, fNumber: N, focusM: s / 1000 }));
    expect(retired).toBeCloseTo(0.105932203, 9);
    expect(Math.abs(lens.blurMm(Z) - retired)).toBeLessThan(1e-12);
  });
});

describe('camera model — summary', () => {
  it('summarises the default scene once for every view', () => {
    const sum = summarizeScene(D);
    expect(sum.inFrame).toBe(54);
    expect(sum.sharp).toBe(26);
    expect(sum.zMin).toBeCloseTo(0.786004, 6);
    expect(sum.zMax).toBeCloseTo(1.013996, 6);
    close3(sum.probe.camera, [-0.181262, -0.098864, 0.786004], 6);
    expect(sum.probe.r2).toBeCloseTo(0.069003, 6);
    expect(sum.probe.distorted[0]).toBeCloseTo(-0.229338, 6);
    expect(sum.probe.distorted[1]).toBeCloseTo(-0.125087, 6);
    expect([1.4, 2, 2.8, 4, 5.6, 8, 11, 16].map((N) => sharpCountAt(D, N))).toEqual([14, 19, 26, 37, 48, 53, 54, 54]);
  });
});

describe('camera model — stereo', () => {
  it('turns disparity into depth, and depth error into Z²', () => {
    const rig = stereoRig(D);
    expect(rig.disparityPx(0.9)).toBeCloseTo(186.6667, 4);
    expect(rig.depthSigmaM(0.9) * 1000).toBeCloseTo(1.2054, 4);
    const [lo, hi] = rig.depthIntervalM(0.9);
    expect(lo).toBeCloseTo(0.898796, 6);
    expect(hi).toBeCloseTo(0.901207, 6);
    expect(Math.abs(rig.range1PctM - 6.72)).toBeLessThan(1e-12);
    expect(rig.depthSigmaM(1.8)).toBeCloseTo(4 * rig.depthSigmaM(0.9), 12);
    close3(rig.right.t, [-0.12, 0, 0.9], 9);
    expect(stereoRig(scene({ baselineM: 0.24 })).disparityPx(0.9)).toBeCloseTo(373.3333, 4);
  });

  it('is rectified: every corner shifts by fx·B/Z along its own row', () => {
    const left = orbitPose(D);
    const { right } = stereoRig(D);
    const I0 = { ...intrinsicsOf(D), k1: 0 };
    boardCorners().forEach((X, i) => {
      const l = project(X, left, I0)!;
      const r = project(X, right, I0)!;
      expect(Math.abs(l.u - r.u - (1400 * 0.12) / l.z)).toBeLessThan(1e-9);
      expect(Math.abs(l.v - r.v)).toBeLessThan(1e-9);
      if (i === 0) {
        expect(l.u).toBeCloseTo(397.1439, 4);
        expect(r.u).toBeCloseTo(183.4046, 4);
      }
    });
  });
});

describe('camera model — scene state and output', () => {
  it('clamps, snaps and validates', () => {
    expect(clampScene({ focalMm: NaN }).focalMm).toBe(35);
    expect(clampScene({ focalMm: 500 }).focalMm).toBe(85);
    expect(clampScene({ fNumber: 3.1 }).fNumber).toBe(2.8);
    expect(clampScene({ k1: -0.0800000001 }).k1).toBe(-0.08);
    expect(clampScene({ p1: 0.00123 }).p1).toBe(0.001);
    expect(clampScene(D)).toEqual(D);
    expect(CAMERA_MODES.map((m) => m.id).filter(isCameraMode)).toEqual(['intrinsics', 'extrinsics', 'optics', 'stereo']);
    expect(isCameraMode('bogus')).toBe(false);
    expect(isCameraMode(undefined)).toBe(false);
  });

  it('adapts to the retired CameraLabSnapshot shape', () => {
    const snap = toSnapshot(D, 'stereo');
    expect(snap.mode).toBe('stereo');
    expect(snap.intrinsics.principalX).toBe(720);
    expect(snap.intrinsics.focalLengthMm).toBe(35);
    expect(snap.stereo.disparityPx).toBeCloseTo(186.6667, 4);
    expect(snap.optics.focusDistanceMm).toBeCloseTo(900, 9);
    expect(snap.extrinsics.object).toEqual([0, 0, 0]);
  });

  it('prints a true minus and infinity', () => {
    expect(fmt(-0.08, 2)).toBe('−0.08');
    expect(fmt(Infinity, 1)).toBe('∞');
    expect(fmt(-0.0001, 2)).toBe('0.00');
  });
});

describe('camera figure geometry', () => {
  const sum = summarizeScene(D);
  const FOLDED = scene({ focalMm: 20, k1: -0.3, k2: -0.1 });

  it('maps the plan and its drag inverse', () => {
    expect(toPlan([0, 0, 0])).toEqual([150, 96]);
    const c = toPlan(sum.pose.C);
    expect(c[0]).toBeCloseTo(109.59, 2);
    expect(c[1]).toBeCloseTo(182.67, 2);
    const overlay = planFigure(sum, 'stereo').overlay;
    expect(overlay.mode).toBe('stereo');
    if (overlay.mode === 'stereo') {
      expect(overlay.right.at[0]).toBeCloseTo(121.55, 2);
      expect(overlay.right.at[1]).toBeCloseTo(188.25, 2);
    }
    expect(orbitFromPlanPoint(c, D)).toEqual({ yawDeg: 25, distanceM: 0.9 });
    expect(imageFigure(sum, 'intrinsics').principal).toEqual([180, 120]);
  });

  it('splits paths at gaps and never emits NaN or Infinity', () => {
    expect(pathOf([[0, 0], [1, 1], null, [2, 2], [3, 3]]).match(/M/g)).toHaveLength(2);
    for (const s of [D, FOLDED, scene({ focalMm: 20, k1: -0.2, k2: 0 }), scene({ focalMm: 20, k1: 0.3, k2: 0.1, cxOffsetPx: 40 }), scene({ focalMm: 20, fNumber: 16, focusM: 3 })]) {
      const sm = summarizeScene(s);
      for (const mode of ['intrinsics', 'extrinsics', 'optics', 'stereo'] as const) {
        const text = JSON.stringify([planFigure(sm, mode), imageFigure(sm, mode), chartFigure(sm, mode)]);
        expect(text).not.toMatch(/NaN|Infinity|null,null/);
      }
    }
  });

  it('answers each question with the live numbers', () => {
    const intr = answerFor(sum, 'intrinsics');
    // 54.4° is the pinhole angle; the k1 −0.08 lens actually sees ~55.5° across.
    ['1400', 'before distortion', '54.4°', '26.4 px', 'barrel'].forEach((s) => expect(intr).toContain(s));
    expect(metricsFor(sum, 'intrinsics')[1][0]).toBe('PINHOLE FOV H × V');
    const extr = answerFor(sum, 'extrinsics');
    // H·[X Y 1] for TL — the distortion-free pixel (397.1439, 303.9066), not 398.9.
    ['(397.1, 303.9)', '25° right'].forEach((s) => expect(extr).toContain(s));
    const opt = answerFor(sum, 'optics');
    ['0.858', '0.947', '26 of 54', 'f/11'].forEach((s) => expect(opt).toContain(s));
    const st = answerFor(sum, 'stereo');
    ['186.7 px', '±1.2 mm', '6.72 m'].forEach((s) => expect(st).toContain(s));
    expect(answerFor(summarizeScene(scene({ k1: 0.1 })), 'intrinsics')).toContain('pincushion');
    expect(answerFor(summarizeScene(FOLDED), 'intrinsics')).toContain('not a physical lens');
    const labels = figureLabels(sum, 'optics');
    expect(labels.plan).toContain('0.858');
    expect(labels.plan).toContain('0.947');
    // The rig is parallel (rectified): the right axis misses the target by B.
    const stereoPlan = figureLabels(sum, 'stereo').plan;
    expect(stereoPlan).toContain('parallel');
    expect(stereoPlan).not.toContain('both aimed');
  });

  it('draws and prints the Extrinsics view through H, which has no distortion term', () => {
    const TL = boardCorners()[0];
    // The last scene keeps one more corner in frame with k1 −0.08 than without:
    // the view must count what it draws.
    for (const s of [D, scene({ k1: -0.3 }), scene({ k1: 0.3 }), scene({ distanceM: 0.5, yawDeg: -40, pitchDeg: -10, rollDeg: -30 })]) {
      const sm = summarizeScene(s);
      const h = mv3(sm.H, [TL[0], TL[1], 1]);
      const viaH: Vec2 = [h[0] / h[2], h[1] / h[2]];
      expect(Math.abs(sm.pinhole.probe.pixel[0] - viaH[0])).toBeLessThan(1e-9);
      expect(Math.abs(sm.pinhole.probe.pixel[1] - viaH[1])).toBeLessThan(1e-9);
      expect(answerFor(sm, 'extrinsics')).toContain(`(${fmt(viaH[0], 1)}, ${fmt(viaH[1], 1)}) px`);
      expect(figureLabels(sm, 'extrinsics').image).toContain(`(${fmt(viaH[0], 1)}, ${fmt(viaH[1], 1)}) px`);
      const fig = imageFigure(sm, 'extrinsics');
      expect(Math.abs(fig.probe[0] - viaH[0] * IMAGE_VIEW.scale)).toBeLessThan(0.006);
      expect(Math.abs(fig.probe[1] - viaH[1] * IMAGE_VIEW.scale)).toBeLessThan(0.006);
      boardCorners().forEach((X, i) => {
        const g = mv3(sm.H, [X[0], X[1], 1]);
        expect(Math.abs(fig.corners[i].at[0] - (g[0] / g[2]) * IMAGE_VIEW.scale)).toBeLessThan(0.006);
        expect(Math.abs(fig.corners[i].at[1] - (g[1] / g[2]) * IMAGE_VIEW.scale)).toBeLessThan(0.006);
      });
      const drawnInFrame = fig.corners.filter((c) => c.inFrame).length;
      expect(drawnInFrame).toBe(sm.pinhole.inFrame);
      expect(metricsFor(sm, 'extrinsics')).toContainEqual(['CORNERS IN FRAME', `${drawnInFrame} / 54`]);
    }
    const tilted = summarizeScene(scene({ distanceM: 0.5, yawDeg: -40, pitchDeg: -10, rollDeg: -30 }));
    expect([tilted.inFrame, tilted.pinhole.inFrame]).toEqual([52, 51]);
  });

  it('flags a barrel fold past the pinhole corner, and runs the radial strip on to show it', () => {
    const folded = summarizeScene(scene({ focalMm: 20, k1: -0.2, k2: 0 }));
    expect(folded.monotonic).toBe(false);
    expect(answerFor(folded, 'intrinsics')).toContain('not a physical lens');
    expect(chartFigure(folded, 'intrinsics').hatch?.length).toBeGreaterThan(0);
    expect(figureLabels(folded, 'intrinsics').chart).toContain('fold at 1032.8 px');
    // A fold inside the pinhole corner keeps the strip to the corner, hatched there.
    expect(chartFigure(summarizeScene(FOLDED), 'intrinsics').hatch?.length).toBeGreaterThan(0);
    expect(figureLabels(summarizeScene(FOLDED), 'intrinsics').chart).not.toContain('runs on');
    expect(chartFigure(sum, 'intrinsics').hatch).toEqual([]);
  });
});
