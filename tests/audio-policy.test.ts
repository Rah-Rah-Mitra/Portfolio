import { describe, expect, it } from 'vitest';
import * as audioPolicy from '../lib/audioPolicy';
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

  it('maps discrete traversal and Explore events to footstep and scene-transition cues', () => {
    expect(audioPolicy.cueForWorldEvent?.({ type: 'COURIER_STEP_COMPLETED', chapterId: 'work', direction: 'forward' })).toBe('footstep');
    expect(audioPolicy.cueForWorldEvent?.({ type: 'EXPLORE_ENTERED', sceneId: 'camera-laboratory', source: 'visitor' })).toBe('sceneTransition');
  });

  it('throttles continuous rail updates without suppressing later discrete cues', () => {
    const gate = audioPolicy.createAudioCueGate?.(240);
    expect(gate).toBeDefined();
    expect(gate?.shouldPlay('railServo', 1000)).toBe(true);
    expect(gate?.shouldPlay('railServo', 1100)).toBe(false);
    expect(gate?.shouldPlay('railServo', 1240)).toBe(true);
    expect(gate?.shouldPlay('footstep', 1241)).toBe(true);
  });
});
