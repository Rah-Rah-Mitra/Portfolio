import { describe, expect, it } from 'vitest';
import { AUDIO_CUES, createAudioPolicy, readSoundPreference } from '../lib/audioPolicy';

describe('optional audio policy', () => {
  it('is muted until a user gesture and disabled by constrained modes or global pause', () => {
    expect(createAudioPolicy({ preference: true, userGesture: false, motionPaused: false, lowMotion: false, saveData: false })).toMatchObject({ enabled: false, reason: 'gesture-required' });
    expect(createAudioPolicy({ preference: true, userGesture: true, motionPaused: true, lowMotion: false, saveData: false })).toMatchObject({ enabled: false, reason: 'paused' });
    expect(createAudioPolicy({ preference: true, userGesture: true, motionPaused: false, lowMotion: true, saveData: false })).toMatchObject({ enabled: false, reason: 'reduced-stimulation' });
    expect(createAudioPolicy({ preference: true, userGesture: true, motionPaused: false, lowMotion: false, saveData: true })).toMatchObject({ enabled: false, reason: 'save-data' });
  });

  it('validates persisted opt-in and exposes only restrained nonverbal cues', () => {
    expect(readSoundPreference('true')).toBe(true);
    expect(readSoundPreference('false')).toBe(false);
    expect(readSoundPreference('garbage')).toBe(false);
    expect(Object.keys(AUDIO_CUES)).toEqual(['footstep', 'opticalClick', 'railServo', 'calibrationConfirm', 'sceneTransition']);
  });
});
