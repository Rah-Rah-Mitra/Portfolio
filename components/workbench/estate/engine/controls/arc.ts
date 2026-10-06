import { Euler, Quaternion, Vector3, type PerspectiveCamera } from 'three';
import { easeInOutCubic } from './tween';

// Enter and Exit (plan §8.1): the camera arcs from where it is to a walker's
// eye at an entrance (1.2 s), or back out to an overview pose (1.0 s). The
// position eases along the chord and rises above it by max(20 m, half the
// building's height) at mid-flight, so the camera swings up and over rather
// than through the block; the view turns by spherical interpolation and the
// field of view moves from one lens to the other (45° → 60° in, back out). All
// three world (Y up). Under motionHalted() the caller cuts to the end.

export const ENTER_SECONDS = 1.2;
export const EXIT_SECONDS = 1.0;
/** The least an arc rises above its chord at mid-flight, m. */
export const ARC_RISE_MIN = 20;

/** How high an arc to or from a building rises: max(20 m, half its height). */
export const arcRise = (roofTop: number): number => Math.max(ARC_RISE_MIN, (Number.isFinite(roofTop) ? roofTop : 0) / 2);

export interface ArcEnd {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  fov: number;
}

export interface Arc {
  readonly from: ArcEnd;
  readonly to: ArcEnd;
  rise: number;
  seconds: number;
}

export const arcEnd = (): ArcEnd => ({ position: new Vector3(), quaternion: new Quaternion(), fov: 60 });

/** The camera's current pose as an arc end. */
export const endFromCamera = (camera: PerspectiveCamera, out: ArcEnd = arcEnd()): ArcEnd => {
  out.position.copy(camera.position);
  out.quaternion.copy(camera.quaternion);
  out.fov = camera.fov;
  return out;
};

const EULER = new Euler(0, 0, 0, 'YXZ');

/** An end from a position, a first-person yaw and pitch (Euler YXZ, LookState's), and a lens. */
export const endFromLook = (position: ArrayLike<number>, yaw: number, pitch: number, fov: number, out: ArcEnd = arcEnd()): ArcEnd => {
  out.position.set(position[0], position[1], position[2]);
  EULER.set(pitch, yaw, 0, 'YXZ');
  out.quaternion.setFromEuler(EULER);
  out.fov = fov;
  return out;
};

const DIR = new Vector3();

/** An end looking from `position` at `target` (three world), as camera.lookAt would (−Z towards it, +Y up, no roll). */
export const endLookingAt = (position: ArrayLike<number>, target: ArrayLike<number>, fov: number, out: ArcEnd = arcEnd()): ArcEnd => {
  out.position.set(position[0], position[1], position[2]);
  const dir = DIR.set(target[0] - position[0], target[1] - position[1], target[2] - position[2]);
  if (dir.lengthSq() < 1e-12) dir.set(0, 0, -1);
  dir.normalize();
  return endFromLook(position, Math.atan2(-dir.x, -dir.z), Math.asin(Math.max(-1, Math.min(1, dir.y))), fov, out);
};

export const planArc = (from: ArcEnd, to: ArcEnd, rise: number, seconds: number): Arc => ({
  from: { position: from.position.clone(), quaternion: from.quaternion.clone(), fov: from.fov },
  to: { position: to.position.clone(), quaternion: to.quaternion.clone(), fov: to.fov },
  rise: Math.max(0, rise),
  seconds: seconds > 0 ? seconds : 0,
});

/** True once `elapsed` seconds reach the arc's end. */
export const arcDone = (arc: Arc, elapsed: number): boolean => !(elapsed < arc.seconds);

/**
 * The camera on the arc at `elapsed` seconds (eased; exactly `to` at or past
 * the end): position along the chord plus rise · sin(π·e) up, the view
 * slerped, the lens lerped. Writes the camera's position, quaternion and fov
 * (and its projection when the fov changed).
 */
export const applyArc = (arc: Arc, elapsed: number, camera: PerspectiveCamera): void => {
  const t = arc.seconds > 0 ? elapsed / arc.seconds : 1;
  const e = t < 1 ? easeInOutCubic(t) : 1;
  camera.position.lerpVectors(arc.from.position, arc.to.position, e);
  if (e < 1) camera.position.y += arc.rise * Math.sin(Math.PI * e);
  camera.quaternion.slerpQuaternions(arc.from.quaternion, arc.to.quaternion, e);
  camera.up.set(0, 1, 0);
  const fov = arc.from.fov + (arc.to.fov - arc.from.fov) * e;
  if (Math.abs(camera.fov - fov) > 1e-6) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
};
