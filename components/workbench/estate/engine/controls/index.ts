import { Box3, Vector3 } from 'three';
import { threeToEstate, wrapAngle, type EstateViewMode, type Vec3 } from '../../../../../lib/estate/frames';
import { ESTATE_SITE_IDS, normaliseStoreyTag, type EstateSiteId, type EstateStoreyTag } from '../../../../../lib/estate/ids';
import { cancelsClimb, dragRole, HeldKeys, stageKey, type EscapeAction, type StageAction } from '../../../../../lib/estate/input';
import { ESTATE_VFOV_DEG } from '../../../../../lib/estate/lod';
import type { PackSpawn } from '../../../../../lib/estate/schema';
import { EYE_HEIGHT } from '../../../../../lib/estate/storeys';
import type {
  EstateEngineFeatures, EstateEnterOptions, EstateFlyOptions, EstateResume, EstateStep, EstateWalkStep,
} from '../../engineApi';
import type { FloorQuery, InteriorEntry } from '../interior';
import type { EstateCore } from '../core';
import type { EngineNavigation, NavigationFactory, ViewAccess } from '../navigation';
import type { CameraRig } from '../rig';
import { applyArc, arcDone, arcRise, endFromCamera, endFromLook, endLookingAt, ENTER_SECONDS, EXIT_SECONDS, planArc, type Arc } from './arc';
import { FlyController, type Bounds2 } from './firstPerson';
import { northRotation, wheelSteps } from './motion';
import { OrbitController } from './orbit';
import { buildPrisms, ClickTracker, pickPrism, siteAround, siteNear, type Prism } from './picking';
import {
  blankPose, clampOrbit, FLY_TO_SECONDS, flightDone, flightPose, FOV_SECONDS, frameBuilding, HOME_SECONDS, ORBIT_LIMITS,
  orbitFromLookAt, planFlight, positionFromOrbit, type Flight, type OrbitPose,
} from './tween';
import { WalkMode, type WalkSpawn } from './walkMode';

// The Estate viewer's controls (plan §8.1–§8.5, §8.7): what moves the camera
// on request, plugged into the render core as its one CameraRig. Overview
// (camera-controls), Fly (our own first-person controller), fly-to, Home and
// picking (P4b); Walk, Enter and Exit, stairs and lifts (P5: walk.ts is the
// walker, walkMode.ts its session with climbs, rides and the HUD's offers,
// arc.ts the Enter / Exit arcs, ../lifts.ts the stair and lift rules), all
// under the same rig, input layer and tween clock; P6 adds Plan.
// engine/index.ts owns the handle and the view; this module answers the
// navigation commands and reports through ViewAccess.
//
// Walk's ways in (§8.1): Enter arcs 1.2 s to the building's nearest entrance
// spawn (rising max(20 m, half its height), 45° → 60°, its files at P0 from
// the start); 2 from Overview cuts to the entrance spawn nearest the orbit
// target; 2 from Fly drops to the floor under the camera when it is within a
// few metres of one, else the nearest entrance spawn; walkFrom('BS1') starts at
// the bus stop. Out: Esc or 1 is the 1.0 s reverse arc to an overview of the
// building (or of the walker's surroundings), 3 keeps the pose in Fly.
//
// Input, all on the engine's own elements and only once the first frame is up:
//  - keys (scope 1, lib/estate/input.ts stageKey) on the stage, and only when
//    event.target IS the stage, so a focused HUD or registry button keeps its
//    native Enter and Space; every handled key is preventDefault'ed; held keys
//    are released on stage blur, window blur and visibilitychange. Esc is not
//    here: the shell's section listener decides it (scope 2) and calls
//    engine.escape();
//  - pointers on the canvas: camera-controls' drags in Overview; drag-to-look
//    and strafe with pointer capture in Fly; clicks and taps select, doubles fly
//    to. A press on a HUD chip never reaches the canvas;
//  - the wheel on the stage, non-passive, always preventDefault'ed (a pinch is
//    Ctrl+wheel and would zoom the page): dolly to the cursor in Overview, speed
//    in Fly;
//  - pointer lock only on request (L, CAPTURE) in Fly, never on a click.
//
// Transitions run on wall-clock time and under motionHalted() are cuts: a fly-to
// lands on the frame it was asked for, a mode switch's FOV change is immediate,
// and camera-controls has no smoothing. Movement the visitor drives still draws.
// At rest the rig reports nothing moving and the frame loop sleeps.

/** What this build adds to the core's (all-false) features. */
export const CONTROLS_FEATURES: Readonly<Partial<EstateEngineFeatures>> = Object.freeze({
  overview: true, fly: true, flyTo: true, walk: true, enter: true,
});

/** The location chip's building is refreshed at most this often while the camera moves, ms. */
export const SITE_CHECK_MS = 250;
/** Overview frames a building only from this close (eye to target), m: from farther out the view is the estate. */
export const FRAME_REACH = 350;
/** …and only when the orbit target lies within this of the building's outline, m. */
export const FRAME_MARGIN = 15;
/** Fly names the building it is beside: within this of its outline and roof, m… */
export const FLY_SITE_MARGIN = 20;
/** …or else the one in the middle of the view, if it is no farther than this, m. */
export const FLY_FRAME_REACH = 250;
/**
 * The host's custom property a newly mounted north arrow starts from. Written
 * only when the camera comes to rest: a custom property inherits, so writing it
 * per frame restyled, laid out and repainted the whole stage subtree on every
 * frame of an orbit (3.4 ms a frame, measured). During motion the arrow's own
 * dial ([data-estate-north], an HTML layer: an SVG root's transform is resolved
 * in layout) is turned directly, a composited transform.
 */
export const NORTH_PROPERTY = '--estate-north';
const NORTH_EPSILON = (0.5 * Math.PI) / 180;
/** The arrow the HUD draws; found by DOM scan, never by ref. */
const NORTH_SELECTOR = '[data-estate-north]';
/** A flight's landing names its building while the orbit target stays within this of where it landed, m. */
const LANDED_REACH = 1;
/** Fly → Overview orbits about the ground this far ahead at least, and never farther than this. */
const AHEAD_MIN = 30;
const AHEAD_MAX = 600;
const LEVEL_TILT = Math.tan((10 * Math.PI) / 180);

type ControlMode = 'overview' | 'fly' | 'walk';

/** Fly → Walk lands under the camera when a floor is within this below the feet, m; higher, at the nearest entrance. */
export const DROP_REACH = 3;
/** An exit arc from the open estate lands on an orbit this far from the walker, m, this far from straight down. */
const EXIT_DISTANCE = 90;
const EXIT_POLAR = (55 * Math.PI) / 180;
/** A storey other than this needs a lift after Enter's arc. */
const GROUND_STOREY: EstateStoreyTag = 'L1';

interface ActiveArc {
  arc: Arc;
  startMs: number;
  kind: 'enter' | 'exit';
  /** Index of the building it enters or leaves, or −1. */
  site: number;
  /** enter: where the walk starts, and a storey to ride to then. */
  spawn: WalkSpawn | null;
  storey: EstateStoreyTag | null;
  /** exit: the orbit pose it lands on. */
  orbit: OrbitPose | null;
}

interface ActiveFlight {
  flight: Flight;
  startMs: number;
  /** Index of the building it frames, or −1 (Home). */
  site: number;
}

interface FovTween { from: number; to: number; startMs: number }

interface Drag { id: number; role: 'look' | 'strafe'; x: number; y: number }

/** A pack spawn (estate frame, facing a unit plan direction) as where a walk starts: the three yaw that looks along its facing. */
const spawnOf = (s: PackSpawn): WalkSpawn => ({
  x: s.pos[0], y: s.pos[1], z: s.pos[2], yaw: Math.atan2(-s.facing[0], s.facing[1]), name: s.name,
});

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const isMac = (): boolean => /Mac/.test(globalThis.navigator?.platform ?? '');

class EstateControls implements EngineNavigation {
  readonly features = CONTROLS_FEATURES;
  private readonly core: EstateCore;
  private readonly view: ViewAccess;
  private readonly held = new HeldKeys();
  private readonly clicks = new ClickTracker();
  private host: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private orbit: OrbitController | null = null;
  private fly: FlyController | null = null;
  /** Walk's session; null before the first frame or with no interiors (a harness without a pack). */
  private walk: WalkMode | null = null;
  private arc: ActiveArc | null = null;
  private prisms: Prism[] = [];
  private mode: ControlMode = 'overview';
  private flight: ActiveFlight | null = null;
  private fovTween: FovTween | null = null;
  private overviewFov: number = ESTATE_VFOV_DEG.overview;
  private boundary = new Box3();
  private drag: Drag | null = null;
  /** Walk's wheel: notches not yet stepped. */
  private wheelAcc = 0;
  private unbind: Array<() => void> = [];
  private isReady = false;
  private disposed = false;
  private lastSiteCheck = -Infinity;
  private siteDirty = false;
  private northDial: HTMLElement | null = null;
  private northDrawn = Number.NaN;
  private northRested = Number.NaN;
  /** Where the last flight to a building landed (three world target) and which building: siteFor() names it there. */
  private landed: { site: number; x: number; y: number; z: number } | null = null;
  private readonly fromPose: OrbitPose = blankPose();
  private readonly toPose: OrbitPose = blankPose();
  private readonly stepPose: OrbitPose = blankPose();
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly e1: Vec3 = [0, 0, 0];
  private readonly e2: Vec3 = [0, 0, 0];
  private readonly exitPose: OrbitPose = blankPose();
  private readonly query: FloorQuery = { kind: 'none', z: Number.NaN, site: null, layer: -1 };
  private readonly entry: InteriorEntry = { state: 'absent', reason: null };
  private readonly walkTarget = { x: 0, y: 0, z: 0 };

  /** The CameraRig the core draws through: whichever controller is active, plus the transitions. */
  readonly rig: CameraRig;

  constructor(core: EstateCore, view: ViewAccess) {
    this.core = core;
    this.view = view;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.rig = {
      // An Enter or Exit arc clips, fogs and selects detail as Fly does (a 60° eye in the open).
      get mode(): EstateViewMode { return self.arc ? 'fly' : self.mode; },
      get busy(): boolean { return self.flight !== null || self.fovTween !== null || self.arc !== null || (self.walk?.busy ?? false); },
      update: (dt) => self.update(dt),
      getTarget: (out) => self.getTarget(out),
      dispose: () => self.dispose(),
    };
  }

  // ---- lifecycle ----------------------------------------------------------------------------

  /** The first live frame is drawn: take the camera over from the poster pose, and listen. */
  ready(): void {
    if (this.isReady || this.disposed) return;
    const core = this.core;
    const pack = core.pack;
    const host = core.options.host;
    const canvas = host.querySelector<HTMLCanvasElement>('canvas[data-estate-canvas]');
    if (!pack || !canvas) return; // the core keeps drawing from its static pose
    this.host = host;
    this.canvas = canvas;
    this.prisms = buildPrisms(pack.sites);

    const [ex0, ey0, ex1, ey1] = pack.estate.extent;
    const m = ORBIT_LIMITS.targetMargin;
    const roof = pack.sites.reduce((top, site) => Math.max(top, site.roofTop), 0);
    // Estate (x, y) is three (x, −y): the box's z runs from −(north edge) to −(south edge).
    this.boundary = new Box3(new Vector3(ex0 - m, 0, -(ey1 + m)), new Vector3(ex1 + m, roof + m, -(ey0 - m)));
    const roam: Bounds2 = { minX: ex0, maxX: ex1, minZ: -ey1, maxZ: -ey0 };

    const camera = core.camera;
    this.overviewFov = core.posterPose()?.fovDeg ?? ESTATE_VFOV_DEG.overview;
    const target = core.staticRig.getTarget(this.v1);
    const orbit = new OrbitController(camera, canvas, {
      boundary: this.boundary,
      onControl: () => core.invalidate(),
      onControlStart: () => this.cancelFlightHere(),
    });
    orbit.setPose(camera.position.toArray(this.e1), target.toArray(this.e2));
    this.orbit = orbit;
    this.fly = new FlyController(camera, { bounds: roam, groundAt: (x, z) => this.groundY(x, z) });
    if (core.interiors) this.walk = new WalkMode(core, this.view, host);
    const resume = core.options.resume;
    if (resume?.mode === 'fly') {
      orbit.enabled = false;
      this.fly.activate();
      this.mode = 'fly';
    } else if (resume?.mode === 'walk' && this.walk) {
      // Back where the last instance walked: feet under the eye, held for the
      // building's grid when it stood inside one (resume.inside).
      orbit.enabled = false;
      this.mode = 'walk';
      const p = resume.position;
      const yaw = Math.atan2(-(resume.target[0] - p[0]), resume.target[1] - p[1]);
      const inside = resume.inside ? this.core.interiors?.indexOf(resume.inside.site) ?? -1 : -1;
      this.applyFov(ESTATE_VFOV_DEG.walk);
      this.walk.startAt(p[0], p[1], p[2] - EYE_HEIGHT, yaw, 0, inside);
    } else {
      // Overview keeps the lens it went live with (the poster's, or a resumed 45°).
      this.overviewFov = camera.fov;
    }
    this.bind(host, canvas);
    this.isReady = true;
    core.setRig(this.rig);
    if (this.mode !== 'walk') this.view.set({ location: { mode: this.mode, site: this.siteId(this.siteFor()) } });
  }

  freeze(): void {
    this.releaseKeys();
    this.endDrag();
    this.clicks.cancel();
    if (this.flight) this.finishFlight();
    if (this.arc) this.landArc();
    if (this.fovTween) this.finishFov();
    this.walk?.freeze();
    this.orbit?.cancel();
    this.orbit?.settle();
    this.fly?.stop();
    this.exitLock();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.unbind.splice(0)) {
      try { off(); } catch { /* the element may already be gone */ }
    }
    this.exitLock();
    this.orbit?.dispose();
    this.orbit = null;
    this.fly = null;
    this.walk?.dispose();
    this.walk = null;
    this.host?.style.removeProperty(NORTH_PROPERTY);
    this.host = null;
    this.canvas = null;
    this.isReady = false;
  }

  private get live(): boolean {
    return this.isReady && !this.disposed && this.core.isReady && !this.core.isFrozen && !this.core.isDisposed;
  }

  // ---- the rig ------------------------------------------------------------------------------

  private update(dt: number): boolean {
    if (!this.isReady) return false;
    const halted = this.core.options.motionHalted();
    const t = now();
    let moving = false;
    if (this.fovTween) {
      this.stepFov(t, halted);
      moving = true;
    }
    if (this.arc) {
      const active = this.arc;
      const elapsed = halted ? Infinity : (t - active.startMs) / 1000;
      applyArc(active.arc, elapsed, this.core.camera);
      if (arcDone(active.arc, elapsed)) this.landArc();
      moving = true;
    } else if (this.mode === 'walk' && this.walk) {
      if (this.walk.update(dt, this.held, halted)) moving = true;
    } else if (this.mode === 'overview' && this.orbit) {
      if (this.flight) {
        const { flight, startMs } = this.flight;
        const elapsed = halted ? Infinity : (t - startMs) / 1000;
        this.orbit.setOrbit(flightPose(flight, elapsed, ORBIT_LIMITS, this.stepPose));
        if (flightDone(flight, elapsed)) this.landFlight();
        moving = true;
      }
      if (this.orbit.update(dt, this.held, halted)) moving = true;
    } else if (this.mode === 'fly' && this.fly) {
      if (this.fly.update(dt, this.held, halted)) moving = true;
    }
    this.writeNorth(moving);
    this.trackSite(moving, t);
    return moving;
  }

  private getTarget(out: Vector3): Vector3 {
    if (this.arc) {
      const p = this.core.camera.position;
      return out.set(0, 0, -10).applyQuaternion(this.core.camera.quaternion).add(p);
    }
    if (this.mode === 'walk' && this.walk?.active) {
      const t = this.walkTarget;
      this.walk.target(t);
      return out.set(t.x, t.z, -t.y);
    }
    if (this.mode === 'fly' && this.fly) return this.fly.getTarget(out);
    if (this.orbit) return this.orbit.getTarget(out);
    return this.core.staticRig.getTarget(out);
  }

  /**
   * The north arrow: its own dial turned directly whenever the heading moves by
   * more than half a degree (a single composited element, no restyle of the
   * stage), and the host's NORTH_PROPERTY once the camera rests, so an arrow
   * the HUD mounts later starts at the right angle.
   */
  private writeNorth(moving: boolean) {
    const host = this.host;
    if (!host) return;
    const camera = this.core.camera;
    const f = camera.getWorldDirection(this.v1);
    const u = this.v2.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const turn = northRotation(f.x, f.z, u.x, u.z);
    if (turn === null) return;
    let dial = this.northDial;
    if (dial === null || !dial.isConnected) {
      dial = host.querySelector<HTMLElement>(NORTH_SELECTOR);
      this.northDial = dial;
      this.northDrawn = Number.NaN;
    }
    const moved = (last: number) => Number.isNaN(last) || Math.abs(wrapAngle(turn - last)) >= NORTH_EPSILON;
    if (dial && moved(this.northDrawn)) {
      this.northDrawn = turn;
      dial.style.transform = `rotate(${turn.toFixed(4)}rad)`;
    }
    if (!moving && moved(this.northRested)) {
      this.northRested = turn;
      host.style.setProperty(NORTH_PROPERTY, `${turn.toFixed(4)}rad`);
    }
  }

  // ---- where the camera is ------------------------------------------------------------------

  private siteId(index: number): EstateSiteId | null {
    return index >= 0 ? ESTATE_SITE_IDS[index] : null;
  }

  /**
   * The building the camera frames or is at, or −1. Overview: the one under
   * the orbit target, seen from close enough. Fly: the one beside the camera,
   * else the one in the middle of the view, near enough.
   */
  private siteFor(): number {
    const camera = this.core.camera;
    if (this.mode === 'fly') {
      const p = threeToEstate(camera.position.toArray(this.e1), this.e1);
      const beside = siteAround(p[0], p[1], p[2], this.prisms, FLY_SITE_MARGIN);
      if (beside >= 0) return beside;
      const d = threeToEstate(camera.getWorldDirection(this.v1).toArray(this.e2), this.e2);
      const hit = pickPrism(p, d, this.prisms);
      return hit !== null && hit.t <= FLY_FRAME_REACH ? hit.index : -1;
    }
    if (!this.orbit) return -1;
    const target = this.orbit.getTarget(this.v1);
    // Still resting where a flight to a building landed: that building, even
    // when the framing's target (its box's middle) lies off its outline, as an
    // L-block's does in its courtyard.
    const landed = this.landed;
    if (landed) {
      if (Math.hypot(target.x - landed.x, target.y - landed.y, target.z - landed.z) <= LANDED_REACH) return landed.site;
      this.landed = null;
    }
    if (camera.position.distanceTo(target) > FRAME_REACH) return -1;
    return siteNear(target.x, -target.z, this.prisms, FRAME_MARGIN);
  }

  /** Refresh the chip's building: every SITE_CHECK_MS while moving, and once on coming to rest. Not mid-flight. */
  private trackSite(moving: boolean, t: number) {
    // Walk names its own place (walkMode.ts publish); an arc lands with one.
    if (this.flight || this.arc || this.mode === 'walk') return;
    if (moving) {
      this.siteDirty = true;
      if (t - this.lastSiteCheck < SITE_CHECK_MS) return;
    } else if (!this.siteDirty) {
      return;
    }
    this.lastSiteCheck = t;
    if (!moving) this.siteDirty = false;
    this.view.set({ location: { site: this.siteId(this.siteFor()) } });
  }

  // ---- transitions -------------------------------------------------------------------------

  private fovTo(fov: number, halted: boolean) {
    const camera = this.core.camera;
    if (halted || Math.abs(camera.fov - fov) < 0.01) {
      this.fovTween = null;
      this.applyFov(fov);
      return;
    }
    this.fovTween = { from: camera.fov, to: fov, startMs: now() };
  }

  private stepFov(t: number, halted: boolean) {
    const tween = this.fovTween;
    if (!tween) return;
    const u = halted ? 1 : Math.min(1, (t - tween.startMs) / (FOV_SECONDS * 1000));
    this.applyFov(tween.from + (tween.to - tween.from) * u);
    if (u >= 1) this.fovTween = null;
  }

  private finishFov() {
    const tween = this.fovTween;
    this.fovTween = null;
    if (tween) this.applyFov(tween.to);
  }

  private applyFov(fov: number) {
    const camera = this.core.camera;
    if (camera.fov === fov) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  /** Remember where a flight to building `site` ended (its orbit target), so the chip keeps naming it there. */
  private noteLanding(site: number, target: ArrayLike<number>) {
    this.landed = site >= 0 ? { site, x: target[0], y: target[1], z: target[2] } : null;
  }

  private landFlight() {
    const active = this.flight;
    if (!active) return;
    this.flight = null;
    this.noteLanding(active.site, active.flight.to.target);
    const site = active.site >= 0 ? active.site : this.siteFor();
    this.siteDirty = false;
    this.view.set({ flight: false, location: { site: this.siteId(site) } });
  }

  /** Cut a running flight to its end (a freeze, halted motion). */
  private finishFlight() {
    const active = this.flight;
    if (!active || !this.orbit) return;
    this.orbit.setOrbit(flightPose(active.flight, Infinity, ORBIT_LIMITS, this.stepPose));
    this.landFlight();
  }

  /** The visitor took over (a drag, the wheel, a key, a step): the flight stops where it is. */
  private cancelFlightHere() {
    if (!this.flight) return;
    this.flight = null;
    this.landed = null;
    this.siteDirty = true;
    this.view.set({ flight: false });
  }

  /** Fly to an orbit pose (a cut when `instant`), with any view change the command makes, in one `location`. */
  private startFlight(to: OrbitPose, seconds: number, site: number, instant: boolean, patch: { selection?: EstateSiteId | null } = {}): void {
    const orbit = this.orbit;
    if (!orbit) return;
    orbit.cancel();
    if (instant) {
      this.flight = null;
      orbit.setOrbit(to);
      this.noteLanding(site, to.target);
      this.siteDirty = false;
      this.view.set({ ...patch, flight: false, location: { site: this.siteId(site >= 0 ? site : this.siteFor()) } });
    } else {
      const from = orbit.currentOrbit(this.fromPose);
      this.flight = { flight: planFlight(from, to, seconds), startMs: now(), site };
      this.view.set({ ...patch, flight: true });
    }
    this.core.invalidate();
  }

  // ---- commands ------------------------------------------------------------------------------

  flyTo(site: EstateSiteId, options?: EstateFlyOptions): boolean {
    if (!this.live || !this.orbit) return false;
    const index = ESTATE_SITE_IDS.indexOf(site);
    const building = index >= 0 ? this.core.pack?.sites[index] : undefined;
    if (!building) return false;
    const halted = this.core.options.motionHalted();
    this.abandonArc();
    if (this.mode !== 'overview') this.switchMode('overview', halted);
    const camera = this.core.camera;
    const from = this.orbit.currentOrbit(this.fromPose);
    const to = frameBuilding(building.bounds, building.radius, building.roofTop, from, this.overviewFov, camera.aspect, ORBIT_LIMITS, this.toPose);
    // P0 for its facade, detail and interior from the start (§7.5).
    this.core.setFocus(site);
    this.startFlight(to, FLY_TO_SECONDS, index, options?.instant === true || halted, { selection: site });
    return true;
  }

  home(): boolean {
    if (!this.live || !this.orbit) return false;
    if (this.mode === 'walk' && !this.arc && this.walk?.active) return this.walk.respawn();
    const pose = this.core.posterPose();
    if (!pose) return false;
    const halted = this.core.options.motionHalted();
    this.abandonArc();
    if (this.mode !== 'overview') this.switchMode('overview', halted);
    this.overviewFov = pose.fovDeg;
    this.fovTo(pose.fovDeg, halted);
    const to = clampOrbit(orbitFromLookAt(pose.position, pose.target, this.toPose));
    this.startFlight(to, HOME_SECONDS, -1, halted);
    return true;
  }

  setMode(mode: EstateViewMode): boolean {
    if (!this.live) return false;
    if (mode !== 'overview' && mode !== 'fly' && mode !== 'walk') return false; // Plan is P6
    if (mode === this.mode) return false;
    if (mode === 'walk' && !this.walk) return false;
    const halted = this.core.options.motionHalted();
    // Out of Walk to Overview is the reverse arc (§8.1); an Enter arc still running turns back.
    if (mode === 'overview' && this.mode === 'walk') return this.exitWalk(halted);
    this.abandonArc();
    this.switchMode(mode, halted);
    return true;
  }

  escape(action: EscapeAction): boolean {
    if (!this.live) return false;
    if (action === 'cancel-transition') return this.walk?.cancelTransition() ?? false;
    if (action === 'overview') return this.setMode('overview');
    return false; // exit-plan is P6
  }

  capture(): boolean {
    if (!this.live || this.mode === 'overview') return false;
    const canvas = this.canvas;
    if (!canvas || typeof canvas.requestPointerLock !== 'function') return false;
    if (document.pointerLockElement === canvas) return false;
    this.endDrag();
    try {
      const request = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      // A refusal (too soon after a release, or no user gesture) rejects here and
      // fires pointerlockerror, which the HUD turns into "WAIT, THEN CLICK CAPTURE".
      if (request && typeof request.catch === 'function') request.catch(() => {});
    } catch {
      return false;
    }
    return true;
  }

  /**
   * A step button (§8.6), for pointer and touch alike, in every mode: Overview
   * zooms, orbits, tilts and pans; Fly moves half a second's travel or turns
   * 15°; Walk takes a 0.5 m step or a 15° turn (and stops a climb there).
   */
  walkStep(step: EstateWalkStep): boolean {
    if (!this.live || this.arc) return false;
    const halted = this.core.options.motionHalted();
    this.cancelFlightHere();
    if (this.mode === 'overview' && this.orbit) this.orbit.step(step, halted);
    else if (this.mode === 'fly' && this.fly) this.fly.step(step);
    else if (this.mode === 'walk' && this.walk) return this.walk.step(step);
    else return false;
    this.core.invalidate();
    return true;
  }

  setStick(x: number, y: number): boolean {
    if (!this.live || this.mode !== 'walk' || this.arc || !this.walk) return false;
    return this.walk.setStick(x, y);
  }

  setStorey(target: EstateStep | EstateStoreyTag): boolean {
    if (!this.live || this.mode !== 'walk' || this.arc || !this.walk) return false;
    return this.walk.setStorey(target);
  }

  takeLift(level: EstateStoreyTag): boolean {
    if (!this.live || this.mode !== 'walk' || this.arc || !this.walk) return false;
    return this.walk.takeLift(level);
  }

  takeStairs(direction: EstateStep): boolean {
    if (!this.live || this.mode !== 'walk' || this.arc || !this.walk) return false;
    return this.walk.takeStairs(direction);
  }

  /**
   * Enter (§8.1): the 1.2 s arc to the building's entrance spawn nearest the
   * camera (a cut when `instant` or halted), into Walk; its interior, walk grid
   * and nav file load at P0 from the start. With `storey`, a lift ride there
   * once the walker stands on its grid. Refused, with the reason spoken, when
   * entering it failed for good or the pack has no interior for it.
   */
  enter(site: EstateSiteId, options?: EstateEnterOptions): boolean {
    if (!this.live || !this.walk || !this.core.pack || !this.core.interiors) return false;
    const index = ESTATE_SITE_IDS.indexOf(site);
    const building = index >= 0 ? this.core.pack.sites[index] : undefined;
    if (!building) return false;
    const entry = this.core.interiors.entry(index, this.entry);
    if (entry.state === 'failed' || entry.state === 'absent') {
      if (entry.reason) this.view.announce(false, entry.reason);
      return false;
    }
    const camera = this.core.camera;
    const spawn = this.nearestSpawn(building.spawns, camera.position.x, -camera.position.z);
    if (!spawn) return false;
    const halted = this.core.options.motionHalted();
    const storeyTag = options?.storey ? normaliseStoreyTag(options.storey) : null;
    const storey = storeyTag && storeyTag !== GROUND_STOREY && building.storeys.some((s) => s.tag === storeyTag) ? storeyTag : null;
    this.cancelFlightHere();
    this.abandonArc();
    this.releaseKeys();
    this.endDrag();
    this.core.setFocus(site);
    if (options?.instant === true || halted) {
      this.leaveFor('walk');
      this.mode = 'walk';
      this.applyFov(ESTATE_VFOV_DEG.walk);
      this.view.set({ selection: site, flight: false });
      this.walk.start(spawn, storey ? { site: index, tag: storey } : undefined);
      this.core.invalidate();
      return true;
    }
    const from = endFromCamera(camera);
    const to = endFromLook([spawn.x, spawn.z + EYE_HEIGHT, -spawn.y], spawn.yaw, 0, ESTATE_VFOV_DEG.walk);
    this.leaveFor('walk');
    // From another building's walk: that walk ends where the arc begins (its storey hint, its offers).
    this.walk.stop();
    this.mode = 'walk';
    this.arc = {
      arc: planArc(from, to, arcRise(building.roofTop), ENTER_SECONDS), startMs: now(), kind: 'enter', site: index, spawn, storey, orbit: null,
    };
    this.view.set({
      selection: site, flight: true, walk: null,
      location: { mode: 'walk', site, storey: null, unit: null, room: null },
    });
    this.core.invalidate();
    return true;
  }

  /** "Start at BS1": Walk from a named spawn, a cut (engineApi walkFrom). */
  walkFrom(name = 'BS1'): boolean {
    if (!this.live || !this.walk || !this.core.pack) return false;
    const pack = this.core.pack;
    const want = name.trim();
    let found: PackSpawn | null = null;
    let site = -1;
    for (const s of pack.site?.spawns ?? []) if (s.name === want || s.name.endsWith(` ${want}`)) { found = s; break; }
    if (!found) {
      pack.sites.forEach((b, i) => {
        for (const s of b.spawns) if (!found && (`${b.id} ${s.name}` === want || s.name === want)) { found = s; site = i; }
      });
    }
    if (!found) return false;
    const spawn = spawnOf(found);
    this.cancelFlightHere();
    this.abandonArc();
    this.releaseKeys();
    this.endDrag();
    if (site >= 0) this.core.setFocus(ESTATE_SITE_IDS[site]);
    this.leaveFor('walk');
    this.mode = 'walk';
    this.fovTo(ESTATE_VFOV_DEG.walk, this.core.options.motionHalted());
    this.walk.start(spawn);
    this.core.invalidate();
    return true;
  }

  /** getResume's `inside` (Walk on a building's grid), else null. */
  resumeInside(): EstateResume['inside'] {
    const walk = this.walk;
    if (this.mode !== 'walk' || !walk?.active || walk.walker.site < 0) return null;
    const tag = this.core.interiors?.table(walk.walker.site)?.tags[walk.walker.layer];
    return tag ? { site: ESTATE_SITE_IDS[walk.walker.site], storey: tag } : null;
  }

  // ---- Walk's ways in and out ------------------------------------------------------------------

  /** The entrance spawn nearest estate plan point (x, y), as a WalkSpawn. */
  private nearestSpawn(spawns: readonly PackSpawn[], x: number, y: number): WalkSpawn | null {
    let best: PackSpawn | null = null;
    let bestD = Infinity;
    for (const s of spawns) {
      if (s.kind !== 'entrance') continue;
      const d = Math.hypot(s.pos[0] - x, s.pos[1] - y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best ? spawnOf(best) : null;
  }

  /** Every building's entrance spawn nearest (x, y) (the 2 key), with its building. */
  private nearestEntrance(x: number, y: number): { spawn: WalkSpawn; site: number } | null {
    const pack = this.core.pack;
    if (!pack) return null;
    let best: PackSpawn | null = null;
    let site = -1;
    let bestD = Infinity;
    pack.sites.forEach((b, i) => {
      for (const s of b.spawns) {
        if (s.kind !== 'entrance') continue;
        const d = Math.hypot(s.pos[0] - x, s.pos[1] - y);
        if (d < bestD) { bestD = d; best = s; site = i; }
      }
    });
    return best ? { spawn: spawnOf(best), site } : null;
  }

  /**
   * The floor under the camera for Fly → Walk: the one the feet are on, or the
   * highest within DROP_REACH below them (a building's grid, or the ground);
   * null when none is that close (high up, or over a footprint whose grid is
   * still on its way).
   */
  private floorBelow(x: number, y: number, feet: number): number | null {
    const interiors = this.core.interiors;
    if (!interiors) return null;
    const q = this.query;
    for (let dz = 0; dz <= DROP_REACH + 1e-9; dz += 0.3) {
      interiors.floorQuery(x, y, feet - dz, q);
      if (q.kind === 'building') return q.z;
      if (q.kind === 'ground') return feet - q.z <= DROP_REACH + 0.4 && feet - q.z >= -0.4 ? q.z : null;
      if (q.kind === 'none') return feet <= DROP_REACH ? 0 : null;
      if (q.kind === 'pending') return null;
    }
    return null;
  }

  /** The mode the camera is leaving gives it up: Overview's controls off, Fly stopped, Walk's session ended. */
  private leaveFor(next: ControlMode) {
    if (this.mode === 'overview' && next !== 'overview' && this.orbit) this.orbit.enabled = false;
    if (this.mode === 'fly' && next !== 'fly') this.fly?.stop();
    if (this.mode === 'walk' && next !== 'walk') this.walk?.stop();
    if (next === 'overview') this.exitLock();
  }

  /** Walk → Overview: the 1.0 s reverse arc to an overview of the building underfoot, or of the walker's surroundings. */
  private exitWalk(halted: boolean): boolean {
    const orbit = this.orbit;
    const walk = this.walk;
    const pack = this.core.pack;
    if (!orbit || !walk || !pack) return false;
    const camera = this.core.camera;
    const enter = this.arc?.kind === 'enter' ? this.arc : null;
    let site = enter ? enter.site : walk.active ? walk.walker.site : -1;
    if (site < 0) {
      const named = this.view.get().location.site;
      site = named ? ESTATE_SITE_IDS.indexOf(named) : -1;
    }
    const yaw = enter ? enter.spawn?.yaw ?? 0 : walk.walker.look.yaw;
    const current = this.exitPose;
    current.azimuth = yaw;
    current.polar = EXIT_POLAR;
    const building = site >= 0 ? pack.sites[site] : undefined;
    const to = blankPose();
    if (building) {
      frameBuilding(building.bounds, building.radius, building.roofTop, current, this.overviewFov, camera.aspect, ORBIT_LIMITS, to);
    } else {
      const w = walk.walker;
      to.target[0] = w.x; to.target[1] = Math.max(0, w.z); to.target[2] = -w.y;
      to.distance = EXIT_DISTANCE;
      to.azimuth = yaw;
      to.polar = EXIT_POLAR;
      clampOrbit(to);
    }
    this.releaseKeys();
    this.endDrag();
    this.arc = null;
    this.leaveFor('overview');
    this.mode = 'overview';
    const position = positionFromOrbit(to, [0, 0, 0]);
    const end = endLookingAt(position, to.target, this.overviewFov);
    this.arc = {
      arc: planArc(endFromCamera(camera), end, halted ? 0 : arcRise(building?.roofTop ?? 0), halted ? 0 : EXIT_SECONDS),
      startMs: now(), kind: 'exit', site, spawn: null, storey: null, orbit: to,
    };
    this.view.set({ flight: true, walk: null, transition: null, location: { mode: 'overview', storey: null, unit: null, room: null } });
    if (halted) this.landArc();
    this.core.invalidate();
    return true;
  }

  /** An arc reaches its end (or is cut there): Walk starts at the spawn, or Overview takes over at the orbit pose. */
  private landArc() {
    const active = this.arc;
    if (!active) return;
    this.arc = null;
    const camera = this.core.camera;
    applyArc(active.arc, Infinity, camera);
    if (active.kind === 'enter' && active.spawn && this.walk) {
      this.walk.start(active.spawn, active.storey && active.site >= 0 ? { site: active.site, tag: active.storey } : undefined);
      this.view.set({ flight: false });
      return;
    }
    const orbit = this.orbit;
    if (!orbit) return;
    orbit.enabled = true;
    if (active.orbit) orbit.setOrbit(active.orbit);
    else orbit.setPose(camera.position.toArray(this.e1), this.groundAhead(this.v2).toArray(this.e2));
    this.applyFov(this.overviewFov);
    if (active.orbit && active.site >= 0) this.noteLanding(active.site, active.orbit.target);
    this.siteDirty = false;
    this.view.set({
      flight: false,
      location: { mode: 'overview', site: this.siteId(active.site >= 0 ? active.site : this.siteFor()), storey: null, unit: null, room: null },
    });
  }

  /** A command that moves the camera elsewhere drops a running arc where it is (Enter: back to Overview there). */
  private abandonArc() {
    const active = this.arc;
    if (!active) return;
    if (active.kind === 'exit') { this.landArc(); return; }
    this.arc = null;
    this.walk?.stop();
    const orbit = this.orbit;
    const camera = this.core.camera;
    this.mode = 'overview';
    if (orbit) {
      orbit.enabled = true;
      orbit.setPose(camera.position.toArray(this.e1), this.groundAhead(this.v2).toArray(this.e2));
    }
    this.view.set({ flight: false, location: { mode: 'overview', storey: null, unit: null, room: null } });
  }

  /** Ground height (three Y) under three (x, z): Fly's clearance once the ground heights have arrived. */
  private groundY(x: number, z: number): number {
    const walk = this.walk;
    const g = walk ? walk.walker.groundZ(x, -z) : null;
    return g ?? 0;
  }

  // ---- mode switches -------------------------------------------------------------------------

  private switchMode(mode: ControlMode, halted: boolean) {
    const orbit = this.orbit;
    const fly = this.fly;
    if (!orbit || !fly || mode === this.mode) return;
    this.releaseKeys();
    this.endDrag();
    this.clicks.cancel();
    this.cancelFlightHere();
    const camera = this.core.camera;
    const from = this.mode;
    if (mode === 'fly') {
      this.leaveFor('fly');
      fly.activate(); // keeps the pose drawn now
      this.mode = 'fly';
      this.fovTo(ESTATE_VFOV_DEG.fly, halted);
    } else if (mode === 'walk') {
      const walk = this.walk;
      if (!walk) return;
      if (from === 'fly') {
        // Down onto the floor under the camera when it is close; else the nearest entrance.
        const p = threeToEstate(camera.position.toArray(this.e1), this.e1);
        const floor = this.floorBelow(p[0], p[1], p[2] - EYE_HEIGHT);
        if (floor !== null) {
          const yaw = fly.look.yaw;
          this.leaveFor('walk');
          this.mode = 'walk';
          this.fovTo(ESTATE_VFOV_DEG.walk, halted);
          walk.startAt(p[0], p[1], floor, yaw, 0);
          this.core.invalidate();
          return;
        }
      }
      // From Overview (or high in Fly): a cut to the entrance spawn nearest the orbit target (or the camera's ground point).
      const target = from === 'overview' ? orbit.getTarget(this.v2) : this.v2.copy(camera.position);
      const near = this.nearestEntrance(target.x, -target.z);
      if (!near) return;
      this.leaveFor('walk');
      this.mode = 'walk';
      this.core.setFocus(ESTATE_SITE_IDS[near.site]);
      this.fovTo(ESTATE_VFOV_DEG.walk, halted);
      walk.start(near.spawn);
      this.core.invalidate();
      return;
    } else {
      // Instant to Overview (a fly-to or Home from Walk or Fly): orbit about the ground ahead.
      const target = this.groundAhead(this.v2);
      this.leaveFor('overview');
      orbit.enabled = true;
      orbit.setPose(camera.position.toArray(this.e1), target.toArray(this.e2));
      this.mode = 'overview';
      this.fovTo(this.overviewFov, halted);
    }
    this.siteDirty = false;
    this.view.set({ location: { mode: this.mode, site: this.siteId(this.siteFor()), storey: null, unit: null, room: null } });
    this.core.invalidate();
  }

  /**
   * Fly → Overview orbits about a point on the ground ahead: where the view
   * meets it when looking down, else level ground far enough ahead that the
   * orbit starts within its 85° limit. Kept inside the target's box.
   */
  private groundAhead(out: Vector3): Vector3 {
    const camera = this.core.camera;
    const f = camera.getWorldDirection(this.v1);
    const p = camera.position;
    const down = -f.y;
    let reach: number;
    if (down > LEVEL_TILT) {
      reach = Math.min(AHEAD_MAX, Math.max(ORBIT_LIMITS.minDistance, p.y / down));
      out.copy(p).addScaledVector(f, reach);
    } else {
      const flat = Math.hypot(f.x, f.z) || 1;
      reach = Math.min(AHEAD_MAX, Math.max(AHEAD_MIN, p.y / LEVEL_TILT));
      out.set(p.x + (f.x / flat) * reach, 0, p.z + (f.z / flat) * reach);
    }
    out.y = Math.max(0, out.y);
    return this.boundary.clampPoint(out, out);
  }

  // ---- picking -------------------------------------------------------------------------------

  /** The building under a client point, −1 for none, or null when the point is off the canvas. */
  private pickAt(clientX: number, clientY: number): number | null {
    const canvas = this.canvas;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return null;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const camera = this.core.camera;
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    camera.updateMatrixWorld();
    const through = this.v1.set(x, y, 0.5).unproject(camera);
    const dir = through.sub(camera.position);
    const origin = threeToEstate(camera.position.toArray(this.e1), this.e1);
    const direction = threeToEstate(dir.toArray(this.e2), this.e2);
    return pickPrism(origin, direction, this.prisms)?.index ?? -1;
  }

  private selectIndex(index: number) {
    const site = this.siteId(index);
    if (site === this.view.get().selection) return;
    this.core.setFocus(site);
    this.view.set({ selection: site });
  }

  // ---- input ---------------------------------------------------------------------------------

  private releaseKeys() {
    if (this.held.releaseAll() > 0) this.core.invalidate();
  }

  private endDrag() {
    const drag = this.drag;
    this.drag = null;
    if (drag && this.canvas?.hasPointerCapture?.(drag.id)) {
      try { this.canvas.releasePointerCapture(drag.id); } catch { /* already released */ }
    }
  }

  private exitLock() {
    if (typeof document !== 'undefined' && this.canvas && document.pointerLockElement === this.canvas) {
      try { document.exitPointerLock(); } catch { /* nothing held */ }
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    // Scope 1: the stage itself, never a button or link inside it.
    if (event.target !== this.host || !this.live) return;
    const decision = stageKey({
      code: event.code,
      targetKind: 'stage',
      modifiers: { shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey, meta: event.metaKey },
      repeat: event.repeat,
      mode: this.mode,
    });
    if (decision.preventDefault) event.preventDefault();
    if (decision.action) this.act(decision.action, event.code);
  };

  private act(action: StageAction, code: string) {
    switch (action.kind) {
      case 'hold':
        if (this.held.press(code, action.hold)) {
          if (action.hold !== 'boost') this.cancelFlightHere();
          // Walk: any movement key stops a climb where it is (§8.5); PgUp / PgDn take the offered lift or stair.
          if (this.mode === 'walk' && this.walk && !this.arc) {
            if (cancelsClimb(action)) this.walk.interrupt();
            else if (action.hold === 'storey-up' || action.hold === 'storey-down') this.walk.storeyKey(action.hold === 'storey-up' ? 1 : -1);
          }
          this.core.invalidate();
        }
        return;
      case 'mode':
        this.setMode(action.mode);
        return;
      case 'activate': {
        if (this.mode === 'walk') {
          // Walk: the offered lift opens its popover, else the offered stair.
          const done = this.walk && !this.arc ? this.walk.activate() : false;
          if (done === 'lift') this.view.set({ popover: 'lift' });
          return;
        }
        // Overview: fly to the selected building; resting on it already, Enter it.
        const selection = this.view.get().selection;
        if (!selection) return;
        const index = ESTATE_SITE_IDS.indexOf(selection);
        if (this.landed && this.landed.site === index && !this.flight && this.mode === 'overview') this.enter(selection);
        else this.flyTo(selection);
        return;
      }
      case 'aerial':
        // Overview and (now) Fly: the aerial view, as the HUD's Home does.
        this.home();
        return;
      case 'respawn':
        // Walk: back to where this walk began.
        this.home();
        return;
      case 'capture':
        this.capture();
        return;
      case 'announce':
        this.view.announce(true, null);
        return;
      default:
        // cycle-room, storey, cut (P6).
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent) => {
    const released = this.held.release(event.code);
    if (released === null) return;
    if ((released === 'storey-up' || released === 'storey-down') && !this.held.has(released)) this.walk?.storeyKeyUp();
    this.core.invalidate();
  };

  private readonly onBlur = () => {
    this.releaseKeys();
    this.endDrag();
  };

  private readonly onVisibility = () => {
    if (document.visibilityState === 'hidden') this.onBlur();
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.live) return;
    const canvas = this.canvas;
    const locked = canvas !== null && document.pointerLockElement === canvas;
    this.clicks.down(event.pointerId, event.clientX, event.clientY, event.timeStamp, event.button === 0 && event.isPrimary !== false && !locked, event.pointerType || 'mouse');

    if (this.mode === 'overview') {
      this.orbit?.setShiftPan(event.shiftKey);
      return;
    }
    if (locked || this.drag || this.arc) return;
    const role = dragRole(this.mode, event.button, event.shiftKey);
    if (role !== 'look' && role !== 'strafe') return;
    this.drag = { id: event.pointerId, role, x: event.clientX, y: event.clientY };
    try { canvas?.setPointerCapture(event.pointerId); } catch { /* not capturable (synthetic) */ }
    this.cancelFlightHere();
    // A drag stops a climb where it is (§8.5).
    if (this.mode === 'walk') this.walk?.interrupt();
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    this.clicks.move(event.pointerId, event.clientX, event.clientY);
    if (!this.live || this.arc) return;
    const walk = this.mode === 'walk' ? this.walk : null;
    const fly = this.mode === 'fly' ? this.fly : null;
    if (!walk && !fly) return;
    if (this.canvas && document.pointerLockElement === this.canvas) {
      if (event.movementX || event.movementY) {
        if (walk) walk.dragLook(event.movementX, event.movementY);
        else fly!.dragLook(event.movementX, event.movementY);
        this.core.invalidate();
      }
      return;
    }
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (dx === 0 && dy === 0) return;
    if (walk) {
      if (drag.role === 'look') walk.dragLook(dx, dy);
      else walk.dragStrafe(dx, dy);
    } else if (drag.role === 'look') fly!.dragLook(dx, dy);
    else fly!.dragStrafe(dx, dy, this.canvas?.clientHeight ?? 600);
    this.core.invalidate();
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const kind = this.clicks.up(event.pointerId, event.clientX, event.clientY, event.timeStamp);
    if (this.drag && this.drag.id === event.pointerId) this.endDrag();
    // Walk picks nothing: a press there is a look.
    if (!kind || !this.live || this.mode === 'walk' || this.arc) return;
    const index = this.pickAt(event.clientX, event.clientY);
    if (index === null) return; // released off the stage
    if (kind === 'click') this.selectIndex(index);
    else if (index >= 0) this.flyTo(ESTATE_SITE_IDS[index]);
  };

  private readonly onPointerCancel = (event: PointerEvent) => {
    this.clicks.cancel();
    if (this.drag && this.drag.id === event.pointerId) this.endDrag();
  };

  private readonly onWheel = (event: WheelEvent) => {
    if (!this.live) return;
    const target = event.target as Element | null;
    // A HUD panel that scrolls keeps its wheel.
    if (target?.closest?.('[data-estate-scroll]')) return;
    event.preventDefault();
    const steps = wheelSteps(event.deltaY, event.deltaMode, event.ctrlKey, isMac());
    if (steps === 0) return;
    if (this.mode === 'overview' && this.orbit) {
      this.cancelFlightHere();
      this.orbit.wheel(steps, event.clientX, event.clientY, this.core.options.motionHalted());
    } else if (this.mode === 'fly' && this.fly) {
      this.fly.wheel(steps);
      // The HUD's prompt shows the speed: the wheel's only visible effect.
      this.view.set({ flySpeed: this.fly.multiplier });
    } else if (this.mode === 'walk' && this.walk && !this.arc) {
      // ±0.5 m a notch (§8.2), whole notches only, so a trackpad's trickle does not creep.
      this.wheelAcc += steps;
      const whole = Math.trunc(this.wheelAcc);
      if (whole !== 0) {
        this.wheelAcc -= whole;
        this.walk.wheel(whole);
      }
    }
    this.core.invalidate();
  };

  private readonly onContextMenu = (event: Event) => event.preventDefault();

  private readonly onPointerLockChange = () => {
    const locked = this.canvas !== null && document.pointerLockElement === this.canvas;
    const current = this.view.get();
    if (locked === current.pointerLocked) return;
    this.view.set(locked ? { pointerLocked: true } : { pointerLocked: false, pointerUnlockedAtMs: now() });
    this.core.invalidate();
  };

  private listen(target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions) {
    target.addEventListener(type, handler, options);
    this.unbind.push(() => target.removeEventListener(type, handler, options));
  }

  private bind(host: HTMLElement, canvas: HTMLCanvasElement) {
    const l = (h: (event: never) => void) => h as unknown as EventListener;
    this.listen(host, 'keydown', l(this.onKeyDown));
    this.listen(window, 'keyup', l(this.onKeyUp), { capture: true });
    this.listen(host, 'blur', l(this.onBlur));
    this.listen(window, 'blur', l(this.onBlur));
    this.listen(document, 'visibilitychange', l(this.onVisibility));
    // Capture: ahead of camera-controls' own pointerdown on the canvas, so a
    // Shift-drag is set up as a pan before it reads the button.
    this.listen(canvas, 'pointerdown', l(this.onPointerDown), { capture: true });
    // Moves and releases on the window: a press that leaves the stage still
    // ends (as camera-controls' own drags do on the document), and Fly's
    // captured pointer and a locked mouse arrive here through the canvas.
    this.listen(window, 'pointermove', l(this.onPointerMove), { capture: true, passive: true });
    this.listen(window, 'pointerup', l(this.onPointerUp), { capture: true });
    this.listen(window, 'pointercancel', l(this.onPointerCancel), { capture: true });
    this.listen(canvas, 'contextmenu', l(this.onContextMenu));
    this.listen(host, 'wheel', l(this.onWheel), { passive: false });
    this.listen(host, 'gesturestart', l(this.onContextMenu));
    this.listen(document, 'pointerlockchange', l(this.onPointerLockChange));
  }
}

/** engine/index.ts mounts this as the engine's navigation (navigation.ts' seam). */
export const createControls: NavigationFactory = (core, view) => new EstateControls(core, view);
