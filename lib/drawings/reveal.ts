import type { Massing, Pts, SheetGeometry } from './decode';
import { depth, project } from './project';
import type { Ctx, View } from './paint';

// DRAW-IN's pen (docs/portfolio/desk-drawing-set.md §2 "Reveal rule"). A sheet's
// line work is painted once, finished, into a cache; the pens then stroke the
// same paths, in pen order, into a cumulative mask, and the visible canvas shows
// the cache only where the mask is. So the end state is exactly the still, a
// dashed line's phase never restarts, crossings never double, and a line hidden
// in the finished drawing never flashes while the pen passes. Several pens share
// a long sheet, each taking a length-balanced slice of the order. Pure but for
// the context it strokes.

/** Closed (or open) polylines in px, in pen order. */
export type PenPaths = Float64Array[];

const projectPath = (v: View, ring: Pts, z: number, close: boolean): Float64Array => {
  const n = ring.length / 2 + (close ? 1 : 0);
  const out = new Float64Array(2 * n);
  const p = [0, 0];
  for (let i = 0; i < n; i += 1) {
    const k = (2 * i) % ring.length;
    project(v.pose, v.b, v.frame, ring[k], ring[k + 1], z, p);
    out[2 * i] = p[0];
    out[2 * i + 1] = p[1];
  }
  return out;
};

/** A plan's pen order: the footprint from its first vertex, then the rooms as stored (the generator's pen order). */
export const planPenPaths = (v: View, g: SheetGeometry, z = 0): PenPaths =>
  [projectPath(v, g.fp, z, true), ...g.rooms.map((r) => projectPath(v, r, z, true))];

/** The site plan's pen order: the buildings in pack order, then the kerbs. */
export const sitePenPaths = (v: View, buildings: readonly Massing[], kerbs: readonly Pts[]): PenPaths =>
  [...buildings.map((b) => projectPath(v, b.fp, 0, true)), ...kerbs.map((k) => projectPath(v, k, 0, false))];

/** Massing, nearest first: each building's base, its corners, its roof (`top` per building, m). */
export const massingPenPaths = (v: View, buildings: readonly Massing[], top: (b: Massing) => number): PenPaths => {
  const near = [...buildings].sort((a, b) => depth(v.b, v.pose, a.fp[0], a.fp[1], 0) - depth(v.b, v.pose, b.fp[0], b.fp[1], 0));
  const out: PenPaths = [];
  const p = [0, 0];
  for (const b of near) {
    const h = top(b);
    out.push(projectPath(v, b.fp, 0, true));
    for (let i = 0; i < b.fp.length; i += 2) {
      const edge = new Float64Array(4);
      project(v.pose, v.b, v.frame, b.fp[i], b.fp[i + 1], 0, p);
      edge[0] = p[0]; edge[1] = p[1];
      project(v.pose, v.b, v.frame, b.fp[i], b.fp[i + 1], h, p);
      edge[2] = p[0]; edge[3] = p[1];
      out.push(edge);
    }
    out.push(projectPath(v, b.fp, h, true));
  }
  return out;
};

const pathLength = (path: Float64Array): number => {
  let l = 0;
  for (let i = 2; i < path.length; i += 2) l += Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]);
  return l;
};

export class PenReveal {
  readonly total: number;
  readonly pens: number;
  private readonly lengths: number[];
  private readonly starts: number[];
  private done = 0;

  constructor(private readonly paths: PenPaths, pens: number) {
    this.lengths = paths.map(pathLength);
    this.starts = [];
    let at = 0;
    for (const l of this.lengths) { this.starts.push(at); at += l; }
    this.total = at;
    this.pens = Math.max(1, Math.round(pens));
  }

  /** Strokes into `mask` everything the pens draw between the last call and `t` ∈ [0, 1]. */
  strokeTo(mask: Ctx, t: number, width: number) {
    const to = Math.max(this.done, Math.min(1, t));
    if (to <= this.done || this.total <= 0) return;
    mask.save();
    mask.globalCompositeOperation = 'source-over';
    mask.setLineDash([]);
    mask.lineCap = 'round';
    mask.lineJoin = 'round';
    mask.lineWidth = width;
    mask.strokeStyle = '#000';
    mask.beginPath();
    const slice = this.total / this.pens;
    for (let k = 0; k < this.pens; k += 1) this.trace(mask, k * slice + this.done * slice, k * slice + to * slice);
    mask.stroke();
    mask.restore();
    this.done = to;
  }

  /** Adds the stretch of the pen order between arc lengths a and b to the current path. */
  private trace(ctx: Ctx, a: number, b: number) {
    for (let p = 0; p < this.paths.length; p += 1) {
      const s0 = this.starts[p];
      const s1 = s0 + this.lengths[p];
      if (s1 <= a || s0 >= b) continue;
      const path = this.paths[p];
      let at = s0;
      let open = false;
      for (let i = 2; i < path.length; i += 2) {
        const x0 = path[i - 2]; const y0 = path[i - 1]; const x1 = path[i]; const y1 = path[i + 1];
        const l = Math.hypot(x1 - x0, y1 - y0);
        const e0 = at;
        const e1 = at + l;
        at = e1;
        if (e1 <= a || e0 >= b || l === 0) { open = false; continue; }
        const f0 = Math.max(0, (a - e0) / l);
        const f1 = Math.min(1, (b - e0) / l);
        const sx = x0 + (x1 - x0) * f0; const sy = y0 + (y1 - y0) * f0;
        if (!open || f0 > 0) ctx.moveTo(sx, sy);
        ctx.lineTo(x0 + (x1 - x0) * f1, y0 + (y1 - y0) * f1);
        open = f1 >= 1;
      }
    }
  }

  /** How far the reveal has gone, 0–1. */
  get progress(): number {
    return this.done;
  }
}
