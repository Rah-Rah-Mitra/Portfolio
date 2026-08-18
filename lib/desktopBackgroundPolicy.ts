import type { BackgroundThemeId } from '../types';

export interface DesktopBackgroundActivityInput {
  mode: 'guided' | 'scan';
  allowHeavyAssets: boolean;
  selectedTheme: BackgroundThemeId;
  appearancePaused: boolean;
  motionPaused: boolean;
  documentHidden: boolean;
  heavyAppFocused: boolean;
}

export type DesktopBackgroundActivityReason = 'active' | 'quick-scan' | 'capability' | 'appearance-paused' | 'motion-paused' | 'hidden' | 'gpu-lease';

export const resolveDesktopBackgroundActivity = (input: DesktopBackgroundActivityInput): {
  active: boolean;
  reason: DesktopBackgroundActivityReason;
  theme: BackgroundThemeId;
} => {
  if (input.mode === 'scan') return { active: false, reason: 'quick-scan', theme: input.selectedTheme };
  if (!input.allowHeavyAssets) return { active: false, reason: 'capability', theme: input.selectedTheme };
  if (input.appearancePaused) return { active: false, reason: 'appearance-paused', theme: input.selectedTheme };
  if (input.motionPaused) return { active: false, reason: 'motion-paused', theme: input.selectedTheme };
  if (input.documentHidden) return { active: false, reason: 'hidden', theme: input.selectedTheme };
  if (input.heavyAppFocused) return { active: false, reason: 'gpu-lease', theme: input.selectedTheme };
  return { active: true, reason: 'active', theme: input.selectedTheme };
};
