import { describe, expect, it } from 'vitest';
import { mergeCameraShots, validateCameraShot } from '../scripts/camera/validate-merge-shots.mjs';
import { cameraShots } from '../world/narrativeManifest';

describe('camera manifest merge', () => {
  it('replaces matching IDs while preserving repository shots', () => {
    const changed = { ...cameraShots[0], fov: 55 };
    const merged = mergeCameraShots(cameraShots, [changed]);
    expect(merged).toHaveLength(cameraShots.length);
    expect(merged.find((shot) => shot.id === changed.id)?.fov).toBe(55);
  });

  it('rejects malformed vectors, ranges, easing, and responsive overrides', () => {
    expect(() => validateCameraShot({ ...cameraShots[0], position: [0, Number.NaN, 1] })).toThrow(/position/i);
    expect(() => validateCameraShot({ ...cameraShots[0], scrollRange: [.8, .2] })).toThrow(/scroll range/i);
    expect(() => validateCameraShot({ ...cameraShots[0], transition: { duration: .2, easing: '' } })).toThrow(/easing/i);
    expect(() => validateCameraShot({ ...cameraShots[0], responsive: { mobile: { fov: Number.POSITIVE_INFINITY } } })).toThrow(/responsive/i);
    expect(() => validateCameraShot({ ...cameraShots[0], responsive: { mobile: { near: 10, far: 2 } } })).toThrow(/responsive/i);
    expect(() => validateCameraShot({ ...cameraShots[0], responsive: { tablet: { scrollRange: [.9, .1] } } })).toThrow(/responsive/i);
    expect(() => validateCameraShot({ ...cameraShots[0], responsive: 7 })).toThrow(/responsive/i);
    expect(() => validateCameraShot({ ...cameraShots[0], responsive: { tablet: { transition: { duration: .2, easing: 9 } } } })).toThrow(/responsive/i);
    expect(() => validateCameraShot({ ...cameraShots[0], id: 123 })).toThrow(/id/i);
    expect(() => validateCameraShot({ ...cameraShots[0], chapterId: '   ' })).toThrow(/chapter/i);
    expect(() => validateCameraShot({ ...cameraShots[0], responsive: { mobile: [] } })).toThrow(/responsive/i);
    expect(() => validateCameraShot({ ...cameraShots[0], responsive: { mobile: { id: 'mobile-identity' } } })).toThrow(/responsive/i);
  });

  it.each([
    ['roll', { roll: Number.NaN }],
    ['focus', { focusDistance: 0 }],
    ['dolly', { dollyDistance: Number.POSITIVE_INFINITY }],
    ['exposure', { exposure: -1 }],
    ['lighting', { lighting: { key: -1, fill: 2, environment: 1, keyColor: '#ffffff', fillColor: '#ffffff' } }],
    ['color', { lighting: { key: 3, fill: 2, environment: 1, keyColor: 'teal', fillColor: '#ffffff' } }],
    ['orbit', { orbitLimits: { azimuth: [1, -1], polar: [.6, 1.5], distance: [4, 10] } }],
    ['orbit distance', { orbitLimits: { azimuth: [-1, 1], polar: [.6, 1.5], distance: [0, 10] } }],
    ['character', { characterFraming: { scale: 1, offset: [0, Number.NaN, 0] } }],
    ['safe text', { safeTextRegionIds: [''] }],
  ])('rejects invalid optional %s data', (_label, patch) => {
    expect(() => validateCameraShot({ ...cameraShots[0], ...patch })).toThrow();
  });

  it('validates optional fields inside responsive overrides with base fallbacks', () => {
    expect(() => validateCameraShot({ ...cameraShots[0], responsive: { mobile: { focusDistance: 0 } } })).toThrow(/responsive/i);
    expect(() => validateCameraShot({ ...cameraShots[0], responsive: { tablet: { orbitLimits: { azimuth: [-1, 1], polar: [1, .5], distance: [4, 8] } } } })).toThrow(/responsive/i);
    expect(() => validateCameraShot({ ...cameraShots[0], responsive: { mobile: { lighting: { key: 3, fill: 2, environment: 1, keyColor: '#00zz00', fillColor: '#ffffff' } } } })).toThrow(/responsive/i);
    expect(() => validateCameraShot({ ...cameraShots[0], responsive: { mobile: { characterFraming: { scale: 0, offset: [0, 0, 0] } } } })).toThrow(/responsive/i);
  });
});
