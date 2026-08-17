import { describe, expect, it } from 'vitest';
import { applyCameraShotToAdapter, applyOpticalGeometryToAdapter, deriveOpticalGeometry, resolveSafePlacement } from '../world/opticalWorldState';
import * as worldState from '../world/opticalWorldState';
import { cameraShots } from '../world/narrativeManifest';
import type { CameraLabSnapshot } from '../types';

const snapshot: CameraLabSnapshot = {
  mode: 'stereo', intrinsics: { imageWidthPx: 640, imageHeightPx: 480, focalLengthMm: 35, sensorWidthMm: 36, sensorHeightMm: 24, principalX: 320, principalY: 240, k1: 0, k2: 0 },
  extrinsics: { camera: [1, 2, 3], yawDegrees: 4, pitchDegrees: 5, rollDegrees: 6, object: [0, 0, 5] },
  optics: { fNumber: 4, focalLengthMm: 50, objectDistanceMm: 2000, focusDistanceMm: 3000 },
  stereo: { focalPx: 700, baselineMeters: .12, disparityPx: 28, referenceDepthMeters: 3.2 },
};

describe('optical renderer state adapters', () => {
  it('derives visible geometry from every camera-lab subsystem', () => {
    const state = deriveOpticalGeometry(snapshot);
    expect(state.frustumScale).toBeGreaterThan(0);
    expect(state.imagePlane).toEqual([640, 480]);
    expect(state.distortion).toEqual([0, 0]);
    expect(state.irisAperture).toBeCloseTo(12.5);
    expect(state.focusPlane).toBe(3000);
    expect(state.cameraPose).toEqual([1, 2, 3, 4, 5, 6]);
    expect(state.objectPose).toEqual([0, 0, 5]);
    expect(state.stereoBaseline).toBe(.12);
    expect(state.triangulatedDepth).toBe(3);
  });

  it('pushes successive typed lab snapshots into changed renderer properties', () => {
    const adapter = { frustumScale: 0, imagePlaneAspect: 0, distortion: [0, 0] as [number, number], irisAperture: 0, focusPlane: 0, cameraPose: [0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number], objectPose: [0, 0, 0] as [number, number, number], stereoLeftX: 0, stereoRightX: 0, triangulatedDepth: null as number | null, renderCount: 0 };
    applyOpticalGeometryToAdapter(snapshot, adapter);
    expect(adapter).toMatchObject({ imagePlaneAspect: 0.75, cameraPose: [1, 2, 3, 4, 5, 6], objectPose: [0, 0, 5], stereoLeftX: -0.06, stereoRightX: 0.06, triangulatedDepth: 3, renderCount: 1 });
    const firstFrustum = adapter.frustumScale;
    applyOpticalGeometryToAdapter({ ...snapshot, intrinsics: { ...snapshot.intrinsics, focalLengthMm: 70 }, stereo: { ...snapshot.stereo, baselineMeters: .2 } }, adapter);
    expect(adapter.frustumScale).not.toBe(firstFrustum);
    expect(adapter.stereoLeftX).toBe(-.1);
    expect(adapter.renderCount).toBe(2);
  });

  it('applies every live director camera property', () => {
    const adapter = { position: [0, 0, 0] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: 0, near: 0, far: 0, roll: 0, exposure: 0, focusDistance: 0, lighting: { key: 0, fill: 0, environment: 0, keyColor: '#ffffff', fillColor: '#ffffff' }, renderCount: 0 };
    applyCameraShotToAdapter({ ...cameraShots[0], roll: .2, exposure: 1.2, focusDistance: 7, lighting: { key: 3, fill: 2, environment: 1, keyColor: '#d9fffb', fillColor: '#fff4dc' } }, adapter);
    expect(adapter).toMatchObject({ position: cameraShots[0].position, target: cameraShots[0].target, fov: cameraShots[0].fov, roll: .2, exposure: 1.2, focusDistance: 7, lighting: { key: 3, fill: 2, environment: 1, keyColor: '#d9fffb', fillColor: '#fff4dc' }, renderCount: 1 });
  });

  it('applies dolly distance along the authored camera-to-target line', () => {
    const adapter = { position: [0, 0, 0] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: 0, near: 0, far: 0, roll: 0, exposure: 0, focusDistance: 0, lighting: { key: 0, fill: 0, environment: 0 }, renderCount: 0 };
    applyCameraShotToAdapter({ ...cameraShots[0], position: [0, 0, 10], target: [0, 0, 0], dollyDistance: 4 }, adapter);
    expect(adapter.position).toEqual([0, 0, 4]);
  });

  it('clamps live Explore orbit state to authored azimuth, polar, and distance limits', () => {
    const constrain = (worldState as typeof worldState & { constrainOrbitState?: (state: { azimuth: number; polar: number; distance: number }, limits: { azimuth: [number, number]; polar: [number, number]; distance: [number, number] }) => { azimuth: number; polar: number; distance: number } }).constrainOrbitState;
    expect(constrain).toBeTypeOf('function');
    expect(constrain?.({ azimuth: 2, polar: -1, distance: 20 }, { azimuth: [-.5, .5], polar: [.2, 1], distance: [4, 8] })).toEqual({ azimuth: .5, polar: .2, distance: 8 });
  });

  it('applies live Courier framing scale and world offset', () => {
    const frame = (worldState as typeof worldState & { applyCharacterFraming?: (position: [number, number, number], framing?: { scale: number; offset: [number, number, number] }) => { position: [number, number, number]; scale: number } }).applyCharacterFraming;
    expect(frame).toBeTypeOf('function');
    expect(frame?.([1, 2, 3], { scale: .75, offset: [1, -1, .5] })).toEqual({ position: [2, 1, 3.5], scale: .75 });
  });

  it.each([
    ['mobile', [0, 2.6, 9], 48],
    ['tablet', [1.2, 2.1, 8.2], 44],
  ] as const)('retains the active %s shot for Explore restore', (tier, expectedPosition, expectedFov) => {
    const Store = (worldState as typeof worldState & { ActiveResponsiveShot?: new (shot: typeof cameraShots[number]) => { update: (shot: typeof cameraShots[number], tier: 'mobile' | 'tablet' | 'desktop') => typeof cameraShots[number]; current: typeof cameraShots[number] } }).ActiveResponsiveShot;
    expect(Store).toBeTypeOf('function');
    const authored = cameraShots.find((shot) => shot.id === 'camera-lab')!;
    const base = { ...authored, responsive: { ...authored.responsive, tablet: { position: [1.2, 2.1, 8.2] as [number, number, number], fov: 44 } } };
    const store = Store ? new Store(base) : null;
    const responsive = store?.update(base, tier);
    expect(responsive).toMatchObject({ position: expectedPosition, fov: expectedFov });
    expect(store?.current).toBe(responsive);
  });

  it('moves or hides world placement that overlaps semantic exclusions', () => {
    const exclusion = { left: 40, top: 40, right: 160, bottom: 160 };
    expect(resolveSafePlacement({ x: 100, y: 100 }, [exclusion], { width: 300, height: 300 })).toEqual({ x: 178, y: 100, visible: true, occludedBy: 0 });
    const surrounded = [exclusion, { left: 160, top: 40, right: 300, bottom: 160 }, { left: 0, top: 0, right: 300, bottom: 300 }];
    expect(resolveSafePlacement({ x: 100, y: 100 }, surrounded, { width: 300, height: 300 }).visible).toBe(false);
  });
});
