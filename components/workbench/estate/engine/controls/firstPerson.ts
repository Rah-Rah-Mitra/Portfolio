import { Euler, Vector3, type PerspectiveCamera } from 'three';
import type { HeldKeys } from '../../../../../lib/estate/input';
import type { EstateWalkStep } from '../../engineApi';
import {
  approachShare, FLY_CEILING, FLY_CLEARANCE, FLY_RESPONSE, FLY_REST_SPEED, FLY_ROAM, flySpeed, LOOK_KEY_RATE, LOOK_RATE, nextFlyMultiplier,
  PITCH_LIMIT, STEP_TILT, STEP_TURN, TURN_RATE,
} from './motion';

// First-person cameras (plan §8.1, §8.2): the look state shared by Fly (P4b)
// and Walk (P5), and the Fly controller. No camera-controls: a first-person
// camera is a position plus a yaw and a pitch (Euler order YXZ, so yaw 0 looks
// down three −Z, estate north; lib/estate/frames.ts headingToThreeYaw).
//
// Fly: W/S (↑/↓) along the view, A/D strafe, ←/→ turn at 90°/s, R/F look up and
// down at 60°/s, E/Space up and Q/C down, Shift × 3, the wheel scales the speed; speed 2 + 0.5 × height
// (2–60 m/s); never lower than 0.3 m above the ground and no collision; drag to
// look with pointer capture, right- or Shift-drag to strafe, and pointer lock
// only when asked (L or CAPTURE). The velocity closes on what the keys ask for
// with a 1/8 s time constant; under halted motion it is exactly what they ask
// for and stops dead, because inertia is motion nobody drove.
//
// P5's Walk reuses LookState (same drag, lock and turn rules) with its own
// mover: walk grids, the eye at 1.6 m, 1.6 / 4.0 m/s.

export interface Bounds2 { minX: number; maxX: number; minZ: number; maxZ: number }

/** Yaw and pitch, applied to a camera's quaternion. */
export class LookState {
  yaw = 0;
  pitch = 0;
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly scratch = new Vector3();

  /** Read the look from a camera's current orientation (a mode switch keeps the view). */
  fromCamera(camera: PerspectiveCamera): this {
    const f = camera.getWorldDirection(this.scratch);
    this.yaw = Math.atan2(-f.x, -f.z);
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, Math.asin(Math.max(-1, Math.min(1, f.y)))));
    return this;
  }

  /** Turn by pixels of drag (or locked mouse movement), scaled to the field of view. */
  dragLook(dx: number, dy: number, fovDeg: number): void {
    const k = LOOK_RATE * (fovDeg / 60);
    this.turn(-dx * k, -dy * k);
  }

  turn(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    if (this.yaw > Math.PI) this.yaw -= 2 * Math.PI;
    else if (this.yaw <= -Math.PI) this.yaw += 2 * Math.PI;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch + dPitch));
  }

  apply(camera: PerspectiveCamera): void {
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(this.euler);
    camera.up.set(0, 1, 0);
  }

  /** Unit view direction. */
  forward(out: Vector3): Vector3 {
    const c = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * c, Math.sin(this.pitch), -Math.cos(this.yaw) * c);
  }

  /** Unit right, level. */
  right(out: Vector3): Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
}

export interface FlyOptions {
  /** Ground height (three Y) under a point: 0 in P4b; P5 samples the site's ground heights. */
  groundAt?: (x: number, z: number) => number;
  /** Where Fly may roam, three world x/z. */
  bounds: Bounds2;
}

export class FlyController {
  readonly mode = 'fly' as const;
  readonly look = new LookState();
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  /** The wheel's speed multiplier. */
  multiplier = 1;
  private readonly camera: PerspectiveCamera;
  private readonly groundAt: (x: number, z: number) => number;
  private readonly bounds: Bounds2;
  private readonly wish = new Vector3();
  private readonly axis = new Vector3();
  private dirty = true;

  constructor(camera: PerspectiveCamera, options: FlyOptions) {
    this.camera = camera;
    this.groundAt = options.groundAt ?? (() => 0);
    this.bounds = options.bounds;
  }

  /** Take over from wherever the camera is, looking where it looks. */
  activate(): void {
    this.position.copy(this.camera.position);
    this.look.fromCamera(this.camera);
    this.velocity.set(0, 0, 0);
    this.clampPosition();
    this.dirty = true;
  }

  heightAboveGround(): number {
    return this.position.y - this.groundAt(this.position.x, this.position.z);
  }

  private clampPosition() {
    const p = this.position;
    const b = this.bounds;
    p.x = Math.max(b.minX - FLY_ROAM, Math.min(b.maxX + FLY_ROAM, p.x));
    p.z = Math.max(b.minZ - FLY_ROAM, Math.min(b.maxZ + FLY_ROAM, p.z));
    const floor = this.groundAt(p.x, p.z) + FLY_CLEARANCE;
    p.y = Math.max(floor, Math.min(FLY_CEILING, p.y));
  }

  /**
   * One frame: keys → velocity → position, then the camera. True while
   * moving or a key is held (the frame loop keeps running, §7.8).
   */
  update(dt: number, held: HeldKeys, halted: boolean): boolean {
    const turn = held.axis('turn-right', 'turn-left');
    const pitch = held.axis('look-down', 'look-up');
    if ((turn !== 0 || pitch !== 0) && dt > 0) {
      this.look.turn(turn * TURN_RATE * dt, pitch * LOOK_KEY_RATE * dt);
      this.dirty = true;
    }
    const fwd = held.axis('back', 'forward');
    const side = held.axis('strafe-left', 'strafe-right');
    const lift = held.axis('down', 'up');
    const wish = this.wish.set(0, 0, 0);
    if (fwd !== 0) wish.addScaledVector(this.look.forward(this.axis), fwd);
    if (side !== 0) wish.addScaledVector(this.look.right(this.axis), side);
    if (lift !== 0) wish.y += lift;
    const length = wish.length();
    if (length > 1) wish.multiplyScalar(1 / length);
    if (length > 0) wish.multiplyScalar(flySpeed(this.heightAboveGround(), held.has('boost'), this.multiplier));
    if (halted) this.velocity.copy(wish);
    else this.velocity.lerp(wish, approachShare(FLY_RESPONSE, dt));
    let moved = false;
    if (this.velocity.lengthSq() > FLY_REST_SPEED * FLY_REST_SPEED) {
      if (dt > 0) {
        this.position.addScaledVector(this.velocity, dt);
        this.clampPosition();
        moved = true;
      }
    } else if (length === 0) {
      this.velocity.set(0, 0, 0);
    }
    if (moved || this.dirty) {
      this.camera.position.copy(this.position);
      this.look.apply(this.camera);
      this.dirty = false;
    }
    // Shift alone moves nothing and asks for no frames; a drag-look frame is
    // drawn by the input that caused it and needs no follow-up.
    return moved || turn !== 0 || pitch !== 0 || length > 0 || this.velocity.lengthSq() > 0;
  }

  /** Drag-to-look (or a locked mouse). */
  dragLook(dx: number, dy: number): void {
    this.look.dragLook(dx, dy, this.camera.fov);
    this.dirty = true;
  }

  /**
   * Right- or Shift-drag strafes: the world follows the pointer, as Overview's
   * pan does. Metres per pixel grow with height, so a drag covers a similar
   * share of the view low or high.
   */
  dragStrafe(dx: number, dy: number, viewHeightPx: number): void {
    const h = Math.max(2, this.heightAboveGround());
    const perPx = (2 * h * Math.tan((this.camera.fov * Math.PI) / 360)) / Math.max(1, viewHeightPx);
    this.position.addScaledVector(this.look.right(this.axis), -dx * perPx);
    this.position.y += dy * perPx;
    this.clampPosition();
    this.dirty = true;
  }

  /** Wheel notches scale the speed (positive: faster). */
  wheel(steps: number): void {
    this.multiplier = nextFlyMultiplier(this.multiplier, steps);
  }

  /**
   * A step button: half a second's travel forward or back (along the view),
   * left or right (strafe), up or down (height); a 15° turn; a 10° look up or
   * down.
   */
  step(kind: EstateWalkStep): void {
    const metres = Math.max(1, Math.min(20, flySpeed(this.heightAboveGround(), false, this.multiplier) * 0.5));
    switch (kind) {
      case 'turn-left': case 'turn-right':
        this.look.turn(kind === 'turn-left' ? STEP_TURN : -STEP_TURN, 0);
        break;
      case 'look-up': case 'look-down':
        this.look.turn(0, kind === 'look-up' ? STEP_TILT : -STEP_TILT);
        break;
      case 'forward': case 'back':
        this.position.addScaledVector(this.look.forward(this.axis), kind === 'forward' ? metres : -metres);
        break;
      case 'left': case 'right':
        this.position.addScaledVector(this.look.right(this.axis), kind === 'right' ? metres : -metres);
        break;
      case 'up': case 'down':
        this.position.y += kind === 'up' ? metres : -metres;
        break;
      default:
    }
    this.clampPosition();
    this.dirty = true;
  }


  /** Stop at once (a freeze, a mode switch, a cancelled drag). */
  stop(): void {
    this.velocity.set(0, 0, 0);
  }

  /** A point 10 m along the view (fog, far plane, getResume's target). */
  getTarget(out: Vector3): Vector3 {
    return out.copy(this.position).addScaledVector(this.look.forward(this.axis), 10);
  }
}
