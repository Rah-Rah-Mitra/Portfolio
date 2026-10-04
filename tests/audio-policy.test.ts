import { describe, expect, it } from 'vitest';
import type { PortfolioWorldEvent } from '../types';
import { AUDIO_CUES, createAudioCueGate, createAudioPolicy, cueForWorldEvent, describeAudioPolicy, readSoundPreference, type AudioPolicyReason } from '../lib/audioPolicy';

const ready = { preference: true, userGesture: true, motionPaused: false, lowMotion: false, saveData: false };

describe('optional audio policy', () => {
  it('is muted until a user gesture and disabled by constrained modes or global pause', () => {
    expect(createAudioPolicy(ready)).toEqual({ enabled: true, reason: 'ready' });
    expect(createAudioPolicy({ ...ready, userGesture: false })).toMatchObject({ enabled: false, reason: 'gesture-required' });
    expect(createAudioPolicy({ ...ready, motionPaused: true })).toMatchObject({ enabled: false, reason: 'paused' });
    expect(createAudioPolicy({ ...ready, lowMotion: true })).toMatchObject({ enabled: false, reason: 'reduced-stimulation' });
    expect(createAudioPolicy({ ...ready, quickScan: true })).toMatchObject({ enabled: false, reason: 'quick-scan' });
    expect(createAudioPolicy({ ...ready, saveData: true })).toMatchObject({ enabled: false, reason: 'save-data' });
  });

  it('reports "muted" whenever the visitor has not opted in, whatever else holds', () => {
    // The drawer shows this reason as the toggle's status, so an opted-out
    // visitor must read "Off", not a constraint they never asked about.
    expect(createAudioPolicy({ ...ready, preference: false, saveData: true, lowMotion: true, motionPaused: true, userGesture: false }))
      .toEqual({ enabled: false, reason: 'muted' });
  });

  it('describes every policy reason in one short line', () => {
    const reasons: AudioPolicyReason[] = ['ready', 'muted', 'gesture-required', 'paused', 'reduced-stimulation', 'quick-scan', 'save-data'];
    expect(describeAudioPolicy('muted')).toBe('Off');
    expect(describeAudioPolicy('ready')).toBe('On');
    reasons.forEach((reason) => expect(describeAudioPolicy(reason).length).toBeGreaterThan(1));
    expect(new Set(reasons.map(describeAudioPolicy)).size).toBe(reasons.length);
  });

  it('validates persisted opt-in and exposes only restrained nonverbal cues', () => {
    expect(readSoundPreference('true')).toBe(true);
    expect(readSoundPreference('false')).toBe(false);
    expect(readSoundPreference('garbage')).toBe(false);
    expect(readSoundPreference(null)).toBe(false);
    expect(Object.keys(AUDIO_CUES)).toEqual(['footstep', 'opticalClick', 'railServo', 'calibrationConfirm', 'sceneTransition']);
  });

  it('keeps every cue inside the 1.9s sprite file', () => {
    Object.values(AUDIO_CUES).forEach((cue) => expect(cue.startSeconds + cue.durationSeconds).toBeLessThanOrEqual(1.9));
  });
});

describe('world events to cues', () => {
  it('clicks when a workbench window opens and stays quiet when one closes', () => {
    expect(cueForWorldEvent({ type: 'WORKBENCH_WINDOW', appId: 'systems-lab', action: 'open' })).toBe('opticalClick');
    expect(cueForWorldEvent({ type: 'WORKBENCH_WINDOW', appId: 'systems-lab', action: 'close' })).toBeNull();
  });

  it('maps lab outcomes to their cues', () => {
    expect(cueForWorldEvent({ type: 'DROP_TEST_STRUCK', mode: 'smash', bodies: 12 })).toBe('footstep');
    expect(cueForWorldEvent({ type: 'SCHEDULE_SOLVED', method: 'NEH', makespan: 41, optimal: true })).toBe('calibrationConfirm');
    expect(cueForWorldEvent({ type: 'SCHEDULE_SOLVED', method: 'NEH', makespan: 43, optimal: false })).toBe('opticalClick');
    expect(cueForWorldEvent({ type: 'CAMERA_CALIBRATED', reprojectionError: 0.31 })).toBe('calibrationConfirm');
    expect(cueForWorldEvent({ type: 'STEREO_POINT_TRIANGULATED', depthError: 0.02 })).toBe('calibrationConfirm');
    expect(cueForWorldEvent({ type: 'JOB_REORDERED', oldMakespan: 44, newMakespan: 41, makespanDelta: -3, order: ['J1', 'J2'] })).toBe('railServo');
    expect(cueForWorldEvent({ type: 'LAB_RESET' })).toBe('opticalClick');
  });

  it('ignores the retired field-test events', () => {
    // Cast: these members left the union in the 2026-10 sweep; a stale dispatcher must still map to silence.
    const retired = [
      { type: 'COURIER_STEP_COMPLETED', chapterId: 'work', direction: 'forward' },
      { type: 'EXPLORE_ENTERED', sceneId: 'camera-laboratory', source: 'visitor' },
      { type: 'QUALITY_CHANGED', tier: 'balanced' },
    ] as unknown as PortfolioWorldEvent[];
    retired.forEach((event) => expect(cueForWorldEvent(event)).toBeNull());
  });
});

describe('cue rate limiting', () => {
  it('throttles continuous rail updates without suppressing later discrete cues', () => {
    const gate = createAudioCueGate(240);
    expect(gate.shouldPlay('railServo', 1000)).toBe(true);
    expect(gate.shouldPlay('railServo', 1100)).toBe(false);
    expect(gate.shouldPlay('railServo', 1240)).toBe(true);
    expect(gate.shouldPlay('footstep', 1241)).toBe(true);
  });

  it('gives every cue its own cooldown, so a burst of strikes sounds once', () => {
    const gate = createAudioCueGate();
    expect(gate.shouldPlay('footstep', 0)).toBe(true);
    expect(gate.shouldPlay('footstep', 30)).toBe(false);
    expect(gate.shouldPlay('opticalClick', 31)).toBe(true);
    expect(gate.shouldPlay('footstep', 500)).toBe(true);
    gate.reset();
    expect(gate.shouldPlay('footstep', 501)).toBe(true);
  });
});
