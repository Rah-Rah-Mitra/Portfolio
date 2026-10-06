import type { PaletteToken, TokenColours } from '../../../lib/estate/palette';
import type { EstateTier } from '../../../lib/estate/tiers';

// Browser-only helpers the Estate shell hands the engine when it creates one.
// Call from effects or event handlers, never during render (App is prerendered).
// Types only from lib/estate: palette.ts and tiers.ts check their tables when
// imported, and the shell must not carry either into the main bundle.

/**
 * The design tokens as the engine needs them (engineApi EstateEngineOptions
 * colours): each token resolved to a computed colour. A custom property's own
 * value can be a color-mix() or a var() (the --paper-* steps are), which the
 * palette parser rightly refuses, so a hidden probe takes `color: var(token)`
 * and getComputedStyle answers with rgb() or color(srgb …). A token that is
 * not defined resolves to null, never to an inherited colour. No colour is
 * written here; every value comes from index.css.
 */
export const readTokenColours = (): TokenColours => {
  const cache = new Map<string, string | null>();
  const root = getComputedStyle(document.documentElement);
  return (token: PaletteToken) => {
    const hit = cache.get(token);
    if (hit !== undefined) return hit;
    let value: string | null = null;
    if (root.getPropertyValue(token).trim() !== '') {
      const probe = document.createElement('i');
      probe.hidden = true;
      probe.style.color = `var(${token})`;
      document.body.appendChild(probe);
      value = getComputedStyle(probe).color.trim() || null;
      probe.remove();
    }
    cache.set(token, value);
    return value;
  };
};

/** governorCore's ESTATE_TIERS, restated (tests/estate-window.dom.test.tsx pins the two). */
export const SHELL_TIERS: readonly EstateTier[] = ['high', 'mid', 'low', 'min'];

/** `?estate-quality=` as governorCore's parseQualityOverride reads it: a tier, or undefined. */
export const qualityFromSearch = (search: string): EstateTier | undefined => {
  const raw = new URLSearchParams(search).get('estate-quality');
  const value = raw?.trim().toLowerCase();
  return SHELL_TIERS.find((tier) => tier === value);
};

/** `?estate-debug=1` or `?estate-bench=1`: the engine's debug readouts and the HUD's debug row. */
export const debugFromSearch = (search: string): boolean => {
  const params = new URLSearchParams(search);
  return params.get('estate-debug') === '1' || params.get('estate-bench') === '1';
};

/** `?estate-bench=1`: the engine runs the §12.4 benchmark route by itself once live (engineApi `bench`). */
export const benchFromSearch = (search: string): boolean => new URLSearchParams(search).get('estate-bench') === '1';

/** The shortest and longest `?estate-release-ms=` honoured. */
export const RELEASE_OVERRIDE_RANGE = [100, 30_000] as const;

/**
 * `?estate-release-ms=` (test only, plan §10.2 case 14): how long a closed window
 * keeps its engine before releasing it, instead of `fallback` (policy
 * RELEASE_AFTER_MS, 30 s), so an e2e run can watch release and reopen without
 * waiting half a minute. Whole milliseconds within RELEASE_OVERRIDE_RANGE only; it
 * can shorten the hold, never lengthen it, and anything else is ignored.
 */
export const releaseMsFromSearch = (search: string, fallback: number): number => {
  const raw = new URLSearchParams(search).get('estate-release-ms');
  if (raw === null || !/^\d+$/.test(raw.trim())) return fallback;
  const value = Number(raw.trim());
  const [lo, hi] = RELEASE_OVERRIDE_RANGE;
  return value >= lo && value <= Math.min(hi, fallback) ? value : fallback;
};

/**
 * `callback` once document.readyState is 'complete' (now, if it already is).
 * Returns the cancel. An automatic start waits for this, then for idle (§9.3),
 * so it never competes with the page's own load.
 */
export const onDocumentComplete = (callback: () => void): (() => void) => {
  if (document.readyState === 'complete') {
    callback();
    return () => {};
  }
  const check = () => {
    if (document.readyState !== 'complete') return;
    stop();
    callback();
  };
  const stop = () => {
    window.removeEventListener('load', check);
    document.removeEventListener('readystatechange', check);
  };
  window.addEventListener('load', check);
  document.addEventListener('readystatechange', check);
  return stop;
};

/**
 * `callback` when the main thread is idle: requestIdleCallback with `timeout`,
 * or a short timer where there is none. Returns the cancel.
 */
export const whenIdle = (callback: () => void, timeout: number): (() => void) => {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => callback(), { timeout });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = setTimeout(callback, 1);
  return () => clearTimeout(id);
};

/** Reload the page: the answer to a redeploy (stale), a lost capability (unavailable) and a chunk that failed to load. */
export const reloadPage = (): void => {
  window.location.reload();
};
