import { describe, expect, it } from 'vitest';
import { srgbToLinear } from '../lib/estate/palette';
import { ESTATE_LIGHT, lightRatio, luma, referenceNormals, toonBands, type Rgb } from '../lib/estate/toon';
import { HEMI_INTENSITY, SUN_DIRECTION, SUN_INTENSITY } from '../components/workbench/estate/engine/materials';

// The light rig and toon shading's three bands (lib/estate/toon.ts). The bands
// are computed from the scene's real light colours, the tokens palette.json
// names for them: the sky --paper-75 (75 % --color-bg #f2f2f3, 25 % white) and
// the ground --color-neutral-300 #d4d4d7, both linear.

const linear = (r: number, g: number, b: number): Rgb => [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
const SKY = linear(0.75 * 0xf2 + 0.25 * 255, 0.75 * 0xf2 + 0.25 * 255, 0.75 * 0xf3 + 0.25 * 255);
const GROUND = linear(0xd4, 0xd4, 0xd7);

describe('estate light and toon bands', () => {
  it('is the one source of the engine’s light constants', () => {
    expect(HEMI_INTENSITY).toBe(ESTATE_LIGHT.hemisphere * Math.PI);
    expect(SUN_INTENSITY).toBe(ESTATE_LIGHT.sun * Math.PI);
    expect(SUN_DIRECTION).toEqual(ESTATE_LIGHT.sunDirection);
  });

  it('lights a face as three’s Lambert does: the hemisphere by its normal’s height, the sun by n·l', () => {
    const white: Rgb = [1, 1, 1];
    // Under a white sky and ground the hemisphere is 0.62 whatever the normal.
    expect(lightRatio([0, -1, 0], white, white)).toBeCloseTo(0.62, 9);
    const l = Math.hypot(...ESTATE_LIGHT.sunDirection);
    expect(lightRatio([0, 1, 0], white, white)).toBeCloseTo(0.62 + 0.48 * (0.8 / l), 9);
    // A soffit sees only the ground; a roof the sky and the sun.
    expect(lightRatio([0, -1, 0], SKY, GROUND)).toBeCloseTo(0.62 * luma(GROUND), 9);
    expect(lightRatio([0, 1, 0], SKY, GROUND)).toBeCloseTo((0.62 + 0.48 * (0.8 / l)) * luma(SKY), 9);
  });

  it('puts the roof, the lit walls and the shade in three bands, the top one the token itself', () => {
    const bands = toonBands(SKY, GROUND);
    expect(bands.cuts[0]).toBeCloseTo(0.836, 2);
    expect(bands.cuts[1]).toBeCloseTo(0.582, 2);
    expect(bands.levels[0]).toBeCloseTo(0.735, 2);
    expect(bands.levels[1]).toBeCloseTo(0.532, 2);
    expect(bands.cuts[0]).toBeGreaterThan(bands.cuts[1]);
    expect(1).toBeGreaterThan(bands.levels[0]);
    expect(bands.levels[0]).toBeGreaterThan(bands.levels[1]);
    expect(bands.levels[1]).toBeGreaterThan(0);
    const band = (ratio: number) => (ratio >= bands.cuts[0] ? 0 : ratio >= bands.cuts[1] ? 1 : 2);
    const n = referenceNormals();
    expect(band(lightRatio(n.roof, SKY, GROUND))).toBe(0);
    expect(band(lightRatio(n.sun, SKY, GROUND))).toBe(1);
    expect(band(lightRatio(n.oblique, SKY, GROUND))).toBe(1);
    expect(band(lightRatio(n.shade, SKY, GROUND))).toBe(2);
    // The axis-aligned walls an HDB block actually has: ±X, ±Z.
    expect([[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map((v) => band(lightRatio(v as never, SKY, GROUND)))).toEqual([2, 1, 1, 2]);
    expect(band(lightRatio([0, -1, 0], SKY, GROUND))).toBe(2);
  });
});
