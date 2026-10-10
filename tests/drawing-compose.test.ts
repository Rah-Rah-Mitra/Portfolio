import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CELL, coveredShare, freeRegions, largestFree, MIN_COLS, MIN_ROWS, occupancy, qualifies, sheetRegions, type Box, type Grid, type Region,
} from '../lib/drawings/occupancy';
import {
  chipBeside, chipBox, drawingArea, placePlan, posterInRegion, SCALE_LADDER, snapToGrid, type Bands, type Extent,
} from '../lib/drawings/compose';
import { basis, DEG, NORTH_UP, planPose, project, pxPerMetre, type Pose } from '../lib/drawings/project';
import { boundsOf, decodeRings } from '../lib/drawings/decode';
import { posterBox, sceneOf } from '../lib/drawings/scene';
import { EXTENT, KERBS, POSTER, SITES } from '../lib/drawings/site.generated';

// Where the desk drawing set may draw, and how a sheet sits there
// (docs/portfolio/desk-drawing-set.md §3 "Window-aware placement";
// lib/drawings/occupancy.ts, lib/drawings/compose.ts). The desk is its own 24 px
// grid, rows counted from the bottom edge the grid's lines are anchored to; a
// sheet takes a maximal free rectangle of at least 11 × 8 squares, at a scale
// that makes one square a whole number of metres, with the building's origin on
// a grid crossing — so the desk's grid is the drawing's metre grid. This file
// pins those rules, and the plan's laptop promise against the REAL boot layout
// (index.css, FieldWorkbench's DEFAULT_BOUNDS and applyBounds): every 1280–1536
// px boot parks (the layer chunk never downloads the drawing), 1920 × 1080 has
// the right and bottom bands.

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/** Deterministic PRNG (mulberry32), so the brute-force comparisons are reproducible. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const key = (r: Pick<Region, 'col' | 'row' | 'cols' | 'rows'>) => `${r.col},${r.row} ${r.cols}x${r.rows}`;
const isFree = (g: Grid, c: number, r: number) => c >= 0 && r >= 0 && c < g.cols && r < g.rows && g.free[r * g.cols + c] === 1;
const allFree = (g: Grid, c0: number, r0: number, w: number, h: number) => {
  for (let r = r0; r < r0 + h; r += 1) for (let c = c0; c < c0 + w; c += 1) if (!isFree(g, c, r)) return false;
  return true;
};
/** Every maximal all-free rectangle, by brute force: free, and blocked (or the edge) on all four sides. */
const bruteMaximal = (g: Grid): string[] => {
  const out: string[] = [];
  for (let r0 = 0; r0 < g.rows; r0 += 1) for (let c0 = 0; c0 < g.cols; c0 += 1) {
    for (let h = 1; r0 + h <= g.rows; h += 1) for (let w = 1; c0 + w <= g.cols; w += 1) {
      if (!allFree(g, c0, r0, w, h)) continue;
      if (allFree(g, c0 - 1, r0, 1, h) || allFree(g, c0 + w, r0, 1, h) || allFree(g, c0, r0 - 1, w, 1) || allFree(g, c0, r0 + h, w, 1)) continue;
      out.push(key({ col: c0, row: r0, cols: w, rows: h }));
    }
  }
  return out.sort();
};
const contains = (a: Region, b: Region) =>
  a.col <= b.col && a.row <= b.row && a.col + a.cols >= b.col + b.cols && a.row + a.rows >= b.row + b.rows;

/** A desk with no obstacles: one region, the whole grid. */
const emptyRegion = (w: number, h: number): Region => freeRegions(occupancy(w, h, []))[0];

const extentOf = (id: string): Extent => {
  const site = SITES.find((s) => s.id === id);
  if (!site) throw new Error(`no site ${id}`);
  const b = boundsOf(decodeRings(site.fp));
  return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
};

const projectAt = (pose: Pose, frame: Box, X: number, Y: number) => {
  const out = [0, 0];
  expect(project(pose, basis(pose), frame, X, Y, 0, out)).toBe(true);
  return out;
};

/** The projected box of an extent's corners. */
const projectedBox = (pose: Pose, frame: Box, e: Extent): Box => {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [X, Y] of [[e.x0, e.y0], [e.x1, e.y0], [e.x1, e.y1], [e.x0, e.y1]]) {
    const [x, y] = projectAt(pose, frame, X, Y);
    xs.push(x);
    ys.push(y);
  }
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

const nearInteger = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;

// ---- the real boot layout -------------------------------------------------------------------------
//
// The desk is the viewport less the header (index.css .wb-header, 46 px, border
// included: box-sizing is border-box everywhere) above and the tool rail
// (.wb-rail, 96 px) on the left; .wb-frame gives the desk the rest (Chromium:
// 1024 × 768 → desk 928 × 722 at (96, 46)). The boot windows (INITIAL_OPEN:
// Home and the Estate) sit where applyBounds clamps their DEFAULT_BOUNDS
// (the Estate's CSS restates that clamp, so hydration moves nothing):
//
//   viewport     desk         Home                     Estate
//   1280 × 720   1184 × 674   {150, 30, 900, 620}      {120, 10, 1040, 640}
//   1366 × 768   1270 × 722   {150, 48, 900, 620}      {206, 58, 1040, 640}
//   1440 × 900   1344 × 854   {150, 48, 900, 620}      {280, 96, 1040, 640}
//   1536 × 864   1440 × 818   {150, 48, 900, 620}      {376, 96, 1040, 640}
//   1920 × 1080  1824 × 1034  {150, 48, 900, 620}      {420, 96, 1040, 640}
//
// The rest of the obstacles readDesk (lib/drawings/deskWatch.ts) reads, desk px
// (W × H the desk): positions from index.css, text-bound sizes measured in
// Chromium with the fonts loaded (they do not depend on the viewport):
//   .wb-shortcuts  {22, 18, 200, 408.85}            two 96 px columns + 8 px gap, 11 apps in 6 rows
//   .wb-hint       {24, H − 14 − 15.5, 579.1, 15.5}  one line
//   .wb-plate      {W − 26 − 308, H − 22 − 88.8 − 13, 308, 88.8 + 13}  3 rows + the 13 px caption reserve
//   .ask-dock      {FX x − 8 − 135.92, 0, 135.92, 36.05}   position: fixed in the .docks rail, hung from the header
//   .effects-dock  {W − 18 − 109.25, 0, 109.25, 36.05}      (badges only, 47.89 and 50.03 wide, on a desk ≤ 755 px tall)
// (.wb-backdrop-caption renders only with N-body or fluid on: not at boot.)

const css = read('index.css');
const workbench = read('components/workbench/FieldWorkbench.tsx');
const deskWatch = read('lib/drawings/deskWatch.ts');

const rule = (selector: string): string => {
  const m = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (!m) throw new Error(`index.css has no rule ${selector}`);
  return m[1];
};
const length = (selector: string, prop: string): number => {
  const m = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*(-?[\\d.]+)(px|rem)\\b`).exec(rule(selector));
  if (!m) throw new Error(`${selector} has no ${prop}`);
  return Number(m[1]) * (m[2] === 'rem' ? 16 : 1);
};
const tsBlock = (name: string): string => {
  const m = new RegExp(`const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`).exec(workbench);
  if (!m) throw new Error(`FieldWorkbench.tsx has no ${name}`);
  return m[1];
};

const MEASURED = {
  shortcutsH: 408.85, hintW: 579.1, hintH: 15.5, plateH: 88.8,
  aiDockW: 135.92, fxDockW: 109.25, dockH: 36.05,
  // Badges only, on a viewport no taller than the short-desk query.
  aiBadgeW: 47.89, fxBadgeW: 50.03,
};

const LAYOUT = (() => {
  const header = length('.wb-header', 'height');
  const rail = length('.wb-rail', 'width');
  const sc = rule('.wb-shortcuts');
  const repeat = /grid-template-columns:\s*repeat\((\d+),\s*(\d+)px\)/.exec(sc);
  if (!repeat) throw new Error('.wb-shortcuts columns');
  const bounds = Object.fromEntries([...tsBlock('DEFAULT_BOUNDS').matchAll(/'([\w-]+)':\s*\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]/g)]
    .map((m) => [m[1], m.slice(2, 6).map(Number) as [number, number, number, number]]));
  const boot = [...tsBlock('INITIAL_OPEN').matchAll(/'([\w-]+)':\s*true/g)].map((m) => m[1]);
  const reserve = /const PLATE_RESERVE = (\d+);/.exec(deskWatch);
  if (!reserve) throw new Error('deskWatch.ts PLATE_RESERVE');
  return {
    header, rail, boot, bounds,
    shortcuts: {
      left: length('.wb-shortcuts', 'left'), top: length('.wb-shortcuts', 'top'),
      w: Number(repeat[1]) * Number(repeat[2]) + (Number(repeat[1]) - 1) * length('.wb-shortcuts', 'gap'),
    },
    hint: { left: length('.wb-hint', 'left'), bottom: length('.wb-hint', 'bottom') },
    plate: { right: length('.wb-plate', 'right'), bottom: length('.wb-plate', 'bottom'), w: length('.wb-plate', 'width'), reserve: Number(reserve[1]) },
    dock: { top: length('.docks', 'top'), right: length('.docks', 'right'), gap: length('.docks', 'gap'), short: shortDesk() },
  };
})();

/** The viewport height at and under which the docks keep only their badges (index.css). */
function shortDesk(): number {
  const m = /@media \(min-width: 881px\) and \(max-height: (\d+)px\) \{\s*\.ask-dock > span:last-child, \.effects-dock > span:last-child \{ display: none; \}/.exec(css);
  if (!m) throw new Error('index.css has no short-desk dock query');
  return Number(m[1]);
}

/** FieldWorkbench applyBounds, restated (it is a closure over the DOM): the window's box on a W × H desk. */
const applyBounds = ([x, y, w, h]: readonly number[], W: number, H: number): Box => {
  const mw = Math.max(320, W - 24);
  const mh = Math.max(240, H - 24);
  const width = Math.min(w, mw);
  const height = Math.min(h, mh);
  return { x: Math.max(0, Math.min(x, mw - width)), y: Math.max(0, Math.min(y, mh - height)), w: width, h: height };
};

const bootDesk = (vw: number, vh: number) => {
  const W = vw - LAYOUT.rail;
  const H = vh - LAYOUT.header;
  const windows = LAYOUT.boot.map((id) => applyBounds(LAYOUT.bounds[id], W, H));
  const { shortcuts: s, hint, plate, dock } = LAYOUT;
  const short = vh <= dock.short;
  const aiW = short ? MEASURED.aiBadgeW : MEASURED.aiDockW;
  const fxW = short ? MEASURED.fxBadgeW : MEASURED.fxDockW;
  const fxX = W - dock.right - fxW;
  const furniture: Box[] = [
    { x: s.left, y: s.top, w: s.w, h: MEASURED.shortcutsH },
    { x: hint.left, y: H - hint.bottom - MEASURED.hintH, w: MEASURED.hintW, h: MEASURED.hintH },
    { x: W - plate.right - plate.w, y: H - plate.bottom - MEASURED.plateH - plate.reserve, w: plate.w, h: MEASURED.plateH + plate.reserve },
    // position: fixed, so measured from the viewport: desk x = viewport x − the rail, desk y = viewport y − the header.
    // The rail hangs from the header (its top is the desk's top) and ends at the viewport's right less 18 px.
    { x: fxX - dock.gap - aiW, y: dock.top - LAYOUT.header, w: aiW, h: MEASURED.dockH },
    { x: fxX, y: dock.top - LAYOUT.header, w: fxW, h: MEASURED.dockH },
  ];
  return { W, H, windows, furniture, obstacles: [...windows, ...furniture] };
};

// Screens, and the shorter viewports a browser's own chrome leaves on two of them.
const LAPTOPS = [[1280, 720], [1366, 768], [1440, 900], [1536, 864], [1366, 650], [1536, 730]] as const;

describe('occupancy — the desk as 24 px squares', () => {
  it('cuts the desk into whole 24 px squares; a partial square at the right or the top is no square', () => {
    const g = occupancy(100, 50, []);
    expect(CELL).toBe(24);
    expect([g.cols, g.rows, g.height]).toEqual([4, 2, 50]);
    expect([...g.free]).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(occupancy(23, 23, []).free.length).toBe(0);
  });

  it('counts rows from the bottom edge, where the grid’s horizontal lines are anchored (row r spans y ∈ [H − 24(r + 1), H − 24r))', () => {
    // 100 px tall: four rows, and the top 4 px belong to none.
    const blocked = (o: Box) => {
      const g = occupancy(48, 100, [o], 0);
      return [...g.free].flatMap((f, i) => (f ? [] : [[i % g.cols, Math.floor(i / g.cols)]]));
    };
    expect(blocked({ x: 0, y: 90, w: 1, h: 1 })).toEqual([[0, 0]]); // just above the bottom edge: row 0
    expect(blocked({ x: 30, y: 77, w: 1, h: 1 })).toEqual([[1, 0]]);
    expect(blocked({ x: 30, y: 75, w: 1, h: 1 })).toEqual([[1, 1]]); // row 1 is y ∈ [52, 76)
    expect(blocked({ x: 0, y: 10, w: 1, h: 1 })).toEqual([[0, 3]]); // the top row is y ∈ [4, 28)
    expect(blocked({ x: 0, y: 0, w: 10, h: 3 })).toEqual([]); // the top 4 px strip is no row
  });

  it('grows every obstacle by 8 px, and a grown box takes a square only where it reaches the square’s interior', () => {
    const blockedCols = (o: Box, inflate?: number) => {
      const g = occupancy(240, 240, [o], inflate);
      return [...new Set([...g.free].flatMap((f, i) => (f ? [] : [i % g.cols])))].sort((a, b) => a - b);
    };
    const blockedRows = (o: Box, inflate?: number) => {
      const g = occupancy(240, 240, [o], inflate);
      return [...new Set([...g.free].flatMap((f, i) => (f ? [] : [Math.floor(i / g.cols)])))].sort((a, b) => a - b);
    };
    // x ∈ [56, 66]: grown to [48, 74], which reaches column 3 (from 72) but only touches column 1 (to 48).
    expect(blockedCols({ x: 56, y: 100, w: 10, h: 10 })).toEqual([2, 3]);
    expect(blockedCols({ x: 56, y: 100, w: 10, h: 10 }, 0)).toEqual([2]);
    expect(blockedCols({ x: 0, y: 100, w: 48, h: 10 }, 0)).toEqual([0, 1]); // ends on a grid line: column 2 untouched
    // y ∈ [100, 110] on a 240 px desk: grown to [92, 118] → rows 5 (y 96–120) and 6 (y 72–96).
    expect(blockedRows({ x: 100, y: 100, w: 10, h: 10 })).toEqual([5, 6]);
    expect(blockedRows({ x: 100, y: 100, w: 10, h: 10 }, 0)).toEqual([5]);
  });

  it('ignores empty obstacles and those wholly off the desk, and clips the rest to it', () => {
    const freeCount = (obstacles: Box[]) => [...occupancy(240, 240, obstacles).free].filter(Boolean).length;
    expect(freeCount([])).toBe(100);
    expect(freeCount([{ x: 10, y: 10, w: 0, h: 50 }, { x: 10, y: 10, w: 50, h: -1 }, { x: 10, y: 10, w: NaN, h: 5 }])).toBe(100);
    expect(freeCount([{ x: -200, y: 0, w: 100, h: 240 }, { x: 400, y: 0, w: 50, h: 50 }, { x: 0, y: -100, w: 240, h: 50 }, { x: 0, y: 300, w: 240, h: 50 }])).toBe(100);
    // An obstacle fixed over the rail starts left of the desk and reaches x 55.5.
    const g = occupancy(240, 240, [{ x: -80, y: 180, w: 135.53, h: 36.65 }]);
    const cols = [...new Set([...g.free].flatMap((f, i) => (f ? [] : [i % g.cols])))].sort((a, b) => a - b);
    expect(cols).toEqual([0, 1, 2]);
  });
});

describe('freeRegions — the free squares’ maximal rectangles', () => {
  it('turns an empty desk into one region, the whole grid, placed in desk px (y down, the grid flush with the bottom)', () => {
    expect(freeRegions(occupancy(250, 100, []))).toEqual([{ col: 0, row: 0, cols: 10, rows: 4, x: 0, y: 4, w: 240, h: 96 }]);
  });

  it('returns exactly the maximal rectangles a brute force finds, largest first, none inside another', () => {
    const next = rng(20261010);
    for (let n = 0; n < 60; n += 1) {
      const cols = 3 + Math.floor(next() * 8);
      const rows = 3 + Math.floor(next() * 6);
      const p = 0.1 + next() * 0.4;
      const free = new Uint8Array(cols * rows).map(() => (next() < p ? 0 : 1));
      const g: Grid = { cols, rows, height: rows * CELL + 7, free };
      const regions = freeRegions(g, Infinity);
      expect(regions.map(key).sort()).toEqual(bruteMaximal(g));
      for (let i = 1; i < regions.length; i += 1) {
        expect(regions[i - 1].cols * regions[i - 1].rows).toBeGreaterThanOrEqual(regions[i].cols * regions[i].rows);
      }
      for (const a of regions) {
        expect(allFree(g, a.col, a.row, a.cols, a.rows)).toBe(true);
        expect([a.x, a.y, a.w, a.h]).toEqual([a.col * CELL, g.height - (a.row + a.rows) * CELL, a.cols * CELL, a.rows * CELL]);
        for (const b of regions) if (a !== b) expect(contains(a, b)).toBe(false);
      }
      // The default keeps the twelve largest of the same list.
      expect(freeRegions(g).map(key)).toEqual(regions.slice(0, 12).map(key));
    }
  });

  it('breaks an area tie lower first, then further left, and keeps at most `keep`', () => {
    // Column 2 blocked: two 2 × 3 regions side by side.
    const side: Grid = { cols: 5, rows: 3, height: 72, free: Uint8Array.from([1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]) };
    expect(freeRegions(side).map(key)).toEqual(['0,0 2x3', '3,0 2x3']);
    // Row 2 blocked: two 3 × 2 regions, one above the other.
    const stacked: Grid = { cols: 3, rows: 5, height: 120, free: Uint8Array.from([1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1]) };
    expect(freeRegions(stacked).map(key)).toEqual(['0,0 3x2', '0,3 3x2']);
    expect(freeRegions(stacked, 1).map(key)).toEqual(['0,0 3x2']);
    expect(largestFree(stacked)).toEqual(freeRegions(stacked)[0]);
  });

  it('has nothing on a full desk', () => {
    const g = occupancy(240, 240, [{ x: 0, y: 0, w: 240, h: 240 }]);
    expect(freeRegions(g)).toEqual([]);
    expect(largestFree(g)).toBeNull();
    expect(qualifies(largestFree(g))).toBe(false);
  });
});

describe('qualifies and coveredShare', () => {
  const region = (cols: number, rows: number): Region => ({ col: 0, row: 0, cols, rows, x: 0, y: 0, w: cols * CELL, h: rows * CELL });

  it('lets a sheet take a region of at least 11 × 8 squares (264 × 192 px), across by up', () => {
    expect([MIN_COLS, MIN_ROWS, MIN_COLS * CELL, MIN_ROWS * CELL]).toEqual([11, 8, 264, 192]);
    expect(qualifies(region(11, 8))).toBe(true);
    expect(qualifies(region(76, 43))).toBe(true);
    expect(qualifies(region(10, 8))).toBe(false);
    expect(qualifies(region(11, 7))).toBe(false);
    expect(qualifies(region(8, 11))).toBe(false); // standing on end does not count
    expect(qualifies(null)).toBe(false);
  });

  it('measures how much of a sheet the obstacles cover: exact for one, an upper bound for several, at most 1', () => {
    const sheet: Box = { x: 100, y: 100, w: 200, h: 100 };
    expect(coveredShare(sheet, [])).toBe(0);
    expect(coveredShare(sheet, [{ x: 0, y: 0, w: 100, h: 400 }])).toBe(0); // touching an edge covers nothing
    expect(coveredShare(sheet, [{ x: 250, y: 50, w: 200, h: 200 }])).toBe(0.25); // the re-placement threshold
    expect(coveredShare(sheet, [{ x: 100, y: 100, w: 50, h: 100 }, { x: 250, y: 100, w: 50, h: 100 }])).toBe(0.5);
    // Two overlapping windows over the same quarter: counted twice, never less than the truth.
    const twice = coveredShare(sheet, [{ x: 250, y: 100, w: 50, h: 100 }, { x: 250, y: 100, w: 50, h: 100 }]);
    expect(twice).toBe(0.5);
    expect(twice).toBeGreaterThanOrEqual(0.25);
    expect(coveredShare(sheet, [{ x: 0, y: 0, w: 1000, h: 1000 }, { x: 0, y: 0, w: 1000, h: 1000 }])).toBe(1);
    expect(coveredShare({ x: 0, y: 0, w: 0, h: 10 }, [{ x: 0, y: 0, w: 10, h: 10 }])).toBe(0);
  });

  // The plan's mode table (§1): "parked — no free region ≥ 11×8 cells". readDesk's
  // regions are sheetRegions, so DrawingField's and the film's regions[0] is the
  // largest region a sheet fits, never a long thin band beside it.
  it('parks only when no free region is 11 × 8: a thin band larger than a qualifying corner does not park the drawing', () => {
    // 40 × 20 squares: a window takes columns 12–39 below the top four rows, a second
    // one columns 0–11 of rows 9–15. Left free: the top band (40 × 4 = 160 squares)
    // and the bottom-left corner (12 × 9 = 108), which a sheet fits.
    const g = occupancy(960, 480, [{ x: 288, y: 96, w: 672, h: 384 }, { x: 0, y: 96, w: 288, h: 168 }], 0);
    expect(freeRegions(g).map(key)).toEqual(['0,16 40x4', '0,0 12x9']);
    expect(freeRegions(g).some(qualifies)).toBe(true);
    expect(sheetRegions(g).map(key)).toEqual(['0,0 12x9']); // readDesk's regions; room = regions.length > 0
    expect(sheetRegions(g, 1).map(key)).toEqual(['0,0 12x9']); // filtered before the cap
    expect(sheetRegions(occupancy(960, 480, [{ x: 0, y: 96, w: 960, h: 384 }], 0))).toEqual([]); // only the band: parked
  });
});

describe('the real boot layouts', () => {
  it('reads the desk and its obstacles from index.css, FieldWorkbench and deskWatch', () => {
    expect(css).toMatch(/\*, \*::before, \*::after \{ box-sizing: border-box; \}/);
    expect([LAYOUT.header, LAYOUT.rail]).toEqual([46, 96]);
    expect(LAYOUT.boot).toEqual(['home', 'world-3d']);
    expect(LAYOUT.bounds.home).toEqual([150, 48, 900, 620]);
    expect(LAYOUT.bounds['world-3d']).toEqual([420, 96, 1040, 640]);
    expect(LAYOUT.shortcuts).toEqual({ left: 22, top: 18, w: 200 });
    expect(LAYOUT.hint).toEqual({ left: 24, bottom: 14 });
    expect(LAYOUT.plate).toEqual({ right: 26, bottom: 22, w: 308, reserve: 13 });
    expect(LAYOUT.dock).toEqual({ top: 46, right: 18, gap: 8, short: 755 });
    // applyBounds, as restated above.
    for (const line of [
      'const mw = Math.max(320, desk.clientWidth - 24);',
      'const mh = Math.max(240, desk.clientHeight - 24);',
      'const width = Math.min(w, mw);',
      'const height = Math.min(h, mh);',
      'el.style.left = `${Math.max(0, Math.min(x, mw - width))}px`;',
      'el.style.top = `${Math.max(0, Math.min(y, mh - height))}px`;',
    ]) expect(workbench).toContain(line);
    // The table in the comment above.
    const table: Record<string, [number, number, Box, Box]> = {
      '1280x720': [1184, 674, { x: 150, y: 30, w: 900, h: 620 }, { x: 120, y: 10, w: 1040, h: 640 }],
      '1366x768': [1270, 722, { x: 150, y: 48, w: 900, h: 620 }, { x: 206, y: 58, w: 1040, h: 640 }],
      '1440x900': [1344, 854, { x: 150, y: 48, w: 900, h: 620 }, { x: 280, y: 96, w: 1040, h: 640 }],
      '1536x864': [1440, 818, { x: 150, y: 48, w: 900, h: 620 }, { x: 376, y: 96, w: 1040, h: 640 }],
      '1920x1080': [1824, 1034, { x: 150, y: 48, w: 900, h: 620 }, { x: 420, y: 96, w: 1040, h: 640 }],
    };
    for (const [size, [W, H, home, estate]] of Object.entries(table)) {
      const [vw, vh] = size.split('x').map(Number);
      const desk = bootDesk(vw, vh);
      expect([desk.W, desk.H, ...desk.windows]).toEqual([W, H, home, estate]);
    }
    // The furniture at 1920 × 1080, desk px.
    expect(bootDesk(1920, 1080).furniture.map((b) => [b.x, b.y, b.w, b.h].map((v) => Math.round(v * 100) / 100))).toEqual([
      [22, 18, 200, 408.85],
      [24, 1004.5, 579.1, 15.5],
      [1490, 910.2, 308, 101.8],
      [1552.83, 0, 135.92, 36.05],
      [1696.75, 0, 109.25, 36.05],
    ]);
    // On a short desk the pair keeps only its badges.
    expect(bootDesk(1366, 650).furniture.slice(3).map((b) => [b.x, b.y, b.w].map((v) => Math.round(v * 100) / 100))).toEqual([
      [1270 - 18 - 50.03 - 8 - 47.89, 0, 47.89],
      [1270 - 18 - 50.03, 0, 50.03],
    ]);
  });

  it('parks every laptop boot — 1280 × 720, 1366 × 768, 1440 × 900, 1536 × 864 leave no 11 × 8 region', () => {
    for (const [vw, vh] of LAPTOPS) {
      const desk = bootDesk(vw, vh);
      const g = occupancy(desk.W, desk.H, desk.obstacles);
      const regions = freeRegions(g, Infinity);
      expect(regions.length, `${vw} × ${vh}`).toBeGreaterThan(0);
      expect(regions.filter(qualifies).map(key), `${vw} × ${vh}`).toEqual([]);
      expect(qualifies(largestFree(g)), `${vw} × ${vh}`).toBe(false);
      // The two boot windows alone already leave none: the furniture only takes more.
      const windowsOnly = freeRegions(occupancy(desk.W, desk.H, desk.windows), Infinity);
      expect(windowsOnly.filter(qualifies).map(key), `${vw} × ${vh}, windows only`).toEqual([]);
    }
    // The nearest miss: at 1440 × 900 the corner under Home, left of the Estate, is one row short.
    const desk = bootDesk(1440, 900);
    expect(freeRegions(occupancy(desk.W, desk.H, desk.windows), Infinity).map(key)).toContain('0,0 11x7');
  });

  it('boots 1920 × 1080 with room: the right band beside the Estate and the bottom band under both windows', () => {
    const desk = bootDesk(1920, 1080);
    const g = occupancy(desk.W, desk.H, desk.obstacles);
    expect([g.cols, g.rows]).toEqual([76, 43]);
    const regions = freeRegions(g, Infinity).filter(qualifies);
    const estate = desk.windows[1];
    // Right band: from the first column clear of the Estate's grown right edge (1460 + 8) to the
    // desk's edge, from the first row under the docks (hung from the header, grown 8 px) down to
    // the title plate.
    const right = regions.find((r) => r.x >= estate.x + estate.w + 8 && r.col + r.cols === g.cols);
    expect(right && key(right)).toBe('62,6 14x35');
    const docks = desk.furniture[4];
    expect(right!.y).toBeGreaterThanOrEqual(docks.y + docks.h + 8);
    expect(right!.y).toBeLessThan(docks.y + docks.h + 8 + CELL);
    // Bottom band: below the Estate's grown bottom edge (736 + 8) and above the hint, from the
    // desk's left edge (no dock in that corner any more) to the title plate.
    const bottom = regions.filter((r) => r.y >= estate.y + estate.h + 8 && r.cols >= 55).map(key);
    expect(bottom).toEqual(['0,2 61x10']);
    // The largest region is the bottom band, and it qualifies: the drawing runs.
    expect(key(largestFree(g)!)).toBe('0,2 61x10');
    expect(qualifies(largestFree(g))).toBe(true);
  });
});

describe('compose — SCALE_LADDER', () => {
  it('makes every step one desk square a whole number of metres, largest first', () => {
    expect(SCALE_LADDER.map((s) => CELL / s)).toEqual([1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30, 40]);
    for (const s of SCALE_LADDER) expect(Number.isInteger(CELL / s)).toBe(true);
    for (let i = 1; i < SCALE_LADDER.length; i += 1) expect(SCALE_LADDER[i]).toBeLessThan(SCALE_LADDER[i - 1]);
    // The plan's §3 ladder is a subset of it.
    for (const s of [24, 12, 8, 6, 4.8, 2.4, 1.2, 0.6]) expect(SCALE_LADDER).toContain(s);
  });
});

describe('compose — drawingArea and chipBox', () => {
  it('keeps a square’s margin round the sheet, two squares above and to the right for the dims, and the chip’s band below', () => {
    const region = emptyRegion(480, 360); // 20 × 15 squares, y 0
    expect(drawingArea(region, { chip: 100, dims: true })).toEqual({ x: 24, y: 72, w: 384, h: 164 });
    expect(drawingArea(region, { chip: 100, dims: false })).toEqual({ x: 24, y: 24, w: 432, h: 212 });
    expect(drawingArea(region, { chip: 400, dims: true })).toEqual({ x: 24, y: 72, w: 384, h: 0 }); // never negative
  });

  it('stands the chip in a column beside the sheet in a wide, short region (chipBeside)', () => {
    // A wide, short band: 58 × 10 squares (1920 × 1080's bottom band while the AI dock sat in its corner; 61 × 10 now).
    const band: Region = { col: 3, row: 2, cols: 58, rows: 10, x: 72, y: 746, w: 1392, h: 240 };
    const bands: Bands = { chip: 98, chipWidth: 420, dims: true };
    expect(chipBeside(band, bands)).toBe(true);
    const area = drawingArea(band, bands);
    expect(area).toEqual({ x: 72 + 24 + 436, y: 746 + 24 + 48, w: 1392 - 48 - 48 - 436, h: 240 - 48 - 48 });
    // The chip (bottom left, ≤ 420 px) stays clear of the drawing area.
    const chip = chipBox(band, 90);
    expect(chip).toEqual({ x: 80, y: 746 + 240 - 90, w: 420, h: 90 });
    expect(chip.x + chip.w).toBeLessThan(area.x);
    // The threshold: what is left beside the chip and three squares is at least 1.5 × the height.
    const at = (w: number): Region => ({ ...band, w });
    expect(chipBeside(at(420 + 72 + 360), bands)).toBe(true);
    expect(chipBeside(at(420 + 72 + 359), bands)).toBe(false);
    expect(chipBeside(band, { chip: 98, dims: true })).toBe(false); // no chip width given: always below
    // A tall region keeps the chip below (14 × 37: 1920 × 1080's right band before the docks hung over its top; 14 × 35 now).
    const tall: Region = { col: 62, row: 6, cols: 14, rows: 37, x: 1488, y: 2, w: 336, h: 888 };
    expect(chipBeside(tall, { chip: 98, chipWidth: 320, dims: false })).toBe(false);
    expect(drawingArea(tall, { chip: 98, chipWidth: 320, dims: false })).toEqual({ x: 1512, y: 26, w: 288, h: 888 - 48 - 98 });
    expect(chipBox(tall, 90)).toEqual({ x: 1496, y: 2 + 888 - 90, w: 320, h: 90 });
  });
});

describe('compose — placePlan', () => {
  const bands: Bands = { chip: 98, chipWidth: 420, dims: true };

  it('takes the largest ladder step at which the plan fits its drawing area', () => {
    for (const site of SITES) {
      for (const [w, h] of [[960, 720], [480, 360], [1392, 240], [336, 888]]) {
        const region = emptyRegion(w, h);
        const area = drawingArea(region, bands);
        const e = extentOf(site.id);
        const placed = placePlan([region], e, bands, h);
        const fits = (s: number) => {
          const ew = e.x1 - e.x0;
          const eh = e.y1 - e.y0;
          return (ew * s <= area.w && eh * s <= area.h) || (eh * s <= area.w && ew * s <= area.h);
        };
        const want = SCALE_LADDER.find(fits);
        expect(placed?.scale, `${site.id} in ${w} × ${h}`).toBe(want);
        if (!placed) continue;
        expect(placed.region).toBe(region);
        expect(placed.area).toEqual(area);
        expect(pxPerMetre(placed.pose, placed.area)).toBeCloseTo(placed.scale, 9);
        const larger = SCALE_LADDER[SCALE_LADDER.indexOf(placed.scale as typeof SCALE_LADDER[number]) - 1];
        if (larger !== undefined) expect(fits(larger)).toBe(false);
      }
    }
  });

  it('keeps north up on a tie: a point block fits either way at 12 px/m (2 m a square)', () => {
    const e = extentOf('BLK_501'); // 28.2 × 23.6 m
    expect([e.x1 - e.x0, e.y1 - e.y0].map((v) => Math.round(v * 10) / 10)).toEqual([28.2, 23.6]);
    const placed = placePlan([emptyRegion(960, 720)], e, bands, 720)!;
    expect(placed.scale).toBe(12);
    expect(placed.psi).toBe(NORTH_UP);
    // North up: north is up the screen, east to the right.
    const s = projectAt(placed.pose, placed.area, 0, e.y0);
    const n = projectAt(placed.pose, placed.area, 0, e.y1);
    expect(n[1]).toBeLessThan(s[1]);
    expect(n[0]).toBeCloseTo(s[0], 9);
  });

  it('turns a tall plan a quarter (ψ 180°, north to the right) when that takes a larger step', () => {
    const e = extentOf('BLK_510'); // 57.4 m east–west, 83.6 m north–south
    const region = emptyRegion(960, 480);
    const area = drawingArea(region, bands); // 864 × 286
    expect(area).toEqual({ x: 24, y: 72, w: 864, h: 286 });
    const placed = placePlan([region], e, bands, 480)!;
    expect(placed.scale).toBe(4.8); // north up only 3 px/m would fit
    expect(placed.psi).toBeCloseTo(180 * DEG, 12);
    const s = projectAt(placed.pose, placed.area, 0, e.y0);
    const n = projectAt(placed.pose, placed.area, 0, e.y1);
    expect(n[0] - s[0]).toBeCloseTo((e.y1 - e.y0) * 4.8, 6);
    expect(n[1]).toBeCloseTo(s[1], 9);
    const box = projectedBox(placed.pose, placed.area, e);
    expect(box.w).toBeLessThanOrEqual(area.w);
    expect(box.h).toBeLessThanOrEqual(area.h);
  });

  it('returns null when nothing fits at the smallest allowed step', () => {
    const e = extentOf('BLK_509'); // a 126.4 m slab
    const small = emptyRegion(264, 192); // the smallest qualifying region
    const plain: Bands = { chip: 60, dims: false };
    expect(placePlan([small], e, plain, 192, 2.4)).toBeNull(); // the film's floor for plans
    expect(placePlan([small], e, plain, 192)?.scale).toBe(1.6); // 15 m a square at the ladder's own floor
    const site: Extent = { x0: EXTENT[0] / 100, y0: EXTENT[1] / 100, x1: EXTENT[2] / 100, y1: EXTENT[3] / 100 };
    expect(placePlan([small], site, plain, 192)).toBeNull(); // 400 m at 0.6 px/m is 240 px
    expect(placePlan([], e, plain, 192)).toBeNull();
    expect(placePlan([small], e, { chip: 400, dims: false }, 192)).toBeNull(); // the chip leaves no area
  });

  it('snaps the building’s origin onto a desk grid crossing (x = 24i + 0.5, y = H − 24j − 0.5), moving the sheet at most half a square', () => {
    const desk = bootDesk(1920, 1080);
    const regions = freeRegions(occupancy(desk.W, desk.H, desk.obstacles)).filter(qualifies);
    let placements = 0;
    for (const [H, list] of [[desk.H, regions], [1001, [emptyRegion(1200, 1001)]], [674, [emptyRegion(700, 674)]]] as const) {
      for (const region of list) {
        for (const site of SITES) {
          for (const b of [bands, { chip: 98, chipWidth: Math.min(region.w - 16, 420), dims: false }] as Bands[]) {
            const e = extentOf(site.id);
            const placed = placePlan([region], e, b, H, 0.6);
            if (!placed) continue;
            placements += 1;
            const [x, y] = projectAt(placed.pose, placed.area, 0, 0);
            expect(nearInteger((x - 0.5) / CELL), `${site.id} x ${x}`).toBe(true);
            expect(nearInteger((H - y - 0.5) / CELL), `${site.id} y ${y}`).toBe(true);
            expect(snapToGrid(x, y, H).map((v, i) => v - [x, y][i]).every((d) => Math.abs(d) < 1e-6)).toBe(true);
            // Before the snap the plan was centred in the area; the snap moves it at most 12 px each way.
            const centred = planPose((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, placed.area.h / (2 * placed.scale), placed.psi);
            const [x0, y0] = projectAt(centred, placed.area, 0, 0);
            expect(Math.abs(x - x0)).toBeLessThanOrEqual(CELL / 2 + 1e-9);
            expect(Math.abs(y - y0)).toBeLessThanOrEqual(CELL / 2 + 1e-9);
            // So the sheet stays in its region, within half a square of its area, clear of its chip.
            const box = projectedBox(placed.pose, placed.area, e);
            expect(box.x).toBeGreaterThanOrEqual(placed.area.x - CELL / 2 - 1e-9);
            expect(box.y).toBeGreaterThanOrEqual(placed.area.y - CELL / 2 - 1e-9);
            expect(box.x + box.w).toBeLessThanOrEqual(placed.area.x + placed.area.w + CELL / 2 + 1e-9);
            expect(box.y + box.h).toBeLessThanOrEqual(placed.area.y + placed.area.h + CELL / 2 + 1e-9);
            expect(box.x).toBeGreaterThanOrEqual(region.x);
            expect(box.x + box.w).toBeLessThanOrEqual(region.x + region.w);
            const c = placed.chip;
            const overlaps = box.x < c.x + c.w && c.x < box.x + box.w && box.y < c.y + c.h && c.y < box.y + box.h;
            expect(overlaps, `${site.id} over its chip`).toBe(false);
            // And the scale is whole metres per square: a square east of the origin is the next grid line.
            const [xe] = projectAt(placed.pose, placed.area, (placed.psi === NORTH_UP ? CELL : 0) / placed.scale, (placed.psi === NORTH_UP ? 0 : CELL) / placed.scale);
            expect(xe - x).toBeCloseTo(CELL, 9);
          }
        }
      }
    }
    expect(placements).toBeGreaterThan(100);
  });

  it('snapToGrid takes the nearest crossing, the grid’s phase set by the desk’s height', () => {
    expect(snapToGrid(0, 100, 100)).toEqual([0.5, 99.5]);
    expect(snapToGrid(13, 100 - 13, 100)).toEqual([24.5, 75.5]);
    expect(snapToGrid(11, 100 - 11, 100)).toEqual([0.5, 99.5]);
    expect(snapToGrid(500, 500, 1034)).toEqual([504.5, 1034 - 22 * 24 - 0.5]);
  });

  // The JSDoc: "the largest ladder scale, north up on a tie, then the larger region",
  // whatever order the regions come in.
  it('prefers north up on a scale tie across regions, whichever region comes first', () => {
    const e = extentOf('BLK_510'); // 57.4 × 83.6 m
    const plain: Bands = { chip: 0, dims: false };
    // A: 46.5 m deep — the turned plan fits at 4.8, north up only at 3. B: wide — north up at 4.8.
    const a: Region = { col: 0, row: 0, cols: 20, rows: 14, x: 0, y: 0, w: 480, h: 336 };
    const b: Region = { col: 0, row: 0, cols: 16, rows: 19, x: 600, y: 0, w: 384, h: 456 };
    const turnedInA = placePlan([a], e, plain, 1000)!;
    const northInB = placePlan([b], e, plain, 1000)!;
    expect([turnedInA.scale, turnedInA.psi / DEG]).toEqual([4.8, 180]);
    expect([northInB.scale, northInB.psi]).toEqual([4.8, NORTH_UP]);
    expect(placePlan([a, b], e, plain, 1000)!.psi).toBe(NORTH_UP);
    expect(placePlan([b, a], e, plain, 1000)!.psi).toBe(NORTH_UP);
  });

  it('prefers the larger region on a full tie, whichever region comes first', () => {
    const e = extentOf('BLK_501');
    const plain: Bands = { chip: 0, dims: false };
    const small: Region = { col: 0, row: 0, cols: 18, rows: 15, x: 0, y: 0, w: 432, h: 360 };
    const large: Region = { col: 0, row: 0, cols: 22, rows: 17, x: 500, y: 0, w: 528, h: 408 };
    expect(placePlan([small], e, plain, 1000)!.scale).toBe(12);
    expect(placePlan([large], e, plain, 1000)!.scale).toBe(12);
    expect(placePlan([small, large], e, plain, 1000)!.region).toBe(large);
    expect(placePlan([large, small], e, plain, 1000)!.region).toBe(large);
  });
});

describe('compose — posterInRegion', () => {
  const scene = sceneOf(SITES, KERBS, EXTENT, POSTER);
  const PW = POSTER.w;
  const PH = POSTER.h;
  // A tall and a wide band, as the cover still and the film use them (dims off, the chip measured at ~90 px):
  // 1920 × 1080's right and bottom bands before the docks moved to the header (14 × 35 and 61 × 10 now).
  const RIGHT_BAND = drawingArea({ col: 62, row: 6, cols: 14, rows: 37, x: 1488, y: 2, w: 336, h: 888 }, { chip: 98, chipWidth: 320, dims: false });
  const BOTTOM_BAND = drawingArea({ col: 3, row: 2, cols: 58, rows: 10, x: 72, y: 746, w: 1392, h: 240 }, { chip: 98, chipWidth: 420, dims: false });

  it('shows the whole 4:3 poster, contained and centred, when the area holds it at 0.4 of its size or more', () => {
    expect([PW, PH]).toEqual([1600, 1200]);
    const focus = posterBox(scene, 'BLK_501');
    expect(posterInRegion({ x: 10, y: 20, w: 800, h: 700 }, PW, PH, focus)).toEqual({ frame: { x: 10, y: 70, w: 800, h: 600 }, crop: null });
    expect(posterInRegion({ x: 0, y: 0, w: 1000, h: 480 }, PW, PH, focus)).toEqual({ frame: { x: 180, y: 0, w: 640, h: 480 }, crop: null });
    expect(posterInRegion({ x: 0, y: 0, w: 639, h: 480 }, PW, PH, focus).crop).not.toBeNull(); // just under 0.4
  });

  it('else crops on the building: its box centred in the area at 0.55 of the area’s height or width, the poster’s aspect kept', () => {
    const area = RIGHT_BAND;
    expect(area).toEqual({ x: 1512, y: 26, w: 288, h: 742 });
    for (const site of SITES) {
      const focus = posterBox(scene, site.id);
      const { frame, crop } = posterInRegion(area, PW, PH, focus);
      expect(crop, site.id).not.toBeNull();
      const m = frame.w / PW;
      expect(frame.h / PH).toBeCloseTo(m, 12);
      expect(frame.x + (focus.x + focus.w / 2) * m).toBeCloseTo(area.x + area.w / 2, 9);
      expect(frame.y + (focus.y + focus.h / 2) * m).toBeCloseTo(area.y + area.h / 2, 9);
      expect(Math.max((focus.w * m) / area.w, (focus.h * m) / area.h)).toBeCloseTo(0.55, 9);
    }
    // Blk 505 sits mid-poster: the crop is exactly the area's own rectangle, in poster px.
    const focus = posterBox(scene, 'BLK_505');
    const { frame, crop } = posterInRegion(area, PW, PH, focus);
    const m = frame.w / PW;
    expect(crop!.x).toBeCloseTo((area.x - frame.x) / m, 9);
    expect(crop!.y).toBeCloseTo((area.y - frame.y) / m, 9);
    expect(crop!.w).toBeCloseTo(area.w / m, 9);
    expect(crop!.h).toBeCloseTo(area.h / m, 9);
    expect(crop!.x).toBeGreaterThan(0);
    expect(crop!.x + crop!.w).toBeLessThan(PW);
  });

  // The JSDoc: "the crop it shows, in poster px", and chipNotes prints it on the
  // sheet's chip ("CROP x… y…"): where the window reaches past the poster's edge
  // (NC 514, MSCP 513 and Blk 501 in the bottom band; Blk 507 and six more in the
  // right band), the crop is only the part inside the poster.
  it('reports a crop that is the part of the poster the area shows, inside the poster', () => {
    for (const area of [RIGHT_BAND, BOTTOM_BAND]) {
      for (const site of SITES) {
        const { frame, crop } = posterInRegion(area, PW, PH, posterBox(scene, site.id));
        if (!crop) continue;
        const m = frame.w / PW;
        const visible = {
          x0: Math.max(0, (area.x - frame.x) / m), y0: Math.max(0, (area.y - frame.y) / m),
          x1: Math.min(PW, (area.x + area.w - frame.x) / m), y1: Math.min(PH, (area.y + area.h - frame.y) / m),
        };
        expect(crop.x + crop.w, `${site.id} crop right`).toBeLessThanOrEqual(PW + 1e-6);
        expect(crop.y + crop.h, `${site.id} crop bottom`).toBeLessThanOrEqual(PH + 1e-6);
        expect(crop.x + crop.w, `${site.id} crop right edge`).toBeCloseTo(visible.x1, 6);
        expect(crop.y + crop.h, `${site.id} crop bottom edge`).toBeCloseTo(visible.y1, 6);
      }
    }
  });
});
