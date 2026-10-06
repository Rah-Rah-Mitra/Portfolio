import budgets from './packBudgets.json';

// The Estate's quality tiers (plan §7.4, §7.7, §7.9): one table, read from
// packBudgets.json and checked once, here. lod.ts, storeys.ts, the scheduler,
// the governor and the engine all read their tier row from this module, so a
// bad edit to the JSON fails at import in one place, and there is one §7.7
// pixel-ratio rule rather than two that disagree below devicePixelRatio 0.75.
// Pure: no DOM, no clock.

/** Best first; a tier's index is its rank (0 high … 3 min). */
export const ESTATE_TIERS = ['high', 'mid', 'low', 'min'] as const;
export type EstateTier = (typeof ESTATE_TIERS)[number];

export interface EstateTierRow {
  readonly id: EstateTier;
  /** Screen-space error a level may show before the next one is wanted, px (§7.4). */
  readonly tauPx: number;
  /** Per-frame caps on what is drawn: triangles and draw calls (§7.4). */
  readonly maxTris: number;
  readonly maxDraws: number;
  /** Interior band half-width k, an integer ≥ 1 (§7.5: at 0 a stair loses its ceiling). */
  readonly bandK: number;
  /** Full-detail trees within this distance of the camera, crowns beyond; m. */
  readonly treeRadiusM: number;
  /** Full furniture within this distance, 12-triangle proxies beyond; m. */
  readonly furnitureRadiusM: number;
  /** Façade edge lines are drawn. */
  readonly edges: boolean;
  /** Drawing-buffer pixel cap (§7.7). */
  readonly pixelCap: number;
  /** GPU budget, geometry plus the drawing buffer, decimal bytes (§7.7). */
  readonly gpuBytes: number;
}

const fail = (problem: string): never => { throw new Error(`lib/estate/packBudgets.json: ${problem}`); };
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const whole = (v: unknown): v is number => positive(v) && Number.isInteger(v);
const nonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// Each row is checked on its own, then the order: a lower tier must never cost
// more, or the governor's ladder (which steps down by tier) would climb.
const TABLE: Readonly<Record<EstateTier, EstateTierRow>> = (() => {
  const rows = budgets.tiers as ReadonlyArray<Record<string, unknown>>;
  if (rows.length !== ESTATE_TIERS.length || rows.some((row, i) => row.id !== ESTATE_TIERS[i])) {
    fail(`tiers must be ${ESTATE_TIERS.join(', ')} in that order, got ${rows.map((row) => String(row.id)).join(', ')}`);
  }
  const out = {} as Record<EstateTier, EstateTierRow>;
  rows.forEach((row, i) => {
    const id = ESTATE_TIERS[i];
    const bad = (key: string, want: string) => fail(`tier ${id} ${key} must be ${want}, got ${String(row[key])}`);
    if (!positive(row.tauPx)) bad('tauPx', 'a positive number');
    if (!whole(row.maxTris)) bad('maxTris', 'a positive integer');
    if (!whole(row.maxDraws)) bad('maxDraws', 'a positive integer');
    if (!whole(row.bandK)) bad('bandK', 'an integer ≥ 1');
    if (!nonNegative(row.treeRadiusM)) bad('treeRadiusM', 'a number ≥ 0');
    if (!nonNegative(row.furnitureRadiusM)) bad('furnitureRadiusM', 'a number ≥ 0');
    if (typeof row.edges !== 'boolean') bad('edges', 'true or false');
    if (!whole(row.pixelCap)) bad('pixelCap', 'a positive integer');
    if (!whole(row.gpuBytes)) bad('gpuBytes', 'a positive integer');
    out[id] = Object.freeze({
      id,
      tauPx: row.tauPx as number,
      maxTris: row.maxTris as number,
      maxDraws: row.maxDraws as number,
      bandK: row.bandK as number,
      treeRadiusM: row.treeRadiusM as number,
      furnitureRadiusM: row.furnitureRadiusM as number,
      edges: row.edges as boolean,
      pixelCap: row.pixelCap as number,
      gpuBytes: row.gpuBytes as number,
    });
  });
  for (let i = 1; i < ESTATE_TIERS.length; i += 1) {
    const better = out[ESTATE_TIERS[i - 1]];
    const worse = out[ESTATE_TIERS[i]];
    if (!(worse.tauPx > better.tauPx)) fail(`tier ${worse.id} tauPx must exceed ${better.id}'s`);
    for (const key of ['maxTris', 'maxDraws', 'bandK', 'treeRadiusM', 'furnitureRadiusM', 'pixelCap', 'gpuBytes'] as const) {
      if (worse[key] > better[key]) fail(`tier ${worse.id} ${key} must not exceed ${better.id}'s`);
    }
  }
  return Object.freeze(out);
})();

/** Every tier's row, frozen. */
export const ESTATE_TIER_TABLE: Readonly<Record<EstateTier, EstateTierRow>> = TABLE;

export const isEstateTier = (value: unknown): value is EstateTier =>
  typeof value === 'string' && (ESTATE_TIERS as readonly string[]).includes(value);

/** 0 for high … 3 for min. */
export const tierRank = (tier: EstateTier): number => ESTATE_TIERS.indexOf(tier);

// ---- §7.7 pixel ratio and MSAA ------------------------------------------------------

/** The pixel ratios a drawing buffer may use, largest first (§7.7). */
export const PIXEL_RATIO_STEPS: readonly number[] = (() => {
  const steps = budgets.pixelRatioSteps as readonly unknown[];
  if (steps.length === 0 || steps.some((s, i) => !positive(s) || (i > 0 && (s as number) >= (steps[i - 1] as number)))) {
    fail('pixelRatioSteps must be positive and strictly descending');
  }
  return Object.freeze([...(steps as number[])]);
})();

const RATIO_FLOOR = PIXEL_RATIO_STEPS[PIXEL_RATIO_STEPS.length - 1];

/**
 * §7.7: the largest step ≤ devicePixelRatio and ≤ `ceiling` (a governor notch's
 * ratio) whose drawing buffer, floor(w·r) × floor(h·r) as three sizes it, fits
 * the tier's pixel cap. When none fits, the smallest step (0.75) — or the limit
 * itself when that is lower, so the buffer is never sharper than the device
 * (browser zoom at 50 % on a 1× screen reads devicePixelRatio 0.5) and the
 * ceiling always holds. A non-positive or non-finite DPR reads as 1. Call on
 * start and on every debounced resize.
 */
export const capPixelRatio = (
  tier: EstateTier, cssWidth: number, cssHeight: number, devicePixelRatio: number, ceiling = Infinity,
): number => {
  const cap = TABLE[tier].pixelCap;
  const dpr = devicePixelRatio > 0 && Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  const limit = Math.min(dpr, ceiling);
  for (let i = 0; i < PIXEL_RATIO_STEPS.length; i += 1) {
    const r = PIXEL_RATIO_STEPS[i];
    if (r <= limit && Math.floor(cssWidth * r) * Math.floor(cssHeight * r) <= cap) return r;
  }
  return Math.min(RATIO_FLOOR, limit);
};

/** MSAA only when the starting buffer is at most this many pixels (§7.7). */
export const MSAA_MAX_PIXELS = 2_000_000;

/** Decided once at context creation: on only from a starting tier of mid or better, at ≤ 2.0 Mpx. The governor never toggles it. */
export const msaaAtStart = (startTier: EstateTier, bufferPixels: number): boolean =>
  tierRank(startTier) <= tierRank('mid') && bufferPixels <= MSAA_MAX_PIXELS;
