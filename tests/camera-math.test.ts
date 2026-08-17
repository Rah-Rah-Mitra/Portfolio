import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTRINSICS,
  DEFAULT_INTRINSICS,
  DEFAULT_OPTICS,
  DEFAULT_STEREO,
  computeExtrinsics,
  computeIntrinsics,
  computeOptics,
  computeStereo,
  distortNormalizedPoint,
} from '../lib/cameraMath';

describe('camera laboratory math', () => {
  it('derives the default pixel focal lengths, fields of view, and K literally', () => {
    const result = computeIntrinsics(DEFAULT_INTRINSICS);
    expect(result.valid).toBe(true);
    expect(result.fx).toBeCloseTo(622.222222, 6);
    expect(result.fy).toBeCloseTo(700, 6);
    expect(result.horizontalFovDegrees).toBeCloseTo(54.432223, 5);
    expect(result.verticalFovDegrees).toBeCloseTo(37.849289, 5);
    expect(result.K).toEqual([
      [result.fx, 0, 320],
      [0, result.fy, 240],
      [0, 0, 1],
    ]);
  });

  it('applies radial distortion scale = 1 + k1*r2 + k2*r4', () => {
    expect(distortNormalizedPoint([0.5, -0.25], 0.1, -0.02)).toEqual([
      0.5 * (1 + 0.1 * 0.3125 - 0.02 * 0.3125 ** 2),
      -0.25 * (1 + 0.1 * 0.3125 - 0.02 * 0.3125 ** 2),
    ]);
  });

  it('projects positive camera-forward depth and labels points behind the camera', () => {
    const centered = computeExtrinsics(DEFAULT_EXTRINSICS, DEFAULT_INTRINSICS);
    expect(centered.valid).toBe(true);
    expect(centered.viewPoint).toEqual([0, 0, 3]);
    expect(centered.pixel).toEqual([320, 240]);
    const behind = computeExtrinsics({ ...DEFAULT_EXTRINSICS, object: [0, 0, -1] }, DEFAULT_INTRINSICS);
    expect(behind.valid).toBe(false);
    expect(behind.pixel).toBeNull();
    expect(behind.error).toMatch(/behind/i);
  });

  it('computes the documented thin-lens analytic sensor blur circle', () => {
    const result = computeOptics(DEFAULT_OPTICS);
    const f = 50;
    const v = f * 2000 / (2000 - f);
    const vf = f * 3000 / (3000 - f);
    const expected = (f / 4) * Math.abs(v - vf) / v;
    expect(result.valid).toBe(true);
    expect(result.blurCircleMm).toBeCloseTo(expected, 10);
    expect(computeOptics({ ...DEFAULT_OPTICS, objectDistanceMm: 50 }).valid).toBe(false);
  });

  it('triangulates the 3.0m default and reports reference error', () => {
    const result = computeStereo(DEFAULT_STEREO);
    expect(result.valid).toBe(true);
    expect(result.depthMeters).toBe(3);
    expect(result.absoluteErrorMeters).toBeCloseTo(0.2, 10);
    expect(result.relativeError).toBeCloseTo(0.0625, 10);
    expect(computeStereo({ ...DEFAULT_STEREO, disparityPx: 0 }).valid).toBe(false);
    expect(computeIntrinsics({ ...DEFAULT_INTRINSICS, sensorWidthMm: 0 }).valid).toBe(false);
  });
});
