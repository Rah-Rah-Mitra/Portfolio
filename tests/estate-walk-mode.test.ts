import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { chipText } from '../lib/estate/announce';
import { decodeGround } from '../lib/estate/ground';
import { ESTATE_SITE_IDS, type EstateSiteId } from '../lib/estate/ids';
import { HeldKeys } from '../lib/estate/input';
import { parseNav, type EstateNav } from '../lib/estate/nav';
import { parsePack, type EstatePack } from '../lib/estate/schema';
import { decodeWalk, type WalkFile } from '../lib/estate/walk';
import type { EstateView, EstateWalkView } from '../components/workbench/estate/engineApi';
import type { EstateCore } from '../components/workbench/estate/engine/core';
import { InteriorSystem } from '../components/workbench/estate/engine/interior';
import {
  fadeAt, LIFT_FADE_MS, liftChip, noRouteReason, planRoute, rideCaption, stairChip, stairLabel, walkLevels,
} from '../components/workbench/estate/engine/lifts';
import type { ViewAccess } from '../components/workbench/estate/engine/navigation';
import {
  applyArc, ARC_RISE_MIN, arcDone, arcRise, endFromLook, endLookingAt, ENTER_SECONDS, planArc,
} from '../components/workbench/estate/engine/controls/arc';
import {
  WALK_ACCEL, WALK_BOOST_SPEED, WALK_SPEED, walkBandStorey, WalkController, type WalkWorld,
} from '../components/workbench/estate/engine/controls/walk';
import { WalkMode, type WalkSpawn } from '../components/workbench/estate/engine/controls/walkMode';

// Walk's session (engine/controls/walkMode.ts) on the real pack, against a
// stand-in render core (a real three camera, the real InteriorSystem with the
// pack's walk grids, nav files and ground; no WebGL): spawning, the location
// chip and view.walk, lift rides and their fade, Take stairs, the storey
// strip's routes (RF by lift and stair), Esc and interrupts, halted motion,
// PREPARING WALKWAY before a grid arrives. Plus the pure pieces: the Enter /
// Exit arc, the fade, the chip texts and routes, the walker's speeds.

const root = path.join(__dirname, '..');
const packDir = path.join(root, 'public', 'estate', 'v1.2');
const packFile = existsSync(packDir) ? readdirSync(packDir).find((f) => /^pack\.[0-9a-f]{8}\.json$/.test(f)) : undefined;
const hasWalk = packFile !== undefined && (() => {
  const json = JSON.parse(readFileSync(path.join(packDir, packFile), 'utf8')) as { classes: string[] };
  return ['w', 'nav', 'ground'].every((k) => json.classes.includes(k));
})();
const read = (rel: string) => gunzipSync(readFileSync(path.join(packDir, ...rel.split('/'))));
const SCHEDULER = { isResident: () => true, residentMask: () => 7, entryBlocked: () => false, seen: () => undefined };
const DEG = Math.PI / 180;

// ---- pure ----------------------------------------------------------------------------------

describe('the Enter and Exit arcs', () => {
  it('rise by max(20 m, half the height), and land exactly on their end', () => {
    expect(arcRise(10)).toBe(ARC_RISE_MIN);
    expect(arcRise(49)).toBe(24.5);
    expect(arcRise(Number.NaN)).toBe(ARC_RISE_MIN);
    const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 2000);
    const from = endLookingAt([300, 200, -100], [100, 0, -50], 45);
    const to = endFromLook([68.5, 1.6, -45.4], 0, 0, 60);
    const arc = planArc(from, to, 30, ENTER_SECONDS);
    applyArc(arc, 0, camera);
    expect(camera.position.toArray()).toEqual([300, 200, -100]);
    expect(camera.fov).toBe(45);
    applyArc(arc, ENTER_SECONDS / 2, camera);
    // Mid-flight: half way along the chord, plus the full rise.
    expect(camera.position.y).toBeCloseTo((200 + 1.6) / 2 + 30, 6);
    expect(camera.fov).toBeCloseTo(52.5, 6);
    expect(arcDone(arc, ENTER_SECONDS - 1e-6)).toBe(false);
    applyArc(arc, ENTER_SECONDS, camera);
    expect(arcDone(arc, ENTER_SECONDS)).toBe(true);
    expect(camera.position.distanceTo(new Vector3(68.5, 1.6, -45.4))).toBeLessThan(1e-9);
    expect(camera.fov).toBe(60);
    // Looking north (yaw 0): three −Z.
    expect(new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-9);
  });

  it('looks at its target the way camera.lookAt does', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(10, 20, 30);
    camera.lookAt(-5, 0, 2);
    const end = endLookingAt([10, 20, 30], [-5, 0, 2], 45);
    expect(end.quaternion.angleTo(camera.quaternion)).toBeLessThan(1e-9);
    expect(end.quaternion).toBeInstanceOf(Quaternion);
  });
});

describe('lift rides, chips and routes (pure)', () => {
  it('fades to paper over 250 ms, cuts, and fades back', () => {
    expect(fadeAt(0)).toEqual({ opacity: 0, cut: false, done: false });
    expect(fadeAt(LIFT_FADE_MS / 2).opacity).toBeCloseTo(0.5, 9);
    expect(fadeAt(LIFT_FADE_MS)).toEqual({ opacity: 1, cut: true, done: false });
    expect(fadeAt(1.5 * LIFT_FADE_MS).opacity).toBeCloseTo(0.5, 9);
    expect(fadeAt(2 * LIFT_FADE_MS)).toEqual({ opacity: 0, cut: true, done: true });
    // Halted motion is one cut: the caller passes Infinity.
    expect(fadeAt(Infinity)).toEqual({ opacity: 0, cut: true, done: true });
  });

  it('words the chips as the HUD draws them', () => {
    expect(liftChip({ name: 'Lift 2' })).toBe('LIFT 2 · CHOOSE A LEVEL');
    expect(rideCaption('LIFT 2', 'L5', 'L12')).toBe('LIFT 2 · L5 → L12');
    expect(stairLabel({ room: 'L5-STAIR2', name: 'L5 stair 2' })).toBe('STAIR 2');
    expect(stairLabel({ room: 'L1-HALL', name: 'Hall stair' })).toBe('HALL STAIR');
    expect(stairChip('STAIR 2', 'L6', 'L4')).toBe('STAIR 2 · ▲ L6 · ▼ L4');
    expect(stairChip('STAIR 2', null, 'L4')).toBe('STAIR 2 · ▼ L4');
    expect(noRouteReason('RF')).toBe('No lift or stair reaches RF');
  });

  it('centres the walk band one storey up once the eye stands a metre over the next floor', () => {
    const ffl = [0, 3.6, 6.4, 9.2];
    expect(walkBandStorey(ffl, 0, 0)).toBe(0);
    expect(walkBandStorey(ffl, 0, 2.99)).toBe(0);
    expect(walkBandStorey(ffl, 0, 3.01)).toBe(1); // eye 4.61 = L2 + 1.01
    expect(walkBandStorey(ffl, 0, 3.257)).toBe(1);
    expect(walkBandStorey(ffl, 3, 12)).toBe(3); // nothing above the top
    expect(walkBandStorey(ffl, -1, 0)).toBe(-1);
  });
});

describe('the walker’s speeds (no world)', () => {
  // A world of open ground: floorQuery says 'ground' at height 0 everywhere.
  const world: WalkWorld = {
    sites: [],
    extent: [0, 0, 400, 400],
    floorQuery: (_x, _y, _z, out) => { out.kind = 'ground'; out.z = 0; out.site = null; out.layer = -1; return out; },
    walk: () => null,
    ground: () => null,
    indexOf: () => -1,
  };
  const camera = new PerspectiveCamera(60, 1, 0.08, 600);

  it('walks at 1.6 m/s (4.0 with Shift), reaching it at ≤ 10 m/s², and coasts down when the key lets go', () => {
    const walker = new WalkController(world);
    walker.place(200, 200, 0, 0);
    const held = new HeldKeys();
    held.press('KeyW', 'forward');
    walker.update(1 / 60, held, false, camera);
    expect(Math.hypot(walker.vx, walker.vy)).toBeCloseTo(WALK_ACCEL / 60, 9);
    for (let i = 0; i < 60; i += 1) walker.update(1 / 60, held, false, camera);
    expect(walker.vy).toBeCloseTo(WALK_SPEED, 9);
    expect(walker.vx).toBeCloseTo(0, 9);
    held.press('ShiftLeft', 'boost');
    for (let i = 0; i < 60; i += 1) walker.update(1 / 60, held, false, camera);
    expect(walker.vy).toBeCloseTo(WALK_BOOST_SPEED, 9);
    held.releaseAll();
    const y0 = walker.y;
    for (let i = 0; i < 60; i += 1) walker.update(1 / 60, held, false, camera);
    expect(walker.vy).toBe(0);
    // Coasting from 4 m/s at 12/s covers about 4/12 m.
    expect(walker.y - y0).toBeGreaterThan(0.25);
    expect(walker.y - y0).toBeLessThan(0.4);
    // At rest it asks for no frames.
    expect(walker.update(1 / 60, held, false, camera)).toBe(false);
    // The eye at 1.6 m, looking north.
    expect(camera.position.y).toBeCloseTo(1.6, 9);
    expect(camera.position.z).toBeCloseTo(-walker.y, 9);
  });

  it('under halted motion moves exactly as asked and stops dead', () => {
    const walker = new WalkController(world);
    walker.place(200, 200, 0, 90 * DEG); // looking west
    const held = new HeldKeys();
    held.press('KeyW', 'forward');
    walker.update(1 / 60, held, true, camera);
    expect(walker.vx).toBeCloseTo(-WALK_SPEED, 9);
    held.releaseAll();
    walker.update(1 / 60, held, true, camera);
    expect(walker.vx).toBe(0);
    expect(walker.update(1 / 60, held, true, camera)).toBe(false);
  });

  it('turns at 90°/s on ←/→ and steps 0.5 m', () => {
    const walker = new WalkController(world);
    walker.place(200, 200, 0, 0);
    const held = new HeldKeys();
    held.press('ArrowLeft', 'turn-left');
    walker.update(0.5, held, false, camera);
    expect(walker.look.yaw).toBeCloseTo(45 * DEG, 9);
    held.releaseAll();
    walker.look.yaw = 0;
    expect(walker.stepBy(0.5, 0)).toBeCloseTo(0.5, 9);
    expect(walker.y).toBeCloseTo(200.5, 9);
  });
});

// ---- the session on the real pack -----------------------------------------------------------

describe.skipIf(!hasWalk)('Walk’s session on the pack in public/estate/v1.2', () => {
  let pack: EstatePack;
  const walks = new Map<number, WalkFile>();
  const navs = new Map<number, EstateNav>();
  let clock = 0;
  const index = (id: EstateSiteId) => ESTATE_SITE_IDS.indexOf(id);

  beforeAll(() => {
    pack = parsePack(JSON.parse(readFileSync(path.join(packDir, packFile!), 'utf8')));
    for (const id of ['BLK_509', 'MSCP_513', 'NC_514'] as const) {
      const i = index(id);
      const site = pack.sites[i];
      walks.set(i, decodeWalk(read(site.walk!.path), site.id));
      navs.set(i, parseNav(JSON.parse(read(site.nav!.path).toString('utf8')), site.id));
    }
  }, 60_000);

  beforeEach(() => {
    clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());

  interface Harness {
    mode: WalkMode;
    system: InteriorSystem;
    camera: PerspectiveCamera;
    view: () => EstateView;
    walkView: () => EstateWalkView;
    vias: string[];
    announced: string[];
    fade: () => { display: string; opacity: string } | null;
    setHalted: (on: boolean) => void;
    held: HeldKeys;
    /** Frames at 60 Hz, advancing the clock. Returns whether the last one moved. */
    frames: (n: number) => boolean;
  }

  const harness = (options: { walks?: boolean } = {}): Harness => {
    const system = new InteriorSystem(pack, SCHEDULER);
    if (options.walks !== false) for (const [i, w] of walks) system.addWalk(i, w);
    for (const [i, n] of navs) system.addNav(i, n);
    system.addGround(decodeGround(read(pack.site!.ground!.path)));
    const camera = new PerspectiveCamera(60, 4 / 3, 0.08, 600);
    let halted = false;
    let fadeEl: { style: Record<string, string>; dataset: Record<string, string> } | null = null;
    const host = {
      ownerDocument: {
        createElement: () => {
          fadeEl = { style: {}, dataset: {}, setAttribute: () => undefined, remove: () => undefined } as never;
          return fadeEl;
        },
      },
      appendChild: () => undefined,
    } as unknown as HTMLElement;
    const core = {
      options: { motionHalted: () => halted, host },
      pack,
      interiors: system,
      camera,
      invalidate: vi.fn(),
      setFocus: vi.fn(),
    } as unknown as EstateCore;
    let view = {
      location: { site: null, storey: null, unit: null, room: null, mode: 'walk' },
      selection: null, transition: null, flight: false, popover: null, popoverOpen: false,
      moving: false, pointerLocked: false, pointerUnlockedAtMs: null, lean: false, walk: null,
    } as EstateView;
    const vias: string[] = [];
    const announced: string[] = [];
    const access: ViewAccess = {
      get: () => view,
      set: (patch, via) => {
        const location = patch.location ? { ...view.location, ...patch.location } : view.location;
        const popover = patch.popover !== undefined ? patch.popover : view.popover;
        view = { ...view, ...patch, location, popover, popoverOpen: popover !== null } as EstateView;
        if (via) vias.push(via);
        return true;
      },
      announce: (_full, text) => { if (text) announced.push(text); },
    };
    const mode = new WalkMode(core, access, host);
    const held = new HeldKeys();
    return {
      mode, system, camera, held, vias, announced,
      view: () => view,
      walkView: () => view.walk!,
      fade: () => (fadeEl ? { display: fadeEl.style.display, opacity: fadeEl.style.opacity } : null),
      setHalted: (on) => { halted = on; },
      frames: (n) => {
        let moving = false;
        for (let k = 0; k < n; k += 1) {
          clock += 1000 / 60;
          moving = mode.update(1 / 60, held, halted);
        }
        return moving;
      },
    };
  };

  /** A spawn from block-local (x, y) on a site, facing a three yaw. */
  const local = (id: EstateSiteId, x: number, y: number, z: number, yaw = 0): WalkSpawn => {
    const at = pack.sites[index(id)].at;
    return { x: at[0] + x, y: at[1] + y, z, yaw, name: 'test' };
  };
  /** 1 m out from a lift's landing on a storey: inside its 1.5 m reach. */
  const nearLift = (id: EstateSiteId, lift: string, tag: string): WalkSpawn => {
    const nav = navs.get(index(id))!;
    const landing = nav.lifts.find((l) => l.name === lift)!.landings[tag as 'L1']!;
    const ffl = nav.storeys.find((s) => s.tag === tag)!.ffl;
    return local(id, landing.xy[0] + landing.facing[0], landing.xy[1] + landing.facing[1], ffl);
  };

  it('starts on the building’s grid at a void-deck entrance and names it on the chip', () => {
    const h = harness();
    const spawn = pack.sites[index('BLK_509')].spawns[0];
    h.mode.start({ x: spawn.pos[0], y: spawn.pos[1], z: spawn.pos[2], yaw: 0, name: spawn.name });
    expect(h.mode.walker.site).toBe(index('BLK_509'));
    expect(h.walkView()).toMatchObject({ site: 'BLK_509', storey: 'L1', preparing: false, ride: null });
    expect(chipText(h.view().location)).toMatch(/^BLK 509 · L1( · .*)? · WALK$/);
    // The strip: every storey, here on L1; L2 … L16 by lift; RF by lift and then the stair.
    const levels = h.walkView().levels;
    expect(levels.map((l) => l.tag)).toEqual(pack.sites[index('BLK_509')].storeys.map((s) => s.tag));
    expect(levels[0]).toMatchObject({ tag: 'L1', route: 'here', reason: null });
    expect(levels.find((l) => l.tag === 'L12')!.route).toBe('lift');
    expect(levels.find((l) => l.tag === 'RF')).toMatchObject({ route: 'lift+stairs', reason: null });
  });

  it('offers a lift within 1.5 m of its landing and rides it with a 250 ms fade: 0 downloads, the arrival announced', () => {
    const h = harness();
    h.mode.start(nearLift('BLK_509', 'Lift 3', 'L5'));
    expect(h.walkView().lift).toMatchObject({ name: 'Lift 3', text: 'LIFT 3 · CHOOSE A LEVEL', current: 'L5' });
    expect(h.walkView().lift!.served).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'L16']);
    // Enter at a landing opens the level panel (the controls set popover 'lift'; the HUD moves focus into it).
    expect(h.mode.activate()).toBe('lift');
    expect(h.mode.busy).toBe(false);
    expect(h.mode.takeLift('L5')).toBe(false); // the current storey
    expect(h.mode.takeLift('RF')).toBe(false); // not served
    expect(h.mode.takeLift('L12')).toBe(true);
    expect(h.view().transition).toBe('fade');
    expect(h.walkView().ride).toBe('LIFT 3 · L5 → L12');
    h.frames(8); // ~133 ms: paper rising, not yet cut
    expect(Number(h.fade()!.opacity)).toBeGreaterThan(0.4);
    expect(h.walkView().storey).toBe('L5');
    h.frames(10); // past 250 ms: cut, paper falling
    expect(h.walkView().storey).toBe('L12');
    expect(h.vias).toContain('Lift 3');
    h.frames(20);
    expect(h.view().transition).toBeNull();
    expect(h.fade()!.display).toBe('none');
    expect(h.walkView().ride).toBeNull();
    // 1.2 m out of the car, facing out, on L12's floor.
    const nav = navs.get(index('BLK_509'))!;
    const landing = nav.lifts.find((l) => l.name === 'Lift 3')!.landings.L12!;
    const at = pack.sites[index('BLK_509')].at;
    const w = h.mode.walker;
    expect(Math.hypot(w.x - at[0] - (landing.xy[0] + landing.facing[0] * 1.2), w.y - at[1] - (landing.xy[1] + landing.facing[1] * 1.2))).toBeLessThan(0.5);
    expect(w.z).toBeCloseTo(31.6, 3);
    expect(h.walkView().lift?.current).toBe('L12');
  });

  it('rides as one cut, with no paper, while motion is halted', () => {
    const h = harness();
    h.setHalted(true);
    h.mode.start(nearLift('BLK_509', 'Lift 1', 'L1'));
    expect(h.mode.takeLift('L7')).toBe(true);
    h.frames(1);
    expect(h.walkView().storey).toBe('L7');
    expect(h.view().transition).toBeNull();
    expect(h.fade()).toBeNull(); // the paper layer was never even made
  });

  it('routes RF from L5 by lift to L16, then the stair path, and the strip says why a level has no route', () => {
    const h = harness();
    h.mode.start(nearLift('BLK_509', 'Lift 3', 'L5'));
    const nav = navs.get(index('BLK_509'))!;
    const route = planRoute(nav, 4, nav.storeys.length - 1)!;
    expect(route.summary).toBe('lift+stairs');
    expect(route.legs).toEqual([{ kind: 'lift', from: 4, to: 15 }, { kind: 'stairs', from: 15, to: 16 }]);
    expect(h.mode.setStorey('RF')).toBe(true);
    expect(h.walkView().ride).toBe('LIFT 3 · L5 → L16');
    h.frames(40); // the ride
    expect(h.view().transition).toBe('climb');
    expect(h.walkView().storey).toBe('L16');
    h.frames(60 * 12); // the climb, 2.0 m/s along the line
    expect(h.view().transition).toBeNull();
    expect(h.walkView().storey).toBe('RF');
    expect(h.mode.walker.z).toBeCloseTo(45.6, 2);
    // NC_514: one lift L1–L2 and two stairs to L2; nothing reaches its roof.
    const nc = navs.get(index('NC_514'))!;
    const levels = walkLevels(nc, 0);
    expect(levels.map((l) => [l.tag, l.route, l.reason])).toEqual([
      ['L1', 'here', null], ['L2', 'lift', null], ['RF', null, 'No lift or stair reaches RF'],
    ]);
    const n = harness();
    n.mode.start(nearLift('NC_514', 'Lift 1', 'L1'));
    expect(n.mode.setStorey('RF')).toBe(false);
    expect(n.announced).toEqual(['No lift or stair reaches RF']);
  });

  it('offers the stair core at its landing and climbs it storey by storey while PgUp is held', () => {
    const h = harness();
    const nav = navs.get(index('BLK_509'))!;
    const stair = nav.stairs.find((s) => s.name === 'L5 stair 2')!;
    const [x, y, z] = stair.path[0];
    h.mode.start(local('BLK_509', x, y, z, 0));
    expect(h.walkView().stair).toMatchObject({ label: 'STAIR 2', up: 'L6', down: 'L4', text: 'STAIR 2 · ▲ L6 · ▼ L4' });
    h.held.press('PageUp', 'storey-up');
    expect(h.mode.storeyKey(1)).toBe(true);
    expect(h.view().transition).toBe('climb');
    const seconds = { start: clock };
    h.frames(60 * 6);
    // Still held after a storey (~4.5 s): on up the next flight of the same core.
    expect(h.view().transition).toBe('climb');
    expect(h.walkView().storey).toBe('L6');
    h.held.releaseAll();
    h.mode.storeyKeyUp();
    h.frames(60 * 6);
    // Let go: it finished the storey in hand and stopped there.
    expect(h.view().transition).toBeNull();
    expect(h.walkView().storey).toBe('L7');
    h.frames(60 * 6);
    expect(h.walkView().storey).toBe('L7');
    expect(h.mode.walker.z).toBeCloseTo(17.6, 2);
    expect(clock - seconds.start).toBeGreaterThan(8000);
  });

  it('lands a climb at its nearer end on Esc, and stops it where it is on a movement key', () => {
    const h = harness();
    const nav = navs.get(index('BLK_509'))!;
    const stair = nav.stairs.find((s) => s.name === 'L5 stair 2')!;
    const [x, y, z] = stair.path[0];
    h.mode.start(local('BLK_509', x, y, z, 0));
    expect(h.mode.takeStairs(1)).toBe(true);
    h.frames(30); // half a second: near the bottom
    expect(h.mode.cancelTransition()).toBe(true);
    expect(h.view().transition).toBeNull();
    expect(h.walkView().storey).toBe('L5');
    expect(h.mode.walker.z).toBeCloseTo(12, 2);
    // Again, interrupted mid-flight: it stays on the flight, on a tread.
    expect(h.mode.takeStairs(1)).toBe(true);
    h.frames(60 * 2);
    h.mode.interrupt();
    expect(h.view().transition).toBeNull();
    expect(h.mode.walker.z).toBeGreaterThan(12.1);
    expect(h.mode.walker.z).toBeLessThan(14.8);
  });

  it('cuts a climb to its end while motion is halted', () => {
    const h = harness();
    h.setHalted(true);
    const nav = navs.get(index('BLK_509'))!;
    const stair = nav.stairs.find((s) => s.name === 'L5 stair 2')!;
    const [x, y, z] = stair.path[0];
    h.mode.start(local('BLK_509', x, y, z, 0));
    expect(h.mode.takeStairs(1)).toBe(true);
    h.frames(1);
    expect(h.view().transition).toBeNull();
    expect(h.walkView().storey).toBe('L6');
  });

  it('Enter at a stair landing takes the offered way up; in a flat beside the core nothing is offered and Enter does nothing (the P5 review)', () => {
    const h = harness();
    h.setHalted(true);
    const nav = navs.get(index('BLK_509'))!;
    const stair = nav.stairs.find((s) => s.name === 'L5 stair 2')!;
    const [x, y, z] = stair.path[0];
    h.mode.start(local('BLK_509', x, y, z, 0));
    expect(h.mode.activate()).toBe(true);
    h.frames(1);
    expect(h.walkView().storey).toBe('L6');
    // #05-110 Bedroom 2, through the wall from stair 5: 1.5 m from its flight, 16 m away on foot.
    h.mode.start({ x: 164.88, y: 51.35, z: 12, yaw: 0, name: 'bedroom' });
    expect(h.walkView()).toMatchObject({ storey: 'L5', stair: null });
    expect(h.mode.activate()).toBe(false);
    expect(h.mode.takeStairs(1)).toBe(false);
    expect(h.mode.storeyKey(1)).toBe(false);
    expect(h.mode.setStorey(1)).toBe(true); // the strip's neighbour: a route (a lift ride), never a glide through the wall
    expect(h.walkView().ride).toMatch(/^LIFT \d · L5 → L6$/);
  });

  it('holds the walker on the ground with PREPARING WALKWAY until the grid arrives, then walks it in', () => {
    const h = harness({ walks: false });
    const spawn = pack.sites[index('BLK_509')].spawns[0];
    h.mode.start({ x: spawn.pos[0], y: spawn.pos[1], z: spawn.pos[2], yaw: 0, name: spawn.name });
    expect(h.mode.walker.site).toBe(-1);
    expect(h.walkView().preparing).toBe(true);
    // North, into the void deck: the footprint blocks.
    const y0 = h.mode.walker.y;
    h.held.press('KeyW', 'forward');
    h.frames(120);
    h.held.releaseAll();
    h.frames(30);
    expect(h.mode.walker.y - y0).toBeLessThan(1.6);
    expect(h.walkView().preparing).toBe(true);
    // The grid arrives (streaming decodes it and wakes a frame): the walker is on it.
    const i = index('BLK_509');
    h.system.addWalk(i, walks.get(i)!);
    h.frames(2);
    expect(h.mode.walker.site).toBe(i);
    expect(h.walkView().preparing).toBe(false);
    h.held.press('KeyW', 'forward');
    h.frames(120);
    expect(h.mode.walker.y - y0).toBeGreaterThan(2);
  });

  it('keeps a building whose entry failed shut: its grid takes nobody on, its footprint blocks, no PREPARING', () => {
    const h = harness();
    const i = index('BLK_509');
    // The interior failed for good (streaming's entryBlocked): walk-in is off (§7.5).
    h.system.markFailed(i, 'aborted');
    const spawn = pack.sites[i].spawns[0];
    h.mode.start({ x: spawn.pos[0], y: spawn.pos[1], z: spawn.pos[2], yaw: 0, name: spawn.name });
    expect(h.mode.walker.site).toBe(-1);
    expect(h.walkView().preparing).toBe(false);
    const y0 = h.mode.walker.y;
    h.held.press('KeyW', 'forward');
    h.frames(120);
    expect(h.mode.walker.site).toBe(-1);
    expect(h.mode.walker.y - y0).toBeLessThan(1.6);
  });

  it('walks up the car park’s ramp storey by storey and names lots on the chip', () => {
    const h = harness();
    const spawn = pack.sites[index('MSCP_513')].spawns[0];
    h.mode.start({ x: spawn.pos[0], y: spawn.pos[1], z: spawn.pos[2], yaw: 90 * DEG, name: spawn.name });
    expect(h.walkView()).toMatchObject({ site: 'MSCP_513', storey: 'L1' });
    // The lifts serve every deck and the roof garden.
    const levels = h.walkView().levels;
    expect(levels.filter((l) => l.route === 'lift').map((l) => l.tag)).toEqual(['L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'RF']);
  });
});
