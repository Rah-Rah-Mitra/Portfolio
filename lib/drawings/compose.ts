import { CELL, type Box, type Region } from './occupancy';
import { basis, planPose, project, NORTH_UP, DEG, type Frame, type Pose } from './project';

// Placing a sheet on the desk (docs/portfolio/desk-drawing-set.md §3
// "Window-aware placement"). A plan is drawn at a scale off a short ladder whose
// steps make one desk square a whole number of metres (24 px/m: 1 m a square;
// 0.6 px/m: 40 m), turned north up or a quarter, whichever takes the larger
// scale, with a square's margin round it, room above and to its right for its
// dimension chains, and the sheet chip's band under it. The building's origin
// then snaps to a grid crossing, so the desk's own grid is the drawing's metre
// grid. A sheet that fits nowhere at the smallest step is not drawn. Pure.

/** px per metre: one desk square is a whole number of metres (1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30 or 40). */
export const SCALE_LADDER = [24, 12, 8, 6, 4.8, 4, 3, 2.4, 2, 1.6, 1.2, 0.8, 0.6] as const;

export interface Extent { x0: number; y0: number; x1: number; y1: number }

export interface Bands {
  /** Height of the sheet chip's band at the region's foot, px (with its gap). */
  chip: number;
  /** The chip's width: in a wide, short region the chip stands beside the sheet rather than under it. */
  chipWidth?: number;
  /** Reserve room for dimension chains (two squares above and to the right). */
  dims: boolean;
}

/** A band of desk (a margin under the windows) is wide and short: the chip goes beside the sheet. */
export const chipBeside = (region: Region, bands: Bands): boolean =>
  bands.chipWidth !== undefined && region.w - bands.chipWidth - 3 * CELL >= 1.5 * region.h;

export interface PlanPlacement {
  region: Region;
  /** The drawing's own area inside the region (the pose's frame), desk px. */
  area: Box;
  scale: number;
  psi: number;
  pose: Pose;
  /** Where the chip goes, desk px. */
  chip: Box;
}

/** The sheet's drawing area in a region: a square's margin, the dims' room, the chip's band (or column). */
export const drawingArea = (region: Region, bands: Bands): Box => {
  const dims = bands.dims ? 2 * CELL : 0;
  if (chipBeside(region, bands)) {
    const side = (bands.chipWidth ?? 0) + 16;
    return {
      x: region.x + CELL + side,
      y: region.y + CELL + dims,
      w: Math.max(0, region.w - 2 * CELL - dims - side),
      h: Math.max(0, region.h - 2 * CELL - dims),
    };
  }
  return {
    x: region.x + CELL,
    y: region.y + CELL + dims,
    w: Math.max(0, region.w - 2 * CELL - dims),
    h: Math.max(0, region.h - 2 * CELL - dims - bands.chip),
  };
};

export const chipBox = (region: Region, chipHeight: number, maxWidth = 420): Box => ({
  x: region.x + 8,
  y: region.y + region.h - chipHeight,
  w: Math.min(region.w - 16, maxWidth),
  h: chipHeight,
});

/** The nearest grid crossing to a desk-local point: x = 24 i + 0.5, y = H − 24 j − 0.5 (the grid lines' pixel centres). */
export const snapToGrid = (x: number, y: number, deskHeight: number): [number, number] => [
  Math.round((x - 0.5) / CELL) * CELL + 0.5,
  deskHeight - (Math.round((deskHeight - y - 0.5) / CELL) * CELL + 0.5),
];

const frameOf = (b: Box): Frame => ({ x: b.x, y: b.y, w: b.w, h: b.h });

/**
 * The best placement of a plan whose extent (block-local metres, dims included
 * by the caller if wanted) must fit one of `regions`: the largest ladder scale,
 * north up on a tie, then the larger region. `deskHeight` sets the grid's phase.
 */
export const placePlan = (regions: readonly Region[], extent: Extent, bands: Bands, deskHeight: number, minScale: number = SCALE_LADDER[SCALE_LADDER.length - 1]): PlanPlacement | null => {
  const ew = extent.x1 - extent.x0;
  const eh = extent.y1 - extent.y0;
  let best: { region: Region; scale: number; psi: number; area: Box } | null = null;
  for (const region of regions) {
    const area = drawingArea(region, bands);
    if (!(area.w > 0 && area.h > 0)) continue;
    for (const psi of [NORTH_UP, 180 * DEG]) {
      const [w, h] = psi === NORTH_UP ? [ew, eh] : [eh, ew];
      const scale = SCALE_LADDER.find((s) => s >= minScale && w * s <= area.w && h * s <= area.h);
      if (scale === undefined) continue;
      if (!best || scale > best.scale || (scale === best.scale && (
        (psi === NORTH_UP && best.psi !== NORTH_UP)
        || ((psi === NORTH_UP) === (best.psi === NORTH_UP) && region.w * region.h > best.region.w * best.region.h)
      ))) best = { region, scale, psi, area };
    }
  }
  if (!best) return null;
  const { region, scale, psi, area } = best;
  const frame = frameOf(area);
  const pose = planPose((extent.x0 + extent.x1) / 2, (extent.y0 + extent.y1) / 2, frame.h / (2 * scale), psi);
  // Snap the building's origin onto a grid crossing, moving the centre by whole pixels' worth of metres.
  const b = basis(pose);
  const at = [0, 0];
  project(pose, b, frame, 0, 0, 0, at);
  const [gx, gy] = snapToGrid(at[0], at[1], deskHeight);
  const dx = (gx - at[0]) / scale; // screen right, metres
  const dy = (at[1] - gy) / scale; // screen up, metres
  pose.cx -= dx * b.rx + dy * b.ux;
  pose.cy -= dx * b.ry + dy * b.uy;
  return { region, area, scale, psi, pose, chip: chipBox(region, bands.chip) };
};

/**
 * The poster's frame inside a region: the whole 4:3 poster when the region holds
 * it at no less than `fullAt` of its size (contained), else a crop around `focus`
 * (poster px, the building's projected box) with the building at `share` of the
 * region's height. Returns the frame (desk px, the full poster's rectangle — larger
 * than the region when cropped) and the crop it shows, in poster px.
 */
export const posterInRegion = (
  area: Box, posterW: number, posterH: number, focus: Box, fullAt = 0.4, share = 0.55,
): { frame: Frame; crop: Box | null } => {
  const fit = Math.min(area.w / posterW, area.h / posterH);
  if (fit >= fullAt) {
    const w = posterW * fit;
    const h = posterH * fit;
    return { frame: { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h }, crop: null };
  }
  const m = Math.min((share * area.h) / Math.max(focus.h, 1), (share * area.w) / Math.max(focus.w, 1));
  const cx = focus.x + focus.w / 2;
  const cy = focus.y + focus.h / 2;
  const frame = { x: area.x + area.w / 2 - cx * m, y: area.y + area.h / 2 - cy * m, w: posterW * m, h: posterH * m };
  // What the area shows of the poster: where the window reaches past an edge, only the part inside.
  const x0 = Math.max(0, (area.x - frame.x) / m);
  const y0 = Math.max(0, (area.y - frame.y) / m);
  const x1 = Math.min(posterW, (area.x + area.w - frame.x) / m);
  const y1 = Math.min(posterH, (area.y + area.h - frame.y) / m);
  const crop = { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  return { frame, crop };
};
