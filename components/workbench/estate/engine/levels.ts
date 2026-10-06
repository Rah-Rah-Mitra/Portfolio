import { pointBoxDistance } from '../../../../lib/estate/frames';
import { ESTATE_SITE_IDS } from '../../../../lib/estate/ids';
import {
  LOD_DETAIL, LOD_FACADE, LodSelector, type LodBuildingInput, type LodFrame, type LodLevel,
} from '../../../../lib/estate/lod';
import { buildingViews, type BuildingView, type EstateScheduler } from '../../../../lib/estate/scheduler';
import type { PackBuilding } from '../../../../lib/estate/schema';
import type { EstateTierRow } from '../../../../lib/estate/tiers';

// Detail selection, wired (plan §7.4 with the 2026-10-05 amendments): each
// frame the engine hands in what it measured — each building's frustum test and
// the camera's estate-frame position — and this turns it into lod.ts' inputs,
// runs the selector, and derives the scheduler's views from the same numbers:
//  - `resident` is scheduler.residentMask(site), so a level shows only once its
//    files are on the GPU;
//  - `maxLevel` is scheduler.levelCap(site), so a building whose D (or F) failed
//    for good settles on what it has;
//  - buildingViews() feeds both planWants (what to download) and setViews (what
//    eviction may take).
// Per-level costs come from pack.json: triangles drawn and draw calls at
// massing, F and D, with F's line primitive counted only on tiers that draw
// edges. Allocation happens once, in the constructor.

/** A building's cost at each level: [massing, F, D]. D includes F (D is drawn over it). */
export interface LevelCosts {
  tris: Float64Array;
  draws: Float64Array;
}

/**
 * Costs for one building. Massing is one draw; F is its primitives (triangle
 * primitives plus one LINES primitive when `edges` and the file has any); D adds
 * one draw per instanced batch and every instance's triangles (pack detail.tris).
 */
export const levelCosts = (site: PackBuilding, edges: boolean, out: LevelCosts = { tris: new Float64Array(3), draws: new Float64Array(3) }): LevelCosts => {
  const massingTris = site.massing?.tris ?? 0;
  out.tris[0] = massingTris;
  out.draws[0] = site.massing ? 1 : 0;
  const f = site.facade;
  if (f) {
    const lineDraws = f.edges > 0 ? 1 : 0;
    out.tris[1] = f.tris;
    out.draws[1] = f.draws - (edges ? 0 : lineDraws);
  } else {
    out.tris[1] = massingTris;
    out.draws[1] = out.draws[0];
  }
  const d = site.detail;
  out.tris[2] = out.tris[1] + (d?.tris ?? 0);
  out.draws[2] = out.draws[1] + (d?.draws ?? 0);
  return out;
};

export interface LevelFrame {
  now: number;
  /** sseScale() for the drawing buffer and the camera's vfov. */
  k: number;
  tier: EstateTierRow;
  lean: boolean;
  /** Index of the selected or targeted building, or −1. */
  focus: number;
  /**
   * Index of the building the camera is inside, or −1: its exterior is held at
   * F (§7.5), so D never draws over the open band and the interior's reserve
   * pays for it. Default −1.
   */
  inside?: number;
  /** Camera position, estate frame. */
  eye: ArrayLike<number>;
  /** Per building: inside the view frustum this frame. */
  visible: ArrayLike<boolean>;
  /** Already spoken for: the site, the ground grid (and in P5 the active interior). */
  reserveTris: number;
  reserveDraws: number;
}

export class LevelWiring {
  readonly selector: LodSelector;
  readonly inputs: LodBuildingInput[];
  readonly views: BuildingView[] = [];
  private readonly costs: LevelCosts[];
  private edges: boolean | null = null;
  private readonly frame: LodFrame = { now: 0, k: 1, tier: { tauPx: 1, maxTris: 1, maxDraws: 1 } };

  constructor(private readonly sites: readonly PackBuilding[]) {
    if (sites.length !== ESTATE_SITE_IDS.length) throw new RangeError(`LevelWiring: expected ${ESTATE_SITE_IDS.length} sites, got ${sites.length}`);
    this.selector = new LodSelector(sites.length);
    this.costs = sites.map(() => ({ tris: new Float64Array(3), draws: new Float64Array(3) }));
    this.inputs = sites.map((site, i) => ({
      visible: false,
      distance: Infinity,
      massingError: site.massing?.error ?? 0,
      resident: 0,
      tris: this.costs[i].tris,
      draws: this.costs[i].draws,
      focus: false,
      maxLevel: LOD_DETAIL as LodLevel,
    }));
  }

  /** Recomputes the per-level costs when the tier's edge rule changes. */
  private setEdges(edges: boolean) {
    if (this.edges === edges) return;
    this.edges = edges;
    this.sites.forEach((site, i) => levelCosts(site, edges, this.costs[i]));
  }

  /**
   * One frame: fills the inputs, selects, derives the views. Returns the
   * selector (its `level` array is what to draw); views are in `this.views`.
   */
  update(frame: LevelFrame, scheduler: EstateScheduler): LodSelector {
    this.setEdges(frame.tier.edges);
    const sites = this.sites;
    for (let i = 0; i < sites.length; i += 1) {
      const site = sites[i];
      const input = this.inputs[i];
      input.visible = frame.visible[i] === true;
      input.distance = pointBoxDistance(frame.eye, site.bounds[0], site.bounds[1]);
      input.resident = scheduler.residentMask(site.id);
      const cap = scheduler.levelCap(site.id);
      input.maxLevel = i === frame.inside && cap > LOD_FACADE ? LOD_FACADE : cap;
      input.focus = i === frame.focus;
    }
    const f = this.frame;
    f.now = frame.now;
    f.k = frame.k;
    f.tier = frame.tier;
    f.lean = frame.lean;
    f.reserveTris = frame.reserveTris;
    f.reserveDraws = frame.reserveDraws;
    this.selector.select(this.inputs, f);
    buildingViews(this.selector, this.inputs, this.views);
    return this.selector;
  }

  /** Forget level history (a context restore re-uploads everything). */
  reset(): void {
    this.selector.reset();
  }
}
