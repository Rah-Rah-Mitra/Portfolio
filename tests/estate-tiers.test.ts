import { describe, expect, it } from 'vitest';
import budgets from '../lib/estate/packBudgets.json';
import {
  ESTATE_TIERS, ESTATE_TIER_TABLE, MSAA_MAX_PIXELS, PIXEL_RATIO_STEPS, capPixelRatio, isEstateTier, msaaAtStart, tierRank,
  type EstateTier,
} from '../lib/estate/tiers';

// The one tier table (plan §7.4, §7.7, §7.9) and the one §7.7 pixel-ratio rule.
// lod, storeys, the scheduler and the governor all read these; their own tests
// only check how they use a row.

const MB = 1_000_000;

// Deterministic choices: mulberry32.
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('tier table', () => {
  it('is packBudgets.json\'s, best first, frozen', () => {
    expect(ESTATE_TIERS).toEqual(budgets.tiers.map((t) => t.id));
    expect(ESTATE_TIERS.map((id) => ESTATE_TIER_TABLE[id])).toEqual(budgets.tiers);
    expect(Object.isFrozen(ESTATE_TIER_TABLE) && Object.isFrozen(ESTATE_TIER_TABLE.high)).toBe(true);
    expect(PIXEL_RATIO_STEPS).toEqual(budgets.pixelRatioSteps);
  });

  it('holds the plan\'s §7.4 and §7.7 numbers', () => {
    const column = <K extends keyof (typeof ESTATE_TIER_TABLE)['high']>(key: K) => ESTATE_TIERS.map((id) => ESTATE_TIER_TABLE[id][key]);
    expect(column('tauPx')).toEqual([2, 3, 4.5, 6]);
    expect(column('maxTris')).toEqual([1_200_000, 800_000, 450_000, 300_000]);
    expect(column('maxDraws')).toEqual([150, 120, 90, 60]);
    expect(column('bandK')).toEqual([2, 1, 1, 1]);
    expect(column('treeRadiusM')).toEqual([80, 60, 30, 15]);
    expect(column('furnitureRadiusM')).toEqual([25, 15, 8, 5]);
    expect(column('edges')).toEqual([true, true, false, false]);
    expect(column('pixelCap')).toEqual([2_000_000, 1_400_000, 1_000_000, 700_000]);
    expect(column('gpuBytes')).toEqual([128 * MB, 80 * MB, 48 * MB, 32 * MB]);
  });

  it('never makes a lower tier cost more, which the governor\'s ladder relies on', () => {
    for (let i = 1; i < ESTATE_TIERS.length; i += 1) {
      const better = ESTATE_TIER_TABLE[ESTATE_TIERS[i - 1]];
      const worse = ESTATE_TIER_TABLE[ESTATE_TIERS[i]];
      expect(worse.tauPx).toBeGreaterThan(better.tauPx);
      for (const key of ['maxTris', 'maxDraws', 'bandK', 'pixelCap', 'gpuBytes'] as const) expect(worse[key]).toBeLessThanOrEqual(better[key]);
    }
  });

  it('ranks and recognises tier ids', () => {
    expect(ESTATE_TIERS.map(tierRank)).toEqual([0, 1, 2, 3]);
    expect(ESTATE_TIERS.every(isEstateTier)).toBe(true);
    for (const bad of ['ultra', 'High', '', null, 3, undefined]) expect(isEstateTier(bad)).toBe(false);
  });
});

describe('pixel ratio under the tier cap (§7.7)', () => {
  it('takes the largest step ≤ devicePixelRatio whose buffer fits the cap', () => {
    // 900 × 600 CSS px at DPR 2: 2 → 2.16 Mpx is over 2.0 Mpx, 1.75 → 1.65 Mpx fits.
    expect(capPixelRatio('high', 900, 600, 2)).toBe(1.75);
    expect(capPixelRatio('mid', 900, 600, 2)).toBe(1.5); // 1.215 ≤ 1.4 Mpx
    expect(capPixelRatio('low', 900, 600, 2)).toBe(1.25); // 0.84 ≤ 1.0 Mpx
    expect(capPixelRatio('min', 900, 600, 2)).toBe(1); // 0.54 ≤ 0.7 Mpx
    // 1280×720 at dpr 2: 2.0 → 3.69 Mpx, 1.75 → 2.82, 1.5 → 2.07, 1.25 → 1.44 Mpx.
    expect(capPixelRatio('high', 1280, 720, 2)).toBe(1.25);
    expect(capPixelRatio('mid', 1280, 720, 2)).toBe(1);
    expect(capPixelRatio('min', 1280, 720, 2)).toBe(0.75);
    // Never above the device: DPR 1.5 never draws at 1.75; 1.3 and 1.1 take the step below.
    expect(capPixelRatio('high', 800, 600, 1.5)).toBe(1.5);
    expect(capPixelRatio('high', 400, 300, 1.3)).toBe(1.25);
    expect(capPixelRatio('high', 400, 300, 1.1)).toBe(1);
  });

  it('honours a notch ceiling and floors at 0.75, or below it only to stay at or under the device and the ceiling', () => {
    expect(capPixelRatio('high', 400, 300, 2, 1.25)).toBe(1.25);
    // Nothing fits: a maximised 4K window cannot fit 0.7 Mpx even at 0.75.
    expect(capPixelRatio('min', 3840, 2160, 1)).toBe(0.75);
    expect(capPixelRatio('high', 8000, 8000, 2)).toBe(0.75);
    // Browser zoom at 50 % or 67 % on a 1× screen: the buffer is never sharper
    // than the device (the one answer for the scheduler's accounting and the
    // renderer's size, which two rules used to disagree on).
    expect(capPixelRatio('high', 400, 300, 0.5)).toBe(0.5);
    expect(capPixelRatio('mid', 1200, 800, 0.67)).toBe(0.67);
    expect(capPixelRatio('high', 400, 300, 2, 0.6)).toBe(0.6);
    // A bad DPR reads as 1.
    expect(capPixelRatio('high', 400, 300, Number.NaN)).toBe(1);
    expect(capPixelRatio('high', 400, 300, 0)).toBe(1);
    // The buffer is measured as three sizes it, floor(w·r) × floor(h·r).
    expect(capPixelRatio('high', 1414, 1414, 1)).toBe(1); // 1,999,396 px
    expect(capPixelRatio('high', 1415, 1415, 1)).toBe(0.75); // 2,002,225 px
  });

  it('keeps every chosen buffer within the cap unless only the smallest step is left', () => {
    const r = rng(7);
    for (let n = 0; n < 500; n += 1) {
      const w = 200 + Math.floor(r() * 3000);
      const h = 150 + Math.floor(r() * 2000);
      const dpr = 0.75 + r() * 2.5;
      const tier: EstateTier = ESTATE_TIERS[n % 4];
      const ratio = capPixelRatio(tier, w, h, dpr);
      const cap = ESTATE_TIER_TABLE[tier].pixelCap;
      expect(PIXEL_RATIO_STEPS).toContain(ratio);
      expect(ratio).toBeLessThanOrEqual(dpr);
      if (ratio !== 0.75) expect(Math.floor(w * ratio) * Math.floor(h * ratio)).toBeLessThanOrEqual(cap);
      for (const s of PIXEL_RATIO_STEPS.filter((step) => step > ratio && step <= dpr)) {
        expect(Math.floor(w * s) * Math.floor(h * s)).toBeGreaterThan(cap);
      }
    }
  });
});

describe('MSAA (§7.7)', () => {
  it('turns on only from mid or better at ≤ 2.0 Mpx', () => {
    expect(MSAA_MAX_PIXELS).toBe(2_000_000);
    expect(msaaAtStart('high', 2_000_000)).toBe(true);
    expect(msaaAtStart('mid', 1_400_000)).toBe(true);
    expect(msaaAtStart('high', 2_000_001)).toBe(false);
    expect(msaaAtStart('low', 500_000)).toBe(false);
    expect(msaaAtStart('min', 500_000)).toBe(false);
  });
});
