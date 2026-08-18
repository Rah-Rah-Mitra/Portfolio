import { describe, expect, it } from 'vitest';
import { resolveDesktopBackgroundActivity } from '../lib/desktopBackgroundPolicy';

describe('desktop background ownership policy', () => {
  const active = {
    mode: 'guided' as const,
    allowHeavyAssets: true,
    selectedTheme: 'nbody' as const,
    appearancePaused: false,
    motionPaused: false,
    documentHidden: false,
    heavyAppFocused: false,
  };

  it('runs only the selected theme in capable Guided mode', () => {
    expect(resolveDesktopBackgroundActivity(active)).toEqual({ active: true, reason: 'active', theme: 'nbody' });
    expect(resolveDesktopBackgroundActivity({ ...active, selectedTheme: 'fluid' })).toEqual({ active: true, reason: 'active', theme: 'fluid' });
  });

  it.each([
    [{ mode: 'scan' as const, allowHeavyAssets: false }, 'quick-scan'],
    [{ allowHeavyAssets: false }, 'capability'],
    [{ appearancePaused: true }, 'appearance-paused'],
    [{ motionPaused: true }, 'motion-paused'],
    [{ documentHidden: true }, 'hidden'],
    [{ heavyAppFocused: true }, 'gpu-lease'],
  ])('suspends for %s', (override, reason) => {
    expect(resolveDesktopBackgroundActivity({ ...active, ...override })).toMatchObject({ active: false, reason });
  });
});
