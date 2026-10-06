import { estateToThree, threeToEstate, type Vec3 } from '../../../../lib/estate/frames';
import type { AerialView } from '../../../../lib/estate/schema';

// Camera poses the engine starts from, as plain tuples (no three), so node
// tests pin them: the poster camera (pack.views.aerialNE, plan §8.1 "First
// live frame", lens shift included), the fallback when a pack carries none (a
// dev pack built without ESTATE_views.json: upstream's own aerial_NE numbers),
// and the conversions a resume pose needs.
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

/**
 * Upstream's aerial_NE camera (reports/renders/ESTATE/ESTATE_views.json, the
 * poster render: lens 35 mm on a 36 mm sensor, 1600 × 1200, shift_y −0.123),
 * as an AerialView. The fallback when a pack carries no `views.aerialNE` (a dev
 * pack built without ESTATE_views.json), so the first live frame still lands on
 * the poster it fades in over.
 */
export const FALLBACK_AERIAL_VIEW: Readonly<AerialView> = Object.freeze({
  eye: [568.423279, 568.423279, 337.691345],
  quat: [0.191342, 0.46194, 0.800103, 0.331414],
  vfovDeg: 42.184679,
  shift: [0, -0.123004],
  aspect: 1600 / 1200,
} as AerialView);

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
 * Where a Blender lens shift puts the image centre, as tangent offsets on the
 * camera's own right and up axes (image plane at distance 1). Blender measures
 * shift in units of the larger image side (sensor_fit AUTO), so on a 4:3
 * render shift_y −0.123 moves the centre 2 × 0.123 × (4/3) half-heights down:
 * about 7.2° below the optical axis, 16 % of the frame. Never "a few per cent".
 */
export const shiftOffsets = (view: AerialView): { x: number; y: number; halfTan: number } => {
  const halfTan = Math.tan((view.vfovDeg * Math.PI) / 360);
  const aspect = view.aspect > 0 ? view.aspect : 1;
  const larger = 2 * halfTan * Math.max(aspect, 1);
  return { x: view.shift[0] * larger, y: view.shift[1] * larger, halfTan };
};

/**
 * The poster camera as a three pose. An orbit camera has no lens shift, so it
 * looks through the shifted image centre instead: the view ray is the render's
 * optical axis turned onto that centre, and the vertical FOV spans the same
 * top and bottom edges the shifted frame did (then cropped for the stage as the
 * poster is). Turning instead of shifting keystones the frame a little: the
 * estate's corners land within 2 % of the poster's, where dropping the shift
 * put every point 17 % of the stage lower (tests/estate-engine-helpers.test.ts
 * pins both). The target is where that ray meets the ground (estate z = 0),
 * which is what an orbit about the first frame turns around; a ray that never
 * comes down stops TARGET_REACH metres out.
 */
export const aerialPose = (view: AerialView, stageAspect: number): ThreePose => {
  const forward = rotateByQuat(view.quat, [0, 0, -1]);
  const { x: ox, y: oy, halfTan } = shiftOffsets(view);
  if (ox !== 0 || oy !== 0) {
    const right = rotateByQuat(view.quat, [1, 0, 0]);
    const up = rotateByQuat(view.quat, [0, 1, 0]);
    for (let i = 0; i < 3; i += 1) forward[i] += ox * right[i] + oy * up[i];
    const n = Math.hypot(forward[0], forward[1], forward[2]) || 1;
    for (let i = 0; i < 3; i += 1) forward[i] /= n;
  }
  const eye = view.eye;
  let reach = TARGET_REACH;
  if (forward[2] < -1e-3) reach = Math.min(4 * TARGET_REACH, -eye[2] / forward[2]);
  const target: Vec3 = [eye[0] + forward[0] * reach, eye[1] + forward[1] * reach, eye[2] + forward[2] * reach];
  // The angle between the shifted frame's top and bottom edges, seen from the eye.
  const vfov = oy === 0 ? view.vfovDeg : ((Math.atan(oy + halfTan) - Math.atan(oy - halfTan)) * 180) / Math.PI;
  return {
    position: estateToThree(eye),
    target: estateToThree(target),
    fovDeg: posterFov(vfov, view.aspect, stageAspect),
  };
};

/** The poster camera when the pack has none: upstream's aerial_NE (FALLBACK_AERIAL_VIEW). */
export const fallbackAerialPose = (stageAspect = FALLBACK_AERIAL_VIEW.aspect): ThreePose =>
  aerialPose(FALLBACK_AERIAL_VIEW, stageAspect);

/** The start pose: the pack's poster camera, else the fallback aerial. */
export const posterPose = (view: AerialView | undefined, stageAspect: number): ThreePose =>
  aerialPose(view ?? FALLBACK_AERIAL_VIEW, stageAspect);

/** A resume pose (estate frame) back into the three world, keeping the FOV of the mode it was taken in. */
export const resumePose = (position: ArrayLike<number>, target: ArrayLike<number>, fovDeg: number): ThreePose => ({
  position: estateToThree(position),
  target: estateToThree(target),
  fovDeg,
});

/** Three-world points to the estate frame, for getResume(). */
export const toEstate = (p: ArrayLike<number>): Vec3 => threeToEstate(p);
