import { beforeAll, describe, expect, it } from 'vitest';
import { decodeRings as generatorDecodeRings, encodeRings, LABEL_MIN_AREA } from '../scripts/drawings/build';
import {
  boundsOf, decodePolylines, decodeRings, decodeSheet, insideRing, massingOf, offsetRing, ringArea, type Pts, type SheetGeometry,
} from '../lib/drawings/decode';
import { SHEET_LOADERS } from '../lib/drawings/sheetLoaders.generated';
import { EXTENT, KERBS, SITES } from '../lib/drawings/site.generated';
import type { DrawingSheet, DrawingSite } from '../lib/drawings/types';

// The drawing set's runtime decoder (lib/drawings/decode.ts; docs/portfolio/
// desk-drawing-set.md §1 "Format"): the generated integer records → metres. Its
// decodeRings is the twin of the generator's (scripts/drawings/build.ts), so this
// file holds the two together over every footprint, roof cap and sheet of all 14
// buildings, then pins what each decoded field must mean against the committed
// data itself: the kerbs, the doors' faces, the flights in mm, the landings'
// facing into their cores, the cores "aligned below", the heights, the pen
// groups, the label anchors, the massing in the estate frame, and ringArea's
// sign and insideRing on real rings. A decoder that misread one stride, unit or
// sign would draw plausibly and wrongly; these fail instead.

const sheetsOf = new Map<string, readonly DrawingSheet[]>();

beforeAll(async () => {
  for (const site of SITES) sheetsOf.set(site.id, (await SHEET_LOADERS[site.id]()).SHEETS);
});

const siteOf = (id: string) => SITES.find((s) => s.id === id)!;
const sheetOf = (id: string, key: string) => sheetsOf.get(id)!.find((s) => s.key === key)!;

const eachSheet = (fn: (site: DrawingSite, sheet: DrawingSheet, g: SheetGeometry, what: string) => void) => {
  for (const site of SITES) for (const sheet of sheetsOf.get(site.id)!) fn(site, sheet, decodeSheet(site, sheet), `${site.id} ${sheet.key}`);
};

/** The first storey a sheet draws (site.plan holds each storey's sheet index). */
const storeyOf = (site: DrawingSite, key: string) => site.plan.indexOf(String(site.sheets.indexOf(key)));

const cm = (m: number) => Math.round(m * 100);
const arr = (r: Pts) => Array.from(r);

interface Edge { axis: 0 | 1; k: number; lo: number; hi: number; owner: number }
/** A ring's edges, in integer cm (axis 0 runs along x at y = k). */
const edgesOf = (ring: Pts, owner: number): Edge[] => {
  const out: Edge[] = [];
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    const [ax, ay, bx, by] = [cm(ring[i]), cm(ring[i + 1]), cm(ring[j]), cm(ring[j + 1])];
    if (ay === by) out.push({ axis: 0, k: ay, lo: Math.min(ax, bx), hi: Math.max(ax, bx), owner });
    else out.push({ axis: 1, k: ax, lo: Math.min(ay, by), hi: Math.max(ay, by), owner });
  }
  return out;
};
const ownersAt = (edges: readonly Edge[], axis: 0 | 1, k: number, s: number) =>
  new Set(edges.filter((e) => e.axis === axis && e.k === k && e.lo <= s && s <= e.hi).map((e) => e.owner));

const square = (x0: number, y0: number, x1: number, y1: number): Pts => new Float64Array([x0, y0, x1, y0, x1, y1, x0, y1]);
/** An L: the 4 × 5 box less its top-right 2 × 3, counter-clockwise. */
const L_SHAPE: Pts = new Float64Array([0, 0, 4, 0, 4, 2, 2, 2, 2, 5, 0, 5]);

describe('drawing decoder — rings', () => {
  it('expands a ring record: first vertex, n−2 alternating edges, the last two closing it (f = 0 and f = 1)', () => {
    // A 2 × 1 rectangle entered at its south-west corner along x, then at its south-east corner along y.
    expect(decodeRings([4, 0, 0, 0, 200, 100]).map(arr)).toEqual([[0, 0, 2, 0, 2, 1, 0, 1]]);
    expect(decodeRings([4, 1, 200, 0, 100, -200]).map(arr)).toEqual([[2, 0, 2, 1, 0, 1, 0, 0]]);
    // The L, six vertices: four stored edges, two closing ones.
    expect(decodeRings([6, 0, 0, 0, 400, 200, -200, 300], 1).map(arr)).toEqual([[0, 0, 400, 0, 400, 200, 200, 200, 200, 500, 0, 500]]);
  });

  it('reads each ring’s first vertex relative to the previous ring’s, the first to the origin', () => {
    const rings = decodeRings([4, 0, 1000, 2000, 100, 100, 4, 1, -300, 50, 20, -40], 1).map(arr);
    expect(rings).toEqual([
      [1000, 2000, 1100, 2000, 1100, 2100, 1000, 2100],
      [700, 2050, 700, 2070, 660, 2070, 660, 2050],
    ]);
  });

  it('round-trips the generator’s encodeRings, whatever vertex a ring is entered at', () => {
    const lCm: [number, number][] = [[0, 0], [400, 0], [400, 200], [200, 200], [200, 500], [0, 500]];
    const box: [number, number][] = [[-900, -300], [-100, -300], [-100, 700], [-900, 700]];
    for (let start = 0; start < lCm.length; start += 1) {
      const data = encodeRings([{ pts: lCm, start }, { pts: box, start: start % 4 }]);
      const [l, b] = decodeRings(data, 1).map(arr);
      expect(l).toEqual([...lCm.slice(start), ...lCm.slice(0, start)].flat());
      expect(b).toEqual([...box.slice(start % 4), ...box.slice(0, start % 4)].flat());
      // and the default unit is the centimetre
      expect(arr(decodeRings(data)[0])).toEqual(l.map((v) => v * 0.01));
    }
  });

  it('is the exact twin of the generator’s decodeRings, ×0.01, over every footprint, roof cap and sheet (1,484 rings)', () => {
    let rings = 0;
    for (const site of SITES) {
      const records: [string, readonly number[]][] = [['fp', site.fp], ['caps', site.caps], ...sheetsOf.get(site.id)!.map((s) => [s.key, s.rings] as [string, readonly number[]])];
      for (const [what, data] of records) {
        const twin = generatorDecodeRings(data);
        expect(decodeRings(data).map(arr), `${site.id} ${what}`).toEqual(twin.map((r) => r.flatMap(([x, y]) => [x * 0.01, y * 0.01])));
        expect(decodeRings(data, 1).map(arr), `${site.id} ${what} in cm`).toEqual(twin.map((r) => r.flat()));
        rings += twin.length;
      }
    }
    expect(rings).toBe(1484);
  });

  it('decodes every real ring closed, axis-aligned with alternating edges, and counter-clockwise', () => {
    const check = (ring: Pts, what: string) => {
      const n = ring.length / 2;
      expect(n % 2, what).toBe(0);
      expect(n, what).toBeGreaterThanOrEqual(4);
      let prev = -1;
      for (let i = 0; i < n; i += 1) {
        const j = (i + 1) % n;
        const dx = ring[2 * j] - ring[2 * i];
        const dy = ring[2 * j + 1] - ring[2 * i + 1];
        expect((dx === 0) !== (dy === 0), `${what} edge ${i}`).toBe(true);
        const axis = dy === 0 ? 0 : 1;
        expect(axis, `${what} edge ${i} alternates`).not.toBe(prev);
        prev = axis;
      }
      expect(ringArea(ring), what).toBeGreaterThan(0);
    };
    for (const site of SITES) {
      check(decodeRings(site.fp)[0], `${site.id} fp`);
      decodeRings(site.caps).forEach((r, i) => check(r, `${site.id} cap ${i}`));
      for (const sheet of sheetsOf.get(site.id)!) decodeRings(sheet.rings).forEach((r, i) => check(r, `${site.id} ${sheet.key} ring ${i}`));
    }
  });
});

describe('drawing decoder — kerbs', () => {
  const lines = decodePolylines(KERBS);

  it('decodes KERBS to 10 polylines whose records account for every number', () => {
    expect(lines).toHaveLength(10);
    expect(lines.reduce((n, l) => n + 1 + l.length, 0)).toBe(KERBS.length);
    expect(lines.map((l) => l.length / 2)).toEqual([30, 24, 52, 70, 23, 69, 6, 6, 94, 10]);
  });

  it('measures 3,388 m of kerb in all, each line at least 2 m, all inside the 400 × 400 m extent', () => {
    let total = 0;
    for (const l of lines) {
      let len = 0;
      for (let i = 2; i < l.length; i += 2) len += Math.hypot(l[i] - l[i - 2], l[i + 1] - l[i - 1]);
      expect(len).toBeGreaterThanOrEqual(2);
      total += len;
    }
    expect(Math.round(total)).toBe(3388);
    const box = boundsOf(lines);
    expect(box.x0).toBeGreaterThanOrEqual(EXTENT[0] / 100);
    expect(box.y0).toBeGreaterThanOrEqual(EXTENT[1] / 100);
    expect(box.x1).toBeLessThanOrEqual(EXTENT[2] / 100);
    expect(box.y1).toBeLessThanOrEqual(EXTENT[3] / 100);
  });

  it('reads 25 cm units: every vertex a crossing midway between two cell centres (exactly one odd coordinate)', () => {
    const units = decodePolylines(KERBS, 1);
    lines.forEach((l, li) => expect(arr(l)).toEqual(arr(units[li]).map((v) => v * 0.25)));
    for (const l of units) {
      for (let i = 0; i < l.length; i += 2) {
        expect(Number.isInteger(l[i]) && Number.isInteger(l[i + 1])).toBe(true);
        expect(Math.abs(l[i] + l[i + 1]) % 2).toBe(1);
      }
    }
  });

  it('runs each segment along x, y or a diagonal of the lattice, with no collinear vertex left in a line', () => {
    for (const l of decodePolylines(KERBS, 1)) {
      for (let i = 2; i < l.length; i += 2) {
        const dx = l[i] - l[i - 2];
        const dy = l[i + 1] - l[i - 1];
        expect(dx !== 0 || dy !== 0).toBe(true);
        expect(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)).toBe(true);
        if (i >= 4) {
          const px = l[i - 2] - l[i - 4];
          const py = l[i - 1] - l[i - 3];
          expect(px * dy - py * dx).not.toBe(0);
        }
      }
    }
  });
});

describe('drawing decoder — sheets', () => {
  it('passes the sheet’s scalars through and splits its lists parallel to the rings, the footprint block-local', () => {
    eachSheet((site, sheet, g, what) => {
      expect(g.key, what).toBe(sheet.key);
      expect(g.storeys, what).toBe(sheet.storeys);
      expect(g.count, what).toBe(sheet.count);
      expect(g.partial, what).toBe(sheet.partial);
      expect(g.lots, what).toEqual(sheet.lots);
      expect(g.codes, what).toHaveLength(g.rooms.length);
      expect(g.labels, what).toHaveLength(g.rooms.length);
      expect(arr(g.fp), what).toEqual(arr(decodeRings(site.fp)[0]));
      for (const i of [...g.ext, ...g.skip]) expect(i, what).toBeLessThan(g.rooms.length);
      expect(g.ext.size, what).toBe(sheet.ext.length);
    });
    expect(decodeSheet(siteOf('BLK_501'), sheetOf('BLK_501', 'TYP'))).toMatchObject({ key: 'TYP', storeys: 'L2–L20', count: 19, h: 2.6 });
    expect(sheetOf('MSCP_513', 'L1').lots).toEqual([123, 51]);
    expect(sheetOf('MSCP_513', 'TYP').lots).toEqual([126, 51]);
  });

  it('gives each room its clear height: the sheet’s commonest h, overridden by hx', () => {
    eachSheet((_site, sheet, g, what) => {
      const over = new Map<number, number>();
      for (let k = 0; k < sheet.hx.length; k += 2) over.set(sheet.hx[k], sheet.hx[k + 1]);
      expect(g.h, what).toBe(sheet.h / 100);
      expect(g.heights, what).toHaveLength(g.rooms.length);
      g.heights.forEach((v, i) => expect(v, `${what} ring ${i}`).toBe((over.get(i) ?? sheet.h) / 100));
      for (const v of over.values()) expect(v, `${what}: hx holds only heights that differ`).not.toBe(sheet.h);
      const counts = new Map<number, number>();
      for (const v of g.heights) counts.set(v, (counts.get(v) ?? 0) + 1);
      expect(counts.get(g.h), `${what}: h is the commonest`).toBe(Math.max(...counts.values()));
    });
    const nc = decodeSheet(siteOf('NC_514'), sheetOf('NC_514', 'L1'));
    const hist: Record<string, number> = {};
    for (const v of nc.heights) hist[v] = (hist[v] ?? 0) + 1;
    expect(hist).toEqual({ 3: 53, 4: 15, 6.5: 8 });
  });

  it('turns pen group counts into [first ring, count], group 0 the rooms outside any flat', () => {
    eachSheet((site, sheet, g, what) => {
      expect(g.groups, what).toHaveLength(sheet.groups.length);
      expect(g.units, what).toHaveLength(g.groups.length);
      expect(g.units[0], what).toBe('');
      let at = 0;
      g.groups.forEach(([start, count], i) => {
        expect(start, `${what} group ${i}`).toBe(at);
        expect(count, `${what} group ${i}`).toBe(sheet.groups[i]);
        at += count;
      });
      expect(at, what).toBe(g.rooms.length);
      const flats = g.units.slice(1);
      if (site.kind === 'block' && sheet.key === 'TYP') {
        expect(flats.length, what).toBeGreaterThan(0);
        for (const u of flats) expect(u, what).toMatch(/^\d{3}$/);
      } else expect(flats, what).toEqual([]);
    });
    expect(decodeSheet(siteOf('BLK_501'), sheetOf('BLK_501', 'TYP')).units.slice(0, 4)).toEqual(['', '101', '103', '105']);
  });

  it('anchors labels inside their own named rooms of at least 9 m², in pen order', () => {
    let anchors = 0;
    eachSheet((_site, _sheet, g, what) => {
      let prev = -1;
      for (const a of g.anchors) {
        expect(a.ring, what).toBeGreaterThan(prev);
        prev = a.ring;
        expect(insideRing(g.rooms[a.ring], a.x, a.y), `${what} ring ${a.ring}`).toBe(true);
        expect(ringArea(g.rooms[a.ring]), `${what} ring ${a.ring}`).toBeGreaterThanOrEqual(LABEL_MIN_AREA);
        expect(g.labels[a.ring], `${what} ring ${a.ring}`).not.toBe('');
        anchors += 1;
      }
    });
    expect(anchors).toBeGreaterThan(0);
  });

  it('decodes 854 doors as openings: centre on the wall line, faces either side that meet parallel room or footprint edges', () => {
    let doors = 0;
    const depths: Record<number, number> = {};
    eachSheet((_site, sheet, g, what) => {
      expect(g.doors, what).toHaveLength(sheet.doors.length / 6);
      const edges = [...edgesOf(g.fp, -1), ...g.rooms.flatMap((r, i) => edgesOf(r, i))];
      for (const d of g.doors) {
        expect(d.w, what).toBeGreaterThan(0);
        expect(d.o1, what).toBeLessThanOrEqual(0);
        expect(d.o2, what).toBeGreaterThanOrEqual(0);
        const depth = cm(d.o2 - d.o1);
        depths[depth] = (depths[depth] ?? 0) + 1;
        const across = d.axis === 0 ? cm(d.y) : cm(d.x);
        const along = d.axis === 0 ? cm(d.x) : cm(d.y);
        for (const o of [d.o1, d.o2]) {
          if (o === 0) continue;
          const k = across + cm(o);
          const half = cm(d.w) / 2;
          const meets = edges.some((e) => e.axis === d.axis && e.k === k && Math.min(e.hi, along + half) - Math.max(e.lo, along - half) > 0);
          expect(meets, `${what} door at (${d.x}, ${d.y}) face ${o}`).toBe(true);
        }
        doors += 1;
      }
    });
    expect(doors).toBe(854);
    expect(depths).toEqual({ 10: 455, 15: 2, 20: 323, 25: 71, 26: 3 });
    // The first door of BLK 509's L1, field by field.
    expect(decodeSheet(siteOf('BLK_509'), sheetOf('BLK_509', 'L1')).doors[0]).toEqual({ x: -61.7, y: -0.05, axis: 0, w: 1, o1: -0.05, o2: 0.15 });
  });

  it('reads stair flights in mm: goings of about 0.25 m, 1.15 m wide, each stair rising one storey to the stored riser', () => {
    const labels = new Set<string>();
    eachSheet((site, sheet, g, what) => {
      expect(g.flights, what).toHaveLength(sheet.flights.length / 9);
      g.flights.forEach((f, i) => {
        const raw = sheet.flights.slice(9 * i, 9 * i + 9);
        expect([f.stair, f.sx, f.sy, f.ex, f.ey, f.width, f.risers, f.riserMm], what)
          .toEqual([raw[0], raw[1] / 1000, raw[2] / 1000, raw[3] / 1000, raw[4] / 1000, raw[5] / 1000, raw[6], raw[7]]);
        expect(Math.abs(raw[8]), what).toBe(1);
        expect(f.dir, what).toBe(raw[8]);
        expect(f.width, what).toBe(1.15);
        const going = Math.hypot(f.ex - f.sx, f.ey - f.sy) / f.risers;
        expect(going, what).toBeGreaterThan(0.24);
        expect(going, what).toBeLessThan(0.26);
      });
      // dir −1 (arriving) only on the top sheet, where nothing climbs further.
      const top = sheet.key === 'RF' || (site.id === 'NC_514' && sheet.key === 'L2');
      for (const f of g.flights) expect(f.dir, what).toBe(top ? -1 : 1);
      const s = storeyOf(site, sheet.key);
      const storeyMm = top ? (site.ffl[s] - site.ffl[s - 1]) * 10 : (site.ffl[s + 1] - site.ffl[s]) * 10;
      const stairs = new Map<number, { risers: number; riserMm: number }>();
      for (const f of g.flights) {
        const st = stairs.get(f.stair) ?? { risers: 0, riserMm: f.riserMm };
        expect(f.riserMm, `${what} stair ${f.stair}: one riser per stair`).toBe(st.riserMm);
        st.risers += f.risers;
        stairs.set(f.stair, st);
      }
      for (const [n, st] of stairs) {
        // The stored riser is rounded to the mm: the storey is within half a mm per riser.
        expect(Math.abs(st.risers * st.riserMm - storeyMm), `${what} stair ${n}`).toBeLessThanOrEqual(st.risers * 0.5);
        labels.add(`${st.risers} R × ${st.riserMm}`);
      }
    });
    expect([...labels].sort()).toEqual(['16 R × 175', '18 R × 167', '21 R × 171', '24 R × 175']);
  });

  it('reads lift landings in cm with a unit facing out of the car, every landing inside the footprint', () => {
    eachSheet((_site, sheet, g, what) => {
      expect(g.lifts, what).toHaveLength(sheet.lifts.length / 5);
      expect(new Set(g.lifts.map((l) => l.lift)).size, `${what}: lift numbers distinct`).toBe(g.lifts.length);
      g.lifts.forEach((l, i) => {
        expect(l.x, what).toBe(sheet.lifts[5 * i + 1] / 100);
        expect(l.y, what).toBe(sheet.lifts[5 * i + 2] / 100);
        expect(Math.abs(l.fx) + Math.abs(l.fy), what).toBe(1);
        expect(insideRing(g.fp, l.x, l.y), what).toBe(true);
      });
    });
  });

  it('decodes the inferred cores: one per bank of landings, the car 0.6 m behind each landing inside it', () => {
    const want: Record<string, number> = {
      BLK_501: 1, BLK_502: 1, BLK_503: 1, BLK_504: 1, BLK_505: 1, BLK_506: 1, BLK_507: 2, BLK_508: 2,
      BLK_509: 3, BLK_510: 2, BLK_511: 2, BLK_512: 1, MSCP_513: 1,
    };
    eachSheet((site, sheet, g, what) => {
      expect(g.cores, what).toHaveLength(sheet.cores.length / 6);
      expect(g.cores.length, what).toBe(site.id === 'NC_514' ? (sheet.key === 'L1' ? 1 : 0) : want[site.id]);
      for (const c of g.cores) {
        expect(c.x1, what).toBeGreaterThan(c.x0);
        expect(c.y1, what).toBeGreaterThan(c.y0);
        if (c.aligned) continue;
        const facing = g.lifts.filter((l) => {
          const qx = l.x - 0.6 * l.fx;
          const qy = l.y - 0.6 * l.fy;
          return qx > c.x0 && qx < c.x1 && qy > c.y0 && qy < c.y1;
        });
        expect(facing, `${what} core at (${c.x0}, ${c.y0})`).toHaveLength(c.lifts);
        const depth = facing[0].fx !== 0 ? c.x1 - c.x0 : c.y1 - c.y0;
        const perLift = (facing[0].fx !== 0 ? c.y1 - c.y0 : c.x1 - c.x0) / c.lifts;
        expect(depth, what).toBeGreaterThanOrEqual(1.5);
        expect(depth, what).toBeLessThanOrEqual(3.5);
        expect(perLift, what).toBeGreaterThanOrEqual(1.8);
        expect(perLift, what).toBeLessThanOrEqual(3.2);
      }
    });
    const typ = decodeSheet(siteOf('BLK_501'), sheetOf('BLK_501', 'TYP')).cores[0];
    expect(typ.x1 - typ.x0).toBeCloseTo(4.6, 9);
    expect(typ.y1 - typ.y0).toBeCloseTo(2.7, 9);
  });

  it('flags a core "aligned below" only on a block’s roof, where it is the typical floor’s core with no landings', () => {
    eachSheet((site, sheet, g, what) => {
      const roof = site.kind === 'block' && sheet.key === 'RF';
      for (let k = 0; k < sheet.cores.length; k += 6) expect(sheet.cores[k + 5] === 0 || sheet.cores[k + 5] === 1, what).toBe(true);
      expect(g.cores.every((c) => c.aligned === roof), what).toBe(true);
      if (!roof) return;
      expect(g.lifts, what).toEqual([]);
      const typ = decodeSheet(site, sheetOf(site.id, 'TYP'));
      expect(g.cores, what).toEqual(typ.cores.map((c) => ({ ...c, aligned: true })));
    });
  });

  it('decodes the voids as rectangles: only the car park’s decks, the 364.3 m² ramp box and two of 9.3 and 7.0 m²', () => {
    eachSheet((site, sheet, g, what) => {
      expect(g.voids, what).toHaveLength(sheet.voids.length / 4);
      if (site.id === 'MSCP_513' && sheet.key !== 'RF') {
        expect(g.voids.map((v) => Math.round((v.x1 - v.x0) * (v.y1 - v.y0) * 10) / 10).sort((a, b) => a - b), what).toEqual([7, 9.3, 364.3]);
        expect(g.voids, what).toContainEqual({ x0: -13.2, y0: 36.2, x1: 13.2, y1: 50 });
      } else expect(g.voids, what).toEqual([]);
    });
  });

  it('decodes [axis, k, lo, len] as a segment along x (axis 0) or y at k: slab edges on the footprint, shared boundaries on two rooms', () => {
    let slabs = 0;
    let shared = 0;
    eachSheet((_site, sheet, g, what) => {
      expect(g.slabs, what).toHaveLength(sheet.slabs.length / 4);
      expect(g.shared, what).toHaveLength(sheet.shared.length / 4);
      g.slabs.forEach((s, i) => expect(s.hi, what).toBe((sheet.slabs[4 * i + 2] + sheet.slabs[4 * i + 3]) / 100));
      const fpEdges = edgesOf(g.fp, -1);
      const roomEdges = g.rooms.flatMap((r, i) => edgesOf(r, i));
      for (const s of g.slabs) {
        expect(s.hi, what).toBeGreaterThan(s.lo);
        for (const at of [cm(s.lo), cm((s.lo + s.hi) / 2), cm(s.hi)]) expect(ownersAt(fpEdges, s.axis, cm(s.k), at).size, `${what} slab at ${s.k}`).toBe(1);
        slabs += 1;
      }
      for (const s of g.shared) {
        expect(s.hi, what).toBeGreaterThan(s.lo);
        for (const at of [cm(s.lo), cm((s.lo + s.hi) / 2), cm(s.hi)]) {
          expect(ownersAt(roomEdges, s.axis, cm(s.k), at).size, `${what} shared at ${s.k}`).toBeGreaterThanOrEqual(2);
        }
        shared += 1;
      }
    });
    expect(slabs).toBeGreaterThan(0);
    expect(shared).toBeGreaterThan(0);
  });

  it('decodes the open-air strips as thin rectangles inside the footprint, beside an open-air room', () => {
    eachSheet((_site, sheet, g, what) => {
      expect(g.bands, what).toHaveLength(sheet.bands.length / 4);
      if (g.bands.length) expect(g.ext.size, what).toBeGreaterThan(0);
      for (const b of g.bands) {
        expect(b.x1, what).toBeGreaterThan(b.x0);
        expect(b.y1, what).toBeGreaterThan(b.y0);
        expect(Math.min(b.x1 - b.x0, b.y1 - b.y0), what).toBeLessThanOrEqual(0.3);
        expect(insideRing(g.fp, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2), what).toBe(true);
      }
    });
  });

  it('keeps only the hawker centre’s L2 partial; every other sheet’s rooms cover at least 85 % of the footprint, never more', () => {
    eachSheet((site, _sheet, g, what) => {
      const rooms = g.rooms.reduce((a, r, i) => a + (g.skip.has(i) ? 0 : ringArea(r)), 0);
      const cover = rooms / ringArea(g.fp);
      expect(cover, what).toBeLessThanOrEqual(1);
      if (g.partial) {
        expect(what).toBe('NC_514 L2');
        expect(cover).toBeLessThan(0.25);
      } else expect(cover, what).toBeGreaterThanOrEqual(0.85);
      // a skipped island sits inside a larger room
      for (const i of g.skip) {
        const box = boundsOf([g.rooms[i]]);
        const cx = (box.x0 + box.x1) / 2;
        const cy = (box.y0 + box.y1) / 2;
        expect(insideRing(g.rooms[i], cx, cy), `${what} island ${i}`).toBe(true);
        expect(g.rooms.some((r, j) => j !== i && ringArea(r) > ringArea(g.rooms[i]) && insideRing(r, cx, cy)), `${what} island ${i}`).toBe(true);
      }
      if (site.id === 'MSCP_513' && g.key === 'RF') expect(g.skip.size).toBe(2);
      else expect(g.skip.size, what).toBe(0);
    });
  });
});

describe('drawing decoder — massing', () => {
  it('places each footprint in the estate frame: block-local + at, inside the extent, no two overlapping', () => {
    const boxes: { id: string; x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const site of SITES) {
      const m = massingOf(site);
      const local = decodeRings(site.fp)[0];
      expect(m.at, site.id).toEqual([site.at[0] / 100, site.at[1] / 100]);
      expect(arr(m.fp), site.id).toEqual(arr(local).map((v, i) => v + m.at[i % 2]));
      expect(arr(m.fp), site.id).toEqual(arr(offsetRing(local, m.at[0], m.at[1])));
      expect(ringArea(m.fp), site.id).toBeCloseTo(ringArea(local), 6);
      expect({ id: m.id, short: m.short, kind: m.kind }).toEqual({ id: site.id, short: site.short, kind: site.kind });
      const box = boundsOf([m.fp]);
      expect(box.x0, site.id).toBeGreaterThanOrEqual(EXTENT[0] / 100);
      expect(box.y0, site.id).toBeGreaterThanOrEqual(EXTENT[1] / 100);
      expect(box.x1, site.id).toBeLessThanOrEqual(EXTENT[2] / 100);
      expect(box.y1, site.id).toBeLessThanOrEqual(EXTENT[3] / 100);
      for (const b of boxes) expect(box.x1 <= b.x0 || b.x1 <= box.x0 || box.y1 <= b.y0 || b.y1 <= box.y0, `${site.id} / ${b.id}`).toBe(true);
      boxes.push({ id: site.id, ...box });
    }
    expect(massingOf(siteOf('BLK_501')).at).toEqual([255, 345]);
    expect(ringArea(massingOf(siteOf('MSCP_513')).fp)).toBeCloseTo(4000, 6);
    expect(boundsOf([massingOf(siteOf('MSCP_513')).fp])).toEqual({ x0: 142, y0: 214, x1: 182, y1: 314 });
    expect(ringArea(massingOf(siteOf('NC_514')).fp)).toBeCloseTo(6096, 6);
  });

  it('reads FFLs and the model top in metres; the massing stops at the roof level, its caps under the model top', () => {
    for (const site of SITES) {
      const m = massingOf(site);
      expect(m.ffl, site.id).toEqual(site.ffl.map((v) => v / 100));
      expect(m.ffl[0], site.id).toBe(0);
      for (let i = 1; i < m.ffl.length; i += 1) expect(m.ffl[i], site.id).toBeGreaterThan(m.ffl[i - 1]);
      expect(m.top, site.id).toBe(site.top / 100);
      const roof = m.ffl[m.ffl.length - 1];
      expect(roof + Math.max(0, ...m.caps.map((c) => c.h)), site.id).toBeLessThanOrEqual(m.top);
    }
    const b501 = massingOf(siteOf('BLK_501'));
    expect([b501.ffl.length, b501.ffl[20], b501.top]).toEqual([21, 56.8, 60.2]);
    expect(massingOf(siteOf('NC_514')).ffl).toEqual([0, 4.2, 8.2]);
  });

  it('caps the roof with its enclosed rooms: the RF sheet’s rooms that are not open-air, moved by at, at their clear heights', () => {
    /** A ring as a key, rotated to start at its least (y, x) vertex, in cm. */
    const key = (r: Pts) => {
      const pts: [number, number][] = [];
      for (let i = 0; i < r.length; i += 2) pts.push([cm(r[i]), cm(r[i + 1])]);
      let at = 0;
      pts.forEach((p, i) => { if (p[1] < pts[at][1] || (p[1] === pts[at][1] && p[0] < pts[at][0])) at = i; });
      return JSON.stringify([...pts.slice(at), ...pts.slice(0, at)]);
    };
    for (const site of SITES) {
      const m = massingOf(site);
      expect(m.caps.map((c) => c.h), site.id).toEqual(site.capsH.map((v) => v / 100));
      if (!site.sheets.includes('RF')) {
        expect(m.caps, site.id).toEqual([]);
        continue;
      }
      const rf = decodeSheet(site, sheetOf(site.id, 'RF'));
      const want = rf.rooms.flatMap((r, i) => (rf.ext.has(i) ? [] : [`${key(offsetRing(r, m.at[0], m.at[1]))} ${rf.heights[i]}`])).sort();
      expect(m.caps.map((c) => `${key(c.ring)} ${c.h}`).sort(), site.id).toEqual(want);
    }
    expect(massingOf(siteOf('BLK_501')).caps.map((c) => c.h)).toEqual([3, 3]);
    expect(massingOf(siteOf('BLK_509')).caps).toHaveLength(5);
    expect(massingOf(siteOf('MSCP_513')).caps).toHaveLength(3);
  });
});

describe('drawing decoder — ringArea, insideRing, offsetRing', () => {
  it('signs the area: positive counter-clockwise, negative clockwise', () => {
    const unit = square(0, 0, 1, 1);
    expect(ringArea(unit)).toBe(1);
    const cw = new Float64Array([0, 0, 0, 1, 1, 1, 1, 0]);
    expect(ringArea(cw)).toBe(-1);
    expect(ringArea(square(-2, -1, 1, 3))).toBe(12);
    expect(ringArea(L_SHAPE)).toBe(14);
    expect(ringArea(new Float64Array([0, 0, 4, 0, 0, 3]))).toBe(6);
    // translation leaves it alone
    expect(ringArea(offsetRing(L_SHAPE, 250, -340))).toBeCloseTo(14, 9);
  });

  it('tests inside even-odd, for convex and concave rings, whichever way they wind', () => {
    expect(insideRing(square(0, 0, 1, 1), 0.5, 0.5)).toBe(true);
    expect(insideRing(square(0, 0, 1, 1), 1.5, 0.5)).toBe(false);
    expect(insideRing(L_SHAPE, 1, 4)).toBe(true); // the L's upright
    expect(insideRing(L_SHAPE, 3, 1)).toBe(true); // its foot
    expect(insideRing(L_SHAPE, 3, 4)).toBe(false); // the notch
    expect(insideRing(L_SHAPE, -1, 1)).toBe(false);
    const reversed = new Float64Array(L_SHAPE.length);
    for (let i = 0; i < L_SHAPE.length; i += 2) {
      reversed[L_SHAPE.length - 2 - i] = L_SHAPE[i];
      reversed[L_SHAPE.length - 1 - i] = L_SHAPE[i + 1];
    }
    expect(ringArea(reversed)).toBe(-14);
    for (const [x, y] of [[1, 4], [3, 1], [3, 4], [-1, 1]]) expect(insideRing(reversed, x, y)).toBe(insideRing(L_SHAPE, x, y));
  });

  it('finds an L-block’s box centre in its courtyard, outside the footprint, and a point block’s inside', () => {
    for (const site of SITES) {
      const fp = massingOf(site).fp;
      const box = boundsOf([fp]);
      const inside = insideRing(fp, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2);
      if (site.typology === 'LB') expect(inside, site.id).toBe(false);
      if (site.typology === 'PT4') expect(inside, site.id).toBe(true);
    }
    expect(SITES.filter((s) => s.typology === 'LB').map((s) => s.id)).toEqual(['BLK_510', 'BLK_511']);
  });

  it('moves a ring without touching the original, and bounds rings', () => {
    const ring = square(0, 0, 2, 1);
    const moved = offsetRing(ring, 10, -5);
    expect(arr(moved)).toEqual([10, -5, 12, -5, 12, -4, 10, -4]);
    expect(arr(ring)).toEqual([0, 0, 2, 0, 2, 1, 0, 1]);
    expect(boundsOf([ring, moved])).toEqual({ x0: 0, y0: -5, x1: 12, y1: 1 });
  });
});
