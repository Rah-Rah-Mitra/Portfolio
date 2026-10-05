import rawPalette from './palette.json';

// The Estate window's one palette (plan §7.3, decision C8). Every GLB material
// upstream exports is mapped to a slot (0–31) and a design token; the pack tool
// writes the slot into each vertex (_META.x) and the engine colours a vertex by
// looking its slot up in a 32×1 texture built from the tokens. So the estate
// is drawn in the site's own blueprint ramp, there is one light look, and no hex
// value lives in engine code. Pure: the engine reads the tokens off :root
// (getComputedStyle, resolving color-mix through a canvas probe as
// readBackdropPalette does) and hands the strings in; this module never touches
// the DOM.
//
// `sourceRGBA` is the upstream baseColorFactor, measured 2026-10-05 from every
// GLB in the v1.1 export (29 names, one colour each). It is provenance only and
// nothing here reads it: the runtime colour is the token, always. Drawing the
// source colours would be the second palette PRODUCT.md:34 and DESIGN.md:113
// rule out. It is kept so a reviewer can see what each token stands in for,
// and so the pack tool can notice an upstream material change.
//
// Roles follow the plan's table; four materials it does not name join the
// nearest row: shelter walls with party walls (neutral-200), road markings with
// walls (neutral-100, light on asphalt), the playground surface with roofing
// (neutral-400) and water tanks with the accents (accent-300). Of the paired
// tokens, the lighter source takes the lighter step: core accent 200, block
// accent 300; grass 300, foliage 400.
//
// Three slots are not materials. glass-interior stands in for Glass inside a
// building (accent-300 at 35%; façade glass stays opaque accent-700), edge is
// the façade edge lines, cut fills walls cut by the Plan view.
//
// Slots 0–28 follow upstream's PALETTE order (estate/rules.py; its 'space'
// style never reaches a GLB). Slots are baked into every pack vertex, so moving
// one means rebuilding the pack; parsePack refuses a pack whose slot → material
// map differs. Tokens and roles can change freely, with no re-pack: the table is
// rebuilt from palette.json at every mount, and parsePack does not compare them.

export type PaletteToken = `--color-${string}` | `--paper-${string}`;
/** sRGB components and alpha, each 0–1. */
export type Rgba = [number, number, number, number];
export type Rgb = [number, number, number];

export const MATERIAL_ROLES = [
  'wall', 'panel', 'shelter-wall', 'party-wall', 'wet-area',
  'slab', 'column', 'kerb', 'paving',
  'stair', 'roofing', 'play-surface',
  'door', 'metal', 'bark', 'asphalt',
  'core-accent', 'block-accent', 'tank', 'grass', 'foliage',
  'glass', 'marking',
] as const;
export type MaterialRole = (typeof MATERIAL_ROLES)[number];

export const EXTRA_KEYS = ['glass-interior', 'edge', 'cut'] as const;
export type PaletteExtraKey = (typeof EXTRA_KEYS)[number];

export const SCENE_KEYS = ['background', 'fog', 'skyLight', 'groundLight', 'gridMinor', 'gridMajor'] as const;
export type PaletteSceneKey = (typeof SCENE_KEYS)[number];

export interface PaletteMaterial {
  slot: number;
  material: string;
  role: MaterialRole;
  token: PaletteToken;
  /** Provenance only; never read at runtime (see the header). */
  sourceRGBA: Rgba;
}

export interface PaletteExtra {
  slot: number;
  key: PaletteExtraKey;
  role: string;
  token: PaletteToken;
  /** Multiplies the token's own alpha in the table. */
  alpha: number;
  /** This slot replaces that material's in interior geometry. */
  interiorOf?: string;
}

export interface EstatePalette {
  schema: 'portfolio/estate-palette/1';
  size: 32;
  materials: readonly PaletteMaterial[];
  extras: readonly PaletteExtra[];
  scene: Readonly<Record<PaletteSceneKey, PaletteToken>>;
}

export const PALETTE_SIZE = 32;
const TOKEN = /^--(color|paper)-[a-z0-9-]+$/;

export const isPaletteToken = (value: unknown): value is PaletteToken => typeof value === 'string' && TOKEN.test(value);

// palette.json arrives typed as plain strings and numbers; check it once at
// import so a bad edit fails every test that touches the palette, loudly.
const checkPalette = (raw: typeof rawPalette): EstatePalette => {
  const fail = (problem: string): never => { throw new Error(`lib/estate/palette.json: ${problem}`); };
  if (raw.schema !== 'portfolio/estate-palette/1') fail(`unknown schema ${raw.schema}`);
  if (raw.size !== PALETTE_SIZE) fail(`size must be ${PALETTE_SIZE}`);
  const slots = new Set<number>();
  const names = new Set<string>();
  const slot = (n: number, what: string) => {
    if (!Number.isInteger(n) || n < 0 || n >= PALETTE_SIZE) fail(`${what}: slot ${n} outside 0–${PALETTE_SIZE - 1}`);
    if (slots.has(n)) fail(`${what}: slot ${n} used twice`);
    slots.add(n);
  };
  const token = (t: string, what: string) => { if (!TOKEN.test(t)) fail(`${what}: ${t} is not a --color-*/--paper-* token`); };
  for (const m of raw.materials) {
    slot(m.slot, m.material);
    token(m.token, m.material);
    if (!m.material || names.has(m.material)) fail(`material "${m.material}" empty or listed twice`);
    names.add(m.material);
    if (!(MATERIAL_ROLES as readonly string[]).includes(m.role)) fail(`${m.material}: unknown role ${m.role}`);
    if (m.sourceRGBA.length !== 4 || m.sourceRGBA.some((c) => !(c >= 0 && c <= 1))) fail(`${m.material}: sourceRGBA must be four numbers in 0–1`);
  }
  for (const e of raw.extras) {
    slot(e.slot, e.key);
    token(e.token, e.key);
    if (!(EXTRA_KEYS as readonly string[]).includes(e.key)) fail(`unknown extra ${e.key}`);
    if (!(e.alpha > 0 && e.alpha <= 1)) fail(`${e.key}: alpha must be in (0, 1]`);
    if ('interiorOf' in e && !names.has(e.interiorOf ?? '')) fail(`${e.key}: interiorOf names no material`);
  }
  for (const key of SCENE_KEYS) token(raw.scene[key], `scene.${key}`);
  // Every field the type narrows (role, token, schema, size, tuple lengths) was
  // checked above.
  return raw as unknown as EstatePalette;
};

export const ESTATE_PALETTE: EstatePalette = checkPalette(rawPalette);

const BY_NAME: ReadonlyMap<string, PaletteMaterial> = new Map(ESTATE_PALETTE.materials.map((m) => [m.material, m]));

/** The palette entry for an upstream material name. Throws on a name it does not know. */
export const paletteEntry = (material: string): PaletteMaterial => {
  const entry = BY_NAME.get(material);
  if (!entry) throw new Error(`Unknown estate material "${material}": map it in lib/estate/palette.json`);
  return entry;
};

/**
 * The slot to write for a material. 'interior' picks an extra that stands in
 * for it inside buildings (Glass → glass-interior), else the material's own.
 */
export const paletteSlot = (material: string, context: 'exterior' | 'interior' = 'exterior'): number => {
  const entry = paletteEntry(material);
  if (context === 'interior') {
    const swap = ESTATE_PALETTE.extras.find((e) => e.interiorOf === material);
    if (swap) return swap.slot;
  }
  return entry.slot;
};

export const extraSlot = (key: PaletteExtraKey): number => {
  const extra = ESTATE_PALETTE.extras.find((e) => e.key === key);
  if (!extra) throw new Error(`No palette extra "${key}"`);
  return extra.slot;
};

/** Every token the engine must resolve, each once: slot order, then the scene's. */
export const paletteTokens = (palette: EstatePalette = ESTATE_PALETTE): PaletteToken[] => {
  const ordered = [...palette.materials, ...palette.extras].sort((a, b) => a.slot - b.slot).map((e) => e.token);
  return [...new Set([...ordered, ...SCENE_KEYS.map((key) => palette.scene[key])])];
};

// ---- colour maths ----------------------------------------------------------------

/** IEC 61966-2-1 sRGB transfer, inverted: an sRGB component (0–1) → linear light. */
export const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?(%?)$/;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// One component: `scale` is what 100% means for a bare number (255 for rgb()
// channels, 1 for alpha and color(srgb)). Out-of-range values clamp, as CSS does.
const component = (text: string, scale: number, source: string): number => {
  const match = NUMBER.exec(text);
  if (!match) throw new Error(`Unparseable CSS colour "${source}"`);
  const value = Number(text.slice(0, text.length - match[3].length));
  return clamp01(match[3] ? value / 100 : value / scale);
};

// Splits "r g b / a" or "r, g, b, a" into colour parts and an optional alpha.
const splitArgs = (body: string, source: string): { parts: string[]; alpha?: string } => {
  if (body.includes(',')) {
    const parts = body.split(',').map((p) => p.trim());
    if (parts.length === 4) return { parts: parts.slice(0, 3), alpha: parts[3] };
    return { parts };
  }
  const [main, alpha, extra] = body.split('/').map((p) => p.trim());
  if (extra !== undefined || alpha === '') throw new Error(`Unparseable CSS colour "${source}"`);
  return { parts: main.split(/\s+/), alpha };
};

/**
 * A resolved CSS colour → sRGB components and alpha, 0–1. Takes what
 * getComputedStyle and a canvas fillStyle produce: #rgb, #rgba, #rrggbb,
 * #rrggbbaa, rgb()/rgba() in comma or space syntax, and color(srgb …). Named
 * colours and unresolved color-mix()/var() throw: resolve them first.
 */
export const parseCssColour = (text: string): Rgba => {
  const source = text;
  const s = text.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    const digits = hex[1];
    const short = digits.length <= 4;
    const at = (i: number) => (short ? Number.parseInt(digits[i] + digits[i], 16) : Number.parseInt(digits.slice(2 * i, 2 * i + 2), 16)) / 255;
    const count = short ? digits.length : digits.length / 2;
    return [at(0), at(1), at(2), count === 4 ? at(3) : 1];
  }
  const fn = /^(rgba?|color)\((.*)\)$/.exec(s);
  if (!fn) throw new Error(`Unparseable CSS colour "${source}"`);
  let body = fn[2].trim();
  let scale = 255;
  if (fn[1] === 'color') {
    const space = /^srgb\s+/.exec(body);
    if (!space) throw new Error(`Unparseable CSS colour "${source}": only color(srgb …) is accepted`);
    body = body.slice(space[0].length);
    scale = 1;
  }
  const { parts, alpha } = splitArgs(body, source);
  if (parts.length !== 3) throw new Error(`Unparseable CSS colour "${source}"`);
  return [
    component(parts[0], scale, source),
    component(parts[1], scale, source),
    component(parts[2], scale, source),
    alpha === undefined ? 1 : component(alpha, 1, source),
  ];
};

// ---- the table -------------------------------------------------------------------

/** Resolved CSS colour per token: a record, or a lookup (e.g. over getComputedStyle). */
export type TokenColours = Readonly<Record<string, string>> | ((token: PaletteToken) => string | null | undefined);

const lookup = (colours: TokenColours, token: PaletteToken): Rgba => {
  const text = typeof colours === 'function' ? colours(token) : colours[token];
  if (typeof text !== 'string' || !text.trim()) throw new Error(`No resolved colour for ${token}`);
  return parseCssColour(text);
};

/**
 * The 32×1 RGBA palette texture, linear light, slot i at [4i, 4i + 4). Float
 * rather than bytes: 8-bit linear keeps only 183 of the 256 sRGB steps and
 * folds the darkest 18 into codes 0–1, and the whole table is 512 bytes anyway.
 * Alpha is the token's alpha times the slot's (0.35 for glass-interior), never
 * gamma-encoded. Slots no entry uses stay 0. Throws if a token is unresolved.
 */
export const buildPaletteTable = (
  colours: TokenColours,
  palette: EstatePalette = ESTATE_PALETTE,
  out: Float32Array = new Float32Array(PALETTE_SIZE * 4),
): Float32Array => {
  if (out.length < PALETTE_SIZE * 4) throw new Error(`Palette table needs ${PALETTE_SIZE * 4} floats`);
  out.fill(0);
  const write = (slot: number, token: PaletteToken, alpha: number) => {
    const [r, g, b, a] = lookup(colours, token);
    out[4 * slot] = srgbToLinear(r);
    out[4 * slot + 1] = srgbToLinear(g);
    out[4 * slot + 2] = srgbToLinear(b);
    out[4 * slot + 3] = a * alpha;
  };
  for (const m of palette.materials) write(m.slot, m.token, 1);
  for (const e of palette.extras) write(e.slot, e.token, e.alpha);
  return out;
};

/** Light, fog, background and grid colours in linear light, from the same tokens. */
export const resolveSceneColours = (colours: TokenColours, palette: EstatePalette = ESTATE_PALETTE): Record<PaletteSceneKey, Rgb> => {
  const result = {} as Record<PaletteSceneKey, Rgb>;
  for (const key of SCENE_KEYS) {
    const [r, g, b] = lookup(colours, palette.scene[key]);
    result[key] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  }
  return result;
};
