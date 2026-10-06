import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ESTATE_PALETTE, MATERIAL_ROLES, PALETTE_SIZE, buildPaletteTable, extraSlot, paletteEntry, paletteSlot,
  paletteTokens, parseCssColour, resolveSceneColours, srgbToLinear, type EstatePalette, type MaterialRole,
} from '../lib/estate/palette';

// The palette is the estate's only source of colour (plan §7.3, C8). These
// tests hold it to three things: it covers exactly what upstream exports, it
// names only tokens index.css defines, and the table it builds is the tokens
// in linear light, whatever the source colours say.

// Every material name and baseColorFactor in the 289 GLBs of the Bonsai-Estate
// v1.1 export (model/**/*.glb, read 2026-10-05; each name has one colour).
const UPSTREAM: Record<string, [number, number, number, number]> = {
  'Aluminium frame': [0.8, 0.81, 0.82, 1],
  'Aluminium railing': [0.74, 0.76, 0.78, 1],
  Asphalt: [0.22, 0.22, 0.24, 1],
  Bark: [0.4, 0.28, 0.18, 1],
  'Concrete paving': [0.74, 0.72, 0.68, 1],
  'EPDM playground surface': [0.8, 0.36, 0.28, 1],
  Foliage: [0.24, 0.48, 0.22, 1],
  Glass: [0.55, 0.74, 0.85, 0.4],
  Grass: [0.42, 0.6, 0.33, 1],
  'Homogeneous tile - wet area': [0.86, 0.87, 0.88, 1],
  'Lightweight panel - white': [0.96, 0.95, 0.92, 1],
  'Metal deck roof - linkway': [0.56, 0.6, 0.64, 1],
  'Mild steel - painted': [0.25, 0.27, 0.3, 1],
  'Painted RC - HDB off-white': [0.93, 0.91, 0.86, 1],
  'Painted RC - block accent': [0.8, 0.55, 0.42, 1],
  'Painted RC - core accent': [0.62, 0.7, 0.62, 1],
  'Painted RC - party wall': [0.9, 0.88, 0.84, 1],
  'Precast concrete kerb': [0.66, 0.65, 0.62, 1],
  'RC - household shelter': [0.8, 0.79, 0.76, 1],
  'RC column': [0.85, 0.83, 0.78, 1],
  'RC slab': [0.7, 0.7, 0.68, 1],
  'RC stair - granolithic': [0.78, 0.76, 0.72, 1],
  'Road marking - white': [0.95, 0.95, 0.93, 1],
  'Roller shutter - galvanised': [0.62, 0.64, 0.66, 1],
  'Roof waterproofing': [0.42, 0.43, 0.45, 1],
  'Stainless steel': [0.78, 0.8, 0.82, 1],
  'Steel blast door': [0.55, 0.57, 0.58, 1],
  'Timber door': [0.58, 0.4, 0.25, 1],
  'Water tank - GRP': [0.45, 0.62, 0.78, 1],
};

// Plan §7.3's role → token table, plus the four roles it does not name
// (palette.ts says where each joins and why).
const ROLE_TOKENS: Record<MaterialRole, string> = {
  wall: '--color-neutral-100',
  'party-wall': '--color-neutral-200',
  'wet-area': '--color-neutral-200',
  panel: '--color-neutral-200',
  slab: '--color-neutral-300',
  column: '--color-neutral-300',
  kerb: '--color-neutral-300',
  paving: '--color-neutral-300',
  stair: '--color-neutral-400',
  roofing: '--color-neutral-400',
  door: '--color-neutral-500',
  metal: '--color-neutral-600',
  bark: '--color-neutral-600',
  asphalt: '--color-neutral-700',
  'core-accent': '--color-accent-200',
  'block-accent': '--color-accent-300',
  grass: '--color-accent-300',
  foliage: '--color-accent-400',
  glass: '--color-accent-700',
  // not in the plan's table
  'shelter-wall': '--color-neutral-200',
  marking: '--color-neutral-100',
  'play-surface': '--color-neutral-400',
  tank: '--color-accent-300',
};

// :root's custom properties, as written in index.css.
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const rootBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
const ROOT: Record<string, string> = Object.fromEntries(
  [...rootBlock.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
);

// What a browser resolves the tokens to: hex as written; the one color-mix the
// palette uses (--paper-75 = 75% --color-bg + 25% white, in sRGB) worked out here.
const hexToRgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const mixWithWhite = (hex: string, share: number) => `rgb(${hexToRgb(hex).map((c) => c * share + 255 * (1 - share)).join(', ')})`;
const RESOLVED: Record<string, string> = Object.fromEntries(
  Object.entries(ROOT).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v)),
);
RESOLVED['--paper-75'] = mixWithWhite(ROOT['--color-bg'], 0.75);

const lin = (byte: number) => srgbToLinear(byte / 255);

describe('estate palette coverage', () => {
  it('maps exactly the 29 materials upstream exports, once each, keeping their source colour as provenance', () => {
    const names = ESTATE_PALETTE.materials.map((m) => m.material);
    expect(names).toHaveLength(29);
    expect(new Set(names)).toEqual(new Set(Object.keys(UPSTREAM)));
    for (const m of ESTATE_PALETTE.materials) expect(m.sourceRGBA, m.material).toEqual(UPSTREAM[m.material]);
  });

  it('gives every slot 0–31 to exactly one entry', () => {
    const slots = [...ESTATE_PALETTE.materials, ...ESTATE_PALETTE.extras].map((e) => e.slot).sort((a, b) => a - b);
    expect(slots).toEqual(Array.from({ length: PALETTE_SIZE }, (_, i) => i));
  });

  it('tokens each material by its role, per the plan\'s table', () => {
    for (const m of ESTATE_PALETTE.materials) expect(m.token, `${m.material} (${m.role})`).toBe(ROLE_TOKENS[m.role]);
    expect([...MATERIAL_ROLES].sort()).toEqual(Object.keys(ROLE_TOKENS).sort());
    expect(ESTATE_PALETTE.extras.find((e) => e.key === 'glass-interior')).toMatchObject({ token: '--color-accent-300', alpha: 0.35 });
    expect(ESTATE_PALETTE.extras.find((e) => e.key === 'edge')?.token).toBe('--color-accent-700');
    expect(ESTATE_PALETTE.scene).toMatchObject({ background: '--color-bg', fog: '--color-bg', skyLight: '--paper-75', groundLight: '--color-neutral-300' });
  });

  it('names only tokens index.css defines on :root', () => {
    const tokens = paletteTokens();
    expect(tokens.length).toBeGreaterThan(10);
    for (const token of tokens) expect(ROOT[token], `${token} in index.css :root`).toBeDefined();
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});

describe('estate palette lookup', () => {
  it('finds a material by its upstream name', () => {
    expect(paletteEntry('RC slab')).toMatchObject({ slot: 4, role: 'slab', token: '--color-neutral-300' });
    expect(paletteSlot('Painted RC - HDB off-white')).toBe(0);
  });

  it('throws on a material it does not know, so the pack tool fails instead of guessing', () => {
    expect(() => paletteEntry('Space')).toThrow(/Unknown estate material "Space"/);
    expect(() => paletteEntry('rc slab')).toThrow(/palette\.json/);
    expect(() => paletteSlot('Unobtainium', 'interior')).toThrow(/Unknown estate material/);
  });

  it('swaps Glass for glass-interior inside buildings and leaves everything else alone', () => {
    expect(paletteSlot('Glass')).toBe(11);
    expect(paletteSlot('Glass', 'interior')).toBe(extraSlot('glass-interior'));
    expect(extraSlot('glass-interior')).toBe(29);
    for (const m of ESTATE_PALETTE.materials) {
      if (m.material !== 'Glass') expect(paletteSlot(m.material, 'interior')).toBe(m.slot);
    }
    expect(extraSlot('edge')).toBe(30);
    expect(extraSlot('cut')).toBe(31);
  });
});

describe('sRGB → linear', () => {
  it('matches the IEC 61966-2-1 curve at known points', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 15);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214041140482232, 12);
    expect(srgbToLinear(0.04045)).toBeCloseTo(0.0031308049535603713, 15);
    expect(lin(128)).toBeCloseTo(0.2158605001138992, 12);
    expect(lin(10)).toBeCloseTo(10 / 255 / 12.92, 15);
  });

  it('joins its two pieces without a visible step and rises monotonically', () => {
    // The standard's rounded constants leave a seam of about 2e-9 at the knee,
    // six orders below one 8-bit step; anything larger is a wrong constant.
    const below = srgbToLinear(0.04045 - 1e-9);
    const above = srgbToLinear(0.04045 + 1e-9);
    expect(Math.abs(above - below)).toBeLessThan(1e-8);
    for (let i = 1; i < 256; i += 1) expect(lin(i)).toBeGreaterThan(lin(i - 1));
  });
});

describe('parseCssColour', () => {
  it.each([
    ['#5980a6', [0x59 / 255, 0x80 / 255, 0xa6 / 255, 1]],
    ['#5980A6', [0x59 / 255, 0x80 / 255, 0xa6 / 255, 1]],
    ['#fff', [1, 1, 1, 1]],
    ['#0f08', [0, 1, 0, 0x88 / 255]],
    ['#41618080', [0x41 / 255, 0x61 / 255, 0x80 / 255, 0x80 / 255]],
    ['rgb(89, 128, 166)', [89 / 255, 128 / 255, 166 / 255, 1]],
    ['rgba(89, 128, 166, 0.5)', [89 / 255, 128 / 255, 166 / 255, 0.5]],
    ['rgb(89 128 166 / 50%)', [89 / 255, 128 / 255, 166 / 255, 0.5]],
    ['rgb(100% 0% 50%)', [1, 0, 0.5, 1]],
    ['  RGB(  0 ,0,  255 )  ', [0, 0, 1, 1]],
    ['color(srgb 0.25 0.5 1)', [0.25, 0.5, 1, 1]],
    ['color(srgb 0.25 0.5 1 / 0.35)', [0.25, 0.5, 1, 0.35]],
    ['rgb(300, -5, 128)', [1, 0, 128 / 255, 1]],
  ] as const)('%j', (text, rgba) => {
    const got = parseCssColour(text);
    rgba.forEach((c, i) => expect(got[i]).toBeCloseTo(c, 12));
  });

  it.each([
    'steelblue', 'transparent', '', '#12345', '#ggg', 'rgb(1, 2)', 'rgb(1 2 3 4)', 'rgb(1, 2, 3, 4, 5)',
    'rgb(1 2 3 / 0.5 / 1)', 'rgb(a, b, c)', 'hsl(210 30% 50%)', 'color(display-p3 1 0 0)',
    'color-mix(in srgb, #f2f2f3 75%, white)', 'var(--color-bg)',
  ])('rejects %j', (text) => {
    expect(() => parseCssColour(text)).toThrow(/Unparseable CSS colour/);
  });
});

describe('palette table', () => {
  const table = buildPaletteTable(RESOLVED);

  it('is 32 RGBA texels of floats', () => {
    expect(table).toBeInstanceOf(Float32Array);
    expect(table.length).toBe(PALETTE_SIZE * 4);
  });

  it('holds each slot\'s token in linear light, opaque', () => {
    for (const m of ESTATE_PALETTE.materials) {
      const [r, g, b] = hexToRgb(ROOT[m.token]);
      const texel = Array.from(table.slice(4 * m.slot, 4 * m.slot + 4));
      [lin(r), lin(g), lin(b), 1].forEach((c, i) => expect(texel[i], `${m.material}[${i}]`).toBeCloseTo(c, 6));
    }
    // Spot check by hand: walls are --color-neutral-100 #f5f5f8.
    expect(table[0]).toBeCloseTo(srgbToLinear(0xf5 / 255), 6);
    expect(table[2]).toBeCloseTo(srgbToLinear(0xf8 / 255), 6);
  });

  it('carries the extras, interior glass at 35%', () => {
    const [r, g, b] = hexToRgb(ROOT['--color-accent-300']);
    expect(Array.from(table.slice(4 * 29, 4 * 30))).toEqual(Array.from(new Float32Array([lin(r), lin(g), lin(b), 0.35])));
    expect(table[4 * 30 + 3]).toBe(1);
    expect(table[4 * 31 + 3]).toBe(1);
  });

  it('reads the same from hex, rgb() or a lookup function', () => {
    const asRgb = Object.fromEntries(Object.entries(RESOLVED).map(([k, v]) => [k, v.startsWith('#') ? `rgb(${hexToRgb(v).join(' ')})` : v]));
    expect(buildPaletteTable(asRgb)).toEqual(table);
    expect(buildPaletteTable((token) => RESOLVED[token])).toEqual(table);
  });

  it('never reads sourceRGBA: changing every source colour changes nothing', () => {
    const scrambled: EstatePalette = {
      ...ESTATE_PALETTE,
      materials: ESTATE_PALETTE.materials.map((m) => ({ ...m, sourceRGBA: [1, 0, 1, 1] as [number, number, number, number] })),
    };
    expect(buildPaletteTable(RESOLVED, scrambled)).toEqual(table);
  });

  it('fails on a token the caller could not resolve', () => {
    const missing = { ...RESOLVED };
    delete missing['--color-neutral-300'];
    expect(() => buildPaletteTable(missing)).toThrow(/No resolved colour for --color-neutral-300/);
    expect(() => buildPaletteTable({ ...RESOLVED, '--color-neutral-300': 'color-mix(in srgb, red, blue)' })).toThrow(/Unparseable/);
  });

  it('fills a caller\'s buffer and zeroes slots no entry uses', () => {
    const out = new Float32Array(PALETTE_SIZE * 4).fill(9);
    const sparse: EstatePalette = { ...ESTATE_PALETTE, materials: ESTATE_PALETTE.materials.slice(0, 2), extras: [] };
    expect(buildPaletteTable(RESOLVED, sparse, out)).toBe(out);
    expect(out[3]).toBe(1);
    expect(Array.from(out.slice(8))).toEqual(new Array(PALETTE_SIZE * 4 - 8).fill(0));
    expect(() => buildPaletteTable(RESOLVED, ESTATE_PALETTE, new Float32Array(8))).toThrow(/128 floats/);
  });

  it('resolves the scene colours from the same tokens, linear', () => {
    const scene = resolveSceneColours(RESOLVED);
    const [r, g, b] = hexToRgb(ROOT['--color-bg']);
    expect(scene.background).toEqual([lin(r), lin(g), lin(b)]);
    expect(scene.fog).toEqual(scene.background);
    // --paper-75 sits between --color-bg and white.
    expect(scene.skyLight[0]).toBeGreaterThan(scene.background[0]);
    expect(scene.skyLight[0]).toBeLessThan(1);
    expect(() => resolveSceneColours({})).toThrow(/No resolved colour/);
  });
});
