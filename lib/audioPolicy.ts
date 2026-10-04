import type { PortfolioWorldEvent } from '../types';

export const SOUND_PREFERENCE_KEY = 'portfolio-sound-enabled';

// Offsets into the one sprite file, /media/optical-cues.mp3. The table names
// the asset's contents, so a cue no event maps to today still stays listed.
export const AUDIO_CUES = {
  footstep: { startSeconds: 0, durationSeconds: .18 },
  opticalClick: { startSeconds: .28, durationSeconds: .12 },
  railServo: { startSeconds: .5, durationSeconds: .42 },
  calibrationConfirm: { startSeconds: 1.02, durationSeconds: .34 },
  sceneTransition: { startSeconds: 1.46, durationSeconds: .32 },
} as const;

export type AudioCue = keyof typeof AUDIO_CUES;

// Discrete outcomes only. Closing a window is silent on purpose: "Desk" closes
// every window at once, and the cue would just be noise.
export const cueForWorldEvent = (event: PortfolioWorldEvent): AudioCue | null => {
  switch (event.type) {
    case 'WORKBENCH_WINDOW': return event.action === 'open' ? 'opticalClick' : null;
    case 'DROP_TEST_STRUCK': return 'footstep'; // a short, dull knock: a body landing
    // Only a proven optimum earns the confirm chime; a heuristic answer clicks.
    case 'SCHEDULE_SOLVED': return event.optimal ? 'calibrationConfirm' : 'opticalClick';
    case 'CAMERA_CALIBRATED':
    case 'STEREO_POINT_TRIANGULATED': return 'calibrationConfirm';
    case 'CAMERA_LAB_UPDATED':
    case 'JOB_REORDERED': return 'railServo';
    case 'LAB_RESET': return 'opticalClick';
    default: return null;
  }
};

// Minimum gap before the same cue may sound again. Slider drags and repeated
// strikes fire many events a second; one cue per gap is plenty.
export const CUE_COOLDOWN_MS: Record<AudioCue, number> = {
  footstep: 140,
  opticalClick: 80,
  railServo: 420,
  calibrationConfirm: 300,
  sceneTransition: 300,
};

export const createAudioCueGate = (railCooldownMilliseconds = CUE_COOLDOWN_MS.railServo) => {
  const cooldowns: Record<AudioCue, number> = { ...CUE_COOLDOWN_MS, railServo: railCooldownMilliseconds };
  const lastPlayedAt = new Map<AudioCue, number>();
  return {
    shouldPlay(cue: AudioCue, atMilliseconds = performance.now()) {
      if (atMilliseconds - (lastPlayedAt.get(cue) ?? Number.NEGATIVE_INFINITY) < cooldowns[cue]) return false;
      lastPlayedAt.set(cue, atMilliseconds);
      return true;
    },
    reset() { lastPlayedAt.clear(); },
  };
};

export const readSoundPreference = (value: string | null): boolean => value === 'true';

export type AudioPolicyReason = 'ready' | 'muted' | 'gesture-required' | 'paused' | 'reduced-stimulation' | 'quick-scan' | 'save-data';

// Order is the answer to "which reason do we report?": the visitor's own
// choice first, then the environment, then the momentary states.
export const createAudioPolicy = (input: {
  preference: boolean;
  userGesture: boolean;
  motionPaused: boolean;
  lowMotion: boolean;
  saveData: boolean;
  /** A ?mode=scan link is an explicit opt-out of optional enhancements, sound included. */
  quickScan?: boolean;
}): { enabled: boolean; reason: AudioPolicyReason } => {
  if (!input.preference) return { enabled: false, reason: 'muted' };
  if (input.saveData) return { enabled: false, reason: 'save-data' };
  if (input.quickScan) return { enabled: false, reason: 'quick-scan' };
  if (input.lowMotion) return { enabled: false, reason: 'reduced-stimulation' };
  if (input.motionPaused) return { enabled: false, reason: 'paused' };
  if (!input.userGesture) return { enabled: false, reason: 'gesture-required' };
  return { enabled: true, reason: 'ready' };
};

/** The Effects lab's one-line answer to "why is it quiet?", per policy reason. */
export const describeAudioPolicy = (reason: AudioPolicyReason): string => {
  switch (reason) {
    case 'ready': return 'On';
    case 'muted': return 'Off';
    case 'gesture-required': return 'On · starts after your first click or key press';
    case 'paused': return 'On · held while motion is paused';
    case 'reduced-stimulation': return 'On · held: your system asks for reduced motion';
    case 'quick-scan': return 'On · held: this page was opened with ?mode=scan';
    case 'save-data': return 'On · held: Data Saver is on';
  }
};
