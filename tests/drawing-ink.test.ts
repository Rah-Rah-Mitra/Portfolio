import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  contrast, FILL_CEILING, INK_SPECS, inksFor, mixHex, paper75, STROKE_CEILING,
  type DrawingTokens, type InkLayer, type InkMode,
} from '../lib/drawings/ink';

// The desk drawing set's inks (lib/drawings/ink.ts). The drawing sits on the desk
// under the windows and the desk's own text, so its line work is held to contrast
// ceilings against the ground (--color-bg): strokes at most 2.2:1 on an open desk
// and 1.6:1 while a window is open over it, fills at most 1.5:1 (plan "Inks").
// This file is the test ink.ts names as holding every ink to them. The tokens are
// read off index.css :root as written, not restated, so a token edit that pushes
// an ink over its ceiling fails here rather than shipping a drawing that competes
// with the text it sits behind. The colour maths (sRGB mix, WCAG ratio, #rrggbb
// only) is pinned against independent values.

// :root's custom properties, as written in index.css (as tests/estate-palette.test.ts reads them).
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const rootBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
const ROOT: Record<string, string> = Object.fromEntries(
  [...rootBlock.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
);

const TOKEN_NAMES: Readonly<Record<keyof DrawingTokens, string>> = {
  bg: '--color-bg',
  text: '--color-text',
  accent700: '--color-accent-700',
  accent900: '--color-accent-900',
  neutral500: '--color-neutral-500',
  neutral700: '--color-neutral-700',
};

const TOKENS = Object.fromEntries(
  Object.entries(TOKEN_NAMES).map(([key, name]) => [key, ROOT[name]]),
) as unknown as DrawingTokens;

const HEX6 = /^#[0-9a-f]{6}$/;
const MODES: readonly InkMode[] = ['desk', 'reading'];
const LAYERS = Object.keys(INK_SPECS) as InkLayer[];
const isFill = (layer: InkLayer) => INK_SPECS[layer].width === 0;

// An sRGB mix worked out here, independently of ink.ts: `share` of `a`, the rest `b`.
const bytes = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const mixBytes = (a: string, b: string, share: number) => {
  const ca = bytes(a);
  const cb = bytes(b);
  return ca.map((v, i) => v * share + cb[i] * (1 - share));
};

// Relative luminance per WCAG 2.x, restated so contrast() is checked against something.
const relLum = (hex: string) => {
  const [r, g, b] = bytes(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe('drawing inks: the tokens they are read from', () => {
  it('finds all six tokens on index.css :root, each written as #rrggbb', () => {
    for (const [key, name] of Object.entries(TOKEN_NAMES)) {
      expect(ROOT[name], `${name} in index.css :root`).toBeDefined();
      expect(TOKENS[key as keyof DrawingTokens], name).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('names only the six tokens or the paper as an ink’s base', () => {
    const allowed = new Set<string>([...Object.keys(TOKEN_NAMES), 'paper75']);
    for (const layer of LAYERS) expect(allowed.has(INK_SPECS[layer].token), layer).toBe(true);
  });

  it('keeps the ceilings the plan states: strokes 2.2:1 on the desk, 1.6:1 reading, fills 1.5:1', () => {
    expect(STROKE_CEILING.desk).toBe(2.2);
    expect(STROKE_CEILING.reading).toBe(1.6);
    expect(FILL_CEILING).toBe(1.5);
  });
});

describe('drawing inks: the ceilings against the ground', () => {
  for (const mode of MODES) {
    it(`holds every stroke ink (width > 0) to ${mode === 'desk' ? '2.2' : '1.6'}:1 against --color-bg in ${mode} mode`, () => {
      const inks = inksFor(TOKENS, mode);
      const strokes = LAYERS.filter((layer) => !isFill(layer));
      expect(strokes.length).toBeGreaterThan(0);
      for (const layer of strokes) {
        const ratio = contrast(inks[layer].color, TOKENS.bg);
        expect(ratio, `${mode} ${layer} ${inks[layer].color} = ${ratio.toFixed(3)}:1`).toBeLessThanOrEqual(STROKE_CEILING[mode]);
        // And it is still a line: not the ground itself.
        expect(ratio, `${mode} ${layer} is visible at all`).toBeGreaterThan(1);
      }
    });

    it(`holds every fill ink (width 0) but the paper face to 1.5:1 against --color-bg in ${mode} mode`, () => {
      const inks = inksFor(TOKENS, mode);
      const fills = LAYERS.filter((layer) => isFill(layer) && layer !== 'face');
      expect(fills.sort()).toEqual(['lid', 'poche']);
      for (const layer of fills) {
        const ratio = contrast(inks[layer].color, TOKENS.bg);
        expect(ratio, `${mode} ${layer} ${inks[layer].color} = ${ratio.toFixed(3)}:1`).toBeLessThanOrEqual(FILL_CEILING);
        expect(ratio, `${mode} ${layer} is visible at all`).toBeGreaterThan(1);
      }
    });
  }

  it('never draws a reading ink darker than its desk ink (a window open over the drawing only quietens it)', () => {
    const desk = inksFor(TOKENS, 'desk');
    const reading = inksFor(TOKENS, 'reading');
    for (const layer of LAYERS) {
      const dr = contrast(desk[layer].color, TOKENS.bg);
      const rr = contrast(reading[layer].color, TOKENS.bg);
      expect(rr, `${layer}: reading ${rr.toFixed(3)} vs desk ${dr.toFixed(3)}`).toBeLessThanOrEqual(dr);
      // Every base token but the paper is darker than the ground, so "not darker" is
      // also "no lower luminance"; the paper is the same in both modes.
      if (layer === 'face') expect(reading.face.color).toBe(desk.face.color);
      else expect(relLum(reading[layer].color), layer).toBeGreaterThanOrEqual(relLum(desk[layer].color));
      expect(INK_SPECS[layer].reading, layer).toBeLessThanOrEqual(INK_SPECS[layer].desk);
    }
  });
});

describe('drawing inks: the paper face', () => {
  it('reads --paper-75 off index.css as the ground 75 % toward white in sRGB', () => {
    expect(ROOT['--paper-75']).toMatch(/^color-mix\(in srgb,\s*var\(--color-bg\)\s*75%,\s*white\)$/);
  });

  it('draws the massing face and plates in paper-75 (the ground 75 % toward white), opaque, in both modes', () => {
    const want = `#${mixBytes(TOKENS.bg, '#ffffff', 0.75).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    expect(paper75(TOKENS)).toBe(want);
    expect(paper75(TOKENS)).toBe(mixHex(TOKENS.bg, '#ffffff', 0.75));
    for (const mode of MODES) {
      const face = inksFor(TOKENS, mode).face;
      expect(face.color, mode).toBe(want);
      expect(face.width).toBe(0);
      expect(face.dash).toBeNull();
    }
    // The paper is lighter than the ground, never a dark fill.
    expect(relLum(want)).toBeGreaterThan(relLum(TOKENS.bg));
  });
});

describe('drawing inks: what inksFor returns', () => {
  for (const mode of MODES) {
    it(`returns an opaque lowercase #rrggbb ink for every layer in ${mode} mode, with the spec’s width and dash`, () => {
      const inks = inksFor(TOKENS, mode);
      expect(Object.keys(inks).sort()).toEqual([...LAYERS].sort());
      expect(LAYERS).toHaveLength(21);
      for (const layer of LAYERS) {
        const ink = inks[layer];
        expect(ink.color, `${mode} ${layer}`).toMatch(HEX6);
        expect(ink.width, layer).toBe(INK_SPECS[layer].width);
        expect(ink.dash, layer).toEqual(INK_SPECS[layer].dash);
      }
    });
  }

  it('mixes each ink as its token taken α of the way from the ground, in sRGB (each channel within a rounding step)', () => {
    for (const mode of MODES) {
      const inks = inksFor(TOKENS, mode);
      for (const layer of LAYERS) {
        const spec = INK_SPECS[layer];
        const base = spec.token === 'paper75' ? paper75(TOKENS) : TOKENS[spec.token];
        const want = mixBytes(base, TOKENS.bg, spec[mode]);
        const got = bytes(inks[layer].color);
        for (let i = 0; i < 3; i++) expect(Math.abs(got[i] - want[i]), `${mode} ${layer} channel ${i}`).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('keeps the plan’s token, dash and α for each layer (the values the ceilings were set against)', () => {
    const PLAN: Partial<Record<InkLayer, [InkSpecToken, readonly number[] | null, number, number]>> = {
      extent: ['neutral700', null, 0.45, 0.3],
      kerb: ['neutral500', null, 0.55, 0.36],
      slab: ['neutral500', null, 0.55, 0.36],
      context: ['accent700', null, 0.3, 0.2],
      face: ['paper75', null, 1, 1],
      hero: ['accent700', null, 0.5, 0.32],
      jamb: ['accent700', null, 0.5, 0.32],
      dim: ['neutral700', null, 0.5, 0.32],
      plate: ['accent700', null, 0.5, 0.32],
      crop: ['neutral700', null, 0.5, 0.32],
      lid: ['accent700', null, 0.22, 0.14],
      room: ['accent700', null, 0.42, 0.27],
      tread: ['accent700', null, 0.42, 0.27],
      shared: ['accent700', [2, 3], 0.3, 0.2],
      poche: ['accent900', null, 0.2, 0.12],
      hidden: ['neutral500', [3, 3], 0.55, 0.36],
      stairLink: ['accent700', [4, 3], 0.45, 0.3],
      liftLink: ['accent700', [10, 3, 2, 3], 0.45, 0.3],
      massing: ['text', null, 0.35, 0.22],
    };
    for (const [layer, [token, dash, desk, reading]] of Object.entries(PLAN) as [InkLayer, [InkSpecToken, readonly number[] | null, number, number]][]) {
      const spec = INK_SPECS[layer];
      expect({ token: spec.token, dash: spec.dash, desk: spec.desk, reading: spec.reading }, layer).toEqual({ token, dash, desk, reading });
    }
  });

  it('throws on a token that is not #rrggbb rather than drawing in a wrong colour', () => {
    expect(() => inksFor({ ...TOKENS, bg: 'rgb(242, 242, 243)' }, 'desk')).toThrow(/#rrggbb/);
    expect(() => inksFor({ ...TOKENS, accent700: '#416' }, 'reading')).toThrow(/#rrggbb/);
    expect(() => inksFor({ ...TOKENS, text: '' }, 'desk')).toThrow(/#rrggbb/);
  });
});

type InkSpecToken = (typeof INK_SPECS)[InkLayer]['token'];

describe('drawing inks: mixHex', () => {
  it('returns `a` at t = 1 and `b` at t = 0', () => {
    expect(mixHex('#416180', '#f2f2f3', 1)).toBe('#416180');
    expect(mixHex('#416180', '#f2f2f3', 0)).toBe('#f2f2f3');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#ffffff');
  });

  it('puts the midpoint of black and white at #808080 (127.5 rounds up) and is symmetric there', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#ffffff', '#000000', 0.5)).toBe('#808080');
    // Per channel, in sRGB: #ff0000 and #0000ff meet at #800080, not a darker linear-light mix.
    expect(mixHex('#ff0000', '#0000ff', 0.5)).toBe('#800080');
  });

  it('weights `a` by t, as CSS color-mix(in srgb, a t, b) does', () => {
    expect(mixHex('#000000', '#ffffff', 0.25)).toBe('#bfbfbf'); // 255 × 0.75 = 191.25
    expect(mixHex('#f2f2f3', '#ffffff', 0.75)).toBe('#f5f5f6'); // 242·.75 + 255·.25 = 245.25; 243·.75 + 63.75 = 246
  });

  it('reads uppercase hex and writes lowercase', () => {
    expect(mixHex('#F2F2F3', '#FFFFFF', 0.75)).toBe('#f5f5f6');
    expect(mixHex('#ABCDEF', '#ABCDEF', 0.3)).toBe('#abcdef');
  });

  it('throws on anything but #rrggbb', () => {
    for (const bad of ['#fff', 'f2f2f3', '#f2f2f3ff', '#gggggg', 'white', 'rgb(0, 0, 0)', '']) {
      expect(() => mixHex(bad, '#ffffff', 0.5), bad).toThrow(/not a #rrggbb colour/);
      expect(() => mixHex('#ffffff', bad, 0.5), bad).toThrow(/not a #rrggbb colour/);
    }
  });
});

describe('drawing inks: contrast', () => {
  it('gives 21:1 for black on white, either way round', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 10);
  });

  it('gives 1:1 for a colour against itself', () => {
    for (const c of ['#000000', '#ffffff', '#808080', TOKENS.bg, TOKENS.accent700]) expect(contrast(c, c), c).toBe(1);
  });

  it('matches the WCAG ratio for known pairs (#767676 on white is 4.54:1) and the restated formula on the tokens', () => {
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    for (const [key, value] of Object.entries(TOKENS)) {
      const la = relLum(value);
      const lb = relLum(TOKENS.bg);
      const want = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
      expect(contrast(value, TOKENS.bg), key).toBeCloseTo(want, 4);
    }
  });

  it('throws on anything but #rrggbb', () => {
    expect(() => contrast('#000', '#ffffff')).toThrow(/not a #rrggbb colour/);
    expect(() => contrast('#000000', 'transparent')).toThrow(/not a #rrggbb colour/);
    expect(() => paper75({ bg: 'f2f2f3' })).toThrow(/not a #rrggbb colour/);
  });
});
