import type { DrawingTokens } from '../../../lib/drawings/ink';

// The drawing set's tokens off :root (docs/portfolio/desk-drawing-set.md §3
// "Inks"): the ground, the text, two accent steps and two neutral steps. A token
// written in any CSS colour syntax other than #rrggbb is resolved by letting a 2D
// context parse it, as desktopBackgroundPolicy.readBackdropPalette does — no
// colour is written here. null if any is missing: the drawing then does not paint.
// Browser-only: call from an effect, never during render (App is prerendered).

const HEX = /^#[0-9a-f]{6}$/i;

const TOKENS: Record<keyof DrawingTokens, string> = {
  bg: '--color-bg',
  text: '--color-text',
  accent700: '--color-accent-700',
  accent900: '--color-accent-900',
  neutral500: '--color-neutral-500',
  neutral700: '--color-neutral-700',
};

export const readDrawingTokens = (): DrawingTokens | null => {
  const styles = getComputedStyle(document.documentElement);
  let probe: CanvasRenderingContext2D | null | undefined;
  const resolve = (token: string): string | null => {
    const raw = styles.getPropertyValue(token).trim();
    if (!raw) return null;
    if (HEX.test(raw)) return raw.toLowerCase();
    if (probe === undefined) probe = document.createElement('canvas').getContext('2d');
    if (!probe) return null;
    // An unparseable value leaves fillStyle unchanged: reset it first, or a bad
    // token would read as the last good one.
    probe.fillStyle = 'transparent';
    probe.fillStyle = raw;
    const parsed = String(probe.fillStyle);
    return HEX.test(parsed) ? parsed.toLowerCase() : null;
  };
  const out = {} as DrawingTokens;
  for (const [key, token] of Object.entries(TOKENS) as [keyof DrawingTokens, string][]) {
    const value = resolve(token);
    if (!value) return null;
    out[key] = value;
  }
  return out;
};
