import type { ExperiencePolicy } from './experienceMode';

// The FX panel's hold wording for the desk backdrops. It lives apart from
// desktopBackgroundPolicy.ts because the panel ships in the main bundle and the
// policy module does not: the desk-backdrop layer, which is the policy's only
// other reader, is a lazy chunk. desktopBackgroundPolicy re-exports both names.

/**
 * The FX panel's answer to "why is the desk still plain?". On the light policy a
 * backdrop never takes a lease (desktopBackgroundPolicy), so its toggle would read
 * as on, with live settings, over a desk that draws nothing. Worded like
 * describeAudioPolicy. null when the backdrops may mount, and for the
 * pre-hydration static policy (reason 'default'), which is never what an opened
 * drawer sees.
 */
export const describeBackdropHold = (policy: Pick<ExperiencePolicy, 'allowHeavyAssets' | 'reason'>): string | null => {
  if (policy.allowHeavyAssets) return null;
  switch (policy.reason) {
    case 'query': return 'held: this page was opened with ?mode=scan';
    case 'save-data': return 'held: Data Saver is on';
    case 'reduced-motion': return 'held: your system asks for reduced motion';
    default: return null;
  }
};

/** The FX toggle's line while an enabled backdrop yields to the Estate window. */
export const BACKDROP_YIELD_HOLD = 'held: the Estate window is using the GPU';
