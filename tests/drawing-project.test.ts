import { describe, expect, it } from 'vitest';
import {
  AXO_PHI, AXO_PSI, basis, containFrame, coverFrame, DEG, fitOrtho, lerpPose, NORTH_UP, planPose, posterPose, project,
  pxPerMetre, rotateByQuat, type Frame, type Pose,
} from '../lib/drawings/project';
import { POSTER } from '../lib/drawings/site.generated';

// The desk drawing set's projector (lib/drawings/project.ts): the poster camera
// as a shifted pinhole lands the estate where the poster has it, so the welcome's
// line work registers with the picture it replaces.

const at = (pose: Pose, frame: Frame, X: number, Y: number, Z = 0) => {
  const out = [0, 0];
  expect(project(pose, basis(pose), frame, X, Y, Z, out)).toBe(true);
  return out;
};

const POSTER_FRAME: Frame = { x: 0, y: 0, w: POSTER.w, h: POSTER.h };

describe('drawing projector', () => {
  it('reads the poster camera: ψ 225°, φ 30°, centre where the view meets the ground, the lens shift in units of k', () => {
    const pose = posterPose(POSTER);
    expect(pose.psi / DEG).toBeCloseTo(-135, 3); // 225° the other way round
    expect(pose.phi / DEG).toBeCloseTo(30, 3);
    expect(pose.cx).toBeCloseTo(154.84, 1);
    expect(pose.cy).toBeCloseTo(154.84, 1);
    expect(pose.p).toBeCloseTo(0.385714, 5);
    expect(pose.k).toBeCloseTo(260.50, 1);
    expect(pose.sigma).toBeCloseTo(-0.328011, 5);
    expect(pose.sigmaX).toBe(0);
    const r = rotateByQuat(POSTER.quat, [1, 0, 0]);
    expect(r[0]).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(r[1]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('lands the estate’s corners where the poster has them (± 0.5 px on 1600 × 1200)', () => {
    const pose = posterPose(POSTER);
    const near = (got: number[], want: number[]) => {
      expect(Math.abs(got[0] - want[0])).toBeLessThan(0.5);
      expect(Math.abs(got[1] - want[1])).toBeLessThan(0.5);
    };
    near(at(pose, POSTER_FRAME, 0, 0), [800.0, 206.3]);
    near(at(pose, POSTER_FRAME, 400, 0), [90.4, 483.3]);
    near(at(pose, POSTER_FRAME, 0, 400), [1509.6, 483.3]);
    near(at(pose, POSTER_FRAME, 400, 400), [800.0, 1122.1]);
  });

  it('matches a direct shifted pinhole, with a horizontal shift too', () => {
    const shifted = { ...POSTER, shift: [0.05, -0.123004] as const };
    const pose = posterPose(shifted);
    const f = rotateByQuat(shifted.quat, [0, 0, -1]);
    const r = rotateByQuat(shifted.quat, [1, 0, 0]);
    const u = rotateByQuat(shifted.quat, [0, 1, 0]);
    const ht = Math.tan((shifted.vfovDeg * DEG) / 2);
    const sx = shifted.shift[0] * 2 * ht * Math.max(shifted.aspect, 1);
    const sy = shifted.shift[1] * 2 * ht * Math.max(shifted.aspect, 1);
    for (const P of [[0, 0, 0], [400, 0, 0], [0, 400, 30], [255, 345, 60], [162, 264, 28]]) {
      const d = [P[0] - shifted.eye[0], P[1] - shifted.eye[1], P[2] - shifted.eye[2]];
      const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
      const tx = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / z;
      const ty = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / z;
      const want = [((tx - sx) / (ht * shifted.aspect) + 1) / 2 * 1600, (1 - (ty - sy) / ht) / 2 * 1200];
      const got = at(pose, POSTER_FRAME, P[0], P[1], P[2]);
      expect(Math.abs(got[0] - want[0])).toBeLessThan(0.5);
      expect(Math.abs(got[1] - want[1])).toBeLessThan(0.5);
    }
  });

  it('draws plans north up at the frame’s scale, and turned a quarter for ψ 180°', () => {
    const frame: Frame = { x: 100, y: 50, w: 400, h: 300 };
    const pose = planPose(10, 20, 15);
    expect(pxPerMetre(pose, frame)).toBe(10);
    expect(at(pose, frame, 10, 20)).toEqual([300, 200]);
    const ne = at(pose, frame, 12, 21);
    expect(ne[0]).toBeCloseTo(320, 9); // east is right
    expect(ne[1]).toBeCloseTo(190, 9); // north is up
    const turned = planPose(10, 20, 15, 180 * DEG);
    const n = at(turned, frame, 10, 21);
    expect(n[0]).toBeCloseTo(310, 9); // north is right
    expect(n[1]).toBeCloseTo(200, 9);
    expect(NORTH_UP).toBe(90 * DEG);
  });

  it('shifts a whole axonometric plate by the same screen vector when it rises (exploded plates translate as images)', () => {
    const frame: Frame = { x: 0, y: 0, w: 800, h: 600 };
    const pose: Pose = { psi: AXO_PSI, phi: AXO_PHI, cx: 0, cy: 0, cz: 0, k: 40, p: 0, sigma: 0, sigmaX: 0 };
    const a0 = at(pose, frame, 3, 4, 0);
    const a1 = at(pose, frame, 3, 4, 12);
    const b0 = at(pose, frame, -20, 9, 0);
    const b1 = at(pose, frame, -20, 9, 12);
    expect(a1[0] - a0[0]).toBeCloseTo(b1[0] - b0[0], 9);
    expect(a1[1] - a0[1]).toBeCloseTo(b1[1] - b0[1], 9);
    expect(a1[0] - a0[0]).toBeCloseTo(0, 9); // straight up the screen
  });

  it('moves from axonometric to the poster by a dolly-zoom whose ends are exact', () => {
    const poster = posterPose(POSTER);
    const axo: Pose = { ...poster, p: 0, sigma: 0, k: 60, cx: 255, cy: 345, cz: 0 };
    expect(lerpPose(axo, poster, 0)).toEqual(axo);
    const end = lerpPose(axo, poster, 1);
    for (const key of Object.keys(poster) as (keyof Pose)[]) expect(end[key]).toBeCloseTo(poster[key], 9);
    expect(lerpPose(planPose(0, 0, 10, 350 * DEG), planPose(0, 0, 10, 10 * DEG), 0.5).psi / DEG).toBeCloseTo(360, 9);
    expect(lerpPose(planPose(0, 0, 10), planPose(0, 0, 1000), 0.5).k).toBeCloseTo(100, 9);
  });

  it('fits points in a frame orthographically, centred, with a margin', () => {
    const points = [-14, -12, 0, 14, -12, 0, 14, 12, 0, -14, 12, 0];
    const pose = fitOrtho(NORTH_UP, 90 * DEG, points, 2, 0.1);
    const frame: Frame = { x: 0, y: 0, w: 1000, h: 500 };
    const sw = at(pose, frame, -14, -12);
    const ne = at(pose, frame, 14, 12);
    expect(sw[0]).toBeGreaterThanOrEqual(100 - 1e-6);
    expect(ne[0]).toBeLessThanOrEqual(900 + 1e-6);
    expect(ne[1]).toBeGreaterThanOrEqual(50 - 1e-6);
    expect(sw[1]).toBeLessThanOrEqual(450 + 1e-6);
    expect((sw[0] + ne[0]) / 2).toBeCloseTo(500, 6);
    expect((sw[1] + ne[1]) / 2).toBeCloseTo(250, 6);
  });

  it('covers and contains a box with a 4:3 image the way CSS does', () => {
    expect(coverFrame({ x: 0, y: 0, w: 800, h: 300 }, 4 / 3)).toEqual({ x: 0, y: -150, w: 800, h: 600 });
    expect(coverFrame({ x: 10, y: 0, w: 300, h: 600 }, 4 / 3)).toEqual({ x: -240, y: 0, w: 800, h: 600 });
    expect(containFrame({ x: 0, y: 0, w: 800, h: 300 }, 4 / 3)).toEqual({ x: 200, y: 0, w: 400, h: 300 });
  });
});
