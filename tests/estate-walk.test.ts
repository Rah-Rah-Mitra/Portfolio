import { describe, expect, it } from 'vitest';
import {
  FEET_OMEGA, WALK_BAND_PAD, WALK_BLOCKED, WALK_HEADER_BYTES, WALK_LAYER_BYTES, WALK_LRU, WALK_MAX_SUBSTEPS,
  WALK_OVERFLOW_BYTES, WALK_SUBSTEP, WalkFormatError, decodeWalk, floorAt, followFloor, layerOf,
  moveWithCollision, nearestWalkable, walkBoundsContain, type FeetSpring, type FloorHit, type WalkFile,
  type WalkPose,
} from '../lib/estate/walk';
import { ESTATE_SITE_STOREYS, ESTATE_STOREY_FFL, type EstateSiteId } from '../lib/estate/ids';

// SN5W v1 is the contract between Bonsai-Estate's estate/web/walk.py and this
// decoder (plan §5.2). Upstream's golden tests/fixtures/web/sn5w_sample.bin has
// not been published yet, so the files below come from a writer kept HERE, in
// the test, written from the plan's byte table and nothing else: the runtime
// module stays decode-only. When the golden file lands, the it.todo under rasters
// becomes the authority and this writer must agree with it byte for byte.

// ---- a writer, from the plan's table ---------------------------------------------

type Mode = 'raw' | 'delta' | 'same';
interface EncLayer {
  tag: string;
  ffl: number;
  mode?: Mode;
  /** Decoded heights, mm above ffl, WALK_BLOCKED where blocked (raw and delta). */
  heights?: ArrayLike<number>;
  /** [ix, iy, mm]; written sorted unless `sortOverflow` is false. */
  overflow?: Array<[number, number, number]>;
  sortOverflow?: boolean;
}
interface EncSpec {
  flags?: number;
  cell?: number;
  radius?: number;
  step?: number;
  origin?: [number, number];
  nx: number;
  ny: number;
  ref?: number;
  layers: EncLayer[];
}

const MODE_BYTE: Record<Mode, number> = { raw: 0, delta: 1, same: 2 };

const encodeWalk = (spec: EncSpec): ArrayBuffer => {
  const { nx, ny, layers } = spec;
  const ref = spec.ref ?? 0;
  const cells = nx * ny;
  const flags = spec.flags ?? (layers.some((l) => l.mode === 'delta') ? 1 : 0);
  const tableEnd = WALK_HEADER_BYTES + WALK_LAYER_BYTES * layers.length;
  const rasters = layers.filter((l) => (l.mode ?? 'raw') !== 'same').length;
  const overflows = layers.reduce((n, l) => n + (l.overflow?.length ?? 0), 0);
  const size = tableEnd + rasters * cells * 2 + overflows * WALK_OVERFLOW_BYTES;
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  u8.set([0x53, 0x4e, 0x35, 0x57], 0); // "SN5W"
  dv.setUint16(4, 1, true);
  dv.setUint16(6, flags, true);
  dv.setFloat32(8, spec.cell ?? 0.1, true);
  dv.setFloat32(12, spec.radius ?? 0.2, true);
  dv.setFloat32(16, spec.step ?? 0.4, true);
  dv.setFloat32(20, spec.origin?.[0] ?? 0, true);
  dv.setFloat32(24, spec.origin?.[1] ?? 0, true);
  dv.setUint16(28, nx, true);
  dv.setUint16(30, ny, true);
  dv.setUint16(32, layers.length, true);
  dv.setUint16(34, ref, true);
  let cursor = tableEnd;
  const refHeights = layers[ref].heights!;
  layers.forEach((layer, i) => {
    const at = WALK_HEADER_BYTES + WALK_LAYER_BYTES * i;
    for (let k = 0; k < layer.tag.length; k += 1) u8[at + k] = layer.tag.charCodeAt(k);
    dv.setFloat32(at + 4, layer.ffl, true);
    const mode = layer.mode ?? 'raw';
    u8[at + 8] = MODE_BYTE[mode];
    if (mode !== 'same') {
      dv.setUint32(at + 12, cursor, true);
      dv.setUint32(at + 16, cells * 2, true);
      const stored = new Int16Array(cells);
      // Int16Array stores wrap mod 2^16: exactly "value − ref, wrapping".
      for (let c = 0; c < cells; c += 1) stored[c] = mode === 'delta' ? layer.heights![c] - refHeights[c] : layer.heights![c];
      for (let c = 0; c < cells; c += 1) dv.setInt16(cursor + 2 * c, stored[c], true);
      cursor += cells * 2;
    }
  });
  layers.forEach((layer, i) => {
    const at = WALK_HEADER_BYTES + WALK_LAYER_BYTES * i;
    const records = [...(layer.overflow ?? [])];
    if (layer.sortOverflow !== false) records.sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
    dv.setUint32(at + 20, records.length, true);
    dv.setUint32(at + 24, records.length ? cursor : 0, true);
    for (const [ix, iy, mm] of records) {
      dv.setUint16(cursor, ix, true);
      dv.setUint16(cursor + 2, iy, true);
      dv.setInt16(cursor + 4, mm, true);
      cursor += WALK_OVERFLOW_BYTES;
    }
  });
  expect(cursor).toBe(size);
  return buf;
};

const B = WALK_BLOCKED;
const fill = (nx: number, ny: number, v: number) => new Int16Array(nx * ny).fill(v);
/** Set the inclusive cell rectangle [ix0..ix1] × [iy0..iy1]. */
const paint = (g: Int16Array, nx: number, ix0: number, iy0: number, ix1: number, iy1: number, v: number) => {
  for (let iy = iy0; iy <= iy1; iy += 1) for (let ix = ix0; ix <= ix1; ix += 1) g[iy * nx + ix] = v;
  return g;
};

const mutate = (buf: ArrayBuffer, edit: (dv: DataView, u8: Uint8Array) => void): ArrayBuffer => {
  const copy = buf.slice(0);
  edit(new DataView(copy), new Uint8Array(copy));
  return copy;
};

const formatError = (run: () => unknown, offset: number, message?: RegExp) => {
  let caught: unknown;
  try { run(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(WalkFormatError);
  expect((caught as WalkFormatError).offset).toBe(offset);
  if (message) expect((caught as WalkFormatError).message).toMatch(message);
};

// Deterministic points: mulberry32.
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pose = (x: number, y: number, z = 0, layer = 0): WalkPose => ({ x, y, z, layer });
const cellOf = (walk: WalkFile, x: number, y: number) => [
  Math.floor((x - walk.header.originX) / walk.header.cell + 1e-9),
  Math.floor((y - walk.header.originY) / walk.header.cell + 1e-9),
];

// ---- a five-storey sample: raw, raw reference, delta, same, raw ------------------

const NX = 7;
const NY = 5;
const L1 = paint(fill(NX, NY, 0), NX, 0, 4, 6, 4, B);
const REF = (() => {
  const g = fill(NX, NY, 0);
  g[0] = B; g[1] = -32768; g[2] = 32766; g[3] = 1000; g[4] = -120; g[5] = 0; g[6] = 250;
  return paint(g, NX, 3, 2, 3, 3, B);
})();
// Against REF, cell by cell: walkable over blocked (stored delta is the
// sentinel itself), blocked over the int16 floor, the int16 floor over 32766,
// blocked over walkable, the same, and plain differences.
const L3 = (() => {
  const g = Int16Array.from(REF);
  g[0] = -2; g[1] = B; g[2] = -32768; g[3] = B; g[4] = -120; g[5] = 175; g[6] = -250;
  g[NX * 2 + 3] = 40; // walkable where the reference is blocked
  return g;
})();
const RF = paint(fill(NX, NY, 0), NX, 2, 0, 4, 4, B);

const SAMPLE: EncSpec = {
  origin: [-64.35, 12.05],
  nx: NX,
  ny: NY,
  ref: 1,
  layers: [
    { tag: 'L1', ffl: 0, heights: L1, overflow: [[2, 1, 1750], [2, 1, 1400], [0, 0, -100]] },
    { tag: 'L2', ffl: 3.6, heights: REF },
    { tag: 'L3', ffl: 6.4, mode: 'delta', heights: L3, overflow: [[6, 3, 2400]] },
    { tag: 'L4', ffl: 9.2, mode: 'same' },
    { tag: 'RF', ffl: 12, heights: RF },
  ],
};
const sample = encodeWalk(SAMPLE);

describe('SN5W v1 header and layer table', () => {
  it('reads the header, recovering the decimals the f32 fields were written from', () => {
    const walk = decodeWalk(sample);
    expect(walk.header).toEqual({
      version: 1, flags: 1, deltaLayers: true, coarse: false,
      cell: 0.1, radius: 0.2, step: 0.4, originX: -64.35, originY: 12.05,
      nx: NX, ny: NY, refLayer: 1,
    });
    // f32(0.1) is 0.10000000149…; the header carries the decimal, exactly.
    expect(Math.fround(0.1)).not.toBe(0.1);
    expect(walk.header.cell).toBe(0.1);
  });

  it('lists the storeys bottom-up with modes and bands', () => {
    const walk = decodeWalk(sample);
    expect(walk.layers.map((l) => [l.index, l.tag, l.ffl, l.mode])).toEqual([
      [0, 'L1', 0, 'raw'], [1, 'L2', 3.6, 'raw'], [2, 'L3', 6.4, 'delta'], [3, 'L4', 9.2, 'same'], [4, 'RF', 12, 'raw'],
    ]);
    const ffl = walk.layers.map((l) => l.ffl);
    walk.layers.forEach((layer, i) => {
      // The lowest storey owns everything below it too: nothing else can.
      if (i === 0) expect(layer.bandLo).toBe(-Infinity);
      else expect(layer.bandLo).toBeCloseTo(ffl[i] - WALK_BAND_PAD, 12);
      if (i + 1 < ffl.length) expect(layer.bandHi).toBe(walk.layers[i + 1].bandLo);
    });
    expect(walk.layers[0].bandHi).toBeCloseTo(3.6 - WALK_BAND_PAD, 12);
    expect(walk.layers[4].bandHi).toBe(Infinity);
    expect(layerOf(walk, 'l03')).toBe(2);
    expect(layerOf(walk, 'rf')).toBe(4);
    expect(layerOf(walk, 'L9')).toBe(-1);
  });

  it('reads overflow records sorted by (iy, ix, mm)', () => {
    const walk = decodeWalk(sample);
    expect(Array.from(walk.layers[0].overflowKeys)).toEqual([0, NX + 2, NX + 2]);
    expect(Array.from(walk.layers[0].overflowMm)).toEqual([-100, 1400, 1750]);
    expect(Array.from(walk.layers[2].overflowKeys)).toEqual([3 * NX + 6]);
    expect(walk.layers[1].overflowKeys).toHaveLength(0);
  });

  it('decodes from a view at an odd offset as from its own buffer', () => {
    const host = new Uint8Array(sample.byteLength + 5);
    host.set(new Uint8Array(sample), 3);
    const walk = decodeWalk(host.subarray(3, 3 + sample.byteLength));
    const ref = decodeWalk(sample);
    for (let i = 0; i < 5; i += 1) expect(walk.grid(i)).toEqual(ref.grid(i));
  });

  it('checks storeys against the site table when given one: layer i is storey i', () => {
    const storeys = (site: EstateSiteId): EncLayer[] => ESTATE_SITE_STOREYS[site]
      .map((tag, i) => ({ tag, ffl: ESTATE_STOREY_FFL[site][i], heights: fill(2, 2, 0) }));
    const blk = encodeWalk({ nx: 2, ny: 2, layers: storeys('BLK_509') });
    const walk = decodeWalk(blk, 'BLK_509');
    expect(walk.layers.map((l) => l.tag)).toEqual([...ESTATE_SITE_STOREYS.BLK_509]);
    expect(walk.layers.map((l) => l.ffl)).toEqual([...ESTATE_STOREY_FFL.BLK_509]);
    expect(walk.layers.every((l, i) => l.index === i && layerOf(walk, ESTATE_SITE_STOREYS.BLK_509[i]) === i)).toBe(true);
    // Another site's storeys, a storey missing, or the same storeys out of their slots.
    formatError(() => decodeWalk(blk, 'BLK_501'), 32, /BLK_501 has 21 storeys; the file has 17 layers/);
    const nc = storeys('NC_514');
    formatError(() => decodeWalk(encodeWalk({ nx: 2, ny: 2, layers: nc }), 'MSCP_513'), 32, /MSCP_513 has 8 storeys/);
    nc[1].ffl = 3.6; // NC_514's L2 is at 4.2
    formatError(() => decodeWalk(encodeWalk({ nx: 2, ny: 2, layers: nc }), 'NC_514'), WALK_HEADER_BYTES + WALK_LAYER_BYTES + 4, /NC_514 L2 FFL is 4.2/);
    const shifted = storeys('NC_514').map((layer, i, all) => (i === 1 ? { ...layer, tag: 'L3', ffl: all[1].ffl } : layer));
    formatError(() => decodeWalk(encodeWalk({ nx: 2, ny: 2, layers: shifted }), 'NC_514'), WALK_HEADER_BYTES + WALK_LAYER_BYTES, /NC_514 storey 1 is L2; the file has L3/);
  });
});

describe('SN5W v1 rasters', () => {
  it('decodes a raw storey exactly, the int16 extremes and the blocked value included', () => {
    const walk = decodeWalk(sample);
    expect(Array.from(walk.grid(0))).toEqual(Array.from(L1));
    expect(Array.from(walk.grid(1))).toEqual(Array.from(REF));
    expect(Array.from(walk.grid(4))).toEqual(Array.from(RF));
  });

  it('decodes a delta storey exactly, wrapping through the blocked value', () => {
    // The writer really did store the sentinel and wrapped values in the delta raster.
    const dv = new DataView(sample);
    const off = dv.getUint32(WALK_HEADER_BYTES + 2 * WALK_LAYER_BYTES + 12, true);
    const stored = (cell: number) => dv.getInt16(off + 2 * cell, true);
    expect(stored(0)).toBe(B); // −2 − 0x7FFF wraps onto 0x7FFF
    expect(stored(1)).toBe(-1); // 0x7FFF − (−32768) wraps
    expect(stored(2)).toBe(2); // −32768 − 32766 wraps
    expect(stored(3)).toBe(B - 1000);
    expect(stored(4)).toBe(0);
    const walk = decodeWalk(sample);
    expect(Array.from(walk.grid(2))).toEqual(Array.from(L3));
  });

  it('serves a same storey from its reference, one decode and one resident grid', () => {
    const walk = decodeWalk(sample);
    expect(walk.grid(3)).toBe(walk.grid(1));
    expect(walk.decodeCount).toBe(1);
    expect(walk.residentLayers()).toEqual([1]);
  });

  it('decodes nothing until asked, and a floor query only the storeys in reach', () => {
    const walk = decodeWalk(sample);
    expect(walk.decodeCount).toBe(0);
    expect(walk.residentLayers()).toEqual([]);
    const x = -64.35 + 0.55; // column 5
    expect(floorAt(walk, x, 12.05 + 0.15, 0)).toBe(0);
    expect(walk.residentLayers()).toEqual([0]);
    // Feet at 6.9 reach [6.5, 7.3]: L3's band only. L3 is a delta storey, so
    // its reference (L2) decodes too, though no L2 floor is in reach.
    expect(floorAt(walk, x, 12.05 + 0.05, 6.9)).toBeCloseTo(6.575, 12);
    expect(walk.residentLayers()).toEqual([0, 1, 2]);
    expect(walk.decodeCount).toBe(3);
  });

  it(`keeps the ${WALK_LRU} most recently used rasters`, () => {
    const layers: EncLayer[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'RF']
      .map((tag, i) => ({ tag, ffl: 3 * i, heights: fill(3, 2, i) }));
    const walk = decodeWalk(encodeWalk({ nx: 3, ny: 2, layers }));
    for (let i = 0; i < 8; i += 1) expect(walk.grid(i)[0]).toBe(i);
    expect(walk.decodeCount).toBe(8);
    expect(walk.residentLayers()).toEqual([2, 3, 4, 5, 6, 7]);
    walk.grid(2); // a hit: no decode, and 2 is now the most recent
    expect(walk.decodeCount).toBe(8);
    walk.grid(0); // evicts 3, the least recently used
    expect(walk.decodeCount).toBe(9);
    expect(walk.residentLayers()).toEqual([0, 2, 4, 5, 6, 7]);
    expect(() => walk.grid(8)).toThrow(RangeError);
    expect(() => walk.grid(0.5)).toThrow(RangeError);
  });

  it('releases every raster when the walker leaves, and decodes again on the next query', () => {
    const walk = decodeWalk(sample);
    walk.grid(0); walk.grid(2);
    expect(walk.residentLayers()).toEqual([0, 1, 2]);
    walk.release();
    expect(walk.residentLayers()).toEqual([]);
    expect(Array.from(walk.grid(2))).toEqual(Array.from(L3));
    expect(walk.decodeCount).toBe(5);
  });

  it.todo('decodes upstream tests/fixtures/web/sn5w_sample.bin (the golden file, when published) exactly');
});

describe('SN5W v1 rejects what is not the format', () => {
  const table = (i: number) => WALK_HEADER_BYTES + WALK_LAYER_BYTES * i;

  it('rejects a bad or truncated header', () => {
    formatError(() => decodeWalk(new ArrayBuffer(10)), 0, /shorter than the 64-byte header/);
    formatError(() => decodeWalk(mutate(sample, (_, u8) => { u8[3] = 0x58; })), 0, /magic/);
    formatError(() => decodeWalk(mutate(sample, (dv) => dv.setUint16(4, 2, true))), 4, /version 2/);
    formatError(() => decodeWalk(mutate(sample, (dv) => dv.setUint16(6, 5, true))), 6, /unknown flag bits/);
    formatError(() => decodeWalk(mutate(sample, (dv) => dv.setFloat32(8, 0, true))), 8);
    formatError(() => decodeWalk(mutate(sample, (dv) => dv.setFloat32(8, NaN, true))), 8);
    formatError(() => decodeWalk(mutate(sample, (dv) => dv.setFloat32(12, -0.2, true))), 12);
    formatError(() => decodeWalk(mutate(sample, (dv) => dv.setFloat32(16, 0, true))), 16);
    formatError(() => decodeWalk(mutate(sample, (dv) => dv.setFloat32(24, Infinity, true))), 24);
    formatError(() => decodeWalk(mutate(sample, (dv) => dv.setUint16(28, 0, true))), 28);
    formatError(() => decodeWalk(mutate(sample, (dv) => dv.setUint16(30, 0, true))), 30);
    formatError(() => decodeWalk(mutate(sample, (dv) => dv.setUint16(32, 0, true))), 32);
    formatError(() => decodeWalk(mutate(sample, (dv) => dv.setUint16(34, 5, true))), 34, /reference layer 5 of 5/);
    formatError(() => decodeWalk(mutate(sample, (_, u8) => { u8[40] = 1; })), 40, /reserved/);
    formatError(() => decodeWalk(sample.slice(0, table(5) - 1)), WALK_HEADER_BYTES, /layer table/);
  });

  it('rejects a bad layer entry', () => {
    const at = table(2);
    formatError(() => decodeWalk(mutate(sample, (_, u8) => { u8[at + 1] = 0x30; u8[at + 2] = 0x33; })), at, /"L03" is not a canonical/);
    formatError(() => decodeWalk(mutate(sample, (_, u8) => { u8[at] = 0x6c; })), at, /"l3"/);
    formatError(() => decodeWalk(mutate(sample, (_, u8) => { u8[at + 3] = 0x58; })), at, /NUL-padded/);
    formatError(() => decodeWalk(mutate(sample, (_, u8) => { u8[at + 1] = 0x32; })), at, /L2 repeats/);
    formatError(() => decodeWalk(mutate(sample, (dv) => dv.setFloat32(at + 4, 3.6, true))), at + 4, /does not rise/);
    formatError(() => decodeWalk(mutate(sample, (_, u8) => { u8[at + 8] = 3; })), at + 8, /mode 3/);
    formatError(() => decodeWalk(mutate(sample, (_, u8) => { u8[table(1) + 8] = 2; })), table(1) + 8, /reference layer L2 is same/);
    formatError(() => decodeWalk(mutate(sample, (dv) => dv.setUint16(6, 0, true))), at + 8, /flag bit0 is clear/);
  });

  it('rejects rasters and overflow that do not fit', () => {
    const at = table(4);
    formatError(() => decodeWalk(mutate(sample, (dv) => dv.setUint32(at + 16, NX * NY * 2 - 2, true))), at + 16, /raster is 68 bytes/);
    formatError(() => decodeWalk(mutate(sample, (dv) => dv.setUint32(at + 12, table(5) - 2, true))), at + 12);
    // Without overflow the last raster ends the file; cut its last byte.
    const plain = encodeWalk({ nx: 3, ny: 2, layers: [{ tag: 'L1', ffl: 0, heights: fill(3, 2, 0) }] });
    formatError(() => decodeWalk(plain.slice(0, plain.byteLength - 1)), table(0) + 12);
    // The overflow block runs past the end.
    formatError(() => decodeWalk(sample.slice(0, sample.byteLength - 1)), table(2) + 24);
  });

  it('rejects overflow records off the grid, blocked or out of order', () => {
    const one = (overflow: Array<[number, number, number]>, sortOverflow = true) => encodeWalk({
      nx: 3, ny: 2, layers: [{ tag: 'L1', ffl: 0, heights: fill(3, 2, 0), overflow, sortOverflow }],
    });
    const first = table(1) + 3 * 2 * 2;
    formatError(() => decodeWalk(one([[3, 0, 100]])), first, /\(3, 0\) is outside 3 × 2/);
    formatError(() => decodeWalk(one([[0, 2, 100]])), first, /outside/);
    formatError(() => decodeWalk(one([[1, 1, B]])), first + 4, /blocked value/);
    formatError(() => decodeWalk(one([[0, 1, 100], [2, 0, 100]], false)), first + WALK_OVERFLOW_BYTES, /not sorted/);
    formatError(() => decodeWalk(one([[1, 1, 900], [1, 1, 100]], false)), first + WALK_OVERFLOW_BYTES, /not sorted/);
    expect(decodeWalk(one([[1, 1, 100], [1, 1, 100]])).layers[0].overflowMm).toHaveLength(2);
  });
});

// ---- floors ------------------------------------------------------------------------

describe('floorAt', () => {
  // Two storeys, FFL 0 and 3.6: L1 owns [−0.25, 3.35), L2 [3.35, ∞). Origin (10, 20).
  const nx = 10, ny = 3;
  const g1 = fill(nx, ny, 0), g2 = fill(nx, ny, B);
  g1[nx + 1] = 400; g1[nx + 2] = 401;
  g1[nx + 9] = B;
  g2[nx + 6] = -250; g1[nx + 6] = B; // L2's band edge, held by L2
  g1[nx + 7] = 3349; g2[nx + 7] = -200; // the top of L1's band under the bottom of L2's
  g1[nx + 8] = 3351; // a floor a mm above its own storey's band
  const walk = decodeWalk(encodeWalk({
    origin: [10, 20], nx, ny,
    layers: [
      { tag: 'L1', ffl: 0, heights: g1, overflow: [[3, 1, 2000], [4, 1, 600]] },
      { tag: 'L2', ffl: 3.6, heights: g2 },
    ],
  }));
  const at = (ix: number, iy: number, z: number, hit?: FloorHit) => floorAt(walk, 10.05 + 0.1 * ix, 20.05 + 0.1 * iy, z, hit);

  it('reads the raster in block-local metres, origin at the corner of cell (0, 0)', () => {
    expect(at(0, 0, 0)).toBe(0);
    expect(floorAt(walk, 10.0001, 20.0001, 0)).toBe(0);
    expect(floorAt(walk, 9.9999, 20.05, 0)).toBeNull();
    expect(floorAt(walk, 10.05, 20.3001, 0)).toBeNull();
    expect(at(9, 1, 0)).toBeNull();
    expect(at(0, 0, NaN)).toBeNull();
  });

  it('reaches exactly ±step (0.4 m), no further', () => {
    expect(at(1, 1, 0)).toBe(0.4);
    expect(at(1, 1, 0.8)).toBe(0.4);
    expect(at(2, 1, 0)).toBeNull();
    expect(at(2, 1, 0.001)).toBe(0.401);
    expect(at(0, 0, 0.4)).toBe(0);
    expect(at(0, 0, 0.401)).toBeNull();
  });

  it('picks the closest of the raster and the overflow records, the higher on a tie', () => {
    expect(at(3, 1, 0)).toBe(0);
    expect(at(3, 1, 1.9)).toBe(2);
    expect(at(3, 1, 1)).toBeNull();
    expect(at(4, 1, 0.3)).toBe(0.6);
    expect(at(4, 1, 0.2)).toBe(0);
  });

  it('finds a floor across a band edge from either side, and names its storey', () => {
    const hit: FloorHit = { z: NaN, layer: -1 };
    expect(at(6, 1, 2.95, hit)).toBeCloseTo(3.35, 12);
    expect(hit.layer).toBe(1);
    expect(at(6, 1, 3.75)).toBeCloseTo(3.35, 12);
    expect(at(6, 1, 2.949)).toBeNull();
    expect(at(7, 1, 3, hit)).toBe(3.349);
    expect(hit.layer).toBe(0);
    expect(at(7, 1, 3.38, hit)).toBeCloseTo(3.4, 12);
    expect(hit.layer).toBe(1);
    // The window [3.351, 4.151] lies wholly in L2's band; L1 is still read.
    expect(at(8, 1, 3.751, hit)).toBe(3.351);
    expect(hit.layer).toBe(0);
  });

  it('leaves `hit` alone when there is no floor', () => {
    const hit: FloorHit = { z: 7, layer: 7 };
    expect(at(9, 1, 0, hit)).toBeNull();
    expect(hit).toEqual({ z: 7, layer: 7 });
  });

  it('knows its grid bounds', () => {
    expect(walkBoundsContain(walk, 10.5, 20.15, 0)).toBe(true);
    expect(walkBoundsContain(walk, 10.5, 20.15)).toBe(false); // 0.3 m deep: nothing is 0.5 m inside
    expect(walkBoundsContain(walk, 9.99, 20.15, 0)).toBe(false);
  });
});

// ---- moving ------------------------------------------------------------------------

const flat = (nx: number, ny: number, paintFn?: (g: Int16Array) => void, extra: Partial<EncSpec> = {}) => {
  const g = fill(nx, ny, 0);
  paintFn?.(g);
  return decodeWalk(encodeWalk({ nx, ny, layers: [{ tag: 'L1', ffl: 0, heights: g }], ...extra }));
};

describe('ground below the lowest storey', () => {
  // Nothing owns heights below L1's band, so low outdoor ground inside a grid
  // (a ramp down to a carriageway, a sunken court) lives in L1's raster. The
  // band search must still read it however far down it goes.
  const NXR = 40;
  const ramp = new Int16Array(NXR * 3);
  for (let iy = 0; iy < 3; iy += 1) for (let ix = 0; ix < NXR; ix += 1) ramp[iy * NXR + ix] = -25 * ix; // 1:4, to −0.975 m
  const walk = decodeWalk(encodeWalk({ nx: NXR, ny: 3, layers: [
    { tag: 'L1', ffl: 0, heights: ramp },
    { tag: 'L2', ffl: 3.6, heights: fill(NXR, 3, B) },
  ] }));

  it("finds a floor in L1's raster 0.75 m below its FFL", () => {
    expect(floorAt(walk, 3.05, 0.15, -0.75)).toBeCloseTo(-0.75, 12);
    expect(floorAt(walk, 3.95, 0.15, -0.975)).toBeCloseTo(-0.975, 12);
  });

  it('walks the ramp end to end and back', () => {
    const p = pose(0.05, 0.15, 0);
    for (let k = 0; k < 39; k += 1) expect(moveWithCollision(walk, p, 0.1, 0)).toBe('free');
    expect(p.x).toBeCloseTo(3.95, 9);
    expect(p.z).toBeCloseTo(-0.975, 12);
    expect(moveWithCollision(walk, p, -3.9, 0)).toBe('free');
    expect(p.z).toBe(0);
  });
});

describe('moveWithCollision', () => {
  // 4 m × 3 m room; a wall of one cell at x ∈ [2.0, 2.1).
  const NXR = 40, NYR = 30;
  const walled = flat(NXR, NYR, (g) => paint(g, NXR, 20, 0, 20, NYR - 1, B));

  it('walks open floor in full', () => {
    const p = pose(1.05, 1.05);
    expect(moveWithCollision(walled, p, 0.5, 0.3)).toBe('free');
    expect(p.x).toBeCloseTo(1.55, 12);
    expect(p.y).toBeCloseTo(1.35, 12);
    expect(p.z).toBe(0);
    expect(p.layer).toBe(0);
  });

  it('stops at a wall in the last free cell', () => {
    const p = pose(1.55, 1.05);
    expect(moveWithCollision(walled, p, 1, 0)).toBe('blocked');
    expect(p.x).toBeGreaterThanOrEqual(1.9);
    expect(p.x).toBeLessThan(2);
  });

  it('slides along a wall it meets at an angle', () => {
    const p = pose(1.95, 1.05);
    expect(moveWithCollision(walled, p, 0.5, 0.5)).toBe('slid');
    expect(p.x).toBe(1.95);
    expect(p.y).toBeCloseTo(1.55, 12);
  });

  it('never tunnels through a one-cell wall, at any speed or angle', () => {
    const next = rng(7);
    for (let i = 0; i < 500; i += 1) {
      const p = pose(0.05 + next() * 1.9, 0.05 + next() * 2.9);
      const speed = 0.2 + next() * 60; // up to 60 m in one call
      const angle = (next() - 0.5) * Math.PI * 0.9; // heading east-ish, ±81°
      moveWithCollision(walled, p, speed * Math.cos(angle), speed * Math.sin(angle));
      expect(p.x, `run ${i}`).toBeLessThan(2);
    }
  });

  it('never slips between blocked cells that meet only at a corner', () => {
    // An 8-connected diagonal wall: every cell with ix + iy = 25.
    const diag = flat(NXR, NYR, (g) => { for (let ix = 0; ix < NXR; ix += 1) if (25 - ix >= 0 && 25 - ix < NYR) g[(25 - ix) * NXR + ix] = B; });
    // Head-on at 45°.
    const p = pose(1.05, 1.25);
    moveWithCollision(diag, p, 1, 1);
    const [ix, iy] = cellOf(diag, p.x, p.y);
    expect(ix + iy).toBeLessThan(25);
    const next = rng(11);
    for (let i = 0; i < 300; i += 1) {
      const q = pose(0.05 + next() * 1.0, 0.05 + next() * 1.0);
      const angle = next() * Math.PI / 2;
      moveWithCollision(diag, q, 5 * Math.cos(angle), 5 * Math.sin(angle));
      const [jx, jy] = cellOf(diag, q.x, q.y);
      expect(jx + jy, `run ${i}`).toBeLessThan(25);
    }
  });

  it('refuses the corner between two diagonal cells, the only way through', () => {
    // (0, 0) and (1, 1) walkable, (1, 0) and (0, 1) blocked: they meet at a point.
    const checker = flat(2, 2, (g) => { g[1] = B; g[2] = B; });
    const p = pose(0.05, 0.05);
    expect(moveWithCollision(checker, p, 0.1, 0.1)).toBe('blocked');
    expect(p).toEqual(pose(0.05, 0.05));
    const q = pose(0.09, 0.01);
    expect(moveWithCollision(checker, q, 0.3, 0.3)).toBe('blocked');
    expect(cellOf(checker, q.x, q.y)).toEqual([0, 0]);
  });

  describe('a one-cell stamped doorway through a 0.5 m wall', () => {
    // Wall cells x ∈ [2.0, 2.5); doorway row iy = 10, y ∈ [1.0, 1.1).
    const door = flat(NXR, NYR, (g) => { paint(g, NXR, 20, 0, 24, NYR - 1, B); paint(g, NXR, 20, 10, 24, 10, 0); });

    it('walks straight through when lined up', () => {
      const p = pose(1.55, 1.05);
      expect(moveWithCollision(door, p, 2, 0)).toBe('free');
      expect(p.x).toBeCloseTo(3.55, 12);
    });

    it('nudges a walker one cell off the line into it, from either side', () => {
      for (const y of [0.95, 1.15]) {
        const p = pose(1.55, y);
        expect(moveWithCollision(door, p, 2, 0)).toBe('nudged');
        expect(p.x).toBeCloseTo(3.55, 12);
        expect(cellOf(door, p.x, p.y)[1]).toBe(10);
      }
    });

    it('does the same walking north-south through an east-west wall', () => {
      const turned = flat(NYR, NXR, (g) => { paint(g, NYR, 0, 20, NYR - 1, 24, B); paint(g, NYR, 10, 20, 10, 24, 0); });
      const p = pose(1.15, 1.55);
      expect(moveWithCollision(turned, p, 0, 2)).toBe('nudged');
      expect(p.y).toBeCloseTo(3.55, 12);
      expect(cellOf(turned, p.x, p.y)[0]).toBe(10);
    });

    it('does not nudge two cells', () => {
      const p = pose(1.55, 0.85);
      expect(moveWithCollision(door, p, 2, 0)).toBe('blocked');
      expect(p.x).toBeLessThan(2);
      expect(p.y).toBe(0.85);
    });

    it('tries the side the walker leans towards first', () => {
      const two = flat(NXR, NYR, (g) => {
        paint(g, NXR, 20, 0, 24, NYR - 1, B);
        paint(g, NXR, 20, 8, 24, 8, 0);
        paint(g, NXR, 20, 10, 24, 10, 0);
      });
      const high = pose(1.55, 0.97);
      moveWithCollision(two, high, 2, 0);
      expect(cellOf(two, high.x, high.y)[1]).toBe(10);
      const low = pose(1.55, 0.92);
      moveWithCollision(two, low, 2, 0);
      expect(cellOf(two, low.x, low.y)[1]).toBe(8);
    });
  });

  it('climbs treads and hands over to the next storey on the way', () => {
    // A straight flight east: 16 risers of 175 mm, goings of 0.3 m (3 cells),
    // L1 FFL 0 to L2 FFL 2.8. Treads at or above L2's band (2.55 m) are L2's.
    const nx = 60, ny = 3;
    const g1 = fill(nx, ny, B), g2 = fill(nx, ny, B);
    paint(g1, nx, 0, 0, 4, ny - 1, 0);
    for (let k = 0; k < 16; k += 1) {
      const mm = 175 * (k + 1);
      if (mm < 2550) paint(g1, nx, 5 + 3 * k, 0, 7 + 3 * k, ny - 1, mm);
      else paint(g2, nx, 5 + 3 * k, 0, 7 + 3 * k, ny - 1, mm - 2800);
    }
    paint(g2, nx, 53, 0, nx - 1, ny - 1, 0);
    const stair = decodeWalk(encodeWalk({
      nx, ny, layers: [{ tag: 'L1', ffl: 0, heights: g1 }, { tag: 'L2', ffl: 2.8, heights: g2 }],
    }));
    const p = pose(0.25, 0.15);
    let z = p.z;
    let layer = p.layer;
    for (let i = 0; i < 110; i += 1) {
      expect(moveWithCollision(stair, p, 0.05, 0)).toBe('free');
      expect(p.z - z).toBeGreaterThanOrEqual(-1e-9);
      expect(p.z - z).toBeLessThanOrEqual(0.175 + 1e-9);
      if (p.layer !== layer) {
        expect(p.layer).toBe(1);
        expect(p.z).toBeGreaterThanOrEqual(2.55);
      }
      z = p.z; layer = p.layer;
    }
    expect(p.x).toBeCloseTo(5.75, 9);
    expect(p.z).toBe(2.8);
    expect(p.layer).toBe(1);
    // And back down, in one call.
    expect(moveWithCollision(stair, p, -5.5, 0)).toBe('free');
    expect(p.z).toBe(0);
    expect(p.layer).toBe(0);
  });

  it('treats a rise over a step (0.4 m) as a wall, and walks a 1:8 ramp', () => {
    const ledge = flat(20, 3, (g) => paint(g, 20, 10, 0, 19, 2, 450));
    const p = pose(0.55, 0.15);
    expect(moveWithCollision(ledge, p, 1.5, 0)).toBe('blocked');
    expect(p.x).toBeLessThan(1);
    const ramp = flat(80, 3, (g) => { for (let ix = 0; ix < 80; ix += 1) paint(g, 80, ix, 0, ix, 2, Math.round(12.5 * ix)); });
    const q = pose(0.05, 0.15);
    for (let i = 0; i < 79; i += 1) expect(moveWithCollision(ramp, q, 0.1, 0)).toBe('free');
    expect(q.z).toBe(0.988); // cell 79: 987.5 mm, which Math.round takes up to 988
  });

  it('steps off a blocked cell onto floor, and not further into blocked cells', () => {
    const p = pose(2.05, 1.05); // inside the one-cell wall
    expect(moveWithCollision(walled, p, 0.3, 0)).toBe('free');
    expect(p.x).toBeCloseTo(2.35, 12);
    // Deep in a 0.5 m wall, no step or nudge reaches floor.
    const thick = flat(NXR, NYR, (g) => paint(g, NXR, 20, 0, 24, NYR - 1, B));
    const q = pose(2.25, 1.05);
    expect(moveWithCollision(thick, q, 0, 0.3)).toBe('blocked');
    expect(moveWithCollision(thick, q, 0.3, 0)).toBe('blocked');
    expect(q).toEqual(pose(2.25, 1.05));
  });

  it(`substeps at most ${WALK_SUBSTEP} m and caps one call at ${WALK_MAX_SUBSTEPS} of them`, () => {
    const corridor = flat(1000, 1);
    const p = pose(0.05, 0.05);
    expect(moveWithCollision(corridor, p, 100, 0)).toBe('free');
    expect(p.x).toBeCloseTo(0.05 + WALK_MAX_SUBSTEPS * WALK_SUBSTEP, 9);
    // The coarse fallback's 0.2 m cells still step 0.1 m.
    const coarse = flat(20, 1, (g) => { g[10] = B; }, { cell: 0.2, flags: 2 });
    expect(coarse.header.coarse).toBe(true);
    const q = pose(0.1, 0.1);
    expect(moveWithCollision(coarse, q, 50, 0)).toBe('blocked');
    expect(q.x).toBeLessThan(2);
  });

  it('ignores a non-finite or zero move', () => {
    const p = pose(1.05, 1.05);
    expect(moveWithCollision(walled, p, NaN, 0)).toBe('blocked');
    expect(moveWithCollision(walled, p, 0, Infinity)).toBe('blocked');
    expect(moveWithCollision(walled, p, 0, 0)).toBe('free');
    expect(p).toEqual(pose(1.05, 1.05));
  });
});

// ---- feet and snapping ------------------------------------------------------------------

describe('followFloor', () => {
  it('rises onto a tread without overshoot', () => {
    const s: FeetSpring = { z: 0, v: 0 };
    let peak = 0;
    for (let i = 0; i < 144; i += 1) {
      followFloor(s, 0.175, 1 / 144, false);
      peak = Math.max(peak, s.z);
    }
    expect(peak).toBeLessThanOrEqual(0.175);
    expect(s.z).toBeCloseTo(0.175, 5);
    // Critically damped at ω = 14: 1 − (1 + ωt)e^(−ωt) of the way after t.
    const t = { z: 0, v: 0 };
    followFloor(t, 1, 0.1, false);
    expect(t.z).toBeCloseTo(1 - (1 + FEET_OMEGA * 0.1) * Math.exp(-FEET_OMEGA * 0.1), 12);
  });

  it('lands in the same place however the time is split', () => {
    const one: FeetSpring = { z: 0.3, v: -0.5 };
    const ten: FeetSpring = { z: 0.3, v: -0.5 };
    followFloor(one, 2.8, 0.1, false);
    for (let i = 0; i < 10; i += 1) followFloor(ten, 2.8, 0.01, false);
    expect(ten.z).toBeCloseTo(one.z, 12);
    expect(ten.v).toBeCloseTo(one.v, 12);
  });

  it('snaps while motion is halted, and ignores a bad dt', () => {
    const s: FeetSpring = { z: 0, v: 3 };
    expect(followFloor(s, 2.8, 0.016, true)).toEqual({ z: 2.8, v: 0 });
    const t: FeetSpring = { z: 1, v: 0 };
    expect(followFloor(t, 2, 0, false)).toEqual({ z: 1, v: 0 });
    expect(followFloor(t, 2, NaN, false)).toEqual({ z: 1, v: 0 });
  });
});

describe('nearestWalkable', () => {
  // Blocked everywhere but a 3 × 3 island at cells 10–12, and an L2 cell.
  const nx = 30, ny = 30;
  const g1 = paint(fill(nx, ny, B), nx, 10, 10, 12, 12, 0);
  const g2 = fill(nx, ny, B);
  g2[5 * nx + 5] = 0;
  const walk = decodeWalk(encodeWalk({ nx, ny, layers: [{ tag: 'L1', ffl: 0, heights: g1 }, { tag: 'L2', ffl: 3, heights: g2 }] }));
  const out = pose(0, 0, 0, -1);

  it('keeps a point already on floor', () => {
    expect(nearestWalkable(walk, 1.12, 1.17, 0, 1.5, out)).toBe(true);
    expect(out).toEqual(pose(1.12, 1.17, 0, 0));
  });

  it('snaps to the nearest walkable cell centre within reach', () => {
    expect(nearestWalkable(walk, 1.55, 1.15, 0.1, 1.5, out)).toBe(true);
    expect(out.x).toBeCloseTo(1.25, 12);
    expect(out.y).toBeCloseTo(1.15, 12);
    expect(out.z).toBe(0);
    expect(nearestWalkable(walk, 1.55, 1.15, 0, 0.25, out)).toBe(false);
  });

  it('looks only within a step of the given height', () => {
    expect(nearestWalkable(walk, 0.7, 0.7, 3, 1.5, out)).toBe(true);
    expect(out.x).toBeCloseTo(0.55, 12);
    expect(out.y).toBeCloseTo(0.55, 12);
    expect([out.z, out.layer]).toEqual([3, 1]);
    expect(nearestWalkable(walk, 0.7, 0.7, 1.5, 3, out)).toBe(false);
  });
});
