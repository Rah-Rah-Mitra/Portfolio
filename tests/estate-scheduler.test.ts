import { describe, expect, it } from 'vitest';
import budgets from '../lib/estate/packBudgets.json';
import { ESTATE_SITE_IDS, type EstateSiteId } from '../lib/estate/ids';
import {
  LOD_DETAIL, LOD_FACADE, LOD_MASSING, LodSelector, RESIDENT_ALL, RESIDENT_DETAIL, RESIDENT_FACADE, RESIDENT_MASSING,
  type LodBuildingInput,
} from '../lib/estate/lod';
import {
  DETAIL_UNSEEN_MS, EstateScheduler, INTERIOR_EVICT_M, INTERIOR_PREFETCH_M, INTERIOR_UNSEEN_MS, MAX_IN_FLIGHT,
  MAX_RETRIES, RETRY_BASE_MS, UPLOADS_PER_FRAME, UPLOAD_BYTES_PER_FRAME, backoffMs, buildingViews,
  drawingBufferBytes, fetchPriority, planWants, streamCatalogue,
  type BuildingView, type FailOutcome, type PlanContext, type StreamClass, type StreamPackView, type StreamPriority,
  type StreamWant, type UploadPart, type UploadTicket,
} from '../lib/estate/scheduler';
import { ESTATE_TIERS, type EstateTier } from '../lib/estate/tiers';

// Plan §7.6 (streaming) and §7.7 (GPU memory). The scheduler decides and the
// engine executes, so every rule is exercised here by playing the engine:
// take what it says to fetch, report completions and failures, upload what it
// hands back one frame at a time, with time injected.

const MB = 1_000_000;

// A pack as the scheduler reads it: every class present, paths shaped like the
// real ones (class folder, id, 8 hex of the raw sha256).
const path = (dir: string, id: string, n: number, ext = 'glb.gz') => `${dir}/${id}.${n.toString(16).padStart(8, '0')}.${ext}`;
const PACK: StreamPackView = {
  stage0: ['s0/massing.0000aaaa.glb.gz', 's0/site.0000bbbb.glb.gz'],
  massing: { path: 's0/massing.0000aaaa.glb.gz' },
  site: { file: { path: 's0/site.0000bbbb.glb.gz' }, ground: { path: 'site/ground.0000cccc.bin.gz' } },
  sites: ESTATE_SITE_IDS.map((id, n) => ({
    id,
    facade: { path: path('f', id, n) },
    detail: { path: path('d', id, n) },
    interior: { path: path('i', id, n) },
    walk: { path: path('w', id, n, 'walk.gz') },
    nav: { path: path('nav', id, n, 'json') },
  })),
};
const CAT = streamCatalogue(PACK);
const [MASSING, SITE] = CAT.stage0;
const GROUND = CAT.ground as string;
const file = (site: EstateSiteId, klass: 'f' | 'd' | 'i' | 'w' | 'nav') => CAT.sites[site][klass] as string;

const context = (over: Partial<PlanContext> = {}): PlanContext => ({ focus: null, mode: 'overview', lean: false, frozen: false, ...over });
const view = (over: Partial<BuildingView> = {}): BuildingView => ({ visible: false, facadeError: 0, wantDetail: false, boxDistance: 500, ...over });
/** Views are by position (ESTATE_SITE_IDS order); a site left out has none. */
const views = (bySite: Partial<Record<EstateSiteId, BuildingView>> = {}): Array<BuildingView | undefined> =>
  ESTATE_SITE_IDS.map((id) => bySite[id]);
/** setViews with only distances, as eviction reads them. */
const distances = (bySite: Partial<Record<EstateSiteId, number>>) =>
  ESTATE_SITE_IDS.map((id) => (bySite[id] === undefined ? undefined : view({ boxDistance: bySite[id] })));
const want = (id: string, klass: StreamClass, site: EstateSiteId | null, priority: StreamPriority, rank = 0): StreamWant =>
  ({ id, klass, site, priority, rank });
const summary = (wants: readonly StreamWant[]) => wants.map((w) => `P${w.priority} ${w.id}`);
const last = <T>(list: readonly T[]): T => list[list.length - 1];

/** Plays the engine's network side: fetch everything offered, decode it into `parts`. */
const fetchAll = (s: EstateScheduler, now: number, parts: (id: string) => UploadPart[] = () => []) => {
  for (let guard = 0; guard < 100; guard += 1) {
    const ids = [...s.startDownloads(now)];
    if (ids.length === 0) return;
    for (const id of ids) s.complete(id, parts(id));
  }
  throw new Error('fetchAll did not settle');
};

/** Plays the render loop: one beginFrame and at most one upload per frame, until nothing is pending. */
const drain = (s: EstateScheduler, now: number, frames = 1000) => {
  const out: Array<Omit<UploadTicket, 'evict'> & { evict: string[] }> = [];
  for (let f = 0; f < frames; f += 1) {
    s.beginFrame();
    const ticket = s.takeUpload(now);
    if (ticket) out.push({ ...ticket, evict: ticket.evict.map((e) => e.id) });
    else if (!s.uploadsPending(now)) break;
  }
  return out;
};

// Deterministic choices: mulberry32.
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('limits', () => {
  it('holds the plan\'s numbers', () => {
    expect(MAX_IN_FLIGHT).toBe(4);
    expect(MAX_RETRIES).toBe(2);
    expect([backoffMs(1), backoffMs(2)]).toEqual([RETRY_BASE_MS, 2 * RETRY_BASE_MS]);
    expect(UPLOADS_PER_FRAME).toBe(1);
    expect(UPLOAD_BYTES_PER_FRAME).toBe(2 * MB);
    expect(INTERIOR_PREFETCH_M).toBe(40);
    expect([DETAIL_UNSEEN_MS, INTERIOR_UNSEEN_MS, INTERIOR_EVICT_M]).toEqual([15_000, 30_000, 150]);
  });

  it('budgets GPU memory by the tier table (tiers.ts): 128 / 80 / 48 / 32 MB', () => {
    const budget = (tier: EstateTier) => new EstateScheduler({ tier }).budgetBytes();
    expect(ESTATE_TIERS.map(budget)).toEqual([128 * MB, 80 * MB, 48 * MB, 32 * MB]);
    expect(ESTATE_TIERS.map(budget)).toEqual(budgets.tiers.map((t) => t.gpuBytes));
    expect(new EstateScheduler().currentTier).toBe('mid');
  });

  it('hints fetch priority high for P0 and low from P2', () => {
    expect(([0, 1, 2, 3, 4] as const).map(fetchPriority)).toEqual(['high', 'auto', 'low', 'low', 'low']);
  });
});

describe('drawing buffer (§7.7)', () => {
  it('counts w·h·(4 + 4)·samples, plus w·h·4 for the resolve when multisampled', () => {
    expect(drawingBufferBytes(1920, 1080, 4)).toBe(1920 * 1080 * 8 * 4 + 1920 * 1080 * 4);
    expect(drawingBufferBytes(1920, 1080, 1)).toBe(1920 * 1080 * 8);
    // gl.SAMPLES reads 0 without MSAA; the buffer is still there.
    expect(drawingBufferBytes(1920, 1080, 0)).toBe(1920 * 1080 * 8);
    expect(drawingBufferBytes(Number.NaN, 1080, 4)).toBe(0);
    expect(drawingBufferBytes(-5, 1080, 4)).toBe(0);
    // The top tier at its 2.0 Mpx cap with 4× MSAA spends 72 of its 128 MB on the buffer.
    expect(drawingBufferBytes(2000, 1000, 4)).toBe(72 * MB);
  });
});

describe('catalogue', () => {
  it('lists stage 0, the ground and every site\'s files from the pack', () => {
    expect(CAT.stage0).toEqual(['s0/massing.0000aaaa.glb.gz', 's0/site.0000bbbb.glb.gz']);
    expect(CAT.ground).toBe('site/ground.0000cccc.bin.gz');
    expect(Object.keys(CAT.sites)).toEqual([...ESTATE_SITE_IDS]);
    expect(CAT.sites.BLK_509).toEqual({
      f: 'f/BLK_509.00000008.glb.gz', d: 'd/BLK_509.00000008.glb.gz', i: 'i/BLK_509.00000008.glb.gz',
      w: 'w/BLK_509.00000008.walk.gz', nav: 'nav/BLK_509.00000008.json',
    });
  });

  it('reads a P4b pack (s0, f, d only) as nulls, and derives stage 0 when the pack omits it', () => {
    const p4b = streamCatalogue({
      massing: PACK.massing, site: { file: { path: SITE } },
      sites: PACK.sites.map(({ id, facade, detail }) => ({ id, facade, detail })),
    });
    expect(p4b.stage0).toEqual([MASSING, SITE]);
    expect(p4b.ground).toBeNull();
    expect(p4b.sites.NC_514).toEqual({ f: file('NC_514', 'f'), d: file('NC_514', 'd'), i: null, w: null, nav: null });
    // A site missing from the pack streams nothing.
    expect(streamCatalogue({ sites: [] }).sites.BLK_501).toEqual({ f: null, d: null, i: null, w: null, nav: null });
  });
});

describe('the want-set (§7.6 priorities)', () => {
  it('puts stage 0 and the focus building at P0, in the plan\'s order: interior, walk, nav, F, D', () => {
    const wants = planWants(CAT, [], context({ focus: 'BLK_509' }));
    const p0 = wants.filter((w) => w.priority === 0).sort((a, b) => b.rank - a.rank).map((w) => w.id);
    expect(p0).toEqual([MASSING, SITE, file('BLK_509', 'i'), file('BLK_509', 'w'), file('BLK_509', 'nav'), file('BLK_509', 'f'), file('BLK_509', 'd')]);
    // The scheduler starts them in that order, four at a time.
    const s = new EstateScheduler();
    s.setWants(wants);
    expect(s.startDownloads(0)).toEqual(p0.slice(0, 4));
  });

  it('ranks P1 (visible F) by largest error, then P2 D where wanted, P3 within 40 m, P4 the rest', () => {
    const wants = planWants(CAT, views({
      BLK_501: view({ visible: true, facadeError: 5, boxDistance: 300 }),
      BLK_502: view({ visible: true, facadeError: 50, boxDistance: 60, wantDetail: true }),
      BLK_503: view({ visible: true, facadeError: 20, boxDistance: 35, wantDetail: true }),
      BLK_504: view({ visible: false, boxDistance: 40 }),
      BLK_505: view({ visible: false, boxDistance: 41 }),
      BLK_506: view({ visible: false, boxDistance: 120 }),
    }), context());
    const of = (site: EstateSiteId) => summary(wants.filter((w) => w.site === site));
    expect(of('BLK_501')).toEqual([`P1 ${file('BLK_501', 'f')}`]);
    expect(of('BLK_502')).toEqual([`P1 ${file('BLK_502', 'f')}`, `P2 ${file('BLK_502', 'd')}`]);
    expect(of('BLK_503')).toEqual([
      `P1 ${file('BLK_503', 'f')}`, `P2 ${file('BLK_503', 'd')}`,
      `P3 ${file('BLK_503', 'i')}`, `P3 ${file('BLK_503', 'w')}`, `P3 ${file('BLK_503', 'nav')}`,
    ]);
    // Exactly 40 m is within; off screen, its F waits at P4.
    expect(of('BLK_504')).toEqual([
      `P4 ${file('BLK_504', 'f')}`, `P3 ${file('BLK_504', 'i')}`, `P3 ${file('BLK_504', 'w')}`, `P3 ${file('BLK_504', 'nav')}`,
    ]);
    expect(of('BLK_505')).toEqual([`P4 ${file('BLK_505', 'f')}`]);
    // No view at all: off screen and unbounded far.
    expect(of('NC_514')).toEqual([`P4 ${file('NC_514', 'f')}`]);
    // Ground only for Walk and Fly.
    expect(wants.some((w) => w.id === GROUND)).toBe(false);

    // Fetch order: stage 0, P1 by error, P2 nearest, P3 nearest, then P4 nearest.
    const s = new EstateScheduler();
    s.setWants(wants);
    const order: string[] = [];
    for (let guard = 0; guard < 30; guard += 1) {
      const ids = [...s.startDownloads(0)];
      if (!ids.length) break;
      order.push(...ids);
      ids.forEach((id) => s.complete(id));
    }
    expect(order.slice(0, 13)).toEqual([
      MASSING, SITE,
      file('BLK_502', 'f'), file('BLK_503', 'f'), file('BLK_501', 'f'),
      file('BLK_503', 'd'), file('BLK_502', 'd'),
      file('BLK_503', 'i'), file('BLK_503', 'w'), file('BLK_503', 'nav'),
      file('BLK_504', 'i'), file('BLK_504', 'w'), file('BLK_504', 'nav'),
    ]);
    expect(order.slice(13, 16)).toEqual([file('BLK_504', 'f'), file('BLK_505', 'f'), file('BLK_506', 'f')]);
    // An overview session ends holding stage 0 and ΣF, plus what it came near.
    expect(order).toHaveLength(2 + 14 + 2 + 6);
  });

  it('wants the ground at P0 only in Walk and Fly', () => {
    for (const mode of ['walk', 'fly'] as const) {
      const ground = planWants(CAT, [], context({ mode })).find((w) => w.id === GROUND);
      expect(ground).toMatchObject({ klass: 'ground', site: null, priority: 0 });
    }
    for (const mode of ['overview', 'plan'] as const) {
      expect(planWants(CAT, [], context({ mode })).some((w) => w.id === GROUND)).toBe(false);
    }
  });

  it('keeps only stage 0 and the focus building in lean mode (§7.4)', () => {
    const near = view({ visible: true, facadeError: 99, wantDetail: true, boxDistance: 5 });
    const all = ESTATE_SITE_IDS.map(() => near);
    expect(summary(planWants(CAT, all, context({ lean: true })))).toEqual([`P0 ${MASSING}`, `P0 ${SITE}`]);
    const entering = planWants(CAT, all, context({ lean: true, focus: 'MSCP_513', mode: 'walk' }));
    expect(new Set(entering.map((w) => w.site))).toEqual(new Set([null, 'MSCP_513']));
    expect(entering.every((w) => w.priority === 0)).toBe(true);
    expect(entering).toHaveLength(2 + 1 + 5);
  });

  it('keeps only P0 and P1 while frozen (§7.10)', () => {
    const frozen = planWants(CAT, views({
      BLK_501: view({ visible: true, facadeError: 3, wantDetail: true, boxDistance: 10 }),
      BLK_502: view({ visible: false, boxDistance: 20 }),
    }), context({ frozen: true, focus: 'BLK_509' }));
    expect(new Set(frozen.map((w) => w.priority))).toEqual(new Set([0, 1]));
    expect(summary(frozen.filter((w) => w.priority === 1))).toEqual([`P1 ${file('BLK_501', 'f')}`]);
  });

  it('reuses the caller\'s array and objects, so planning allocates nothing once warm', () => {
    const out: StreamWant[] = [];
    const first = planWants(CAT, [], context({ focus: 'BLK_501' }), out);
    const objects = [...first];
    const second = planWants(CAT, [], context({ focus: 'BLK_502' }), out);
    expect(second).toBe(out);
    expect(second.every((w, i) => w === objects[i])).toBe(true);
    expect(second.find((w) => w.priority === 0 && w.klass === 'i')?.site).toBe('BLK_502');
    planWants(CAT, [], context({ lean: true }), out);
    expect(out).toHaveLength(2);
  });
});

describe('downloads', () => {
  const blocks = ESTATE_SITE_IDS.slice(0, 10);
  const fs = blocks.map((site, i) => want(file(site, 'f'), 'f', site, 1, 100 - i));

  it('never has more than four in flight, and a finished one frees its slot', () => {
    const s = new EstateScheduler();
    s.setWants(fs);
    expect(s.startDownloads(0)).toEqual(fs.slice(0, 4).map((w) => w.id));
    expect(s.inFlight).toBe(4);
    expect(s.startDownloads(0)).toEqual([]);
    s.complete(fs[0].id);
    expect(s.startDownloads(0)).toEqual([fs[4].id]);
    s.fail(fs[1].id, 0, 500);
    expect(s.startDownloads(0)).toEqual([fs[5].id]);
    expect(s.inFlight).toBe(4);
  });

  it('breaks ties by first-wanted order', () => {
    const s = new EstateScheduler();
    const tied = blocks.slice(0, 3).map((site) => want(file(site, 'f'), 'f', site, 4, -Infinity));
    s.setWants([tied[2], tied[0], tied[1]]);
    expect(s.startDownloads(0)).toEqual([tied[2].id, tied[0].id, tied[1].id]);
  });

  it('diffs the want-set: aborts what is in flight and no longer wanted, drops the queue silently', () => {
    const s = new EstateScheduler();
    s.setWants(fs);
    s.startDownloads(0);
    // Keep fs[0], fs[1] (one demoted), fs[6]; drop fs[2], fs[3] (in flight) and the rest (queued).
    const abort = s.setWants([fs[0], { ...fs[1], priority: 4 }, fs[6]]);
    expect([...abort]).toEqual([fs[2].id, fs[3].id]);
    expect(s.inFlight).toBe(2);
    expect(s.startDownloads(0)).toEqual([fs[6].id]);
    // The aborted fetches then reject: ignored, slots are not freed twice.
    expect(s.fail(fs[2].id, 0)).toBeNull();
    expect(s.inFlight).toBe(3);
    // Wanted again later, an aborted file starts over.
    s.setWants([fs[0], fs[1], fs[6], fs[2]]);
    expect(s.startDownloads(0)).toEqual([fs[2].id]);
  });

  it('keeps a late arrival from an aborted fetch and never asks for a done file again', () => {
    const s = new EstateScheduler();
    s.setWants(fs.slice(0, 2));
    s.startDownloads(0);
    s.setWants([fs[1]]);
    expect(s.complete(fs[0].id)).toBe(true);
    expect(s.complete(fs[0].id)).toBe(false);
    expect(s.isDone(fs[0].id)).toBe(true);
    s.setWants([fs[0], fs[0], { ...fs[0], priority: 0 }, fs[1]]);
    expect(s.startDownloads(0)).toEqual([]);
    expect(s.inFlight).toBe(1);
  });

  it('merges an id listed twice into its more urgent listing, priority and rank together', () => {
    const s = new EstateScheduler();
    s.setWants([...fs.slice(0, 4), { ...fs[9], priority: 4 }, { ...fs[9], priority: 1, rank: 1000 }]);
    expect(s.startDownloads(0)[0]).toBe(fs[9].id);
    // A less urgent listing lends nothing: P4 at rank 1e6 does not lift a P2 at rank 0 past a P2 at rank 1.
    const t = new EstateScheduler();
    const [a, b] = blocks.slice(0, 2).map((site) => want(file(site, 'd'), 'd', site, 2));
    t.setWants([{ ...a, rank: 1 }, b, { ...b, priority: 4, rank: 1e6 }]);
    expect(t.startDownloads(0)).toEqual([a.id, b.id]);
  });

  it('cancels P2 and lower in flight when the window freezes, keeping P0 and P1', () => {
    const near = views({ BLK_501: view({ visible: true, facadeError: 4, wantDetail: true, boxDistance: 10 }) });
    const out: StreamWant[] = [];
    const s = new EstateScheduler();
    s.setWants(planWants(CAT, near, context(), out));
    expect(s.startDownloads(0)).toEqual([MASSING, SITE, file('BLK_501', 'f'), file('BLK_501', 'd')]);
    s.complete(MASSING);
    s.complete(SITE);
    expect(s.startDownloads(0)).toEqual([file('BLK_501', 'i'), file('BLK_501', 'w')]);
    const abort = s.setWants(planWants(CAT, near, context({ frozen: true }), out));
    expect([...abort]).toEqual([file('BLK_501', 'd'), file('BLK_501', 'i'), file('BLK_501', 'w')]);
    expect(s.inFlight).toBe(1);
    expect(s.startDownloads(0)).toEqual([]);
  });

  it('holds the four-slot limit through any sequence of wants, completions, failures and aborts', () => {
    const r = rng(42);
    const pool = ESTATE_SITE_IDS.flatMap((site) => (['f', 'd', 'i', 'w', 'nav'] as const).map((klass) => ({ site, klass })));
    const s = new EstateScheduler();
    const flying = new Set<string>();
    let now = 0;
    for (let step = 0; step < 3000; step += 1) {
      now += Math.floor(r() * 400);
      const roll = r();
      if (roll < 0.15) {
        const wants = pool.filter(() => r() < 0.3).map(({ site, klass }) =>
          want(file(site, klass), klass, site, Math.floor(r() * 5) as StreamPriority, r()));
        for (const id of s.setWants(wants)) {
          expect(flying.delete(id)).toBe(true);
        }
      } else if (roll < 0.55) {
        for (const id of s.startDownloads(now)) {
          expect(flying.has(id)).toBe(false);
          flying.add(id);
        }
      } else if (flying.size > 0) {
        const id = [...flying][Math.floor(r() * flying.size)];
        flying.delete(id);
        if (roll < 0.8) s.complete(id);
        else s.fail(id, now, r() < 0.5 ? 503 : undefined);
      }
      expect(flying.size).toBeLessThanOrEqual(MAX_IN_FLIGHT);
      expect(s.inFlight).toBe(flying.size);
    }
  });

  it('returns reused arrays and one reused ticket, so the per-frame calls allocate nothing', () => {
    const s = new EstateScheduler();
    const first = s.setWants(fs);
    expect(s.setWants(fs)).toBe(first);
    const started = s.startDownloads(0);
    expect(s.startDownloads(0)).toBe(started);
    s.complete(fs[0].id, [{ bytes: 10 }, { bytes: 10 }]);
    s.beginFrame();
    const ticket = s.takeUpload(0);
    s.beginFrame();
    expect(s.takeUpload(0)).toBe(ticket);
    expect(s.evict(0)).toBe(s.evict(0));
  });

  it('rejects a want that changes a file\'s class or site, a bad priority, or a misplaced estate-wide file', () => {
    const s = new EstateScheduler();
    s.setWants([fs[0]]);
    expect(() => s.setWants([{ ...fs[0], klass: 'd' }])).toThrow(/was f/);
    expect(() => s.setWants([{ ...fs[1], priority: 5 as StreamPriority }])).toThrow(RangeError);
    expect(() => s.setWants([want(MASSING, 's0', 'BLK_501', 0)])).toThrow(/estate-wide/);
    expect(() => s.setWants([want('f/x.00000000.glb.gz', 'f', null, 1)])).toThrow(/belong to a site/);
  });
});

describe('retry with backoff, then the coarser level', () => {
  /** Offers `id`, fails it with `status`, and returns every outcome until it is permanent. */
  const failUntilPermanent = (s: EstateScheduler, id: string, status?: number) => {
    const outcomes: Array<FailOutcome | null> = [];
    let now = 0;
    for (let k = 0; k <= MAX_RETRIES; k += 1) {
      now = Math.max(now, s.nextRetryAt(now) === Infinity ? now : s.nextRetryAt(now));
      expect(s.startDownloads(now)).toContain(id);
      outcomes.push(s.fail(id, now, status));
    }
    return outcomes;
  };

  it('retries twice, 1 s then 2 s later, and never before', () => {
    const s = new EstateScheduler();
    const id = file('BLK_509', 'd');
    s.setWants([want(id, 'd', 'BLK_509', 2)]);
    expect(s.startDownloads(0)).toEqual([id]);
    expect(s.fail(id, 100, 503)).toEqual({ kind: 'retry', attempt: 1, at: 1100 });
    expect(s.inFlight).toBe(0);
    expect(s.nextRetryAt(100)).toBe(1100);
    expect(s.startDownloads(1099)).toEqual([]);
    expect(s.startDownloads(1100)).toEqual([id]);
    expect(s.fail(id, 1500)).toEqual({ kind: 'retry', attempt: 2, at: 3500 });
    expect(s.startDownloads(3499)).toEqual([]);
    expect(s.startDownloads(3500)).toEqual([id]);
    expect(s.fail(id, 3600, 500)).toEqual({ kind: 'fallback', level: LOD_FACADE, entryBlocked: false });
    expect(s.isFailed(id)).toBe(true);
    expect(s.nextRetryAt(3600)).toBe(Infinity);
    // Permanently failed: never offered again, whatever the want-set says.
    s.setWants([want(id, 'd', 'BLK_509', 0)]);
    expect(s.startDownloads(1e9)).toEqual([]);
  });

  it('lets a backed-off file wait without holding a slot', () => {
    const s = new EstateScheduler();
    const ids = ESTATE_SITE_IDS.slice(0, 5).map((site) => file(site, 'f'));
    s.setWants(ids.map((id, n) => want(id, 'f', ESTATE_SITE_IDS[n], 1, 10 - n)));
    s.startDownloads(0);
    s.fail(ids[0], 0, 503);
    // The best file is backing off; the next one takes its slot now.
    expect(s.startDownloads(0)).toEqual([ids[4]]);
  });

  it('falls back per class: D → F, F → massing (and its D is no longer fetched), interior/walk/nav block Enter', () => {
    const s = new EstateScheduler();
    const d = file('BLK_501', 'd');
    s.setWants([want(d, 'd', 'BLK_501', 2)]);
    expect(last(failUntilPermanent(s, d, 500))).toEqual({ kind: 'fallback', level: LOD_FACADE, entryBlocked: false });
    expect(s.levelCap('BLK_501')).toBe(LOD_FACADE);

    const f = file('BLK_502', 'f');
    const d2 = file('BLK_502', 'd');
    s.setWants([want(f, 'f', 'BLK_502', 1), want(d2, 'd', 'BLK_502', 2)]);
    expect(s.startDownloads(0)).toEqual([f, d2]);
    s.fail(f, 0); s.startDownloads(1000); s.fail(f, 1000); s.startDownloads(3000);
    expect(s.fail(f, 3000)).toEqual({ kind: 'fallback', level: LOD_MASSING, entryBlocked: false });
    expect(s.levelCap('BLK_502')).toBe(LOD_MASSING);
    // D draws on F: with F gone, the in-flight D is aborted at the next want-set.
    expect([...s.setWants([want(f, 'f', 'BLK_502', 1), want(d2, 'd', 'BLK_502', 2)])]).toEqual([d2]);
    expect(s.startDownloads(1e6)).toEqual([]);

    for (const klass of ['i', 'w', 'nav'] as const) {
      const site = klass === 'i' ? 'BLK_503' : klass === 'w' ? 'BLK_504' : 'BLK_505';
      const id = file(site, klass);
      s.setWants([want(id, klass, site, 3)]);
      expect(last(failUntilPermanent(s, id))).toEqual({ kind: 'fallback', level: LOD_DETAIL, entryBlocked: true });
      expect(s.entryBlocked(site)).toBe(true);
      // F stays whole: the building's level ceiling is untouched.
      expect(s.levelCap(site)).toBe(LOD_DETAIL);
    }
    expect(s.entryBlocked('BLK_509')).toBe(false);
  });

  it('reports stage 0 as fatal and the ground as a fallback with no level', () => {
    const s = new EstateScheduler();
    s.setWants([want(SITE, 's0', null, 0)]);
    expect(last(failUntilPermanent(s, SITE, 502))).toEqual({ kind: 'fatal' });
    s.setWants([want(GROUND, 'ground', null, 0)]);
    expect(last(failUntilPermanent(s, GROUND))).toEqual({ kind: 'fallback', level: null, entryBlocked: false });
  });

  it('treats every non-404 failure alike, and Retry (resetFailures) lifts the fallbacks', () => {
    const s = new EstateScheduler();
    const id = file('BLK_509', 'i');
    s.setWants([want(id, 'i', 'BLK_509', 0)]);
    expect(failUntilPermanent(s, id, 403).map((o) => o?.kind)).toEqual(['retry', 'retry', 'fallback']);
    expect(s.entryBlocked('BLK_509')).toBe(true);
    s.resetFailures();
    expect(s.entryBlocked('BLK_509')).toBe(false);
    expect(s.isFailed(id)).toBe(false);
    expect(s.startDownloads(0)).toEqual([id]);
  });
});

describe('one view per building, from lod.ts', () => {
  // The engine runs one LodSelector over the 14 sites in ESTATE_SITE_IDS order;
  // buildingViews turns its output into the views planWants and setViews read.
  const inputs = (): LodBuildingInput[] => ESTATE_SITE_IDS.map(() => ({
    visible: true, distance: 600, massingError: 2.3, resident: RESIDENT_ALL, tris: [600, 40_000, 120_000], draws: [1, 3, 33],
  }));

  it('defines facadeError, wantDetail and boxDistance from the selector, by position', () => {
    const b = inputs();
    const i509 = ESTATE_SITE_IDS.indexOf('BLK_509');
    const i510 = ESTATE_SITE_IDS.indexOf('BLK_510');
    b[i509].distance = 5; // near and visible: D wanted
    b[i510].distance = 5; // near but behind the camera: D asked for by error, not by sight
    b[i510].visible = false;
    const sel = new LodSelector(ESTATE_SITE_IDS.length).select(b, { now: 0, k: 606, tier: { tauPx: 2, maxTris: 1e9, maxDraws: 1e6 } });
    expect(sel.target[i509]).toBe(LOD_DETAIL);
    expect(sel.target[i510]).toBe(LOD_DETAIL);
    const out: BuildingView[] = [];
    const v = buildingViews(sel, b, out);
    expect(v).toBe(out);
    expect(v).toHaveLength(ESTATE_SITE_IDS.length);
    v.forEach((view, i) => {
      expect(view.facadeError).toBe(sel.sse[i]);
      expect(view.boxDistance).toBe(b[i].distance);
      expect(view.visible).toBe(b[i].visible);
    });
    expect(v[i509].wantDetail).toBe(true);
    expect(v[i510].wantDetail).toBe(false);
    // So D is wanted for the one in sight only: the other's stays evictable (§7.7 rule 1).
    const ds = planWants(CAT, v, context()).filter((w) => w.klass === 'd').map((w) => w.site);
    expect(ds).toEqual(['BLK_509']);
    // Reused objects on the next frame; a wrong count is refused.
    const objects = [...v];
    expect(buildingViews(sel, b, out).every((view, i) => view === objects[i])).toBe(true);
    expect(() => buildingViews(sel, b.slice(1), out)).toThrow(RangeError);
  });

  it('reports residency as lod.ts\' bits, with stage 0 ready even once its trees are evicted', () => {
    const s = new EstateScheduler({ tier: 'high' });
    const f = file('BLK_509', 'f'), d = file('BLK_509', 'd');
    expect(s.stage0Ready()).toBe(false);
    expect(s.residentMask('BLK_509')).toBe(0);
    s.setWants([want(MASSING, 's0', null, 0), want(SITE, 's0', null, 0), want(f, 'f', 'BLK_509', 1), want(d, 'd', 'BLK_509', 2)]);
    fetchAll(s, 0, (id) => (id === SITE ? [{ bytes: MB }, { bytes: MB, role: 'trees' }] : id === MASSING ? [{ bytes: MB, role: 'massing' }] : [{ bytes: MB }]));
    expect(s.residentMask('BLK_509')).toBe(0);
    s.beginFrame(); s.takeUpload(0); // massing
    expect(s.stage0Ready()).toBe(false);
    s.beginFrame(); s.takeUpload(0); // site ground: trees are not needed to draw
    expect(s.stage0Ready()).toBe(true);
    expect(s.isResident(SITE)).toBe(false);
    expect(s.residentMask('BLK_509')).toBe(RESIDENT_MASSING);
    s.beginFrame(); s.takeUpload(0); // site trees
    expect(s.isResident(SITE)).toBe(true);
    s.beginFrame(); s.takeUpload(0);
    expect(s.residentMask('BLK_509')).toBe(RESIDENT_MASSING | RESIDENT_FACADE);
    s.beginFrame(); s.takeUpload(0);
    expect(s.residentMask('BLK_509')).toBe(RESIDENT_ALL);
    expect(s.residentMask('BLK_510')).toBe(RESIDENT_MASSING);
    // Over budget, the trees go: the site file is no longer whole, stage 0 still draws.
    s.setTier('min');
    s.setDrawingBuffer(4000, 4000, 4);
    s.setWants([want(MASSING, 's0', null, 0), want(SITE, 's0', null, 0), want(f, 'f', 'BLK_509', 1)]);
    s.beginFrame(); s.beginFrame();
    expect(s.evict(1e9).map((e) => e.role)).toEqual(['d', 'trees']);
    expect(s.isResident(SITE)).toBe(false);
    expect(s.stage0Ready()).toBe(true);
    expect(s.residentMask('BLK_509') & RESIDENT_DETAIL).toBe(0);
    expect(s.residentMask('BLK_509')).toBe(RESIDENT_MASSING | RESIDENT_FACADE);
  });
});

describe('start tokens', () => {
  const id = file('BLK_509', 'i');
  const a = want(id, 'i', 'BLK_509', 3);

  it('ignores a superseded fetch\'s late callback once the file has restarted', () => {
    const s = new EstateScheduler();
    s.setWants([a]);
    expect(s.startDownloads(0)).toEqual([id]);
    const first = s.token(id);
    expect([...s.setWants([])]).toEqual([id]);
    s.setWants([a]);
    expect(s.startDownloads(100)).toEqual([id]);
    const second = s.token(id);
    expect(second).not.toBe(first);
    // The first fetch's decode, which an abort does not stop, fails late:
    // not booked against the restart, which keeps its slot.
    expect(s.fail(id, 120, 500, first)).toBeNull();
    expect(s.inFlight).toBe(1);
    expect(s.startDownloads(1200)).toEqual([]);
    // Nor is a late success.
    expect(s.complete(id, [], first)).toBe(false);
    expect(s.isDone(id)).toBe(false);
    // The live fetch reports as usual.
    expect(s.complete(id, [], second)).toBe(true);
    expect(s.inFlight).toBe(0);
  });

  it('keeps a late arrival of an aborted fetch that has not restarted, and a 404 from any fetch still goes stale', () => {
    const s = new EstateScheduler();
    s.setWants([a]);
    s.startDownloads(0);
    const token = s.token(id);
    s.setWants([]);
    expect(s.complete(id, [], token)).toBe(true);
    expect(s.isDone(id)).toBe(true);

    const t = new EstateScheduler();
    t.setWants([a]);
    t.startDownloads(0);
    const old = t.token(id);
    t.setWants([]);
    t.setWants([a]);
    t.startDownloads(10);
    expect(t.fail(id, 20, 404, old)?.kind).toBe('stale');
    expect(t.token('f/unknown.00000000.glb.gz')).toBe(0);
  });
});

describe('404 → stale', () => {
  it('goes stale on the first 404, with no retry, aborting everything else in flight', () => {
    const s = new EstateScheduler();
    const ids = ESTATE_SITE_IDS.slice(0, 6).map((site) => file(site, 'f'));
    s.setWants(ids.map((id, n) => want(id, 'f', ESTATE_SITE_IDS[n], 1, -n)));
    s.startDownloads(0);
    const outcome = s.fail(ids[2], 50, 404);
    expect(outcome).toEqual({ kind: 'stale', abort: [ids[0], ids[1], ids[3]] });
    expect(s.isStale).toBe(true);
    expect(s.inFlight).toBe(0);
    expect(s.startDownloads(1e9)).toEqual([]);
    expect(s.setWants([want(ids[5], 'f', ESTATE_SITE_IDS[5], 0)])).toEqual([]);
    expect(s.startDownloads(1e9)).toEqual([]);
  });

  it('goes stale on a 404 during a retry, or from a fetch already aborted', () => {
    const s = new EstateScheduler();
    const id = file('BLK_509', 'f');
    s.setWants([want(id, 'f', 'BLK_509', 1)]);
    s.startDownloads(0);
    expect(s.fail(id, 0, 503)?.kind).toBe('retry');
    s.startDownloads(1000);
    expect(s.fail(id, 1000, 404)?.kind).toBe('stale');

    const t = new EstateScheduler();
    t.setWants([want(id, 'f', 'BLK_509', 1)]);
    t.startDownloads(0);
    t.setWants([]);
    // A 404 proves the pack moved, whoever asked.
    expect(t.fail(id, 0, 404)?.kind).toBe('stale');
    expect(new EstateScheduler().fail('f/unknown.00000000.glb.gz', 0, 404)).toBeNull();
  });
});

describe('uploads: ≤ 1 geometry and ≤ 2 MB a frame', () => {
  const f = file('BLK_509', 'f');
  const d = file('BLK_509', 'd');
  const setup = (fParts: number[], dParts: number[], tier: EstateTier = 'high') => {
    const s = new EstateScheduler({ tier });
    s.setWants([want(f, 'f', 'BLK_509', 1), want(d, 'd', 'BLK_509', 2)]);
    fetchAll(s, 0, (id) => (id === f ? fParts : dParts).map((bytes) => ({ bytes })));
    return s;
  };

  it('hands out one geometry per frame, best want first, a file\'s parts in order', () => {
    const s = setup([300_000, 200_000], [100_000]);
    const got = drain(s, 0);
    expect(got.map((t) => [t.id, t.part, t.bytes, t.role])).toEqual([
      [f, 0, 300_000, 'f'], [f, 1, 200_000, 'f'], [d, 0, 100_000, 'd'],
    ]);
    expect(s.isResident(f) && s.isResident(d)).toBe(true);
    expect(s.geometryBytes).toBe(600_000);
    expect(s.uploadsPending(0)).toBe(false);
  });

  it('gives nothing more until the next beginFrame', () => {
    const s = setup([100, 100, 100], []);
    s.beginFrame();
    expect(s.takeUpload(0)).not.toBeNull();
    expect(s.takeUpload(0)).toBeNull();
    expect(s.uploadsPending(0)).toBe(true);
    s.beginFrame();
    expect(s.takeUpload(0)?.part).toBe(1);
  });

  it('lets an oversized geometry go on a full-credit frame and repays it on the frames after', () => {
    const s = setup([5 * MB], [1.5 * MB, 0.5 * MB]);
    const frames: Array<number | null> = [];
    for (let k = 0; k < 5; k += 1) {
      s.beginFrame();
      frames.push(s.takeUpload(0)?.bytes ?? null);
      // Debt keeps frames coming until the queue is empty.
      if (k < 3) expect(s.uploadsPending(0)).toBe(true);
    }
    // 5 MB on frame 1 leaves −3 MB; frame 2 is −1 MB (nothing); frame 3 has 1 MB, room for the 0.5 MB part only.
    expect(frames).toEqual([5 * MB, null, 0.5 * MB, 1.5 * MB, null]);
  });

  it('never averages over 2 MB a frame, whatever the sizes', () => {
    const r = rng(3);
    for (let trial = 0; trial < 40; trial += 1) {
      const sizes = Array.from({ length: 12 }, () => Math.floor(r() * (r() < 0.2 ? 6 : 2) * MB));
      const s = setup(sizes.slice(0, 6), sizes.slice(6));
      let total = 0;
      for (let k = 1; k <= 200; k += 1) {
        s.beginFrame();
        total += s.takeUpload(0)?.bytes ?? 0;
        expect(total).toBeLessThanOrEqual(UPLOAD_BYTES_PER_FRAME * k + Math.max(0, Math.max(...sizes) - UPLOAD_BYTES_PER_FRAME));
      }
      expect(s.isResident(f) && s.isResident(d)).toBe(true);
    }
  });

  it('uploads only what is wanted, and resumes when it is wanted again', () => {
    const s = setup([100, 100], [100]);
    s.beginFrame();
    expect(s.takeUpload(0)?.id).toBe(f);
    s.setWants([want(d, 'd', 'BLK_509', 2)]);
    expect(drain(s, 0).map((t) => t.id)).toEqual([d]);
    expect(s.isResident(f)).toBe(false);
    s.setWants([want(f, 'f', 'BLK_509', 1)]);
    expect(drain(s, 0).map((t) => [t.id, t.part])).toEqual([[f, 1]]);
  });

  it('checks parts against their class', () => {
    const s = new EstateScheduler();
    const w = file('BLK_509', 'w');
    s.setWants([want(w, 'w', 'BLK_509', 0), want(f, 'f', 'BLK_509', 1), want(SITE, 's0', null, 0)]);
    s.startDownloads(0);
    expect(() => s.complete(w, [{ bytes: 10 }])).toThrow(/cannot hold/);
    expect(() => s.complete(f, [{ bytes: 10, role: 'd' }])).toThrow(/cannot hold a d part/);
    expect(() => s.complete(f, [{ bytes: -1 }])).toThrow(RangeError);
    expect(s.complete(w)).toBe(true);
    expect(s.isResident(w)).toBe(true);
    expect(s.complete(SITE, [{ bytes: 10 }, { bytes: 5, role: 'trees' }, { bytes: 1, role: 'massing' }])).toBe(true);
    expect(drain(s, 0).map((t) => t.role)).toEqual(['site', 'trees', 'massing']);
  });
});

describe('GPU memory and eviction (§7.7)', () => {
  const T0 = 0;
  // A tier-'high' scene, then a drop to 'min' (32 MB) to force eviction.
  //   pinned: massing 2 MB, site 4 MB (+ trees 1 MB), F 2 × 7 MB
  //   D: A, B, C at 3 MB each   interiors: far 4 MB, near 4 MB, recent 4 MB
  const dA = file('BLK_501', 'd'), dB = file('BLK_502', 'd'), dC = file('BLK_503', 'd');
  const iFar = file('BLK_504', 'i'), iNear = file('BLK_505', 'i'), iRecent = file('BLK_506', 'i');
  const f1 = file('BLK_507', 'f'), f2 = file('BLK_508', 'f');
  const pinnedWants = [want(MASSING, 's0', null, 0), want(SITE, 's0', null, 0), want(f1, 'f', 'BLK_507', 1), want(f2, 'f', 'BLK_508', 1)];
  const allWants = [
    ...pinnedWants,
    want(dA, 'd', 'BLK_501', 2), want(dB, 'd', 'BLK_502', 2), want(dC, 'd', 'BLK_503', 2),
    want(iFar, 'i', 'BLK_504', 3), want(iNear, 'i', 'BLK_505', 3), want(iRecent, 'i', 'BLK_506', 3),
  ];
  const parts = (id: string): UploadPart[] => {
    if (id === MASSING) return [{ bytes: 2 * MB, role: 'massing' }];
    if (id === SITE) return [{ bytes: 2 * MB }, { bytes: 2 * MB }, { bytes: 1 * MB, role: 'trees' }];
    if (id === f1 || id === f2) return [{ bytes: 2 * MB }, { bytes: 2 * MB }, { bytes: 2 * MB }, { bytes: 1 * MB }];
    if (id.startsWith('i/')) return [{ bytes: 2 * MB }, { bytes: 2 * MB }];
    return [{ bytes: 2 * MB }, { bytes: 1 * MB }];
  };
  const PINNED_BYTES = 2 * MB + 4 * MB + 14 * MB;

  /** Everything resident at T0 under 'high', then only the pinned set still wanted. */
  const scene = () => {
    const s = new EstateScheduler({ tier: 'high' });
    s.setWants(allWants);
    fetchAll(s, T0, parts);
    drain(s, T0);
    expect(s.geometryBytes).toBe(PINNED_BYTES + 1 * MB + 9 * MB + 12 * MB);
    s.setWants(pinnedWants);
    s.setViews(distances({ BLK_504: 200, BLK_505: INTERIOR_EVICT_M, BLK_506: 300 }));
    // Frames at 20 s, 24 s, 25 s and 30 s draw A, B, the recent interior and C.
    const frame = (now: number, ids: string[]) => { s.beginFrame(); ids.forEach((id) => s.seen(id, now)); };
    frame(20_000, [dA]); frame(24_000, [dB]); frame(25_000, [iRecent]); frame(30_000, [dC]);
    // Two more frames that draw none of them, so nothing counts as on screen.
    frame(39_000, []); frame(40_000, []);
    return s;
  };

  it('counts geometry plus the drawing buffer against the tier\'s budget', () => {
    const s = new EstateScheduler({ tier: 'low' });
    expect(s.budgetBytes()).toBe(48 * MB);
    s.setDrawingBuffer(1000, 1000, 4);
    expect(s.bufferBytes).toBe(36 * MB);
    s.setWants([want(f1, 'f', 'BLK_507', 1)]);
    fetchAll(s, 0, parts);
    drain(s, 0);
    expect(s.usedBytes()).toBe(36 * MB + 7 * MB);
    s.setTier('min');
    expect(s.currentTier).toBe('min');
    expect(s.budgetBytes()).toBe(32 * MB);
  });

  it('evicts nothing while under budget', () => {
    const s = scene();
    expect(s.evict(40_000)).toEqual([]);
  });

  it('frees in §7.7\'s order — D unseen 15 s (oldest first), then far interiors unseen 30 s — and stops once under', () => {
    const s = scene();
    s.setTier('min'); // 42 MB in a 32 MB budget: 10 MB over.
    const freed = s.evict(40_000).map((e) => [e.id, e.role, e.bytes]);
    expect(freed).toEqual([[dA, 'd', 3 * MB], [dB, 'd', 3 * MB], [iFar, 'i', 4 * MB]]);
    expect(s.usedBytes()).toBe(32 * MB);
    expect(s.isResident(dA)).toBe(false);
    // Not eligible: C was seen 10 s ago, the near interior is at 150 m (not beyond), the recent one was seen 15 s ago.
    expect([dC, iNear, iRecent].every((id) => s.isResident(id))).toBe(true);
  });

  it('takes full-detail trees last, and never massing, F or the site', () => {
    const s = scene();
    s.setTier('min');
    s.setDrawingBuffer(4000, 4000, 4); // 576 MB of buffer: hopelessly over.
    const freed = s.evict(40_000).map((e) => [e.id, e.role]);
    expect(freed).toEqual([[dA, 'd'], [dB, 'd'], [iFar, 'i'], [SITE, 'trees']]);
    expect(s.geometryBytes).toBe(PINNED_BYTES + 3 * MB + 8 * MB);
    expect([MASSING, f1, f2].every((id) => s.isResident(id))).toBe(true);
    // The site file keeps its ground and structures; only the trees left.
    expect(s.isResident(SITE)).toBe(false);
    expect(s.evict(1e9).map((e) => e.id).sort()).toEqual([dC, iRecent].sort());
    expect(s.geometryBytes).toBe(PINNED_BYTES + 4 * MB);
    expect(s.evict(2e9)).toEqual([]);
  });

  it('keeps the rule thresholds exact: 15 s, 30 s and beyond 150 m', () => {
    const s = scene();
    s.setTier('min');
    s.setDrawingBuffer(4000, 4000, 4);
    // At 34.999 s A (seen at 20 s) is 14.999 s unseen; the far interior, unseen since its upload at 0, is eligible.
    expect(s.evict(34_999).map((e) => e.id)).toEqual([iFar, SITE]);
    expect(s.evict(35_000).map((e) => e.id)).toEqual([dA]);
    // At exactly 150 m an interior stays; just beyond, it goes.
    s.setViews(distances({ BLK_504: 200, BLK_505: INTERIOR_EVICT_M + 0.01, BLK_506: 300 }));
    expect(s.evict(35_000).map((e) => e.id)).toEqual([iNear]);
    expect(s.evict(38_999)).toEqual([]);
    expect(s.evict(39_000).map((e) => e.id)).toEqual([dB]);
    expect(s.evict(44_999)).toEqual([]);
    expect(s.evict(45_000).map((e) => e.id)).toEqual([dC]);
    expect(s.evict(54_999)).toEqual([]);
    expect(s.evict(55_000).map((e) => e.id)).toEqual([iRecent]);
  });

  it('never evicts what is on screen, even after a long rest with no frames', () => {
    const s = scene();
    s.beginFrame();
    s.seen(dA, 40_000);
    s.setTier('min');
    s.setDrawingBuffer(4000, 4000, 4);
    // Ten minutes at rest: no frame has run, so A is still what the last frame drew.
    expect(s.evict(640_000).map((e) => e.id)).not.toContain(dA);
  });

  it('never evicts a D or an interior the want-set still holds (the focus building\'s)', () => {
    const s = scene();
    s.setWants([...pinnedWants, want(dA, 'd', 'BLK_501', 0), want(iFar, 'i', 'BLK_504', 0)]);
    s.setTier('min');
    expect(s.evict(1e9).map((e) => e.id)).toEqual([dB, dC, iRecent]);
  });

  it('frees victims before an upload that would not fit, and lists them on the ticket', () => {
    const s = scene();
    s.setTier('min');
    s.evict(40_000);
    expect(s.usedBytes()).toBe(32 * MB);
    const dD = file('BLK_509', 'd');
    s.setWants([...pinnedWants, want(dD, 'd', 'BLK_509', 2)]);
    fetchAll(s, 40_000, () => [{ bytes: 1 * MB }]);
    s.beginFrame();
    s.seen(dC, 41_000); // C is on screen: not a victim
    const ticket = s.takeUpload(41_000);
    expect(ticket?.id).toBe(dD);
    // The interiors left are near or recent; the trees are the one victim, and exactly enough.
    expect(ticket?.evict.map((e) => [e.id, e.role, e.bytes])).toEqual([[SITE, 'trees', 1 * MB]]);
    expect(s.usedBytes()).toBe(32 * MB);
    // Nothing else could make room for a second one: it waits.
    const dE = file('BLK_510', 'd');
    s.setWants([...pinnedWants, want(dD, 'd', 'BLK_509', 2), want(dE, 'd', 'BLK_510', 2)]);
    fetchAll(s, 41_000, () => [{ bytes: 1 * MB }]);
    s.beginFrame();
    s.seen(dC, 41_000);
    expect(s.takeUpload(41_000)).toBeNull();
    expect(s.uploadsPending(41_000)).toBe(false);
  });

  it('defers a D or trees that cannot fit, but lets F, massing, site and the focus interior go over budget', () => {
    const s = new EstateScheduler({ tier: 'min' });
    s.setDrawingBuffer(2000, 2000, 1); // 32 MB: the whole budget
    const d = file('BLK_509', 'd'), i = file('BLK_509', 'i'), iOther = file('BLK_510', 'i'), f = file('BLK_509', 'f');
    s.setWants([
      want(d, 'd', 'BLK_509', 0), want(i, 'i', 'BLK_509', 0), want(iOther, 'i', 'BLK_510', 3),
      want(f, 'f', 'BLK_509', 1), want(SITE, 's0', null, 0),
    ]);
    fetchAll(s, 0, (id) => (id === SITE ? [{ bytes: MB, role: 'trees' }, { bytes: MB }] : [{ bytes: MB }]));
    const got = drain(s, 0).map((t) => `${t.id}#${t.part}`);
    expect(got.sort()).toEqual([`${SITE}#1`, `${f}#0`, `${i}#0`].sort());
    expect(s.usedBytes()).toBe(35 * MB);
    // The rest waits without keeping the frame loop awake.
    expect(s.uploadsPending(0)).toBe(false);
    expect(s.isResident(d)).toBe(false);
    // Room appears: they come in.
    s.setTier('high');
    expect(s.uploadsPending(0)).toBe(true);
    expect(drain(s, 0).map((t) => t.id).sort()).toEqual([SITE, d, iOther].sort());
  });

  it('does not thrash: evicted trees stay out while over budget, and come back once there is room', () => {
    const s = scene();
    s.setTier('min');
    s.setDrawingBuffer(4000, 4000, 4);
    expect(s.evict(40_000).map((e) => e.role)).toContain('trees');
    for (let k = 0; k < 50; k += 1) {
      s.beginFrame();
      expect(s.takeUpload(40_000 + k)).toBeNull();
      expect(s.evict(40_000 + k)).toEqual([]);
    }
    s.setDrawingBuffer(0, 0, 1);
    s.setTier('high');
    expect(drain(s, 50_000).map((t) => [t.id, t.role])).toEqual([[SITE, 'trees']]);
  });

  it('re-uploads an evicted file from its CPU copy when wanted again, with no download', () => {
    const s = scene();
    s.setTier('min');
    s.evict(40_000);
    s.setTier('high');
    s.setWants([...pinnedWants, want(dA, 'd', 'BLK_501', 2)]);
    expect(s.startDownloads(40_000)).toEqual([]);
    expect(drain(s, 40_000).map((t) => [t.id, t.part])).toEqual([[dA, 0], [dA, 1]]);
    // Fresh from upload, it is not a victim for another 15 s.
    s.setWants(pinnedWants);
    s.setTier('min');
    s.beginFrame(); s.beginFrame();
    expect(s.evict(40_000 + DETAIL_UNSEEN_MS - 1).map((e) => e.id)).not.toContain(dA);
  });

  it('after a context loss, re-uploads every wanted file from the CPU, pinned ones included, downloading nothing', () => {
    const s = scene();
    s.resetGpu();
    expect(s.geometryBytes).toBe(0);
    expect(s.startDownloads(40_000)).toEqual([]);
    const back = drain(s, 40_000);
    expect(new Set(back.map((t) => t.id))).toEqual(new Set([MASSING, SITE, f1, f2]));
    expect(s.geometryBytes).toBe(PINNED_BYTES + 1 * MB);
  });

  it('never frees a massing, site or F geometry under any pressure', () => {
    const r = rng(11);
    const s = new EstateScheduler({ tier: 'min' });
    const sites = ESTATE_SITE_IDS;
    const wants: StreamWant[] = [want(MASSING, 's0', null, 0), want(SITE, 's0', null, 0)];
    for (const site of sites) {
      wants.push(want(file(site, 'f'), 'f', site, 1), want(file(site, 'd'), 'd', site, 2), want(file(site, 'i'), 'i', site, 3));
    }
    s.setWants(wants);
    fetchAll(s, 0, (id) => {
      const n = 1 + Math.floor(r() * 3);
      const role = id === MASSING ? 'massing' : undefined;
      const list: UploadPart[] = Array.from({ length: n }, () => ({ bytes: Math.floor(r() * 1.5 * MB), role }));
      if (id === SITE) list.push({ bytes: 300_000, role: 'trees' });
      return list;
    });
    const pinned = [MASSING, ...sites.map((site) => file(site, 'f'))];
    const everResident = new Set<string>();
    let now = 0;
    for (let step = 0; step < 400; step += 1) {
      now += Math.floor(r() * 2000);
      s.beginFrame();
      s.setViews(sites.map(() => view({ boxDistance: r() * 400 })));
      for (const site of sites) {
        if (r() < 0.2) s.seen(file(site, 'd'), now);
        if (r() < 0.1) s.seen(file(site, 'i'), now);
      }
      if (r() < 0.1) s.setWants(wants.filter(() => r() < 0.7));
      if (r() < 0.2) s.setDrawingBuffer(Math.floor(r() * 3000), Math.floor(r() * 2000), r() < 0.5 ? 4 : 1);
      const ticket = s.takeUpload(now);
      const freed = [...(ticket?.evict ?? []), ...s.evict(now)];
      for (const e of freed) expect(['d', 'i', 'trees']).toContain(e.role);
      expect(s.geometryBytes).toBeGreaterThanOrEqual(0);
      for (const id of pinned) {
        if (s.isResident(id)) everResident.add(id);
        else expect(everResident.has(id)).toBe(false);
      }
    }
  });
});
