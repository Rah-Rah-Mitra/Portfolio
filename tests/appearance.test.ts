import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_STORAGE_KEY,
  appearanceReducer,
  asciiPostEffectIds,
  asciiRenderModes,
  defaultAppearancePreferences,
  defaultAsciiPreferences,
  parseAppearancePreferences,
  resolveColorScheme,
} from '../lib/appearance';

describe('dark optical desktop appearance contract', () => {
  it('defaults first visits and invalid records to dark teal N-body', () => {
    expect(defaultAppearancePreferences).toMatchObject({
      scheme: 'dark',
      accent: 'teal',
      background: 'nbody',
      backgroundPaused: false,
      windowTint: 'graphite',
      titlebarOpacity: 92,
      reduceTransparency: false,
      dockSize: 'medium',
      nbody: {
        preset: 'galaxy',
        particleCount: 2048,
        expansionOrder: 8,
        leafCapacity: 48,
      },
    });
    expect(parseAppearancePreferences(null)).toEqual(defaultAppearancePreferences);
    expect(parseAppearancePreferences('{not json')).toEqual(defaultAppearancePreferences);
    expect(parseAppearancePreferences(JSON.stringify({ ...defaultAppearancePreferences, scheme: 'sepia' }))).toEqual(defaultAppearancePreferences);
    expect(parseAppearancePreferences(JSON.stringify({ ...defaultAppearancePreferences, titlebarOpacity: 72 }))).toEqual(defaultAppearancePreferences);
  });

  it('accepts a complete bounded preference record without sharing mutable defaults', () => {
    const candidate = {
      ...defaultAppearancePreferences,
      scheme: 'system' as const,
      accent: 'violet' as const,
      background: 'fluid' as const,
      titlebarOpacity: 88,
      dockSize: 'large' as const,
      nbody: { ...defaultAppearancePreferences.nbody, particleCount: 4096, expansionOrder: 10 as const, leafCapacity: 96 as const },
      fluid: { ...defaultAppearancePreferences.fluid, speed: 2, opacity: 60 },
    };
    const parsed = parseAppearancePreferences(JSON.stringify(candidate));
    expect(parsed).toEqual(candidate);
    expect(parsed).not.toBe(candidate);
    expect(parsed.nbody).not.toBe(defaultAppearancePreferences.nbody);
    expect(APPEARANCE_STORAGE_KEY).toBe('portfolio-appearance-v1');
  });

  it('resolves System independently from the persisted preference', () => {
    expect(resolveColorScheme('dark', false)).toBe('dark');
    expect(resolveColorScheme('light', true)).toBe('light');
    expect(resolveColorScheme('system', true)).toBe('dark');
    expect(resolveColorScheme('system', false)).toBe('light');
  });

  it('ships the Electric Gaze ASCII field with the reference defaults and window glow on', () => {
    expect(defaultAppearancePreferences.windowGlow).toBe(true);
    expect(defaultAsciiPreferences).toMatchObject({
      renderMode: 'dither',
      bgMode: 'none',
      cellSize: 9,
      coverage: 100,
      density: 20,
      contrast: 158,
      brightness: 0,
      saturation: 100,
      grayscale: 0,
      invert: false,
      tint: '#3ca6ff',
      tintOpacity: 0,
      animated: true,
      animStyle: 'shimmer',
      animSpeed: 100,
      animIntensity: 60,
    });
    expect(asciiRenderModes).toHaveLength(25);
    expect(asciiPostEffectIds).toHaveLength(9);
    expect(asciiPostEffectIds.every((id) => defaultAsciiPreferences.pfx[id].enabled === false)).toBe(true);
  });

  it('validates ascii records strictly and rejects out-of-range values', () => {
    const asciiCandidate = {
      ...defaultAppearancePreferences,
      background: 'ascii' as const,
      ascii: { ...defaultAsciiPreferences, renderMode: 'matrix' as const, cellSize: 14, animStyle: 'ripple' as const },
    };
    const parsed = parseAppearancePreferences(JSON.stringify(asciiCandidate));
    expect(parsed).toEqual(asciiCandidate);
    expect(parsed.ascii).not.toBe(asciiCandidate.ascii);
    expect(parsed.ascii.pfx).not.toBe(asciiCandidate.ascii.pfx);

    const invalidMode = { ...asciiCandidate, ascii: { ...defaultAsciiPreferences, renderMode: 'neon' } };
    expect(parseAppearancePreferences(JSON.stringify(invalidMode))).toEqual(defaultAppearancePreferences);
    const invalidCell = { ...asciiCandidate, ascii: { ...defaultAsciiPreferences, cellSize: 2 } };
    expect(parseAppearancePreferences(JSON.stringify(invalidCell))).toEqual(defaultAppearancePreferences);
    const invalidTint = { ...asciiCandidate, ascii: { ...defaultAsciiPreferences, tint: 'blue' } };
    expect(parseAppearancePreferences(JSON.stringify(invalidTint))).toEqual(defaultAppearancePreferences);
    const missingEffect = { ...asciiCandidate, ascii: { ...defaultAsciiPreferences, pfx: { ...defaultAsciiPreferences.pfx, bloom: undefined } } };
    expect(parseAppearancePreferences(JSON.stringify(missingEffect))).toEqual(defaultAppearancePreferences);
  });

  it('patches ascii preferences with deep post-effect merges and resets with the background', () => {
    const patched = appearanceReducer(defaultAppearancePreferences, {
      type: 'PATCH_ASCII',
      patch: { renderMode: 'characters', pfx: { bloom: { enabled: true, intensity: 40 } } as never },
    });
    expect(patched.ascii.renderMode).toBe('characters');
    expect(patched.ascii.pfx.bloom).toEqual({ enabled: true, intensity: 40 });
    expect(patched.ascii.pfx.vignette).toEqual(defaultAsciiPreferences.pfx.vignette);
    expect(patched.ascii.cellSize).toBe(defaultAsciiPreferences.cellSize);

    const glowOff = appearanceReducer(patched, { type: 'SET_WINDOW_GLOW', glow: false });
    expect(glowOff.windowGlow).toBe(false);

    const reset = appearanceReducer(glowOff, { type: 'RESET_BACKGROUND' });
    expect(reset.ascii).toEqual(defaultAsciiPreferences);
    expect(reset.windowGlow).toBe(false);
  });

});
