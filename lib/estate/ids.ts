// Site ids and storey tags for the Estate window (WIN-07): Sample Town N5, the
// generated HDB estate exported by Rahul's Bonsai-Estate pipeline. Pure, imports
// nothing, so the window shell, the lazy engine, the assistant's validators and
// node tests all agree on one list.
//
// Ids are upstream's own folder stems (estate/config.py target_id). SITE, the
// ground and trees, is deliberately not a site id: it has no storeys, no
// entrance and no row in the registry, and it never goes into a focus request.
//
// Storey tags are the canonical, unpadded form the engine JSON uses (L1 … L25,
// RF). Only upstream GLB node names are zero-padded (int_L05), and that never
// reaches the runtime. A storey's index in its site's list is the storey index
// the pack stores per triangle and the shader masks by, so the order is
// bottom-up and load-bearing.

/** The estate's name, as the manifest, the pack and the location chip spell it. */
export const ESTATE_NAME = 'Sample Town N5';

export const ESTATE_SITE_IDS = [
  'BLK_501', 'BLK_502', 'BLK_503', 'BLK_504', 'BLK_505', 'BLK_506',
  'BLK_507', 'BLK_508', 'BLK_509', 'BLK_510', 'BLK_511', 'BLK_512',
  'MSCP_513', 'NC_514',
] as const;

export type EstateSiteId = (typeof ESTATE_SITE_IDS)[number];
export type EstateSiteKind = 'block' | 'mscp' | 'nc';
/** Canonical storey tag: L1 … L99 without zero padding, or RF. */
export type EstateStoreyTag = `L${number}` | 'RF';

const SITE_ID_SET: ReadonlySet<string> = new Set(ESTATE_SITE_IDS);

export const isEstateSiteId = (value: unknown): value is EstateSiteId =>
  typeof value === 'string' && SITE_ID_SET.has(value);

export const siteKindOf = (id: EstateSiteId): EstateSiteKind =>
  id.startsWith('BLK_') ? 'block' : id.startsWith('MSCP_') ? 'mscp' : 'nc';

// L, then at most three digits (so "L05" and "L005" pass but a 40-character
// run of zeros does not), naming storey 1 … 99. Case-insensitive, surrounding
// whitespace ignored: the assistant and the event bus both feed this.
const LEVEL = /^[Ll](\d{1,3})$/;

/**
 * 'L05' | 'l5' | 'L5' → 'L5'; 'rf' | 'RF' → 'RF'. Anything else → null: 'L0',
 * 'L100', 'B1', '5', 'L5a', 'roof', non-strings. Syntax only — whether a site
 * has that storey is ESTATE_SITE_STOREYS' question (storeyIndex below).
 */
export const normaliseStoreyTag = (raw: unknown): EstateStoreyTag | null => {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (/^rf$/i.test(text)) return 'RF';
  const match = LEVEL.exec(text);
  if (!match) return null;
  const level = Number(match[1]);
  return level >= 1 && level <= 99 ? `L${level}` : null;
};

// ---- storeys -----------------------------------------------------------------
//
// Finished floor levels in metres, block-local Z (0 = L1 slab top). Built in
// integer millimetres and divided once, so 9.2 is the double JSON.parse gives
// for "9.2" and the table compares exactly with the engine data.
//
// Checked 2026-10-05 against every model/<ID>/<ID>_engine.json `storeys` in the
// v1.1 export (and pinned literally in tests/estate-ids.test.ts):
//  - blocks: L1 0, L2 3.6 (VOID_DECK_FTF), then +2.8 per storey (FTF), RF one
//    more 2.8 above the top residential storey (estate/rules.py:10-12);
//  - MSCP_513: seven 3.0 m decks, L1 0 … L7 18, RF 21;
//  - NC_514: L1 0, L2 4.2, RF 8.2.
// 245 storeys in all, the figure the catalogue and the window's facts quote.

interface SiteLevels { tags: EstateStoreyTag[]; ffl: number[] }

const fromMm = (pairs: Array<[EstateStoreyTag, number]>): SiteLevels => ({
  tags: pairs.map(([tag]) => tag),
  ffl: pairs.map(([, mm]) => mm / 1000),
});

const block = (top: number): SiteLevels => {
  const pairs: Array<[EstateStoreyTag, number]> = [['L1', 0]];
  for (let n = 2; n <= top; n += 1) pairs.push([`L${n}`, 3600 + 2800 * (n - 2)]);
  pairs.push(['RF', 3600 + 2800 * (top - 1)]);
  return fromMm(pairs);
};

const carPark = (decks: number, pitchMm: number): SiteLevels => {
  const pairs: Array<[EstateStoreyTag, number]> = [];
  for (let n = 1; n <= decks; n += 1) pairs.push([`L${n}`, pitchMm * (n - 1)]);
  pairs.push(['RF', pitchMm * decks]);
  return fromMm(pairs);
};

const LEVELS: Readonly<Record<EstateSiteId, SiteLevels>> = {
  BLK_501: block(20),
  BLK_502: block(20),
  BLK_503: block(22),
  BLK_504: block(22),
  BLK_505: block(25),
  BLK_506: block(25),
  BLK_507: block(14),
  BLK_508: block(14),
  BLK_509: block(16),
  BLK_510: block(16),
  BLK_511: block(16),
  BLK_512: block(12),
  MSCP_513: carPark(7, 3000),
  NC_514: fromMm([['L1', 0], ['L2', 4200], ['RF', 8200]]),
};

const freeze = <T>(pick: (levels: SiteLevels) => T[]) =>
  Object.freeze(Object.fromEntries(ESTATE_SITE_IDS.map((id) => [id, Object.freeze(pick(LEVELS[id]))]))) as
    Readonly<Record<EstateSiteId, readonly T[]>>;

/** Each site's storeys, bottom-up. Index = the storey index the pack and shader use. */
export const ESTATE_SITE_STOREYS = freeze((levels) => levels.tags);

/** FFL (m, block-local Z) per storey, parallel to ESTATE_SITE_STOREYS[site]. */
export const ESTATE_STOREY_FFL = freeze((levels) => levels.ffl);

/** Index of `raw` (any accepted spelling) in that site's storeys, or -1. */
export const storeyIndex = (site: EstateSiteId, raw: unknown): number => {
  const tag = normaliseStoreyTag(raw);
  return tag === null ? -1 : ESTATE_SITE_STOREYS[site].indexOf(tag);
};

/** The canonical tag if `site` has that storey, else null: 'L05' on BLK_509 → 'L5'; 'L17' → null. */
export const siteStoreyTag = (site: EstateSiteId, raw: unknown): EstateStoreyTag | null => {
  const index = storeyIndex(site, raw);
  return index < 0 ? null : ESTATE_SITE_STOREYS[site][index];
};

/** FFL in metres, or null when the site has no such storey. */
export const storeyFfl = (site: EstateSiteId, raw: unknown): number | null => {
  const index = storeyIndex(site, raw);
  return index < 0 ? null : ESTATE_STOREY_FFL[site][index];
};
