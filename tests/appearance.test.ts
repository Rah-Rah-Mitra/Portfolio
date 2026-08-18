import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_STORAGE_KEY,
  defaultAppearancePreferences,
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

});
