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

export type NBodyWorkerMessage =
  | { type: 'initialize'; config: NBodyWorkerConfig; canvas?: OffscreenCanvas; width?: number; height?: number; dpr?: number }
  | { type: 'step'; dt: number; buffer: ArrayBuffer; width?: number; height?: number; dpr?: number; trailPersistence?: number; accent?: string; surface?: string; darkSurface?: boolean }
  | { type: 'pause'; paused: boolean }
  | { type: 'reset'; seed: number }
  | { type: 'pointer'; x: number; y: number; active: boolean }
  | { type: 'recycle'; buffer: ArrayBuffer };

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

const isConfig = (value: unknown): value is NBodyWorkerConfig => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as Partial<NBodyWorkerConfig>;
  return integer(config.particleCount, 256, 4096)
    && integer(config.effectiveParticleCount, 256, config.particleCount ?? 0)
    && isPreset(config.preset)
    && integer(config.seed, 0, 2_147_483_647)
    && finite(config.timeScale, 0.25, 2)
    && finite(config.gravity, 0.2, 2)
    && finite(config.softening, 0.002, 0.04)
    && isOrder(config.expansionOrder)
    && isLeafCapacity(config.leafCapacity)
    && typeof config.pointerAttraction === 'boolean'
    && typeof config.showTree === 'boolean';
};

export const normalizeNBodyWorkerMessage = (value: unknown): NBodyWorkerMessage | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (message.type === 'initialize' && isConfig(message.config)) {
    if (message.canvas !== undefined && !(typeof OffscreenCanvas !== 'undefined' && message.canvas instanceof OffscreenCanvas)) return null;
    return message as unknown as NBodyWorkerMessage;
  }
  if (message.type === 'step' && finite(message.dt, 0, 0.25) && message.buffer instanceof ArrayBuffer) {
    if (message.accent !== undefined && !isHexColor(message.accent)) return null;
    if (message.surface !== undefined && !isHexColor(message.surface)) return null;
    if (message.darkSurface !== undefined && typeof message.darkSurface !== 'boolean') return null;
    return message as unknown as NBodyWorkerMessage;
  }
  if (message.type === 'pause' && typeof message.paused === 'boolean') return { type: 'pause', paused: message.paused };
  if (message.type === 'reset' && integer(message.seed, 0, 2_147_483_647)) return { type: 'reset', seed: message.seed as number };
  if (message.type === 'pointer' && finite(message.x, -2, 2) && finite(message.y, -2, 2) && typeof message.active === 'boolean') return { type: 'pointer', x: message.x as number, y: message.y as number, active: message.active };
  if (message.type === 'recycle' && message.buffer instanceof ArrayBuffer) return { type: 'recycle', buffer: message.buffer };
  return null;
};

const tiers = [4096, 3072, 2048, 1536, 1024, 768, 512, 384, 256] as const;

export const resolveEffectiveParticleCount = (requested: number, current: number, stepP95: number) => {
  const boundedCurrent = Math.min(requested, Math.max(256, current));
  if (stepP95 <= 24) return boundedCurrent;
  return tiers.find((tier) => tier < boundedCurrent && tier <= requested) ?? 256;
};
