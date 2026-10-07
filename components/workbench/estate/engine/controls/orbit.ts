import CameraControls from 'camera-controls';
import {
  Box3, MathUtils, Matrix4, Quaternion, Raycaster, Sphere, Spherical, Vector2, Vector3, Vector4, type PerspectiveCamera,
} from 'three';
import type { HeldKeys } from '../../../../../lib/estate/input';
import type { EstateWalkStep } from '../../engineApi';
import { ORBIT_PAN_RATE, ORBIT_ROTATE_RATE, ORBIT_TILT_RATE, STEP_PAN, STEP_TILT, STEP_TURN, STEP_ZOOM } from './motion';
import { ORBIT_LIMITS, orbitFromLookAt, positionFromOrbit, type OrbitPose } from './tween';

// Overview (plan §8.1, §8.2): camera-controls 3.1.2 orbiting the estate.
// Drag orbits; right- or Shift-drag pans across the ground; the wheel or a
// pinch dollies towards the cursor; one finger orbits, two pinch and pan.
// Smoothing 0.35 s (drags 0.125 s); none at all while motion is halted, so a
// drag lands where the pointer is and nothing glides on afterwards. Limits:
// distance 8–900 m, at most 85° from straight down, target inside the estate
// ± 50 m. W/S (↑/↓) tilt, ←/→ rotate, and A/D and Shift+arrows pan while held.
//
// camera-controls' own wheel handler is switched off (mouseButtons.wheel NONE):
// it turns Ctrl+wheel — how a trackpad pinch arrives — into a lens zoom, which
// changes the field of view the detail selection assumes. The stage's own
// non-passive wheel listener calls dollyAtCursor() instead, for both.
//
// Fly-to and Home drive this controller pose by pose (setPoseNow: no promise,
// no allocation per frame), with camera-controls' smoothing out of the way.

CameraControls.install({
  THREE: { Box3, MathUtils, Matrix4, Quaternion, Raycaster, Sphere, Spherical, Vector2, Vector3, Vector4 },
});

const { ACTION } = CameraControls;

/** Smoothing, seconds (§8.1). */
export const ORBIT_SMOOTH_TIME = 0.35;
export const ORBIT_DRAG_SMOOTH_TIME = 0.125;

/** camera-controls with the two things the estate needs that its public API lacks. */
export class EstateCameraControls extends CameraControls {
  /**
   * A wheel or pinch step at the cursor, as camera-controls' own wheel handler
   * performs a dolly: `steps` positive is towards the scene.
   */
  dollyAtCursor(steps: number, clientX: number, clientY: number): void {
    if (!this.enabled || steps === 0) return;
    this._getClientRect(this._elementRect);
    const w = this._elementRect.width || 1;
    const h = this._elementRect.height || 1;
    const x = ((clientX - this._elementRect.x) / w) * 2 - 1;
    const y = ((clientY - this._elementRect.y) / h) * -2 + 1;
    this._dollyInternal(-steps, x, y);
    this._isUserControllingDolly = true;
    this.dispatchEvent({ type: 'control' });
  }

  /** Where the dolly is heading (smoothing may still be on its way there). */
  get endDistance(): number {
    return this._sphericalEnd.radius;
  }

  /**
   * setLookAt(…, false) without its rest promise: a fly-to sets a pose every
   * frame, and a promise per frame is garbage per frame.
   */
  setPoseNow(px: number, py: number, pz: number, tx: number, ty: number, tz: number): void {
    this._isUserControllingRotate = false;
    this._isUserControllingDolly = false;
    this._isUserControllingTruck = false;
    this._changedDolly = 0;
    this._targetEnd.set(tx, ty, tz);
    this._sphericalEnd.setFromVector3(scratch.set(px - tx, py - ty, pz - tz).applyQuaternion(this._yAxisUpSpace));
    this._target.copy(this._targetEnd);
    this._spherical.copy(this._sphericalEnd);
    this._needsUpdate = true;
  }
}

const scratch = new Vector3();

export interface OrbitOptions {
  /** Box the target stays in, three world. */
  boundary: Box3;
  /** camera-controls reports a drag, wheel step or transition starting: wake the frame loop. */
  onControl: () => void;
  /** A drag began (a fly-to in progress gives way to it). */
  onControlStart: () => void;
}

export class OrbitController {
  readonly mode = 'overview' as const;
  readonly controls: EstateCameraControls;
  private readonly camera: PerspectiveCamera;
  private readonly onControl: () => void;
  private readonly onControlStart: () => void;
  private readonly position = new Vector3();
  private readonly target = new Vector3();
  private halted = false;
  private disposed = false;

  constructor(camera: PerspectiveCamera, canvas: HTMLElement, options: OrbitOptions) {
    this.camera = camera;
    this.onControl = options.onControl;
    this.onControlStart = options.onControlStart;
    const controls = new EstateCameraControls(camera, canvas);
    controls.minDistance = ORBIT_LIMITS.minDistance;
    controls.maxDistance = ORBIT_LIMITS.maxDistance;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = ORBIT_LIMITS.maxPolar;
    controls.dollyToCursor = true;
    controls.infinityDolly = false;
    controls.smoothTime = ORBIT_SMOOTH_TIME;
    controls.draggingSmoothTime = ORBIT_DRAG_SMOOTH_TIME;
    controls.mouseButtons.left = ACTION.ROTATE;
    controls.mouseButtons.middle = ACTION.DOLLY;
    // Right-drag pans across the ground (forward and sideways), not up the screen.
    controls.mouseButtons.right = ACTION.SCREEN_PAN;
    controls.mouseButtons.wheel = ACTION.NONE;
    controls.touches.one = ACTION.TOUCH_ROTATE;
    // Pinch and pan across the ground. The runtime handles it (camera-controls
    // 3.1.2 dragging()); its typings leave it out of the two-finger union.
    controls.touches.two = ACTION.TOUCH_DOLLY_SCREEN_PAN as typeof ACTION.TOUCH_DOLLY_TRUCK;
    controls.touches.three = ACTION.TOUCH_SCREEN_PAN;
    controls.setBoundary(options.boundary);
    controls.addEventListener('controlstart', this.handleControlStart);
    controls.addEventListener('control', this.handleControl);
    controls.addEventListener('controlend', this.handleControl);
    controls.addEventListener('transitionstart', this.handleControl);
    this.controls = controls;
  }

  private readonly handleControlStart = () => {
    this.onControlStart();
    this.onControl();
  };

  private readonly handleControl = () => this.onControl();

  /** The viewer's look sensitivity on orbit drags (camera-controls' own default 1); keys and steps turn by their fixed rates. */
  setRotateSpeed(scale: number): void {
    this.controls.azimuthRotateSpeed = scale;
    this.controls.polarRotateSpeed = scale;
  }

  /** Shift-drag pans like a right-drag: chosen at each press, kept for that drag. */
  setShiftPan(shift: boolean): void {
    this.controls.mouseButtons.left = shift ? ACTION.SCREEN_PAN : ACTION.ROTATE;
  }

  get enabled(): boolean { return this.controls.enabled; }

  set enabled(on: boolean) {
    if (this.controls.enabled === on) return;
    if (!on) this.controls.cancel();
    this.controls.enabled = on;
  }

  /** Cut to a pose (camera position and target, three world). */
  setPose(position: ArrayLike<number>, target: ArrayLike<number>): void {
    this.controls.setPoseNow(position[0], position[1], position[2], target[0], target[1], target[2]);
  }

  /** Cut to an orbit pose. */
  setOrbit(pose: OrbitPose): void {
    const p = positionFromOrbit(pose, posScratch);
    this.controls.setPoseNow(p[0], p[1], p[2], pose.target[0], pose.target[1], pose.target[2]);
  }

  /** The pose drawn now (not where smoothing is heading): where a flight starts from. */
  currentOrbit(out: OrbitPose): OrbitPose {
    this.controls.getPosition(this.position, false);
    this.controls.getTarget(this.target, false);
    return orbitFromLookAt(this.position.toArray(posScratch), this.target.toArray(tgtScratch), out);
  }

  /** One frame. True while camera-controls is still moving or an orbit key is held. */
  update(dt: number, held: HeldKeys, halted: boolean): boolean {
    this.setHalted(halted);
    const rotate = held.axis('rotate-right', 'rotate-left');
    const tilt = held.axis('tilt-down', 'tilt-up');
    const side = held.axis('pan-left', 'pan-right');
    const ahead = held.axis('pan-back', 'pan-ahead');
    const turning = rotate !== 0 || tilt !== 0;
    const panning = side !== 0 || ahead !== 0;
    if (turning && dt > 0) void this.controls.rotate(rotate * ORBIT_ROTATE_RATE * dt, tilt * ORBIT_TILT_RATE * dt, false);
    if (panning && dt > 0) {
      // Across the ground, faster the farther out, as a right-drag pans.
      const metres = this.controls.distance * ORBIT_PAN_RATE * dt;
      if (side !== 0) void this.controls.truck(side * metres, 0, false);
      if (ahead !== 0) void this.controls.forward(ahead * metres, false);
    }
    const moved = this.controls.update(dt);
    return moved || turning || panning;
  }

  /** No smoothing while motion is halted: input lands at once and nothing coasts. */
  private setHalted(halted: boolean) {
    if (halted === this.halted) return;
    this.halted = halted;
    this.controls.smoothTime = halted ? 0 : ORBIT_SMOOTH_TIME;
    this.controls.draggingSmoothTime = halted ? 0 : ORBIT_DRAG_SMOOTH_TIME;
  }

  /** The stage's wheel (or pinch) in Overview. */
  wheel(steps: number, clientX: number, clientY: number, halted: boolean): void {
    this.setHalted(halted);
    this.controls.dollyAtCursor(steps, clientX, clientY);
  }

  /**
   * A step button: zoom in or out (forward, back), orbit 15° (turn-left,
   * -right), tilt 10° (look-up, look-down), or pan 15 % of the distance
   * sideways (left, right) or along the ground (up, down).
   */
  step(kind: EstateWalkStep, halted: boolean): void {
    this.setHalted(halted);
    const smooth = !halted;
    const d = this.controls.endDistance;
    switch (kind) {
      case 'forward': case 'back':
        void this.controls.dollyTo(kind === 'forward' ? d * STEP_ZOOM : d / STEP_ZOOM, smooth);
        break;
      case 'turn-left': case 'turn-right':
        void this.controls.rotate(kind === 'turn-left' ? STEP_TURN : -STEP_TURN, 0, smooth);
        break;
      case 'look-up': case 'look-down':
        void this.controls.rotate(0, kind === 'look-up' ? STEP_TILT : -STEP_TILT, smooth);
        break;
      case 'left': case 'right':
        void this.controls.truck((kind === 'right' ? 1 : -1) * d * STEP_PAN, 0, smooth);
        break;
      case 'up': case 'down':
        void this.controls.forward((kind === 'up' ? 1 : -1) * d * STEP_PAN, smooth);
        break;
      default:
    }
    this.onControl();
  }


  getTarget(out: Vector3): Vector3 {
    return this.controls.getTarget(out, false);
  }

  /** Drop any drag in progress (mode switch, freeze). */
  cancel(): void {
    this.controls.cancel();
  }

  /** Where smoothing is still heading is where it stops: no glide after a freeze. */
  settle(): void {
    this.controls.stop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controls.removeEventListener('controlstart', this.handleControlStart);
    this.controls.removeEventListener('control', this.handleControl);
    this.controls.removeEventListener('controlend', this.handleControl);
    this.controls.removeEventListener('transitionstart', this.handleControl);
    this.controls.dispose();
    void this.camera;
  }
}

const posScratch: [number, number, number] = [0, 0, 0];
const tgtScratch: [number, number, number] = [0, 0, 0];
