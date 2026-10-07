import type { EstateViewMode } from './frames';
import type { PackBuilding } from './schema';
import { ESTATE_TIERS, ESTATE_TIER_TABLE, type EstateTier } from './tiers';

// Level of detail for the Estate's buildings (plan §7.4). Pure: the engine
// hands in each building's distance, residency and per-level cost every frame,
// and reads back the level to show. No three, no DOM, so the thresholds, the
// hysteresis, the hold and the budget are all node-tested.
//
// Three levels, coarse to fine, each a superset in fidelity of the last:
//  - massing (0): the stage-0 box, one draw. Its geometric error e is measured
//    per site by the pack tool (p90 of LOD1's distance from the box), in metres.
//  - facade  (1): F, the shells with flat window and door panels; e = 0.06 m.
//  - detail  (2): F plus D, the instanced frames and doors, drawn over F; e = 0.
// D sits on F, so showing D needs both resident; massing is replaced, not kept.
//
// Screen-space error: K = buffer height / (2 tan(vfov/2)) is pixels per unit of
// angular size at the centre of the view, and SSE = e·K / max(d, 1) px. The 1 m
// floor keeps the error finite at the box (d = 0 inside one). A building's
// wanted level steps up while its current level's error exceeds τ and steps
// down once the next coarser level's is ≤ τ/1.3, so a camera hovering at one
// distance cannot flick between two levels.
//
// The shown level then answers to three more rules, in this order:
//  1. residency: a level is shown only once uploaded; until then the old one
//     stays (the coarsest resident level is the floor, never a hole);
//  2. the hold: a shown level is kept for DWELL_MS after a switch, unless the
//     caps, residency or a ceiling (lean, maxLevel) rule it out;
//  3. the budget: every visible building starts at its coarsest resident level,
//     then upgrades are taken one step at a time, held levels first, then in
//     order of error removed per triangle added, while the tier's triangle and
//     draw caps hold. A step that does not fit ends that building's climb; the
//     room left only shrinks, so it would not fit later either.
// The focus building (selected, flown to, inside, or just walked out of) is
// the one the visitor is looking at: once its F is resident its target is at
// least F whatever its distance says, and that step is taken with the holds,
// still under its ceiling and the caps. Without it an exit arc that landed
// past F's switch distance (min tier after a pixel-ratio notch) showed the
// block just left as its grey massing box.

export type LodLevel = 0 | 1 | 2;
export const LOD_NONE = -1;
export const LOD_MASSING = 0;
export const LOD_FACADE = 1;
export const LOD_DETAIL = 2;

/** Residency bits, one per uploaded file class (bit = 1 << level). */
export const RESIDENT_MASSING = 1;
export const RESIDENT_FACADE = 2;
export const RESIDENT_DETAIL = 4;
export const RESIDENT_ALL = 7;

/** Can `level` be drawn with these files uploaded? D is drawn over F, so it needs both. */
export const levelAvailable = (level: number, resident: number): boolean =>
  level === LOD_MASSING ? (resident & RESIDENT_MASSING) !== 0
    : level === LOD_FACADE ? (resident & RESIDENT_FACADE) !== 0
      : level === LOD_DETAIL ? (resident & (RESIDENT_FACADE | RESIDENT_DETAIL)) === (RESIDENT_FACADE | RESIDENT_DETAIL)
        : false;

// ---- screen-space error ------------------------------------------------------------

/** F's geometric error, m; the pack's façade `error` literal, so the two cannot drift. */
export const FACADE_ERROR: NonNullable<PackBuilding['facade']>['error'] = 0.06;
/** Step down only once the coarser level's error is ≤ τ / 1.3. */
export const STEP_DOWN_RATIO = 1.3;
/** A shown level is kept at least this long after a switch, ms. */
export const DWELL_MS = 400;

/** Vertical FOV per camera mode, degrees (§7.4): 45° from above, 60° on foot or in flight. */
export const ESTATE_VFOV_DEG: Readonly<Record<EstateViewMode, number>> = Object.freeze({
  overview: 45, plan: 45, walk: 60, fly: 60,
});

/**
 * The vertical FOV detail selection reads for a mode: the viewer's first-person
 * lens (lib/estate/settings.ts fovDeg) in Walk and Fly, ESTATE_VFOV_DEG
 * elsewhere. The nominal lens, not camera.fov, so a mode switch's 0.25 s lens
 * tween and Overview's poster lens leave the levels where they were.
 */
export const modeVfov = (mode: EstateViewMode, firstPersonDeg: number = ESTATE_VFOV_DEG.walk): number =>
  mode === 'walk' || mode === 'fly' ? firstPersonDeg : ESTATE_VFOV_DEG[mode];

/** K = buffer height / (2 tan(vfov/2)), px. Height in drawing-buffer pixels; vfov in degrees, as three's camera.fov. */
export const sseScale = (bufferHeightPx: number, vfovDeg: number): number =>
  bufferHeightPx / (2 * Math.tan((vfovDeg * Math.PI) / 360));

/**
 * SSE = e·K / max(d, 1), px. A NaN distance reads as infinitely far (error 0),
 * so a bad pose never costs triangles; a negative one reads as 1 m.
 */
export const screenError = (errorM: number, distanceM: number, k: number): number => {
  const d = distanceM >= 1 ? distanceM : distanceM < 1 ? 1 : Infinity;
  return (errorM * k) / d;
};

/** Geometric error of a level, m. LOD_NONE answers as massing. parsePack guarantees e ≥ 0; NaN reads as 0. */
export const levelError = (level: number, massingErrorM: number): number =>
  level <= LOD_MASSING ? (massingErrorM > 0 ? massingErrorM : 0) : level === LOD_FACADE ? FACADE_ERROR : 0;

/**
 * One frame of the hysteresis: the level screen-space error asks for, given the
 * last answer. Up while the current level's error > τ, else down while the
 * coarser level's is ≤ τ/1.3. Never both in one frame: a step up from w − 1
 * means w − 1's error > τ > τ/1.3. A want outside 0–2 starts from massing.
 */
export const nextWant = (want: number, massingErrorM: number, distanceM: number, k: number, tauPx: number): LodLevel => {
  let w = want >= LOD_MASSING && want <= LOD_DETAIL ? want : LOD_MASSING;
  const start = w;
  while (w < LOD_DETAIL && screenError(levelError(w, massingErrorM), distanceM, k) > tauPx) w += 1;
  if (w === start) {
    const floor = tauPx / STEP_DOWN_RATIO;
    while (w > LOD_MASSING && screenError(levelError(w - 1, massingErrorM), distanceM, k) <= floor) w -= 1;
  }
  return w as LodLevel;
};

/**
 * The distance inside which a level of error e is refined: SSE > τ ⟺ d < e·K/τ.
 * 0 when even 1 m away the error is within τ (the max(d, 1) floor), i.e. never.
 */
export const refineDistance = (errorM: number, k: number, tauPx: number): number => {
  const d = (errorM * k) / tauPx;
  return d > 1 ? d : 0;
};

/**
 * The distance from which a level of error e is restored over its finer one:
 * SSE ≤ τ/1.3 ⟺ d ≥ 1.3·e·K/τ. 0 when that holds at every distance.
 */
export const coarsenDistance = (errorM: number, k: number, tauPx: number): number => {
  const d = (STEP_DOWN_RATIO * errorM * k) / tauPx;
  return d > 1 ? d : 0;
};

// ---- tiers (tiers.ts) ---------------------------------------------------------------------

/** The slice of a quality tier this module reads. τ in px; caps in triangles and draw calls per frame. */
export interface LodTier { id: EstateTier; tauPx: number; maxTris: number; maxDraws: number }

/** Each tier's slice of the one tier table, best first. */
export const LOD_TIERS: readonly LodTier[] = Object.freeze(ESTATE_TIERS.map((id): LodTier => {
  const t = ESTATE_TIER_TABLE[id];
  return Object.freeze({ id, tauPx: t.tauPx, maxTris: t.maxTris, maxDraws: t.maxDraws });
}));

export const lodTier = (id: EstateTier): LodTier => LOD_TIERS[ESTATE_TIERS.indexOf(id)];

// ---- per-frame selection -----------------------------------------------------------------

export interface LodBuildingInput {
  /** In the view frustum this frame. A hidden building costs nothing and keeps its level, capped by its ceiling and residency. */
  visible: boolean;
  /** Eye to the building's box, m (frames.pointBoxDistance; 0 inside it). */
  distance: number;
  /** The pack's sites[i].massing.error, m. */
  massingError: number;
  /** Uploaded files, RESIDENT_* bits. */
  resident: number;
  /** Triangles drawn when shown at massing, F, D, indexed by level. D's count includes F's. */
  tris: ArrayLike<number>;
  /** Draw calls likewise; F's include its edge lines when the tier draws them. */
  draws: ArrayLike<number>;
  /**
   * Selected, or the target of a fly-to or Enter, or the building the camera is
   * in. In lean mode only these leave massing; with F resident it never shows
   * as massing (its target is at least F, taken first, within the caps).
   */
  focus?: boolean;
  /** A ceiling: LOD_FACADE for the building the camera is inside (§7.5 holds its exterior at F). */
  maxLevel?: LodLevel;
}

export interface LodFrame {
  /** Monotonic ms (performance.now()); only differences matter. NaN disables the hold. */
  now: number;
  /** sseScale() for the drawing buffer and the camera's vfov. */
  k: number;
  tier: Pick<LodTier, 'tauPx' | 'maxTris' | 'maxDraws'>;
  /** Save-Data lean mode: massing everywhere but the focus building. */
  lean?: boolean;
  /** Spoken for before any building: the active interior, the site and the ground grid. */
  reserveTris?: number;
  reserveDraws?: number;
}

/**
 * Holds the per-building state the rules need across frames (want, shown level,
 * time of the last switch) and the per-frame scratch, all in typed arrays sized
 * once. select() allocates nothing: it overwrites these arrays and fields and
 * returns `this`, so a caller that keeps the result must copy it.
 *
 * Buildings are by position. The engine's selector holds the 14 sites, and
 * index i is ESTATE_SITE_IDS[i], the order parsePack returns pack.sites in;
 * the scheduler's buildingViews() reads these arrays by the same index.
 */
export class LodSelector {
  readonly count: number;
  /** Shown level per building after the last select(); LOD_NONE until something is resident. */
  readonly level: Int8Array;
  /** What screen-space error asks for, before ceilings, residency and budget. */
  readonly want: Int8Array;
  /** want under lean and maxLevel: what the scheduler should fetch toward. */
  readonly target: Int8Array;
  /** Screen-space error of the shown level, px (massing's while nothing is shown): P1 orders F by it. */
  readonly sse: Float64Array;
  /** ms of each building's last switch; -Infinity before the first (the first draw is not a switch). */
  readonly since: Float64Array;
  /** The last frame's totals, reserve included. */
  tris = 0;
  draws = 0;
  /** The reserve plus every visible building's coarsest resident level already break a cap. Upgrades never do. */
  overBudget = false;
  /**
   * The earliest `now` at which a hold that is keeping a visible building off
   * the level it would otherwise take runs out (since + DWELL_MS), or Infinity
   * when no such hold exists. A caller that renders only on change must draw a
   * frame then, or the step waits for the next input: nothing else moves.
   */
  holdUntil = Infinity;

  // Scratch for one select(): the level reached so far, the level this frame
  // climbs toward, whether that goal is a hold, and whether a step is pending.
  private readonly cur: Int8Array;
  private readonly goal: Int8Array;
  private readonly held: Uint8Array;
  private readonly firm: Int8Array;
  private readonly open: Uint8Array;

  constructor(count: number) {
    if (!Number.isInteger(count) || count < 0) throw new RangeError(`LodSelector: count must be a whole number, got ${count}`);
    this.count = count;
    this.level = new Int8Array(count);
    this.want = new Int8Array(count);
    this.target = new Int8Array(count);
    this.sse = new Float64Array(count);
    this.since = new Float64Array(count);
    this.cur = new Int8Array(count);
    this.goal = new Int8Array(count);
    this.held = new Uint8Array(count);
    this.firm = new Int8Array(count);
    this.open = new Uint8Array(count);
    this.reset();
  }

  /** Forget every building's history, e.g. after a context reset re-uploads everything. */
  reset(): void {
    this.level.fill(LOD_NONE);
    this.want.fill(LOD_MASSING);
    this.target.fill(LOD_MASSING);
    this.sse.fill(0);
    this.since.fill(-Infinity);
    this.tris = 0;
    this.draws = 0;
    this.overBudget = false;
    this.holdUntil = Infinity;
  }

  select(buildings: ArrayLike<LodBuildingInput>, frame: LodFrame): this {
    const n = this.count;
    if (buildings.length !== n) throw new RangeError(`LodSelector: expected ${n} buildings, got ${buildings.length}`);
    const { now, k, tier } = frame;
    const lean = frame.lean === true;
    let tris = frame.reserveTris ?? 0;
    let draws = frame.reserveDraws ?? 0;
    let holdUntil = Infinity;

    // Pass 1: wants, ceilings, hidden buildings, and the floor every visible
    // building starts from.
    for (let i = 0; i < n; i += 1) {
      const b = buildings[i];
      const want = nextWant(this.want[i], b.massingError, b.distance, k, tier.tauPx);
      this.want[i] = want;
      const ceiling = lean && b.focus !== true ? LOD_MASSING : (b.maxLevel ?? LOD_DETAIL);
      const firm = b.focus === true && ceiling >= LOD_FACADE && levelAvailable(LOD_FACADE, b.resident) ? LOD_FACADE : LOD_MASSING;
      const capped = want < ceiling ? want : ceiling;
      const target = capped > firm ? capped : firm;
      this.target[i] = target;
      this.firm[i] = firm;
      this.open[i] = 0;
      this.held[i] = 0;

      const shown = this.level[i];
      if (!b.visible) {
        // Not drawn, so no pop to hide and no hold to start: settle on the best
        // level still resident and under the ceiling, or nothing.
        let l = shown > ceiling ? ceiling : shown;
        while (l >= LOD_MASSING && !levelAvailable(l, b.resident)) l -= 1;
        this.cur[i] = l;
        continue;
      }

      let floor: number = LOD_MASSING;
      while (floor <= LOD_DETAIL && !levelAvailable(floor, b.resident)) floor += 1;
      if (floor > LOD_DETAIL) { this.cur[i] = LOD_NONE; continue; }
      this.cur[i] = floor;
      tris += b.tris[floor];
      draws += b.draws[floor];

      // A shown level that is still resident is ≥ the floor (the floor is the
      // coarsest resident level), so a hold only ever climbs.
      const holding = shown >= LOD_MASSING && now - this.since[i] < DWELL_MS && shown <= ceiling && levelAvailable(shown, b.resident);
      const fresh = target > floor ? target : floor;
      const goal = holding ? shown : fresh;
      if (holding && fresh !== shown && this.since[i] + DWELL_MS < holdUntil) holdUntil = this.since[i] + DWELL_MS;
      this.held[i] = holding ? 1 : 0;
      this.goal[i] = goal;
      this.open[i] = goal > floor ? 1 : 0;
    }
    this.overBudget = tris > tier.maxTris || draws > tier.maxDraws;

    // Pass 2: greedy upgrades. Each round picks the best pending step, takes it
    // if it fits, and otherwise closes that building: at most two steps and one
    // close per building, so ≤ 3n rounds of an n-long scan (14 buildings).
    for (;;) {
      let best = -1;
      let bestHeld = 0;
      let bestRatio = 0;
      let bestGain = 0;
      for (let i = 0; i < n; i += 1) {
        if (this.open[i] === 0) continue;
        const b = buildings[i];
        const from = this.cur[i];
        const to = from + 1;
        if (!levelAvailable(to, b.resident)) { this.open[i] = 0; continue; }
        const gain = screenError(levelError(from, b.massingError), b.distance, k)
          - screenError(levelError(to, b.massingError), b.distance, k);
        const added = b.tris[to] - b.tris[from];
        const ratio = added > 0 ? gain / added : Infinity;
        const isHeld = this.held[i] === 1 || from < this.firm[i] ? 1 : 0;
        // Holds (and the focus building's step to F) first, then error removed per triangle, then error removed, then index.
        if (best < 0 || isHeld > bestHeld || (isHeld === bestHeld && (ratio > bestRatio || (ratio === bestRatio && gain > bestGain)))) {
          best = i; bestHeld = isHeld; bestRatio = ratio; bestGain = gain;
        }
      }
      if (best < 0) break;
      const b = buildings[best];
      const from = this.cur[best];
      const to = from + 1;
      const nextTris = tris + b.tris[to] - b.tris[from];
      const nextDraws = draws + b.draws[to] - b.draws[from];
      if (nextTris <= tier.maxTris && nextDraws <= tier.maxDraws) {
        tris = nextTris;
        draws = nextDraws;
        this.cur[best] = to;
        if (to >= this.goal[best]) this.open[best] = 0;
      } else {
        this.open[best] = 0;
      }
    }

    // Pass 3: commit, starting a hold wherever a drawn building changed level.
    for (let i = 0; i < n; i += 1) {
      const b = buildings[i];
      const next = this.cur[i];
      const shown = this.level[i];
      if (next !== shown) {
        if (b.visible && shown !== LOD_NONE && next !== LOD_NONE) this.since[i] = now;
        this.level[i] = next;
      }
      this.sse[i] = screenError(levelError(next, b.massingError), b.distance, k);
    }
    this.tris = tris;
    this.draws = draws;
    this.holdUntil = holdUntil;
    return this;

  }
}
