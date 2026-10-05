import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ESTATE_SITE_IDS, normaliseStoreyTag } from '../lib/estate/ids';
import { ESTATE_PALETTE, paletteSlot } from '../lib/estate/palette';
import {
  ESTATE_PACK_CLASSES, ESTATE_PACK_EDITION, ESTATE_PACK_FRAME, ESTATE_PACK_SCHEMA, ESTATE_REPO, packPathProblem as schemaPathProblem, parsePack,
} from '../lib/estate/schema';
import { decodeWalk } from '../lib/estate/walk';
import { checkBudgets, checkPackDir, checkTokens, leakScanDir, loadBudgets } from '../scripts/estate/check.mjs';
import { gzipDeterministic, sha256, writeHashed } from '../scripts/estate/lib/files.mjs';
import { SITE_IDS } from '../scripts/estate/lib/inputs.mjs';
import { CLASS_ORDER, EDITION, FRAME, PACK_SCHEMA, REPO } from '../scripts/estate/lib/manifest.mjs';
import { slotOf } from '../scripts/estate/lib/palette.mjs';
import { featureEdges } from '../scripts/estate/lib/pure/edges.mjs';
import { openPoseYup, orientClosedSolids, surfaceErrorP90, transformPoint } from '../scripts/estate/lib/pure/geom.mjs';
import { expandRooms, packRooms, roomsProblem, templateName } from '../scripts/estate/lib/pure/navjson.mjs';
import { mergePanels, midPlanePanel, panelsNearSoup, pushPanel, triangleNearPanel } from '../scripts/estate/lib/pure/panels.mjs';
import { leakInPayload, packPathProblem } from '../scripts/estate/lib/pure/paths.mjs';
import { Soup } from '../scripts/estate/lib/pure/soup.mjs';
import { GROUND_NODATA, rasterGround, readGround, readWalkHeader, writeGround } from '../scripts/estate/lib/pure/sn5w.mjs';
import { bandIndex, canonicalTag, storeyList } from '../scripts/estate/lib/pure/storeys.mjs';
import { tagByChunks } from '../scripts/estate/lib/pure/tag.mjs';
import { countKeys, exactSplitProblem, soupKeys, splitTypical } from '../scripts/estate/lib/pure/trikeys.mjs';

// The pack tool's pure algorithms (plan §6.2; P2 in §10.2), on synthetic data.
// The tool runs under plain Node 24 without a TypeScript toolchain, so the few
// rules it shares with lib/estate are ported to import-free .mjs (decision
// recorded in docs/portfolio/estate-pack.md); this file imports both sides and
// proves they agree. Nothing here needs scripts/estate's own node_modules.

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const translate = (x: number, y: number, z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

// An axis-aligned box as 12 outward-wound triangles (glTF Y-up).
const pushBox = (soup: InstanceType<typeof Soup>, lo: number[], hi: number[], slot: number, storey = 0) => {
  const v = (i: number) => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
  for (const [a, b, c, d] of [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]) {
    soup.push(...v(a), ...v(b), ...v(c), slot, storey);
    soup.push(...v(a), ...v(c), ...v(d), slot, storey);
  }
};

describe('ports agree with lib/estate', () => {
  const paths = [
    '', 'f/BLK_509.0123abcd.glb.gz', 'poster/aerial-800.0123abcd.webp', '/abs.glb', 'C:/x.glb', 'c:x', 'a\\b', 'a/../b', '../a',
    'a/./b', './a', 'a//b', 'a/', 'a b', 'a/é', 'nav/NC_514.ffffffff.json', '.hidden', 'a/.b', '..', '.', 'x:y',
  ];
  it.each(paths)('packPathProblem(%j) matches schema.ts', (p) => {
    expect(packPathProblem(p)).toBe(schemaPathProblem(p));
  });

  const tags: unknown[] = ['L1', 'l5', 'L05', 'L005', 'L0005', 'L0', 'L99', 'L100', 'RF', 'rf', ' L5 ', 'B1', '5', 'L5a', 'roof', null, 5, 'L', ''];
  it.each(tags.map((t) => [t]))('canonicalTag(%j) matches normaliseStoreyTag', (t) => {
    expect(canonicalTag(t)).toBe(normaliseStoreyTag(t));
  });

  it('the pack writes the ids, schema, frame, repo and classes parsePack reads', () => {
    expect(SITE_IDS).toEqual([...ESTATE_SITE_IDS]);
    expect(PACK_SCHEMA).toBe(ESTATE_PACK_SCHEMA);
    expect(FRAME).toBe(ESTATE_PACK_FRAME);
    expect(REPO).toBe(ESTATE_REPO);
    expect(CLASS_ORDER).toEqual([...ESTATE_PACK_CLASSES]);
    expect(EDITION).toBe(ESTATE_PACK_EDITION);
  });

  it('slotOf matches paletteSlot for every material in both contexts', () => {
    for (const m of ESTATE_PALETTE.materials) {
      expect(slotOf(m.material)).toBe(paletteSlot(m.material));
      expect(slotOf(m.material, 'interior')).toBe(paletteSlot(m.material, 'interior'));
    }
    expect(() => slotOf('Unobtainium')).toThrow(/Unknown estate material/);
  });

  // A synthetic SN5W file, written from the plan's byte table (§5.2).
  const sn5w = (layers: Array<{ tag: string; ffl: number; mode: 0 | 1 | 2 }>, nx = 3, ny = 2, flags = 1) => {
    const cells = nx * ny;
    const rasters = layers.filter((l) => l.mode !== 2).length;
    const buf = new ArrayBuffer(64 + 32 * layers.length + rasters * cells * 2);
    const dv = new DataView(buf); const u8 = new Uint8Array(buf);
    u8.set([0x53, 0x4e, 0x35, 0x57], 0);
    dv.setUint16(4, 1, true); dv.setUint16(6, flags, true);
    dv.setFloat32(8, 0.1, true); dv.setFloat32(12, 0.2, true); dv.setFloat32(16, 0.4, true);
    dv.setFloat32(20, -63.4, true); dv.setFloat32(24, -3.3, true);
    dv.setUint16(28, nx, true); dv.setUint16(30, ny, true); dv.setUint16(32, layers.length, true); dv.setUint16(34, 0, true);
    let cursor = 64 + 32 * layers.length;
    layers.forEach((l, i) => {
      const at = 64 + 32 * i;
      for (let k = 0; k < l.tag.length; k += 1) u8[at + k] = l.tag.charCodeAt(k);
      dv.setFloat32(at + 4, l.ffl, true);
      u8[at + 8] = l.mode;
      if (l.mode !== 2) { dv.setUint32(at + 12, cursor, true); dv.setUint32(at + 16, cells * 2, true); cursor += cells * 2; }
    });
    return new Uint8Array(buf);
  };

  it('readWalkHeader reads what decodeWalk reads', () => {
    const bytes = sn5w([{ tag: 'L1', ffl: 0, mode: 0 }, { tag: 'L2', ffl: 3.6, mode: 1 }, { tag: 'RF', ffl: 6.4, mode: 2 }]);
    const ours = readWalkHeader(bytes);
    const theirs = decodeWalk(bytes);
    expect(ours.cell).toBe(theirs.header.cell);
    expect(ours.origin).toEqual([theirs.header.originX, theirs.header.originY]);
    expect([ours.nx, ours.ny, ours.refLayer, ours.coarse]).toEqual([theirs.header.nx, theirs.header.ny, theirs.header.refLayer, theirs.header.coarse]);
    expect(ours.layers.map((l: { tag: string; ffl: number; mode: string }) => [l.tag, l.ffl, l.mode])).toEqual(theirs.layers.map((l) => [l.tag, l.ffl, l.mode]));
    expect(ours.origin).toEqual([-63.4, -3.3]);
  });

  it('readWalkHeader refuses what decodeWalk refuses in the header', () => {
    const bad = sn5w([{ tag: 'L1', ffl: 0, mode: 0 }]);
    bad[0] = 0x58;
    expect(() => readWalkHeader(bad)).toThrow(/magic/);
    expect(() => decodeWalk(bad)).toThrow();
    const reserved = sn5w([{ tag: 'L1', ffl: 0, mode: 0 }]);
    reserved[40] = 1;
    expect(() => readWalkHeader(reserved)).toThrow(/reserved/);
    expect(() => decodeWalk(reserved)).toThrow();
  });
});

describe('storey bands', () => {
  const ffls = [0, 3.6, 6.4, 9.2];
  it('owns [FFL − 0.25, next FFL − 0.25), the bottom everything below and the top everything above', () => {
    expect(bandIndex(ffls, -5)).toBe(0);
    expect(bandIndex(ffls, 3.35)).toBe(1); // exactly FFL_1 − 0.25 belongs to storey 1
    expect(bandIndex(ffls, 3.3499999)).toBe(0); // a hair lower to storey 0
    expect(bandIndex(ffls, 6.15)).toBe(2);
    expect(bandIndex(ffls, 400)).toBe(3);
  });
  it('reads upstream storeys bottom-up and refuses padded or non-rising tags', () => {
    expect(storeyList({ RF: 6.4, L1: 0, L2: 3.6 }).map((s: { tag: string }) => s.tag)).toEqual(['L1', 'L2', 'RF']);
    expect(() => storeyList({ L01: 0, RF: 3 })).toThrow(/canonical/);
    expect(() => storeyList({ L1: 0, L2: 0, RF: 3 })).toThrow(/rise/);
  });
});

describe('interior split (step 6d)', () => {
  // Storey s: a shared slab and wall (T), one storey-specific box (R), at FFL_s.
  const ffls = [0, 3.6, 6.4, 9.2, 12, 14.8];
  const storey = (s: number, extra = true) => {
    const soup = new Soup(64);
    const y = ffls[s];
    pushBox(soup, [0, y - 0.2, 0], [10, y, 8], 4, s);
    pushBox(soup, [0, y, 0], [0.2, y + 2.6, 8], 0, s);
    pushBox(soup, [5, y, 3], [6, y + 1, 4], 6, s);
    if (extra) pushBox(soup, [2 + s * 0.5, y, 1], [2.4 + s * 0.5, y + 1, 1.4], 7, s);
    return soup;
  };

  it('T + R_s reproduces every typical storey exactly, keyed to its own floor', () => {
    const soups = [1, 2, 3, 4].map((s) => storey(s));
    const split = splitTypical(soups.map((soup, k) => ({ index: k + 1, keys: soupKeys(soup, ffls[k + 1]) })), 0.7);
    expect(split.typical).toEqual([1, 2, 3, 4]);
    expect(countKeys([...split.tKeys.keys()]).size).toBe(36);
    const t = soups[0].pick(split.tPick, -ffls[1]);
    for (const [k, s] of [1, 2, 3, 4].entries()) {
      const r = soups[k].pick(split.residual.get(s));
      expect(r.count).toBe(12);
      expect(exactSplitProblem(soupKeys(t, 0), soupKeys(r, ffls[s]), soupKeys(soups[k], ffls[s]))).toBeNull();
    }
  });

  it('the hard check notices a single moved vertex', () => {
    const a = storey(1); const b = storey(1);
    b.pos[0] += 0.002;
    expect(exactSplitProblem(soupKeys(a, ffls[1]), [], soupKeys(b, ffls[1]))).toMatch(/key/);
  });

  it('a storey sharing less than the threshold becomes special', () => {
    const odd = new Soup(64);
    pushBox(odd, [0, ffls[3] - 0.2, 0], [10, ffls[3], 8], 4, 3);
    for (let i = 0; i < 6; i += 1) pushBox(odd, [i, ffls[3], 6], [i + 0.5, ffls[3] + 1, 7], 6, 3);
    const soups = [storey(1), storey(2), odd, storey(4)];
    const split = splitTypical(soups.map((soup, k) => ({ index: k + 1, keys: soupKeys(soup, ffls[k + 1]) })), 0.7);
    expect(split.typical).toEqual([1, 2, 4]);
    for (const s of split.typical) expect(split.shares.get(s)).toBeGreaterThanOrEqual(0.7);
  });

  it('one storey on its own is not typical', () => {
    const split = splitTypical([{ index: 1, keys: soupKeys(storey(1), ffls[1]) }], 0.93);
    expect(split.typical).toEqual([]);
  });
});

describe('façade storey tags (step 6b)', () => {
  it('takes an exact chunk match first, then the z-min band', () => {
    const ffls = [0, 3.6, 6.4];
    const chunk1 = new Soup(16);
    pushBox(chunk1, [0, 3.4, 0], [10, 3.6, 8], 4, 1); // L2's slab, from 3.4: its z-min band is L2's
    const chunk0 = new Soup(16);
    pushBox(chunk0, [0, 3.0, 0], [10, 3.3, 8], 4, 0); // a parapet of L1 reaching below L2's band
    const f = new Soup(64);
    pushBox(f, [0, 3.0, 0], [10, 3.3, 8], 4); // matches chunk0 exactly → L1, z-min band also L1
    pushBox(f, [0, 3.4, 0], [10, 3.6, 8], 4); // matches chunk1 exactly → L2
    pushBox(f, [20, 6.3, 0], [21, 7, 1], 0); // matches nothing → band of z-min 6.3 → RF (index 2)
    const counts = [countKeys(soupKeys(chunk0, 0)), countKeys(soupKeys(chunk1, 3.6)), new Map()];
    const out = tagByChunks(f, ffls, counts);
    expect(out).toEqual({ exactMatched: 24, banded: 12 });
    expect([...f.storey.subarray(0, 12)].every((s) => s === 0)).toBe(true);
    expect([...f.storey.subarray(12, 24)].every((s) => s === 1)).toBe(true);
    expect([...f.storey.subarray(24, 36)].every((s) => s === 2)).toBe(true);
  });
});

describe('panels (step 6b)', () => {
  it('a window panel lies on the glass mid-plane and spans the pane', () => {
    // A 1.2 × 1.3 m pane, 6 mm thick along z, placed at (10, 3, −5).
    const p = midPlanePanel([0, 0, 0.02], [1.2, 1.3, 0.026], translate(10, 3, -5));
    expect(p.thickness).toBeCloseTo(0.006, 9);
    expect(p.origin[2]).toBeCloseTo(-5 + 0.023, 9);
    expect([p.w, p.h].map((v: number) => Number(v.toFixed(9))).sort()).toEqual([1.2, 1.3]);
    expect(Math.abs(p.n[2])).toBeCloseTo(1, 12);
  });

  it('a door panel sits inside the leaf solid, half a leaf from both faces', () => {
    const leaf: [number[], number[]] = [[0, 0, -0.035], [0.95, 2.05, 0]];
    const panel = midPlanePanel(leaf[0], leaf[1], IDENTITY);
    const faces = new Soup(12);
    pushBox(faces, leaf[0], leaf[1], 8);
    expect(panelsNearSoup([panel], faces)).toEqual([]);
    const soup = new Soup(2);
    pushPanel(soup, panel, 8, 0);
    expect(soup.pos[2]).toBeCloseTo(-0.0175, 12);
  });

  it('flags a parallel D face within 2 mm that overlaps the panel, not one that only touches its edge', () => {
    const panel = midPlanePanel([0, 0, 0], [1, 2, 0.004], IDENTITY); // mid-plane z = 0.002
    const near = [[0.2, 0.2, 0.0035], [0.8, 0.2, 0.0035], [0.5, 1.5, 0.0035]];
    const far = [[0.2, 0.2, 0.01], [0.8, 0.2, 0.01], [0.5, 1.5, 0.01]];
    const touching = [[1, 0, 0.002], [2, 0, 0.002], [1.5, 1, 0.002]];
    const across = [[0.2, 0.2, 0], [0.2, 0.2, 1], [0.2, 1, 0]];
    expect(triangleNearPanel(panel, near)).toBe(true);
    expect(triangleNearPanel(panel, far)).toBe(false);
    expect(triangleNearPanel(panel, touching)).toBe(false);
    expect(triangleNearPanel(panel, across)).toBe(false);
  });

  it('merges a double leaf into one panel', () => {
    const l = midPlanePanel([0, 0, 0], [0.45, 2, 0.04], IDENTITY);
    const r = midPlanePanel([0.45, 0, 0], [0.9, 2, 0.04], IDENTITY);
    const m = mergePanels([l, r]);
    expect([m.w, m.h].map((v: number) => Number(v.toFixed(9))).sort()).toEqual([0.9, 2]);
  });
});

describe('geometry steps', () => {
  it('opens a leaf with the exported Z-up pose, converted to glTF Y-up', () => {
    // 90° about block-local +Z (Z up) at the hinge (1, 2, 0).
    const pose = [0, -1, 0, 1 + 2, 1, 0, 0, 2 - 1, 0, 0, 1, 0];
    const m = openPoseYup(pose);
    // The Z-up point (2, 2, 0.5) (1 m along +x from the hinge) → (1, 3, 0.5); in glTF (x, z, −y).
    const p = transformPoint(m, 2, 0.5, -2);
    expect(p.map((v: number) => Number(v.toFixed(12)))).toEqual([1, 0.5, -3]);
  });

  it('flips an inside-out closed solid and leaves a correct one alone', () => {
    const soup = new Soup(24);
    pushBox(soup, [0, 0, 0], [1, 1, 1], 0);
    pushBox(soup, [3, 0, 0], [4, 1, 1], 0);
    for (let t = 12; t < 24; t += 1) soup.flip(t);
    expect(orientClosedSolids(soup)).toMatchObject({ closed: 2, flipped: 1, flippedTris: 12 });
    expect(orientClosedSolids(soup)).toMatchObject({ closed: 2, flipped: 0 });
  });

  it('edge lines keep folds of 60° or more, at least 0.5 m long, and drop flat seams', () => {
    const soup = new Soup(12);
    pushBox(soup, [0, 0, 0], [2, 1, 0.4], 0, 3);
    const edges = featureEdges(soup);
    // 12 box edges; the 0.4 m ones are too short; the diagonals are flat seams.
    expect(edges.length).toBe(8);
    expect(edges.every((e: { storey: number; length: number }) => e.storey === 3 && e.length >= 0.5)).toBe(true);
    expect(featureEdges(soup, { max: 3 }).length).toBe(3);
  });

  it('measures the massing error as the 0.9 quantile of distances to the massing surface', () => {
    const massing = new Soup(12);
    pushBox(massing, [0, 0, 0], [10, 10, 10], 0);
    const pts = Float64Array.from([5, 5, 10, 5, 5, 11, 5, 5, 12, 5, 5, 13, 5, 5, 14, 5, 5, 15, 5, 5, 16, 5, 5, 17, 5, 5, 18, 5, 5, 19]);
    expect(surfaceErrorP90(pts, massing.pos.subarray(0, massing.count * 9))).toBeCloseTo(8, 9);
  });

  it('rasterises the top ground height at cell centres, in centimetres', () => {
    // A ramp rising 1.2 m over x ∈ [0, 2], and a raised step above it east of x − 1 = y / 2.
    const tris = [0, 0, 0, 2, 0, 1.2, 2, 2, 1.2, 0, 0, 0, 2, 2, 1.2, 0, 2, 0, 1, 0, 1.5, 2, 0, 1.5, 2, 2, 1.5];
    const h = rasterGround(tris, { cell: 0.5, lo: [0, 0], nx: 4, ny: 4 });
    expect(Array.from(h.slice(0, 4))).toEqual([15, 45, 150, 150]);
    const empty = rasterGround([], { cell: 0.5, lo: [0, 0], nx: 2, ny: 1 });
    expect(Array.from(empty)).toEqual([GROUND_NODATA, GROUND_NODATA]);
    const file = writeGround({ cell: 0.5, lo: [10, -2], nx: 4, ny: 4, heightsCm: h });
    expect(String.fromCharCode(...file.subarray(0, 4))).toBe('SN5G');
    expect(readGround(file)).toMatchObject({ cell: 0.5, lo: [10, -2], nx: 4, ny: 4 });
  });
});

describe('nav rooms (step 11)', () => {
  const room = (n: number, name: string) => ({ name, label: 'Kitchen', flat: `#${String(n).padStart(2, '0')}-101`, poly: [[0, 0], [1, 0], [1, 1]] });
  it('stores a typical storey once with {S}/{SS} templates and expands back exactly', () => {
    const byStorey = [2, 3, 4].map((n) => ({ tag: `L${n}`, rooms: [room(n, `#${String(n).padStart(2, '0')}-101 K`), room(n, `L${n}-CORR`)] }));
    byStorey.push({ tag: 'RF', rooms: [{ name: 'RF-DECK', label: 'Roof deck', poly: [[0, 0], [2, 0], [2, 2]] }] as never });
    // tsc types the .mjs from its initialisers (typical: null), so loosen it here.
    const packed: any = packRooms(byStorey);
    expect(packed.typical.storeys).toEqual(['L2', 'L3', 'L4']);
    expect(packed.typical.rooms.map((r: { name: string }) => r.name).sort()).toEqual(['#{SS}-101 K', 'L{S}-CORR']);
    expect(roomsProblem(packed, byStorey)).toBeNull();
    expect((expandRooms(packed) as Record<string, Array<{ name: string }>>).L3.map((r: { name: string }) => r.name).sort()).toEqual(['#03-101 K', 'L3-CORR']);
    expect(templateName('L12-STAIR1', 1)).toBe('L12-STAIR1'); // L1 inside L12 is not L1
  });
});

describe('content-hashed files (step 10)', () => {
  it('names a file by its raw payload and writes gzip with mtime 0 and OS 0xff', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'estate-files-'));
    try {
      const raw = Buffer.from('glTF payload'.repeat(100));
      const ref = writeHashed(dir, 'f/BLK_509', 'glb.gz', raw, { gzip: true });
      expect(ref.sha256).toBe(sha256(raw));
      expect(ref.path).toBe(`f/BLK_509.${sha256(raw).slice(0, 8)}.glb.gz`);
      const stored = readFileSync(path.join(dir, ref.path));
      expect(stored.subarray(0, 3)).toEqual(Buffer.from([0x1f, 0x8b, 8]));
      expect(stored.readUInt32LE(4)).toBe(0);
      expect(stored[9]).toBe(0xff);
      expect(gunzipSync(stored)).toEqual(raw);
      // Another zlib's bytes for the same payload would not change the name.
      expect(sha256(gzipSync(raw, { level: 1 }))).not.toBe(ref.gzSha256);
      expect(writeHashed(dir, 'f/BLK_509', 'glb.gz', raw, { gzip: true }).path).toBe(ref.path);
      expect(gzipDeterministic(raw).equals(stored)).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('leak scan (step 15)', () => {
  it('finds a drive path in text, the home-folder literals in binary, and refuses an unparseable GLB', () => {
    expect(leakInPayload(Buffer.from('{"file":"C:\\\\x"}'), 'text')).not.toBeNull();
    expect(leakInPayload(Buffer.from('{"file":"C:\\x"}'), 'text')?.match).toBe('C:\\');
    expect(leakInPayload(Buffer.from([0, 0x43, 0x3a, 0x5c, 0]), 'binary')).toBeNull(); // chance bytes in geometry
    expect(leakInPayload(Buffer.from('\0\0/Users/x\0'), 'binary')?.match).toBe('/Users/');
    expect(leakInPayload(Buffer.from('not a glb, rapiular'), 'glb')).not.toBeNull();
    expect(leakInPayload(Buffer.from('glTF but broken'), 'glb')).not.toBeNull();
  });

  it('scans every file in a folder, gunzipping .gz', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'estate-leak-'));
    try {
      writeFileSync(path.join(dir, 'clean.json'), '{"a":1}');
      writeFileSync(path.join(dir, 'x.walk.gz'), gzipDeterministic(Buffer.from('SN5W\\Users\\me')));
      const hits = leakScanDir(dir);
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatch(/^x\.walk\.gz/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('every palette token is defined in index.css', () => {
    const css = readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');
    expect(checkTokens(JSON.parse(readFileSync(path.join(__dirname, '..', 'lib', 'estate', 'palette.json'), 'utf8')), css)).toEqual([]);
  });
});

describe('budgets', () => {
  it('flags a file over its cap and a façade over its triangle cap', () => {
    const budgets = loadBudgets();
    const f = { path: 'f/BLK_509.00000000.glb.gz', bytes: 300001, rawBytes: 1, sha256: '0'.repeat(64), gzSha256: '0'.repeat(64), tris: 60001, verts: 1, prims: 4, draws: 4, maxPrimVerts: 70000 };
    const { problems } = checkBudgets({ posters: [], sites: [{ id: 'BLK_509', storeys: [], facade: f }] }, budgets, 100, 50);
    expect(problems.join('\n')).toMatch(/per-file cap 300000/);
    expect(problems.join('\n')).toMatch(/60001 triangles > 60000/);
    expect(problems.join('\n')).toMatch(/4 draws > 3/);
    expect(problems.join('\n')).toMatch(/70000 vertices/);
  });
});

// A pack built by `npm run estate:pack` (a dev pack included) must pass the
// runtime's own gate and the no-dependency checker. Set ESTATE_PACK_DIR to it.
const packDir = process.env.ESTATE_PACK_DIR ? path.resolve(process.env.ESTATE_PACK_DIR) : null;
describe.skipIf(!packDir || !existsSync(packDir))('a built pack (ESTATE_PACK_DIR)', () => {
  it('parses with parsePack and passes check.mjs', () => {
    const { problems, pack } = checkPackDir(packDir!, { allowed: ['catalogue.generated.ts', 'report.json'] });
    expect(problems).toEqual([]);
    const parsed = parsePack(pack);
    expect(parsed.sites.map((s) => s.id)).toEqual([...ESTATE_SITE_IDS]);
    for (const s of parsed.sites) {
      if (!s.interior) continue;
      for (const st of s.storeys) expect(s.interior.drawnTris[st.tag]).toBe(s.interior.sourceTris[st.tag]);
    }
  });
});
