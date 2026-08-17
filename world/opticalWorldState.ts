import { computeIntrinsics, computeStereo } from '../lib/cameraMath';
import type { CameraLabSnapshot, CameraShotDefinition, ResponsiveTier, Vector3Tuple } from '../types';

export type OrbitState = { azimuth: number; polar: number; distance: number };
export type OrbitLimits = NonNullable<CameraShotDefinition['orbitLimits']>;

const clamp = (value: number, range: [number, number]) => Math.max(range[0], Math.min(range[1], value));

export const constrainOrbitState = (state: OrbitState, limits: OrbitLimits): OrbitState => ({
  azimuth: clamp(state.azimuth, limits.azimuth),
  polar: clamp(state.polar, limits.polar),
  distance: clamp(state.distance, limits.distance),
});

export const applyCharacterFraming = (position: Vector3Tuple, framing?: CameraShotDefinition['characterFraming']) => ({
  position: framing ? [position[0] + framing.offset[0], position[1] + framing.offset[1], position[2] + framing.offset[2]] as Vector3Tuple : [...position] as Vector3Tuple,
  scale: framing?.scale ?? 1,
});

export const resolveResponsiveCameraShot = (shot: CameraShotDefinition, tier: ResponsiveTier): CameraShotDefinition => (
  tier === 'desktop' ? shot : { ...shot, ...shot.responsive?.[tier] }
);

export class ActiveResponsiveShot {
  current: CameraShotDefinition;
  constructor(shot: CameraShotDefinition) { this.current = shot; }
  update(shot: CameraShotDefinition, tier: ResponsiveTier) { this.current = resolveResponsiveCameraShot(shot, tier); return this.current; }
  set(shot: CameraShotDefinition) { this.current = shot; return this.current; }
}

export type ScreenRect = { left: number; top: number; right: number; bottom: number };
export const resolveSafePlacement = (point: { x: number; y: number }, exclusions: readonly ScreenRect[], viewport: { width: number; height: number }) => {
  const inside = (candidate: { x: number; y: number }) => exclusions.findIndex((rect) => candidate.x >= rect.left && candidate.x <= rect.right && candidate.y >= rect.top && candidate.y <= rect.bottom);
  const overlap = inside(point);
  if (overlap < 0) return { ...point, visible: true, occludedBy: null };
  const rect = exclusions[overlap];
  const candidates = [{ x: rect.right + 18, y: point.y }, { x: rect.left - 18, y: point.y }, { x: point.x, y: rect.bottom + 18 }, { x: point.x, y: rect.top - 18 }];
  const safe = candidates.find((candidate) => candidate.x >= 0 && candidate.x <= viewport.width && candidate.y >= 0 && candidate.y <= viewport.height && inside(candidate) < 0);
  return safe ? { ...safe, visible: true, occludedBy: overlap } : { ...point, visible: false, occludedBy: overlap };
};

export const deriveOpticalGeometry = (snapshot: CameraLabSnapshot) => {
  const intrinsics = computeIntrinsics(snapshot.intrinsics);
  const stereo = computeStereo(snapshot.stereo);
  return {
    frustumScale: intrinsics.valid ? Math.tan(intrinsics.horizontalFovDegrees * Math.PI / 360) : 0,
    imagePlane: [snapshot.intrinsics.imageWidthPx, snapshot.intrinsics.imageHeightPx] as [number, number],
    distortion: [snapshot.intrinsics.k1, snapshot.intrinsics.k2] as [number, number],
    irisAperture: snapshot.optics.focalLengthMm / snapshot.optics.fNumber,
    focusPlane: snapshot.optics.focusDistanceMm,
    cameraPose: [...snapshot.extrinsics.camera, snapshot.extrinsics.yawDegrees, snapshot.extrinsics.pitchDegrees, snapshot.extrinsics.rollDegrees] as [number, number, number, number, number, number],
    objectPose: snapshot.extrinsics.object,
    stereoBaseline: snapshot.stereo.baselineMeters,
    triangulatedDepth: stereo.valid ? stereo.depthMeters : null,
  };
};

export interface OpticalGeometryAdapter {
  frustumScale: number; imagePlaneAspect: number; distortion: [number, number]; irisAperture: number;
  focusPlane: number; cameraPose: [number, number, number, number, number, number]; objectPose: Vector3Tuple;
  stereoLeftX: number; stereoRightX: number; triangulatedDepth: number | null; renderCount: number;
}

export const applyOpticalGeometryToAdapter = (snapshot: CameraLabSnapshot, adapter: OpticalGeometryAdapter) => {
  const state = deriveOpticalGeometry(snapshot);
  adapter.frustumScale = state.frustumScale;
  adapter.imagePlaneAspect = state.imagePlane[0] > 0 && state.imagePlane.every(Number.isFinite) ? state.imagePlane[1] / state.imagePlane[0] : 1;
  adapter.distortion = [...state.distortion];
  adapter.irisAperture = Number.isFinite(state.irisAperture) ? state.irisAperture : 0;
  adapter.focusPlane = Number.isFinite(state.focusPlane) ? state.focusPlane : 0;
  adapter.cameraPose = state.cameraPose.every(Number.isFinite) ? [...state.cameraPose] : [0, 0, 0, 0, 0, 0];
  adapter.objectPose = state.objectPose.every(Number.isFinite) ? [...state.objectPose] : [0, 0, 0];
  const halfBaseline = Number.isFinite(state.stereoBaseline) && state.stereoBaseline > 0 ? state.stereoBaseline / 2 : 0;
  adapter.stereoLeftX = -halfBaseline; adapter.stereoRightX = halfBaseline;
  adapter.triangulatedDepth = state.triangulatedDepth;
  adapter.renderCount += 1;
};

export interface CameraAdapter {
  position: Vector3Tuple; target: Vector3Tuple; fov: number; near: number; far: number; roll: number;
  exposure: number; focusDistance: number; lighting: { key: number; fill: number; environment: number; keyColor?: string; fillColor?: string }; renderCount: number;
}
export const applyCameraShotToAdapter = (shot: CameraShotDefinition, adapter: CameraAdapter) => {
  const delta: Vector3Tuple = [shot.position[0] - shot.target[0], shot.position[1] - shot.target[1], shot.position[2] - shot.target[2]];
  const length = Math.hypot(...delta);
  const direction: Vector3Tuple = length > 0 ? [delta[0] / length, delta[1] / length, delta[2] / length] : [0, 0, 1];
  adapter.position = shot.dollyDistance === undefined ? [...shot.position] : [shot.target[0] + direction[0] * shot.dollyDistance, shot.target[1] + direction[1] * shot.dollyDistance, shot.target[2] + direction[2] * shot.dollyDistance];
  adapter.target = [...shot.target]; adapter.fov = shot.fov; adapter.near = shot.near; adapter.far = shot.far;
  adapter.roll = shot.roll ?? 0; adapter.exposure = shot.exposure ?? 1; adapter.focusDistance = shot.focusDistance ?? 6;
  adapter.lighting = { ...(shot.lighting ?? { key: 3, fill: 2.1, environment: 1, keyColor: '#ffffff', fillColor: '#ffffff' }) }; adapter.renderCount += 1;
};
