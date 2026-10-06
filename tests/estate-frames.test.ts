import { describe, expect, it } from 'vitest';
import {
  FAR_MAX, FOG_END_PAST_TARGET, NEAR_MAX, NEAR_MIN, WALK_FAR, WALK_NEAR, clipPlanes, estateDirToLocal, estateToLocal,
  estateToThree, gltfToLocal, gltfToThree, headingToThreeYaw, localDirToEstate, localToEstate, localToGltf, localToThree,
  pointBoxDistance, quarterTurns, siteRootThree, threeToEstate, threeToLocal, threeYawToHeading, wrapAngle,
  type EstateViewMode, type SitePlacement, type Vec3,
} from '../lib/estate/frames';

// Frames per upstream manifest.py:418-420 and the plan's pack `frame`; clip
// planes per plan §7.2. The building boxes are the estate-frame `bounds` of
// model/estate_manifest.json (v1.1).

const BOXES: Array<[Vec3, Vec3]> = [
  [[240.7, 332.7, -0.2], [269.1, 357, 60.2]], [[315.7, 333, -0.2], [344.3, 357.3, 60.2]],
  [[240.7, 279.3, -0.2], [268.7, 301.1, 65.8]], [[316.3, 279.3, -0.2], [344.3, 301.1, 65.8]],
  [[240.7, 223.9, -0.2], [269.3, 245.8, 74.2]], [[315.7, 222.7, -0.2], [344.3, 247, 74.2]],
  [[56.3, 146.7, -0.2], [153.7, 160, 43.4]], [[56.3, 96.7, -0.2], [153.7, 110, 43.4]],
  [[41.6, 46.7, -0.2], [168.4, 62.2, 49]], [[214.4, 108.3, -0.2], [272.5, 192.3, 49]],
  [[312.5, 106.7, -0.2], [370.3, 192.1, 49]], [[250.7, 46.7, -0.2], [333.3, 63.3, 37.8]],
  [[142, 214, -0.25], [182, 314, 28.04]], [[28, 318, -0.2], [155, 366, 9.3]],
];
const BLK_509: SitePlacement = { at: [105, 50] };

// Deterministic points: mulberry32.
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const points = (n: number, seed: number): Vec3[] => {
  const r = rng(seed);
  return Array.from({ length: n }, () => [r() * 800 - 400, r() * 800 - 400, r() * 200 - 20] as Vec3);
};
const close = (a: ArrayLike<number>, b: ArrayLike<number>, eps = 1e-9) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i += 1) expect(Math.abs(a[i] - b[i]), `component ${i}: ${a[i]} vs ${b[i]}`).toBeLessThanOrEqual(eps);
};
// +0 for -0, so an exact comparison is about value, not the sign of zero.
const exact = (v: ArrayLike<number>) => Array.from(v, (x) => x + 0);

describe('estate ↔ three', () => {
  it('maps Z-up (x, y, z) to Y-up (x, z, −y)', () => {
    expect(estateToThree([1, 2, 3])).toEqual([1, 3, -2]);
    expect(threeToEstate([1, 3, -2])).toEqual([1, 2, 3]);
    // Up stays up, north becomes three's −Z.
    expect(exact(estateToThree([0, 0, 1]))).toEqual([0, 1, 0]);
    expect(exact(estateToThree([0, 1, 0]))).toEqual([0, 0, -1]);
  });

  it('round-trips exactly', () => {
    for (const p of points(200, 1)) {
      expect(threeToEstate(estateToThree(p))).toEqual(p);
      expect(estateToThree(threeToEstate(p))).toEqual(p);
    }
  });

  it('keeps handedness: east × north = up in both frames', () => {
    const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const e = estateToThree([1, 0, 0]);
    const n = estateToThree([0, 1, 0]);
    expect(exact(cross(e, n))).toEqual(exact(estateToThree([0, 0, 1])));
  });
});

describe('glTF Y-up ↔ block-local Z-up', () => {
  it('maps a glb point (gx, gy, gz) to (gx, −gz, gy), as the manifest says', () => {
    expect(gltfToLocal([1, 2, 3])).toEqual([1, -3, 2]);
    expect(localToGltf([1, -3, 2])).toEqual([1, 2, 3]);
  });

  it('round-trips exactly', () => {
    for (const p of points(200, 2)) {
      expect(localToGltf(gltfToLocal(p))).toEqual(p);
      expect(gltfToLocal(localToGltf(p))).toEqual(p);
    }
  });
});

describe('block-local ↔ estate', () => {
  it('translates by `at` when the site is not turned (every v1.1 site)', () => {
    expect(localToEstate([-15.275, 0.01, 26], BLK_509)).toEqual([89.725, 50.01, 26]);
    close(estateToLocal([89.725, 50.01, 26], BLK_509), [-15.275, 0.01, 26]);
  });

  it('puts an engine.json point at world (x + at.x, z, −(y + at.y)) (estate.md §1.3)', () => {
    // BLK_509 #10-105's main-door hinge.
    close(localToThree([-15.275, 0.01, 26], BLK_509), [89.725, 26, -50.01]);
    close(threeToLocal([89.725, 26, -50.01], BLK_509), [-15.275, 0.01, 26]);
  });

  it('turns counter-clockwise, exactly at quarter turns', () => {
    const at = [10, 20] as const;
    expect(exact(localToEstate([1, 0, 5], { at, rot: quarterTurns(1) }))).toEqual([10, 21, 5]);
    expect(exact(localToEstate([1, 0, 5], { at, rot: quarterTurns(2) }))).toEqual([9, 20, 5]);
    expect(exact(localToEstate([1, 0, 5], { at, rot: quarterTurns(3) }))).toEqual([10, 19, 5]);
    expect(exact(localToEstate([1, 0, 5], { at, rot: quarterTurns(-1) }))).toEqual([10, 19, 5]);
    expect(exact(localToEstate([1, 0, 5], { at, rot: quarterTurns(4) }))).toEqual([11, 20, 5]);
    expect(quarterTurns(1)).toBe(Math.PI / 2);
  });

  it('round-trips at any rotation', () => {
    const r = rng(3);
    for (const p of points(200, 4)) {
      const site: SitePlacement = { at: [r() * 400, r() * 400], rot: r() * 8 - 4 };
      close(estateToLocal(localToEstate(p, site), site), p, 1e-9);
      close(localToEstate(estateToLocal(p, site), site), p, 1e-9);
      close(threeToLocal(localToThree(p, site), site), p, 1e-9);
    }
  });

  it('rotates directions without moving them', () => {
    close(localDirToEstate([0, 1, 0], { at: [300, 300], rot: quarterTurns(1) }), [-1, 0, 0]);
    expect(localDirToEstate([0.6, 0.8, 0], BLK_509)).toEqual([0.6, 0.8, 0]);
  });

  it('writes into `out`, even when `out` is the input', () => {
    const p: Vec3 = [1, 2, 3];
    expect(estateToThree(p, p)).toBe(p);
    expect(p).toEqual([1, 3, -2]);
    const q: Vec3 = [1, 0, 0];
    localToEstate(q, { at: [5, 5], rot: quarterTurns(1) }, q);
    expect(exact(q)).toEqual([5, 6, 0]);
    const g: Vec3 = [1, 2, 3];
    gltfToThree(g, BLK_509, g);
    expect(g).toEqual([106, 2, -47]);
  });
});

describe('building root in three', () => {
  it('sits at (at.x, 0, −at.y), and glTF content under it needs no conversion', () => {
    const root = siteRootThree(BLK_509);
    expect(exact(root.position)).toEqual([105, 0, -50]);
    expect(root.yaw).toBe(0);
    for (const g of points(50, 5)) close(gltfToThree(g, BLK_509), [g[0] + 105, g[1], g[2] - 50]);
  });

  it('turns about +Y by the site rotation, so root · glTF = gltfToThree', () => {
    const r = rng(6);
    for (const g of points(100, 7)) {
      const site: SitePlacement = { at: [r() * 400, r() * 400], rot: r() * 2 * Math.PI };
      const { position, yaw } = siteRootThree(site);
      const c = Math.cos(yaw), s = Math.sin(yaw);
      // three's Ry(yaw) applied to the glTF point, then the root position.
      const world: Vec3 = [c * g[0] + s * g[2] + position[0], g[1] + position[1], -s * g[0] + c * g[2] + position[2]];
      close(gltfToThree(g, site), world, 1e-9);
    }
  });
});

describe('pointBoxDistance', () => {
  const lo: Vec3 = [0, 0, 0];
  const hi: Vec3 = [10, 20, 30];
  it('is 0 inside and on the box', () => {
    expect(pointBoxDistance([5, 5, 5], lo, hi)).toBe(0);
    expect(pointBoxDistance([10, 20, 30], lo, hi)).toBe(0);
  });
  it('measures to a face, an edge and a corner', () => {
    expect(pointBoxDistance([15, 5, 5], lo, hi)).toBe(5);
    expect(pointBoxDistance([-3, 24, 5], lo, hi)).toBe(5);
    expect(pointBoxDistance([11, 21, 31], lo, hi)).toBeCloseTo(Math.sqrt(3), 12);
  });
});

describe('clip planes (plan §7.2)', () => {
  const pose = (eye: Vec3, ground = 0, target: Vec3 = [200, 200, 0]) => ({
    nearestBoxDistance: Math.min(...BOXES.map(([a, b]) => pointBoxDistance(eye, a, b))),
    heightAboveFloor: eye[2] - ground,
    orbitDistance: Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]),
    reversedDepth: true,
  });

  it('fixes Walk at 0.08 – 600 m, wherever the walker is', () => {
    expect(clipPlanes('walk', pose([105, 54, 27.6], 26))).toEqual({ near: WALK_NEAR, far: WALK_FAR });
    expect(clipPlanes('walk', pose([0, 0, 1.6]))).toEqual({ near: 0.08, far: 600 });
  });

  it('keeps near ≤ 0.145 m inside Blk 509 at L10, walking or flying', () => {
    // Eye 1.6 m above L10's FFL (26 m), inside the building's box.
    const inside = pose([105, 54, 27.6], 26);
    expect(inside.nearestBoxDistance).toBe(0);
    for (const mode of ['walk', 'fly', 'overview', 'plan'] as EstateViewMode[]) {
      expect(clipPlanes(mode, inside).near, mode).toBeLessThanOrEqual(0.145);
    }
    expect(clipPlanes('fly', inside).near).toBe(NEAR_MIN);
  });

  it('pushes near ≥ 5 m and keeps far ≤ 2 km in an Overview 400 m out', () => {
    const d = 400;
    for (const [polar, azimuth] of [[0, 0], [30, 225], [60, 225], [60, 45], [85, 135]]) {
      const p = (polar * Math.PI) / 180;
      const a = (azimuth * Math.PI) / 180;
      const eye: Vec3 = [200 + d * Math.sin(p) * Math.cos(a), 200 + d * Math.sin(p) * Math.sin(a), d * Math.cos(p)];
      const planes = clipPlanes('overview', pose(eye));
      expect(planes.near, `${polar}°/${azimuth}°`).toBeGreaterThanOrEqual(5);
      expect(planes.far).toBeLessThanOrEqual(2000);
      expect(planes.far).toBe(1300);
    }
  });

  it('takes half the smaller gap, clamped to 0.05 – 20 m', () => {
    const at = (nearestBoxDistance: number, heightAboveFloor: number) =>
      clipPlanes('overview', { nearestBoxDistance, heightAboveFloor, orbitDistance: 100, reversedDepth: true }).near;
    expect(at(10, 30)).toBe(5);
    expect(at(30, 10)).toBe(5);
    expect(at(0.06, 30)).toBe(NEAR_MIN);
    expect(at(0, 30)).toBe(NEAR_MIN);
    expect(at(500, 300)).toBe(NEAR_MAX);
    expect(at(Infinity, Infinity)).toBe(NEAR_MAX);
    expect(at(Infinity, 3)).toBe(1.5);
  });

  it('falls back to the safe near plane on a bad pose', () => {
    const near = (nearestBoxDistance: number, heightAboveFloor: number) =>
      clipPlanes('fly', { nearestBoxDistance, heightAboveFloor, orbitDistance: 100, reversedDepth: true }).near;
    expect(near(Number.NaN, 30)).toBe(NEAR_MIN);
    expect(near(30, Number.NaN)).toBe(NEAR_MIN);
    expect(near(30, -2)).toBe(NEAR_MIN);
  });

  it('sets far 900 m past the target with reversed depth, never past 2 km', () => {
    const far = (orbitDistance: number) => clipPlanes('plan', { nearestBoxDistance: 50, heightAboveFloor: 50, orbitDistance, reversedDepth: true }).far;
    expect(far(50)).toBe(950);
    expect(far(1100)).toBe(FAR_MAX);
    expect(far(5000)).toBe(FAR_MAX);
    expect(far(Infinity)).toBe(FAR_MAX);
    expect(far(Number.NaN)).toBe(900);
    expect(far(-10)).toBe(900);
  });

  it('keeps far at the fog end without reversed depth (no EXT_clip_control, e.g. Firefox)', () => {
    const far = (orbitDistance: number, mode: EstateViewMode = 'overview') =>
      clipPlanes(mode, { nearestBoxDistance: 50, heightAboveFloor: 50, orbitDistance, reversedDepth: false }).far;
    expect(FOG_END_PAST_TARGET).toBe(800);
    expect(far(400)).toBe(1200);
    expect(far(50, 'fly')).toBe(850);
    expect(far(1500)).toBe(FAR_MAX);
    expect(far(Number.NaN)).toBe(800);
    // Walk's far is its own fog end either way.
    expect(far(400, 'walk')).toBe(WALK_FAR);
  });

  it('treats Overview, Plan and Fly alike, and keeps far beyond near', () => {
    const r = rng(8);
    for (let i = 0; i < 500; i += 1) {
      const p = { nearestBoxDistance: r() * 300, heightAboveFloor: r() * 300 - 5, orbitDistance: r() * 1500, reversedDepth: r() < 0.5 };
      const overview = clipPlanes('overview', p);
      expect(clipPlanes('plan', p)).toEqual(overview);
      expect(clipPlanes('fly', p)).toEqual(overview);
      expect(overview.far).toBeGreaterThan(overview.near);
      expect(overview.near).toBeGreaterThanOrEqual(NEAR_MIN);
      expect(overview.near).toBeLessThanOrEqual(NEAR_MAX);
    }
  });

  it('reuses `out`, so a per-frame call allocates nothing', () => {
    const out = { near: 0, far: 0 };
    expect(clipPlanes('overview', { nearestBoxDistance: 10, heightAboveFloor: 10, orbitDistance: 10, reversedDepth: true }, out)).toBe(out);
    expect(out).toEqual({ near: 5, far: 910 });
  });
});

describe('headings and the three camera\'s yaw', () => {
  // three's camera looks down its own −Z; turned by yaw about +Y (Euler YXZ),
  // its forward is (−sin yaw, 0, −cos yaw) in the world.
  const forward = (yaw: number): Vec3 => [-Math.sin(yaw), 0, -Math.cos(yaw)];

  it('looks north down three −Z for a block-local heading of π/2 on an unrotated site', () => {
    const site: SitePlacement = { at: [105, 50] };
    expect(headingToThreeYaw(Math.PI / 2, site)).toBe(0);
    const f = forward(headingToThreeYaw(Math.PI / 2, site));
    expect(f[0]).toBeCloseTo(0, 12);
    expect(f[2]).toBeCloseTo(-1, 12);
    // East (+x) is yaw −π/2, west +π/2, south π (wrapped into (−π, π]).
    expect(headingToThreeYaw(0, site)).toBeCloseTo(-Math.PI / 2, 12);
    expect(headingToThreeYaw(Math.PI, site)).toBeCloseTo(Math.PI / 2, 12);
    expect(headingToThreeYaw(-Math.PI / 2, site)).toBeCloseTo(Math.PI, 12);
  });

  it('points the camera along the heading on any site, and round-trips', () => {
    const r = rng(21);
    for (let i = 0; i < 400; i += 1) {
      const site: SitePlacement = { at: [r() * 400, r() * 400], rot: i % 2 ? quarterTurns(i % 4) : (r() - 0.5) * 7 };
      const heading = (r() - 0.5) * 20;
      const yaw = headingToThreeYaw(heading, site);
      expect(yaw).toBeGreaterThan(-Math.PI);
      expect(yaw).toBeLessThanOrEqual(Math.PI);
      const want = estateToThree(localDirToEstate([Math.cos(heading), Math.sin(heading), 0], site));
      const got = forward(yaw);
      for (let k = 0; k < 3; k += 1) expect(got[k]).toBeCloseTo(want[k], 9);
      expect(threeYawToHeading(yaw, site)).toBeCloseTo(wrapAngle(heading), 9);
    }
  });

  it('turns an estate-frame spawn facing into the block-local frame and back', () => {
    const r = rng(22);
    for (let i = 0; i < 200; i += 1) {
      const site: SitePlacement = { at: [r() * 400, r() * 400], rot: quarterTurns(i % 4) };
      const d: Vec3 = [r() - 0.5, r() - 0.5, r() - 0.5];
      const back = localDirToEstate(estateDirToLocal(d, site), site);
      for (let k = 0; k < 3; k += 1) expect(back[k]).toBeCloseTo(d[k], 12);
    }
    // A site turned a quarter turn counter-clockwise has its local +x pointing north.
    expect(estateDirToLocal([0, 1, 0], { at: [0, 0], rot: quarterTurns(1) })).toEqual([1, 0, 0]);
  });

  it('wraps angles into (−π, π]', () => {
    expect(wrapAngle(Math.PI)).toBe(Math.PI);
    expect(wrapAngle(-Math.PI)).toBe(Math.PI);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(0)).toBe(0);
  });
});
