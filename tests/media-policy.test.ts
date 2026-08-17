import { describe, expect, it } from 'vitest';
import { resolveMediaPolicy } from '../lib/mediaPolicy';

describe('supporting media policy', () => {
  const base = { mode: 'guided' as const, allowHeavyAssets: true, lowMotion: false, reason: 'default' as const };

  it.each([
    [{ ...base, mode: 'scan' as const, allowHeavyAssets: false }, 'quick-scan'],
    [{ ...base, lowMotion: true }, 'reduced-motion'],
    [{ ...base, allowHeavyAssets: false, reason: 'save-data' as const }, 'save-data'],
  ])('omits video sources for constrained policy %#', (experience, expectedReason) => {
    expect(resolveMediaPolicy({ experience, mediaEnabled: true, motionPaused: false, visible: true })).toEqual({
      shouldAttachSources: false,
      shouldPlay: false,
      reason: expectedReason,
    });
  });

  it('attaches sources only when media is enabled and pauses offscreen or globally', () => {
    expect(resolveMediaPolicy({ experience: base, mediaEnabled: true, motionPaused: false, visible: true })).toMatchObject({ shouldAttachSources: true, shouldPlay: true });
    expect(resolveMediaPolicy({ experience: base, mediaEnabled: true, motionPaused: false, visible: false })).toMatchObject({ shouldAttachSources: true, shouldPlay: false, reason: 'offscreen' });
    expect(resolveMediaPolicy({ experience: base, mediaEnabled: true, motionPaused: true, visible: true })).toMatchObject({ shouldAttachSources: true, shouldPlay: false, reason: 'paused' });
    expect(resolveMediaPolicy({ experience: base, mediaEnabled: false, motionPaused: false, visible: true })).toMatchObject({ shouldAttachSources: false, shouldPlay: false, reason: 'media-disabled' });
  });

  it('keeps Save-Data media-free even after an explicit Guided choice', () => {
    expect(resolveMediaPolicy({ experience: { ...base, reason: 'session-choice' }, mediaEnabled: true, motionPaused: false, visible: true, saveData: true })).toEqual({
      shouldAttachSources: false, shouldPlay: false, reason: 'save-data',
    });
  });
});
