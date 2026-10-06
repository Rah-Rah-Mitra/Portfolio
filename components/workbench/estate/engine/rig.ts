import { Vector3, type PerspectiveCamera } from 'three';
import type { EstateViewMode } from '../../../../lib/estate/frames';

// The seam between the render core and whatever moves the camera (plan §8.1).
// The core asks its rig, once per frame, to advance and to say whether it is
// still moving; that answer is what keeps frames coming (§7.8: camera-controls
// reporting motion, first-person movement, a fly-to). The core never moves the
// camera itself, so Overview (camera-controls), Fly, fly-to tweens and P5's
// Walk each plug in as a rig, and the render loop, clip planes, fog, detail
// selection and streaming stay the same whichever is driving.
//
// StaticRig is the rig the core starts with: a pose that only changes when set
// (the poster camera, home(), a resume pose). Interactive rigs replace it
// through EstateCore.setRig().

export interface CameraRig {
  /** The mode the camera is in: picks the clip planes, the fog and the LOD field of view. */
  readonly mode: EstateViewMode;
  /**
   * Advance by `dt` seconds (0 on the first frame after a rest) and apply the
   * pose to the camera. True while still moving: a drag, damping, a transition.
   * Under motionHalted() a rig cuts to the end of any transition rather than
   * animating it; motion the visitor drives still moves.
   */
  update(dt: number): boolean;
  /** The orbit or fly target, three world (fog and far plane follow its distance). */
  getTarget(out: Vector3): Vector3;
  /** A transition (fly-to, climb, fade) is running: a frame-loop `tweens` activity. */
  readonly busy: boolean;
  dispose(): void;
}

export class StaticRig implements CameraRig {
  readonly mode: EstateViewMode = 'overview';
  readonly busy = false;
  private readonly camera: PerspectiveCamera;
  private readonly target = new Vector3();
  private dirty = true;

  constructor(camera: PerspectiveCamera) {
    this.camera = camera;
    this.target.set(0, 0, -1);
  }

  /** Put the camera at `position` looking at `target` (three world), with this vertical FOV. */
  setPose(position: ArrayLike<number>, target: ArrayLike<number>, fovDeg?: number): void {
    this.camera.position.set(position[0], position[1], position[2]);
    this.target.set(target[0], target[1], target[2]);
    if (fovDeg !== undefined && fovDeg > 0 && fovDeg !== this.camera.fov) {
      this.camera.fov = fovDeg;
      this.camera.updateProjectionMatrix();
    }
    this.dirty = true;
  }

  update(): boolean {
    if (!this.dirty) return false;
    this.dirty = false;
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    // Moved this frame, still for the next: one more frame settles readouts.
    return false;
  }

  getTarget(out: Vector3): Vector3 {
    return out.copy(this.target);
  }

  dispose(): void { /* nothing held */ }
}
