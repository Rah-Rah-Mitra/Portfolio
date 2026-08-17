import { describe, expect, it } from 'vitest';
import {
  detectExperienceCapabilities,
  modeFromSearch,
  resolveExperiencePolicy,
  withExperienceMode,
} from '../lib/experienceMode';

describe('portfolio experience mode', () => {
  it('recognizes the canonical Quick Scan query', () => {
    expect(modeFromSearch('?mode=scan')).toBe('scan');
    expect(modeFromSearch('?ref=recruiter&mode=scan')).toBe('scan');
    expect(modeFromSearch('?mode=guided')).toBe('guided');
    expect(modeFromSearch('')).toBeNull();
  });

  it('preserves the current hash while writing canonical mode history', () => {
    expect(withExperienceMode('https://rahul-mitra.com/?ref=nus#project-churp', 'scan')).toBe(
      'https://rahul-mitra.com/?ref=nus&mode=scan#project-churp',
    );
    expect(withExperienceMode('https://rahul-mitra.com/?ref=nus&mode=scan#project-churp', 'guided')).toBe(
      'https://rahul-mitra.com/?ref=nus#project-churp',
    );
  });

  it('defaults Save-Data and failed or low WebGL to Quick Scan', () => {
    expect(resolveExperiencePolicy({ saveData: true, reducedMotion: false, webgl: 'full' })).toMatchObject({ mode: 'scan', allowHeavyAssets: false });
    expect(resolveExperiencePolicy({ saveData: false, reducedMotion: false, webgl: 'failed' })).toMatchObject({ mode: 'scan', allowHeavyAssets: false, hardFailure: true });
    expect(resolveExperiencePolicy({ saveData: false, reducedMotion: false, webgl: 'low' })).toMatchObject({ mode: 'scan', allowHeavyAssets: false });
  });

  it('keeps reduced-motion rendering static without forcing Quick Scan', () => {
    expect(resolveExperiencePolicy({ saveData: false, reducedMotion: true, webgl: 'full' })).toEqual({
      mode: 'guided',
      allowHeavyAssets: false,
      lowMotion: true,
      hardFailure: false,
      reason: 'reduced-motion',
      choice: 'automatic',
    });
  });

  it('enables enhancements when reduced-motion is explicitly overridden for the session', () => {
    expect(resolveExperiencePolicy({ saveData: false, reducedMotion: true, webgl: 'full' }, 'guided')).toEqual({
      mode: 'guided',
      allowHeavyAssets: true,
      lowMotion: false,
      hardFailure: false,
      reason: 'session-choice',
      choice: 'explicit',
    });
  });

  it('honors a session choice except after a hard WebGL failure', () => {
    expect(resolveExperiencePolicy({ saveData: true, reducedMotion: false, webgl: 'full' }, 'guided')).toMatchObject({ mode: 'guided', allowHeavyAssets: true });
    expect(resolveExperiencePolicy({ saveData: false, reducedMotion: false, webgl: 'low' }, 'guided')).toMatchObject({ mode: 'guided', allowHeavyAssets: true });
    expect(resolveExperiencePolicy({ saveData: false, reducedMotion: false, webgl: 'failed' }, 'guided')).toMatchObject({ mode: 'scan', allowHeavyAssets: false, hardFailure: true });
  });

  it('detects Save-Data, reduced motion, and low WebGL without assuming browser globals', () => {
    const capabilities = detectExperienceCapabilities({
      saveData: true,
      reducedMotion: true,
      createWebglContext: () => ({ maxTextureSize: 2048 }),
    });
    expect(capabilities).toEqual({ saveData: true, reducedMotion: true, webgl: 'low' });
  });
});
