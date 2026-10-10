import type { DrawingSheet, DrawingSite, PolylineData, RingData } from './types';

// The drawing set's runtime decoder (docs/portfolio/desk-drawing-set.md §1
// "Format"): the generated integer records → plain geometry in metres. Pure; the
// generator's decodeRings (scripts/drawings/build.ts) is its twin, and
// tests/drawing-decode.test.ts holds the two together over every sheet.

/** A ring or polyline, metres, as x, y pairs. */
export type Pts = Float64Array;

export interface Rect { x0: number; y0: number; x1: number; y1: number }
/** An axis-aligned segment: axis 0 runs along x at y = k. */
export interface Seg { axis: 0 | 1; k: number; lo: number; hi: number }
export interface Door { x: number; y: number; axis: 0 | 1; w: number; o1: number; o2: number }
export interface Flight { stair: number; sx: number; sy: number; ex: number; ey: number; width: number; risers: number; riserMm: number; dir: 1 | -1 }
export interface Landing { lift: number; x: number; y: number; fx: number; fy: number }
export interface Core extends Rect { lifts: number; aligned: boolean }
export interface Anchor { ring: number; x: number; y: number }

export interface SheetGeometry {
  key: string;
  storeys: string;
  count: number;
  /** Commonest clear height, m, and each room's own. */
  h: number;
  heights: Float64Array;
  fp: Pts;
  rooms: Pts[];
  ext: ReadonlySet<number>;
  skip: ReadonlySet<number>;
  codes: string[];
  labels: string[];
  anchors: Anchor[];
  /** Pen groups: [first ring, count]; group 0 is the rooms outside any flat. */
  groups: [number, number][];
  units: string[];
  shared: Seg[];
  doors: Door[];
  flights: Flight[];
  lifts: Landing[];
  cores: Core[];
  voids: Rect[];
  bands: Rect[];
  slabs: Seg[];
  partial: boolean;
  lots: readonly [number, number];
}

/** Rings (see RingData) → each ring's vertices, scaled by `unit` (cm → m by default). */
export const decodeRings = (data: RingData, unit = 0.01): Pts[] => {
  const out: Pts[] = [];
  let px = 0;
  let py = 0;
  for (let o = 0; o < data.length;) {
    const n = data[o];
    const f = data[o + 1];
    const x0 = px + data[o + 2];
    const y0 = py + data[o + 3];
    const pts = new Float64Array(2 * n);
    let x = x0;
    let y = y0;
    let axis = f;
    pts[0] = x0 * unit;
    pts[1] = y0 * unit;
    for (let i = 0; i < n - 2; i += 1) {
      const d = data[o + 4 + i];
      if (axis === 0) x += d; else y += d;
      pts[2 * (i + 1)] = x * unit;
      pts[2 * (i + 1) + 1] = y * unit;
      axis = 1 - axis;
    }
    // Edge n−2 runs along the first axis to the first vertex's line; edge n−1 closes.
    pts[2 * (n - 1)] = (f === 0 ? x0 : x) * unit;
    pts[2 * (n - 1) + 1] = (f === 0 ? y : y0) * unit;
    out.push(pts);
    px = x0;
    py = y0;
    o += 4 + (n - 2);
  }
  return out;
};

/** Polylines `n, x0, y0, dx1, dy1, …` → each line's vertices, scaled by `unit` (25 cm by default). */
export const decodePolylines = (data: PolylineData, unit = 0.25): Pts[] => {
  const out: Pts[] = [];
  for (let o = 0; o < data.length;) {
    const n = data[o];
    const pts = new Float64Array(2 * n);
    let x = data[o + 1];
    let y = data[o + 2];
    pts[0] = x * unit;
    pts[1] = y * unit;
    for (let i = 1; i < n; i += 1) {
      x += data[o + 1 + 2 * i];
      y += data[o + 2 + 2 * i];
      pts[2 * i] = x * unit;
      pts[2 * i + 1] = y * unit;
    }
    out.push(pts);
    o += 1 + 2 * n;
  }
  return out;
};

const rects = (data: readonly number[], stride: number): Rect[] => {
  const out: Rect[] = [];
  for (let k = 0; k < data.length; k += stride) out.push({ x0: data[k] / 100, y0: data[k + 1] / 100, x1: data[k + 2] / 100, y1: data[k + 3] / 100 });
  return out;
};

const segs = (data: readonly number[]): Seg[] => {
  const out: Seg[] = [];
  for (let k = 0; k < data.length; k += 4) {
    out.push({ axis: data[k] === 0 ? 0 : 1, k: data[k + 1] / 100, lo: data[k + 2] / 100, hi: (data[k + 2] + data[k + 3]) / 100 });
  }
  return out;
};

/** One building's sheet, decoded to metres, block-local. */
export const decodeSheet = (site: DrawingSite, sheet: DrawingSheet): SheetGeometry => {
  const rooms = decodeRings(sheet.rings);
  const heights = new Float64Array(rooms.length).fill(sheet.h / 100);
  for (let k = 0; k < sheet.hx.length; k += 2) heights[sheet.hx[k]] = sheet.hx[k + 1] / 100;
  const anchors: Anchor[] = [];
  for (let k = 0; k < sheet.anchors.length; k += 3) anchors.push({ ring: sheet.anchors[k], x: sheet.anchors[k + 1] / 100, y: sheet.anchors[k + 2] / 100 });
  const groups: [number, number][] = [];
  let at = 0;
  for (const count of sheet.groups) { groups.push([at, count]); at += count; }
  const doors: Door[] = [];
  for (let k = 0; k < sheet.doors.length; k += 6) {
    const d = sheet.doors;
    doors.push({ x: d[k] / 100, y: d[k + 1] / 100, axis: d[k + 2] === 0 ? 0 : 1, w: d[k + 3] / 100, o1: d[k + 4] / 100, o2: d[k + 5] / 100 });
  }
  const flights: Flight[] = [];
  for (let k = 0; k < sheet.flights.length; k += 9) {
    const f = sheet.flights;
    flights.push({
      stair: f[k], sx: f[k + 1] / 1000, sy: f[k + 2] / 1000, ex: f[k + 3] / 1000, ey: f[k + 4] / 1000,
      width: f[k + 5] / 1000, risers: f[k + 6], riserMm: f[k + 7], dir: f[k + 8] < 0 ? -1 : 1,
    });
  }
  const lifts: Landing[] = [];
  for (let k = 0; k < sheet.lifts.length; k += 5) {
    const l = sheet.lifts;
    lifts.push({ lift: l[k], x: l[k + 1] / 100, y: l[k + 2] / 100, fx: l[k + 3], fy: l[k + 4] });
  }
  const cores: Core[] = [];
  for (let k = 0; k < sheet.cores.length; k += 6) {
    const c = sheet.cores;
    cores.push({ x0: c[k] / 100, y0: c[k + 1] / 100, x1: c[k + 2] / 100, y1: c[k + 3] / 100, lifts: c[k + 4], aligned: c[k + 5] === 1 });
  }
  return {
    key: sheet.key,
    storeys: sheet.storeys,
    count: sheet.count,
    h: sheet.h / 100,
    heights,
    fp: decodeRings(site.fp)[0],
    rooms,
    ext: new Set(sheet.ext),
    skip: new Set(sheet.skip),
    codes: sheet.codes.split('|'),
    labels: sheet.labels.split('|'),
    anchors,
    groups,
    units: sheet.units.split('|'),
    shared: segs(sheet.shared),
    doors,
    flights,
    lifts,
    cores,
    voids: rects(sheet.voids, 4),
    bands: rects(sheet.bands, 4),
    slabs: segs(sheet.slabs),
    partial: sheet.partial,
    lots: sheet.lots,
  };
};

/** A ring's bounding box. */
export const boundsOf = (rings: readonly Pts[]): Rect => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      if (r[i] < x0) x0 = r[i];
      if (r[i] > x1) x1 = r[i];
      if (r[i + 1] < y0) y0 = r[i + 1];
      if (r[i + 1] > y1) y1 = r[i + 1];
    }
  }
  return { x0, y0, x1, y1 };
};

/** A ring moved by (dx, dy): block-local → estate frame. */
export const offsetRing = (ring: Pts, dx: number, dy: number): Pts => {
  const out = new Float64Array(ring.length);
  for (let i = 0; i < ring.length; i += 2) { out[i] = ring[i] + dx; out[i + 1] = ring[i + 1] + dy; }
  return out;
};

/** Signed area, m² (positive counter-clockwise). */
export const ringArea = (ring: Pts): number => {
  let a = 0;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) a += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
  return a / 2;
};

/** Even-odd inside test. */
export const insideRing = (ring: Pts, x: number, y: number): boolean => {
  let hit = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const yi = ring[i + 1];
    const yj = ring[j + 1];
    if ((yi > y) !== (yj > y) && x < ((ring[j] - ring[i]) * (y - yi)) / (yj - yi) + ring[i]) hit = !hit;
  }
  return hit;
};

/** A building as massing: its footprint in the estate frame, its levels, its roof's enclosed rooms. */
export interface Massing {
  id: string;
  short: string;
  kind: DrawingSite['kind'];
  /** Footprint, estate frame, m. */
  fp: Pts;
  /** Block-local origin in the estate frame, m. */
  at: [number, number];
  /** FFL per storey, m; the last is the roof level, where the massing stops. */
  ffl: number[];
  /** The pack's roofTop, m: a level tag only. */
  top: number;
  /** The roof's enclosed rooms (stair cores), estate frame, each with its clear height, m. */
  caps: { ring: Pts; h: number }[];
}

export const massingOf = (site: DrawingSite): Massing => {
  const ax = site.at[0] / 100;
  const ay = site.at[1] / 100;
  const caps = decodeRings(site.caps).map((ring, i) => ({ ring: offsetRing(ring, ax, ay), h: site.capsH[i] / 100 }));
  return {
    id: site.id,
    short: site.short,
    kind: site.kind,
    fp: offsetRing(decodeRings(site.fp)[0], ax, ay),
    at: [ax, ay],
    ffl: site.ffl.map((v) => v / 100),
    top: site.top / 100,
    caps,
  };
};
