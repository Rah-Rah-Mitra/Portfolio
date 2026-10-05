import {
  ESTATE_SITE_STOREYS, ESTATE_STOREY_FFL, normaliseStoreyTag, type EstateSiteId, type EstateStoreyTag,
} from './ids';

// Walk grids for the Estate window's Walk mode (plan §5.2, §8.4): the SN5W v1
// decoder, the floor search and the collision step. Pure, so the engine and
// node tests run the same code.
//
// One file per building, written upstream by estate/web/walk.py (raw there,
// gzipped in the pack; the loader gunzips before this sees it). Each storey is
// a layer: a dense nx × ny raster of int16 floor heights in mm relative to that
// storey's FFL, 0x7FFF where the walker may not stand. Upstream has already
// shrunk it by the walker's radius (0.20 m), kept only cells reachable from the
// street, stamped doorways walkable and blocked opened door leaves, so a point
// test against it is the whole collision model. Where one column has two floors
// in a storey's band (a stair flight over its landing), the one nearest the FFL
// is in the raster and the rest are overflow records.
//
// Frame: block-local, Z up, metres. Cell (ix, iy) covers
// [origin + i·cell, origin + (i+1)·cell) on each axis; raster index iy·nx + ix.
//
// Rasters decode lazily, on the first floor query that reaches the storey, and
// the WALK_LRU most recent stay resident per file (BLK_509 is ≈ 0.55 MB per
// storey); release() drops a file's rasters when the walker leaves its building,
// so only the building being walked holds any. Queries and moves allocate
// nothing once their storeys are resident.
//
// Decoded with its site (as the engine always does), a file's layers are
// exactly that site's storeys in order, so a layer index IS the storey index of
// ids.ts, storeys.ts and the shader's uStoreyMask. Without a site (tests) it is
// only the file's own order.
//
// Delta layers: `stored = value − reference (mod 2^16)` over the whole int16
// range, the blocked value included, so blocked-over-walkable and
// walkable-over-blocked both round-trip. That is this decoder's reading of the
// plan's "0x7FFF = blocked (mode 1: value − ref, wrapping)"; the other reading
// (a stored 0x7FFF always means blocked) disagrees on a floor 2 mm below a
// blocked reference cell. Upstream's golden sn5w_sample.bin must confirm it
// before walk grids ship (tests/estate-walk.test.ts' it.todo).

// ---- SN5W v1 layout (little-endian) -------------------------------------------

export const WALK_HEADER_BYTES = 64;
export const WALK_LAYER_BYTES = 32;
export const WALK_OVERFLOW_BYTES = 8;
/** Raster value for a cell the walker's point may not occupy. */
export const WALK_BLOCKED = 0x7fff;
/** Flag bit0: some storeys are stored as differences from the reference storey. */
export const WALK_FLAG_DELTA = 1;
/** Flag bit1: the 0.2 m fallback grid, walkable only where all four 0.1 m sub-cells were. */
export const WALK_FLAG_COARSE = 2;
/** Decoded storey rasters kept resident per file (plan §7.6). */
export const WALK_LRU = 6;
// Storey s owns feet heights [FFL_s − 0.25, FFL_{s+1} − 0.25), the top storey
// everything from FFL − 0.25 up (config/estate.toml [web] band_pad). It is not
// in the header, and here it only prunes which storeys a floor search reads.
export const WALK_BAND_PAD = 0.25;
// A band edge quantised to the mm can put a floor a hair outside its storey's
// band (the floor at FFL_s − 0.2504 m belongs to s − 1 but stores as −250 mm
// above it); pruning is that much generous, so it never hides a floor.
const PRUNE_SLACK = 0.001;
const EPS = 1e-9;

export type WalkLayerMode = 'raw' | 'delta' | 'same';
const MODES: readonly WalkLayerMode[] = ['raw', 'delta', 'same'];

export interface WalkHeader {
  version: 1;
  flags: number;
  deltaLayers: boolean;
  coarse: boolean;
  /** Cell edge, m (0.1; 0.2 for the coarse fallback). */
  cell: number;
  /** Walker radius the grid is already shrunk by, m. Informative. */
  radius: number;
  /** Largest rise or drop between neighbouring floors, m: the floor search reaches ±step. */
  step: number;
  /** Block-local corner of cell (0, 0), m. */
  originX: number;
  originY: number;
  nx: number;
  ny: number;
  /** The storey delta and same layers are stored against. Always raw. */
  refLayer: number;
}

export interface WalkLayer {
  /** Position in the file; the storey index when decoded with its site. */
  index: number;
  tag: EstateStoreyTag;
  /** Finished floor level, block-local m. Raster heights are mm above it. */
  ffl: number;
  mode: WalkLayerMode;
  /**
   * Feet heights this storey owns, block-local m: [bandLo, bandHi). The lowest
   * storey's starts at −Infinity: nothing else owns the ground below L1, so a
   * kerb or ramp there is still in its raster and must never be pruned.
   */
  bandLo: number;
  bandHi: number;
  /** Overflow floors: cell key iy·nx + ix (non-decreasing) and mm above ffl, parallel. Read only. */
  overflowKeys: Uint32Array;
  overflowMm: Int16Array;
}

export interface WalkFile {
  readonly header: WalkHeader;
  /** Bottom-up: FFLs strictly increase. */
  readonly layers: readonly WalkLayer[];
  /**
   * Storey `layer`'s dense raster (mm above its FFL, WALK_BLOCKED where blocked),
   * decoded on first use. Read only: a same layer shares its reference's array.
   */
  grid(layer: number): Int16Array;
  /** Layers with a decoded raster resident, ascending (a same layer counts as its reference). */
  residentLayers(): number[];
  /** Rasters decoded so far, re-decodes after eviction included. */
  readonly decodeCount: number;
  /** Drops every decoded raster (the walker left the building); the next query decodes again. */
  release(): void;
}

export class WalkFormatError extends Error {
  /** Byte offset of the field at fault. */
  readonly offset: number;
  constructor(offset: number, problem: string) {
    super(`SN5W @${offset}: ${problem}`);
    this.name = 'WalkFormatError';
    this.offset = offset;
  }
}

const fail = (offset: number, problem: string): never => {
  throw new WalkFormatError(offset, problem);
};

// The header's floats are f32, so cell 0.1 arrives as 0.10000000149. The writer
// meant a short decimal; take the shortest one that rounds to the same f32
// (what numpy prints). Lossless, and FFLs then compare exactly with ids.ts.
const f32Decimal = (v: number): number => {
  if (!Number.isFinite(v)) return v;
  for (let p = 1; p < 9; p += 1) {
    const d = Number(v.toPrecision(p));
    if (Math.fround(d) === v) return d;
  }
  return v;
};

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

interface Slot { layer: number; grid: Int16Array; used: number }

class DecodedWalk implements WalkFile {
  decodeCount = 0;
  private readonly slots: Slot[] = [];
  private clock = 0;

  constructor(
    readonly header: WalkHeader,
    readonly layers: readonly WalkLayer[],
    private readonly bytes: Uint8Array,
    private readonly rasterOff: Uint32Array,
  ) {}

  grid(layer: number): Int16Array {
    const info = this.layers[layer];
    if (!info || !Number.isInteger(layer)) throw new RangeError(`walk layer ${layer} of ${this.layers.length}`);
    const key = info.mode === 'same' ? this.header.refLayer : layer;
    const slots = this.slots;
    for (let i = 0; i < slots.length; i += 1) {
      if (slots[i].layer === key) {
        slots[i].used = ++this.clock;
        return slots[i].grid;
      }
    }
    const grid = this.decode(key);
    if (slots.length < WALK_LRU) {
      slots.push({ layer: key, grid, used: ++this.clock });
    } else {
      let oldest = 0;
      for (let i = 1; i < slots.length; i += 1) if (slots[i].used < slots[oldest].used) oldest = i;
      slots[oldest] = { layer: key, grid, used: ++this.clock };
    }
    return grid;
  }

  residentLayers(): number[] {
    return this.slots.map((s) => s.layer).sort((a, b) => a - b);
  }

  release(): void {
    this.slots.length = 0;
  }

  private decode(layer: number): Int16Array {
    this.decodeCount += 1;
    const cells = this.header.nx * this.header.ny;
    const start = this.bytes.byteOffset + this.rasterOff[layer];
    let out: Int16Array;
    if (LITTLE_ENDIAN) {
      // One copy into an owned, aligned buffer; the file's own may be unaligned.
      out = new Int16Array(this.bytes.buffer.slice(start, start + cells * 2));
    } else {
      out = new Int16Array(cells);
      const dv = new DataView(this.bytes.buffer, start, cells * 2);
      for (let i = 0; i < cells; i += 1) out[i] = dv.getInt16(2 * i, true);
    }
    if (this.layers[layer].mode === 'delta') {
      // Stored = value − ref mod 2^16, over the whole int16 range: the blocked
      // sentinel takes part like any other value, so blocked-over-walkable and
      // walkable-over-blocked both round-trip. Int16Array stores wrap mod 2^16.
      const base = this.grid(this.header.refLayer);
      for (let i = 0; i < cells; i += 1) out[i] += base[i];
    }
    return out;
  }
}

/**
 * Parse an SN5W v1 file. Reads and checks the header, the layer table and every
 * overflow record now; rasters decode on demand. Throws WalkFormatError (with the
 * byte offset) on anything outside the format: magic, version, unknown flag bits,
 * non-zero reserved bytes, a table or block past the end, a raster of the wrong
 * length, a non-raw reference, a delta layer without flag bit0, a tag that is not
 * canonical or repeats, FFLs not strictly rising, overflow off the grid, blocked
 * or unsorted. With `site` the layers must be exactly that site's storeys, in
 * order, at their FFLs (lib/estate/ids.ts, to 0.5 mm): layer i is storey i.
 *
 * Keeps a view of `input` for the lazy decode: do not reuse its buffer.
 */
export const decodeWalk = (input: ArrayBuffer | ArrayBufferView, site?: EstateSiteId): WalkFile => {
  const bytes = ArrayBuffer.isView(input)
    ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    : new Uint8Array(input);
  const size = bytes.byteLength;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, size);
  const u16 = (o: number) => dv.getUint16(o, true);
  const u32 = (o: number) => dv.getUint32(o, true);
  const f32 = (o: number) => f32Decimal(dv.getFloat32(o, true));

  if (size < WALK_HEADER_BYTES) fail(0, `${size} bytes is shorter than the ${WALK_HEADER_BYTES}-byte header`);
  if (bytes[0] !== 0x53 || bytes[1] !== 0x4e || bytes[2] !== 0x35 || bytes[3] !== 0x57) fail(0, 'magic is not "SN5W"');
  const version = u16(4);
  if (version !== 1) fail(4, `version ${version}; this reader knows 1`);
  const flags = u16(6);
  if (flags & ~(WALK_FLAG_DELTA | WALK_FLAG_COARSE)) fail(6, `unknown flag bits 0x${flags.toString(16)}`);
  const cell = f32(8), radius = f32(12), step = f32(16), originX = f32(20), originY = f32(24);
  if (!(cell > 0 && cell < Infinity)) fail(8, `cell ${cell} m`);
  if (!(radius >= 0 && radius < Infinity)) fail(12, `radius ${radius} m`);
  if (!(step > 0 && step < Infinity)) fail(16, `step ${step} m`);
  if (!Number.isFinite(originX)) fail(20, `origin x ${originX}`);
  if (!Number.isFinite(originY)) fail(24, `origin y ${originY}`);
  const nx = u16(28), ny = u16(30), count = u16(32), refLayer = u16(34);
  if (nx === 0) fail(28, 'nx is 0');
  if (ny === 0) fail(30, 'ny is 0');
  if (count === 0) fail(32, 'no layers');
  if (refLayer >= count) fail(34, `reference layer ${refLayer} of ${count}`);
  if (site !== undefined && count !== ESTATE_SITE_STOREYS[site].length) {
    fail(32, `${site} has ${ESTATE_SITE_STOREYS[site].length} storeys; the file has ${count} layers (one per storey)`);
  }
  for (let o = 36; o < WALK_HEADER_BYTES; o += 1) if (bytes[o] !== 0) fail(o, 'reserved byte is not 0');
  const tableEnd = WALK_HEADER_BYTES + WALK_LAYER_BYTES * count;
  if (size < tableEnd) fail(WALK_HEADER_BYTES, `layer table ends at ${tableEnd}, file at ${size}`);

  const rasterBytes = nx * ny * 2;
  const rasterOff = new Uint32Array(count);
  const layers: WalkLayer[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    const at = WALK_HEADER_BYTES + WALK_LAYER_BYTES * i;
    // char[4], canonical and NUL-padded: "L1\0\0", "L12\0", "RF\0\0".
    let text = '';
    let ended = false;
    for (let k = 0; k < 4; k += 1) {
      const c = bytes[at + k];
      if (c === 0) { ended = true; continue; }
      if (ended || c < 0x21 || c > 0x7e) fail(at, 'tag is not NUL-padded ASCII');
      text += String.fromCharCode(c);
    }
    const tag = normaliseStoreyTag(text);
    if (tag === null || tag !== text) fail(at, `tag "${text}" is not a canonical storey tag (L1…L99, RF)`);
    if (seen.has(text)) fail(at, `tag ${text} repeats`);
    seen.add(text);
    const ffl = f32(at + 4);
    if (!Number.isFinite(ffl)) fail(at + 4, `${text} FFL ${ffl}`);
    if (i > 0 && !(ffl > layers[i - 1].ffl)) fail(at + 4, `${text} FFL ${ffl} does not rise above ${layers[i - 1].ffl}`);
    const modeByte = bytes[at + 8];
    const mode = MODES[modeByte];
    if (mode === undefined) fail(at + 8, `${text} mode ${modeByte}`);
    if (i === refLayer && mode !== 'raw') fail(at + 8, `reference layer ${text} is ${mode}, not raw`);
    if (mode === 'delta' && !(flags & WALK_FLAG_DELTA)) fail(at + 8, `${text} is a delta layer but flag bit0 is clear`);
    // A same layer has no raster of its own; whatever its raster fields say is unused.
    if (mode !== 'same') {
      const off = u32(at + 12), len = u32(at + 16);
      if (len !== rasterBytes) fail(at + 16, `${text} raster is ${len} bytes, ${nx} × ${ny} needs ${rasterBytes}`);
      if (off < tableEnd || off + len > size) fail(at + 12, `${text} raster [${off}, ${off + len}) is outside [${tableEnd}, ${size})`);
      rasterOff[i] = off;
    }
    const overflowCount = u32(at + 20), overflowOff = u32(at + 24);
    const overflowKeys = new Uint32Array(overflowCount);
    const overflowMm = new Int16Array(overflowCount);
    if (overflowCount > 0) {
      const end = overflowOff + WALK_OVERFLOW_BYTES * overflowCount;
      if (overflowOff < tableEnd || end > size) fail(at + 24, `${text} overflow [${overflowOff}, ${end}) is outside [${tableEnd}, ${size})`);
      for (let j = 0; j < overflowCount; j += 1) {
        const r = overflowOff + WALK_OVERFLOW_BYTES * j;
        const ix = u16(r), iy = u16(r + 2), mm = dv.getInt16(r + 4, true);
        if (ix >= nx || iy >= ny) fail(r, `${text} overflow cell (${ix}, ${iy}) is outside ${nx} × ${ny}`);
        if (mm === WALK_BLOCKED) fail(r + 4, `${text} overflow record holds the blocked value`);
        const key = iy * nx + ix;
        if (j > 0 && (key < overflowKeys[j - 1] || (key === overflowKeys[j - 1] && mm < overflowMm[j - 1]))) {
          fail(r, `${text} overflow records are not sorted by (iy, ix, mm)`);
        }
        overflowKeys[j] = key;
        overflowMm[j] = mm;
      }
    }
    if (site !== undefined) {
      const expectedTag = ESTATE_SITE_STOREYS[site][i];
      if (text !== expectedTag) fail(at, `${site} storey ${i} is ${expectedTag}; the file has ${text}`);
      const expected = ESTATE_STOREY_FFL[site][i];
      if (Math.abs(expected - ffl) > 0.0005) fail(at + 4, `${site} ${text} FFL is ${expected}, file says ${ffl}`);
    }
    layers.push({
      index: i, tag: text as EstateStoreyTag, ffl, mode,
      bandLo: i === 0 ? -Infinity : ffl - WALK_BAND_PAD, bandHi: Infinity, overflowKeys, overflowMm,
    });
  }
  for (let i = 0; i + 1 < count; i += 1) layers[i].bandHi = layers[i + 1].ffl - WALK_BAND_PAD;

  const header: WalkHeader = {
    version: 1, flags,
    deltaLayers: (flags & WALK_FLAG_DELTA) !== 0, coarse: (flags & WALK_FLAG_COARSE) !== 0,
    cell, radius, step, originX, originY, nx, ny, refLayer,
  };
  return new DecodedWalk(Object.freeze(header), Object.freeze(layers), bytes, rasterOff);
};

/** Index of storey `raw` (any spelling normaliseStoreyTag accepts) in the file's layers, or -1. */
export const layerOf = (walk: WalkFile, raw: unknown): number => {
  const tag = normaliseStoreyTag(raw);
  if (tag === null) return -1;
  for (let i = 0; i < walk.layers.length; i += 1) if (walk.layers[i].tag === tag) return i;
  return -1;
};

// ---- floor search ------------------------------------------------------------

export interface FloorHit {
  /** Block-local floor height, m. */
  z: number;
  /** Layer it came from: the storey index when the file was decoded with its site. */
  layer: number;
}

const cellX = (h: WalkHeader, x: number) => Math.floor((x - h.originX) * (1 / h.cell));
const cellY = (h: WalkHeader, y: number) => Math.floor((y - h.originY) * (1 / h.cell));

// Closest wins; at equal distance the higher floor, so a tie never drops the
// walker through a tread or landing.
const closer = (cand: number, best: number, z: number): boolean => {
  if (Number.isNaN(best)) return true;
  const dc = Math.abs(cand - z), db = Math.abs(best - z);
  return dc < db - EPS || (dc <= db + EPS && cand > best);
};

// The floor search on one cell; NaN when there is none within ±step. Reads only
// the storeys whose band meets [z − step, z + step], each through its raster and
// its overflow records, so a band edge or a flight over a landing needs no
// special case. Bands rise with the layer index, which lets the scan stop early.
const floorInCell = (walk: WalkFile, ix: number, iy: number, z: number, hit: FloorHit | undefined): number => {
  const h = walk.header;
  if (ix < 0 || iy < 0 || ix >= h.nx || iy >= h.ny || !Number.isFinite(z)) return NaN;
  const lo = z - h.step - EPS, hi = z + h.step + EPS;
  const key = iy * h.nx + ix;
  const layers = walk.layers;
  let best = NaN, bestLayer = -1;
  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i];
    if (layer.bandLo > hi + PRUNE_SLACK) break;
    if (layer.bandHi < lo - PRUNE_SLACK) continue;
    const v = walk.grid(i)[key];
    if (v !== WALK_BLOCKED) {
      const f = layer.ffl + v / 1000;
      if (f >= lo && f <= hi && closer(f, best, z)) { best = f; bestLayer = i; }
    }
    const keys = layer.overflowKeys;
    if (keys.length > 0) {
      let a = 0, b = keys.length;
      while (a < b) { const m = (a + b) >>> 1; if (keys[m] < key) a = m + 1; else b = m; }
      for (let j = a; j < keys.length && keys[j] === key; j += 1) {
        const f = layer.ffl + layer.overflowMm[j] / 1000;
        if (f >= lo && f <= hi && closer(f, best, z)) { best = f; bestLayer = i; }
      }
    }
  }
  if (hit && bestLayer >= 0) { hit.z = best; hit.layer = bestLayer; }
  return best;
};

/**
 * The floor under block-local (x, y) closest to `feetZ` within ±step (0.4 m),
 * in m, or null: a blocked or off-grid cell, or nothing in reach. One rule
 * covers stair treads (≤ 0.175 m), the MSCP 1:8 ramps (12.5 mm per cell) and
 * the handover between storeys. Fills `hit` (layer included) when it finds one.
 */
export const floorAt = (walk: WalkFile, x: number, y: number, feetZ: number, hit?: FloorHit): number | null => {
  const h = walk.header;
  const f = floorInCell(walk, cellX(h, x), cellY(h, y), feetZ, hit);
  return Number.isNaN(f) ? null : f;
};

/** Margin inside a grid's edge where the engine stops using it for the ground outside (plan §8.4), m. */
export const WALK_BOUNDS_INSET = 0.5;
/** Is (x, y) inside the grid less `inset` m on every side? */
export const walkBoundsContain = (walk: WalkFile, x: number, y: number, inset = WALK_BOUNDS_INSET): boolean => {
  const h = walk.header;
  return x >= h.originX + inset && x <= h.originX + h.nx * h.cell - inset
    && y >= h.originY + inset && y <= h.originY + h.ny * h.cell - inset;
};

// ---- moving ------------------------------------------------------------------

/** The walker's logical position: what collision reads. The eye height follows `z` through followFloor. */
export interface WalkPose {
  /** Block-local camera point, m. */
  x: number;
  y: number;
  /** The floor under it, block-local m: the centre of the next floor search. */
  z: number;
  /** The layer that floor belongs to (the storey index underfoot, decoded with its site), or -1 before the first floor. */
  layer: number;
}

/** 'free' every substep went straight; 'slid' one slid on an axis; 'nudged' one stepped sideways a cell; 'blocked' it stopped short. */
export type MoveOutcome = 'free' | 'slid' | 'nudged' | 'blocked';

// Substeps no longer than a cell, so no straight step can skip a whole cell
// interval: a one-cell wall stops any speed. 64 of them is 6.4 m, far past a
// frame of walking (4 m/s); a longer request (a stalled frame's dt) is cut there.
export const WALK_SUBSTEP = 0.1;
export const WALK_MAX_SUBSTEPS = 64;

const HIT: FloorHit = { z: 0, layer: -1 };
const NUDGE: WalkPose = { x: 0, y: 0, z: 0, layer: -1 };

// One substep. Accepted when the destination cell has a floor within a step of
// the current one; a diagonal move that changes both cell indices also needs
// one of the two cells it cuts past, so it cannot slip between two blocked
// cells that touch only at a corner.
const tryStep = (walk: WalkFile, pose: WalkPose, sx: number, sy: number): boolean => {
  const h = walk.header;
  const x1 = pose.x + sx, y1 = pose.y + sy;
  const ix0 = cellX(h, pose.x), iy0 = cellY(h, pose.y);
  const ix1 = cellX(h, x1), iy1 = cellY(h, y1);
  const z1 = floorInCell(walk, ix1, iy1, pose.z, HIT);
  if (Number.isNaN(z1)) return false;
  const layer = HIT.layer;
  if (ix1 !== ix0 && iy1 !== iy0
    && Number.isNaN(floorInCell(walk, ix1, iy0, pose.z, undefined))
    && Number.isNaN(floorInCell(walk, ix0, iy1, pose.z, undefined))) return false;
  pose.x = x1; pose.y = y1; pose.z = z1; pose.layer = layer;
  return true;
};

// Stamped doorways are one cell wide, so walking at one a cell off its line
// meets wall. Step one cell sideways, across the main axis of motion, into the
// neighbouring row or column, but only where the step then goes through; the
// side the point already leans towards is tried first.
const tryNudge = (walk: WalkFile, pose: WalkPose, sx: number, sy: number): boolean => {
  const h = walk.header;
  const alongX = Math.abs(sx) >= Math.abs(sy);
  const u = alongX ? (pose.y - h.originY) * (1 / h.cell) : (pose.x - h.originX) * (1 / h.cell);
  const first = u - Math.floor(u) >= 0.5 ? 1 : -1;
  for (let k = 0; k < 2; k += 1) {
    const side = k === 0 ? first : -first;
    const lx = alongX ? pose.x : pose.x + side * h.cell;
    const ly = alongX ? pose.y + side * h.cell : pose.y;
    const lz = floorInCell(walk, cellX(h, lx), cellY(h, ly), pose.z, HIT);
    if (Number.isNaN(lz)) continue;
    NUDGE.x = lx; NUDGE.y = ly; NUDGE.z = lz; NUDGE.layer = HIT.layer;
    if (tryStep(walk, NUDGE, sx, sy)) {
      pose.x = NUDGE.x; pose.y = NUDGE.y; pose.z = NUDGE.z; pose.layer = NUDGE.layer;
      return true;
    }
  }
  return false;
};

/**
 * Move `pose` by (dx, dy) m, block-local, in place. Each substep tries the full
 * step, then x only, then y only, then a one-cell sideways nudge; the first that
 * lands on a floor within ±step of the current one is taken, and the floor (z,
 * layer) follows. A substep that finds none ends the move. The camera point is
 * tested as is: the grid is already shrunk by the walker's radius.
 */
export const moveWithCollision = (walk: WalkFile, pose: WalkPose, dx: number, dy: number): MoveOutcome => {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 'blocked';
  const length = Math.hypot(dx, dy);
  if (length === 0) return 'free';
  const maxStep = Math.min(WALK_SUBSTEP, walk.header.cell);
  // 1e-9 so 0.2 m is 2 substeps even when 0.2 / 0.1 rounds a hair above 2.
  let n = Math.max(1, Math.ceil(length / maxStep - 1e-9));
  let scale = 1;
  if (n > WALK_MAX_SUBSTEPS) {
    scale = (WALK_MAX_SUBSTEPS * maxStep) / length;
    n = WALK_MAX_SUBSTEPS;
  }
  const sx = (dx * scale) / n, sy = (dy * scale) / n;
  let worst = 0; // 0 free, 1 slid, 2 nudged
  for (let k = 0; k < n; k += 1) {
    if (tryStep(walk, pose, sx, sy)) continue;
    if (sx !== 0 && sy !== 0) {
      if (tryStep(walk, pose, sx, 0) || tryStep(walk, pose, 0, sy)) { if (worst < 1) worst = 1; continue; }
    }
    if (tryNudge(walk, pose, sx, sy)) { worst = 2; continue; }
    // Nothing changed, so every later substep would fail the same way.
    return 'blocked';
  }
  return worst === 0 ? 'free' : worst === 1 ? 'slid' : 'nudged';
};

// ---- feet spring -------------------------------------------------------------

/** Critically damped, so a tread is climbed without overshoot. rad/s. */
export const FEET_OMEGA = 14;

export interface FeetSpring {
  /** Drawn feet height, block-local m (eye = z + storeys.EYE_HEIGHT). */
  z: number;
  /** Its rate, m/s. */
  v: number;
}

/**
 * Advance the drawn feet towards the logical floor by dt seconds, in place. The
 * closed-form critically damped step, so any split of the same time lands in the
 * same place. While motion is halted the feet snap to the floor.
 */
export const followFloor = (spring: FeetSpring, floorZ: number, dt: number, halted: boolean): FeetSpring => {
  if (halted) {
    spring.z = floorZ;
    spring.v = 0;
    return spring;
  }
  if (!(dt > 0) || !Number.isFinite(dt)) return spring;
  const c1 = spring.z - floorZ;
  const c2 = spring.v + FEET_OMEGA * c1;
  const e = Math.exp(-FEET_OMEGA * dt);
  spring.z = floorZ + (c1 + c2 * dt) * e;
  spring.v = (c2 - FEET_OMEGA * (c1 + c2 * dt)) * e;
  return spring;
};

// ---- snapping ----------------------------------------------------------------

/**
 * Where a spawn, a lift arrival or a "walk in here" lands: the point itself if
 * its cell has a floor within ±step of `z`, else the centre of the nearest cell
 * (by centre distance, ties to the lower iy then ix) that has one, no further
 * than `maxDist` m. Fills `out` and returns true, or returns false.
 */
export const nearestWalkable = (
  walk: WalkFile, x: number, y: number, z: number, maxDist: number, out: WalkPose,
): boolean => {
  const h = walk.header;
  const cx = cellX(h, x), cy = cellY(h, y);
  const own = floorInCell(walk, cx, cy, z, HIT);
  if (!Number.isNaN(own)) {
    out.x = x; out.y = y; out.z = own; out.layer = HIT.layer;
    return true;
  }
  if (!(maxDist > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const reach = Math.ceil(maxDist / h.cell) + 1;
  const limit = maxDist * maxDist + EPS;
  let best = Infinity, bx = 0, by = 0, bz = 0, bl = -1;
  for (let iy = Math.max(0, cy - reach); iy <= Math.min(h.ny - 1, cy + reach); iy += 1) {
    const py = h.originY + (iy + 0.5) * h.cell;
    for (let ix = Math.max(0, cx - reach); ix <= Math.min(h.nx - 1, cx + reach); ix += 1) {
      const px = h.originX + (ix + 0.5) * h.cell;
      const d2 = (px - x) * (px - x) + (py - y) * (py - y);
      if (d2 > limit || d2 >= best) continue;
      const f = floorInCell(walk, ix, iy, z, HIT);
      if (Number.isNaN(f)) continue;
      best = d2; bx = px; by = py; bz = f; bl = HIT.layer;
    }
  }
  if (best === Infinity) return false;
  out.x = bx; out.y = by; out.z = bz; out.layer = bl;
  return true;
};
