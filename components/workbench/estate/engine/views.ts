import { estateToThree, threeToEstate, type Vec3 } from '../../../../lib/estate/frames';
import type { AerialView } from '../../../../lib/estate/schema';

// Camera poses the engine starts from, as plain tuples (no three), so node
// tests pin them: the poster camera (pack.views.aerialNE, plan §8.1 "First
// live frame"), the fallback when a pack carries none (a dev pack built
// without ESTATE_views.json), and the conversions a resume pose needs.
//
// Frames (lib/estate/frames.ts): an AerialView is upstream's Blender camera in
// the estate frame (Z up), looking down its local −Z with +Y up, rotated by
// `quat` (x, y, z, w). The three camera wants three-world points, so a pose
// here is converted once, at the edge, with estateToThree.

/** A camera pose in the three world: eye, the point it looks at, the vertical FOV in degrees. */
export interface ThreePose {
  position: Vec3;
  target: Vec3;
  fovDeg: number;
}

/** The estate's middle at street level (estate frame): where the fallback camera looks. */
export const ESTATE_CENTRE: Readonly<Vec3> = Object.freeze([200, 200, 8] as Vec3);

// The fallback poster camera: from the north-east, 35° down, far enough that a
// 45° FOV holds the 400 m square at a 4:3 stage (the poster render's framing).
const FALLBACK_AZIMUTH = Math.PI / 4; // towards +x +y from the centre: north-east
const FALLBACK_ELEVATION = (35 * Math.PI) / 180;
const FALLBACK_DISTANCE = 640;
export const FALLBACK_FOV_DEG = 45;

/** How far along the view ray a pose's target sits when the ray never meets the ground, m. */
const TARGET_REACH = 400;

/** Rotate v by the unit quaternion q = (x, y, z, w). */
export const rotateByQuat = (q: ArrayLike<number>, v: ArrayLike<number>, out: Vec3 = [0, 0, 0]): Vec3 => {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const vx = v[0], vy = v[1], vz = v[2];
  // t = 2 (q.xyz × v); v' = v + w t + q.xyz × t
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out[0] = vx + qw * tx + (qy * tz - qz * ty);
  out[1] = vy + qw * ty + (qz * tx - qx * tz);
  out[2] = vz + qw * tz + (qx * ty - qy * tx);
  return out;
};

/**
 * The vertical FOV that shows what the poster shows on a stage of another
 * shape. The poster fills the stage like `object-fit: cover`: a stage wider
 * than the render crops its top and bottom, so the camera narrows to match; a
 * narrower one crops the sides, and the vertical FOV is the render's own.
 */
export const posterFov = (vfovDeg: number, posterAspect: number, stageAspect: number): number => {
  if (!(stageAspect > posterAspect) || !(posterAspect > 0)) return vfovDeg;
  const half = Math.tan((vfovDeg * Math.PI) / 360) * (posterAspect / stageAspect);
  return (Math.atan(half) * 360) / Math.PI;
};

/**
 * The poster camera as a three pose. Its target is where the view ray meets
 * the ground (estate z = 0), which is what an orbit about the first frame turns
 * around; a ray that never comes down stops TARGET_REACH metres out. Lens shift
 * is not applied: the poster render's shift is a few per cent of the frame, and
 * an orbit camera has no shift to carry it.
 */
export const aerialPose = (view: AerialView, stageAspect: number): ThreePose => {
  const forward = rotateByQuat(view.quat, [0, 0, -1]);
  const eye = view.eye;
  let reach = TARGET_REACH;
  if (forward[2] < -1e-3) reach = Math.min(4 * TARGET_REACH, -eye[2] / forward[2]);
  const target: Vec3 = [eye[0] + forward[0] * reach, eye[1] + forward[1] * reach, eye[2] + forward[2] * reach];
  return {
    position: estateToThree(eye),
    target: estateToThree(target),
    fovDeg: posterFov(view.vfovDeg, view.aspect, stageAspect),
  };
};

/** The north-east aerial used when the pack has no poster camera. */
export const fallbackAerialPose = (): ThreePose => {
  const c = ESTATE_CENTRE;
  const flat = Math.cos(FALLBACK_ELEVATION) * FALLBACK_DISTANCE;
  const eye: Vec3 = [
    c[0] + flat * Math.cos(FALLBACK_AZIMUTH),
    c[1] + flat * Math.sin(FALLBACK_AZIMUTH),
    c[2] + Math.sin(FALLBACK_ELEVATION) * FALLBACK_DISTANCE,
  ];
  return { position: estateToThree(eye), target: estateToThree(c), fovDeg: FALLBACK_FOV_DEG };
};

/** The start pose: the pack's poster camera, else the fallback aerial. */
export const posterPose = (view: AerialView | undefined, stageAspect: number): ThreePose =>
  (view ? aerialPose(view, stageAspect) : fallbackAerialPose());

/** A resume pose (estate frame) back into the three world, keeping the FOV of the mode it was taken in. */
export const resumePose = (position: ArrayLike<number>, target: ArrayLike<number>, fovDeg: number): ThreePose => ({
  position: estateToThree(position),
  target: estateToThree(target),
  fovDeg,
});

/** Three-world points to the estate frame, for getResume(). */
export const toEstate = (p: ArrayLike<number>): Vec3 => threeToEstate(p);
