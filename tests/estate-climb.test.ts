import { describe, expect, it } from 'vitest';
import {
  CLIMB_APPROACH, CLIMB_LOOK_AHEAD, CLIMB_PATH_WEIGHT, CLIMB_SPEED, cancelClimb, climbPose, climbRemaining,
  pointAt, projectOntoPath, startClimb, stairPath, stepClimb, type ClimbPose,
} from '../lib/estate/climb';
import type { Vec3 } from '../lib/estate/frames';

// "Take stairs" per plan §8.5, on a dog-leg stair shaped like upstream's
// <ID>_web.json paths (block-local, Z up, m): L5 at FFL 12.0 to L6 at 14.8,
// two flights of 1.4 m rise and 1.96 m going (7 × 0.28) side by side, a mid
// landing at 13.4, and floor landing centres stacked in plan at (0, 0.65).

const POINTS: Vec3[] = [
  [0, 0.65, 12], // L5 landing centre
  [0.5, 0, 12], // flight 1 foot
  [2.46, 0, 13.4], // flight 1 head
  [3.06, 0.65, 13.4], // mid landing centre
  [2.46, 1.3, 13.4], // flight 2 foot
  [0.5, 1.3, 14.8], // flight 2 head
  [0, 0.65, 14.8], // L6 landing centre, above the L5 one
];
const path = stairPath(POINTS);
const plan = (a: ArrayLike<number>, b: ArrayLike<number>) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const LEGS = POINTS.slice(1).map((p, i) => plan(p, POINTS[i]));
const LENGTH = LEGS.reduce((a, b) => a + b, 0);
const FLIGHT1 = LEGS[0]; // progress at the foot of flight 1
const FLIGHT2 = LEGS[0] + LEGS[1] + LEGS[2] + LEGS[3]; // at the foot of flight 2
const xyz = (p: ClimbPose): Vec3 => [p.x, p.y, p.z];
const close = (a: ArrayLike<number>, b: ArrayLike<number>, digits = 12) => {
  for (let k = 0; k < 3; k += 1) expect(a[k], `component ${k}`).toBeCloseTo(b[k], digits);
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Run a climb to the end at a fixed rate; poses after every frame. */
const runAt = (hz: number, from: Vec3, heading: number, dir: 'up' | 'down') => {
  const climb = startClimb(path, from, heading, dir, false);
  const poses: ClimbPose[] = [climbPose(climb)];
  while (!poses[poses.length - 1].done && poses.length < 100000) poses.push(stepClimb(climb, 1 / hz, false));
  return { climb, poses };
};

describe('stair paths', () => {
  it('measures progress as horizontal length', () => {
    expect(path.count).toBe(7);
    expect(path.length).toBeCloseTo(LENGTH, 12);
    expect(path.cum[2] - path.cum[1]).toBeCloseTo(1.96, 12);
    // About 3.7 s at 2 m/s for this compact stair; the plan's ≈ 4.5 s a storey is the real ones.
    expect(path.length / CLIMB_SPEED).toBeGreaterThan(3);
    expect(path.length / CLIMB_SPEED).toBeLessThan(4.5);
  });

  it('counts a vertical segment by its rise, so position stays a function of progress', () => {
    const p = stairPath([[0, 0, 0], [0, 0, 0.3], [1, 0, 0.3]]);
    expect(Array.from(p.cum)).toEqual([0, 0.3, 1.3]);
    expect(pointAt(p, 0.15)).toEqual([0, 0, 0.15]);
  });

  it('rejects what is not a path', () => {
    expect(() => stairPath([[0, 0, 0]])).toThrow(RangeError);
    expect(() => stairPath([[0, 0, 0], [1, 0]])).toThrow(/not \[x, y, z\]/);
    expect(() => stairPath([[0, 0, 0], [1, NaN, 0]])).toThrow(/NaN/);
    expect(() => stairPath([[1, 2, 3], [1, 2, 3]])).toThrow(/zero length/);
  });

  it('refuses to start from a position that is not three finite numbers, which would make every pose NaN', () => {
    for (const from of [[0.2, 0.1, Number.NaN], [Infinity, 0, 0], [0, 0]]) {
      expect(() => startClimb(path, from, 0, 'up', false)).toThrow(RangeError);
    }
    // A missing heading is fine: the path alone steers the view.
    const climb = startClimb(path, [0.2, 0.1, 0], Number.NaN, 'up', false);
    const pose = stepClimb(climb, 0.1, false);
    expect([pose.x, pose.y, pose.z, pose.heading].every(Number.isFinite)).toBe(true);
  });

  it('gives the ends exactly and clamps past them', () => {
    expect(pointAt(path, 0)).toEqual(POINTS[0]);
    expect(pointAt(path, path.length)).toEqual(POINTS[6]);
    expect(pointAt(path, -3)).toEqual(POINTS[0]);
    expect(pointAt(path, 99)).toEqual(POINTS[6]);
    close(pointAt(path, FLIGHT1 + 0.98), [1.48, 0, 12.7]);
  });

  it('projects in 3-D, so the stacked landing centres stay apart', () => {
    expect(projectOntoPath(path, [0, 0.65, 12]).s).toBe(0);
    expect(projectOntoPath(path, [0, 0.65, 14.8]).s).toBeCloseTo(path.length, 12);
    expect(projectOntoPath(path, [0, 0.65, 14.6]).s).toBeCloseTo(path.length, 12);
    const onFlight = projectOntoPath(path, [1.48, 0, 12.7]);
    expect(onFlight.s).toBeCloseTo(FLIGHT1 + 0.98, 12);
    expect(onFlight.distance).toBeCloseTo(0, 12);
    // Beside flight 2, 0.2 m off it: flight 1 is 1.1 m away in plan.
    const beside = projectOntoPath(path, [1.48, 1.1, 14.1]);
    expect(beside.s).toBeCloseTo(FLIGHT2 + 0.98, 9);
    expect(beside.distance).toBeCloseTo(0.2, 9);
  });
});

describe('taking the stairs', () => {
  it(`follows the path at ${CLIMB_SPEED} m/s in plan and lands exactly on the next storey`, () => {
    const { climb, poses } = runAt(60, POINTS[0], 0, 'up');
    expect(climb.from).toBe(0);
    expect(climb.state).toBe('done');
    expect(xyz(poses[poses.length - 1])).toEqual(POINTS[6]);
    expect(poses.length - 1).toBe(Math.ceil((LENGTH / CLIMB_SPEED) * 60 - 1e-9));
    // Within flight 1, each frame advances 2/60 m in plan.
    const a = poses[30], b = poses[31];
    expect(plan(xyz(a), xyz(b))).toBeCloseTo(CLIMB_SPEED / 60, 9);
    // Rises with the flight's pitch, and never falls.
    for (let i = 1; i < poses.length; i += 1) expect(poses[i].z).toBeGreaterThanOrEqual(poses[i - 1].z - 1e-12);
  });

  it('is in the same place at the same time at any frame rate', () => {
    const at = (dts: number[]) => {
      const climb = startClimb(path, POINTS[0], 0, 'up', false);
      let pose = climbPose(climb);
      for (const dt of dts) pose = stepClimb(climb, dt, false);
      return pose;
    };
    const t = 1.75;
    const p60 = at(Array.from({ length: 105 }, () => 1 / 60));
    const p144 = at(Array.from({ length: 252 }, () => 1 / 144));
    const ragged = at([0.3, 0.004, 0.5, 0.25, 0.1, 0.596]);
    expect(ragged.done).toBe(false);
    for (const p of [p60, p144, ragged]) {
      close(xyz(p), pointAt(path, CLIMB_SPEED * t), 9);
      expect(p.heading).toBeCloseTo(p60.heading, 9);
    }
  });

  it('carries on from where the walker already is on the flight', () => {
    const mid: Vec3 = [1.48, 0, 12.7];
    const climb = startClimb(path, mid, 0, 'up', false);
    expect(climb.from).toBeCloseTo(FLIGHT1 + 0.98, 12);
    expect(climbRemaining(climb)).toBeCloseTo((LENGTH - FLIGHT1 - 0.98) / CLIMB_SPEED, 12);
    close(xyz(climbPose(climb)), mid);
  });

  it(`closes the gap from the walker to the path over the first ${CLIMB_APPROACH} m, without a jump`, () => {
    const from: Vec3 = [0.3, 0.6, 12.05];
    const { climb, poses } = runAt(60, from, 0, 'up');
    close(xyz(poses[0]), from);
    expect(climb.offset.some((v) => v !== 0)).toBe(false); // zeroed on arrival
    // 2/60 m in plan, the flight's pitch on top, and the 0.21 m gap fading over
    // 1 m: about 4.8 cm a frame at most.
    for (let i = 1; i < poses.length; i += 1) {
      const d = Math.hypot(poses[i].x - poses[i - 1].x, poses[i].y - poses[i - 1].y, poses[i].z - poses[i - 1].z);
      expect(d, `frame ${i}`).toBeLessThan(0.05);
    }
    // Once CLIMB_APPROACH of path is behind it, the walker is on the path.
    const after = startClimb(path, from, 0, 'up', false);
    const pose = stepClimb(after, (CLIMB_APPROACH + 0.01) / CLIMB_SPEED, false);
    close(xyz(pose), pointAt(path, after.s));
  });

  it('looks along the path, 70/30 with the heading the climb began with', () => {
    expect(CLIMB_PATH_WEIGHT).toBe(0.7);
    // Mid flight 1 (east), with a look-ahead that stays on it, begun facing north.
    const north = startClimb(path, [1.2, 0, 12.5], Math.PI / 2, 'up', false);
    expect(climbPose(north).heading).toBeCloseTo(Math.atan2(0.3, 0.7), 12);
    // Mid flight 2 (west), begun facing east: 0.7 west + 0.3 east is still west.
    const east = startClimb(path, [1.7, 1.3, 14.0], 0, 'up', false);
    expect(Math.abs(climbPose(east).heading)).toBeCloseTo(Math.PI, 12);
    // No heading given: the path alone.
    const none = startClimb(path, [1.2, 0, 12.5], NaN, 'up', false);
    expect(climbPose(none).heading).toBeCloseTo(0, 12);
  });

  it(`turns round the landing smoothly, looking ${CLIMB_LOOK_AHEAD} m ahead`, () => {
    const { poses } = runAt(60, POINTS[0], 0, 'up');
    let worst = 0;
    for (let i = 1; i < poses.length; i += 1) worst = Math.max(worst, Math.abs(wrap(poses[i].heading - poses[i - 1].heading)));
    // Taken at the path's own direction, the corners here turn 1.35 rad (77°)
    // in one 60 Hz frame. Looking ahead spreads the 180° over the landing; the
    // peak, 0.18 rad, comes where the path runs against the start heading and
    // the 70/30 blend shortens to 0.4, which speeds its turning by 1.75.
    expect(worst).toBeLessThan(0.2);
    // At the end there is nothing ahead: it looks along the last metre it came, onto the landing.
    const last = poses[poses.length - 1];
    const back = pointAt(path, LENGTH - CLIMB_LOOK_AHEAD);
    const leg = Math.atan2(POINTS[6][1] - back[1], POINTS[6][0] - back[0]);
    expect(last.heading).toBeCloseTo(Math.atan2(0.7 * Math.sin(leg), 0.7 * Math.cos(leg) + 0.3), 9);
  });

  it('goes down by the same path, reversed', () => {
    const { climb, poses } = runAt(60, POINTS[6], Math.PI, 'down');
    expect(climb.from).toBeCloseTo(LENGTH, 12);
    expect(climb.to).toBe(0);
    expect(xyz(poses[poses.length - 1])).toEqual(POINTS[0]);
    for (let i = 1; i < poses.length; i += 1) expect(poses[i].z).toBeLessThanOrEqual(poses[i - 1].z + 1e-12);
    // Looking down the path, a metre ahead: from the L6 centre onto flight 2.
    const ahead = pointAt(path, LENGTH - CLIMB_LOOK_AHEAD);
    const away = Math.atan2(ahead[1] - POINTS[6][1], ahead[0] - POINTS[6][0]);
    const v = [0.7 * Math.cos(away) + 0.3 * Math.cos(Math.PI), 0.7 * Math.sin(away) + 0.3 * Math.sin(Math.PI)];
    expect(poses[0].heading).toBeCloseTo(Math.atan2(v[1], v[0]), 9);
  });

  it('is already done when it starts at its end', () => {
    const top = startClimb(path, POINTS[6], 0, 'up', false);
    expect(top.state).toBe('done');
    expect(climbRemaining(top)).toBe(0);
    expect(xyz(climbPose(top))).toEqual(POINTS[6]);
  });
});

describe('cuts, cancels and halted motion', () => {
  it('cuts straight to the end while motion is halted', () => {
    const halted = startClimb(path, [0.3, 0.6, 12.05], 0, 'up', true);
    const pose = climbPose(halted);
    expect(pose.done).toBe(true);
    expect(xyz(pose)).toEqual(POINTS[6]);
    const climb = startClimb(path, POINTS[0], 0, 'up', false);
    stepClimb(climb, 0.5, false);
    const cut = stepClimb(climb, 0.016, true);
    expect(cut.done).toBe(true);
    expect(xyz(cut)).toEqual(POINTS[6]);
    const down = startClimb(path, POINTS[6], 0, 'down', false);
    stepClimb(down, 0.5, false);
    expect(xyz(stepClimb(down, 0.016, true))).toEqual(POINTS[0]);
  });

  it("stops where it is on a movement key ('here')", () => {
    const climb = startClimb(path, [0.3, 0.6, 12.05], 0, 'up', false);
    const before = { ...stepClimb(climb, 0.2, false) };
    const stopped = cancelClimb(climb, 'here');
    expect(climb.state).toBe('cancelled');
    expect(stopped.done).toBe(true);
    close(xyz(stopped), xyz(before));
    expect(stopped.heading).toBe(before.heading);
    expect(xyz(stepClimb(climb, 1, false))).toEqual(xyz(stopped));
    expect(climbRemaining(climb)).toBe(0);
  });

  it("lands on the nearer end along the path on Esc ('nearest-end'), the destination at the midpoint", () => {
    const near = (s: number, dir: 'up' | 'down') => {
      const climb = startClimb(path, dir === 'up' ? POINTS[0] : POINTS[6], 0, dir, false);
      climb.s = s;
      return xyz(cancelClimb(climb, 'nearest-end'));
    };
    expect(near(LENGTH * 0.4, 'up')).toEqual(POINTS[0]);
    expect(near(LENGTH * 0.6, 'up')).toEqual(POINTS[6]);
    expect(near(path.length / 2, 'up')).toEqual(POINTS[6]);
    expect(near(path.length / 2, 'down')).toEqual(POINTS[0]);
    expect(near(LENGTH * 0.6, 'down')).toEqual(POINTS[6]);
    // Within the approach the walker's offset is dropped too: it lands on the end itself.
    const early = startClimb(path, [0.3, 0.6, 12.05], 0, 'up', false);
    stepClimb(early, 0.1, false);
    expect(xyz(cancelClimb(early, 'nearest-end'))).toEqual(POINTS[0]);
  });

  it('ignores a cancel after the end, and a bad dt', () => {
    const climb = startClimb(path, POINTS[0], 0, 'up', false);
    expect(xyz(stepClimb(climb, 0, false))).toEqual(POINTS[0]);
    expect(xyz(stepClimb(climb, -1, false))).toEqual(POINTS[0]);
    expect(xyz(stepClimb(climb, NaN, false))).toEqual(POINTS[0]);
    stepClimb(climb, 60, false);
    expect(climb.state).toBe('done');
    expect(xyz(cancelClimb(climb, 'nearest-end'))).toEqual(POINTS[6]);
    expect(climb.state).toBe('done');
  });

  it('reuses the pose it is given', () => {
    const climb = startClimb(path, POINTS[0], 0, 'up', false);
    const out: ClimbPose = { x: 0, y: 0, z: 0, heading: 0, done: false };
    expect(stepClimb(climb, 0.1, false, out)).toBe(out);
    expect(climbPose(climb, out)).toBe(out);
    expect(cancelClimb(climb, 'here', out)).toBe(out);
  });
});
