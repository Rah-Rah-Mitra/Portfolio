import {
  ESTATE_SITE_STOREYS, ESTATE_STOREY_FFL, siteKindOf, type EstateSiteId, type EstateStoreyTag,
} from './ids';
import { ESTATE_TIERS, ESTATE_TIER_TABLE, type EstateTier } from './tiers';

// Interiors (plan §7.5): which storey the camera is on, which storeys around it
// the interior draws, and what that hides of the façade. Pure, so the engine's
// interior.ts and node tests run the very same rules.
//
// Heights are metres in block-local Z, which is also three world Y (a building
// root sits at y = 0 and adds no vertical offset), so the camera's Y goes in as
// is. Plan positions are block-local X/Y, the frame of the pack's `footprint`
// (upstream engine.json massing.footprint). A storey index is the index into
// ESTATE_SITE_STOREYS[site], bottom-up: the index the pack stores per F
// triangle and per D instance, and the one `uStoreyMask` compares.
//
// The band is the point of the module. Inside a building the interior draws
// storeys S − k … S + k and the façade hides exactly those, so nothing is drawn
// twice and nothing seams. k ≥ 1 on every tier because at k = 0 the storey above
// is not drawn: no ceiling, and on a stair the flight overhead vanishes
// (tests/estate-storeys.test.ts walks every stair to hold this). Changing band
// moves only an instance count, ≤ 2k + 1 translations, the mask and which
// special storeys draw: no download and no new geometry.

/** Eye above the feet, m: the Walk camera and upstream's BS1 street render. */
export const EYE_HEIGHT = 1.6;
/** Storey s owns feet heights from FFL_s − 0.5 up to FFL_{s+1} − 0.5, m. */
export const BAND_DROP = 0.5;
// The feet must pass a band edge by this much before S changes, m. Going up, S
// changes at FFL − 0.25, where the walk grid hands the floor to the next storey
// (plan §5.2: storey s owns floors from FFL_s − 0.25); going down, at FFL − 0.75.
// Less than half a storey's 0.5 m drop, so S is only ever the storey under the
// feet or the one above it.
export const STOREY_HYSTERESIS = 0.25;
// The hold band [FFL_s − 0.75, FFL_{s+1} − 0.25) may never reach a second storey
// up, so storeyTable refuses FFLs closer than this (the estate's least is 2.8).
const MIN_STOREY_GAP = BAND_DROP + STOREY_HYSTERESIS;

/** Inside = within the footprint + 0.5 m, from 1 m below ground to 2 m above the roof. */
export const INSIDE_MARGIN = 0.5;
export const INSIDE_BELOW_GROUND = 1;
export const INSIDE_ABOVE_ROOF = 2;
/** Peeking = within 6 m of the footprint, between ground and roof height. */
export const PEEK_DISTANCE = 6;
/** Peeking always draws one storey either side, whatever the tier. */
export const PEEK_K = 1;

// ---- tiers -------------------------------------------------------------------

// tiers.ts checks every bandK is an integer ≥ 1 when it loads: a k of 0 would
// bring back the ceilingless band the stair test exists to stop.
/** Band half-width k per tier (plan §7.4: high 2, else 1). */
export const TIER_BAND_K: Readonly<Record<EstateTier, number>> = Object.freeze(
  Object.fromEntries(ESTATE_TIERS.map((id) => [id, ESTATE_TIER_TABLE[id].bandK])) as Record<EstateTier, number>,
);
export const MAX_BAND_K = Math.max(PEEK_K, ...ESTATE_TIERS.map((id) => TIER_BAND_K[id]));
/** Most storeys a band can hold, 2k + 1: the typical InstancedMesh's capacity (5). */
export const BAND_CAPACITY = 2 * MAX_BAND_K + 1;

// ---- storey tables -------------------------------------------------------------

/** One building's storeys, bottom-up and frozen. Index = storey index. */
export interface StoreyTable {
  readonly tags: readonly EstateStoreyTag[];
  /** FFL, m, block-local Z; strictly ascending, ≥ 0.75 m apart. */
  readonly ffl: readonly number[];
  /** true where the typical InstancedMesh draws the storey (pack geom 'typical'). */
  readonly typical: readonly boolean[];
}

/** The fields storeyTable reads. A pack site's `storeys` (PackStorey[]) fits as is. */
export interface StoreyRow { tag: EstateStoreyTag; ffl: number; geom: 'typical' | 'special' }

/** Build and check a table from pack rows. Throws RangeError on an empty list or FFLs that are not ascending by ≥ 0.75 m. */
export const storeyTable = (rows: ReadonlyArray<StoreyRow>): StoreyTable => {
  if (rows.length === 0) throw new RangeError('storeyTable: a building has at least one storey');
  rows.forEach((row, i) => {
    if (!Number.isFinite(row.ffl)) throw new RangeError(`storeyTable: ${row.tag} FFL ${row.ffl} is not finite`);
    if (i > 0 && !(row.ffl - rows[i - 1].ffl >= MIN_STOREY_GAP)) {
      throw new RangeError(`storeyTable: ${row.tag} at ${row.ffl} m must sit ≥ ${MIN_STOREY_GAP} m above ${rows[i - 1].tag} at ${rows[i - 1].ffl} m`);
    }
  });
  return Object.freeze({
    tags: Object.freeze(rows.map((row) => row.tag)),
    ffl: Object.freeze(rows.map((row) => row.ffl)),
    typical: Object.freeze(rows.map((row) => row.geom === 'typical')),
  });
};

// Which storeys are typical before a pack says so: measured on v1.1 (plan §0.1
// M1), L1 and RF are special everywhere, every NC_514 storey is special, and the
// rest (L2 … top residential; MSCP L2 … L7) repeat. The pack's `geom` is the
// authority at runtime: a storey that stops repeating (share < 0.93) becomes
// special there (risk R1), so the engine builds its table from the pack.
const defaultGeom = (site: EstateSiteId, tag: EstateStoreyTag): StoreyRow['geom'] =>
  siteKindOf(site) === 'nc' || tag === 'L1' || tag === 'RF' ? 'special' : 'typical';

const SITE_TABLES = new Map<EstateSiteId, StoreyTable>();

/** A site's table from lib/estate/ids.ts with the measured typical/special split. Cached. */
export const siteStoreyTable = (site: EstateSiteId): StoreyTable => {
  let table = SITE_TABLES.get(site);
  if (!table) {
    const ffl = ESTATE_STOREY_FFL[site];
    table = storeyTable(ESTATE_SITE_STOREYS[site].map((tag, i) => ({ tag, ffl: ffl[i], geom: defaultGeom(site, tag) })));
    SITE_TABLES.set(site, table);
  }
  return table;
};

// ---- current storey --------------------------------------------------------------

/**
 * The storey S the feet are on. From scratch (prev −1, or an index the table
 * does not have) it is the band holding `feetZ`: below L1's band reads L1,
 * above RF's lower edge reads RF. With a valid `prev`, S stays put until the
 * feet leave prev's band widened by STOREY_HYSTERESIS on both sides, so a walker
 * on a stair or a camera bobbing at an edge never flickers. NaN keeps prev
 * (or L1): it carries no height. Allocation-free.
 */
export const storeyAt = (table: StoreyTable, feetZ: number, prev = -1): number => {
  const ffl = table.ffl;
  const n = ffl.length;
  const held = prev >= 0 && prev < n && (prev | 0) === prev;
  if (feetZ !== feetZ) return held ? prev : 0;
  if (held) {
    // 0.75 and 0.25 are exact in binary, so each edge is one rounding off FFL.
    const lo = prev === 0 ? -Infinity : ffl[prev] - MIN_STOREY_GAP;
    const hi = prev === n - 1 ? Infinity : ffl[prev + 1] - (BAND_DROP - STOREY_HYSTERESIS);
    if (feetZ >= lo && feetZ < hi) return prev;
  }
  let s = n - 1;
  while (s > 0 && feetZ < ffl[s] - BAND_DROP) s -= 1;
  return s;
};

/** storeyAt from the camera: feet = eye − EYE_HEIGHT. */
export const storeyFromEye = (table: StoreyTable, eyeZ: number, prev = -1): number =>
  storeyAt(table, eyeZ - EYE_HEIGHT, prev);

// ---- band ------------------------------------------------------------------------

/** Inclusive storey-index range. Empty when lo > hi; (0, −1) is the canonical empty. */
export interface StoreyRange { lo: number; hi: number }

/** `uStoreyMask` while no interior is active: hides nothing, so F and D stay whole. */
export const MASK_OFF: Readonly<StoreyRange> = Object.freeze({ lo: 0, hi: -1 });

export type InteriorAccess = 'inside' | 'peeking' | 'outside';

/** k for a tier: the tier's own (≥ 1), except peeking, which is always 1. */
export const bandHalfWidth = (tier: EstateTier, access: InteriorAccess): number =>
  access === 'peeking' ? PEEK_K : TIER_BAND_K[tier];

// k below 1 (or NaN) reads as 1 and a fraction rounds down: k ≥ 1 is the rule,
// not a default, so no caller can ask for the ceilingless band.
const halfWidth = (k: number): number => (k >= 1 ? Math.floor(k) : 1);

/**
 * The band [S − k, S + k], cut at the bottom and top storeys (not shifted: the
 * band never draws more than it needs). Also the façade mask's range. An S the
 * table lacks gives the empty range.
 */
export const storeyBand = (table: StoreyTable, storey: number, k: number, out: StoreyRange = { lo: 0, hi: -1 }): StoreyRange => {
  const n = table.ffl.length;
  if (!(storey >= 0 && storey < n) || (storey | 0) !== storey) {
    out.lo = 0; out.hi = -1;
    return out;
  }
  const h = halfWidth(k);
  out.lo = Math.max(0, storey - h);
  out.hi = Math.min(n - 1, storey + h);
  return out;
};

export const inRange = (range: Readonly<StoreyRange>, storey: number): boolean =>
  storey >= range.lo && storey <= range.hi;

/**
 * The storey whose F slab stays as the ceiling of the band's top storey: hi + 1
 * (= S + k + 1 unless cut at the top). It is outside the mask by construction,
 * which is all keeping it takes. −1 when the band reaches the roof, or is empty.
 */
export const ceilingStorey = (table: StoreyTable, band: Readonly<StoreyRange>): number =>
  band.lo <= band.hi && band.hi + 1 < table.ffl.length ? band.hi + 1 : -1;

/** Special storeys in the band, bottom-up, into `out`; returns the count. Each draws its own mesh. */
export const specialsInBand = (table: StoreyTable, band: Readonly<StoreyRange>, out: Int32Array): number => {
  let count = 0;
  for (let s = Math.max(0, band.lo); s <= band.hi && s < table.typical.length; s += 1) {
    if (table.typical[s]) continue;
    if (count >= out.length) throw new RangeError(`specialsInBand: ${out.length} slots cannot hold the band's specials`);
    out[count++] = s;
  }
  return count;
};

/**
 * The typical InstancedMesh's instances for a band, bottom-up: each instance's
 * storey index into `storeyOut` and its FFL into `fflOut`, the T(0, FFL, 0)
 * translation under the building root (glTF Y-up, so Y = block-local Z).
 * Returns the count, ≤ 2k + 1. Throws RangeError if the arrays are too short.
 */
export const typicalInstances = (
  table: StoreyTable, band: Readonly<StoreyRange>, storeyOut: Int32Array, fflOut: Float64Array,
): number => {
  const cap = Math.min(storeyOut.length, fflOut.length);
  let count = 0;
  for (let s = Math.max(0, band.lo); s <= band.hi && s < table.typical.length; s += 1) {
    if (!table.typical[s]) continue;
    if (count >= cap) throw new RangeError(`typicalInstances: ${cap} slots cannot hold the band's typical storeys`);
    storeyOut[count] = s;
    fflOut[count] = table.ffl[s];
    count += 1;
  }
  return count;
};

/** "L3–L7", "RF", or '' for an empty band: data-estate-band and the HUD. */
export const bandLabel = (table: StoreyTable, band: Readonly<StoreyRange>): string => {
  if (band.lo > band.hi || band.lo < 0 || band.hi >= table.tags.length) return '';
  return band.lo === band.hi ? table.tags[band.lo] : `${table.tags[band.lo]}–${table.tags[band.hi]}`;
};

// ---- band state: one object the engine keeps per active building -----------------

/**
 * Everything a band decides, kept in place so a frame allocates nothing:
 * `lo`/`hi` are uStoreyMask (MASK_OFF when cleared), and the arrays are sized
 * once for the largest band.
 */
export interface BandState {
  table: StoreyTable | null;
  /** S, or −1 while cleared. */
  storey: number;
  /** k as applied (≥ 1), 0 while cleared. */
  k: number;
  lo: number;
  hi: number;
  ceiling: number;
  typicalCount: number;
  readonly typicalStorey: Int32Array;
  readonly typicalFfl: Float64Array;
  specialCount: number;
  readonly specialStorey: Int32Array;
}

export const createBandState = (maxK: number = MAX_BAND_K): BandState => {
  const size = 2 * halfWidth(maxK) + 1;
  return {
    table: null, storey: -1, k: 0, lo: MASK_OFF.lo, hi: MASK_OFF.hi, ceiling: -1,
    typicalCount: 0, typicalStorey: new Int32Array(size), typicalFfl: new Float64Array(size),
    specialCount: 0, specialStorey: new Int32Array(size),
  };
};

const SCRATCH: StoreyRange = { lo: 0, hi: -1 };

/** Back to no band: no mask, no instances. True if that changed what draws. */
export const clearBand = (state: BandState): boolean => {
  const changed = state.lo <= state.hi;
  state.table = null; state.storey = -1; state.k = 0;
  state.lo = MASK_OFF.lo; state.hi = MASK_OFF.hi; state.ceiling = -1;
  state.typicalCount = 0; state.specialCount = 0;
  return changed;
};

/**
 * Apply S and k on a building. Returns true when what draws changed (the mask,
 * the instances or the specials, which all follow from the range and the
 * table): the frame loop's "band change". S alone can move without that, e.g.
 * on NC_514's three storeys at k = 2. An S the table lacks clears the band.
 * Throws RangeError when k exceeds the state's capacity.
 */
export const applyBand = (state: BandState, table: StoreyTable, storey: number, k: number): boolean => {
  const h = halfWidth(k);
  if (2 * h + 1 > state.typicalStorey.length) {
    throw new RangeError(`applyBand: k = ${h} needs ${2 * h + 1} slots, this state has ${state.typicalStorey.length}`);
  }
  const band = storeyBand(table, storey, h, SCRATCH);
  if (band.lo > band.hi) return clearBand(state);
  const changed = state.table !== table || state.lo !== band.lo || state.hi !== band.hi;
  state.storey = storey;
  state.k = h;
  if (!changed) return false;
  state.table = table;
  state.lo = band.lo;
  state.hi = band.hi;
  state.ceiling = ceilingStorey(table, band);
  state.typicalCount = typicalInstances(table, band, state.typicalStorey, state.typicalFfl);
  state.specialCount = specialsInBand(table, band, state.specialStorey);
  return true;
};

// ---- footprint: inside and peeking -----------------------------------------------
//
// A footprint is one ring of [x, y] points, closed (last = first, as upstream
// writes it) or open; the two read the same. Concave rings are fine (BLK_509's
// has 57 points and a dozen notches). Allocation-free.
//
// Every test runs over one shape, a flat ring [x0, y0, x1, y1, …] in a
// Float64Array, built once per ring and kept by identity (the rings handed in
// are immutable: pack footprints, nav room outlines, picking prisms). Read as
// nested arrays of three kinds, the loops' keyed loads went megamorphic and
// boxed every double they read: ~2.9 KB of garbage a frame in Walk, through the
// interior's inside test, where the plan allows none.

const FLAT_RINGS = new WeakMap<object, Float64Array>();

/** `ring` as a flat [x0, y0, x1, y1, …] Float64Array, built on first use and cached by identity (do not mutate a ring once tested). */
export const flatRing = (ring: ArrayLike<ArrayLike<number>>): Float64Array => {
  let flat = FLAT_RINGS.get(ring as object);
  if (flat === undefined) {
    const n = ring.length;
    flat = new Float64Array(2 * n);
    for (let i = 0; i < n; i += 1) {
      flat[2 * i] = ring[i][0];
      flat[2 * i + 1] = ring[i][1];
    }
    FLAT_RINGS.set(ring as object, flat);
  }
  return flat;
};

/** pointInPolygon over a flat ring. */
export const pointInRing = (x: number, y: number, ring: Float64Array): boolean => {
  const n = ring.length >> 1;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = ring[2 * i], yi = ring[2 * i + 1], xj = ring[2 * j], yj = ring[2 * j + 1];
    // A closing duplicate is a zero-length edge, which never straddles y.
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** polygonEdgeDistance over a flat ring. */
export const ringEdgeDistance = (x: number, y: number, ring: Float64Array): number => {
  const n = ring.length >> 1;
  let best = Infinity;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const ax = ring[2 * j], ay = ring[2 * j + 1];
    const ex = ring[2 * i] - ax, ey = ring[2 * i + 1] - ay;
    const px = x - ax, py = y - ay;
    const len2 = ex * ex + ey * ey;
    const t = len2 > 0 ? Math.min(1, Math.max(0, (px * ex + py * ey) / len2)) : 0;
    const dx = px - t * ex, dy = py - t * ey;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
};

/** Even-odd test. A point exactly on an edge may read either way; inside callers widen by a margin anyway. */
export const pointInPolygon = (x: number, y: number, ring: ArrayLike<ArrayLike<number>>): boolean =>
  pointInRing(x, y, flatRing(ring));

/** Distance from (x, y) to the ring's nearest edge, inside or out; Infinity for an empty ring. */
export const polygonEdgeDistance = (x: number, y: number, ring: ArrayLike<ArrayLike<number>>): number =>
  ringEdgeDistance(x, y, flatRing(ring));

/** Distance from (x, y) to the ring's area: 0 inside, else to the nearest edge. */
export const polygonDistance = (x: number, y: number, ring: ArrayLike<ArrayLike<number>>): number => {
  const flat = flatRing(ring);
  return pointInRing(x, y, flat) ? 0 : ringEdgeDistance(x, y, flat);
};

/** What the inside and peeking tests read off a building. A pack site ({ footprint, roofTop, … }) fits. */
export interface FootprintShape {
  footprint: ArrayLike<ArrayLike<number>>;
  /** Top of the building, m, block-local Z. */
  roofTop: number;
  /** Ground level, m, block-local Z. Default 0, L1's FFL. */
  ground?: number;
}

/**
 * Where the camera stands relative to a building, block-local: 'inside'
 * (footprint + 0.5 m, 1 m below ground … 2 m above the roof), else 'peeking'
 * (within 6 m, ground … roof), else 'outside'. Edges count in. The height test
 * runs first, so most of the estate costs no polygon work.
 */
export const interiorAccess = (x: number, y: number, z: number, shape: FootprintShape): InteriorAccess => {
  const ground = shape.ground ?? 0;
  if (!(z >= ground - INSIDE_BELOW_GROUND && z <= shape.roofTop + INSIDE_ABOVE_ROOF)) return 'outside';
  const d = polygonDistance(x, y, shape.footprint);
  if (d <= INSIDE_MARGIN) return 'inside';
  return d <= PEEK_DISTANCE && z >= ground && z <= shape.roofTop ? 'peeking' : 'outside';
};

/**
 * Interior active = (inside, peeking or Plan) and the interior fully uploaded.
 * Until then F and D stay whole and the mask is off (MASK_OFF; clearBand).
 */
export const interiorActive = (access: InteriorAccess, plan: boolean, resident: boolean): boolean =>
  resident && (plan || access !== 'outside');
