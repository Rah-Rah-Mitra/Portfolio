import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  decodeGround, GROUND_HEADER_BYTES, GROUND_NODATA, GroundFormatError, groundAt, groundCell, nearestGround, type GroundHit,
} from '../lib/estate/ground';
import { parsePack } from '../lib/estate/schema';
import { rasterGround, readGround, writeGround } from '../scripts/estate/lib/pure/sn5w.mjs';

// The SN5G ground reader (lib/estate/ground.ts, plan §6.2 step 6e, §8.4)
// against the pack tool's own writer and reader (scripts/estate/lib/pure/
// sn5w.mjs): the two must agree byte for byte, and the reader must refuse
// anything outside v1. Then the real file of the pack under public/estate/v1.2,
// when one is there.

const hit = (): GroundHit => ({ z: 0, x: 0, y: 0, distance: 0 });

// A 4 × 3 grid at 0.5 m from (10, −2): row 0 [10, 20, nodata, 40], row 1
// [nodata × 4], row 2 [−5, 0, 15, 300] (cm).
const N = GROUND_NODATA;
const SAMPLE = Int16Array.from([10, 20, N, 40, N, N, N, N, -5, 0, 15, 300]);
const sampleFile = () => writeGround({ cell: 0.5, lo: [10, -2], nx: 4, ny: 3, heightsCm: SAMPLE }) as Uint8Array;

describe('decodeGround', () => {
  it('reads what the pack tool writes, the same as its own reader', () => {
    const file = sampleFile();
    const g = decodeGround(file);
    const r = readGround(file);
    expect({ cell: g.cell, lo: [g.loX, g.loY], nx: g.nx, ny: g.ny }).toEqual({ cell: r.cell, lo: r.lo, nx: r.nx, ny: r.ny });
    expect(Array.from(g.heights)).toEqual(Array.from(r.heightsCm));
    expect(Array.from(g.heights)).toEqual(Array.from(SAMPLE));
    expect(g.covered).toBe(7);
    expect(g.version).toBe(1);
  });

  it('round-trips a rasterised surface and short f32 corners', () => {
    const tris = [0, 0, 0, 2, 0, 1.2, 2, 2, 1.2, 0, 0, 0, 2, 2, 1.2, 0, 2, 0];
    const heightsCm = rasterGround(tris, { cell: 0.5, lo: [0, 0], nx: 4, ny: 4 });
    const g = decodeGround(writeGround({ cell: 0.5, lo: [12.3, -7.7], nx: 4, ny: 4, heightsCm }));
    expect([g.loX, g.loY]).toEqual([12.3, -7.7]);
    expect(Array.from(g.heights)).toEqual(Array.from(heightsCm));
  });

  it('reads a view at any offset and owns its raster', () => {
    const file = sampleFile();
    const padded = new Uint8Array(file.length + 3);
    padded.set(file, 3);
    const g = decodeGround(new Uint8Array(padded.buffer, 3, file.length));
    expect(Array.from(g.heights)).toEqual(Array.from(SAMPLE));
    padded.fill(0);
    expect(g.heights[0]).toBe(10);
    // An ArrayBuffer works too.
    expect(decodeGround(file.slice().buffer).nx).toBe(4);
  });

  it('refuses anything outside SN5G v1, naming the byte', () => {
    const bad = (edit: (b: Uint8Array, dv: DataView) => void, offset: number) => {
      const b = sampleFile().slice();
      edit(b, new DataView(b.buffer));
      let error: unknown = null;
      try { decodeGround(b); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(GroundFormatError);
      expect((error as GroundFormatError).offset).toBe(offset);
    };
    bad((b) => { b[3] = 0x57; }, 0); // SN5W, a walk grid
    bad((_, dv) => dv.setUint16(4, 2, true), 4);
    bad((_, dv) => dv.setUint16(6, 1, true), 6);
    bad((_, dv) => dv.setFloat32(8, 0, true), 8);
    bad((_, dv) => dv.setFloat32(8, Number.NaN, true), 8);
    bad((_, dv) => dv.setFloat32(12, Infinity, true), 12);
    bad((_, dv) => dv.setFloat32(16, Number.NaN, true), 16);
    bad((_, dv) => dv.setUint16(20, 0, true), 20);
    bad((_, dv) => dv.setUint16(22, 0, true), 22);
    bad((_, dv) => dv.setInt16(24, -1, true), 24);
    bad((b) => { b[27] = 1; }, 27);
    bad((b) => { b[31] = 1; }, 31);
    bad((_, dv) => dv.setUint16(20, 5, true), GROUND_HEADER_BYTES);
    expect(() => decodeGround(new Uint8Array(10))).toThrow(GroundFormatError);
    expect(() => decodeGround(sampleFile().subarray(0, 40))).toThrow(/needs 56/);
  });
});

describe('ground lookups', () => {
  const g = decodeGround(sampleFile());

  it('answers the sample of the cell a point lies in, in metres', () => {
    expect(groundAt(g, 10.25, -1.75)).toBe(0.1); // cell (0, 0) centre
    expect(groundAt(g, 10, -2)).toBe(0.1); // its corner belongs to it
    expect(groundAt(g, 10.5, -2)).toBe(0.2); // the next cell's corner
    expect(groundAt(g, 11.99, -1.51)).toBe(0.4);
    expect(groundAt(g, 11.9, -0.6)).toBe(3);
    expect(groundAt(g, 10.1, -0.9)).toBe(-0.05);
    expect(groundAt(g, 10.6, -0.6)).toBe(0);
  });

  it('answers null on nodata and off the grid', () => {
    expect(groundAt(g, 11.25, -1.75)).toBeNull(); // nodata
    expect(groundAt(g, 10.4, -1.25)).toBeNull(); // the nodata row
    expect(groundAt(g, 9.99, -1.75)).toBeNull();
    expect(groundAt(g, 12, -1.75)).toBeNull(); // the east edge is the next (missing) column
    expect(groundAt(g, 10.25, -0.5)).toBeNull();
    expect(groundAt(g, Number.NaN, 0)).toBeNull();
    expect(groundCell(g, 12, -1.75)).toBe(-1);
    expect(groundCell(g, 11.75, -0.75)).toBe(11);
  });

  it('falls back to the nearest covered cell within a reach, ties to the lower row then column', () => {
    const out = hit();
    // Own cell answers with distance 0 and the cell's centre.
    expect(nearestGround(g, 10.3, -1.8, 1, out)).toBe(true);
    expect(out).toEqual({ z: 0.1, x: 10.25, y: -1.75, distance: 0 });
    // (11.25, -1.75) is nodata: (10.75, -1.75) and (11.75, -1.75) are 0.5 m away; the lower column wins.
    expect(nearestGround(g, 11.25, -1.75, 1, out)).toBe(true);
    expect(out).toMatchObject({ z: 0.2, x: 10.75, y: -1.75, distance: 0.5 });
    // The nodata row's middle: (10.75, -1.25) is 0.5 from rows 0 and 2; row 0 wins.
    expect(nearestGround(g, 10.75, -1.25, 1, out)).toBe(true);
    expect(out).toMatchObject({ z: 0.2, y: -1.75 });
    expect(nearestGround(g, 11.25, -1.75, 0.4, out)).toBe(false);
    expect(nearestGround(g, 11.25, -1.75, 0, out)).toBe(false);
    // From off the grid, within reach.
    expect(nearestGround(g, 9.8, -1.75, 0.5, out)).toBe(true);
    expect(out.x).toBe(10.25);
  });
});

// ---- the real file -----------------------------------------------------------------------

const root = fileURLToPath(new URL('..', import.meta.url));
const packDir = join(root, 'public', 'estate', 'v1.2');
const packFile = existsSync(packDir) ? readdirSync(packDir).find((f) => /^pack\.[0-9a-f]{8}\.json$/.test(f)) : undefined;
const hasGround = packFile !== undefined
  && (JSON.parse(readFileSync(join(packDir, packFile), 'utf8')) as { classes: string[] }).classes.includes('ground');

describe.skipIf(!hasGround)('the pack’s ground file (public/estate/v1.2)', () => {
  it('decodes to the grid pack.json describes, the same as the tool’s reader, with plausible heights', () => {
    const pack = parsePack(JSON.parse(readFileSync(join(packDir, packFile as string), 'utf8')));
    const ref = pack.site!.ground!;
    const raw = gunzipSync(readFileSync(join(packDir, ref.path)));
    const g = decodeGround(raw);
    expect({ cell: g.cell, lo: [g.loX, g.loY], nx: g.nx, ny: g.ny }).toEqual({ cell: ref.cell, lo: ref.lo, nx: ref.nx, ny: ref.ny });
    expect(raw.byteLength).toBe(ref.rawBytes);
    expect(Array.from(g.heights)).toEqual(Array.from(readGround(raw).heightsCm));
    // The 400 m estate at 0.5 m, most of it covered, all of it between −2 m and +5 m.
    expect(g.nx * g.cell).toBeGreaterThanOrEqual(400);
    expect(g.covered / (g.nx * g.ny)).toBeGreaterThan(0.5);
    let lo = Infinity, hi = -Infinity;
    for (const v of g.heights) if (v !== GROUND_NODATA) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    expect(lo).toBeGreaterThanOrEqual(-200);
    expect(hi).toBeLessThanOrEqual(500);
    // Every bus stop stands on covered ground, at grade.
    const out = hit();
    for (const s of pack.site!.spawns ?? []) {
      expect(nearestGround(g, s.pos[0], s.pos[1], 1, out), s.name).toBe(true);
      expect(Math.abs(out.z - s.pos[2]), s.name).toBeLessThanOrEqual(0.5);
    }
    // Entrance spawns: covered ground within 3 m of each (the aprons are nodata; the L1 walk grid covers the rest).
    let near = 0;
    for (const b of pack.sites) for (const s of b.spawns) if (nearestGround(g, s.pos[0], s.pos[1], 3, out)) near += 1;
    expect(near).toBeGreaterThan(0);
  });
});
