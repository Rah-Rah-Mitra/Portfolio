import type {
  AccentId,
  AppearancePreferenceAction,
  AppearancePreferences,
  AsciiAnimStyle,
  AsciiBgMode,
  AsciiCharSet,
  AsciiPostEffect,
  AsciiPostEffectId,
  AsciiPreferences,
  AsciiRenderMode,
  BackgroundThemeId,
  ColorSchemePreference,
  DockSize,
  FluidPreferences,
  NBodyExpansionOrder,
  NBodyLeafCapacity,
  NBodyPreferences,
  ResolvedColorScheme,
  WindowTint,
} from '../types';

export const APPEARANCE_STORAGE_KEY = 'portfolio-appearance-v1';

export const defaultNBodyPreferences: NBodyPreferences = {
  preset: 'galaxy',
  particleCount: 2048,
  timeScale: 1,
  gravity: 1,
  softening: 0.012,
  trailPersistence: 38,
  expansionOrder: 8,
  leafCapacity: 48,
  pointerAttraction: true,
  seed: 41,
  showTree: false,
};

export const defaultFluidPreferences: FluidPreferences = {
  speed: 0.7,
  intensity: 38,
  opacity: 28,
  splatRadius: 28,
  curl: 18,
  quality: 'balanced',
  pointerInteraction: true,
};

export const asciiRenderModes: readonly AsciiRenderMode[] = [
  'characters', 'dither', 'mosaic', 'pixel', 'dots', 'cross', 'diamond', 'voxel', 'lego',
  'mixed', 'lines', 'diagonal', 'braille', 'disco', 'hexdump', 'matrix', 'rings', 'hearts',
  'stars', 'hexagons', 'triangles', 'bubbles', 'hatch', 'contour', 'halfblocks',
];

export const asciiPostEffectIds: readonly AsciiPostEffectId[] = [
  'scanLines', 'vignette', 'bloom', 'chromatic', 'filmGrain', 'glitch', 'halftone', 'pixelate', 'filmDust',
];

export const defaultAsciiPreferences: AsciiPreferences = {
  renderMode: 'dither',
  bgMode: 'none',
  bgBlur: 12,
  bgOpacity: 90,
  cellSize: 9,
  coverage: 100,
  density: 20,
  invert: false,
  charSet: 'standard',
  customChars: '',
  brightness: 0,
  contrast: 158,
  saturation: 100,
  grayscale: 0,
  edgeEmphasis: 0,
  tint: '#3ca6ff',
  tintOpacity: 0,
  animated: true,
  animStyle: 'shimmer',
  animSpeed: 100,
  animIntensity: 60,
  pfx: {
    vignette: { enabled: false, intensity: 38 },
    scanLines: { enabled: false, intensity: 40 },
    chromatic: { enabled: false, intensity: 15 },
    bloom: { enabled: false, intensity: 25 },
    filmGrain: { enabled: false, intensity: 30 },
    glitch: { enabled: false, intensity: 20 },
    pixelate: { enabled: false, intensity: 15 },
    halftone: { enabled: false, intensity: 20 },
    filmDust: { enabled: false, intensity: 20 },
  },
};

export const defaultAppearancePreferences: AppearancePreferences = {
  scheme: 'dark',
  accent: 'teal',
  background: 'nbody',
  backgroundPaused: false,
  windowGlow: true,
  windowTint: 'graphite',
  titlebarOpacity: 92,
  reduceTransparency: false,
  dockSize: 'medium',
  nbody: defaultNBodyPreferences,
  fluid: defaultFluidPreferences,
  ascii: defaultAsciiPreferences,
};

const schemes = new Set<ColorSchemePreference>(['dark', 'light', 'system']);
const accents = new Set<AccentId>(['teal', 'sky', 'amber', 'violet', 'rose']);
const backgrounds = new Set<BackgroundThemeId>(['nbody', 'fluid', 'ascii']);
const asciiModes = new Set<AsciiRenderMode>(asciiRenderModes);
const asciiCharSets = new Set<AsciiCharSet>(['standard', 'blocks', 'minimal', 'digits', 'custom']);
const asciiBgModes = new Set<AsciiBgMode>(['none', 'solid', 'blur', 'photo']);
const asciiAnimStyles = new Set<AsciiAnimStyle>(['wave', 'pulse', 'shimmer', 'ripple', 'flicker']);
const windowTints = new Set<WindowTint>(['neutral', 'graphite', 'accent']);
const dockSizes = new Set<DockSize>(['small', 'medium', 'large']);
const nbodyPresets = new Set<NBodyPreferences['preset']>(['galaxy', 'binary', 'field']);
const expansionOrders = new Set<NBodyExpansionOrder>([4, 6, 8, 10]);
const leafCapacities = new Set<NBodyLeafCapacity>([24, 48, 72, 96]);

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isFiniteIn = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isIntegerIn = (value: unknown, min: number, max: number) => Number.isInteger(value) && isFiniteIn(value, min, max);

const isNBodyPreferences = (value: unknown): value is NBodyPreferences => {
  if (!isRecord(value)) return false;
  return nbodyPresets.has(value.preset as NBodyPreferences['preset'])
    && isIntegerIn(value.particleCount, 256, 4096)
    && isFiniteIn(value.timeScale, 0.25, 2)
    && isFiniteIn(value.gravity, 0.2, 2)
    && isFiniteIn(value.softening, 0.002, 0.04)
    && isFiniteIn(value.trailPersistence, 0, 90)
    && expansionOrders.has(value.expansionOrder as NBodyExpansionOrder)
    && leafCapacities.has(value.leafCapacity as NBodyLeafCapacity)
    && typeof value.pointerAttraction === 'boolean'
    && isIntegerIn(value.seed, 0, 2_147_483_647)
    && typeof value.showTree === 'boolean';
};

const isFluidPreferences = (value: unknown): value is FluidPreferences => {
  if (!isRecord(value)) return false;
  return isFiniteIn(value.speed, 0.2, 2.4)
    && isFiniteIn(value.intensity, 0, 100)
    && isFiniteIn(value.opacity, 0, 80)
    && isFiniteIn(value.splatRadius, 10, 85)
    && isFiniteIn(value.curl, 0, 90)
    && (value.quality === 'balanced' || value.quality === 'high')
    && typeof value.pointerInteraction === 'boolean';
};

const isHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

const isAsciiPostEffect = (value: unknown): value is AsciiPostEffect => (
  isRecord(value) && typeof value.enabled === 'boolean' && isFiniteIn(value.intensity, 0, 100)
);

const isAsciiPreferences = (value: unknown): value is AsciiPreferences => {
  if (!isRecord(value)) return false;
  return asciiModes.has(value.renderMode as AsciiRenderMode)
    && asciiBgModes.has(value.bgMode as AsciiBgMode)
    && isFiniteIn(value.bgBlur, 0, 40)
    && isFiniteIn(value.bgOpacity, 0, 100)
    && isIntegerIn(value.cellSize, 4, 40)
    && isFiniteIn(value.coverage, 0, 100)
    && isFiniteIn(value.density, 0, 100)
    && typeof value.invert === 'boolean'
    && asciiCharSets.has(value.charSet as AsciiCharSet)
    && typeof value.customChars === 'string' && value.customChars.length <= 64
    && isFiniteIn(value.brightness, -100, 100)
    && isFiniteIn(value.contrast, 0, 300)
    && isFiniteIn(value.saturation, 0, 200)
    && isFiniteIn(value.grayscale, 0, 100)
    && isFiniteIn(value.edgeEmphasis, 0, 100)
    && isHexColor(value.tint)
    && isFiniteIn(value.tintOpacity, 0, 100)
    && typeof value.animated === 'boolean'
    && asciiAnimStyles.has(value.animStyle as AsciiAnimStyle)
    && isFiniteIn(value.animSpeed, 0, 100)
    && isFiniteIn(value.animIntensity, 0, 100)
    && isRecord(value.pfx)
    && asciiPostEffectIds.every((id) => isAsciiPostEffect((value.pfx as Record<string, unknown>)[id]));
};

const cloneAsciiDefaults = (): AsciiPreferences => ({
  ...defaultAsciiPreferences,
  pfx: Object.fromEntries(
    asciiPostEffectIds.map((id) => [id, { ...defaultAsciiPreferences.pfx[id] }]),
  ) as AsciiPreferences['pfx'],
});

const cloneAscii = (value: AsciiPreferences): AsciiPreferences => ({
  ...value,
  pfx: Object.fromEntries(
    asciiPostEffectIds.map((id) => [id, { ...value.pfx[id] }]),
  ) as AsciiPreferences['pfx'],
});

const cloneDefaults = (): AppearancePreferences => ({
  ...defaultAppearancePreferences,
  nbody: { ...defaultNBodyPreferences },
  fluid: { ...defaultFluidPreferences },
  ascii: cloneAsciiDefaults(),
});

export const parseAppearancePreferences = (raw: string | null): AppearancePreferences => {
  if (!raw) return cloneDefaults();
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)
      || !schemes.has(value.scheme as ColorSchemePreference)
      || !accents.has(value.accent as AccentId)
      || !backgrounds.has(value.background as BackgroundThemeId)
      || typeof value.backgroundPaused !== 'boolean'
      || !windowTints.has(value.windowTint as WindowTint)
      || !isFiniteIn(value.titlebarOpacity, 85, 100)
      || typeof value.reduceTransparency !== 'boolean'
      || typeof value.windowGlow !== 'boolean'
      || !dockSizes.has(value.dockSize as DockSize)
      || !isNBodyPreferences(value.nbody)
      || !isFluidPreferences(value.fluid)
      || !isAsciiPreferences(value.ascii)) return cloneDefaults();
    return {
      scheme: value.scheme as ColorSchemePreference,
      accent: value.accent as AccentId,
      background: value.background as BackgroundThemeId,
      backgroundPaused: value.backgroundPaused,
      windowGlow: value.windowGlow,
      windowTint: value.windowTint as WindowTint,
      titlebarOpacity: value.titlebarOpacity as number,
      reduceTransparency: value.reduceTransparency,
      dockSize: value.dockSize as DockSize,
      nbody: { ...value.nbody },
      fluid: { ...value.fluid },
      ascii: cloneAscii(value.ascii),
    };
  } catch {
    return cloneDefaults();
  }
};

export const resolveColorScheme = (preference: ColorSchemePreference, systemDark: boolean): ResolvedColorScheme => (
  preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
);

export const appearanceReducer = (state: AppearancePreferences, action: AppearancePreferenceAction): AppearancePreferences => {
  switch (action.type) {
    case 'SET_SCHEME': return { ...state, scheme: action.scheme };
    case 'SET_ACCENT': return { ...state, accent: action.accent };
    case 'SET_BACKGROUND': return { ...state, background: action.background };
    case 'SET_BACKGROUND_PAUSED': return { ...state, backgroundPaused: action.paused };
    case 'SET_WINDOW_GLOW': return { ...state, windowGlow: action.glow };
    case 'SET_WINDOW_TINT': return { ...state, windowTint: action.tint };
    case 'SET_TITLEBAR_OPACITY': return { ...state, titlebarOpacity: Math.min(100, Math.max(85, action.opacity)) };
    case 'SET_REDUCE_TRANSPARENCY': return { ...state, reduceTransparency: action.reduce };
    case 'SET_DOCK_SIZE': return { ...state, dockSize: action.size };
    case 'PATCH_NBODY': return { ...state, nbody: { ...state.nbody, ...action.patch } };
    case 'PATCH_FLUID': return { ...state, fluid: { ...state.fluid, ...action.patch } };
    case 'PATCH_ASCII': return {
      ...state,
      ascii: {
        ...state.ascii,
        ...action.patch,
        pfx: action.patch.pfx
          ? Object.fromEntries(
            asciiPostEffectIds.map((id) => [id, { ...state.ascii.pfx[id], ...action.patch.pfx?.[id] }]),
          ) as AsciiPreferences['pfx']
          : state.ascii.pfx,
      },
    };
    case 'RESET_BACKGROUND': return {
      ...state,
      backgroundPaused: false,
      nbody: { ...defaultNBodyPreferences },
      fluid: { ...defaultFluidPreferences },
      ascii: cloneAsciiDefaults(),
    };
    case 'RESET_ALL': return cloneDefaults();
  }
};

export const applyAppearanceToDocument = (
  root: HTMLElement,
  themeColor: HTMLMetaElement | null,
  preferences: AppearancePreferences,
  resolvedScheme: ResolvedColorScheme,
) => {
  root.dataset.colorScheme = resolvedScheme;
  root.dataset.accent = preferences.accent;
  root.dataset.desktopBackground = preferences.background;
  root.dataset.windowGlow = String(preferences.windowGlow);
  root.dataset.windowTint = preferences.windowTint;
  root.dataset.dockSize = preferences.dockSize;
  root.dataset.reduceTransparency = String(preferences.reduceTransparency);
  root.style.setProperty('--titlebar-opacity', String(preferences.titlebarOpacity / 100));
  root.style.colorScheme = resolvedScheme;
  if (themeColor) themeColor.content = resolvedScheme === 'dark' ? '#0b0e12' : '#ffffff';
};
