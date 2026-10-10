// The drawing set's inks (docs/portfolio/desk-drawing-set.md §3 "Inks"). Every ink
// is a design token mixed with the desk's ground (--color-bg) in sRGB and drawn
// opaque, so a line never darkens where it crosses another and the desk grid is
// the only thing under it. Two weights: the desk (no window open: the drawing is
// the content) and reading (a window is open: the drawing is behind it). The
// ceilings keep the drawing under the windows and the desk's own text: strokes at
// most 2.2:1 against the ground on an open desk and 1.6:1 while reading, fills at
// most 1.5:1. tests/drawing-ink.test.ts holds every ink to them.
//
// No colour is written here: the tokens come off :root (palette.ts reads them in
// an effect), and paper-75 is the token's own formula (index.css: the ground
// 75 % toward white).

export interface DrawingTokens {
  bg: string;
  text: string;
  accent700: string;
  accent900: string;
  neutral500: string;
  neutral700: string;
}

export type InkMode = 'desk' | 'reading';

export type InkLayer =
  | 'extent' | 'kerb' | 'slab' | 'context' | 'face' | 'hero' | 'jamb' | 'dim' | 'plate' | 'crop' | 'ruler'
  | 'lid' | 'room' | 'tread' | 'shared' | 'poche' | 'hidden' | 'stairLink' | 'liftLink' | 'massing' | 'leader';

interface InkSpec {
  token: keyof DrawingTokens | 'paper75';
  /** Stroke width, CSS px; 0 for a fill. */
  width: number;
  dash: readonly number[] | null;
  desk: number;
  reading: number;
}

export const INK_SPECS: Readonly<Record<InkLayer, InkSpec>> = {
  extent: { token: 'neutral700', width: 0.9, dash: null, desk: 0.45, reading: 0.3 },
  kerb: { token: 'neutral500', width: 0.7, dash: null, desk: 0.55, reading: 0.36 },
  slab: { token: 'neutral500', width: 0.7, dash: null, desk: 0.55, reading: 0.36 },
  context: { token: 'accent700', width: 0.8, dash: null, desk: 0.3, reading: 0.2 },
  face: { token: 'paper75', width: 0, dash: null, desk: 1, reading: 1 },
  hero: { token: 'accent700', width: 1.4, dash: null, desk: 0.5, reading: 0.32 },
  jamb: { token: 'accent700', width: 0.8, dash: null, desk: 0.5, reading: 0.32 },
  dim: { token: 'neutral700', width: 0.7, dash: null, desk: 0.5, reading: 0.32 },
  plate: { token: 'accent700', width: 1, dash: null, desk: 0.5, reading: 0.32 },
  crop: { token: 'neutral700', width: 1, dash: null, desk: 0.5, reading: 0.32 },
  ruler: { token: 'neutral700', width: 0.8, dash: null, desk: 0.5, reading: 0.32 },
  lid: { token: 'accent700', width: 0, dash: null, desk: 0.22, reading: 0.14 },
  room: { token: 'accent700', width: 0.8, dash: null, desk: 0.42, reading: 0.27 },
  tread: { token: 'accent700', width: 0.6, dash: null, desk: 0.42, reading: 0.27 },
  shared: { token: 'accent700', width: 0.6, dash: [2, 3], desk: 0.3, reading: 0.2 },
  poche: { token: 'accent900', width: 0, dash: null, desk: 0.2, reading: 0.12 },
  hidden: { token: 'neutral500', width: 0.8, dash: [3, 3], desk: 0.55, reading: 0.36 },
  stairLink: { token: 'accent700', width: 0.9, dash: [4, 3], desk: 0.45, reading: 0.3 },
  liftLink: { token: 'accent700', width: 0.9, dash: [10, 3, 2, 3], desk: 0.45, reading: 0.3 },
  massing: { token: 'text', width: 1.1, dash: null, desk: 0.35, reading: 0.22 },
  leader: { token: 'neutral700', width: 0.6, dash: null, desk: 0.45, reading: 0.3 },
};

export interface Ink { color: string; width: number; dash: readonly number[] | null }
export type Inks = Readonly<Record<InkLayer, Ink>>;

/** Contrast ceilings against the ground (WCAG ratio). */
export const STROKE_CEILING: Readonly<Record<InkMode, number>> = { desk: 2.2, reading: 1.6 };
export const FILL_CEILING = 1.5;

const HEX = /^#[0-9a-f]{6}$/i;

const rgb = (hex: string): [number, number, number] => {
  if (!HEX.test(hex)) throw new Error(`drawing ink: not a #rrggbb colour: ${hex}`);
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

const hex = (c: readonly number[]) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/** `a` mixed with `b`, `t` of the way to `a` (CSS color-mix(in srgb, a t, b)). */
export const mixHex = (a: string, b: string, t: number): string => {
  const ca = rgb(a);
  const cb = rgb(b);
  return hex(ca.map((v, i) => v * t + cb[i] * (1 - t)));
};

const luminance = (color: string) => {
  const [r, g, b] = rgb(color).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio. */
export const contrast = (a: string, b: string): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** --paper-75: the ground 75 % toward white (index.css). */
export const paper75 = (tokens: Pick<DrawingTokens, 'bg'>): string => mixHex(tokens.bg, '#ffffff', 0.75);

export const inksFor = (tokens: DrawingTokens, mode: InkMode): Inks => {
  const out = {} as Record<InkLayer, Ink>;
  for (const layer of Object.keys(INK_SPECS) as InkLayer[]) {
    const spec = INK_SPECS[layer];
    const base = spec.token === 'paper75' ? paper75(tokens) : tokens[spec.token];
    out[layer] = { color: mixHex(base, tokens.bg, spec[mode]), width: spec.width, dash: spec.dash };
  }
  return out;
};
