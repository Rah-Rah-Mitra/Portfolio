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
  });
});
