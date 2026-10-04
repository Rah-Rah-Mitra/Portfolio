import type { NBodyExpansionOrder, NBodyLeafCapacity, NBodyPreset } from '../../types';

export interface NBodyWorkerConfig {
  particleCount: number;
  effectiveParticleCount: number;
  preset: NBodyPreset;
  seed: number;
  timeScale: number;
  gravity: number;
  softening: number;
  expansionOrder: NBodyExpansionOrder;
  leafCapacity: NBodyLeafCapacity;
  pointerAttraction: boolean;
  showTree: boolean;
}

/**
 * The settings a running field takes without a restart. The solver reads
 * gravity, softening, order and leaf capacity on every compute, the integrator
 * reads timeScale per step, and the painter reads showTree per frame; only the
 * preset, seed and body count define the initial condition and need a new run.
 */
export type NBodyLiveConfig = Pick<NBodyWorkerConfig, 'timeScale' | 'gravity' | 'softening' | 'expansionOrder' | 'leafCapacity' | 'pointerAttraction' | 'showTree'>;

// A step with dt === 0 is a redraw: the worker renders the bodies where they
// are without integrating, even while paused. That is how a halted field
// (reduced motion, "Pause all motion") still shows one honest still frame, and
// how a resize repaints a frozen field at its new size.
export type NBodyWorkerMessage =
  | { type: 'initialize'; config: NBodyWorkerConfig; canvas?: OffscreenCanvas; width?: number; height?: number; dpr?: number }
  | ({ type: 'configure' } & NBodyLiveConfig)
  | { type: 'step'; dt: number; buffer: ArrayBuffer; width?: number; height?: number; dpr?: number; trailPersistence?: number; accent?: string; accentDeep?: string }
  | { type: 'pause'; paused: boolean }
  | { type: 'reset'; seed: number }
  | { type: 'pointer'; x: number; y: number; active: boolean }
  | { type: 'recycle'; buffer: ArrayBuffer };

// Field units → canvas pixels. The solver works in a square frame centred on
// the desk; one field unit is this share of the desk's SHORTER side, so the
// galaxy stays round on a wide desk. The worker draws with it and the host maps
// the pointer with it — one constant, or the attractor lands beside the cursor.
export const FIELD_SCALE = 0.48;
export const POINTER_LIMIT = 4;

const finite = (value: unknown, minimum: number, maximum: number) => typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
const integer = (value: unknown, minimum: number, maximum: number) => Number.isInteger(value) && finite(value, minimum, maximum);
const isPreset = (value: unknown): value is NBodyPreset => value === 'galaxy' || value === 'binary' || value === 'field';
const isOrder = (value: unknown): value is NBodyExpansionOrder => value === 4 || value === 6 || value === 8 || value === 10;
const isLeafCapacity = (value: unknown): value is NBodyLeafCapacity => value === 24 || value === 48 || value === 72 || value === 96;
const isHexColor = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export const createWorkerConfig = (overrides: Partial<NBodyWorkerConfig> = {}): NBodyWorkerConfig => ({
  particleCount: 2048,
  effectiveParticleCount: 2048,
  preset: 'galaxy',
  seed: 41,
  timeScale: 1,
  gravity: 1,
  softening: 0.012,
  expansionOrder: 8,
  leafCapacity: 48,
  pointerAttraction: true,
  showTree: false,
  ...overrides,
});

/** Desk-relative CSS pixels → solver coordinates (y up, origin at the desk centre). */
export const toFieldPoint = (x: number, y: number, width: number, height: number) => {
  const scale = Math.max(1, Math.min(width, height) * FIELD_SCALE);
  const clamp = (value: number) => Math.max(-POINTER_LIMIT, Math.min(POINTER_LIMIT, value));
  return { x: clamp((x - width / 2) / scale), y: clamp((height / 2 - y) / scale) };
};

// One set of bounds for the live fields, shared by initialize and configure.
const isLiveConfig = (config: Partial<NBodyLiveConfig>) => finite(config.timeScale, 0.25, 2)
  && finite(config.gravity, 0.2, 2)
  && finite(config.softening, 0.002, 0.04)
  && isOrder(config.expansionOrder)
  && isLeafCapacity(config.leafCapacity)
  && typeof config.pointerAttraction === 'boolean'
  && typeof config.showTree === 'boolean';

const isConfig = (value: unknown): value is NBodyWorkerConfig => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as Partial<NBodyWorkerConfig>;
  return integer(config.particleCount, 256, 4096)
    && integer(config.effectiveParticleCount, 256, config.particleCount ?? 0)
    && isPreset(config.preset)
    && integer(config.seed, 0, 2_147_483_647)
    && isLiveConfig(config);
};

export const normalizeNBodyWorkerMessage = (value: unknown): NBodyWorkerMessage | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (message.type === 'initialize' && isConfig(message.config)) {
    if (message.canvas !== undefined && !(typeof OffscreenCanvas !== 'undefined' && message.canvas instanceof OffscreenCanvas)) return null;
    return message as unknown as NBodyWorkerMessage;
  }
  if (message.type === 'configure' && isLiveConfig(message as Partial<NBodyLiveConfig>)) {
    // Rebuilt field by field: the worker spreads this into its config, so no
    // stray key (a particleCount, a seed) may ride along and skip initialize.
    const live = message as unknown as NBodyLiveConfig;
    return {
      type: 'configure',
      timeScale: live.timeScale,
      gravity: live.gravity,
      softening: live.softening,
      expansionOrder: live.expansionOrder,
      leafCapacity: live.leafCapacity,
      pointerAttraction: live.pointerAttraction,
      showTree: live.showTree,
    };
  }
  if (message.type === 'step' && finite(message.dt, 0, 0.25) && message.buffer instanceof ArrayBuffer) {
    // Palette values reach a canvas fillStyle inside the worker, so only plain
    // #rrggbb passes — never a url(), a gradient or a var() the worker cannot resolve.
    if (message.accent !== undefined && !isHexColor(message.accent)) return null;
    if (message.accentDeep !== undefined && !isHexColor(message.accentDeep)) return null;
    if (message.trailPersistence !== undefined && !finite(message.trailPersistence, 0, 90)) return null;
    return message as unknown as NBodyWorkerMessage;
  }
  if (message.type === 'pause' && typeof message.paused === 'boolean') return { type: 'pause', paused: message.paused };
  if (message.type === 'reset' && integer(message.seed, 0, 2_147_483_647)) return { type: 'reset', seed: message.seed as number };
  if (message.type === 'pointer' && finite(message.x, -POINTER_LIMIT, POINTER_LIMIT) && finite(message.y, -POINTER_LIMIT, POINTER_LIMIT) && typeof message.active === 'boolean') return { type: 'pointer', x: message.x as number, y: message.y as number, active: message.active };
  if (message.type === 'recycle' && message.buffer instanceof ArrayBuffer) return { type: 'recycle', buffer: message.buffer };
  return null;
};

const tiers = [4096, 3072, 2048, 1536, 1024, 768, 512, 384, 256] as const;

export const resolveEffectiveParticleCount = (requested: number, current: number, stepP95: number) => {
  const boundedCurrent = Math.min(requested, Math.max(256, current));
  if (stepP95 <= 24) return boundedCurrent;
  return tiers.find((tier) => tier < boundedCurrent && tier <= requested) ?? 256;
};
