import type { InstancedMesh, InstancedBufferAttribute, Matrix4 } from 'three';
import { siteSpokenName } from '../../../../lib/estate/announce';
import { pointBoxDistance, type Vec3 } from '../../../../lib/estate/frames';
import { groundAt, nearestGround, type GroundGrid, type GroundHit } from '../../../../lib/estate/ground';
import { ESTATE_SITE_IDS, type EstateSiteId, type EstateStoreyTag } from '../../../../lib/estate/ids';
import { RESIDENT_FACADE } from '../../../../lib/estate/lod';
import { roomAt, type EstateNav, type NavRoom } from '../../../../lib/estate/nav';
import type { EstateScheduler } from '../../../../lib/estate/scheduler';
import type { EstatePack, PackBuilding } from '../../../../lib/estate/schema';
import {
  applyBand, bandHalfWidth, bandLabel, clearBand, createBandState, EYE_HEIGHT, inRange, interiorAccess, interiorActive, MASK_OFF,
  polygonDistance, storeyAt, storeyFromEye, storeyTable, PEEK_DISTANCE,
  type BandState, type InteriorAccess, type StoreyTable,
} from '../../../../lib/estate/storeys';
import type { EstateTier } from '../../../../lib/estate/tiers';
import { floorAt, type FloorHit, type WalkFile } from '../../../../lib/estate/walk';
import { PLAN_CUT_OFF, setPlanCut, setStoreyMask } from './materials';
import { PLAN_CUT_DEFAULT } from '../../../../lib/estate/plan';
import { STOREY_ATTRIBUTE, type InteriorFurniture, type InteriorParts, type Part } from './parts';
import type { BuildingNode } from './scene';

// Interiors (plan §7.5, with §7.6's streaming and §8.4's floors): which
// building the camera is at, which storey, which band of storeys its interior
// draws, and the façade mask that opens exactly that band. One instance per
// engine (core.ts owns it); the pure rules are lib/estate/storeys.ts, so node
// tests and this run the same arithmetic.
//
// Each frame (core.ts, after uploads and culling, before detail selection):
//  1. The current building: the one the camera is inside (footprint + 0.5 m,
//     1 m below ground … 2 m above the roof), else the nearest it is peeking at
//     (within 6 m of the footprint, ground … roof); the building it was at
//     keeps the title while it still qualifies, so two close blocks never
//     flicker. Leaving a building releases its walk grid's decoded storeys.
//  2. The current storey S, from the eye (feet = eye − 1.6 m, 0.25 m
//     hysteresis), or from a hint (setStoreyHint: Walk knows the floor under
//     its feet, which is right on a stair where eye height is not).
//  3. Active = (inside, peeking or Plan) AND the interior file fully on the GPU
//     AND entering it has not failed for good AND (peeking and Plan) its
//     façade is resident, so the band opens a façade, not a massing box.
//     Plan (P6) also holds the building at F, like inside, and draws its
//     interior only up to S, cut at FFL_S + the cut (uPlanCut on the interior's
//     uniforms), with the façade masked from the band's foot to the roof and
//     the interior's opaque materials two-sided (the cut's fill; scene.ts
//     setPlanSides through the onPlanSides hook).
//  4. Active: the band [S − k, S + k] (k ≥ 1 on every tier; peeking 1). A band
//     change writes ≤ 5 T instances (matrix and storey), the interior's uBand,
//     which specials show, and the façade mask (the building's F, D and edge
//     materials share one uStoreyMask): no download, no new geometry. F's slab
//     of S + k + 1 is outside the mask and stays as the top storey's ceiling.
//     Not active: no mask, the interior hidden, F and D whole.
//  5. Furniture: full kits within the tier's furniture radius of the camera,
//     their stand-ins (the pack's proxy_<kit>, 10–30 triangles) beyond, only
//     for storeys in the band.
//  6. The reserve: what the interior draws (triangles, draws), which detail
//     selection books before any building (§7.4 per-frame budget, step 1).
//
// Walk grids, nav files and the outdoor ground (CPU data) are kept here too,
// with the queries the Walk controls read: floorQuery (which grid answers at a
// point, and its floor), locate (building, storey, flat and room), entry
// (whether a building can be entered yet, and why not).
//
// Allocation: none per frame once a building's buffers exist; status changes
// allocate a fresh frozen status object (at most once per frame, and only on a
// change).

/** Re-partition furniture after the camera moves this far in plan, m. */
export const FURNITURE_REPARTITION_M = 0.5;
/** A nodata ground cell borrows the nearest covered cell's height within this, m (§8.4: aprons). */
export const GROUND_REACH_M = 1.5;
/** Prefilter for the per-building tests: farther than this from a building's box, it cannot be inside or peeking. */
const BOX_REACH_M = PEEK_DISTANCE + 0.5;

export type InteriorState = 'none' | 'streaming' | 'ready' | 'failed';

/** Where the camera is, interior-wise. A fresh frozen object on every change. */
export interface InteriorStatus {
  /** The building the camera is inside or peeking at, or null. */
  readonly site: EstateSiteId | null;
  readonly index: number;
  readonly access: InteriorAccess;
  /** S, as an index into the building's storeys, and its tag; −1 / null with no building. */
  readonly storey: number;
  readonly storeyTag: EstateStoreyTag | null;
  /** The interior draws and the façade mask is on. */
  readonly active: boolean;
  /** The band (storey indices) while active, else MASK_OFF (0, −1). */
  readonly lo: number;
  readonly hi: number;
  /** 'L4–L6' while active (data-estate-band), else null. */
  readonly band: string | null;
  /** none: no building; streaming: its interior is not on the GPU yet; ready: it is; failed: entering it failed for good. */
  readonly state: InteriorState;
  /** Why entering failed, for the HUD and Enter's refusal; null otherwise. */
  readonly reason: string | null;
}

const NO_STATUS: InteriorStatus = Object.freeze({
  site: null, index: -1, access: 'outside', storey: -1, storeyTag: null, active: false, lo: MASK_OFF.lo, hi: MASK_OFF.hi,
  band: null, state: 'none', reason: null,
});

export type EntryState = 'ready' | 'streaming' | 'failed' | 'absent';

/** Whether a building can be entered (Walk inside it): its interior on the GPU, its walk grid and nav file decoded. */
export interface InteriorEntry {
  state: EntryState;
  /** For 'failed' and 'absent': a sentence for the HUD and the announcer. */
  reason: string | null;
}

/** Which grid answers at a point (§8.4) and the floor it gives. Estate frame in, block-local layer out. */
export interface FloorQuery {
  /**
   * building: inside a building's walk bounds (less 0.5 m), with a floor within
   *   ±step of the feet (`z`, its `layer` = storey index);
   * blocked: inside those bounds, no floor there within reach (a wall, a void);
   * pending: inside those bounds before the walk grid arrived (footprints
   *   block, "PREPARING WALKWAY…"), or outdoors before the ground arrived;
   * ground: outdoors, the ground height (own cell, or the nearest covered one
   *   within GROUND_REACH_M); always walkable;
   * none: outdoors with no ground data near (off the estate, or a nodata patch).
   */
  kind: 'building' | 'blocked' | 'pending' | 'ground' | 'none';
  /** Floor height, m (estate z = block-local z); NaN unless building or ground. */
  z: number;
  site: EstateSiteId | null;
  /** Storey index of a building floor, else −1. */
  layer: number;
}

/** Where a point is, for the location chip: building, storey, flat and room (nav.ts roomAt). */
export interface InteriorLocation {
  site: EstateSiteId | null;
  storey: EstateStoreyTag | null;
  unit: string | null;
  room: string | null;
}

export interface InteriorFrame {
  now: number;
  /** Camera position, estate frame. */
  eye: Vec3;
  tier: EstateTier;
  /** The tier's furniture radius, m (tiers.ts furnitureRadiusM). */
  furnitureRadius: number;
}

/** What interior.ts asks the scheduler (EstateScheduler fits; tests pass a stub). */
export type InteriorScheduler = Pick<EstateScheduler, 'isResident' | 'residentMask' | 'entryBlocked' | 'seen'>;

/** A building by its id or its index (ESTATE_SITE_IDS order, pack.sites order). */
export type SiteRef = EstateSiteId | number;

interface Building {
  readonly index: number;
  readonly site: PackBuilding;
  readonly table: StoreyTable;
  readonly band: BandState;
  walk: WalkFile | null;
  nav: EstateNav | null;
  /** Why entering failed for good (a streaming failure), or null. */
  failed: string | null;
  /** The band's instances, uBand, specials and mask are written for `band` (cleared on deactivation and context loss). */
  applied: boolean;
  /** The furniture partition's inputs when it last ran (block-local glTF x, z; radius; band). */
  fx: number;
  fz: number;
  fRadius: number;
  fLo: number;
  fHi: number;
  /** What the interior draws now. */
  tris: number;
  draws: number;
  /** The Plan cut (world Y) written on its uniforms, or PLAN_CUT_OFF: Plan's mask, uBand and sides follow it. */
  planCut: number;
}

const showParts = (parts: readonly Part[], on: boolean): number => {
  let shown = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const visible = on && parts[i].uploaded;
    parts[i].object.visible = visible;
    if (visible) shown += 1;
  }
  return shown;
};

/** What failed to download, in the visitor's words, by class (the walk grid is the HUD's "walkway"). */
const FAILED_PART: Readonly<Record<'i' | 'w' | 'nav', string>> = {
  i: 'its interior',
  w: 'its walkway map',
  nav: 'its rooms, stairs and lifts',
};

const failReason = (site: EstateSiteId, klass: 'i' | 'w' | 'nav' = 'i'): string =>
  `${siteSpokenName(site)} cannot be entered: ${FAILED_PART[klass]} did not download. Reload the page to try again.`;

export class InteriorSystem {
  readonly buildings: Building[];
  private readonly scheduler: InteriorScheduler;
  private nodes: readonly BuildingNode[] = [];
  private groundGrid: GroundGrid | null = null;
  private status: InteriorStatus = NO_STATUS;
  private current = -1;
  private storey = -1;
  private hint: { index: number; storey: number } | null = null;
  private plan: { index: number; storey: number; cut: number } | null = null;
  private readonly onChange: (status: InteriorStatus) => void;
  private onPlanSides: (index: number, on: boolean) => void = () => undefined;

  /** After update(): what the active interior draws, booked before any building. */
  reserveTris = 0;
  reserveDraws = 0;
  /** After update(): the building the camera is inside (its exterior is held at F, §7.5), or −1. */
  insideIndex = -1;
  /** After update(): the building the camera is inside or peeking at, or −1. */
  currentIndex = -1;

  constructor(pack: EstatePack, scheduler: InteriorScheduler, onChange: (status: InteriorStatus) => void = () => undefined) {
    this.scheduler = scheduler;
    this.onChange = onChange;
    this.buildings = pack.sites.map((site, index) => ({
      index, site, table: storeyTable(site.storeys), band: createBandState(),
      walk: null, nav: null, failed: null, applied: false,
      fx: Number.NaN, fz: Number.NaN, fRadius: -1, fLo: 0, fHi: -1, tris: 0, draws: 0, planCut: PLAN_CUT_OFF,
    }));
  }

  /**
   * The scene's building nodes (index-aligned with pack.sites), once it exists,
   * and how Plan turns a building's interior two-sided (scene.ts setPlanSides).
   */
  bindScene(nodes: readonly BuildingNode[], onPlanSides?: (index: number, on: boolean) => void): void {
    this.nodes = nodes;
    if (onPlanSides) this.onPlanSides = onPlanSides;
    for (const b of this.buildings) b.applied = false;
  }

  // ---- data arriving ------------------------------------------------------------------

  /** A walk grid decoded (streaming.ts, with its site). */
  addWalk(site: SiteRef, walk: WalkFile): void {
    const b = this.building(site);
    if (b) b.walk = walk;
  }

  /** A nav file parsed (streaming.ts, with its site). */
  addNav(site: SiteRef, nav: EstateNav): void {
    const b = this.building(site);
    if (b) b.nav = nav;
  }

  addGround(ground: GroundGrid): void {
    this.groundGrid = ground;
  }

  /**
   * Entering `site` failed for good (scheduler.entryBlocked): its interior, walk
   * grid or nav file, named by `klass` in the reason (the first failure's).
   */
  markFailed(site: SiteRef, _message: string, klass: 'i' | 'w' | 'nav' = 'i'): void {
    const b = this.building(site);
    if (b && b.failed === null) b.failed = failReason(b.site.id, klass);
  }

  // ---- reading ------------------------------------------------------------------------

  /** The current status (a frozen snapshot; a new object on each change). */
  getStatus(): InteriorStatus { return this.status; }
  /** The building's storey table (from pack.json: tags, FFLs, typical/special). */
  table(site: SiteRef): StoreyTable | null { return this.building(site)?.table ?? null; }
  /** Its walk grid, once decoded (layer i = storey i); null before. */
  walk(site: SiteRef): WalkFile | null { return this.building(site)?.walk ?? null; }
  /** Its nav file (rooms, lifts, doors, stairs, spawns), once parsed; null before. */
  nav(site: SiteRef): EstateNav | null { return this.building(site)?.nav ?? null; }
  /** The outdoor ground heights, once decoded (streamed at P0 in Walk and Fly); null before. */
  ground(): GroundGrid | null { return this.groundGrid; }
  /** ESTATE_SITE_IDS index of a site, or −1. */
  indexOf(site: SiteRef): number { return this.building(site)?.index ?? -1; }

  /**
   * Whether `site` can be entered now. ready: interior on the GPU, walk grid and
   * nav file decoded; streaming: some of that still to come (Enter starts the
   * downloads at P0 through the core's focus); failed: for good, with the reason;
   * absent: the pack has no interior for it.
   */
  entry(site: SiteRef, out: InteriorEntry = { state: 'absent', reason: null }): InteriorEntry {
    const b = this.building(site);
    if (!b || !b.site.interior || !b.site.walk || !b.site.nav) {
      out.state = 'absent';
      out.reason = b ? `${siteSpokenName(b.site.id)} has no interior in this pack.` : null;
      return out;
    }
    if (b.failed !== null || this.scheduler.entryBlocked(b.site.id)) {
      out.state = 'failed';
      out.reason = b.failed ?? failReason(b.site.id);
      return out;
    }
    const resident = this.resident(b);
    out.state = resident && b.walk !== null && b.nav !== null ? 'ready' : 'streaming';
    out.reason = null;
    return out;
  }

  /**
   * Walk's storey: while the camera is in building `index`, S is `storey` (the
   * walk layer under the feet) instead of the eye-height rule. null clears it.
   */
  setStoreyHint(site: SiteRef | null, storey = -1): void {
    const index = site === null ? -1 : this.indexOf(site);
    const before = this.hint?.index ?? -1;
    this.hint = index < 0 ? null : { index, storey };
    // The walker left that building's grid: its decoded storeys go (unless the camera is still at it).
    if (index !== before) this.releaseIdle();
  }

  /**
   * Drop the decoded storeys of every walk grid but the current building's and
   * the walker's (the hint's). Run when either changes, so a grid a floor query
   * merely passed through (overlapping walk bounds: the car park's and the
   * hawker centre's) does not keep its rasters for the engine's life.
   */
  private releaseIdle(): void {
    const keep = this.hint?.index ?? -1;
    for (let i = 0; i < this.buildings.length; i += 1) {
      const b = this.buildings[i];
      if (i !== this.current && i !== keep) b.walk?.release();
    }
  }

  /** CPU bytes the walk grids hold (walk.ts cpuBytes): their runs, overflow and decoded storeys. */
  walkBytes(): number {
    let bytes = 0;
    for (let i = 0; i < this.buildings.length; i += 1) bytes += this.buildings[i].walk?.cpuBytes() ?? 0;
    return bytes;
  }

  /**
   * Plan (P6): building `site` shows its interior with S = `storey` wherever the
   * camera is, cut `cut` m above S's floor. null ends it.
   */
  setPlan(site: SiteRef | null, storey = -1, cut = PLAN_CUT_DEFAULT): void {
    const index = site === null ? -1 : this.indexOf(site);
    this.plan = index < 0 ? null : { index, storey, cut };
  }

  /** The building Plan shows, or −1. */
  get planIndex(): number { return this.plan?.index ?? -1; }

  /**
   * The floor at estate (x, y) for feet at `feetZ` (§8.4), into `out`: a
   * building's walk grid inside its walk bounds less 0.5 m (pack.json gives the
   * bounds before the file arrives), else the outdoor ground. Overlapping
   * bounds: the first building with a floor there wins.
   */
  floorQuery(x: number, y: number, feetZ: number, out: FloorQuery, hit: FloorHit = SCRATCH_HIT): FloorQuery {
    out.kind = 'none'; out.z = Number.NaN; out.site = null; out.layer = -1;
    let fallback: Building | null = null;
    let fallbackKind: 'blocked' | 'pending' = 'blocked';
    for (let i = 0; i < this.buildings.length; i += 1) {
      const b = this.buildings[i];
      const grid = b.site.walk?.grid;
      if (!grid) continue;
      const lx = x - b.site.at[0];
      const ly = y - b.site.at[1];
      const inset = 0.5;
      if (lx < grid.origin[0] + inset || lx > grid.origin[0] + grid.nx * grid.cell - inset
        || ly < grid.origin[1] + inset || ly > grid.origin[1] + grid.ny * grid.cell - inset) continue;
      if (b.walk === null) {
        if (fallback === null || fallbackKind === 'blocked') { fallback = b; fallbackKind = 'pending'; }
        continue;
      }
      const z = floorAt(b.walk, lx, ly, feetZ, hit);
      if (z !== null) {
        out.kind = 'building'; out.z = z; out.site = b.site.id; out.layer = hit.layer;
        return out;
      }
      if (fallback === null) { fallback = b; fallbackKind = 'blocked'; }
    }
    if (fallback !== null) {
      out.kind = fallbackKind; out.site = fallback.site.id;
      return out;
    }
    const ground = this.groundGrid;
    if (ground === null) {
      out.kind = 'pending';
      return out;
    }
    const own = groundAt(ground, x, y);
    if (own !== null) {
      out.kind = 'ground'; out.z = own;
      return out;
    }
    if (nearestGround(ground, x, y, GROUND_REACH_M, SCRATCH_GROUND)) {
      out.kind = 'ground'; out.z = SCRATCH_GROUND.z;
    }
    return out;
  }

  /**
   * The building, storey, flat and room at estate (x, y) with feet at `feetZ`:
   * the building whose footprint (+ 0.5 m) holds it, the storey whose band holds
   * the feet (or `storey` when given), and the smallest room of its nav file
   * there. Nulls where unknown (no building, no nav yet, no room).
   */
  locate(x: number, y: number, feetZ: number, out: InteriorLocation, storey = -1): InteriorLocation {
    out.site = null; out.storey = null; out.unit = null; out.room = null;
    for (let i = 0; i < this.buildings.length; i += 1) {
      const b = this.buildings[i];
      const p = SCRATCH_POINT;
      p[0] = x; p[1] = y; p[2] = feetZ;
      if (pointBoxDistance(p, b.site.bounds[0], b.site.bounds[1]) > BOX_REACH_M) continue;
      const lx = x - b.site.at[0];
      const ly = y - b.site.at[1];
      if (interiorAccess(lx, ly, feetZ + EYE_HEIGHT, b.site) !== 'inside') continue;
      const s = storey >= 0 && storey < b.table.ffl.length ? storey : storeyAt(b.table, feetZ);
      out.site = b.site.id;
      out.storey = b.table.tags[s];
      const room: NavRoom | null = b.nav ? roomAt(b.nav, s, lx, ly, feetZ) : null;
      if (room) {
        out.unit = room.flat;
        out.room = room.label;
      }
      return out;
    }
    return out;
  }

  // ---- per frame ------------------------------------------------------------------------

  /** Tells the scheduler the active interior drew (its eviction clock). Before takeUpload, like scene.markSeen. */
  markSeen(now: number): void {
    const id = this.status.active ? this.buildings[this.status.index]?.site.interior?.path : undefined;
    if (id) this.scheduler.seen(id, now);
  }

  /**
   * One frame (see the header). Returns true when what draws changed (a band
   * change, the interior turning on or off, furniture re-partitioned): the
   * frame loop's two settle frames.
   */
  update(frame: InteriorFrame): boolean {
    const eye = frame.eye;
    const scheduler = this.scheduler;
    let changed = false;

    // 1. The current building, and where the camera is relative to it.
    let index = -1;
    let access: InteriorAccess = 'outside';
    if (this.plan) {
      index = this.plan.index;
      access = this.accessTo(index, eye);
    } else {
      const prev = this.current;
      const prevAccess = prev >= 0 ? this.accessTo(prev, eye) : 'outside';
      let bestPeek = -1;
      let bestPeekD = Infinity;
      for (let i = 0; i < this.buildings.length; i += 1) {
        const b = this.buildings[i];
        if (pointBoxDistance(eye, b.site.bounds[0], b.site.bounds[1]) > BOX_REACH_M) continue;
        const a = i === prev ? prevAccess : this.accessTo(i, eye);
        if (a === 'inside') { index = i; access = 'inside'; if (i === prev) break; }
        else if (a === 'peeking' && index < 0) {
          const d = i === prev ? -1 : polygonDistance(eye[0] - b.site.at[0], eye[1] - b.site.at[1], b.site.footprint);
          if (d < bestPeekD) { bestPeekD = d; bestPeek = i; }
        }
      }
      if (index < 0 && bestPeek >= 0) { index = bestPeek; access = 'peeking'; }
      // The building it was at keeps the title while it still qualifies, unless another has the camera inside.
      if (prev >= 0 && prevAccess !== 'outside' && !(access === 'inside' && prevAccess === 'peeking')) { index = prev; access = prevAccess; }
    }
    if (index !== this.current) {
      const left = this.buildings[this.current];
      if (left) changed = this.deactivate(left) || changed;
      this.current = index;
      this.storey = -1;
      // Leaving a building releases its walk grid's decoded storeys (but not under a walker still on it).
      this.releaseIdle();
    }
    this.currentIndex = access !== 'outside' || this.plan ? index : -1;
    // Plan holds the building's exterior at F too: D never draws over its cut.
    this.insideIndex = access === 'inside' || this.plan ? index : -1;

    const b = this.buildings[index];
    if (!b) {
      this.reserveTris = 0;
      this.reserveDraws = 0;
      this.publish(NO_STATUS);
      return changed;
    }

    // 2. The storey.
    let storey: number;
    if (this.plan && this.plan.index === index && this.plan.storey >= 0) storey = this.plan.storey;
    else if (this.hint && this.hint.index === index && this.hint.storey >= 0 && this.hint.storey < b.table.ffl.length) storey = this.hint.storey;
    else storey = storeyFromEye(b.table, eye[2], this.storey);
    this.storey = storey;

    // 3. Active?
    const failed = b.failed !== null || scheduler.entryBlocked(b.site.id);
    if (failed && b.failed === null) b.failed = failReason(b.site.id);
    const resident = this.resident(b);
    const facadeUp = (scheduler.residentMask(b.site.id) & RESIDENT_FACADE) !== 0;
    const active = !failed && interiorActive(access, this.plan !== null, resident) && ((access !== 'peeking' && !this.plan) || facadeUp);
    const node = this.nodes[index];

    if (!active || !node || !node.interiorParts) {
      changed = this.deactivate(b) || changed;
      this.reserveTris = 0;
      this.reserveDraws = 0;
      this.publishFor(b, storey, access, false, failed, resident);
      return changed;
    }

    // 4. The band, and everything it decides.
    const k = bandHalfWidth(frame.tier, this.plan ? 'inside' : access);
    const bandChanged = applyBand(b.band, b.table, storey, k);
    const planCut = this.plan ? b.table.ffl[storey] + this.plan.cut : PLAN_CUT_OFF;
    if (bandChanged || !b.applied || planCut !== b.planCut) {
      this.applyBandTo(b, node, node.interiorParts, planCut);
      changed = true;
    }

    // 5. Furniture near and far.
    if (node.interiorParts.furniture.length > 0) {
      const lx = eye[0] - b.site.at[0];
      const lz = -(eye[1] - b.site.at[1]);
      const r = frame.furnitureRadius;
      if (b.fRadius !== r || b.fLo !== b.band.lo || b.fHi !== b.band.hi
        || !(Math.hypot(lx - b.fx, lz - b.fz) < FURNITURE_REPARTITION_M)) {
        this.partitionFurniture(b, node.interiorParts.furniture, lx, lz, r);
        changed = true;
      }
    }
    this.measure(b, node.interiorParts);
    this.reserveTris = b.tris;
    this.reserveDraws = b.draws;
    this.publishFor(b, storey, access, true, false, true);
    return changed;
  }

  /** A context restore: nothing is on the GPU, so every band is rewritten once its interior is back. */
  reset(): void {
    for (const b of this.buildings) {
      clearBand(b.band);
      b.applied = false;
      b.fRadius = -1;
      const node = this.nodes[b.index];
      if (node) setStoreyMask(node.storey, MASK_OFF.lo, MASK_OFF.hi);
      this.clearPlanCut(b);
    }
    this.reserveTris = 0;
    this.reserveDraws = 0;
    this.publish(NO_STATUS);
    this.current = -1;
  }

  // ---- internals --------------------------------------------------------------------------

  private accessTo(index: number, eye: Vec3): InteriorAccess {
    const site = this.buildings[index]?.site;
    if (!site) return 'outside';
    return interiorAccess(eye[0] - site.at[0], eye[1] - site.at[1], eye[2], site);
  }

  private building(site: SiteRef): Building | undefined {
    return typeof site === 'number' ? this.buildings[site] : this.buildings[ESTATE_SITE_IDS.indexOf(site)];
  }

  private resident(b: Building): boolean {
    const id = b.site.interior?.path;
    return id !== undefined && this.nodes[b.index]?.interiorParts != null && this.scheduler.isResident(id);
  }

  /** The interior off: hidden, no mask, no band. True if anything was showing. */
  private deactivate(b: Building): boolean {
    const node = this.nodes[b.index];
    const wasApplied = b.applied || b.band.lo <= b.band.hi;
    clearBand(b.band);
    b.applied = false;
    b.fRadius = -1;
    b.tris = 0;
    b.draws = 0;
    const uncut = this.clearPlanCut(b);
    if (!node) return wasApplied || uncut;
    const masked = setStoreyMask(node.storey, MASK_OFF.lo, MASK_OFF.hi);
    const shown = node.interior.visible;
    node.interior.visible = false;
    return wasApplied || masked || shown || uncut;
  }

  /** Plan's cut and sides off building `b` (its uniforms back to PLAN_CUT_OFF). True if they were on. */
  private clearPlanCut(b: Building): boolean {
    if (b.planCut === PLAN_CUT_OFF) return false;
    b.planCut = PLAN_CUT_OFF;
    const node = this.nodes[b.index];
    if (node) setPlanCut(node.interiorUniforms, PLAN_CUT_OFF);
    this.onPlanSides(b.index, false);
    return true;
  }

  /**
   * The band's instances, uBand, specials and mask. In Plan (`planCut` a height,
   * not PLAN_CUT_OFF) the interior draws only up to S (uBand's top is S, so T's
   * instances and the specials above collapse), the façade is masked from the
   * band's foot to the roof (nothing above the cut storey is drawn), and the
   * interior is cut and two-sided.
   */
  private applyBandTo(b: Building, node: BuildingNode, parts: InteriorParts, planCut: number) {
    const band = b.band;
    const plan = planCut !== PLAN_CUT_OFF;
    node.interiorUniforms.uBand.value.set(band.lo, plan ? band.storey : band.hi);
    setStoreyMask(node.storey, band.lo, plan ? b.table.ffl.length - 1 : band.hi);
    if (plan !== (b.planCut !== PLAN_CUT_OFF)) this.onPlanSides(b.index, plan);
    setPlanCut(node.interiorUniforms, planCut);
    b.planCut = planCut;
    const typical = parts.typical;
    if (typical) {
      for (let k = 0; k < typical.meshes.length; k += 1) {
        const part = typical.meshes[k];
        const mesh = part.object as InstancedMesh;
        writeTypical(mesh, typical.base[k], band);
        mesh.visible = band.typicalCount > 0 && part.uploaded;
      }
    }
    // R holds typical storeys only: drawn while the band holds any (uBand collapses the rest).
    if (parts.residual) showParts(parts.residual.parts, band.typicalCount > 0);
    for (let i = 0; i < parts.specials.length; i += 1) showParts(parts.specials[i].parts, inRange(band, parts.specials[i].storey));
    node.interior.visible = true;
    b.applied = true;
  }

  private partitionFurniture(b: Building, kits: readonly InteriorFurniture[], lx: number, lz: number, radius: number) {
    const r2 = radius > 0 ? radius * radius : -1;
    const lo = b.band.lo;
    const hi = b.band.hi;
    for (let k = 0; k < kits.length; k += 1) {
      const f = kits[k];
      const full = f.full?.object as InstancedMesh | undefined;
      const proxy = f.proxy?.object as InstancedMesh | undefined;
      const fullM = full?.instanceMatrix.array as Float32Array | undefined;
      const proxyM = proxy?.instanceMatrix.array as Float32Array | undefined;
      const fullS = full ? (full.geometry.getAttribute(STOREY_ATTRIBUTE) as InstancedBufferAttribute | undefined)?.array as Uint8Array | undefined : undefined;
      const proxyS = proxy ? (proxy.geometry.getAttribute(STOREY_ATTRIBUTE) as InstancedBufferAttribute | undefined)?.array as Uint8Array | undefined : undefined;
      let near = 0;
      let far = 0;
      for (let i = 0; i < f.count; i += 1) {
        const storey = f.storeys[4 * i];
        if (storey < lo || storey > hi) continue;
        const dx = f.centres[2 * i] - lx;
        const dz = f.centres[2 * i + 1] - lz;
        const isNear = dx * dx + dz * dz <= r2;
        if ((isNear && fullM) || (!proxyM && fullM)) {
          copyInstance(f, i, fullM, fullS, near);
          near += 1;
        } else if (proxyM) {
          copyInstance(f, i, proxyM, proxyS, far);
          far += 1;
        }
      }
      if (full) {
        full.count = near;
        full.instanceMatrix.needsUpdate = true;
        const attribute = full.geometry.getAttribute(STOREY_ATTRIBUTE) as InstancedBufferAttribute | undefined;
        if (attribute) attribute.needsUpdate = true;
        full.visible = near > 0 && f.full!.uploaded;
      }
      if (proxy) {
        proxy.count = far;
        proxy.instanceMatrix.needsUpdate = true;
        const attribute = proxy.geometry.getAttribute(STOREY_ATTRIBUTE) as InstancedBufferAttribute | undefined;
        if (attribute) attribute.needsUpdate = true;
        proxy.visible = far > 0 && f.proxy!.uploaded;
      }
    }
    b.fx = lx;
    b.fz = lz;
    b.fRadius = radius;
    b.fLo = lo;
    b.fHi = hi;
  }

  /** What the interior draws now: three's own counting (index count / 3 × instances; collapsed vertices still count). */
  private measure(b: Building, parts: InteriorParts) {
    let tris = 0;
    let draws = 0;
    const typical = parts.typical;
    if (typical) {
      for (let k = 0; k < typical.meshes.length; k += 1) {
        const mesh = typical.meshes[k].object as InstancedMesh;
        if (!mesh.visible) continue;
        tris += typical.tris[k] * mesh.count;
        draws += 1;
      }
    }
    // Indexed loops: this runs every frame inside a building (no iterator objects).
    const residual = parts.residual?.parts;
    if (residual) {
      for (let i = 0; i < residual.length; i += 1) if (residual[i].object.visible) { tris += trianglesOf(residual[i]); draws += 1; }
    }
    for (let s = 0; s < parts.specials.length; s += 1) {
      const list = parts.specials[s].parts;
      for (let i = 0; i < list.length; i += 1) if (list[i].object.visible) { tris += trianglesOf(list[i]); draws += 1; }
    }
    for (let k = 0; k < parts.furniture.length; k += 1) {
      const f = parts.furniture[k];
      const full = f.full?.object as InstancedMesh | undefined;
      const proxy = f.proxy?.object as InstancedMesh | undefined;
      if (full?.visible) { tris += f.fullTris * full.count; draws += 1; }
      if (proxy?.visible) { tris += f.proxyTris * proxy.count; draws += 1; }
    }
    b.tris = tris;
    b.draws = draws;
  }

  private publishFor(b: Building, storey: number, access: InteriorAccess, active: boolean, failed: boolean, resident: boolean) {
    const s = this.status;
    const state: InteriorState = failed ? 'failed' : resident ? 'ready' : 'streaming';
    const lo = active ? b.band.lo : MASK_OFF.lo;
    const hi = active ? b.band.hi : MASK_OFF.hi;
    if (s.index === b.index && s.storey === storey && s.access === access && s.active === active && s.state === state
      && s.lo === lo && s.hi === hi) return;
    this.publish(Object.freeze({
      site: b.site.id,
      index: b.index,
      access,
      storey,
      storeyTag: storey >= 0 ? b.table.tags[storey] : null,
      active,
      lo,
      hi,
      band: active ? bandLabel(b.table, b.band) : null,
      state,
      reason: failed ? b.failed ?? failReason(b.site.id) : null,
    }));
  }

  private publish(status: InteriorStatus) {
    if (status === this.status) return;
    this.status = status;
    this.onChange(status);
  }
}

const SCRATCH_HIT: FloorHit = { z: 0, layer: -1 };
const SCRATCH_POINT: Vec3 = [0, 0, 0];
const SCRATCH_GROUND: GroundHit = { z: 0, x: 0, y: 0, distance: 0 };

const trianglesOf = (p: Part): number => {
  const g = p.object.geometry;
  return Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3);
};

/** T's instances for the band: matrix T(0, FFL, 0) · base, storey in _STOREY.x; count = typical storeys in the band. */
export const writeTypical = (mesh: InstancedMesh, base: Matrix4, band: Pick<BandState, 'typicalCount' | 'typicalStorey' | 'typicalFfl'>): void => {
  const m = mesh.instanceMatrix.array as Float32Array;
  const e = base.elements;
  const attribute = mesh.geometry.getAttribute(STOREY_ATTRIBUTE) as InstancedBufferAttribute | undefined;
  const storeys = attribute ? attribute.array as Uint8Array : null;
  const capacity = Math.floor(m.length / 16);
  const count = Math.min(band.typicalCount, capacity);
  for (let j = 0; j < count; j += 1) {
    const o = 16 * j;
    for (let q = 0; q < 16; q += 1) m[o + q] = e[q];
    // Pre-multiplying by a translation moves only the translation column.
    m[o + 13] = e[13] + band.typicalFfl[j];
    if (storeys) {
      storeys[4 * j] = band.typicalStorey[j];
      storeys[4 * j + 1] = 0;
      storeys[4 * j + 2] = 0;
      storeys[4 * j + 3] = 0;
    }
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (attribute) attribute.needsUpdate = true;
};

const copyInstance = (f: InteriorFurniture, i: number, matrices: Float32Array, storeys: Uint8Array | undefined, slot: number) => {
  const from = 16 * i;
  const to = 16 * slot;
  for (let q = 0; q < 16; q += 1) matrices[to + q] = f.matrices[from + q];
  if (storeys) for (let q = 0; q < 4; q += 1) storeys[4 * slot + q] = f.storeys[4 * i + q];
};
