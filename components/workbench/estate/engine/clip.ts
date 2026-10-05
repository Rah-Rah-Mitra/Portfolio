import type { PerspectiveCamera } from 'three';
import { clipPlanes, type ClipPlanes, type ClipPose, type EstateViewMode } from '../../../../lib/estate/frames';

// Near, far and fog for the camera's mode and pose (plan §7.2, §7.3). The maths
// is lib/estate/frames.ts' clipPlanes; this applies it to the three camera,
// touching the projection only when a plane actually moved, and picks the fog
// range: Overview, Plan and Fly fade from target + 150 m to target + 800 m (the
// non-reversed far plane sits exactly at the fog end), Walk from 120 to 600 m.

export const FOG_OVERVIEW_START = 150;
export const FOG_OVERVIEW_END = 800;
export const FOG_WALK_START = 120;
export const FOG_WALK_END = 600;

export interface FogRange { near: number; far: number }

export const fogRange = (mode: EstateViewMode, orbitDistance: number, out: FogRange = { near: 0, far: 0 }): FogRange => {
  if (mode === 'walk') {
    out.near = FOG_WALK_START;
    out.far = FOG_WALK_END;
    return out;
  }
  const d = orbitDistance > 0 && Number.isFinite(orbitDistance) ? orbitDistance : 0;
  out.near = d + FOG_OVERVIEW_START;
  out.far = d + FOG_OVERVIEW_END;
  return out;
};

const PLANE_EPSILON = 1e-3;

/**
 * Sets camera.near/far for the pose and refreshes the projection if either
 * moved by more than a millimetre's worth (relative). Returns whether it did.
 */
export const applyClip = (
  camera: PerspectiveCamera, mode: EstateViewMode, pose: ClipPose, scratch: ClipPlanes = { near: 0, far: 0 },
): boolean => {
  const planes = clipPlanes(mode, pose, scratch);
  const nearMoved = Math.abs(camera.near - planes.near) > PLANE_EPSILON * planes.near;
  const farMoved = Math.abs(camera.far - planes.far) > PLANE_EPSILON * planes.far;
  if (!nearMoved && !farMoved) return false;
  camera.near = planes.near;
  camera.far = planes.far;
  camera.updateProjectionMatrix();
  return true;
};
