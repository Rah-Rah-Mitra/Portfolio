import { describe, expect, it } from 'vitest';
import { describeBackdropHold, hexToRgb, isHexColor, resolveBackdropActivity } from '../lib/desktopBackgroundPolicy';
import { resolveExperiencePolicy } from '../lib/experienceMode';
import { defaultBackdropSettings } from '../lib/backdropSettings';

describe('desk backdrop policy', () => {
  const live = { enabled: true, allowHeavyAssets: true, motionHalted: false, documentHidden: false };

  it('ships both backdrops off at boot (the e2e boot state is pinned)', () => {
    expect(defaultBackdropSettings.nbody.enabled).toBe(false);
    expect(defaultBackdropSettings.fluid.enabled).toBe(false);
  });

  it('runs an enabled backdrop on a capable, visible, moving page', () => {
    expect(resolveBackdropActivity(live, false)).toEqual({ mount: true, running: true, reason: 'running' });
  });

  it('mounts nothing while the toggle is off, whatever it held before', () => {
    expect(resolveBackdropActivity({ ...live, enabled: false }, false)).toEqual({ mount: false, running: false, reason: 'off' });
    expect(resolveBackdropActivity({ ...live, enabled: false }, true)).toEqual({ mount: false, running: false, reason: 'off' });
  });

  it('never takes a lease on the light policy, but keeps one it already holds, frozen', () => {
    const light = { ...live, allowHeavyAssets: false };
    expect(resolveBackdropActivity(light, false)).toEqual({ mount: false, running: false, reason: 'capability' });
    expect(resolveBackdropActivity(light, true)).toEqual({ mount: true, running: false, reason: 'capability' });
  });

  it.each([
    [{ documentHidden: true }, 'hidden'],
    [{ motionHalted: true }, 'motion-halted'],
    [{ documentHidden: true, motionHalted: true }, 'hidden'],
  ] as const)('stays mounted but frozen for %o', (override, reason) => {
    // Mounted-but-frozen is what lets a visitor who pressed "Pause all motion"
    // still see a still frame of the backdrop they switched on.
    expect(resolveBackdropActivity({ ...live, ...override }, false)).toEqual({ mount: true, running: false, reason });
  });

  it('names why a backdrop is held on every light policy, and says nothing when it may mount', () => {
    const device = { saveData: false, reducedMotion: false };
    // Each held policy really is one a backdrop never mounts on.
    const held = [
      [resolveExperiencePolicy(device, 'scan'), '?mode=scan'],
      [resolveExperiencePolicy({ ...device, saveData: true }), 'Data Saver'],
      [resolveExperiencePolicy({ ...device, reducedMotion: true }), 'reduced motion'],
    ] as const;
    for (const [policy, words] of held) {
      expect(resolveBackdropActivity({ ...live, allowHeavyAssets: policy.allowHeavyAssets }, false).mount).toBe(false);
      expect(describeBackdropHold(policy)).toContain(words);
    }
    expect(describeBackdropHold(resolveExperiencePolicy(device))).toBeNull();
    expect(describeBackdropHold(resolveExperiencePolicy(device, 'guided'))).toBeNull();
    // The pre-hydration static policy is light too, but the drawer never sees it.
    expect(describeBackdropHold({ allowHeavyAssets: false, reason: 'default' })).toBeNull();
  });
});

describe('desk backdrop palette', () => {
  it('reads #rrggbb tokens as unit RGB for the fluid shader', () => {
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0]);
    expect(hexToRgb('#5980A6').map((channel) => Math.round(channel * 255))).toEqual([0x59, 0x80, 0xa6]);
  });

  it('accepts only plain #rrggbb', () => {
    expect(isHexColor('#5980a6')).toBe(true);
    for (const value of ['#598', 'rgb(1, 2, 3)', 'var(--color-accent)', 'url(x)', '#5980a6ff']) {
      expect(isHexColor(value)).toBe(false);
    }
    expect(() => hexToRgb('rgb(1, 2, 3)')).toThrow();
  });
});
