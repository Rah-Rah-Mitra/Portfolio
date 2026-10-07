import type { EstateTier } from './tiers';

// The Estate viewer's settings: the HUD's SETTINGS panel (live/EstateSettings),
// the engine's setSettings (engine/index.ts) and the shell's storage
// (shellDom.ts, localStorage 'estate:settings'). Pure: no DOM, no storage, no
// import-time checks (the controller chunk loads it on every desktop visit).
//
// Every setting applies at once and is a preference, settable in any mode; the
// panel says where each one applies. The defaults are today's constants, so a
// visitor who never opens the panel sees exactly what the engine drew before
// it existed (tests/estate-settings.test.ts pins them to their sources).
//
// Speeds and sensitivity snap to stops roughly evenly spaced on a log scale
// (perceived speed goes by ratio), each a round number, the default among them;
// a slider's value is the stop's index, so a stored value is always exact.

/** The detail level: Auto (the probed or ?estate-quality= start tier, which the governor may lower), or one tier held fixed. */
export type EstateDetail = 'auto' | EstateTier;
export const DETAIL_CHOICES: readonly EstateDetail[] = Object.freeze(['auto', 'high', 'mid', 'low', 'min']);

export interface EstateViewerSettings {
  /** Walk's pace, m/s; Shift runs 2.5× it. */
  readonly walkSpeed: number;
  /** × Fly's height-scaled speed; the wheel's own multiplier stays on top of it. */
  readonly flyScale: number;
  /** × drag and captured-mouse look, and Overview's orbit drags. */
  readonly lookScale: number;
  /** Vertical look inverted, Walk and Fly only. */
  readonly invertLook: boolean;
  /** Walk's and Fly's vertical field of view, degrees (Overview keeps the poster's lens). */
  readonly fovDeg: number;
  readonly detail: EstateDetail;
  /** Façade edge lines and the massing's storey lines. */
  readonly edges: boolean;
  /** Toon shading: three flat tones per palette colour, outlined (materials.ts). */
  readonly toon: boolean;
  /** Flights, arcs, fades and climbs cut to their end; walking starts and stops at once. */
  readonly reduceMotion: boolean;
  /** The frame-stats row (what ?estate-debug=1 shows). */
  readonly stats: boolean;
}

export type EstateSettingsPatch = Partial<EstateViewerSettings>;

export const WALK_SPEED_STOPS = Object.freeze([0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2, 2.25, 2.5, 2.8, 3.2] as const);
export const FLY_SCALE_STOPS = Object.freeze([0.5, 0.6, 0.7, 0.85, 1, 1.2, 1.4, 1.7, 2] as const);
export const LOOK_SCALE_STOPS = Object.freeze([0.25, 0.35, 0.5, 0.6, 0.7, 0.85, 1, 1.2, 1.4, 1.7, 2, 2.5, 3] as const);
/** Walk and Fly's vertical field of view, degrees: 50–90 in whole degrees. */
export const FOV_RANGE = Object.freeze({ min: 50, max: 90, step: 1 });

export const ESTATE_SETTINGS_DEFAULTS: EstateViewerSettings = Object.freeze({
  walkSpeed: 1.6,
  flyScale: 1,
  lookScale: 1,
  invertLook: false,
  fovDeg: 60,
  detail: 'auto',
  edges: true,
  toon: false,
  reduceMotion: false,
  stats: false,
});

/** The stored form's version; a stored value of any other is read as empty. */
export const SETTINGS_VERSION = 1;
/** A stored value longer than this is not ours: read as empty. */
const STORED_MAX = 1024;

type Key = keyof EstateViewerSettings;
const STOPS: Partial<Record<Key, readonly number[]>> = {
  walkSpeed: WALK_SPEED_STOPS,
  flyScale: FLY_SCALE_STOPS,
  lookScale: LOOK_SCALE_STOPS,
};
const FLAGS: readonly Key[] = ['invertLook', 'edges', 'toon', 'reduceMotion', 'stats'];
const KEYS = Object.keys(ESTATE_SETTINGS_DEFAULTS) as Key[];

/** The index of the stop nearest `value` (the first of two equally near). */
export const stopIndex = (stops: readonly number[], value: number): number => {
  let best = 0;
  for (let i = 1; i < stops.length; i += 1) {
    if (Math.abs(stops[i] - value) < Math.abs(stops[best] - value)) best = i;
  }
  return best;
};

const own = (raw: object, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(raw, key) ? (raw as Record<string, unknown>)[key] : undefined;

/**
 * The valid part of `raw`: known keys only, read by name; numbers finite, then
 * snapped to their stops (speeds, sensitivity) or rounded and clamped (the field
 * of view); flags only as booleans; the detail only as one of its choices. A
 * bad value drops that key alone.
 */
export const sanitizeSettingsPatch = (raw: unknown): EstateSettingsPatch => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean: Record<string, unknown> = {};
  for (const key of KEYS) {
    const value = own(raw, key);
    if (value === undefined) continue;
    const stops = STOPS[key];
    if (stops) {
      if (typeof value === 'number' && Number.isFinite(value)) clean[key] = stops[stopIndex(stops, value)];
    } else if (key === 'fovDeg') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        clean[key] = Math.min(FOV_RANGE.max, Math.max(FOV_RANGE.min, Math.round(value)));
      }
    } else if (key === 'detail') {
      if (DETAIL_CHOICES.includes(value as EstateDetail)) clean[key] = value;
    } else if (FLAGS.includes(key) && typeof value === 'boolean') {
      clean[key] = value;
    }
  }
  return clean as EstateSettingsPatch;
};

/** `base` with the valid part of `raw` applied: `base` itself when nothing changes, otherwise a new frozen object. */
export const patchSettings = (base: EstateViewerSettings, raw: unknown): EstateViewerSettings => {
  const clean = sanitizeSettingsPatch(raw) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...base };
  let changed = false;
  for (const key of KEYS) {
    if (key in clean && clean[key] !== base[key]) {
      next[key] = clean[key];
      changed = true;
    }
  }
  return changed ? Object.freeze(next as unknown as EstateViewerSettings) : base;
};

/** Settings from a patch over the defaults (the defaults object itself for an empty or invalid patch). */
export const settingsFrom = (raw: unknown): EstateViewerSettings => patchSettings(ESTATE_SETTINGS_DEFAULTS, raw);

/** The stored form: `{"v":1, …}` with only the settings that differ from the defaults, so a later default reaches anyone who never moved it. */
export const serializeSettings = (settings: EstateViewerSettings): string => {
  const out: Record<string, unknown> = { v: SETTINGS_VERSION };
  for (const key of KEYS) if (settings[key] !== ESTATE_SETTINGS_DEFAULTS[key]) out[key] = settings[key];
  return JSON.stringify(out);
};

/** A stored value back to a patch: empty for nothing stored, too long, not JSON, not an object, or another version. */
export const parseStoredSettings = (text: string | null): EstateSettingsPatch => {
  if (text === null || text.length > STORED_MAX) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {};
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  if (own(raw, 'v') !== SETTINGS_VERSION) return {};
  return sanitizeSettingsPatch(raw);
};

/** The horizontal field of view a vertical one gives at this aspect (Hor+), degrees. */
export const horizontalFovDeg = (vfovDeg: number, aspect: number): number =>
  (2 * Math.atan(Math.tan((vfovDeg * Math.PI) / 360) * aspect) * 180) / Math.PI;
