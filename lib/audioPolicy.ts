export const SOUND_PREFERENCE_KEY = 'portfolio-sound-enabled';

export const AUDIO_CUES = {
  footstep: { startSeconds: 0, durationSeconds: .18 },
  opticalClick: { startSeconds: .28, durationSeconds: .12 },
  railServo: { startSeconds: .5, durationSeconds: .42 },
  calibrationConfirm: { startSeconds: 1.02, durationSeconds: .34 },
  sceneTransition: { startSeconds: 1.46, durationSeconds: .32 },
} as const;

export type AudioCue = keyof typeof AUDIO_CUES;

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
