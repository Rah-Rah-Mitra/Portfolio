import { Box3, Vector3 } from 'three';
import { threeToEstate, wrapAngle, type EstateViewMode, type Vec3 } from '../../../../../lib/estate/frames';
import { ESTATE_SITE_IDS, type EstateSiteId } from '../../../../../lib/estate/ids';
import { dragRole, HeldKeys, stageKey, type EscapeAction, type StageAction } from '../../../../../lib/estate/input';
import { ESTATE_VFOV_DEG } from '../../../../../lib/estate/lod';
import type { EstateEngineFeatures, EstateFlyOptions, EstateWalkStep } from '../../engineApi';
import type { EstateCore } from '../core';
import type { EngineNavigation, NavigationFactory, ViewAccess } from '../navigation';
import type { CameraRig } from '../rig';
import { FlyController, type Bounds2 } from './firstPerson';
import { northRotation, wheelSteps } from './motion';
import { OrbitController } from './orbit';
import { buildPrisms, ClickTracker, pickPrism, siteAround, siteNear, type Prism } from './picking';
import {
  blankPose, clampOrbit, FLY_TO_SECONDS, flightDone, flightPose, FOV_SECONDS, frameBuilding, HOME_SECONDS, ORBIT_LIMITS,
  orbitFromLookAt, planFlight, type Flight, type OrbitPose,
} from './tween';

// The Estate viewer's controls (plan §8.1–§8.3, §8.7): what moves the camera
// on request, plugged into the render core as its one CameraRig. P4b ships
// Overview (camera-controls), Fly (our own first-person controller), fly-to,
// Home and picking; P5 adds Walk, Enter, stairs and lifts beside them (a third
// controller under the same rig, the same input layer, the same tween clock),
// P6 Plan. engine/index.ts owns the handle and the view; this module answers
// the navigation commands and reports through ViewAccess.
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
export const CONTROLS_FEATURES: Readonly<Partial<EstateEngineFeatures>> = Object.freeze({ overview: true, fly: true, flyTo: true });

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
/** The host's custom property the HUD's north arrow turns by. */
export const NORTH_PROPERTY = '--estate-north';
const NORTH_EPSILON = (0.5 * Math.PI) / 180;
/** Fly → Overview orbits about the ground this far ahead at least, and never farther than this. */
const AHEAD_MIN = 30;
const AHEAD_MAX = 600;
const LEVEL_TILT = Math.tan((10 * Math.PI) / 180);

type ControlMode = 'overview' | 'fly';

interface ActiveFlight {
  flight: Flight;
  startMs: number;
  /** Index of the building it frames, or −1 (Home). */
  site: number;
}

interface FovTween { from: number; to: number; startMs: number }

interface Drag { id: number; role: 'look' | 'strafe'; x: number; y: number }

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
  private prisms: Prism[] = [];
  private mode: ControlMode = 'overview';
  private flight: ActiveFlight | null = null;
  private fovTween: FovTween | null = null;
  private overviewFov: number = ESTATE_VFOV_DEG.overview;
  private boundary = new Box3();
  private drag: Drag | null = null;
  private unbind: Array<() => void> = [];
  private isReady = false;
  private disposed = false;
  private lastSiteCheck = -Infinity;
  private siteDirty = false;
  private lastNorth = Number.NaN;
  private readonly fromPose: OrbitPose = blankPose();
  private readonly toPose: OrbitPose = blankPose();
  private readonly stepPose: OrbitPose = blankPose();
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly e1: Vec3 = [0, 0, 0];
  private readonly e2: Vec3 = [0, 0, 0];

  /** The CameraRig the core draws through: whichever controller is active, plus the transitions. */
  readonly rig: CameraRig;

  constructor(core: EstateCore, view: ViewAccess) {
    this.core = core;
    this.view = view;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.rig = {
      get mode(): EstateViewMode { return self.mode; },
      get busy(): boolean { return self.flight !== null || self.fovTween !== null; },
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
    this.fly = new FlyController(camera, { bounds: roam });
    if (core.options.resume?.mode === 'fly') {
      orbit.enabled = false;
      this.fly.activate();
      this.mode = 'fly';
    } else {
      // Overview keeps the lens it went live with (the poster's, or a resumed 45°).
      this.overviewFov = camera.fov;
    }
    this.bind(host, canvas);
    this.isReady = true;
    core.setRig(this.rig);
    this.view.set({ location: { mode: this.mode, site: this.siteId(this.siteFor()) } });
  }

  freeze(): void {
    this.releaseKeys();
    this.endDrag();
    this.clicks.cancel();
    if (this.flight) this.finishFlight();
    if (this.fovTween) this.finishFov();
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
    if (this.mode === 'overview' && this.orbit) {
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
    this.writeNorth();
    this.trackSite(moving, t);
    return moving;
  }

  private getTarget(out: Vector3): Vector3 {
    if (this.mode === 'fly' && this.fly) return this.fly.getTarget(out);
    if (this.orbit) return this.orbit.getTarget(out);
    return this.core.staticRig.getTarget(out);
  }

  /** The north arrow's turn, written to the host as a CSS angle when it moves by more than half a degree. */
  private writeNorth() {
    const host = this.host;
    if (!host) return;
    const camera = this.core.camera;
    const f = camera.getWorldDirection(this.v1);
    const u = this.v2.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const turn = northRotation(f.x, f.z, u.x, u.z);
    if (turn === null) return;
    if (!Number.isNaN(this.lastNorth) && Math.abs(wrapAngle(turn - this.lastNorth)) < NORTH_EPSILON) return;
    this.lastNorth = turn;
    host.style.setProperty(NORTH_PROPERTY, `${turn.toFixed(4)}rad`);
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
    if (camera.position.distanceTo(target) > FRAME_REACH) return -1;
    return siteNear(target.x, -target.z, this.prisms, FRAME_MARGIN);
  }

  /** Refresh the chip's building: every SITE_CHECK_MS while moving, and once on coming to rest. Not mid-flight. */
  private trackSite(moving: boolean, t: number) {
    if (this.flight) return;
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

  private landFlight() {
    const active = this.flight;
    if (!active) return;
    this.flight = null;
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
    if (this.mode !== 'overview') this.switchMode('overview', halted);
    const camera = this.core.camera;
    const from = this.orbit.currentOrbit(this.fromPose);
    const to = frameBuilding(building.bounds, building.radius, building.roofTop, from, this.overviewFov, camera.aspect, ORBIT_LIMITS, this.toPose);
    // P0 for its facade, detail (and P5's interior) from the start (§7.5).
    this.core.setFocus(site);
    this.startFlight(to, FLY_TO_SECONDS, index, options?.instant === true || halted, { selection: site });
    return true;
  }

  home(): boolean {
    if (!this.live || !this.orbit) return false;
    const pose = this.core.posterPose();
    if (!pose) return false;
    const halted = this.core.options.motionHalted();
    if (this.mode !== 'overview') this.switchMode('overview', halted);
    this.overviewFov = pose.fovDeg;
    this.fovTo(pose.fovDeg, halted);
    const to = clampOrbit(orbitFromLookAt(pose.position, pose.target, this.toPose));
    this.startFlight(to, HOME_SECONDS, -1, halted);
    return true;
  }

  setMode(mode: EstateViewMode): boolean {
    if (!this.live) return false;
    if (mode !== 'overview' && mode !== 'fly') return false; // Walk is P5, Plan P6
    if (mode === this.mode) return false;
    this.switchMode(mode, this.core.options.motionHalted());
    return true;
  }

  escape(action: EscapeAction): boolean {
    if (!this.live) return false;
    if (action === 'overview') return this.setMode('overview');
    return false; // cancel-transition (climbs, fades) is P5; exit-plan P6
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
   * zooms in or out and orbits 15°; Fly moves half a second's travel or turns
   * 15° (P5's Walk: 0.5 m and 15°).
   */
  walkStep(step: EstateWalkStep): boolean {
    if (!this.live) return false;
    const halted = this.core.options.motionHalted();
    this.cancelFlightHere();
    if (this.mode === 'overview' && this.orbit) this.orbit.step(step, halted);
    else if (this.mode === 'fly' && this.fly) this.fly.step(step);
    else return false;
    this.core.invalidate();
    return true;
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
    if (mode === 'fly') {
      orbit.enabled = false;
      fly.activate(); // keeps the pose drawn now
      this.mode = 'fly';
      this.fovTo(ESTATE_VFOV_DEG.fly, halted);
    } else {
      this.exitLock();
      fly.stop();
      const target = this.groundAhead(this.v2);
      orbit.enabled = true;
      orbit.setPose(camera.position.toArray(this.e1), target.toArray(this.e2));
      this.mode = 'overview';
      this.fovTo(this.overviewFov, halted);
    }
    this.siteDirty = false;
    this.view.set({ location: { mode: this.mode, site: this.siteId(this.siteFor()) } });
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
          this.core.invalidate();
        }
        return;
      case 'mode':
        this.setMode(action.mode);
        return;
      case 'activate': {
        // Overview: fly to the selected building (P5: and then Enter it).
        const selection = this.view.get().selection;
        if (selection) this.flyTo(selection);
        return;
      }
      case 'aerial':
        this.home();
        return;
      case 'capture':
        this.capture();
        return;
      case 'announce':
        this.view.announce(true, null);
        return;
      default:
        // cycle-room, storey, cut (P6), respawn (P5).
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (this.held.release(event.code) !== null) this.core.invalidate();
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
    this.clicks.down(event.pointerId, event.clientX, event.clientY, event.timeStamp, event.button === 0 && event.isPrimary !== false && !locked);
    if (this.mode === 'overview') {
      this.orbit?.setShiftPan(event.shiftKey);
      return;
    }
    if (locked || this.drag) return;
    const role = dragRole('fly', event.button, event.shiftKey);
    if (role !== 'look' && role !== 'strafe') return;
    this.drag = { id: event.pointerId, role, x: event.clientX, y: event.clientY };
    try { canvas?.setPointerCapture(event.pointerId); } catch { /* not capturable (synthetic) */ }
    this.cancelFlightHere();
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    this.clicks.move(event.pointerId, event.clientX, event.clientY);
    if (this.mode !== 'fly' || !this.fly || !this.live) return;
    if (this.canvas && document.pointerLockElement === this.canvas) {
      if (event.movementX || event.movementY) {
        this.fly.dragLook(event.movementX, event.movementY);
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
    if (drag.role === 'look') this.fly.dragLook(dx, dy);
    else this.fly.dragStrafe(dx, dy, this.canvas?.clientHeight ?? 600);
    this.core.invalidate();
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const kind = this.clicks.up(event.pointerId, event.clientX, event.clientY, event.timeStamp);
    if (this.drag && this.drag.id === event.pointerId) this.endDrag();
    if (!kind || !this.live) return;
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
