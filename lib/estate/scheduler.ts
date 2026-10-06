import { ESTATE_SITE_IDS, type EstateSiteId } from './ids';
import type { EstateViewMode } from './frames';
import {
  LOD_DETAIL, LOD_MASSING, RESIDENT_DETAIL, RESIDENT_FACADE, RESIDENT_MASSING, type LodLevel,
} from './lod';
import type { Klass } from './schema';
import { ESTATE_TIER_TABLE, type EstateTier } from './tiers';

// What the Estate engine downloads, uploads and frees, and in which order
// (plan §7.6, §7.7). Pure: it never fetches, decodes or touches the GPU. The
// engine (engine/streaming.ts) asks, executes, and reports back:
//
//   buildingViews(lod, buildings, views)  → one view per site, from lod.ts' selector
//   planWants(catalogue, views, context)  → the want-set, P0 … P4
//   scheduler.setWants(wants)             → ids to abort (in flight, no longer wanted)
//   scheduler.startDownloads(now)         → ids to fetch now (≤ 4 in flight); token(id) names each start
//   scheduler.complete(id, parts, token)  → fetched and decoded; parts = GPU bytes per geometry
//   scheduler.fail(id, now, status, token)→ retry later | coarser level | fatal | stale
//   per frame: beginFrame(), setViews(views), seen(id) for every file drawn,
//              then takeUpload(now)       → ≤ 1 geometry, ≤ 2 MB, victims to free first;
//              residentMask(site)         → lod.ts' `resident` input
//   evict(now)                            → frees by §7.7's order once over budget
//
// Per-building inputs are by position everywhere: index i is ESTATE_SITE_IDS[i],
// the order of LodSelector's arrays and of parsePack's pack.sites. Levels are
// lod.ts' LodLevel numbers (massing 0, F 1, D 2), residency its RESIDENT_* bits.
//
// Time is injected as `now` (ms, any monotonic clock). Ids are pack paths:
// unique and named by content hash, so a file is downloaded once per engine and
// its decoded copy kept on the CPU (§7.6) for re-uploads after an eviction or a
// context loss. Per-frame calls allocate nothing; the arrays and the ticket they
// return are reused, valid until the same method is called again.
//
// Bytes are decimal like packBudgets.json (2 MB = 2,000,000 B).

/** Classes the engine streams. Posters are plain <img> in the shell, never streamed. */
export type StreamClass = Exclude<Klass, 'poster'>;
/** 0 is most urgent (plan §7.6). */
export type StreamPriority = 0 | 1 | 2 | 3 | 4;
/** What a geometry is, for eviction. massing, site and f are never evicted. */
export type GpuRole = 'massing' | 'site' | 'trees' | 'f' | 'd' | 'i';
export type EvictableRole = 'd' | 'i' | 'trees';

export const MAX_IN_FLIGHT = 4;
/** Retries after the first failure; the third failure is permanent. */
export const MAX_RETRIES = 2;
/** Backoff before retry n is RETRY_BASE_MS · 2^(n−1): 1 s, then 2 s. */
export const RETRY_BASE_MS = 1000;
export const UPLOADS_PER_FRAME = 1;
export const UPLOAD_BYTES_PER_FRAME = 2_000_000;
/** Interiors, walk grids and nav files prefetch at P3 within this distance of a building's box (§7.5). */
export const INTERIOR_PREFETCH_M = 40;
export const DETAIL_UNSEEN_MS = 15_000;
export const INTERIOR_UNSEEN_MS = 30_000;
export const INTERIOR_EVICT_M = 150;

export const backoffMs = (attempt: number): number => RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);

/** fetch()'s priority hint: the engine's own order already holds within its four slots. */
export const fetchPriority = (priority: StreamPriority): 'high' | 'auto' | 'low' =>
  priority === 0 ? 'high' : priority === 1 ? 'auto' : 'low';

// ---- §7.7 drawing buffer (the pixel ratio and MSAA rules live in tiers.ts) -------------

/**
 * Bytes the drawing buffer holds: colour RGBA8 + depth 24/8 = 8 B per sample,
 * plus the single-sample resolve (4 B a pixel) when multisampled. `samples` is
 * gl.getParameter(gl.SAMPLES), which reads 0 without MSAA: still one sample.
 */
export const drawingBufferBytes = (width: number, height: number, samples: number): number => {
  const w = Number.isFinite(width) && width > 0 ? Math.floor(width) : 0;
  const h = Number.isFinite(height) && height > 0 ? Math.floor(height) : 0;
  const s = Number.isFinite(samples) && samples > 1 ? Math.floor(samples) : 1;
  return w * h * (4 + 4) * s + (s > 1 ? w * h * 4 : 0);
};

// ---- catalogue: the pack's streamable files --------------------------------------

export interface SiteFiles { f: string | null; d: string | null; i: string | null; w: string | null; nav: string | null }

export interface StreamCatalogue {
  /** Massing and the site layer: the first frame. */
  stage0: readonly string[];
  /** Outdoor ground heights, read by Walk and Fly. */
  ground: string | null;
  sites: Readonly<Record<EstateSiteId, Readonly<SiteFiles>>>;
}

interface PathRef { path: string }

/** The slice of EstatePack (lib/estate/schema.ts) this module reads; a parsed pack fits as is. */
export interface StreamPackView {
  stage0?: readonly string[];
  massing?: PathRef;
  site?: { file: PathRef; ground?: PathRef };
  sites: ReadonlyArray<{
    id: EstateSiteId;
    facade?: PathRef; detail?: PathRef; interior?: PathRef; walk?: PathRef; nav?: PathRef;
  }>;
}

/** Built once per pack. A class the pack did not emit (P4b ships no i/w/nav) is null throughout. */
export const streamCatalogue = (pack: StreamPackView): StreamCatalogue => {
  const byId = new Map(pack.sites.map((site) => [site.id, site]));
  const sites = Object.fromEntries(ESTATE_SITE_IDS.map((id) => {
    const site = byId.get(id);
    return [id, Object.freeze({
      f: site?.facade?.path ?? null,
      d: site?.detail?.path ?? null,
      i: site?.interior?.path ?? null,
      w: site?.walk?.path ?? null,
      nav: site?.nav?.path ?? null,
    })];
  })) as Record<EstateSiteId, SiteFiles>;
  const stage0 = pack.stage0 ?? [pack.massing?.path, pack.site?.file.path].filter((p): p is string => typeof p === 'string');
  return Object.freeze({
    stage0: Object.freeze([...stage0]),
    ground: pack.site?.ground?.path ?? null,
    sites: Object.freeze(sites),
  });
};

// ---- the want-set (§7.6 priorities, §7.4 lean, §7.5 prefetch, §7.10 frozen) ---------

export interface StreamWant {
  id: string;
  klass: StreamClass;
  /** null for estate-wide files (stage 0, ground). */
  site: EstateSiteId | null;
  priority: StreamPriority;
  /** Within a priority, larger goes first. */
  rank: number;
}

/**
 * One building as the last detail selection saw it: buildingViews() derives
 * all 14 from lod.ts' selector. By position, like LodSelector: index i is
 * ESTATE_SITE_IDS[i]. A missing view is off screen and unbounded far.
 */
export interface BuildingView {
  /** In the frustum: lod's input `visible`. */
  visible: boolean;
  /**
   * LodSelector.sse: the screen-space error of the level shown, px, which is
   * massing's while massing or nothing is shown. Orders P1, largest first; once
   * F is shown its file is done and the rank no longer matters.
   */
  facadeError: number;
  /** visible && LodSelector.target is D. A hidden building wants no D, so its D stays evictable (§7.7 rule 1). */
  wantDetail: boolean;
  /** Metres from the camera to the building's box: lod's input `distance` (frames.pointBoxDistance). */
  boxDistance: number;
}

/** The slices of a LodSelector and of its inputs that buildingViews reads. */
export interface LodView { readonly target: ArrayLike<number>; readonly sse: ArrayLike<number> }
export interface LodViewInput { readonly visible: boolean; readonly distance: number }

/**
 * The 14 views from this frame's detail selection, one definition for planWants
 * and setViews alike. Reuses `out` and its objects.
 */
export const buildingViews = (lod: LodView, buildings: ArrayLike<LodViewInput>, out: BuildingView[] = []): BuildingView[] => {
  const n = ESTATE_SITE_IDS.length;
  if (buildings.length !== n || lod.target.length !== n || lod.sse.length !== n) {
    throw new RangeError(`buildingViews: expected ${n} buildings, got ${buildings.length}`);
  }
  for (let i = 0; i < n; i += 1) {
    const b = buildings[i];
    const visible = b.visible === true;
    const view = out[i] ?? (out[i] = { visible: false, facadeError: 0, wantDetail: false, boxDistance: Infinity });
    view.visible = visible;
    view.facadeError = lod.sse[i];
    view.wantDetail = visible && lod.target[i] === LOD_DETAIL;
    view.boxDistance = Number.isNaN(b.distance) ? Infinity : b.distance;
  }
  out.length = n;
  return out;
};

export interface PlanContext {
  /** The current (inside or peeking) or targeted (Fly-to, Enter) building. */
  focus: EstateSiteId | null;
  mode: EstateViewMode;
  /** Save-Data consent (§7.4): stage 0 and the focus building only. */
  lean: boolean;
  /** Closed, hidden or off screen (§7.10): P2 and lower are cancelled. */
  frozen: boolean;
}

const NO_VIEW: BuildingView = Object.freeze({ visible: false, facadeError: 0, wantDetail: false, boxDistance: Infinity });

// P0 holds several kinds of file; these fixed ranks order them. Stage 0 first
// (nothing draws without it), then the ground under a walker, then the focus
// building in the plan's own order: interior, walk, nav, F, D.
const RANK_STAGE0 = 1000;
const RANK_GROUND = 900;
const RANK_FOCUS = { i: 500, w: 400, nav: 300, f: 200, d: 100 } as const;
const FOCUS_ORDER = ['i', 'w', 'nav', 'f', 'd'] as const;

const put = (out: StreamWant[], n: number, id: string, klass: StreamClass, site: EstateSiteId | null,
  priority: StreamPriority, rank: number): number => {
  const slot = out[n];
  if (slot) {
    slot.id = id; slot.klass = klass; slot.site = site; slot.priority = priority; slot.rank = rank;
  } else {
    out[n] = { id, klass, site, priority, rank };
  }
  return n + 1;
};

/**
 * The want-set for this moment. Reuses `out` and its objects, so pass the same
 * array every time; the scheduler copies what it keeps.
 *
 *  P0  stage 0; the focus building's interior, walk, nav, F and D; ground in Walk or Fly
 *  P1  F of visible buildings, largest error first
 *  P2  D where lod.ts wants it, nearest first
 *  P3  interior, walk and nav within 40 m of a building's box, nearest first
 *  P4  anything else: F of buildings off screen, nearest first (an overview
 *      session ends up holding ΣF, the plan's 2.1 MB visit)
 *
 * Interiors beyond 40 m, D not wanted, and the ground outside Walk and Fly are
 * not wanted at all. Lean keeps only P0; frozen keeps P0 and P1.
 */
export const planWants = (
  catalogue: StreamCatalogue,
  views: ArrayLike<BuildingView | undefined>,
  context: PlanContext,
  out: StreamWant[] = [],
): StreamWant[] => {
  const keep = context.lean ? 0 : context.frozen ? 1 : 4;
  let n = 0;
  for (let i = 0; i < catalogue.stage0.length; i += 1) n = put(out, n, catalogue.stage0[i], 's0', null, 0, RANK_STAGE0 - i);
  if (catalogue.ground !== null && (context.mode === 'walk' || context.mode === 'fly')) {
    n = put(out, n, catalogue.ground, 'ground', null, 0, RANK_GROUND);
  }
  for (let index = 0; index < ESTATE_SITE_IDS.length; index += 1) {
    const site = ESTATE_SITE_IDS[index];
    const files = catalogue.sites[site];
    if (site === context.focus) {
      for (const klass of FOCUS_ORDER) {
        const id = files[klass];
        if (id !== null) n = put(out, n, id, klass, site, 0, RANK_FOCUS[klass]);
      }
      continue;
    }
    const view = views[index] ?? NO_VIEW;
    const near = -view.boxDistance;
    if (files.f !== null) {
      if (view.visible && keep >= 1) n = put(out, n, files.f, 'f', site, 1, view.facadeError);
      else if (!view.visible && keep >= 4) n = put(out, n, files.f, 'f', site, 4, near);
    }
    if (files.d !== null && view.wantDetail && keep >= 2) n = put(out, n, files.d, 'd', site, 2, near);
    if (view.boxDistance <= INTERIOR_PREFETCH_M && keep >= 3) {
      if (files.i !== null) n = put(out, n, files.i, 'i', site, 3, near);
      if (files.w !== null) n = put(out, n, files.w, 'w', site, 3, near);
      if (files.nav !== null) n = put(out, n, files.nav, 'nav', site, 3, near);
    }
  }
  out.length = n;
  return out;
};

// ---- the scheduler -------------------------------------------------------------------

/** One decoded geometry: what its buffers (vertices, indices, instances) take on the GPU. */
export interface UploadPart {
  bytes: number;
  /** Defaults by class: s0 → site, f → f, d → d, i → i. Trees are the s0 site file's full-detail parts. */
  role?: GpuRole;
}

export interface Eviction { id: string; role: EvictableRole; bytes: number }

export interface UploadTicket {
  /** The file, and the index of the geometry as complete() listed it. */
  id: string;
  part: number;
  bytes: number;
  role: GpuRole;
  /** Free these first: dispose their GPU buffers, keep the CPU copies. */
  evict: readonly Eviction[];
}

export type FailOutcome =
  /** Will be offered again by startDownloads at `at`. */
  | { kind: 'retry'; attempt: number; at: number }
  /** Permanent. `level` is the building's new ceiling, a LodLevel (null: an estate-wide file); entryBlocked disables Enter, Plan and walk-in (§7.5). */
  | { kind: 'fallback'; level: LodLevel | null; entryBlocked: boolean }
  /** Stage 0 cannot be done without: phase `error`, Retry calls resetFailures(). */
  | { kind: 'fatal' }
  /** A 404 on a content-hashed file: the site was re-packed. Phase `stale`; abort these; nothing starts again. */
  | { kind: 'stale'; abort: readonly string[] };

type NetState = 'pending' | 'flight' | 'done' | 'failed';

interface Entry {
  id: string;
  klass: StreamClass;
  site: EstateSiteId | null;
  /** Index in ESTATE_SITE_IDS, or -1 for estate-wide files. */
  siteIndex: number;
  /** First-wanted order: the last tie-break, so equal wants keep a stable order. */
  seq: number;
  /** The setWants generation that last wanted it. */
  gen: number;
  priority: StreamPriority;
  rank: number;
  net: NetState;
  /** Failures so far. */
  attempts: number;
  /** Not before this time (ms); 0 when free to start. */
  retryAt: number;
  /** Names the latest start (0: never started); a callback carrying another is a superseded fetch's. */
  token: number;
  partBytes: number[];
  partRoles: GpuRole[];
  partUp: boolean[];
  gpuBytes: number;
  lastSeen: number;
  seenEpoch: number;
  /** pick()'s stamp: already tried in this call. */
  tried: number;
}

interface Victim { entry: Entry; role: EvictableRole; bytes: number; rule: number }

const ALLOWED_ROLES: Readonly<Record<StreamClass, readonly GpuRole[]>> = {
  s0: ['site', 'massing', 'trees'], f: ['f'], d: ['d'], i: ['i'], w: [], nav: [], ground: [],
};
// What eviction may take from a file of each class (one role each by ALLOWED_ROLES).
const EVICTABLE: Readonly<Record<StreamClass, EvictableRole | null>> = {
  s0: 'trees', f: null, d: 'd', i: 'i', w: null, nav: null, ground: null,
};
const PINNED: ReadonlySet<GpuRole> = new Set<GpuRole>(['massing', 'site', 'f']);
const SITE_INDEX: ReadonlyMap<string, number> = new Map(ESTATE_SITE_IDS.map((id, i) => [id, i]));

const better = (a: Entry, b: Entry): boolean =>
  a.priority !== b.priority ? a.priority < b.priority : a.rank !== b.rank ? a.rank > b.rank : a.seq < b.seq;
// §7.7's order: rule, then longest unseen, then the larger, then by id so ties are stable.
const byVictim = (a: Victim, b: Victim): number =>
  a.rule - b.rule || a.entry.lastSeen - b.entry.lastSeen || b.bytes - a.bytes || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0);

// Every part of a done file is up, but for a role `except` that may be away.
const entryUp = (entry: Entry, except: GpuRole | null): boolean => {
  if (entry.net !== 'done') return false;
  for (let k = 0; k < entry.partUp.length; k += 1) if (!entry.partUp[k] && entry.partRoles[k] !== except) return false;
  return true;
};

const isPriority = (p: unknown): p is StreamPriority => p === 0 || p === 1 || p === 2 || p === 3 || p === 4;

export class EstateScheduler {
  private readonly entries = new Map<string, Entry>();
  private readonly list: Entry[] = [];
  private gen = 0;
  private seq = 0;
  private flying = 0;
  private stale = false;
  private tokens = 0;
  // Per-site ceilings after permanent failures (LodLevel) and Enter blocks.
  private readonly cap = new Uint8Array(ESTATE_SITE_IDS.length).fill(LOD_DETAIL);
  private readonly blocked = new Uint8Array(ESTATE_SITE_IDS.length);
  private readonly distance = new Float64Array(ESTATE_SITE_IDS.length).fill(Infinity);
  // Each site's F and D entry, and the stage-0 entries, for residentMask and stage0Ready.
  private readonly fEntry: Array<Entry | null> = ESTATE_SITE_IDS.map(() => null);
  private readonly dEntry: Array<Entry | null> = ESTATE_SITE_IDS.map(() => null);
  private readonly stage0: Entry[] = [];
  private tier: EstateTier;
  private geometry = 0;
  private buffer = 0;
  private epoch = 0;
  private credit = UPLOAD_BYTES_PER_FRAME;
  private taken = 0;
  private pickStamp = 0;
  // Reused outputs and scratch.
  private readonly abortOut: string[] = [];
  private readonly startOut: string[] = [];
  private readonly evictOut: Eviction[] = [];
  private readonly ticketEvict: Eviction[] = [];
  private readonly ticket: UploadTicket = { id: '', part: 0, bytes: 0, role: 'site', evict: this.ticketEvict };
  private readonly victims: Victim[] = [];
  private readonly victimPool: Victim[] = [];

  constructor(options: { tier?: EstateTier } = {}) {
    this.tier = options.tier ?? 'mid';
  }

  // ---- downloads --------------------------------------------------------------

  /**
   * Replaces the want-set and returns the ids in flight that it no longer
   * holds, for the engine to abort. Wanted files not yet started simply leave
   * the queue; a priority change never aborts. Done and permanently failed
   * files are ignored, so the engine may pass the whole set every time.
   */
  setWants(wants: ArrayLike<StreamWant>): readonly string[] {
    const abort = this.abortOut;
    abort.length = 0;
    if (this.stale) return abort;
    this.gen += 1;
    for (let k = 0; k < wants.length; k += 1) {
      const want = wants[k];
      if (!isPriority(want.priority)) throw new RangeError(`scheduler: ${want.id} has priority ${String(want.priority)}`);
      const rank = Number.isNaN(want.rank) ? -Infinity : want.rank;
      let entry = this.entries.get(want.id);
      if (!entry) entry = this.create(want);
      else if (entry.klass !== want.klass || entry.site !== want.site) {
        throw new Error(`scheduler: ${want.id} was ${entry.klass}/${entry.site ?? 'estate'}, now ${want.klass}/${want.site ?? 'estate'}`);
      }
      // Listed twice: the more urgent listing wins, priority and rank together.
      if (entry.gen !== this.gen || want.priority < entry.priority || (want.priority === entry.priority && rank > entry.rank)) {
        entry.gen = this.gen;
        entry.priority = want.priority;
        entry.rank = rank;
      }
    }
    for (let li = 0; li < this.list.length; li += 1) {
      const entry = this.list[li];
      if (entry.net === 'flight' && !this.wanted(entry)) {
        entry.net = 'pending';
        this.flying -= 1;
        abort.push(entry.id);
      }
    }
    return abort;
  }

  /** Ids to fetch now, best first, filling the free slots of MAX_IN_FLIGHT. Nothing once stale. */
  startDownloads(now: number): readonly string[] {
    const start = this.startOut;
    start.length = 0;
    if (this.stale) return start;
    while (this.flying < MAX_IN_FLIGHT) {
      let best: Entry | null = null;
      for (let li = 0; li < this.list.length; li += 1) {
        const entry = this.list[li];
        if (entry.net === 'pending' && entry.retryAt <= now && this.wanted(entry) && (best === null || better(entry, best))) best = entry;
      }
      if (best === null) break;
      best.net = 'flight';
      best.token = (this.tokens += 1);
      this.flying += 1;
      start.push(best.id);
    }
    return start;
  }

  /**
   * The token of `id`'s latest start (0 if never started). The engine keeps it
   * with the fetch and hands it back to complete() and fail(): a want-set that
   * flaps (the 40 m prefetch edge, lod's D want) can abort a fetch and restart
   * the file before the first fetch's decode settles, and without the token
   * that late callback would be booked against the restart.
   */
  token(id: string): number { return this.entries.get(id)?.token ?? 0; }

  /**
   * A file arrived and decoded. `parts` are its geometries' GPU bytes, in the
   * order takeUpload will hand them back (none for walk, nav and ground, which
   * stay on the CPU). False when it was not outstanding (a duplicate report) or
   * `token` names a superseded start. A late arrival for an aborted fetch that
   * has not restarted is kept: the bytes are here.
   */
  complete(id: string, parts: ArrayLike<UploadPart> = [], token?: number): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.net === 'done' || entry.net === 'failed') return false;
    if (token !== undefined && token !== entry.token) return false;
    const allowed = ALLOWED_ROLES[entry.klass];
    const bytes: number[] = [];
    const roles: GpuRole[] = [];
    for (let k = 0; k < parts.length; k += 1) {
      const part = parts[k];
      const role = part.role ?? allowed[0];
      if (role === undefined || !allowed.includes(role)) {
        throw new Error(`scheduler: ${id} (${entry.klass}) cannot hold a ${part.role ?? 'GPU'} part`);
      }
      if (!Number.isFinite(part.bytes) || part.bytes < 0) throw new RangeError(`scheduler: ${id} part ${k} has ${part.bytes} bytes`);
      bytes.push(part.bytes);
      roles.push(role);
    }
    if (entry.net === 'flight') this.flying -= 1;
    entry.net = 'done';
    entry.partBytes = bytes;
    entry.partRoles = roles;
    entry.partUp = bytes.map(() => false);
    entry.gpuBytes = 0;
    return true;
  }

  /**
   * A fetch or decode failed; `status` is the HTTP status when there was one.
   * 404 on any file means the pack was replaced (names are content hashes):
   * stale, no retry, whichever fetch reports it. Otherwise retries with backoff,
   * then the permanent fallback. null when the id was not in flight (an aborted
   * fetch rejecting) or `token` names a superseded start.
   */
  fail(id: string, now: number, status?: number, token?: number): FailOutcome | null {
    const entry = this.entries.get(id);
    if (!entry) return null;
    if (status === 404) {
      // A fetch of this file has ended; if it was the live one its slot frees.
      // The abort list is everything else.
      if (entry.net === 'flight' && (token === undefined || token === entry.token)) { entry.net = 'pending'; this.flying -= 1; }
      return this.goStale();
    }
    if (entry.net !== 'flight' || (token !== undefined && token !== entry.token)) return null;
    this.flying -= 1;
    entry.attempts += 1;
    if (entry.attempts <= MAX_RETRIES) {
      entry.net = 'pending';
      entry.retryAt = now + backoffMs(entry.attempts);
      return { kind: 'retry', attempt: entry.attempts, at: entry.retryAt };
    }
    entry.net = 'failed';
    const site = entry.siteIndex;
    switch (entry.klass) {
      case 's0': return { kind: 'fatal' };
      case 'ground': return { kind: 'fallback', level: null, entryBlocked: false };
      case 'f': this.cap[site] = LOD_MASSING; break;
      case 'd': this.cap[site] = Math.min(this.cap[site], LOD_DETAIL - 1); break;
      default: this.blocked[site] = 1;
    }
    return { kind: 'fallback', level: this.cap[site] as LodLevel, entryBlocked: this.blocked[site] === 1 };
  }

  /** The Retry button: permanent failures become wantable again, ceilings and blocks lift. Stale stays stale. */
  resetFailures(): void {
    for (let li = 0; li < this.list.length; li += 1) {
      const entry = this.list[li];
      if (entry.net === 'failed') entry.net = 'pending';
      if (entry.net === 'pending') { entry.attempts = 0; entry.retryAt = 0; }
    }
    this.cap.fill(LOD_DETAIL);
    this.blocked.fill(0);
  }

  /** The earliest time a backed-off, wanted file may start; Infinity when none waits. For a timer, not polling. */
  nextRetryAt(now: number): number {
    let at = Infinity;
    for (let li = 0; li < this.list.length; li += 1) {
      const entry = this.list[li];
      if (entry.net === 'pending' && entry.retryAt > now && entry.retryAt < at && this.wanted(entry)) at = entry.retryAt;
    }
    return at;
  }

  get inFlight(): number { return this.flying; }
  get isStale(): boolean { return this.stale; }
  isDone(id: string): boolean { return this.entries.get(id)?.net === 'done'; }
  isFailed(id: string): boolean { return this.entries.get(id)?.net === 'failed'; }
  /** The finest level a building can reach after failures: D, or F once its D failed, or massing once its F failed. lod's `maxLevel`. */
  levelCap(site: EstateSiteId): LodLevel {
    const index = SITE_INDEX.get(site);
    return index === undefined ? LOD_DETAIL : this.cap[index] as LodLevel;
  }
  /** Its interior, walk or nav failed for good: Enter, Plan and walk-in are off (§7.5). */
  entryBlocked(site: EstateSiteId): boolean {
    const index = SITE_INDEX.get(site);
    return index !== undefined && this.blocked[index] === 1;
  }

  // ---- per frame: visibility, distance, uploads -------------------------------------

  /** Starts a frame: one upload slot, and the byte credit refilled (never banked past one frame's worth). */
  beginFrame(): void {
    this.epoch += 1;
    this.taken = 0;
    this.credit = Math.min(UPLOAD_BYTES_PER_FRAME, this.credit + UPLOAD_BYTES_PER_FRAME);
  }

  /** The engine drew this file's geometry this frame. Call before takeUpload and evict. */
  seen(id: string, now: number): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.lastSeen = now;
    entry.seenEpoch = this.epoch;
  }

  /**
   * This frame's views (buildingViews(), the array planWants read): eviction
   * reads each building's boxDistance. A missing view, or one never reported,
   * counts as far.
   */
  setViews(views: ArrayLike<Pick<BuildingView, 'boxDistance'> | undefined>): void {
    for (let i = 0; i < ESTATE_SITE_IDS.length; i += 1) {
      const metres = views[i]?.boxDistance;
      this.distance[i] = metres === undefined || Number.isNaN(metres) ? Infinity : metres;
    }
  }

  /**
   * The one geometry to upload this frame, or null. Only wanted files upload,
   * best want first, a file's parts in order (while the credit is short, a part
   * that fits it may go ahead of one that does not). At most UPLOADS_PER_FRAME per
   * beginFrame, and within the 2 MB credit: a part larger than the credit goes
   * only on a full-credit frame and the frames after it repay the excess, so
   * the rate never averages over 2 MB a frame and nothing starves. (Every pack
   * primitive is ≤ 65,535 vertices, so a geometry is ≤ ~1.6 MB and that path
   * is a guard.) A part that would overrun the GPU budget first takes §7.7's
   * victims; if they are not enough it waits, unless it is massing, site or F
   * (the floor every level falls back to) or the focus building's interior
   * (Enter needs it): those go over budget and eviction catches up.
   */
  takeUpload(now: number): UploadTicket | null {
    return this.pick(now, true);
  }

  /** Whether any wanted geometry could upload now or once the per-frame credit refills: keeps frames coming (§7.8). */
  uploadsPending(now: number): boolean {
    return this.pick(now, false) !== null;
  }

  /**
   * Every geometry of `id` is on the GPU. All or nothing per file: the site file
   * stops counting once its trees are evicted, though its ground still draws, so
   * ask stage0Ready() whether stage 0 is drawable.
   */
  isResident(id: string): boolean {
    const entry = this.entries.get(id);
    return entry !== undefined && entryUp(entry, null);
  }

  /** Every stage-0 file is decoded and uploaded, trees aside (they come and go): the first frame can draw. */
  stage0Ready(): boolean {
    const list = this.stage0;
    if (list.length === 0) return false;
    for (let i = 0; i < list.length; i += 1) if (!entryUp(list[i], 'trees')) return false;
    return true;
  }

  /**
   * lod.ts' `resident` input for a building: RESIDENT_MASSING once stage 0 is
   * ready (the massing meshes live there), plus its F and D files' bits.
   */
  residentMask(site: EstateSiteId): number {
    const index = SITE_INDEX.get(site);
    if (index === undefined) return 0;
    let mask = this.stage0Ready() ? RESIDENT_MASSING : 0;
    const f = this.fEntry[index];
    if (f !== null && entryUp(f, null)) mask |= RESIDENT_FACADE;
    const d = this.dEntry[index];
    if (d !== null && entryUp(d, null)) mask |= RESIDENT_DETAIL;
    return mask;
  }

  // ---- GPU memory (§7.7) ----------------------------------------------------------

  setTier(tier: EstateTier): void { this.tier = tier; }
  get currentTier(): EstateTier { return this.tier; }

  setDrawingBuffer(width: number, height: number, samples: number): void {
    this.buffer = drawingBufferBytes(width, height, samples);
  }

  get geometryBytes(): number { return this.geometry; }
  get bufferBytes(): number { return this.buffer; }
  usedBytes(): number { return this.geometry + this.buffer; }
  budgetBytes(): number { return ESTATE_TIER_TABLE[this.tier].gpuBytes; }

  /**
   * Once over budget, frees in §7.7's order until back under or out of victims:
   *  1. D not seen for 15 s;
   *  2. interiors over 150 m away and not seen for 30 s;
   *  3. full-detail trees (they fall back to crowns).
   * Massing, F and the site are never taken; nor are a D or an interior the
   * want-set still holds (the focus building's, or one lod.ts still asks for),
   * which would only come straight back. Within a rule: longest unseen first.
   */
  evict(now: number): readonly Eviction[] {
    const out = this.evictOut;
    out.length = 0;
    let over = this.usedBytes() - this.budgetBytes();
    if (over <= 0) return out;
    const count = this.collectVictims(now);
    for (let k = 0; k < count && over > 0; k += 1) over -= this.apply(this.victims[k], out);
    return out;
  }

  /** The context was lost: nothing is on the GPU. Wanted files re-upload from their CPU copies; nothing re-downloads. */
  resetGpu(): void {
    for (let li = 0; li < this.list.length; li += 1) {
      const entry = this.list[li];
      entry.partUp.fill(false);
      entry.gpuBytes = 0;
    }
    this.geometry = 0;
  }

  // ---- internals ------------------------------------------------------------------

  private create(want: StreamWant): Entry {
    const siteIndex = want.site === null ? -1 : SITE_INDEX.get(want.site);
    if (siteIndex === undefined) throw new Error(`scheduler: ${want.id} names unknown site ${String(want.site)}`);
    if (!(want.klass in ALLOWED_ROLES)) throw new Error(`scheduler: ${want.id} has unknown class ${String(want.klass)}`);
    if ((want.site === null) !== (want.klass === 's0' || want.klass === 'ground')) {
      throw new Error(`scheduler: ${want.id}: ${want.klass} files ${want.site === null ? 'belong to a site' : 'are estate-wide'}`);
    }
    const entry: Entry = {
      id: want.id, klass: want.klass, site: want.site, siteIndex, seq: this.seq += 1,
      gen: 0, priority: want.priority, rank: 0,
      net: 'pending', attempts: 0, retryAt: 0, token: 0,
      partBytes: [], partRoles: [], partUp: [], gpuBytes: 0, lastSeen: -Infinity, seenEpoch: -2, tried: 0,
    };
    this.entries.set(want.id, entry);
    this.list.push(entry);
    if (entry.klass === 's0') this.stage0.push(entry);
    else if (entry.klass === 'f') this.fEntry[siteIndex] = entry;
    else if (entry.klass === 'd') this.dEntry[siteIndex] = entry;
    return entry;
  }

  // In the current want-set, not failed, and not a D above its building's ceiling.
  private wanted(entry: Entry): boolean {
    return entry.gen === this.gen && entry.net !== 'failed' && !(entry.klass === 'd' && this.cap[entry.siteIndex] < LOD_DETAIL);
  }

  private goStale(): FailOutcome {
    this.stale = true;
    const abort: string[] = [];
    for (let li = 0; li < this.list.length; li += 1) {
      const entry = this.list[li];
      if (entry.net === 'flight') { entry.net = 'pending'; abort.push(entry.id); }
    }
    this.flying = 0;
    return { kind: 'stale', abort };
  }

  // Drawn in this frame or the last one counts as on screen now: the view is
  // unchanged at rest (no frames), and the grace frame covers a caller that
  // asks before this frame's seen() calls.
  private unseenFor(entry: Entry, now: number): number {
    return entry.seenEpoch >= this.epoch - 1 ? 0 : now - entry.lastSeen;
  }

  private collectVictims(now: number): number {
    let count = 0;
    for (let li = 0; li < this.list.length; li += 1) {
      const entry = this.list[li];
      if (entry.gpuBytes === 0) continue;
      const role = EVICTABLE[entry.klass];
      if (role === null) continue;
      let rule = 0;
      if (role === 'trees') rule = 3;
      else if (this.wanted(entry)) continue;
      else if (role === 'd') rule = this.unseenFor(entry, now) >= DETAIL_UNSEEN_MS ? 1 : 0;
      else rule = this.distance[entry.siteIndex] > INTERIOR_EVICT_M && this.unseenFor(entry, now) >= INTERIOR_UNSEEN_MS ? 2 : 0;
      if (rule === 0) continue;
      let bytes = 0;
      for (let k = 0; k < entry.partUp.length; k += 1) if (entry.partUp[k] && entry.partRoles[k] === role) bytes += entry.partBytes[k];
      if (bytes === 0) continue;
      let victim = this.victimPool[count];
      if (!victim) { victim = { entry, role, bytes, rule }; this.victimPool[count] = victim; }
      victim.entry = entry; victim.role = role; victim.bytes = bytes; victim.rule = rule;
      this.victims[count] = victim;
      count += 1;
    }
    this.victims.length = count;
    // Insertion sort in place: a few dozen victims at most, and Array.sort
    // would copy into a work array on a path that runs every frame over budget.
    const victims = this.victims;
    for (let i = 1; i < count; i += 1) {
      const v = victims[i];
      let j = i - 1;
      while (j >= 0 && byVictim(victims[j], v) > 0) { victims[j + 1] = victims[j]; j -= 1; }
      victims[j + 1] = v;
    }
    return count;
  }

  private apply(victim: Victim, out: Eviction[]): number {
    const { entry, role } = victim;
    let freed = 0;
    for (let k = 0; k < entry.partUp.length; k += 1) {
      if (entry.partUp[k] && entry.partRoles[k] === role) { entry.partUp[k] = false; freed += entry.partBytes[k]; }
    }
    entry.gpuBytes -= freed;
    this.geometry -= freed;
    out.push({ id: entry.id, role, bytes: freed });
    return freed;
  }

  // Best want first by repeated selection rather than a sort, which would copy
  // the list every frame; a file with nothing admissible is stamped and skipped.
  private pick(now: number, commit: boolean): UploadTicket | null {
    if (commit && this.taken >= UPLOADS_PER_FRAME) return null;
    const stamp = (this.pickStamp += 1);
    const budget = this.budgetBytes();
    let victimCount = -1;
    for (;;) {
      let entry: Entry | null = null;
      for (let li = 0; li < this.list.length; li += 1) {
        const e = this.list[li];
        if (e.tried !== stamp && e.net === 'done' && e.partUp.includes(false) && this.wanted(e) && (entry === null || better(e, entry))) entry = e;
      }
      if (entry === null) return null;
      entry.tried = stamp;
      for (let k = 0; k < entry.partUp.length; k += 1) {
        if (entry.partUp[k]) continue;
        const bytes = entry.partBytes[k];
        // Credit gates this frame only; uploadsPending asks whether frames should keep coming.
        if (commit && bytes > this.credit && this.credit < UPLOAD_BYTES_PER_FRAME) continue;
        const role = entry.partRoles[k];
        let over = this.usedBytes() + bytes - budget;
        let take = 0;
        if (over > 0) {
          if (victimCount < 0) victimCount = this.collectVictims(now);
          for (; take < victimCount && over > 0; take += 1) {
            if (this.victims[take].entry !== entry) over -= this.victims[take].bytes;
          }
          if (over > 0 && !(PINNED.has(role) || (role === 'i' && entry.priority === 0))) continue;
        }
        if (!commit) return this.ticket;
        this.ticketEvict.length = 0;
        for (let v = 0; v < take; v += 1) if (this.victims[v].entry !== entry) this.apply(this.victims[v], this.ticketEvict);
        entry.partUp[k] = true;
        entry.gpuBytes += bytes;
        this.geometry += bytes;
        entry.lastSeen = now;
        this.credit -= bytes;
        this.taken += 1;
        const ticket = this.ticket;
        ticket.id = entry.id; ticket.part = k; ticket.bytes = bytes; ticket.role = role;
        return ticket;
      }
    }
  }
}
