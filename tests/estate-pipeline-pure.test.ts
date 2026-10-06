import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ESTATE_SITE_IDS, ESTATE_SITE_STOREYS, ESTATE_STOREY_FFL, normaliseStoreyTag } from '../lib/estate/ids';
import { ESTATE_PALETTE, paletteSlot } from '../lib/estate/palette';
import {
  ESTATE_PACK_CLASSES, ESTATE_PACK_EDITION, ESTATE_PACK_FRAME, ESTATE_PACK_SCHEMA, ESTATE_REPO, packPathProblem as schemaPathProblem, parsePack,
} from '../lib/estate/schema';
import { PEEK_K, TIER_BAND_K, inRange, siteStoreyTable, storeyBand } from '../lib/estate/storeys';
import { ESTATE_TIERS } from '../lib/estate/tiers';
import { decodeWalk } from '../lib/estate/walk';
import { checkBudgets, checkPackDir, checkTokens, leakScanDir, loadBudgets } from '../scripts/estate/check.mjs';
import { gzipDeterministic, sha256, writeHashed } from '../scripts/estate/lib/files.mjs';
import { SITE_IDS } from '../scripts/estate/lib/inputs.mjs';
import { CLASS_ORDER, EDITION, FRAME, PACK_SCHEMA, REPO } from '../scripts/estate/lib/manifest.mjs';
import { slotOf } from '../scripts/estate/lib/palette.mjs';
import { featureEdges } from '../scripts/estate/lib/pure/edges.mjs';
import { openPoseYup, orientClosedSolids, surfaceErrorP90, transformPoint } from '../scripts/estate/lib/pure/geom.mjs';
import { doorsProblem, expandDoors, expandRooms, navDoor, packDoors, packRooms, roomsProblem, templateName } from '../scripts/estate/lib/pure/navjson.mjs';
import { mergePanels, midPlanePanel, openingPanel, panelsNearSoup, pushPanel, triangleNearPanel } from '../scripts/estate/lib/pure/panels.mjs';
import { coplanarPairs, matchMap, matchWithin, pairCoplanar, quantisationZFights } from '../scripts/estate/lib/pure/quantcheck.mjs';
import { leakInPayload, packPathProblem } from '../scripts/estate/lib/pure/paths.mjs';
import { Soup } from '../scripts/estate/lib/pure/soup.mjs';
import { GROUND_NODATA, rasterGround, readGround, readWalkHeader, writeGround } from '../scripts/estate/lib/pure/sn5w.mjs';
import { bandIndex, canonicalTag, storeyList } from '../scripts/estate/lib/pure/storeys.mjs';
import { majorityOwner, maskCoverage, searchOrder, tagByChunks } from '../scripts/estate/lib/pure/tag.mjs';
import { FAR_TREE_TRIS, farTreeSoup } from '../scripts/estate/lib/pure/trees.mjs';
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
    expect(out).toMatchObject({ exactMatched: 24, banded: 12, offBand: 0 });
    expect([...out.owner]).toEqual([...Array(12).fill(0), ...Array(12).fill(1), ...Array(12).fill(-1)]);
    expect([...f.storey.subarray(0, 12)].every((s) => s === 0)).toBe(true);
    expect([...f.storey.subarray(12, 24)].every((s) => s === 1)).toBe(true);
    expect([...f.storey.subarray(24, 36)].every((s) => s === 2)).toBe(true);
  });

  it('searches every storey nearest the band first, so a double-height hall roof keeps the storey whose chunk holds it', () => {
    expect(searchOrder(2, 5)).toEqual([2, 1, 3, 0, 4]);
    expect(searchOrder(0, 3)).toEqual([0, 1, 2]);
    // NC_514: L1 0, L2 4.2, RF 8.2. The hall's roof deck at 8.0–8.25 lies in RF's band but
    // only L1's chunk holds it (the hall is double height); it was tagged RF before.
    const ffls = [0, 4.2, 8.2];
    const chunk0 = new Soup(12);
    pushBox(chunk0, [0, 8.0, 0], [6, 8.25, 4], 27, 0);
    const f = new Soup(12);
    pushBox(f, [0, 8.0, 0], [6, 8.25, 4], 27);
    const out = tagByChunks(f, ffls, [countKeys(soupKeys(chunk0, 0)), new Map(), new Map()]);
    expect(out).toMatchObject({ exactMatched: 12, banded: 0, offBand: 12 });
    expect([...f.storey.subarray(0, 12)].every((s) => s === 0)).toBe(true);
    // Standing on the roof (band L2–RF) F draws it; under it (band L1–L2) the interior does.
    const both = (tags: number[]) => maskCoverage(out.owner, Int16Array.from(tags), 3, [1, 2]);
    expect(both([...f.storey.subarray(0, 12)])).toMatchObject({ bands: 6, holes: 0, doubles: 0 });
    // Tagged RF by its height, it vanishes from the roof (S = RF, k = 1) and is drawn twice from L1 (k = 1).
    expect(both(Array(12).fill(2))).toMatchObject({ holes: 12, doubles: 12 });
  });

  // BLK 509's stair cores as upstream exports them (measured on the v1.2 candidate
  // rc2): an IfcStair and its railing sit in the storey they rise from, so the top
  // riser (11.8–12.0 m for the L4→L5 flight; L5's FFL is 12.0) and the landing
  // guard at L5 (11.775–13.0) are L4's, though they stand in L5's band. The LOD1
  // shell (F) carries the same triangles, so the chunk match tags them L4.
  const core509 = () => {
    const ffls = ESTATE_STOREY_FFL.BLK_509;
    const chunks = ffls.map(() => new Soup(64));
    const f = new Soup(1024);
    ffls.forEach((ffl, s) => {
      const parts: Array<[number[], number[], number]> = [[[0, ffl - 0.2, 0], [2.6, ffl, 5.4], 4]]; // the floor landing
      if (s + 1 < ffls.length) {
        const next = ffls[s + 1];
        parts.push([[0.2, next - 0.2, 0.2], [1.4, next, 0.48], 6]); // the top riser, in the next storey's band
        parts.push([[1.4, next - 0.225, 0], [1.45, next + 1.0, 5.4], 7]); // the landing guard rail
      }
      for (const [lo, hi, slot] of parts) { pushBox(chunks[s], lo, hi, slot, s); pushBox(f, lo, hi, slot); }
    });
    const out = tagByChunks(f, ffls, chunks.map((c, s) => countKeys(soupKeys(c, ffls[s]))));
    return { ffls, f, out };
  };

  it("keeps a stair's riser and handrail with the storey whose chunk holds them, though they stand in the next storey's band", () => {
    const { ffls, f, out } = core509();
    expect(out).toMatchObject({ exactMatched: f.count, banded: 0, offBand: (ffls.length - 1) * 24 });
    const L4 = ESTATE_SITE_STOREYS.BLK_509.indexOf('L4');
    // L4's guard rail (11.775–13.0 m) lies wholly in L5's band; its tag is L4.
    const rail = Array.from({ length: f.count }, (_, i) => i).filter((i) => f.slot[i] === 7 && f.minY(i) > 11.77 && f.minY(i) < 13.01);
    expect(rail).toHaveLength(12);
    for (const i of rail) { expect(bandIndex(ffls, f.minY(i))).toBe(L4 + 1); expect(f.storey[i]).toBe(L4); }
  });

  it("is the only rule under which the façade mask draws every surface once, at every storey and every tier's k (the per-triangle storey-band check)", () => {
    const { ffls, f, out } = core509();
    const n = ffls.length;
    const ks = [...new Set([PEEK_K, ...ESTATE_TIERS.map((t) => TIER_BAND_K[t])])].sort((x, y) => x - y);
    expect(maskCoverage(out.owner, Int16Array.from(f.storey.subarray(0, f.count)), n, ks)).toEqual({ bands: n * ks.length, holes: 0, doubles: 0, opened: 0, first: null });
    // The height rule: the riser and the rail are drawn twice under a band's
    // ceiling (the interior draws the top storey's chunk, F their storey above)
    // and vanish at its bottom (F hides them with the bottom storey, whose chunk
    // does not hold them): 24 of each at every band clear of the building's ends.
    const byHeight = Int16Array.from({ length: f.count }, (_, i) => bandIndex(ffls, f.minY(i)));
    const bad = maskCoverage(out.owner, byHeight, n, ks);
    const { surface, hi } = bad.first!;
    expect([f.slot[surface], byHeight[surface], out.owner[surface]]).toEqual([6, hi + 1, hi]);
    const L5 = ESTATE_SITE_STOREYS.BLK_509.indexOf('L5');
    // The band k = 1 around L5 (L4–L6): L3's riser and rail hidden, L6's doubled.
    const band = storeyBand(siteStoreyTable('BLK_509'), L5, 1);
    let holes = 0; let doubles = 0;
    for (let j = 0; j < f.count; j += 1) {
      const drawn = (inRange(band, out.owner[j]) ? 1 : 0) + (inRange(band, byHeight[j]) ? 0 : 1);
      if (drawn === 0) holes += 1; else if (drawn === 2) doubles += 1;
    }
    expect([holes, doubles]).toEqual([24, 24]);
    expect([bad.holes, bad.doubles].every((x) => x > 0)).toBe(true);
  });

  it('bands the mask as lib/estate/storeys.ts does, on every building and k', () => {
    for (const id of ESTATE_SITE_IDS) {
      const table = siteStoreyTable(id);
      const n = table.ffl.length;
      for (const k of [1, 2, 3]) {
        // One surface per (owner, tag) pair, and the faults storeyBand gives for them.
        const owner: number[] = []; const tag: number[] = [];
        let holes = 0; let doubles = 0;
        for (let o = 0; o < n; o += 1) for (let t = 0; t < n; t += 1) {
          owner.push(o); tag.push(t);
          for (let S = 0; S < n; S += 1) {
            const band = storeyBand(table, S, k);
            const drawn = (inRange(band, o) ? 1 : 0) + (inRange(band, t) ? 0 : 1);
            if (drawn === 0) holes += 1; else if (drawn === 2) doubles += 1;
          }
        }
        const got = maskCoverage(Int16Array.from(owner), Int16Array.from(tag), n, [k]);
        expect([got.bands, got.holes, got.doubles], `${id} k${k}`).toEqual([n, holes, doubles]);
      }
    }
  });

  it('counts what no chunk holds as the opening the mask makes, never as a fault', () => {
    // An exterior fin tagged L2 by its height: hidden whenever L2 is in the band, and nothing else draws it.
    expect(maskCoverage(Int16Array.from([-1]), Int16Array.from([1]), 3, [1])).toEqual({ bands: 3, holes: 0, doubles: 0, opened: 3, first: null });
  });

  it('gives an opening the storey of the chunk holding most of its kit, the lower on a tie, or none', () => {
    const ffls = [0, 3.6, 6.4];
    const kit = new Soup(24);
    pushBox(kit, [0, 4.5, 0], [0.05, 5.8, 0.08], 12); // one jamb
    pushBox(kit, [1.15, 4.5, 0], [1.2, 5.8, 0.08], 12); // the other
    const held = (from: number, to: number, ffl: number) => { const s = new Soup(12); for (let i = from; i < to; i += 1) s.pushFrom(kit, i); return countKeys(soupKeys(s, ffl)); };
    expect(majorityOwner(kit, ffls, [new Map(), held(0, 24, 3.6), held(12, 24, 6.4)])).toBe(1); // 24 to 12
    expect(majorityOwner(kit, ffls, [new Map(), held(0, 12, 3.6), held(12, 24, 6.4)])).toBe(1); // 12 each: the lower
    expect(majorityOwner(kit, ffls, [new Map(), new Map(), new Map()])).toBe(-1);
  });
});

describe('the far tree (step 6e)', () => {
  // Tembusu's boxes in SITE_lod0 (glTF Y-up, y = 0 at the foot): the crown starts
  // 4.28 m up, the trunk is 0.5 m square and 5 m tall.
  const foliage: [number[], number[]] = [[-2.4, 4.28, -2.4], [2.4, 9.08, 2.4]];
  const bark: [number[], number[]] = [[-0.25, 0, -0.25], [0.25, 5, 0.25]];
  const tree = farTreeSoup(foliage, bark, 20, 19);
  const normal = (i: number) => {
    const p = tree.pos; const o = i * 9;
    const u = [p[o + 3] - p[o], p[o + 4] - p[o + 1], p[o + 5] - p[o + 2]];
    const v = [p[o + 6] - p[o], p[o + 7] - p[o + 1], p[o + 8] - p[o + 2]];
    return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  };
  const centroid = (i: number) => [0, 1, 2].map((k) => (tree.pos[i * 9 + k] + tree.pos[i * 9 + 3 + k] + tree.pos[i * 9 + 6 + k]) / 3);

  it('is a crown on a trunk stub in 12 triangles, inside the 8–12 budget', () => {
    expect(FAR_TREE_TRIS).toBe(12);
    expect(tree.count).toBe(12);
    expect([...tree.slot.subarray(0, 12)]).toEqual([...Array(8).fill(20), ...Array(4).fill(19)]);
    expect(tree.bounds()).toEqual([[-2.4, 0, -2.4], [2.4, 9.08, 2.4]]);
  });

  it('faces out everywhere: the crown from its centre, the stub from its axis', () => {
    const mid = (4.28 + 9.08) / 2;
    for (let i = 0; i < 12; i += 1) {
      const n = normal(i); const c = centroid(i);
      const out = i < 8 ? [c[0], c[1] - mid, c[2]] : [c[0], 0, c[2]];
      expect(n[0] * out[0] + n[1] * out[1] + n[2] * out[2], `triangle ${i}`).toBeGreaterThan(0);
    }
  });

  it('stands on the ground and runs up into the crown through its lower tip, so it no longer floats', () => {
    const p = tree.pos;
    const stub = Array.from({ length: 12 }, (_, k) => p[8 * 9 + k * 3 + 1]);
    expect(Math.min(...stub)).toBe(0);
    expect(Math.max(...stub)).toBe(5);
    // At the stub's top the crown is 2.4 × (5 − 4.28) / 2.4 = 0.72 m wide either side of the axis: the tip is inside.
    const halfWidthAt = (y: number) => 2.4 * (y - foliage[0][1]) / ((foliage[1][1] - foliage[0][1]) / 2);
    expect(halfWidthAt(5)).toBeCloseTo(0.72, 12);
    // And the crown's lower tip sits on the stub's axis.
    expect([p[2 * 9 + 3], p[2 * 9 + 4], p[2 * 9 + 5]]).toEqual([0, 4.28, 0]);
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

  it('a window panel spans the opening (the whole window), on the glass mid-plane', () => {
    // A 1.0 × 1.3 m window kit: frames around a 0.88 × 1.18 m pane, 6 mm thick at z 0.04.
    const glass: [number[], number[]] = [[0.06, 0.06, 0.037], [0.94, 1.24, 0.043]];
    const whole: [number[], number[]] = [[0, 0, 0], [1, 1.3, 0.08]];
    const p = openingPanel(glass, whole, IDENTITY);
    expect(p.origin[2]).toBeCloseTo(0.04, 12);
    expect([p.w, p.h].map((v: number) => Number(v.toFixed(9))).sort()).toEqual([1, 1.3]);
  });

  it('a double-sided panel is the same rectangle facing both ways', () => {
    const panel = midPlanePanel([0, 0, 0], [1, 2, 0.04], IDENTITY);
    const soup = new Soup(4);
    expect(pushPanel(soup, panel, 8, 0, { doubleSided: true })).toBe(4);
    const nz = (t: number) => { const q = soup.pos; const o = t * 9; return (q[o + 3] - q[o]) * (q[o + 7] - q[o + 1]) - (q[o + 4] - q[o + 1]) * (q[o + 6] - q[o]); };
    expect(Math.sign(nz(0))).toBe(Math.sign(nz(1)));
    expect(Math.sign(nz(2))).toBe(-Math.sign(nz(0)));
    expect(Math.sign(nz(3))).toBe(-Math.sign(nz(0)));
    expect(pushPanel(new Soup(2), panel, 8)).toBe(2);
  });

  it('a double-sided panel can face back in another slot: a window is façade glass outside and interior glass inside', () => {
    const panel = midPlanePanel([0, 0, 0], [1.2, 1.3, 0.006], IDENTITY);
    const soup = new Soup(4);
    expect(pushPanel(soup, panel, slotOf('Glass'), 3, { doubleSided: true, backSlot: slotOf('Glass', 'interior') })).toBe(4);
    expect([...soup.slot.subarray(0, 4)]).toEqual([11, 11, 29, 29]);
    expect([...soup.storey.subarray(0, 4)]).toEqual([3, 3, 3, 3]);
    // The same four corners both ways.
    expect(soup.pos.subarray(18, 27)).toEqual(Float64Array.from([...soup.pos.subarray(0, 3), ...soup.pos.subarray(6, 9), ...soup.pos.subarray(3, 6)]));
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
    // The cap never splits a length class: four 2 m edges, then four 1 m edges.
    expect(featureEdges(soup, { max: 3 }).length).toBe(0);
    expect(featureEdges(soup, { max: 4 }).length).toBe(4);
    expect(featureEdges(soup, { max: 7 }).length).toBe(4);
    expect(featureEdges(soup, { max: 8 }).length).toBe(8);
  });

  it('identical storeys keep identical edge lines under the cap', () => {
    // Four identical "storeys" of a 2 × 1 m slab, 0.3 m thick, one above the other.
    const soup = new Soup(48);
    for (let s = 0; s < 4; s += 1) pushBox(soup, [0, s * 3, 0], [2, s * 3 + 0.3, 1], 0, s);
    const edges = featureEdges(soup, { max: 10 });
    const per = [0, 1, 2, 3].map((s) => edges.filter((e: { storey: number }) => e.storey === s).length);
    expect(new Set(per).size).toBe(1);
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

describe('quantisation checks (steps 8–9, on decoded geometry)', () => {
  // A 4 × 4 m slab top (slot 1) and a 1 m road marking 5 mm above it (slot 2).
  const scene = (markY: number) => {
    const s = new Soup(4);
    s.push(0, 0, 0, 0, 0, -4, 4, 0, -4, 1, 0); s.push(0, 0, 0, 4, 0, -4, 4, 0, 0, 1, 0);
    s.push(1, markY, -1, 1, markY, -2, 2, markY, -2, 2, 0); s.push(1, markY, -1, 2, markY, -2, 2, markY, -1, 2, 0);
    return s;
  };
  it('finds coplanar overlapping pairs of different slots, not ones a few mm apart or only touching', () => {
    expect(coplanarPairs(scene(0.005)).length).toBe(0);
    expect(coplanarPairs(scene(0)).length).toBe(2);
    const touching = new Soup(2);
    touching.push(0, 0, 0, 0, 0, -1, 1, 0, -1, 1, 0); touching.push(1, 0, -1, 2, 0, -1, 1, 0, 0, 2, 0);
    expect(pairCoplanar(touching, 0, 1)).toBe(false);
  });
  it('refuses the pairs quantisation flattened, and keeps the ones the source already had', () => {
    const built = scene(0.005);
    const flattened = scene(0); // what a 12 mm step does to a 5 mm marking
    const { problem, map } = matchMap(built, flattened, 0.006);
    expect(problem).toBeNull();
    expect(quantisationZFights(built, flattened, map, { slack: 0.002 }).created).toHaveLength(2);
    const already = scene(0);
    const same = matchMap(already, scene(0), 0.001);
    expect(quantisationZFights(already, scene(0), same.map, { slack: 0.002 })).toMatchObject({ decoded: 2, existing: 2, created: [] });
  });
  it('matches decoded triangles to built ones within the tolerance, any start vertex', () => {
    const a = new Soup(1); a.push(0, 0, 0, 1, 0, 0, 0, 1, 0, 3, 0);
    const b = new Soup(1); b.push(1, 0.0004, 0, 0, 1, 0, 0, 0, 0.0003, 3, 0);
    expect(matchWithin(a, b, 0.0005)).toBeNull();
    expect(matchWithin(a, b, 0.0002)).toMatch(/no built triangle within/);
    const c = new Soup(1); c.push(0, 0, 0, 1, 0, 0, 0, 1, 0, 4, 0);
    expect(matchWithin(a, c, 0.001)).toMatch(/no built triangle/); // another slot
  });
});

describe('nav doors (step 11)', () => {
  it('stores each passable door as its centre, wall direction and width, a typical storey once', () => {
    const door = (y: number) => ({ origin: [2, y, 0], along_wall: [1, 0, 0], width: 0.9 });
    expect(navDoor(door(5))).toEqual([2.45, 5, 1, 0, 0.9]);
    const byStorey = ['L1', 'L2', 'L3', 'L4'].map((tag, i) => ({ tag, doors: i === 0 ? [navDoor(door(1))] : [navDoor(door(5)), navDoor(door(7))] }));
    const packed: any = packDoors(byStorey);
    expect(packed.typical.storeys).toEqual(['L2', 'L3', 'L4']);
    expect(Object.keys(packed.storeys)).toEqual(['L1']);
    expect(doorsProblem(packed, byStorey)).toBeNull();
    expect((expandDoors(packed) as Record<string, number[][]>).L3).toHaveLength(2);
    expect(() => navDoor({ name: 'x' })).toThrow(/origin, along_wall and width/);
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
