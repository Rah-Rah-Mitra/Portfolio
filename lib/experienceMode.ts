export type ExperienceMode = 'guided' | 'scan';
export type WebglCapability = 'full' | 'low' | 'failed';

export interface ExperienceCapabilities {
  saveData: boolean;
  reducedMotion: boolean;
  webgl: WebglCapability;
}

export interface ExperiencePolicy {
  mode: ExperienceMode;
  allowHeavyAssets: boolean;
  lowMotion: boolean;
  hardFailure: boolean;
  reason: 'query' | 'session-choice' | 'save-data' | 'reduced-motion' | 'low-webgl' | 'webgl-failure' | 'default';
  choice: 'automatic' | 'explicit';
}

interface CapabilityProbe {
  saveData?: boolean;
  reducedMotion?: boolean;
  createWebglContext?: () => { maxTextureSize: number } | null;
}

const MIN_FULL_WEBGL_TEXTURE_SIZE = 4096;

export const modeFromSearch = (search: string): ExperienceMode | null => {
  const mode = new URLSearchParams(search).get('mode');
  if (mode === 'scan') return 'scan';
  if (mode === 'guided') return 'guided';
  return null;
};

export const withExperienceMode = (rawUrl: string, mode: ExperienceMode): string => {
  const url = new URL(rawUrl);
  if (mode === 'scan') url.searchParams.set('mode', 'scan');
  else url.searchParams.delete('mode');
  return url.toString();
};

const browserWebglProbe = (): { maxTextureSize: number } | null => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  if (!context) return null;
  return { maxTextureSize: Number(context.getParameter(context.MAX_TEXTURE_SIZE)) || 0 };
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
  const result = (probe.createWebglContext ?? browserWebglProbe)();
  const webgl: WebglCapability = !result
    ? 'failed'
    : result.maxTextureSize < MIN_FULL_WEBGL_TEXTURE_SIZE ? 'low' : 'full';
  return { saveData, reducedMotion, webgl };
};

export const resolveExperiencePolicy = (
  capabilities: ExperienceCapabilities,
  choice: ExperienceMode | null = null,
  queryMode: ExperienceMode | null = null,
): ExperiencePolicy => {
  if (capabilities.webgl === 'failed') {
    return { mode: 'scan', allowHeavyAssets: false, lowMotion: true, hardFailure: true, reason: 'webgl-failure', choice: 'automatic' };
  }

  const explicit = queryMode ?? choice;
  if (explicit) {
    return {
      mode: explicit,
      allowHeavyAssets: explicit === 'guided',
      lowMotion: explicit === 'scan',
      hardFailure: false,
      reason: queryMode ? 'query' : 'session-choice',
      choice: 'explicit',
    };
  }

  if (capabilities.saveData) {
    return { mode: 'scan', allowHeavyAssets: false, lowMotion: true, hardFailure: false, reason: 'save-data', choice: 'automatic' };
  }
  if (capabilities.webgl === 'low') {
    return { mode: 'scan', allowHeavyAssets: false, lowMotion: true, hardFailure: false, reason: 'low-webgl', choice: 'automatic' };
  }
  if (capabilities.reducedMotion) {
    return { mode: 'guided', allowHeavyAssets: false, lowMotion: true, hardFailure: false, reason: 'reduced-motion', choice: 'automatic' };
  }
  return { mode: 'guided', allowHeavyAssets: true, lowMotion: false, hardFailure: false, reason: 'default', choice: 'automatic' };
};
