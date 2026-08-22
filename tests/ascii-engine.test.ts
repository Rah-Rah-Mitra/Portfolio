import { describe, expect, it } from 'vitest';
import {
  ASCII_SOURCE_URL,
  adjustCellColor,
  adjustTone,
  asciiCharsetGlyphs,
  asciiGlyphFor,
  bayerThreshold,
  buildAsciiGrid,
  cellHash,
  computeEdgeField,
  sampleAnimation,
} from '../lib/ascii/electricGaze';

const solidImage = (width: number, height: number, r: number, g: number, b: number) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = r;
    data[index * 4 + 1] = g;
    data[index * 4 + 2] = b;
    data[index * 4 + 3] = 255;
  }
  return { data, width, height };
};

describe('electric gaze ascii engine', () => {
  it('serves the reference photograph from the documented ascii-editor path', () => {
    expect(ASCII_SOURCE_URL).toBe('/ascii-editor/demos/generated/ref-002.webp');
  });

  it('averages source pixels into a cover-fitted cell grid', () => {
    const grid = buildAsciiGrid(solidImage(64, 64, 255, 255, 255), 36, 18, 9);
    expect(grid.columns).toBe(4);
    expect(grid.rows).toBe(2);
    expect(grid.cellSize).toBe(9);
    expect(grid.luminance.every((value) => Math.abs(value - 1) < 0.001)).toBe(true);

    const dark = buildAsciiGrid(solidImage(64, 64, 0, 0, 0), 36, 18, 9);
    expect(dark.luminance.every((value) => value === 0)).toBe(true);

    const halfSplit = solidImage(20, 10, 0, 0, 0);
    for (let y = 0; y < 10; y += 1) {
      for (let x = 10; x < 20; x += 1) {
        const index = (y * 20 + x) * 4;
        halfSplit.data[index] = 255;
        halfSplit.data[index + 1] = 255;
        halfSplit.data[index + 2] = 255;
      }
    }
    const split = buildAsciiGrid(halfSplit, 20, 10, 10);
    expect(split.columns).toBe(2);
    expect(split.luminance[0]!).toBeLessThan(0.05);
    expect(split.luminance[1]!).toBeGreaterThan(0.95);
  });

  it('adjusts tone with brightness, contrast around the midpoint, and inversion', () => {
    expect(adjustTone(0.5, { brightness: 0, contrast: 100, invert: false })).toBeCloseTo(0.5);
    expect(adjustTone(0.5, { brightness: 50, contrast: 100, invert: false })).toBeCloseTo(1);
    expect(adjustTone(0.25, { brightness: 0, contrast: 200, invert: false })).toBeCloseTo(0);
    expect(adjustTone(0.75, { brightness: 0, contrast: 200, invert: false })).toBeCloseTo(1);
    expect(adjustTone(0.2, { brightness: 0, contrast: 100, invert: true })).toBeCloseTo(0.8);
    expect(adjustTone(0.9, { brightness: 80, contrast: 300, invert: false })).toBe(1);
    expect(adjustTone(0.1, { brightness: -80, contrast: 300, invert: false })).toBe(0);
  });

  it('keeps the per-cell hash deterministic, bounded, and salt-sensitive', () => {
    expect(cellHash(3, 7, 1)).toBe(cellHash(3, 7, 1));
    expect(cellHash(3, 7, 1)).not.toBe(cellHash(3, 7, 2));
    expect(cellHash(3, 7, 1)).not.toBe(cellHash(7, 3, 1));
    for (let column = 0; column < 24; column += 1) {
      const value = cellHash(column, column * 3, 5);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('exposes ordered glyph ramps for every charset including custom characters', () => {
    const standard = asciiCharsetGlyphs('standard', '');
    expect(standard.startsWith(' ')).toBe(true);
    expect(standard.length).toBeGreaterThan(10);
    expect(asciiCharsetGlyphs('blocks', '')).toBe(' ░▒▓█');
    expect(asciiCharsetGlyphs('custom', 'RM')).toBe(' RM');
    expect(asciiCharsetGlyphs('custom', '   ')).toBe(' .:-=+*#%@');
    expect(asciiGlyphFor(0, standard)).toBe(' ');
    expect(asciiGlyphFor(1, standard)).toBe(standard[standard.length - 1]);
  });

  it('animates deterministically per style and stays inert at zero intensity', () => {
    const styles = ['wave', 'pulse', 'shimmer', 'ripple', 'flicker'] as const;
    for (const style of styles) {
      const first = sampleAnimation(style, 2.4, 4, 6, 40, 20, 80, 60);
      const second = sampleAnimation(style, 2.4, 4, 6, 40, 20, 80, 60);
      expect(second).toEqual(first);
      const still = sampleAnimation(style, 2.4, 4, 6, 40, 20, 80, 0);
      expect(Math.abs(still.toneShift)).toBeLessThan(0.001);
      expect(Math.abs(still.offsetY)).toBeLessThan(0.001);
    }
    const early = sampleAnimation('wave', 0.2, 4, 6, 40, 20, 80, 60);
    const late = sampleAnimation('wave', 1.1, 4, 6, 40, 20, 80, 60);
    expect(early.toneShift).not.toBeCloseTo(late.toneShift, 5);
  });

  it('orders the Bayer matrix and finds edges only where luminance changes', () => {
    const thresholds = [0, 1, 2, 3].flatMap((row) => [0, 1, 2, 3].map((column) => bayerThreshold(column, row)));
    expect(new Set(thresholds).size).toBe(16);
    expect(Math.min(...thresholds)).toBeGreaterThan(0);
    expect(Math.max(...thresholds)).toBeLessThan(1);

    const flat = computeEdgeField(new Float32Array(16).fill(0.5), 4, 4);
    expect(flat.every((value) => value === 0)).toBe(true);

    const stepped = new Float32Array(16);
    for (let index = 0; index < 16; index += 1) stepped[index] = index % 4 < 2 ? 0 : 1;
    const edges = computeEdgeField(stepped, 4, 4);
    expect(Math.max(...edges)).toBe(1);
    expect(edges[1]).toBeGreaterThan(edges[0]!);
  });

  it('scales cell color by tone while honoring saturation, grayscale, and tint', () => {
    const neutral = adjustCellColor(0.5, 0.5, 0.5, 0.5, { saturation: 100, grayscale: 0, tint: '#3ca6ff', tintOpacity: 0 });
    expect(neutral[0]).toBeCloseTo(neutral[1]);
    expect(neutral[1]).toBeCloseTo(neutral[2]);

    const desaturated = adjustCellColor(0.8, 0.2, 0.2, 0.5, { saturation: 0, grayscale: 0, tint: '#3ca6ff', tintOpacity: 0 });
    expect(desaturated[0]).toBeCloseTo(desaturated[1], 5);

    const tinted = adjustCellColor(0.5, 0.5, 0.5, 0.5, { saturation: 100, grayscale: 0, tint: '#0000ff', tintOpacity: 100 });
    expect(tinted[2]).toBeGreaterThan(tinted[0]);

    const bright = adjustCellColor(0.4, 0.4, 0.4, 1, { saturation: 100, grayscale: 0, tint: '#3ca6ff', tintOpacity: 0 });
    const dim = adjustCellColor(0.4, 0.4, 0.4, 0.05, { saturation: 100, grayscale: 0, tint: '#3ca6ff', tintOpacity: 0 });
    expect(bright[0]).toBeGreaterThan(dim[0]!);
  });
});
