// The desk drawing set's generator (docs/portfolio/desk-drawing-set.md §4).
//
// Reads the committed estate pack — pack.json, nav/*.json.gz and the SN5G
// ground raster under public/estate/v1.2, never external/ — and writes the
// line work the desk draws as committed TypeScript modules under lib/drawings:
// site.generated.ts (the site plan, the poster camera, each building's
// footprint and levels), sheets/<ID>.generated.ts (each building's plans) and
// sheetLoaders.generated.ts. Run it with `npm run drawings` (export.mjs, Vite
// SSR, as `npm run snapshot` runs lib/portfolioSnapshot.ts); tests/drawing-set
// regenerates in memory and compares byte for byte, and check-bundle refuses a
// deploy whose set does not match the pack it ships.
//
// lib/estate is used here, at generation time only: the runtime drawing code
// imports its types and nothing else (a value import would put an Estate module
// in a shared chunk, which vite.config.ts names estate-shared-*).
//
// Honesty rules (§4 "No invented facts"): every primitive traces to a field of
// the pack or the nav files. Walls are not modelled; they are the gaps between
// spaces, drawn as a thin fill. Lift cores are inferred from the thick unroomed
// rectangle behind lift landings, and say so. Doors are openings (the data has
// no swing or hinge). Massing stops at the roof level.
//
// Deterministic: pack order, integers (cm; mm for stair flights), LF, no
// dates, no randomness, nothing read from the environment.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ESTATE_CATALOGUE } from '../../lib/estate/catalogue.generated';
import { decodeGround, GROUND_NODATA, type GroundGrid } from '../../lib/estate/ground';
import { ESTATE_SITE_IDS, ESTATE_SITE_STOREYS, ESTATE_STOREY_FFL } from '../../lib/estate/ids';
import { parseNav, type EstateNav, type NavRoom } from '../../lib/estate/nav';
import { roomAnchor, roomGroups } from '../../lib/estate/plan';
import { parsePack, type EstatePack, type FileRef, type PackBuilding } from '../../lib/estate/schema';
import type {
  DrawingPoster, DrawingSheet, DrawingSite, DrawingSiteKind, DrawingSource,
} from '../../lib/drawings/types';

export const DRAWING_SET_SCHEMA = 'portfolio/drawing-set/1';
export const DRAWING_SHEET_SCHEMA = 'portfolio/drawing-sheet/1';

/** What the generator reads; readDrawingInputs collects it, buildDrawingSet never touches the disk. */
export interface DrawingInputs {
  packName: string;
  packBytes: Uint8Array;
  /** Pack-relative path ('nav/BLK_501.638ad0fa.json.gz') → the stored bytes. */
  files: Readonly<Record<string, Uint8Array>>;
  /** Each GENERATOR_SOURCES file (repo-relative path → text), for the digest the deploy gate checks. */
  generatorSources: Readonly<Record<string, string>>;
}

export interface DrawingSet {
  source: DrawingSource;
  credit: string;
  licenceUrl: string;
  poster: DrawingPoster;
  extent: readonly [number, number, number, number];
  sites: DrawingSite[];
  sheets: Record<string, DrawingSheet[]>;
  kerbs: number[];
  /** Counts the tests pin (not written to the modules). */
  stats: DrawingStats;
}

export interface DrawingStats {
  doors: number;
  /** Opening thickness (|o1| + |o2|, cm) → doors. */
  doorDepths: Record<number, number>;
  cores: Record<string, number>;
  voids: Record<string, number[]>;
  partial: string[];
  kerbMetres: number;
}

export const NOTE = 'A generated sample estate, not a real town or HDB’s own plans.';

/** What the drawings add to the data, all of it marked as inferred where it is drawn (LICENSE.txt lists the same). */
export const CHANGES: readonly string[] = [
  'Redrawn as line work from the pack’s room outlines, doors, stairs, lift landings, footprints and ground raster.',
  'Wall fill: the thin gaps between spaces inside the footprint (walls are not modelled in the data).',
  'Lift cores: the thick unroomed rectangle behind a bank of lift landings, labelled inferred.',
  'Open-air edges: the footprint beside a void or roof deck drawn as a slab edge, with no wall fill.',
  'Shared boundaries: spaces that meet with no gap between them, dashed.',
  'Doors drawn as openings with their jambs; the data holds no swing or hinge.',
  'Massing: the footprint extruded to the roof level, plus the roof’s enclosed rooms by their clear height.',
];

const LICENCE_URL = '/estate/LICENSE.txt';

// ---- inputs --------------------------------------------------------------------------

const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

/** A generator source's text with LF line endings: what generatorDigest hashes (core.autocrlf may hand us CRLF). */
export const generatorText = (source: string): string => source.replace(/\r\n/g, '\n');

/**
 * What generatorDigest covers: this file, then every module it reaches through a
 * relative value import, sorted. The set depends on their code as much as on this
 * file's (plan.ts groups the rooms and places their labels, nav.ts expands them,
 * ground.ts decodes the kerbs' raster, ids.ts holds the FFLs), so a change to any
 * of them makes the committed set stale. Type-only imports are erased and do not
 * count. scripts/check-bundle.mjs restates the list (DRAWING_GENERATOR_FILES);
 * tests/drawing-set.test.ts pins both to this file's imports.
 */
export const GENERATOR_SOURCES: readonly string[] = [
  'scripts/drawings/build.ts',
  'lib/estate/catalogue.generated.ts',
  'lib/estate/frames.ts',
  'lib/estate/ground.ts',
  'lib/estate/ids.ts',
  'lib/estate/nav.ts',
  'lib/estate/packBudgets.json',
  'lib/estate/palette.json',
  'lib/estate/palette.ts',
  'lib/estate/plan.ts',
  'lib/estate/schema.ts',
  'lib/estate/storeys.ts',
  'lib/estate/tiers.ts',
  'lib/estate/walk.ts',
];

/** sha256 over each GENERATOR_SOURCES file's path and LF text, NUL-separated, in that order (check-bundle's drawingGeneratorDigest). */
export const digestGenerator = (sources: Readonly<Record<string, string>>): string => {
  const hash = createHash('sha256');
  for (const rel of GENERATOR_SOURCES) hash.update(`${rel}\0${generatorText(sources[rel] ?? fail(`${rel} was not read`))}\0`);
  return hash.digest('hex');
};

export const readDrawingInputs = (root: string): DrawingInputs => {
  const packUrl = ESTATE_CATALOGUE.packUrl;
  const packPath = path.join(root, 'public', packUrl);
  const packDir = path.dirname(packPath);
  const packBytes = new Uint8Array(readFileSync(packPath));
  const pack = parsePack(JSON.parse(new TextDecoder().decode(packBytes)));
  const refs: FileRef[] = [];
  for (const site of pack.sites) if (site.nav) refs.push(site.nav);
  if (pack.site?.ground) refs.push(pack.site.ground);
  const files: Record<string, Uint8Array> = {};
  for (const ref of refs) files[ref.path] = new Uint8Array(readFileSync(path.join(packDir, ref.path)));
  return {
    packName: path.basename(packUrl),
    packBytes,
    files,
    generatorSources: Object.fromEntries(GENERATOR_SOURCES.map((rel) => [rel, readFileSync(path.join(root, ...rel.split('/')), 'utf8')])),
  };
};

const fail = (problem: string): never => {
  throw new Error(`drawing set: ${problem}`);
};

/** Stored pack bytes → the payload, checking both hashes, the gzip magic and the name's hash. */
const payload = (inputs: DrawingInputs, ref: FileRef): Uint8Array => {
  const stored = inputs.files[ref.path] ?? fail(`${ref.path} was not read`);
  if (sha256(stored) !== ref.gzSha256) fail(`${ref.path}: stored bytes do not match gzSha256`);
  if (stored[0] !== 0x1f || stored[1] !== 0x8b) fail(`${ref.path}: not gzip`);
  const raw = new Uint8Array(gunzipSync(stored));
  if (sha256(raw) !== ref.sha256) fail(`${ref.path}: inflated bytes do not match sha256`);
  if (!path.basename(ref.path).includes(`.${ref.sha256.slice(0, 8)}.`)) fail(`${ref.path}: name does not carry its hash`);
  return raw;
};

// ---- integers ------------------------------------------------------------------------

/** Metres → integer cm, refusing anything finer (the pack's plans are on a 1 cm grid). */
const cm = (m: number, what: string): number => {
  const v = Math.round(m * 100);
  if (Math.abs(v - m * 100) > 1e-6) fail(`${what}: ${m} m is not on the 1 cm grid`);
  return v === 0 ? 0 : v;
};

/** Metres → integer mm (stair flights carry 3 decimals). */
const mm = (m: number, what: string): number => {
  const v = Math.round(m * 1000);
  if (Math.abs(v - m * 1000) > 1e-6) fail(`${what}: ${m} m is not on the 1 mm grid`);
  return v === 0 ? 0 : v;
};

// ---- rings ---------------------------------------------------------------------------

type Pt = [number, number];

const signedArea2 = (ring: readonly Pt[]): number => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a;
};

/**
 * A plan polygon (metres) as an integer-cm ring: duplicate and collinear
 * vertices dropped, counter-clockwise, every edge axis-aligned and the axes
 * alternating (what the ring record needs).
 */
export const normaliseRing = (poly: readonly (readonly number[])[], what: string): Pt[] => {
  let pts: Pt[] = poly.map(([x, y], i) => [cm(x, `${what}[${i}].x`), cm(y, `${what}[${i}].y`)]);
  pts = pts.filter((p, i) => {
    const q = pts[(i + pts.length - 1) % pts.length];
    return p[0] !== q[0] || p[1] !== q[1];
  });
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (pts.length < 4 || pts.length % 2 !== 0) fail(`${what}: ${pts.length} vertices after normalising`);
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a[0] !== b[0] && a[1] !== b[1]) fail(`${what}: edge ${i} is not axis-aligned`);
  }
  const area = signedArea2(pts);
  if (area === 0) fail(`${what}: zero area`);
  if (area < 0) pts.reverse();
  return pts;
};

/** The ring record of `pts` entered at vertex `start`: n, f, x0, y0, then the first n−2 edge lengths. */
export const encodeRing = (pts: readonly Pt[], start = 0): number[] => {
  const n = pts.length;
  const v = (i: number) => pts[(start + i) % n];
  const f = v(0)[1] === v(1)[1] ? 0 : 1;
  const out = [n, f, v(0)[0], v(0)[1]];
  let axis = f;
  for (let i = 0; i < n - 2; i += 1) {
    out.push(v(i + 1)[axis] - v(i)[axis]);
    axis = 1 - axis;
  }
  return out;
};

/**
 * Rings concatenated into one array, each first vertex written relative to the
 * previous ring's (the first ring's to the origin): neighbouring rooms start
 * close together, so the numbers stay short.
 */
export const encodeRings = (rings: readonly { pts: readonly Pt[]; start: number }[]): number[] => {
  const out: number[] = [];
  let px = 0;
  let py = 0;
  for (const ring of rings) {
    const rec = encodeRing(ring.pts, ring.start);
    const x0 = rec[2];
    const y0 = rec[3];
    rec[2] = x0 - px;
    rec[3] = y0 - py;
    px = x0;
    py = y0;
    out.push(...rec);
  }
  return out;
};

/** Inverse of encodeRings (lib/drawings/decode.ts is the runtime twin; tests/drawing-set holds them together). */
export const decodeRings = (data: readonly number[]): Pt[][] => {
  const out: Pt[][] = [];
  let px = 0;
  let py = 0;
  for (let o = 0; o < data.length;) {
    const n = data[o];
    const f = data[o + 1];
    const x0 = px + data[o + 2];
    const y0 = py + data[o + 3];
    let axis = f;
    let x = x0;
    let y = y0;
    const pts: Pt[] = [[x, y]];
    for (let i = 0; i < n - 2; i += 1) {
      const d = data[o + 4 + i];
      if (axis === 0) x += d; else y += d;
      pts.push([x, y]);
      axis = 1 - axis;
    }
    // Edge n−2 runs along the first axis to the first vertex's line; edge n−1 closes.
    pts.push(f === 0 ? [x0, y] : [x, y0]);
    out.push(pts);
    px = x0;
    py = y0;
    o += 4 + (n - 2);
  }
  return out;
};

// ---- raster (generation-time classification of the unroomed space) --------------------

const CELL = 5; // cm

interface Raster { x0: number; y0: number; nx: number; ny: number; data: Uint8Array }

const makeRaster = (box: [number, number, number, number]): Raster => {
  const x0 = Math.floor(box[0] / CELL) * CELL - CELL;
  const y0 = Math.floor(box[1] / CELL) * CELL - CELL;
  const nx = Math.ceil((box[2] - x0) / CELL) + 1;
  const ny = Math.ceil((box[3] - y0) / CELL) + 1;
  return { x0, y0, nx, ny, data: new Uint8Array(nx * ny) };
};

/** Sets (or, with `add`, increments) every cell whose centre lies inside `ring` (scanline over the vertical edges). */
const fillRing = (r: Raster, ring: readonly Pt[], value: number, add = false) => {
  const edges: [number, number, number][] = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (a[0] === b[0] && a[1] !== b[1]) edges.push([a[0], Math.min(a[1], b[1]), Math.max(a[1], b[1])]);
    lo = Math.min(lo, a[1]);
    hi = Math.max(hi, a[1]);
  }
  const j0 = Math.max(0, Math.floor((lo - r.y0) / CELL));
  const j1 = Math.min(r.ny - 1, Math.ceil((hi - r.y0) / CELL));
  const xs: number[] = [];
  for (let j = j0; j <= j1; j += 1) {
    const yc = r.y0 + CELL * j + CELL / 2;
    xs.length = 0;
    for (const [x, ya, yb] of edges) if (ya < yc && yc < yb) xs.push(x);
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - r.x0 - CELL / 2) / CELL));
      const i1 = Math.min(r.nx - 1, Math.floor((xs[k + 1] - r.x0 - CELL / 2) / CELL));
      if (add) for (let c = j * r.nx + i0; c <= j * r.nx + i1; c += 1) r.data[c] += value;
      else r.data.fill(value, j * r.nx + i0, j * r.nx + i1 + 1);
    }
  }
};

/** Summed-area table of `cells` (1 where set). */
const integral = (r: Raster, cells: Uint8Array): Int32Array => {
  const w = r.nx + 1;
  const s = new Int32Array(w * (r.ny + 1));
  for (let j = 0; j < r.ny; j += 1) {
    let row = 0;
    for (let i = 0; i < r.nx; i += 1) {
      row += cells[j * r.nx + i] ? 1 : 0;
      s[(j + 1) * w + i + 1] = s[j * w + i + 1] + row;
    }
  }
  return s;
};

const boxSum = (s: Int32Array, w: number, i0: number, j0: number, i1: number, j1: number) =>
  s[j1 * w + i1] - s[j0 * w + i1] - s[j1 * w + i0] + s[j0 * w + i0];

/** Morphological opening by a k × k square: the union of every k × k window wholly inside `cells`. */
const opening = (r: Raster, cells: Uint8Array, k: number): Uint8Array => {
  const s = integral(r, cells);
  const w = r.nx + 1;
  const fits = new Uint8Array(r.nx * r.ny);
  for (let j = 0; j + k <= r.ny; j += 1) {
    for (let i = 0; i + k <= r.nx; i += 1) {
      if (boxSum(s, w, i, j, i + k, j + k) === k * k) fits[j * r.nx + i] = 1;
    }
  }
  const f = integral(r, fits);
  const out = new Uint8Array(r.nx * r.ny);
  for (let j = 0; j < r.ny; j += 1) {
    for (let i = 0; i < r.nx; i += 1) {
      if (boxSum(f, w, Math.max(0, i - k + 1), Math.max(0, j - k + 1), i + 1, j + 1) > 0) out[j * r.nx + i] = 1;
    }
  }
  return out;
};

interface Component { cells: number; i0: number; j0: number; i1: number; j1: number }

/** 4-connected components of the set cells, in scan order. */
const components = (r: Raster, cells: Uint8Array): Component[] => {
  const seen = new Uint8Array(cells.length);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < cells.length; start += 1) {
    if (!cells[start] || seen[start]) continue;
    const c: Component = { cells: 0, i0: Infinity, j0: Infinity, i1: -Infinity, j1: -Infinity };
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const at = stack.pop()!;
      const i = at % r.nx;
      const j = (at - i) / r.nx;
      c.cells += 1;
      c.i0 = Math.min(c.i0, i); c.i1 = Math.max(c.i1, i);
      c.j0 = Math.min(c.j0, j); c.j1 = Math.max(c.j1, j);
      for (const next of [i > 0 ? at - 1 : -1, i + 1 < r.nx ? at + 1 : -1, j > 0 ? at - r.nx : -1, j + 1 < r.ny ? at + r.nx : -1]) {
        if (next >= 0 && cells[next] && !seen[next]) { seen[next] = 1; stack.push(next); }
      }
    }
    out.push(c);
  }
  return out;
};

/** The nearest of `coords` to `v` within `reach`, or null. */
const snap = (coords: readonly number[], v: number, reach: number): number | null => {
  let best: number | null = null;
  for (const c of coords) if (Math.abs(c - v) <= reach && (best === null || Math.abs(c - v) < Math.abs(best - v))) best = c;
  return best;
};

// ---- sheets ----------------------------------------------------------------------------

/** Above this the unroomed space is thick: a lift core or a void, never a wall (max wall measured 0.27 m). */
const THICK_CELLS = 7; // 0.35 m
/** What must not fit in the wall fill once cores, voids and open-air strips are out. */
const THIN_CHECK_CELLS = 8; // 0.40 m
/** An open-air room this close to the footprint leaves a strip, not a wall. */
const BAND_REACH = 30; // cm
/** The smallest room the desk labels, m² (docs §3 Labels). */
export const LABEL_MIN_AREA = 9;
/** A door's faces: the nearest parallel edges on each side within this. */
const DOOR_REACH = 40; // cm

const tagOf = (site: string, i: number) => ESTATE_SITE_STOREYS[site as keyof typeof ESTATE_SITE_STOREYS][i];

const stairNumber = (room: string, fallback: number): number => {
  const m = /STAIR(\d+)/.exec(room);
  return m ? Number(m[1]) : fallback;
};

const liftNumber = (name: string, fallback: number): number => {
  const m = /(\d+)\s*$/.exec(name);
  return m ? Number(m[1]) : fallback;
};

const isLot = (label: string) => /^(Car|Motorcycle) lot\b/.test(label);

/** What the sheet prints for a room: its label, or nothing for a lot (counted instead; its label names the storey). */
const shownLabel = (room: NavRoom) => (isLot(room.label) ? '' : room.label);

/** 'L1-AM2' → 'AM2', '#05-101 B2' → 'B2', a lot → ''. */
const codeOf = (room: NavRoom): string => {
  if (isLot(room.label)) return '';
  if (room.flat && room.name.startsWith(`${room.flat} `)) return room.name.slice(room.flat.length + 1);
  return room.name.replace(/^(L\d+|RF)-/, '');
};

/** '#05-101' → '101'. */
const unitOf = (flat: string) => flat.replace(/^#\d+-/, '');

const commonest = (values: readonly number[]): number => {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0];
  for (const [v, n] of counts) if (n > (counts.get(best) ?? 0) || (n === counts.get(best) && v < best)) best = v;
  return best;
};

const dist2 = (a: readonly number[], b: readonly number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

const nearestVertex = (pts: readonly Pt[], p: readonly number[]): number => {
  let best = 0;
  for (let i = 1; i < pts.length; i += 1) if (dist2(pts[i], p) < dist2(pts[best], p)) best = i;
  return best;
};

interface RoomItem { room: NavRoom; index: number; pts: Pt[]; anchor: Pt }

interface Seg { axis: 0 | 1; k: number; lo: number; hi: number; owner: number }

const segmentsOf = (pts: readonly Pt[], owner: number): Seg[] => {
  const out: Seg[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a[1] === b[1]) out.push({ axis: 0, k: a[1], lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]), owner });
    else out.push({ axis: 1, k: a[0], lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]), owner });
  }
  return out;
};

const pointInPts = (x: number, y: number, pts: readonly Pt[]): boolean => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

interface SheetContext {
  site: PackBuilding;
  nav: EstateNav;
  fp: Pt[];
  storey: number;
  key: string;
  /** The typical sheet's cores, for a roof with no landings ("aligned below"). */
  coresBelow: readonly number[];
  stats: DrawingStats;
}

const buildSheet = (ctx: SheetContext): DrawingSheet => {
  const { site, nav, fp, storey, key } = ctx;
  const id = site.id;
  const tag = tagOf(id, storey);
  const what = `${id} ${key}`;
  const rooms = nav.rooms[storey];
  const items: RoomItem[] = rooms.map((room, index) => {
    const a = roomAnchor(room);
    return { room, index, pts: normaliseRing(room.poly, `${what} ${room.name}`), anchor: [Math.round(a[0] * 100), Math.round(a[1] * 100)] };
  });
  for (const it of items) if (it.room.label.includes('|') || codeOf(it.room).includes('|')) fail(`${what} ${it.room.name}: '|' in a label`);

  // Lift landings on this storey (facts), and the pen's origin.
  const landings: { n: number; x: number; y: number; fx: number; fy: number }[] = [];
  nav.lifts.forEach((lift, li) => {
    const l = lift.landings[tag];
    if (!l) return;
    const fx = Math.round(l.facing[0]);
    const fy = Math.round(l.facing[1]);
    if (Math.abs(fx) + Math.abs(fy) !== 1 || Math.abs(fx - l.facing[0]) > 1e-9 || Math.abs(fy - l.facing[1]) > 1e-9) fail(`${what} ${lift.name}: facing is not axis-aligned`);
    landings.push({ n: liftNumber(lift.name, li + 1), x: cm(l.xy[0], `${what} landing`), y: cm(l.xy[1], `${what} landing`), fx, fy });
  });
  const stairItems = items.filter((it) => /STAIR/.test(it.room.name));
  const fpBox = boxOf(fp);
  const origin: Pt = landings.length
    ? [Math.round(landings.reduce((s, l) => s + l.x, 0) / landings.length), Math.round(landings.reduce((s, l) => s + l.y, 0) / landings.length)]
    : stairItems.length
      ? [Math.round(stairItems.reduce((s, it) => s + it.anchor[0], 0) / stairItems.length), Math.round(stairItems.reduce((s, it) => s + it.anchor[1], 0) / stairItems.length)]
      : [Math.round((fpBox[0] + fpBox[2]) / 2), Math.round((fpBox[1] + fpBox[3]) / 2)];

  // Pen order: rooms outside any flat by distance from the lifts outwards, then
  // each flat in list order, nearest neighbour inside it.
  const groups = roomGroups(rooms);
  const common = items.filter((it) => !it.room.flat)
    .sort((a, b) => dist2(a.anchor, origin) - dist2(b.anchor, origin) || a.index - b.index);
  const flats = groups.filter((g) => rooms[g.rooms[0]].flat).map((g) => ({ name: g.name, items: g.rooms.map((i) => items[i]) }));
  const ordered: { it: RoomItem; start: number }[] = [];
  let pen: Pt = origin;
  for (const it of common) {
    const start = nearestVertex(it.pts, pen);
    ordered.push({ it, start });
    pen = it.pts[start];
  }
  const groupCounts = [common.length];
  const unitNames = [''];
  for (const flat of flats) {
    const left = [...flat.items];
    while (left.length) {
      let bi = 0;
      let bv = nearestVertex(left[0].pts, pen);
      for (let i = 1; i < left.length; i += 1) {
        const v = nearestVertex(left[i].pts, pen);
        if (dist2(left[i].pts[v], pen) < dist2(left[bi].pts[bv], pen)) { bi = i; bv = v; }
      }
      const [it] = left.splice(bi, 1);
      ordered.push({ it, start: bv });
      pen = it.pts[bv];
    }
    groupCounts.push(flat.items.length);
    unitNames.push(unitOf(flat.name));
  }
  if (ordered.length !== items.length) fail(`${what}: pen order lost a room`);

  const rings = encodeRings(ordered.map((o) => ({ pts: o.it.pts, start: o.start })));
  const heights = ordered.map((o) => cm(o.it.room.h, `${what} h`));
  const h = commonest(heights);
  const hx: number[] = [];
  heights.forEach((v, i) => { if (v !== h) hx.push(i, v); });
  const ext = ordered.flatMap((o, i) => (o.it.room.ext ? [i] : []));

  // Islands: a room wholly inside another (the car park roof's stairs in its garden).
  // Rooms never overlap otherwise (checked on the raster below), so a larger room
  // whose box holds this one's and whose outline holds its anchor is its host.
  const skip: number[] = [];
  ordered.forEach((o, i) => {
    const a = boxOf(o.it.pts);
    const host = ordered.some((p, j) => j !== i && p.it.room.area > o.it.room.area && contains(boxOf(p.it.pts), a)
      && pointInPts(o.it.anchor[0], o.it.anchor[1], p.it.pts));
    if (host) skip.push(i);
  });

  // ---- the unroomed space, classified on a 5 cm raster
  const r = makeRaster(fpBox);
  fillRing(r, fp, 1);
  const cover: Raster = { ...r, data: new Uint8Array(r.nx * r.ny) };
  for (const o of ordered) fillRing(cover, o.it.pts, 1, true);
  const roomCover = cover.data;
  const inFp = r.data;
  for (let c = 0; c < roomCover.length; c += 1) {
    if (roomCover[c] && !inFp[c]) fail(`${what}: a room lies outside the footprint`);
  }
  {
    // Overlaps only where a skipped island sits inside its host.
    const islands: Raster = { ...r, data: new Uint8Array(r.nx * r.ny) };
    for (const i of skip) fillRing(islands, ordered[i].it.pts, 1);
    for (let c = 0; c < roomCover.length; c += 1) if (roomCover[c] > 1 && !islands.data[c]) fail(`${what}: rooms overlap`);
  }
  const unroomed = new Uint8Array(r.nx * r.ny);
  let fpCells = 0;
  for (let c = 0; c < unroomed.length; c += 1) {
    if (inFp[c]) fpCells += 1;
    if (inFp[c] && !roomCover[c]) unroomed[c] = 1;
  }
  const thick = opening(r, unroomed, THICK_CELLS);
  let thickCells = 0;
  for (const v of thick) thickCells += v;
  const partial = thickCells > 0.25 * fpCells;

  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const s of [...segmentsOf(fp, -1), ...ordered.flatMap((o, i) => segmentsOf(o.it.pts, i))]) {
    if (s.axis === 0) ys.add(s.k); else xs.add(s.k);
  }
  const xList = [...xs].sort((a, b) => a - b);
  const yList = [...ys].sort((a, b) => a - b);

  const cores: number[] = [];
  const voids: number[] = [];
  const thickRects: number[][] = [];
  if (!partial) {
    for (const c of components(r, thick)) {
      const bx0 = r.x0 + CELL * c.i0;
      const by0 = r.y0 + CELL * c.j0;
      const bx1 = r.x0 + CELL * (c.i1 + 1);
      const by1 = r.y0 + CELL * (c.j1 + 1);
      const rect = [snap(xList, bx0, 6), snap(yList, by0, 6), snap(xList, bx1, 6), snap(yList, by1, 6)];
      if (rect.some((v) => v === null)) fail(`${what}: a thick unroomed region at (${bx0}, ${by0}) does not meet room edges`);
      const [x0, y0, x1, y1] = rect as number[];
      const boxCells = (c.i1 - c.i0 + 1) * (c.j1 - c.j0 + 1);
      if (c.cells / boxCells < 0.98) fail(`${what}: a thick unroomed region at (${x0}, ${y0}) is not a rectangle`);
      if (Math.min(x1 - x0, y1 - y0) < 100) fail(`${what}: a thick unroomed region at (${x0}, ${y0}) is narrower than 1 m`);
      thickRects.push([x0, y0, x1, y1]);
    }
    for (const [x0, y0, x1, y1] of thickRects) {
      // A lift core: the rectangle behind a bank of landings, as deep as a car and
      // as wide as its cars. A roof with no landings keeps the core of the storey
      // below where it lines up with it.
      const facing = landings.filter((l) => {
        const qx = l.x - 60 * l.fx;
        const qy = l.y - 60 * l.fy;
        return qx > x0 && qx < x1 && qy > y0 && qy < y1;
      });
      if (facing.length) {
        const depth = facing[0].fx !== 0 ? x1 - x0 : y1 - y0;
        const width = (facing[0].fx !== 0 ? y1 - y0 : x1 - x0) / facing.length;
        if (depth >= 150 && depth <= 350 && width >= 180 && width <= 320) cores.push(x0, y0, x1, y1, facing.length, 0);
        else voids.push(x0, y0, x1, y1);
        continue;
      }
      if (!landings.length) {
        let below = -1;
        for (let k = 0; k < ctx.coresBelow.length; k += 6) {
          const b = ctx.coresBelow;
          if (Math.abs(b[k] - x0) <= 5 && Math.abs(b[k + 1] - y0) <= 5 && Math.abs(b[k + 2] - x1) <= 5 && Math.abs(b[k + 3] - y1) <= 5) below = k;
        }
        if (below >= 0) {
          cores.push(x0, y0, x1, y1, ctx.coresBelow[below + 4], 1);
          continue;
        }
      }
      voids.push(x0, y0, x1, y1);
    }
  }

  // Strips between an open-air room and the footprint: no wall fill, and the
  // footprint beside them is a slab edge. Strips from neighbouring edges can
  // overlap at a stepped corner, so they are unioned into disjoint rectangles
  // (the wall fill is even-odd: an overlap would fill again).
  const strips: number[][] = [];
  const slabRaw: number[][] = [];
  if (!partial) {
    const fpSegs = segmentsOf(fp, -1);
    ordered.forEach((o) => {
      if (!o.it.room.ext) return;
      for (const e of segmentsOf(o.it.pts, 0)) {
        for (const g of fpSegs) {
          if (g.axis !== e.axis) continue;
          const d = g.k - e.k;
          if (d === 0 || Math.abs(d) > BAND_REACH) continue;
          const lo = Math.max(e.lo, g.lo);
          const hi = Math.min(e.hi, g.hi);
          if (hi <= lo) continue;
          // The strip must be outside the open-air room (on the footprint's side).
          const mid = (lo + hi) / 2;
          const probe = e.axis === 0 ? [mid, e.k + Math.sign(d) * 0.5] : [e.k + Math.sign(d) * 0.5, mid];
          if (pointInPts(probe[0], probe[1], o.it.pts)) continue;
          strips.push(e.axis === 0 ? [lo, Math.min(e.k, g.k), hi, Math.max(e.k, g.k)] : [Math.min(e.k, g.k), lo, Math.max(e.k, g.k), hi]);
          slabRaw.push([g.axis, g.k, lo, hi]);
        }
      }
    });
  }
  const bands = unionRects(strips).flat();
  const slabs = mergeSegments(slabRaw);

  // Check the classification on the raster: thick rectangles and strips are
  // wholly unroomed and disjoint, and what is left of the unroomed space is thin.
  if (!partial) {
    const taken = new Uint16Array(r.nx * r.ny);
    const rects: number[][] = [];
    for (let k = 0; k < cores.length; k += 6) rects.push(cores.slice(k, k + 4));
    for (let k = 0; k < voids.length; k += 4) rects.push(voids.slice(k, k + 4));
    for (let k = 0; k < bands.length; k += 4) rects.push(bands.slice(k, k + 4));
    rects.forEach((rect, ri) => {
      // The cells whose centres lie inside the rectangle.
      const i0 = Math.max(0, Math.ceil((rect[0] - r.x0 - CELL / 2) / CELL));
      const i1 = Math.min(r.nx - 1, Math.floor((rect[2] - r.x0 - CELL / 2) / CELL));
      const j0 = Math.max(0, Math.ceil((rect[1] - r.y0 - CELL / 2) / CELL));
      const j1 = Math.min(r.ny - 1, Math.floor((rect[3] - r.y0 - CELL / 2) / CELL));
      for (let j = j0; j <= j1; j += 1) {
        for (let c = j * r.nx + i0; c <= j * r.nx + i1; c += 1) {
          if (!unroomed[c]) fail(`${what}: the classified region [${rect}] covers a room`);
          if (taken[c]) fail(`${what}: classified regions [${rects[taken[c] - 1]}] and [${rect}] overlap`);
          taken[c] = ri + 1;
        }
      }
    });
    const wall = new Uint8Array(r.nx * r.ny);
    for (let c = 0; c < wall.length; c += 1) wall[c] = unroomed[c] && !taken[c] ? 1 : 0;
    const left = opening(r, wall, THIN_CHECK_CELLS);
    if (left.some((v) => v)) fail(`${what}: the wall fill has a region thicker than ${THIN_CHECK_CELLS * CELL} cm`);
  }

  // Space boundaries with no gap: overlapping collinear edges of two rooms.
  const segs = ordered.flatMap((o, i) => segmentsOf(o.it.pts, i));
  const byLine = new Map<string, Seg[]>();
  for (const s of segs) {
    const k = `${s.axis}:${s.k}`;
    (byLine.get(k) ?? byLine.set(k, []).get(k)!).push(s);
  }
  const sharedRaw: number[][] = [];
  for (const list of byLine.values()) {
    for (let a = 0; a < list.length; a += 1) {
      for (let b = a + 1; b < list.length; b += 1) {
        if (list[a].owner === list[b].owner) continue;
        const lo = Math.max(list[a].lo, list[b].lo);
        const hi = Math.min(list[a].hi, list[b].hi);
        if (hi > lo) sharedRaw.push([list[a].axis, list[a].k, lo, hi]);
      }
    }
  }
  const shared = mergeSegments(sharedRaw);

  // Openings: each door's faces, the nearest parallel edges on each side.
  const allSegs = [...segmentsOf(fp, -1), ...segs];
  const inAnyRoom = (x: number, y: number) => ordered.some((o) => pointInPts(x, y, o.it.pts));
  const doorRows: number[][] = [];
  for (const d of nav.doors[storey]) {
    const x = cm(d.x, `${what} door`);
    const y = cm(d.y, `${what} door`);
    const w = cm(d.w, `${what} door`);
    const axis: 0 | 1 = Math.abs(d.ax) > 0.5 ? 0 : 1;
    if (Math.abs(Math.abs(axis === 0 ? d.ax : d.ay) - 1) > 1e-9) fail(`${what}: a door is not axis-aligned`);
    const c = axis === 0 ? y : x;
    const s = axis === 0 ? x : y;
    const nearest = (sign: -1 | 1): number => {
      let best: number | null = null;
      for (const g of allSegs) {
        if (g.axis !== axis) continue;
        const off = g.k - c;
        if (sign * off <= 0 || Math.abs(off) > DOOR_REACH) continue;
        if (Math.min(g.hi, s + w / 2) - Math.max(g.lo, s - w / 2) <= 0) continue;
        if (best === null || Math.abs(off) < Math.abs(best)) best = off;
      }
      return best ?? 0;
    };
    // A side whose first 2 cm are a room (or outside) is the door line itself.
    const open = (sign: -1 | 1): boolean => {
      const px = axis === 0 ? s : c + sign * 2;
      const py = axis === 0 ? c + sign * 2 : s;
      return !inAnyRoom(px, py) && pointInPts(px, py, fp);
    };
    let o1 = open(-1) ? nearest(-1) : 0;
    let o2 = open(1) ? nearest(1) : 0;
    if (o1 === 0 && o2 === 0) {
      // Both sides read as rooms: a stair island inside the car park's roof garden,
      // whose outline runs over the island's walls. The nearer edge is the face.
      const below = nearest(-1);
      const above = nearest(1);
      if (below && (!above || -below <= above)) o1 = below; else o2 = above;
    }
    if (o2 - o1 <= 0 || o2 - o1 > DOOR_REACH) fail(`${what}: door at (${x}, ${y}) has opening depth ${o2 - o1} cm`);
    ctx.stats.doors += 1;
    ctx.stats.doorDepths[o2 - o1] = (ctx.stats.doorDepths[o2 - o1] ?? 0) + 1;
    doorRows.push([x, y, axis, w, o1, o2]);
  }
  doorRows.sort((p, q) => p[2] - q[2] || (p[2] === 0 ? p[1] - q[1] || p[0] - q[0] : p[0] - q[0] || p[1] - q[1]));
  const doors = doorRows.flat();

  // Stairs: flights up from this storey; on a storey nothing climbs from, the flights that arrive.
  const flightRows: number[][] = [];
  const up = nav.stairs.filter((s) => s.storey === tag);
  const list = up.length ? up : nav.stairs.filter((s) => s.to === tag);
  const dir = up.length ? 1 : -1;
  list.forEach((s, si) => {
    const span = s.flights[s.flights.length - 1].end[2] - s.flights[0].start[2];
    if (Math.abs(span - (s.toFfl - s.fromFfl)) > 0.001) fail(`${what} ${s.name}: flights rise ${span} m over a ${s.toFfl - s.fromFfl} m storey`);
    const n = stairNumber(s.room, si + 1);
    for (const f of s.flights) {
      flightRows.push([n, mm(f.start[0], `${what} flight`), mm(f.start[1], `${what} flight`), mm(f.end[0], `${what} flight`), mm(f.end[1], `${what} flight`),
        mm(f.width, `${what} flight`), f.risers, mm(f.riser, `${what} flight`), dir]);
    }
  });
  const flights = flightRows.flat();

  if (key === 'TYP') {
    // The typical sheet stands for every typical storey: the same rooms, doors, flights and landings.
    const t0 = nav.storeys.findIndex((s) => s.geom === 'typical');
    nav.storeys.forEach((s, si) => {
      if (s.geom !== 'typical' || si === t0) return;
      if (nav.rooms[si].length !== nav.rooms[t0].length || nav.rooms[si].some((room, i) => room.poly !== nav.rooms[t0][i].poly || shownLabel(room) !== shownLabel(nav.rooms[t0][i]))) {
        fail(`${what}: ${s.tag} differs from the typical plan`);
      }
      if (JSON.stringify(nav.doors[si]) !== JSON.stringify(nav.doors[t0])) fail(`${what}: ${s.tag} doors differ from the typical plan`);
      const dz = s.ffl - nav.storeys[t0].ffl;
      const a = nav.stairs.filter((st) => st.storey === s.tag).flatMap((st) => st.flights.map((f) => [f.start[0], f.start[1], f.start[2] - dz, f.end[0], f.end[1], f.end[2] - dz]));
      const b = nav.stairs.filter((st) => st.storey === tagOf(id, t0)).flatMap((st) => st.flights.map((f) => [f.start[0], f.start[1], f.start[2], f.end[0], f.end[1], f.end[2]]));
      // A flight more or fewer, or a lift that stops on one typical storey and not another, is a
      // different plan too: the sheet would draw the typical storey's flights and landings for it.
      if (a.length !== b.length) fail(`${what}: ${s.tag} has ${a.length} stair flights up, the typical plan ${b.length}`);
      if (a.some((row, i) => row.some((v, j) => Math.abs(v - b[i][j]) > 0.001))) fail(`${what}: ${s.tag} stairs differ from the typical plan`);
      for (const lift of nav.lifts) {
        const p = lift.landings[s.tag];
        const q = lift.landings[tagOf(id, t0)];
        if (Boolean(p) !== Boolean(q)) fail(`${what}: ${lift.name} lands on ${p ? s.tag : tagOf(id, t0)} but not on ${p ? tagOf(id, t0) : s.tag}`);
        if (p && q && (p.xy[0] !== q.xy[0] || p.xy[1] !== q.xy[1])) fail(`${what}: ${s.tag} ${lift.name} landing differs from the typical plan`);
      }
    });
  }

  const codes = ordered.map((o) => codeOf(o.it.room)).join('|');
  const labels = ordered.map((o) => shownLabel(o.it.room)).join('|');
  // Only a room that may carry a label needs its anchor: a named room of at least LABEL_MIN_AREA.
  const anchors = ordered.flatMap((o, i) => (shownLabel(o.it.room) && o.it.room.area >= LABEL_MIN_AREA ? [i, ...o.it.anchor] : []));
  const lots: [number, number] = [
    rooms.filter((room) => /^Car lot\b/.test(room.label)).length,
    rooms.filter((room) => /^Motorcycle lot\b/.test(room.label)).length,
  ];
  const tags = ESTATE_SITE_STOREYS[id as keyof typeof ESTATE_SITE_STOREYS];
  const covered = tags.filter((_, si) => (key === 'TYP' ? nav.storeys[si].geom === 'typical' : si === storey));
  ctx.stats.cores[`${id} ${key}`] = cores.length / 6;
  ctx.stats.voids[`${id} ${key}`] = Array.from({ length: voids.length / 4 }, (_, k) =>
    Math.round(((voids[4 * k + 2] - voids[4 * k]) * (voids[4 * k + 3] - voids[4 * k + 1])) / 1000) / 10);
  if (partial) ctx.stats.partial.push(`${id} ${key}`);
  return {
    key,
    storeys: covered.length > 1 ? `${covered[0]}–${covered[covered.length - 1]}` : covered[0],
    count: covered.length,
    h,
    rings,
    hx,
    ext,
    skip,
    codes,
    labels,
    anchors,
    groups: groupCounts,
    units: unitNames.join('|'),
    shared,
    doors,
    flights,
    lifts: landings.flatMap((l) => [l.n, l.x, l.y, l.fx, l.fy]),
    cores,
    voids,
    bands,
    slabs,
    partial,
    lots,
  };
};

/** Collinear segments [axis, k, lo, hi] merged where they overlap or touch, as [axis, k, lo, len], sorted. */
const mergeSegments = (raw: number[][]): number[] => {
  const sorted = [...raw].sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);
  const out: number[] = [];
  for (const [axis, k, lo, hi] of sorted) {
    const n = out.length;
    if (n && out[n - 4] === axis && out[n - 3] === k && out[n - 2] + out[n - 1] >= lo) {
      out[n - 1] = Math.max(out[n - 2] + out[n - 1], hi) - out[n - 2];
    } else out.push(axis, k, lo, hi - lo);
  }
  return out;
};

/** The union of axis-aligned rectangles as disjoint ones: rows between the distinct y's, merged runs, then stacked rows merged. */
const unionRects = (rects: readonly number[][]): number[][] => {
  const ys = [...new Set(rects.flatMap((r) => [r[1], r[3]]))].sort((a, b) => a - b);
  const out: number[][] = [];
  let open = new Map<string, number[]>();
  for (let j = 0; j + 1 < ys.length; j += 1) {
    const ya = ys[j];
    const yb = ys[j + 1];
    const runs = rects.filter((r) => r[1] <= ya && r[3] >= yb).map((r) => [r[0], r[2]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged: number[][] = [];
    for (const run of runs) {
      const last = merged[merged.length - 1];
      if (last && run[0] <= last[1]) last[1] = Math.max(last[1], run[1]);
      else merged.push([...run]);
    }
    const next = new Map<string, number[]>();
    for (const [x0, x1] of merged) {
      const key = `${x0}:${x1}`;
      const prev = open.get(key);
      if (prev && prev[3] === ya) { prev[3] = yb; next.set(key, prev); open.delete(key); }
      else next.set(key, [x0, ya, x1, yb]);
    }
    for (const rect of open.values()) out.push(rect);
    open = next;
  }
  for (const rect of open.values()) out.push(rect);
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};

const boxOf = (pts: readonly Pt[]): [number, number, number, number] => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
};

const contains = (outer: readonly number[], inner: readonly number[]) =>
  outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];

// ---- kerbs: the road edge from the ground raster -------------------------------------

/** A cell is road where the ground lies at least 10 cm below the paving. */
const ROAD_BELOW_CM = -10;

/**
 * Marching squares over the ground cells' centres with the predicate "road";
 * squares touching a nodata cell are skipped, so no line is drawn along the
 * building aprons. Crossings sit at the midpoints between centres: on a 0.25 m
 * lattice, so the polylines are integers in 25 cm units. Chains start from
 * their open ends in key order, then the closed loops; collinear points go.
 */
export const kerbLines = (ground: GroundGrid): number[][] => {
  const { nx, ny, heights } = ground;
  if (ground.cell !== 0.5 || ground.loX !== 0 || ground.loY !== 0) fail('the ground grid is not 0.5 m cells from the origin');
  const road = (i: number, j: number) => heights[j * nx + i] <= ROAD_BELOW_CM;
  const nodata = (i: number, j: number) => heights[j * nx + i] === GROUND_NODATA;
  const key = (x: number, y: number) => y * 4096 + x;
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  for (let j = 0; j + 1 < ny; j += 1) {
    for (let i = 0; i + 1 < nx; i += 1) {
      if (nodata(i, j) || nodata(i + 1, j) || nodata(i + 1, j + 1) || nodata(i, j + 1)) continue;
      const idx = (road(i, j) ? 1 : 0) | (road(i + 1, j) ? 2 : 0) | (road(i + 1, j + 1) ? 4 : 0) | (road(i, j + 1) ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const B = key(2 + 2 * i, 1 + 2 * j);
      const R = key(3 + 2 * i, 2 + 2 * j);
      const T = key(2 + 2 * i, 3 + 2 * j);
      const L = key(1 + 2 * i, 2 + 2 * j);
      switch (idx) {
        case 1: case 14: link(L, B); break;
        case 2: case 13: link(B, R); break;
        case 3: case 12: link(L, R); break;
        case 4: case 11: link(R, T); break;
        case 6: case 9: link(B, T); break;
        case 7: case 8: link(L, T); break;
        case 5: link(L, B); link(R, T); break;
        case 10: link(B, R); link(T, L); break;
        default: break;
      }
    }
  }
  const used = new Set<string>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const walk = (from: number): number[] => {
    const chain = [from];
    let at = from;
    for (;;) {
      const next = (adj.get(at) ?? []).filter((n) => !used.has(edgeKey(at, n))).sort((a, b) => a - b)[0];
      if (next === undefined) break;
      used.add(edgeKey(at, next));
      chain.push(next);
      at = next;
      if (next === from) break;
    }
    return chain;
  };
  const keys = [...adj.keys()].sort((a, b) => a - b);
  const chains: number[][] = [];
  for (const k of keys) if ((adj.get(k) ?? []).length === 1 && (adj.get(k) ?? []).some((n) => !used.has(edgeKey(k, n)))) chains.push(walk(k));
  for (const k of keys) if ((adj.get(k) ?? []).some((n) => !used.has(edgeKey(k, n)))) chains.push(walk(k));
  const out: number[][] = [];
  for (const chain of chains) {
    const pts = chain.map((k) => [k % 4096, Math.floor(k / 4096)]);
    const kept = pts.filter((p, i) => {
      if (i === 0 || i === pts.length - 1) return true;
      const a = pts[i - 1];
      const b = pts[i + 1];
      return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]) || ((p[0] - a[0]) * (b[1] - p[1]) === (p[1] - a[1]) * (b[0] - p[0])));
    });
    let length = 0;
    for (let i = 1; i < kept.length; i += 1) length += Math.hypot(kept[i][0] - kept[i - 1][0], kept[i][1] - kept[i - 1][1]) * 0.25;
    if (length < 2) continue;
    out.push(kept.flat());
  }
  return out;
};

// ---- the set ----------------------------------------------------------------------------

const SHORT: Record<DrawingSiteKind, (name: string, id: string) => string> = {
  block: (_name, id) => `BLK ${id.slice(4)}`,
  mscp: (_name, id) => `MSCP ${id.slice(5)}`,
  nc: (_name, id) => `NC ${id.slice(3)}`,
};

export const buildDrawingSet = (inputs: DrawingInputs): DrawingSet => {
  const pack: EstatePack = parsePack(JSON.parse(new TextDecoder().decode(inputs.packBytes)));
  if (pack.edition !== ESTATE_CATALOGUE.edition) fail(`pack edition ${pack.edition} is not the catalogue's ${ESTATE_CATALOGUE.edition}`);
  if (pack.source.commit !== ESTATE_CATALOGUE.commit) fail('the pack and the catalogue name different commits');
  const view = pack.views.aerialNE ?? fail('the pack has no aerialNE view');
  const stats: DrawingStats = { doors: 0, doorDepths: {}, cores: {}, voids: {}, partial: [], kerbMetres: 0 };
  const sites: DrawingSite[] = [];
  const sheets: Record<string, DrawingSheet[]> = {};
  let flats = 0;
  let storeys = 0;
  pack.sites.forEach((site, si) => {
    if (site.id !== ESTATE_SITE_IDS[si]) fail(`site ${si} is ${site.id}, not ${ESTATE_SITE_IDS[si]}`);
    const ref = site.nav ?? fail(`${site.id} has no nav file`);
    const nav = parseNav(JSON.parse(new TextDecoder().decode(payload(inputs, ref))), site.id);
    const fp = normaliseRing(site.footprint, `${site.id} footprint`);
    const fflM = ESTATE_STOREY_FFL[site.id];
    nav.storeys.forEach((s, i) => { if (Math.abs(s.ffl - fflM[i]) > 0.0005) fail(`${site.id} ${s.tag}: FFL differs from ids.ts`); });
    site.storeys.forEach((s, i) => { if (Math.abs(s.ffl - fflM[i]) > 0.0005) fail(`${site.id} ${s.tag}: pack FFL differs from ids.ts`); });
    const last = nav.storeys.length - 1;
    const typical = nav.storeys.findIndex((s) => s.geom === 'typical');
    const plan: string[] = [];
    const keys: string[] = [];
    const list: DrawingSheet[] = [];
    const add = (key: string, storey: number) => {
      const sheet = buildSheet({ site, nav, fp, storey, key, coresBelow: list.find((s) => s.key === 'TYP')?.cores ?? [], stats });
      keys.push(key);
      list.push(sheet);
    };
    if (nav.rooms[0].length) add('L1', 0);
    if (typical >= 0) add('TYP', typical);
    for (let i = 1; i <= last; i += 1) {
      if (nav.storeys[i].geom === 'typical' || !nav.rooms[i].length) continue;
      add(i === last ? 'RF' : nav.storeys[i].tag, i);
    }
    nav.storeys.forEach((s, i) => {
      const key = s.geom === 'typical' ? 'TYP' : i === 0 ? 'L1' : i === last ? 'RF' : s.tag;
      const at = keys.indexOf(key);
      plan.push(at < 0 || (s.geom !== 'typical' && !nav.rooms[i].length) ? '-' : String(at));
    });
    const flatSet = new Set<string>();
    nav.rooms.forEach((rs) => rs.forEach((room) => { if (room.flat) flatSet.add(room.flat); }));
    flats += flatSet.size;
    storeys += nav.storeys.length;
    const roof = nav.rooms[last].filter((room) => !room.ext);
    const caps = encodeRings(roof.map((room) => ({ pts: normaliseRing(room.poly, `${site.id} RF ${room.name}`), start: 0 })));
    const capsH = roof.map((room) => cm(room.h, `${site.id} RF h`));
    const catalogueSite = ESTATE_CATALOGUE.sites[si];
    sites.push({
      id: site.id,
      name: site.name,
      short: SHORT[site.kind](site.name, site.id),
      kind: site.kind,
      typology: site.typology,
      at: [cm(site.at[0], `${site.id} at`), cm(site.at[1], `${site.id} at`)],
      fp: encodeRings([{ pts: fp, start: 0 }]),
      ffl: fflM.map((v) => cm(v, `${site.id} ffl`)),
      top: Math.round(site.roofTop * 100),
      caps,
      capsH,
      sheets: keys,
      plan: plan.join(''),
      flats: flatSet.size,
      levels: catalogueSite.levels,
    });
    sheets[site.id] = list;
  });
  if (flats !== pack.estate.flats || flats !== 1206) fail(`${flats} flats, not ${pack.estate.flats}`);
  if (storeys !== pack.estate.storeys || storeys !== 245) fail(`${storeys} storeys, not ${pack.estate.storeys}`);
  if (pack.licence.url !== LICENCE_URL) fail(`licence url ${pack.licence.url}`);

  const groundRef = pack.site?.ground ?? fail('the pack has no ground raster');
  const kerbs = kerbLines(decodeGround(payload(inputs, groundRef)));
  const kerbData: number[] = [];
  for (const line of kerbs) {
    const n = line.length / 2;
    kerbData.push(n, line[0], line[1]);
    for (let i = 1; i < n; i += 1) {
      kerbData.push(line[2 * i] - line[2 * i - 2], line[2 * i + 1] - line[2 * i - 1]);
      stats.kerbMetres += Math.hypot(line[2 * i] - line[2 * i - 2], line[2 * i + 1] - line[2 * i - 1]) * 0.25;
    }
  }
  stats.kerbMetres = Math.round(stats.kerbMetres);

  return {
    source: {
      packName: inputs.packName,
      packSha256: sha256(inputs.packBytes),
      edition: pack.edition,
      commit: pack.source.commit,
      dev: pack.source.dev === true,
      generatorDigest: digestGenerator(inputs.generatorSources),
    },
    credit: pack.licence.attribution,
    licenceUrl: pack.licence.url,
    poster: { eye: view.eye, quat: view.quat, vfovDeg: view.vfovDeg, shift: view.shift, aspect: view.aspect, w: ESTATE_CATALOGUE.poster.w, h: ESTATE_CATALOGUE.poster.h },
    extent: [pack.estate.extent[0] * 100, pack.estate.extent[1] * 100, pack.estate.extent[2] * 100, pack.estate.extent[3] * 100],
    sites,
    sheets,
    kerbs: kerbData,
    stats,
  };
};

// ---- the modules ---------------------------------------------------------------------------

const HEADER = (what: string) => [
  `// Generated by scripts/drawings/build.ts (npm run drawings) from the committed estate pack: ${what}.`,
  '// Do not edit: regenerate it (docs/portfolio/desk-drawing-set.md). tests/drawing-set.test.ts and',
  '// scripts/check-bundle.mjs fail while it is stale.',
].join('\n');

/** A number array as wrapped source text, one line per ≤ 110 characters. */
const numbers = (values: readonly number[], indent: string): string => {
  if (!values.length) return '[]';
  const lines: string[] = [];
  let line = '';
  for (const v of values) {
    const piece = `${v},`;
    if (line.length + piece.length > 110) { lines.push(line); line = ''; }
    line += piece;
  }
  lines.push(line);
  return `[\n${lines.map((l) => `${indent}  ${l}`).join('\n')}\n${indent}]`;
};

const str = (s: string) => JSON.stringify(s);

const siteText = (s: DrawingSite) => [
  '  {',
  `    id: ${str(s.id)}, name: ${str(s.name)}, short: ${str(s.short)}, kind: ${str(s.kind)}, typology: ${s.typology === null ? 'null' : str(s.typology)},`,
  `    at: [${s.at[0]}, ${s.at[1]}], top: ${s.top}, flats: ${s.flats}, levels: ${str(s.levels)},`,
  `    sheets: [${s.sheets.map(str).join(', ')}], plan: ${str(s.plan)},`,
  `    ffl: ${numbers(s.ffl, '    ')},`,
  `    fp: ${numbers(s.fp, '    ')},`,
  `    caps: ${numbers(s.caps, '    ')},`,
  `    capsH: [${s.capsH.join(', ')}],`,
  '  },',
].join('\n');

const sheetText = (s: DrawingSheet) => [
  '  {',
  `    key: ${str(s.key)}, storeys: ${str(s.storeys)}, count: ${s.count}, h: ${s.h}, partial: ${s.partial}, lots: [${s.lots[0]}, ${s.lots[1]}],`,
  `    groups: [${s.groups.join(', ')}],`,
  `    units: ${str(s.units)},`,
  `    codes: ${str(s.codes)},`,
  `    labels: ${str(s.labels)},`,
  `    rings: ${numbers(s.rings, '    ')},`,
  `    hx: ${numbers(s.hx, '    ')},`,
  `    ext: ${numbers(s.ext, '    ')},`,
  `    skip: ${numbers(s.skip, '    ')},`,
  `    anchors: ${numbers(s.anchors, '    ')},`,
  `    shared: ${numbers(s.shared, '    ')},`,
  `    doors: ${numbers(s.doors, '    ')},`,
  `    flights: ${numbers(s.flights, '    ')},`,
  `    lifts: ${numbers(s.lifts, '    ')},`,
  `    cores: ${numbers(s.cores, '    ')},`,
  `    voids: ${numbers(s.voids, '    ')},`,
  `    bands: ${numbers(s.bands, '    ')},`,
  `    slabs: ${numbers(s.slabs, '    ')},`,
  '  },',
].join('\n');

export interface DrawingFile { path: string; text: string }

/** The exact text of every generated module, paths relative to the repo root. */
export const drawingFiles = (set: DrawingSet): DrawingFile[] => {
  const p = set.poster;
  const site = [
    HEADER('the site plan, the poster camera and each building\'s footprint and levels'),
    `// ${set.credit}; redrawn (CHANGES).`,
    '',
    "import type { DrawingPoster, DrawingSite, DrawingSource, PolylineData } from './types';",
    '',
    `export const DRAWING_SET_SCHEMA = ${str(DRAWING_SET_SCHEMA)};`,
    '',
    'export const DRAWING_SOURCE: DrawingSource = {',
    `  packName: ${str(set.source.packName)},`,
    `  packSha256: ${str(set.source.packSha256)},`,
    `  edition: ${str(set.source.edition)},`,
    `  commit: ${str(set.source.commit)},`,
    `  dev: ${set.source.dev},`,
    `  generatorDigest: ${str(set.source.generatorDigest)},`,
    '};',
    '',
    `export const CREDIT = ${str(set.credit)};`,
    `export const LICENCE_URL = ${str(set.licenceUrl)};`,
    `export const NOTE = ${str(NOTE)};`,
    'export const CHANGES: readonly string[] = [',
    ...CHANGES.map((c) => `  ${str(c)},`),
    '];',
    '',
    'export const POSTER: DrawingPoster = {',
    `  eye: [${p.eye.join(', ')}], quat: [${p.quat.join(', ')}],`,
    `  vfovDeg: ${p.vfovDeg}, shift: [${p.shift.join(', ')}], aspect: ${p.aspect}, w: ${p.w}, h: ${p.h},`,
    '};',
    '',
    `export const EXTENT: readonly [number, number, number, number] = [${set.extent.join(', ')}];`,
    '',
    'export const SITES: readonly DrawingSite[] = [',
    ...set.sites.map(siteText),
    '];',
    '',
    '/** Kerb lines (the road edge), estate frame, 25 cm units: per polyline n, x0, y0, then n − 1 steps. */',
    `export const KERBS: PolylineData = ${numbers(set.kerbs, '')};`,
    '',
  ].join('\n');
  const files: DrawingFile[] = [{ path: 'lib/drawings/site.generated.ts', text: site }];
  for (const s of set.sites) {
    files.push({
      path: `lib/drawings/sheets/${s.id}.generated.ts`,
      text: [
        HEADER(`${s.name}'s plans`),
        '',
        "import type { DrawingSheet } from '../types';",
        '',
        `export const DRAWING_SHEET_SCHEMA = ${str(DRAWING_SHEET_SCHEMA)};`,
        `export const SITE_ID = ${str(s.id)};`,
        '',
        'export const SHEETS: readonly DrawingSheet[] = [',
        ...set.sheets[s.id].map(sheetText),
        '];',
        '',
      ].join('\n'),
    });
  }
  files.push({
    path: 'lib/drawings/sheetLoaders.generated.ts',
    text: [
      HEADER('one lazy chunk per building'),
      '',
      "import type { DrawingSheet } from './types';",
      '',
      'export interface SheetModule { DRAWING_SHEET_SCHEMA: string; SITE_ID: string; SHEETS: readonly DrawingSheet[] }',
      '',
      'export const SHEET_LOADERS: Readonly<Record<string, () => Promise<SheetModule>>> = {',
      ...set.sites.map((s) => `  ${s.id}: () => import('./sheets/${s.id}.generated'),`),
      '};',
      '',
    ].join('\n'),
  });
  return files;
};
