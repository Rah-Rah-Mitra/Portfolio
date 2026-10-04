export type ExperienceMode = 'guided' | 'scan';

export interface ExperienceCapabilities {
  saveData: boolean;
  reducedMotion: boolean;
}

/**
 * How much optional weight the page may carry. The desk backdrops read
 * allowHeavyAssets (false for Save-Data and for reduced motion); audio reads
 * lowMotion and the Save-Data capability.
 *
 * There is no WebGL probe here any more. It existed to guard a WebGL world the
 * site no longer ships, and the one GPU surface left (the fluid backdrop) checks
 * WebGL2 itself when it is switched on. With it went the only way the policy could
 * fail hard, so hardFailure is always false; it stays so every consumer keeps one
 * policy shape.
 */
export interface ExperiencePolicy {
  mode: ExperienceMode;
  allowHeavyAssets: boolean;
  lowMotion: boolean;
  hardFailure: boolean;
  reason: 'query' | 'save-data' | 'reduced-motion' | 'default';
  choice: 'automatic' | 'explicit';
}

interface CapabilityProbe {
  saveData?: boolean;
  reducedMotion?: boolean;
}

// ?mode=scan is still read (lib/workstation.ts honours it as a deep-link opt-out,
// and links to it exist in the wild); nothing writes it into the URL any more.
export const modeFromSearch = (search: string): ExperienceMode | null => {
  const mode = new URLSearchParams(search).get('mode');
  if (mode === 'scan') return 'scan';
  if (mode === 'guided') return 'guided';
  return null;
};

export const detectExperienceCapabilities = (probe: CapabilityProbe = {}): ExperienceCapabilities => {
  const connection = typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const saveData = probe.saveData ?? Boolean(connection?.saveData);
  const reducedMotion = probe.reducedMotion ?? (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  return { saveData, reducedMotion };
};

export const resolveExperiencePolicy = (
  capabilities: ExperienceCapabilities,
  queryMode: ExperienceMode | null = null,
): ExperiencePolicy => {
  if (queryMode) {
    return {
      mode: queryMode,
      allowHeavyAssets: queryMode === 'guided',
      lowMotion: queryMode === 'scan',
      hardFailure: false,
      reason: 'query',
      choice: 'explicit',
    };
  }
  if (capabilities.saveData) {
    return { mode: 'scan', allowHeavyAssets: false, lowMotion: true, hardFailure: false, reason: 'save-data', choice: 'automatic' };
  }
  if (capabilities.reducedMotion) {
    return { mode: 'guided', allowHeavyAssets: false, lowMotion: true, hardFailure: false, reason: 'reduced-motion', choice: 'automatic' };
  }
  return { mode: 'guided', allowHeavyAssets: true, lowMotion: false, hardFailure: false, reason: 'default', choice: 'automatic' };
};
