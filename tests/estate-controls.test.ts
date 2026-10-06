import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ESTATE_SITE_IDS } from '../lib/estate/ids';
import { HeldKeys } from '../lib/estate/input';
import { parsePack } from '../lib/estate/schema';
import { FlyController, LookState } from '../components/workbench/estate/engine/controls/firstPerson';
import { estateToThree } from '../lib/estate/frames';
import { fallbackAerialPose } from '../components/workbench/estate/engine/views';
import {
  FLY_BOOST, FLY_CLEARANCE, FLY_MULTIPLIER_MAX, FLY_MULTIPLIER_MIN, FLY_SPEED_MAX, FLY_SPEED_MIN, flySpeed, nextFlyMultiplier,
  northRotation, wheelSteps,
} from '../components/workbench/estate/engine/controls/motion';
import {
  buildPrisms, ClickTracker, CLICK_MAX_MS, CLICK_SLOP_PX, DOUBLE_MS, pickPrism, rayBox, rayPrism, siteAround, siteNear,
  TOUCH_CLICK_SLOP_PX, type PrismSource,
} from '../components/workbench/estate/engine/controls/picking';
import {
  blankPose, clampOrbit, easeInOutCubic, FLY_TO_SECONDS, flightDone, flightPose, FRAME_FILL, FRAME_POLAR_MAX, FRAME_POLAR_MIN, frameBuilding,
  HOP_MAX, ORBIT_LIMITS, orbitFromLookAt, planFlight, positionFromOrbit,
} from '../components/workbench/estate/engine/controls/tween';

// The Estate viewer's controls, the parts that are numbers (plan §8.1, §8.2):
// flights and framing, picking and the click rules, Fly's speed and clearance,
// the wheel and the compass. The DOM wiring is tests/estate-controls.dom.test.tsx.

const DEG = Math.PI / 180;
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

describe('orbit poses and flights', () => {
  it('eases from 0 to 1 symmetrically and clamps outside', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1, 12);
    expect(easeInOutCubic(-3)).toBe(0);
    expect(easeInOutCubic(7)).toBe(1);
    expect(easeInOutCubic(Number.NaN)).toBe(1);
  });

  it('round-trips a look-at through camera-controls’ spherical convention', () => {
    const target: [number, number, number] = [120, 8, -60];
    for (const [x, y, z] of [[300, 200, 100], [120, 50, -59.9], [-40, 2, -300], [120.0001, 900, -60]]) {
      const pose = orbitFromLookAt([x, y, z], target);
      const back = positionFromOrbit(pose);
      expect(back[0]).toBeCloseTo(x, 6);
      expect(back[1]).toBeCloseTo(y, 6);
      expect(back[2]).toBeCloseTo(z, 6);
    }
    // Azimuth 0 sits on +Z of the target (looking north, three −Z); straight above is polar 0.
    expect(orbitFromLookAt([0, 0, 10], [0, 0, 0]).azimuth).toBe(0);
    expect(orbitFromLookAt([0, 10, 0], [0, 0, 0]).polar).toBe(0);
  });

  it('clamps a pose into Overview’s limits (8–900 m, ≤ 85° from straight down)', () => {
    const pose = { ...blankPose(), distance: 2000, polar: 89 * DEG };
    clampOrbit(pose);
    expect(pose.distance).toBe(ORBIT_LIMITS.maxDistance);
    expect(pose.polar).toBeCloseTo(85 * DEG, 12);
    expect(clampOrbit({ ...blankPose(), distance: 1 }).distance).toBe(8);
  });

  it('frames a building from the current compass heading, obliquely, fitted and inside the limits', () => {
    const bounds: [[number, number, number], [number, number, number]] = [[42, 47, 0], [168, 62, 49]]; // BLK 509
    const current = { target: [200, 0, -200] as [number, number, number], distance: 600, azimuth: 2.2, polar: 20 * DEG };
    const pose = frameBuilding(bounds, 68, 49, current, 45, 4 / 3);
    // Aimed at the middle of the box, where its bounding sphere is centred.
    expect(pose.target).toEqual([105, 24.5, -54.5]);
    expect(pose.azimuth).toBe(2.2);
    expect(pose.polar).toBe(FRAME_POLAR_MIN);
    expect(frameBuilding(bounds, 68, 49, { ...current, polar: 84 * DEG }, 45, 4 / 3).polar).toBe(FRAME_POLAR_MAX);
    // The sphere's silhouette fills FRAME_FILL of the short side: wide stages
    // fit the height, tall ones the width. (It once multiplied by the fill, so
    // the sphere overfilled the frame and every point block lost its roof.)
    const wide = frameBuilding(bounds, 68, 49, current, 45, 2).distance;
    const tall = frameBuilding(bounds, 68, 49, current, 45, 0.5).distance;
    expect(FRAME_FILL).toBe(0.8);
    expect(wide).toBeCloseTo(68 / Math.sin(Math.atan(FRAME_FILL * Math.tan(22.5 * DEG))), 6);
    expect(Math.tan(Math.asin(68 / wide)) / Math.tan(22.5 * DEG)).toBeCloseTo(FRAME_FILL, 9);
    expect(tall).toBeGreaterThan(wide);
    expect(frameBuilding(bounds, 5000, 49, current, 45, 1).distance).toBe(ORBIT_LIMITS.maxDistance);
    expect(frameBuilding(bounds, 0.1, 49, current, 45, 1).distance).toBe(ORBIT_LIMITS.minDistance);
    // The target height follows the box, whatever its roof.
    expect(frameBuilding([[0, 0, 0], [40, 40, 9.3]], 30, 9.3, current, 45, 1).target[1]).toBeCloseTo(4.65, 9);
    expect(frameBuilding([[0, 0, 0], [40, 40, 120]], 70, 120, current, 45, 1).target[1]).toBe(60);
  });


  it('flies from pose to pose in 1.2 s: exact ends, the short way round, a hop mid-flight', () => {
    const from = { target: [0, 0, 0] as [number, number, number], distance: 600, azimuth: 3.0, polar: 50 * DEG };
    const to = { target: [300, 10, -400] as [number, number, number], distance: 150, azimuth: -3.0, polar: 60 * DEG };
    const flight = planFlight(from, to);
    expect(flight.seconds).toBe(FLY_TO_SECONDS);
    expect(flight.hop).toBe(Math.min(HOP_MAX, 500 * 0.35));
    const start = flightPose(flight, 0);
    expect(start.target).toEqual([0, 0, 0]);
    expect(start.distance).toBeCloseTo(600, 9);
    const end = flightPose(flight, FLY_TO_SECONDS);
    expect(end).toEqual({ target: [300, 10, -400], distance: 150, azimuth: -3.0, polar: 60 * DEG });
    expect(flightPose(flight, Infinity)).toEqual(end);
    expect(flightDone(flight, 1.19)).toBe(false);
    expect(flightDone(flight, 1.2)).toBe(true);
    // 3.0 → −3.0 is 0.28 rad through π, not 6 rad back through 0.
    const mid = flightPose(flight, FLY_TO_SECONDS / 2);
    expect(Math.abs(mid.azimuth)).toBeGreaterThan(3.0);
    // Mid-flight the distance is the log-mean plus the hop.
    expect(mid.distance).toBeCloseTo(Math.sqrt(600 * 150) + flight.hop, 6);
    // Never outside the limits, even with a hop.
    const far = planFlight({ ...from, distance: 850 }, { ...to, distance: 880 });
    for (let t = 0; t <= 1.2; t += 0.05) expect(flightPose(far, t).distance).toBeLessThanOrEqual(ORBIT_LIMITS.maxDistance);
    // The plan copies its poses: reusing the caller's objects cannot move a flight in progress.
    from.target[0] = 999;
    expect(flightPose(flight, 0).target[0]).toBe(0);
  });
});

const square = (x0: number, y0: number, size: number, roof: number, at: [number, number] = [0, 0]): PrismSource => ({
  at,
  footprint: [[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size]],
  roofTop: roof,
  bounds: [[at[0] + x0, at[1] + y0, 0], [at[0] + x0 + size, at[1] + y0 + size, roof]],
});

describe('picking', () => {
  // An L of two buildings: A at estate (100…120, 100…120), 30 m; B behind it, 60 m.
  const prisms = buildPrisms([square(0, 0, 20, 30, [100, 100]), square(0, 0, 20, 60, [100, 140])]);

  it('places footprints in the estate frame', () => {
    expect([...prisms[0].ring]).toEqual([100, 100, 120, 100, 120, 120, 100, 120]);
    expect(prisms[1].max[2]).toBe(60);
  });

  it('hits a wall, a roof, the nearer of two buildings, and misses beside them', () => {
    // Level ray from the south at 10 m: A's south wall at y = 100.
    expect(rayPrism([110, 50, 10], [0, 1, 0], prisms[0])).toBeCloseTo(50, 9);
    expect(pickPrism([110, 50, 10], [0, 1, 0], prisms)).toEqual({ index: 0, t: 50 });
    // Above A's roof, the same ray reaches B's wall.
    expect(pickPrism([110, 50, 45], [0, 1, 0], prisms)).toEqual({ index: 1, t: 90 });
    // Straight down onto A's roof.
    expect(rayPrism([110, 110, 100], [0, 0, -1], prisms[0])).toBeCloseTo(70, 9);
    // Beside both.
    expect(pickPrism([150, 50, 10], [0, 1, 0], prisms)).toBeNull();
    // From inside: t 0. Pointing away from it: a miss.
    expect(rayPrism([110, 110, 5], [1, 0, 0], prisms[0])).toBe(0);
    expect(rayPrism([110, 50, 10], [0, -1, 0], prisms[0])).toBe(Infinity);
    // The box test alone.
    expect(rayBox([0, 0, 0], [1, 1, 1], [10, 10, 10], [20, 20, 20])).toBeCloseTo(10, 9);
    expect(rayBox([0, 0, 0], [1, 0, 0], [10, 10, 10], [20, 20, 20])).toBe(Infinity);
  });

  it('tells an L-shaped courtyard from the building around it (outline, not box)', () => {
    const l = buildPrisms([{
      at: [0, 0],
      footprint: [[0, 0], [40, 0], [40, 10], [10, 10], [10, 40], [0, 40]],
      roofTop: 20,
      bounds: [[0, 0, 0], [40, 40, 20]],
    }]);
    // Straight down into the courtyard corner: inside the box, outside the outline.
    expect(rayPrism([30, 30, 50], [0, 0, -1], l[0])).toBe(Infinity);
    expect(rayPrism([5, 30, 50], [0, 0, -1], l[0])).toBeCloseTo(30, 9);
  });

  it('names the building nearest a point within a margin, and beside a flying camera', () => {
    expect(siteNear(110, 110, prisms, 15)).toBe(0);
    expect(siteNear(110, 128, prisms, 15)).toBe(0); // 8 m north of A, 12 m south of B
    expect(siteNear(110, 135, prisms, 15)).toBe(1);
    expect(siteNear(200, 200, prisms, 15)).toBe(-1);
    expect(siteAround(110, 95, 20, prisms, 6)).toBe(0);
    expect(siteAround(110, 95, 40, prisms, 6)).toBe(-1); // 10 m over A's roof
    expect(siteAround(110, 95, 35, prisms, 6)).toBe(0);
  });
});

describe('clicks and taps', () => {
  it('a still, short press is a click; a second within 400 ms is a double', () => {
    const c = new ClickTracker();
    c.down(1, 100, 100, 0, true);
    expect(c.up(1, 102, 101, 120)).toBe('click');
    c.down(1, 101, 100, 300, true);
    expect(c.up(1, 101, 100, 350)).toBe('double');
    // A third is a fresh click, not another double.
    c.down(1, 101, 100, 500, true);
    expect(c.up(1, 101, 100, 520)).toBe('click');
    c.down(1, 101, 100, 520 + DOUBLE_MS + 10, true);
    expect(c.up(1, 101, 100, 520 + DOUBLE_MS + 20)).toBe('click');
  });

  it('a drag, a long press, a second finger or another button is no click', () => {
    const c = new ClickTracker();
    c.down(1, 0, 0, 0, true);
    c.move(1, 30, 0);
    expect(c.up(1, 0, 0, 100)).toBeNull(); // went 30 px and came back: still a drag
    c.down(1, 0, 0, 0, true);
    expect(c.up(1, 0, 0, CLICK_MAX_MS + 1)).toBeNull();
    c.down(1, 0, 0, 0, true);
    c.down(2, 50, 0, 10, false);
    expect(c.up(2, 50, 0, 50)).toBeNull();
    expect(c.up(1, 0, 0, 60)).toBeNull();
    c.down(3, 0, 0, 100, false); // right button
    expect(c.up(3, 0, 0, 120)).toBeNull();
    // …and it recovers.
    c.down(4, 0, 0, 1000, true);
    expect(c.up(4, 0, 0, 1050)).toBe('click');
  });
});

describe('taps', () => {
  it('lets a finger travel farther than a mouse and still tap: 12 px against 5', () => {
    expect([CLICK_SLOP_PX, TOUCH_CLICK_SLOP_PX]).toEqual([5, 12]);
    const c = new ClickTracker();
    c.down(1, 100, 100, 0, true, 'mouse');
    expect(c.up(1, 108, 100, 80)).toBeNull(); // 8 px: a mouse drag
    c.down(2, 100, 100, 1000, true, 'touch');
    expect(c.up(2, 108, 100, 1080)).toBe('click'); // 8 px: a finger's tap
    // A second tap a little off the first is still a double tap.
    c.down(3, 120, 104, 1200, true, 'touch');
    expect(c.up(3, 120, 104, 1260)).toBe('double');
    c.down(4, 100, 100, 3000, true, 'pen');
    expect(c.up(4, 113, 100, 3050)).toBeNull(); // past 12 px a pen is dragging
  });
});

describe('Fly’s numbers, the wheel and the compass', () => {
  it('speed is 2 + 0.5 × height, 2–60 m/s, Shift × 3, times the wheel’s multiplier', () => {
    expect(flySpeed(0, false)).toBe(FLY_SPEED_MIN);
    expect(flySpeed(-5, false)).toBe(FLY_SPEED_MIN);
    expect(flySpeed(40, false)).toBe(22);
    expect(flySpeed(500, false)).toBe(FLY_SPEED_MAX);
    expect(flySpeed(40, true)).toBe(22 * FLY_BOOST);
    expect(flySpeed(40, false, 2)).toBe(44);
    expect(flySpeed(40, false, 100)).toBe(22 * FLY_MULTIPLIER_MAX);
    expect(nextFlyMultiplier(1, 100)).toBe(FLY_MULTIPLIER_MAX);
    expect(nextFlyMultiplier(1, -100)).toBe(FLY_MULTIPLIER_MIN);
    expect(nextFlyMultiplier(1, 1)).toBeCloseTo(1.15, 12);
  });

  it('scales the wheel as camera-controls does, scroll up and pinch out towards the scene', () => {
    expect(wheelSteps(-100, 0, false, false)).toBeCloseTo(100 / 30, 12);
    expect(wheelSteps(100, 0, false, false)).toBeCloseTo(-100 / 30, 12);
    expect(wheelSteps(-3, 1, false, false)).toBeCloseTo(1, 12); // one line notch
    expect(wheelSteps(-3, 1, true, false)).toBeCloseTo(0.1, 12); // a Ctrl+wheel in lines scales as pixels
    expect(wheelSteps(-10, 0, false, true)).toBeCloseTo(1, 12); // macOS: three times finer
    expect(wheelSteps(-1, 2, false, false)).toBeCloseTo(10, 12); // a page is 30 lines
    expect(wheelSteps(0, 0, false, false)).toBe(0);
    expect(wheelSteps(Number.NaN, 0, false, false)).toBe(0);
  });

  it('turns the north arrow by the camera’s heading, level or looking straight down', () => {
    expect(northRotation(0, -1, 0, 0)).toBeCloseTo(0, 12); // facing north
    expect(northRotation(-1, 0, 0, 0)).toBeCloseTo(Math.PI / 2, 12); // west: north on the right
    expect(northRotation(1, 0, 0, 0)).toBeCloseTo(-Math.PI / 2, 12); // east: north on the left
    expect(Math.abs(northRotation(0, 1, 0, 0)!)).toBeCloseTo(Math.PI, 12); // south: north behind, down the screen
    // Straight down with the screen's top towards north: the up axis carries the heading.
    expect(northRotation(0, 0, 0, -1)).toBeCloseTo(0, 12);
    expect(northRotation(0, 0, 0, 0)).toBeNull();
  });
});

describe('the Fly controller', () => {
  const bounds = { minX: 0, maxX: 400, minZ: -400, maxZ: 0 };
  const flyAt = (y: number, pitchDeg = 0) => {
    const camera = new PerspectiveCamera(60, 4 / 3, 0.1, 1000);
    camera.position.set(200, y, -200);
    const look = new LookState();
    look.pitch = pitchDeg * DEG;
    look.apply(camera);
    camera.updateMatrixWorld();
    const fly = new FlyController(camera, { bounds });
    fly.activate();
    return { camera, fly };
  };

  it('keeps the view it took over, and looks north at yaw 0', () => {
    const { camera, fly } = flyAt(50, -30);
    expect(fly.look.yaw).toBeCloseTo(0, 9);
    expect(fly.look.pitch).toBeCloseTo(-30 * DEG, 9);
    const held = new HeldKeys();
    fly.update(0, held, false);
    expect(camera.position.toArray()).toEqual([200, 50, -200]);
  });

  it('never goes lower than 0.3 m above the ground, and stays inside its roam', () => {
    const { camera, fly } = flyAt(5, -80);
    const held = new HeldKeys();
    held.press('KeyW', 'forward');
    held.press('KeyC', 'down');
    for (let i = 0; i < 120; i += 1) fly.update(1 / 60, held, false);
    expect(camera.position.y).toBeCloseTo(FLY_CLEARANCE, 9);
    held.releaseAll();
    held.press('KeyW', 'forward');
    held.press('ShiftLeft', 'boost');
    fly.look.pitch = 0;
    for (let i = 0; i < 2000; i += 1) fly.update(0.1, held, true);
    expect(camera.position.z).toBeGreaterThanOrEqual(-400 - 400 - 1e-9);
  });

  it('closes on the keys’ speed with a time constant, and under halted motion moves and stops dead', () => {
    const { fly } = flyAt(40);
    const held = new HeldKeys();
    held.press('KeyW', 'forward');
    fly.update(1 / 60, held, false);
    const target = flySpeed(40, false);
    expect(fly.velocity.length()).toBeGreaterThan(0);
    expect(fly.velocity.length()).toBeLessThan(target);
    for (let i = 0; i < 120; i += 1) fly.update(1 / 60, held, false);
    expect(fly.velocity.length()).toBeCloseTo(flySpeed(fly.heightAboveGround(), false), 1);
    // Halted: the wish exactly, and nothing left the moment the key lifts.
    const halted = flyAt(40).fly;
    expect(halted.update(1 / 60, held, true)).toBe(true);
    expect(halted.velocity.length()).toBeCloseTo(target, 9);
    held.releaseAll();
    expect(halted.update(1 / 60, held, true)).toBe(false);
    expect(halted.velocity.length()).toBe(0);
  });

  it('asks for no frames at rest, with Shift alone held, or after a drag-look', () => {
    const { fly } = flyAt(40);
    const held = new HeldKeys();
    expect(fly.update(1 / 60, held, false)).toBe(false);
    held.press('ShiftLeft', 'boost');
    expect(fly.update(1 / 60, held, false)).toBe(false);
    fly.dragLook(30, 0);
    expect(fly.update(1 / 60, held, false)).toBe(false);
    expect(fly.look.yaw).toBeLessThan(0); // dragged right: turned right
  });

  it('turns at 90°/s, and the step buttons move half a second or turn 15°', () => {
    const { fly } = flyAt(40);
    const held = new HeldKeys();
    held.press('ArrowLeft', 'turn-left');
    for (let i = 0; i < 60; i += 1) fly.update(1 / 60, held, false);
    expect(fly.look.yaw).toBeCloseTo(Math.PI / 2, 6);
    fly.step('turn-right');
    expect(fly.look.yaw).toBeCloseTo(Math.PI / 2 - 15 * DEG, 9);
    const before = fly.position.clone();
    fly.step('forward');
    expect(fly.position.distanceTo(before)).toBeCloseTo(Math.min(20, flySpeed(40, false) * 0.5), 6);
  });
});

// The same rules on the estate's own outlines (whatever pack sits in public/estate/v1.2).
const root = fileURLToPath(new URL('..', import.meta.url));
const packDir = join(root, 'public', 'estate', 'v1.2');
const packFile = existsSync(packDir) ? readdirSync(packDir).find((f) => /^pack\.[0-9a-f]{8}\.json$/.test(f)) : undefined;

describe.skipIf(packFile === undefined)('picking on the pack in public/estate/v1.2', () => {
  const pack = packFile ? parsePack(JSON.parse(readFileSync(join(packDir, packFile), 'utf8'))) : null;
  const prisms = pack ? buildPrisms(pack.sites) : [];

  it('a ray down onto each building’s outline centre picks that building, and the target there frames it', () => {
    for (const [i, site] of (pack?.sites ?? []).entries()) {
      // A point inside the outline: the first vertex nudged towards the bounds' centre until it is inside.
      const [lo, hi] = site.bounds;
      const cx = (lo[0] + hi[0]) / 2;
      const cy = (lo[1] + hi[1]) / 2;
      let hit = false;
      for (let k = 0; k <= 20 && !hit; k += 1) {
        const v = site.footprint[k % site.footprint.length];
        const x = site.at[0] + v[0] + (cx - site.at[0] - v[0]) * 0.1;
        const y = site.at[1] + v[1] + (cy - site.at[1] - v[1]) * 0.1;
        const picked = pickPrism([x, y, 500], [0, 0, -1], prisms);
        if (picked?.index === i) {
          hit = true;
          expect(picked.t).toBeCloseTo(500 - site.roofTop, 6);
          expect(siteNear(x, y, prisms, 15)).toBe(i);
        }
      }
      expect(hit, ESTATE_SITE_IDS[i]).toBe(true);
    }
  });

  it('frames every building whole, roof included, clear of the HUD, at 4:3 and 16:9 (the fill once ran inverted)', () => {
    const poster = fallbackAerialPose();
    const from = orbitFromLookAt(poster.position, poster.target);
    // The HUD's top row covers about 50 px of a 531 px stage: 0.19 of NDC.
    const top = 1 - 0.19;
    for (const aspect of [4 / 3, 16 / 9]) {
      for (const site of pack?.sites ?? []) {
        const pose = frameBuilding(site.bounds, site.radius, site.roofTop, from, 45, aspect);
        const camera = new PerspectiveCamera(45, aspect, 1, 3000);
        camera.position.set(...positionFromOrbit(pose));
        camera.lookAt(...pose.target);
        camera.updateMatrixWorld();
        const [lo, hi] = site.bounds;
        for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
          const p = new Vector3(...estateToThree([x, y, z])).project(camera);
          const where = `${site.id} @ ${aspect.toFixed(2)} corner (${x}, ${y}, ${z})`;
          expect(Math.abs(p.x), where).toBeLessThanOrEqual(1);
          expect(p.y, where).toBeLessThanOrEqual(top);
          expect(p.y, where).toBeGreaterThanOrEqual(-1);
        }
      }
    }
  });

  it('frames every building inside Overview’s limits', () => {
    for (const site of pack?.sites ?? []) {
      const pose = frameBuilding(site.bounds, site.radius, site.roofTop, { target: [200, 0, -200], distance: 640, azimuth: Math.PI / 4, polar: 55 * DEG }, 45, 4 / 3);
      expect(pose.distance).toBeGreaterThanOrEqual(ORBIT_LIMITS.minDistance);
      expect(pose.distance).toBeLessThanOrEqual(ORBIT_LIMITS.maxDistance);
      expect(close(pose.azimuth, Math.PI / 4)).toBe(true);
    }
  });
});
