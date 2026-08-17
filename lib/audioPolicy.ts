import type { PortfolioWorldEvent } from '../types';

export const SOUND_PREFERENCE_KEY = 'portfolio-sound-enabled';

export const AUDIO_CUES = {
  footstep: { startSeconds: 0, durationSeconds: .18 },
  opticalClick: { startSeconds: .28, durationSeconds: .12 },
  railServo: { startSeconds: .5, durationSeconds: .42 },
  calibrationConfirm: { startSeconds: 1.02, durationSeconds: .34 },
  sceneTransition: { startSeconds: 1.46, durationSeconds: .32 },
} as const;

export type AudioCue = keyof typeof AUDIO_CUES;

export const cueForWorldEvent = (event: PortfolioWorldEvent): AudioCue | null => {
  if (event.type === 'COURIER_STEP_COMPLETED') return 'footstep';
  if (event.type === 'CAMERA_CALIBRATED' || event.type === 'STEREO_POINT_TRIANGULATED') return 'calibrationConfirm';
  if (event.type === 'CAMERA_LAB_UPDATED') return 'railServo';
  if (event.type === 'DEPARTURE_COMPLETED' || event.type === 'LAB_RESET') return 'opticalClick';
  if (event.type === 'EXPLORE_ENTERED' || event.type === 'EXPLORE_EXITED') return 'sceneTransition';
  return null;
};

export const createAudioCueGate = (railCooldownMilliseconds = 420) => {
  let lastRailCueAt = Number.NEGATIVE_INFINITY;
  return {
    shouldPlay(cue: AudioCue, atMilliseconds = performance.now()) {
      if (cue !== 'railServo') return true;
      if (atMilliseconds - lastRailCueAt < railCooldownMilliseconds) return false;
      lastRailCueAt = atMilliseconds;
      return true;
    },
    reset() { lastRailCueAt = Number.NEGATIVE_INFINITY; },
  };
};

export const readSoundPreference = (value: string | null): boolean => value === 'true';

export const createAudioPolicy = (input: {
  preference: boolean;
  userGesture: boolean;
  motionPaused: boolean;
  lowMotion: boolean;
  saveData: boolean;
}): { enabled: boolean; reason: 'ready' | 'muted' | 'gesture-required' | 'paused' | 'reduced-stimulation' | 'save-data' } => {
  if (input.saveData) return { enabled: false, reason: 'save-data' };
  if (input.lowMotion) return { enabled: false, reason: 'reduced-stimulation' };
  if (input.motionPaused) return { enabled: false, reason: 'paused' };
  if (!input.preference) return { enabled: false, reason: 'muted' };
  if (!input.userGesture) return { enabled: false, reason: 'gesture-required' };
  return { enabled: true, reason: 'ready' };
};
