import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  detectExperienceCapabilities,
  modeFromSearch,
  resolveExperiencePolicy,
} from '../lib/experienceMode';

describe('portfolio experience mode', () => {
  it('still recognizes an explicit ?mode= in the URL', () => {
    expect(modeFromSearch('?mode=scan')).toBe('scan');
    expect(modeFromSearch('?ref=recruiter&mode=scan')).toBe('scan');
    expect(modeFromSearch('?mode=guided')).toBe('guided');
    expect(modeFromSearch('')).toBeNull();
  });

  it('withholds heavy assets under Save-Data', () => {
    expect(resolveExperiencePolicy({ saveData: true, reducedMotion: false })).toMatchObject({ mode: 'scan', allowHeavyAssets: false, reason: 'save-data' });
  });

  it('keeps reduced-motion rendering static without forcing Quick Scan', () => {
    expect(resolveExperiencePolicy({ saveData: false, reducedMotion: true })).toEqual({
      mode: 'guided',
      allowHeavyAssets: false,
      lowMotion: true,
      hardFailure: false,
      reason: 'reduced-motion',
      choice: 'automatic',
    });
  });

  it('lets an explicit ?mode= override the device, in both directions', () => {
    expect(resolveExperiencePolicy({ saveData: true, reducedMotion: true }, 'guided')).toEqual({
      mode: 'guided',
      allowHeavyAssets: true,
      lowMotion: false,
      hardFailure: false,
      reason: 'query',
      choice: 'explicit',
    });
    expect(resolveExperiencePolicy({ saveData: false, reducedMotion: false }, 'scan')).toMatchObject({ mode: 'scan', allowHeavyAssets: false, lowMotion: true });
  });

  it('allows heavy assets by default and can never fail hard', () => {
    expect(resolveExperiencePolicy({ saveData: false, reducedMotion: false })).toMatchObject({ mode: 'guided', allowHeavyAssets: true, hardFailure: false });
  });

  it('detects Save-Data and reduced motion without assuming browser globals', () => {
    expect(detectExperienceCapabilities({ saveData: true, reducedMotion: true })).toEqual({ saveData: true, reducedMotion: true });
  });

  it('no longer probes WebGL or writes ?mode= into the URL', async () => {
    // The probe guarded a WebGL world the site no longer ships; the fluid backdrop
    // checks WebGL2 itself. Writing ?mode=scan rewrote Save-Data visitors' URLs
    // for a Quick Scan switch that no longer exists.
    const [library, context] = await Promise.all([
      readFile(new URL('../lib/experienceMode.ts', import.meta.url), 'utf8'),
      readFile(new URL('../contexts/ExperienceModeContext.tsx', import.meta.url), 'utf8'),
    ]);
    expect(library).not.toMatch(/getContext\(|MAX_TEXTURE_SIZE|webgl-failure|low-webgl/);
    expect(context).not.toMatch(/history\.(?:push|replace)State|sessionStorage|signalWorldPolicyChange/);
  });
});
