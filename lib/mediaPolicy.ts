import type { ExperiencePolicy } from './experienceMode';

type MediaPolicyInput = {
  experience: Pick<ExperiencePolicy, 'mode' | 'allowHeavyAssets' | 'lowMotion' | 'reason'>;
  mediaEnabled: boolean;
  motionPaused: boolean;
  visible: boolean;
  saveData?: boolean;
};

export type MediaPolicy = {
  shouldAttachSources: boolean;
  shouldPlay: boolean;
  reason: 'ready' | 'quick-scan' | 'reduced-motion' | 'save-data' | 'capability' | 'media-disabled' | 'paused' | 'offscreen';
};

export const resolveMediaPolicy = ({ experience, mediaEnabled, motionPaused, visible, saveData = false }: MediaPolicyInput): MediaPolicy => {
  if (experience.mode === 'scan') return { shouldAttachSources: false, shouldPlay: false, reason: 'quick-scan' };
  if (saveData || experience.reason === 'save-data') return { shouldAttachSources: false, shouldPlay: false, reason: 'save-data' };
  if (experience.lowMotion) return { shouldAttachSources: false, shouldPlay: false, reason: 'reduced-motion' };
  if (!experience.allowHeavyAssets) return { shouldAttachSources: false, shouldPlay: false, reason: 'capability' };
  if (!mediaEnabled) return { shouldAttachSources: false, shouldPlay: false, reason: 'media-disabled' };
  if (motionPaused) return { shouldAttachSources: true, shouldPlay: false, reason: 'paused' };
  if (!visible) return { shouldAttachSources: true, shouldPlay: false, reason: 'offscreen' };
  return { shouldAttachSources: true, shouldPlay: true, reason: 'ready' };
};
