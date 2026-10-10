// Where the desk is free to draw on (docs/portfolio/desk-drawing-set.md §3
// "Window-aware placement"). The desk is cut into its own 24 px grid squares —
// columns from the left, rows from the bottom, because the grid's horizontal
// lines are anchored at the desk's bottom edge (index.css `0deg` gradients) — and
// a square is free when no obstacle (a window, the shortcuts, the hint, the title
// plate, the docks) reaches it. The free squares' maximal rectangles are the
// regions a sheet may take; the drawing runs only if one holds a sheet (11 × 8
// squares), and the largest such decides where it goes.
// The layer chunk runs this before it downloads the drawing (a desk with no room
// never loads it) and the drawing runs it again to place each sheet, so both
// agree. Pure.

/** The desk grid's minor square, CSS px (index.css .wb-desk). */
export const CELL = 24;
/** The smallest region a sheet is drawn in: 11 × 8 squares (264 × 192 px). */
export const MIN_COLS = 11;
export const MIN_ROWS = 8;

/** A desk-local rectangle, CSS px, y down. */
export interface Box { x: number; y: number; w: number; h: number }

export interface Grid {
  cols: number;
  rows: number;
  /** The desk's height, px: row r spans y ∈ [h − 24 (r + 1), h − 24 r). */
  height: number;
  /** 1 where the square is free; index row · cols + col, row 0 at the bottom. */
  free: Uint8Array;
}

export interface Region {
  col: number;
  row: number;
  cols: number;
  rows: number;
  /** The same, desk-local px. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The free squares of a `width` × `height` desk, each obstacle grown by `inflate` px. */
export const occupancy = (width: number, height: number, obstacles: readonly Box[], inflate = 8): Grid => {
  const cols = Math.max(0, Math.floor(width / CELL));
  const rows = Math.max(0, Math.floor(height / CELL));
  const free = new Uint8Array(cols * rows).fill(1);
  for (const o of obstacles) {
    if (!(o.w > 0 && o.h > 0)) continue;
    const x0 = o.x - inflate;
    const x1 = o.x + o.w + inflate;
    const y0 = o.y - inflate;
    const y1 = o.y + o.h + inflate;
    // Squares whose interior the grown box overlaps.
    const c0 = Math.max(0, Math.floor(x0 / CELL));
    const c1 = Math.min(cols - 1, Math.ceil(x1 / CELL) - 1);
    const r0 = Math.max(0, Math.floor((height - y1) / CELL));
    const r1 = Math.min(rows - 1, Math.ceil((height - y0) / CELL) - 1);
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) free[r * cols + c] = 0;
  }
  return { cols, rows, height, free };
};

const regionOf = (grid: Grid, col: number, row: number, cols: number, rows: number): Region => ({
  col, row, cols, rows,
  x: col * CELL,
  y: grid.height - (row + rows) * CELL,
  w: cols * CELL,
  h: rows * CELL,
});

const contains = (a: Region, b: Region) =>
  a.col <= b.col && a.row <= b.row && a.col + a.cols >= b.col + b.cols && a.row + a.rows >= b.row + b.rows;

/**
 * The free grid's maximal rectangles, largest first (ties: lower, then further
 * left), at most `keep` of them, of those `accept` takes. Histogram over the rows
 * top-down: each stack pop is the widest rectangle of that height standing on the
 * current row.
 */
export const freeRegions = (grid: Grid, keep = 12, accept: (region: Region) => boolean = () => true): Region[] => {
  const { cols, rows, free } = grid;
  const heights = new Int32Array(cols);
  const found: Region[] = [];
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let c = 0; c < cols; c += 1) heights[c] = free[row * cols + c] ? heights[c] + 1 : 0;
    const stack: number[] = [];
    for (let c = 0; c <= cols; c += 1) {
      const h = c < cols ? heights[c] : 0;
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        const height = heights[stack.pop()!];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        if (height > 0) found.push(regionOf(grid, left, row, c - left, height));
      }
      stack.push(c);
    }
  }
  found.sort((a, b) => b.cols * b.rows - a.cols * a.rows || a.row - b.row || a.col - b.col);
  const out: Region[] = [];
  for (const r of found) {
    if (!accept(r) || out.some((o) => contains(o, r))) continue;
    out.push(r);
    if (out.length >= keep) break;
  }
  return out;
};

/** The largest free region, or null on a full desk. */
export const largestFree = (grid: Grid): Region | null => freeRegions(grid, 1)[0] ?? null;

/** Whether a region is big enough to draw a sheet in. */
export const qualifies = (region: Region | null): region is Region =>
  region !== null && region.cols >= MIN_COLS && region.rows >= MIN_ROWS;

/**
 * The regions a sheet fits, largest first. Filtered before the cap, so a long thin
 * band larger than a qualifying corner neither parks the drawing nor crowds the
 * corner out of the list.
 */
export const sheetRegions = (grid: Grid, keep = 12): Region[] => freeRegions(grid, keep, qualifies);

/** How much of `box` the obstacles cover, 0–1 (re-placement waits until a sheet is ¼ covered). */
export const coveredShare = (box: Box, obstacles: readonly Box[]): number => {
  if (!(box.w > 0 && box.h > 0)) return 0;
  // Exact for one obstacle; for several, an upper bound good enough for a threshold.
  let covered = 0;
  for (const o of obstacles) {
    const w = Math.min(box.x + box.w, o.x + o.w) - Math.max(box.x, o.x);
    const h = Math.min(box.y + box.h, o.y + o.h) - Math.max(box.y, o.y);
    if (w > 0 && h > 0) covered += w * h;
  }
  return Math.min(1, covered / (box.w * box.h));
};
