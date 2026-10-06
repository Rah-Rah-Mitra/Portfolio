import { describe, expect, it } from 'vitest';
import budgets from '../lib/estate/packBudgets.json';
import {
  DWELL_MS, ESTATE_VFOV_DEG, FACADE_ERROR, LOD_DETAIL, LOD_FACADE, LOD_MASSING, LOD_NONE, LOD_TIERS, LodSelector,
  RESIDENT_ALL, RESIDENT_DETAIL, RESIDENT_FACADE, RESIDENT_MASSING, STEP_DOWN_RATIO, coarsenDistance, levelAvailable,
  levelError, lodTier, nextWant, refineDistance, screenError, sseScale, type LodBuildingInput, type LodFrame, type LodTier,
} from '../lib/estate/lod';

// Plan §7.4. The table's worked distances are at K = 606 (a 700 px buffer at
// Walk's 60°, or 502 px at 45°). Its "Massing→F (slab)" column implies a slab
// block's massing error of 697 m · 2 px / 606 = 2.300 m; real values come from
// the pack's per-site `massing.error`.

const K = 606;
const SLAB_E = 2.3;
const HIGH = lodTier('high');

const TABLE: Record<string, { refineFD: number; coarsenDF: number; refineMF: number }> = {
  high: { refineFD: 18.2, coarsenDF: 23.6, refineMF: 697 },
  mid: { refineFD: 12.1, coarsenDF: 15.8, refineMF: 465 },
  low: { refineFD: 8.1, coarsenDF: 10.5, refineMF: 310 },
  min: { refineFD: 6.1, coarsenDF: 7.9, refineMF: 232 },
};

// A typical building's costs: massing box, F, F + D (D is drawn over F).
const bldg = (over: Partial<LodBuildingInput> = {}): LodBuildingInput => ({
  visible: true, distance: 100, massingError: SLAB_E, resident: RESIDENT_ALL,
  tris: [600, 40_000, 120_000], draws: [1, 3, 33], ...over,
});
const roomy: LodFrame['tier'] = { tauPx: 2, maxTris: 1e9, maxDraws: 1e6 };
const frame = (now: number, over: Partial<LodFrame> = {}): LodFrame => ({ now, k: K, tier: roomy, ...over });

// Deterministic draws: mulberry32.
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('screen-space error', () => {
  it('gets K = 606 from the buffers the plan worked in', () => {
    expect(sseScale(700, ESTATE_VFOV_DEG.walk)).toBeCloseTo(606, 0);
    expect(sseScale(502, ESTATE_VFOV_DEG.overview)).toBeCloseTo(606, 0);
    // K is half the buffer height over tan(vfov/2): at 90° it is exactly half.
    expect(sseScale(1000, 90)).toBeCloseTo(500, 12);
    expect(ESTATE_VFOV_DEG).toEqual({ overview: 45, plan: 45, walk: 60, fly: 60 });
  });

  it('is e·K / max(d, 1), and a bad distance never costs triangles', () => {
    expect(screenError(0.06, 10, K)).toBeCloseTo(3.636, 12);
    expect(screenError(0.06, 0.5, K)).toBe(screenError(0.06, 1, K));
    expect(screenError(0.06, 0, K)).toBeCloseTo(36.36, 12);
    expect(screenError(0.06, -5, K)).toBe(screenError(0.06, 1, K));
    expect(screenError(0.06, Number.NaN, K)).toBe(0);
    expect(screenError(0.06, Infinity, K)).toBe(0);
  });

  it('gives each level its geometric error: massing as measured, F 0.06 m, D 0', () => {
    expect(FACADE_ERROR).toBe(0.06);
    expect([LOD_MASSING, LOD_FACADE, LOD_DETAIL].map((l) => levelError(l, SLAB_E))).toEqual([SLAB_E, 0.06, 0]);
    expect(levelError(LOD_NONE, SLAB_E)).toBe(SLAB_E);
    expect(levelError(LOD_MASSING, Number.NaN)).toBe(0);
    expect(levelError(LOD_MASSING, -1)).toBe(0);
  });
});

describe('thresholds (the §7.4 table)', () => {
  it('mirrors packBudgets.json tiers', () => {
    expect(LOD_TIERS).toEqual(budgets.tiers.map((t) => ({ id: t.id, tauPx: t.tauPx, maxTris: t.maxTris, maxDraws: t.maxDraws })));
    expect(lodTier('min')).toEqual({ id: 'min', tauPx: 6, maxTris: 300_000, maxDraws: 60 });
    expect(Object.isFrozen(LOD_TIERS)).toBe(true);
  });

  it.each(LOD_TIERS.map((t) => [t.id, t] as const))('%s: recomputes F→D, D→F and massing→F at K = 606', (id, tier) => {
    const row = TABLE[id];
    // The table rounds to 0.1 m, and to 1 m for massing.
    expect(Math.abs(refineDistance(FACADE_ERROR, K, tier.tauPx) - row.refineFD)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(coarsenDistance(FACADE_ERROR, K, tier.tauPx) - row.coarsenDF)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(refineDistance(SLAB_E, K, tier.tauPx) - row.refineMF)).toBeLessThanOrEqual(0.5);
    expect(coarsenDistance(FACADE_ERROR, K, tier.tauPx) / refineDistance(FACADE_ERROR, K, tier.tauPx)).toBeCloseTo(STEP_DOWN_RATIO, 12);
  });

  it.each(LOD_TIERS.map((t) => [t.id, t] as const))('%s: a building walked in and out switches at exactly those distances', (_id, tier) => {
    // 1 cm steps from 1 km to 1 m and back, a second apart so the hold never binds.
    const sel = new LodSelector(1);
    const b = bldg();
    const t: LodFrame['tier'] = { tauPx: tier.tauPx, maxTris: 1e9, maxDraws: 1e6 };
    const switches: Array<[number, number, number]> = [];
    let now = 0;
    const visit = (cm: number) => {
      b.distance = cm / 100;
      const before = sel.level[0];
      sel.select([b], frame((now += 1000), { tier: t }));
      if (sel.level[0] !== before && before !== LOD_NONE) switches.push([before, sel.level[0], cm]);
    };
    for (let cm = 100_000; cm >= 100; cm -= 1) visit(cm);
    for (let cm = 100; cm <= 100_000; cm += 1) visit(cm);
    const mf = refineDistance(SLAB_E, K, tier.tauPx);
    const fd = refineDistance(FACADE_ERROR, K, tier.tauPx);
    const df = coarsenDistance(FACADE_ERROR, K, tier.tauPx);
    const fm = coarsenDistance(SLAB_E, K, tier.tauPx);
    expect(switches.map(([from, to]) => [from, to])).toEqual([[0, 1], [1, 2], [2, 1], [1, 0]]);
    // Inward, the first centimetre with d < e·K/τ; outward, the first with
    // d ≥ 1.3·e·K/τ. Four of the eight land exactly on a centimetre (e.g.
    // 0.06 · 606 / 2 = 18.18 m), so the comparison allows float rounding.
    const eps = 1e-9;
    const cameIn = (cm: number, at: number) => {
      expect(cm / 100).toBeLessThan(at + eps);
      expect((cm + 1) / 100).toBeGreaterThan(at - eps);
    };
    const wentOut = (cm: number, at: number) => {
      expect(cm / 100).toBeGreaterThan(at - eps);
      expect((cm - 1) / 100).toBeLessThan(at + eps);
    };
    cameIn(switches[0][2], mf);
    cameIn(switches[1][2], fd);
    wentOut(switches[2][2], df);
    wentOut(switches[3][2], fm);
  });

  it('answers 0 when no distance qualifies (the 1 m floor)', () => {
    // 9 mm of error at K = 606 is 5.5 px even at 1 m: never refined at τ = 6.
    expect(refineDistance(0.009, K, 6)).toBe(0);
    for (const d of [0, 0.5, 1, 10]) expect(nextWant(LOD_MASSING, 0.009, d, K, 6)).toBe(LOD_MASSING);
    // 1 mm is 0.6 px at 1 m, under τ/1.3 for τ = 40 at every distance (where F, 36 px at 1 m, never refines).
    expect(coarsenDistance(0.001, K, 40)).toBe(0);
    for (const d of [0, 0.5, 1, 10, 1000]) expect(nextWant(LOD_FACADE, 0.001, d, K, 40)).toBe(LOD_MASSING);
  });
});

describe('hysteresis', () => {
  it('steps up past τ and down only past τ/1.3', () => {
    const want = (from: number, d: number) => nextWant(from, SLAB_E, d, K, HIGH.tauPx);
    // F ↔ D: in below 18.18 m, out only from 23.63 m.
    expect(want(LOD_FACADE, 20)).toBe(LOD_FACADE);
    expect(want(LOD_FACADE, 18.1)).toBe(LOD_DETAIL);
    expect(want(LOD_DETAIL, 20)).toBe(LOD_DETAIL);
    expect(want(LOD_DETAIL, 23.6)).toBe(LOD_DETAIL);
    expect(want(LOD_DETAIL, 23.7)).toBe(LOD_FACADE);
    // Massing ↔ F: in below 696.9 m, out only from 906 m.
    expect(want(LOD_MASSING, 697)).toBe(LOD_MASSING);
    expect(want(LOD_MASSING, 696.5)).toBe(LOD_FACADE);
    expect(want(LOD_FACADE, 900)).toBe(LOD_FACADE);
    expect(want(LOD_FACADE, 906.1)).toBe(LOD_MASSING);
  });

  it('crosses several levels in one frame, and starts an unknown want from massing', () => {
    expect(nextWant(LOD_MASSING, SLAB_E, 5, K, 2)).toBe(LOD_DETAIL);
    expect(nextWant(LOD_DETAIL, SLAB_E, 2000, K, 2)).toBe(LOD_MASSING);
    expect(nextWant(LOD_NONE, SLAB_E, 100, K, 2)).toBe(LOD_FACADE);
    expect(nextWant(7, SLAB_E, 2000, K, 2)).toBe(LOD_MASSING);
  });

  it('is idempotent at a fixed distance: a still camera never changes level', () => {
    const r = rng(7);
    for (let i = 0; i < 5000; i += 1) {
      const from = Math.floor(r() * 3);
      const e = r() * 4;
      const d = r() * 1200;
      const tau = LOD_TIERS[i % 4].tauPx;
      const once = nextWant(from, e, d, K, tau);
      expect(nextWant(once, e, d, K, tau)).toBe(once);
      // Never up and down at once: a step up means the level left behind was over τ.
      if (once > from) expect(screenError(levelError(once - 1, e), d, K)).toBeGreaterThan(tau);
      if (once < from) expect(screenError(levelError(once, e), d, K)).toBeLessThanOrEqual(tau / STEP_DOWN_RATIO);
    }
  });
});

describe('the 400 ms hold', () => {
  it('keeps a shown level for DWELL_MS after a switch, both ways', () => {
    expect(DWELL_MS).toBe(400);
    const sel = new LodSelector(1);
    const b = bldg({ distance: 30 });
    sel.select([b], frame(0));
    expect(sel.level[0]).toBe(LOD_FACADE);
    b.distance = 10;
    sel.select([b], frame(100));
    expect(sel.level[0]).toBe(LOD_DETAIL); // the first draw was not a switch, so nothing held F
    b.distance = 30;
    sel.select([b], frame(200));
    expect(sel.want[0]).toBe(LOD_FACADE);
    expect(sel.level[0]).toBe(LOD_DETAIL);
    sel.select([b], frame(499));
    expect(sel.level[0]).toBe(LOD_DETAIL);
    sel.select([b], frame(500));
    expect(sel.level[0]).toBe(LOD_FACADE);
    b.distance = 10;
    sel.select([b], frame(600));
    expect(sel.level[0]).toBe(LOD_FACADE);
    sel.select([b], frame(900));
    expect(sel.level[0]).toBe(LOD_DETAIL);
  });

  it('says when a hold that is keeping a building off its level runs out (holdUntil), so a resting loop can wake for it', () => {
    const sel = new LodSelector(1);
    const b = bldg({ distance: 30 });
    sel.select([b], frame(0));
    expect(sel.holdUntil).toBe(Infinity); // the first draw starts no hold
    b.distance = 10;
    sel.select([b], frame(100));
    expect(sel.level[0]).toBe(LOD_DETAIL);
    // The switch itself starts the hold, and nothing differs yet.
    expect(sel.holdUntil).toBe(Infinity);
    b.distance = 30;
    sel.select([b], frame(200));
    expect(sel.level[0]).toBe(LOD_DETAIL); // held
    expect(sel.holdUntil).toBe(100 + DWELL_MS);
    // A camera that stops here draws nothing more; the engine's timer brings
    // one frame at holdUntil, and that frame takes the step.
    sel.select([b], frame(sel.holdUntil));
    expect(sel.level[0]).toBe(LOD_FACADE);
    expect(sel.holdUntil).toBe(Infinity);
    // A hold on the level the building wants anyway owes no frame.
    sel.select([b], frame(sel.since[0] + 10));
    expect(sel.holdUntil).toBe(Infinity);
  });

  it('does not start on the first draw, nor on a hidden building', () => {
    const sel = new LodSelector(1);
    const b = bldg({ distance: 10, resident: RESIDENT_MASSING });
    sel.select([b], frame(0));
    expect(sel.level[0]).toBe(LOD_MASSING);
    expect(sel.since[0]).toBe(-Infinity);
    // F and D arrive while it is hidden: nothing on screen changes, so no switch and no hold.
    b.visible = false;
    b.resident = RESIDENT_ALL;
    sel.select([b], frame(50));
    expect(sel.level[0]).toBe(LOD_MASSING);
    expect(sel.since[0]).toBe(-Infinity);
    b.visible = true;
    sel.select([b], frame(60));
    expect(sel.level[0]).toBe(LOD_DETAIL);
    expect(sel.since[0]).toBe(60);
  });

  it('gives way to the caps, a ceiling and residency', () => {
    const run = (change: (b: LodBuildingInput, f: LodFrame) => void) => {
      const sel = new LodSelector(1);
      const b = bldg({ distance: 30 });
      sel.select([b], frame(0));
      b.distance = 10;
      sel.select([b], frame(1000)); // D, held until 1400
      const f = frame(1100);
      change(b, f);
      sel.select([b], f);
      return sel.level[0];
    };
    expect(run(() => {})).toBe(LOD_DETAIL);
    // Entering another building reserves its interior: D no longer fits.
    expect(run((_b, f) => { f.tier = { tauPx: 2, maxTris: 100_000, maxDraws: 1e6 }; f.reserveTris = 50_000; })).toBe(LOD_FACADE);
    expect(run((b) => { b.maxLevel = LOD_FACADE; })).toBe(LOD_FACADE);
    expect(run((_b, f) => { f.lean = true; })).toBe(LOD_MASSING);
    expect(run((b) => { b.resident = RESIDENT_MASSING | RESIDENT_FACADE; })).toBe(LOD_FACADE);
  });

  it('takes a held level before a better-ratio upgrade elsewhere, until the hold ends', () => {
    const sel = new LodSelector(2);
    const a = bldg({ distance: 30 });
    const b = bldg({ distance: 1000 });
    sel.select([a, b], frame(0));
    a.distance = 10;
    sel.select([a, b], frame(1000)); // A shows D from 1000 ms
    expect(Array.from(sel.level)).toEqual([LOD_DETAIL, LOD_MASSING]);
    // A backs off to 30 m (wants F) as B comes to 50 m (wants F). Room for A's
    // F and then either A's D or B's F; B's F removes more error per triangle.
    a.distance = 30;
    b.distance = 50;
    const tier = { tauPx: 2, maxTris: 1_200 + 39_400 + 80_000, maxDraws: 150 };
    sel.select([a, b], frame(1100, { tier }));
    expect(Array.from(sel.level)).toEqual([LOD_DETAIL, LOD_MASSING]);
    sel.select([a, b], frame(1400, { tier }));
    expect(Array.from(sel.level)).toEqual([LOD_FACADE, LOD_FACADE]);
  });

  it('is turned off by a NaN clock rather than freezing a level', () => {
    const sel = new LodSelector(1);
    const b = bldg({ distance: 30 });
    sel.select([b], frame(Number.NaN));
    b.distance = 10;
    sel.select([b], frame(Number.NaN));
    b.distance = 30;
    sel.select([b], frame(Number.NaN));
    expect(sel.level[0]).toBe(LOD_FACADE);
  });
});

describe('residency', () => {
  it('shows a level only once uploaded, and keeps the old one until then', () => {
    expect(levelAvailable(LOD_DETAIL, RESIDENT_MASSING | RESIDENT_DETAIL)).toBe(false);
    expect(levelAvailable(LOD_DETAIL, RESIDENT_FACADE | RESIDENT_DETAIL)).toBe(true);
    expect(levelAvailable(LOD_NONE, RESIDENT_ALL)).toBe(false);
    const sel = new LodSelector(1);
    const b = bldg({ distance: 10, resident: RESIDENT_MASSING });
    sel.select([b], frame(0));
    expect([sel.want[0], sel.target[0], sel.level[0]]).toEqual([LOD_DETAIL, LOD_DETAIL, LOD_MASSING]);
    b.resident |= RESIDENT_DETAIL; // D first: it is drawn over F, so still massing
    sel.select([b], frame(1000));
    expect(sel.level[0]).toBe(LOD_MASSING);
    b.resident |= RESIDENT_FACADE; // both at once: straight to D
    sel.select([b], frame(2000));
    expect(sel.level[0]).toBe(LOD_DETAIL);
  });

  it('starts from the coarsest resident level, never a hole', () => {
    const sel = new LodSelector(2);
    // Far away it wants massing, but only F is resident: F, not nothing.
    const far = bldg({ distance: 5000, resident: RESIDENT_FACADE });
    const none = bldg({ distance: 10, resident: 0 });
    sel.select([far, none], frame(0));
    expect(sel.target[0]).toBe(LOD_MASSING);
    expect(sel.level[0]).toBe(LOD_FACADE);
    expect(sel.level[1]).toBe(LOD_NONE);
    expect(sel.tris).toBe(40_000);
    expect(sel.draws).toBe(3);
    // The massing arriving is a first draw, not a switch.
    none.resident = RESIDENT_MASSING;
    sel.select([far, none], frame(10));
    expect(sel.level[1]).toBe(LOD_MASSING);
    expect(sel.since[1]).toBe(-Infinity);
  });

  it('never shows a level that is not resident, over random uploads and evictions', () => {
    const r = rng(11);
    const n = 14;
    const sel = new LodSelector(n);
    const bs = Array.from({ length: n }, () => bldg());
    for (let step = 0; step < 2000; step += 1) {
      for (const b of bs) {
        b.visible = r() < 0.8;
        b.distance = r() * 800;
        b.resident = Math.floor(r() * 8);
      }
      sel.select(bs, frame(step * 37, { tier: LOD_TIERS[step % 4] }));
      bs.forEach((b, i) => {
        const l = sel.level[i];
        if (l === LOD_NONE) {
          if (b.visible) expect(b.resident & (RESIDENT_MASSING | RESIDENT_FACADE)).toBe(0);
        } else {
          expect(levelAvailable(l, b.resident)).toBe(true);
        }
      });
    }
  });
});

describe('per-frame budget', () => {
  it('takes the most error removed per triangle first', () => {
    const sel = new LodSelector(2);
    // Same distance and want; one F is half the triangles. Room for one F.
    const heavy = bldg({ distance: 200, tris: [600, 60_000, 60_000] });
    const light = bldg({ distance: 200, tris: [600, 30_000, 30_000] });
    const tier = { tauPx: 2, maxTris: 1_200 + 59_400, maxDraws: 150 };
    sel.select([heavy, light], frame(0, { tier }));
    expect([sel.level[0], sel.level[1]]).toEqual([LOD_MASSING, LOD_FACADE]);
    // Same cost: the nearer building removes more error.
    const near = bldg({ distance: 100 });
    const farther = bldg({ distance: 300 });
    sel.reset();
    sel.select([farther, near], frame(0, { tier: { tauPx: 2, maxTris: 1_200 + 39_400, maxDraws: 150 } }));
    expect([sel.level[0], sel.level[1]]).toEqual([LOD_MASSING, LOD_FACADE]);
  });

  it('orders by error per triangle across levels, not by distance', () => {
    // A at 12 m wants D; B at 300 m wants F. Per triangle, B's F (4.52 px over
    // 39,400) beats A's D (3.03 px over 80,000), so with room for A's F and
    // 80,000 more, B gets F and A stops at F.
    const a = bldg({ distance: 12 });
    const b = bldg({ distance: 300 });
    const gainAD = screenError(FACADE_ERROR, 12, K) / 80_000;
    const gainBF = (screenError(SLAB_E, 300, K) - screenError(FACADE_ERROR, 300, K)) / 39_400;
    expect(gainBF).toBeGreaterThan(gainAD);
    const sel = new LodSelector(2);
    sel.select([a, b], frame(0, { tier: { tauPx: 2, maxTris: 1_200 + 39_400 + 80_000, maxDraws: 150 } }));
    expect([sel.want[0], sel.want[1]]).toEqual([LOD_DETAIL, LOD_FACADE]);
    expect([sel.level[0], sel.level[1]]).toEqual([LOD_FACADE, LOD_FACADE]);
    expect(sel.tris).toBe(80_000);
  });

  it('holds the draw cap as well as the triangle cap', () => {
    const sel = new LodSelector(3);
    const bs = [8, 9, 10].map((d) => bldg({ distance: d, draws: [1, 3, 63] }));
    // Floors 3 draws; three F 3 + 6 = 9; one D adds 60 → 69; two would be 129.
    sel.select(bs, frame(0, { tier: { tauPx: 2, maxTris: 1e9, maxDraws: 100 } }));
    expect(Array.from(sel.level)).toEqual([LOD_DETAIL, LOD_FACADE, LOD_FACADE]);
    expect(sel.draws).toBe(69);
  });

  it('reserves the interior, site and grid first, and flags only a floor that cannot fit', () => {
    const sel = new LodSelector(2);
    const bs = [bldg({ distance: 50 }), bldg({ distance: 60 })];
    const tier = { tauPx: 2, maxTris: 300_000, maxDraws: 60 };
    sel.select(bs, frame(0, { tier, reserveTris: 300_000 - 1_200, reserveDraws: 10 }));
    expect(Array.from(sel.level)).toEqual([LOD_MASSING, LOD_MASSING]);
    expect(sel.overBudget).toBe(false);
    expect(sel.tris).toBe(300_000);
    expect(sel.draws).toBe(12);
    // The reserve alone breaks the cap: every visible building still draws its floor, and nothing more.
    sel.select(bs, frame(5000, { tier, reserveTris: 400_000 }));
    expect(Array.from(sel.level)).toEqual([LOD_MASSING, LOD_MASSING]);
    expect(sel.overBudget).toBe(true);
    expect(sel.tris).toBe(401_200);
  });

  it('stays within every tier\'s caps and leaves no affordable upgrade untaken, over random scenes', () => {
    const r = rng(23);
    const n = 14;
    for (let scene = 0; scene < 1500; scene += 1) {
      const tier: LodTier = LOD_TIERS[scene % 4];
      const bs = Array.from({ length: n }, () => {
        const f = 30_000 + Math.floor(r() * 27_000);
        const fd = 2 + Math.floor(r() * 2);
        return bldg({
          visible: r() < 0.85,
          distance: r() < 0.2 ? r() * 30 : r() * 600,
          massingError: 0.5 + r() * 3,
          resident: r() < 0.7 ? RESIDENT_ALL : Math.floor(r() * 8),
          tris: [70 + Math.floor(r() * 530), f, f + 50_000 + Math.floor(r() * 70_000)],
          draws: [1, fd, fd + 40 + Math.floor(r() * 20)],
          maxLevel: r() < 0.1 ? LOD_FACADE : undefined,
        });
      });
      const reserveTris = r() < 0.5 ? Math.floor(r() * 250_000) : 0;
      const reserveDraws = reserveTris ? 12 + Math.floor(r() * 20) : 16;
      const sel = new LodSelector(n);
      sel.select(bs, { now: 0, k: sseScale(400 + r() * 1000, r() < 0.5 ? 45 : 60), tier, reserveTris, reserveDraws });

      let tris = reserveTris;
      let draws = reserveDraws;
      bs.forEach((b, i) => {
        const l = sel.level[i];
        if (!b.visible || l === LOD_NONE) return;
        tris += b.tris[l];
        draws += b.draws[l];
      });
      expect(sel.tris).toBe(tris);
      expect(sel.draws).toBe(draws);
      if (!sel.overBudget) {
        expect(tris).toBeLessThanOrEqual(tier.maxTris);
        expect(draws).toBeLessThanOrEqual(tier.maxDraws);
      }
      bs.forEach((b, i) => {
        const l = sel.level[i];
        if (!b.visible || l === LOD_NONE) return;
        let floor = LOD_MASSING;
        while (!levelAvailable(floor, b.resident)) floor += 1;
        expect(l).toBeGreaterThanOrEqual(floor);
        // Upgrades stop at the target (want under the ceiling).
        if (l > floor) expect(l).toBeLessThanOrEqual(sel.target[i]);
        // Greedy is maximal: any step still wanted and resident would break a cap.
        if (l < sel.target[i] && levelAvailable(l + 1, b.resident)) {
          const over = tris + b.tris[l + 1] - b.tris[l] > tier.maxTris || draws + b.draws[l + 1] - b.draws[l] > tier.maxDraws;
          expect(over).toBe(true);
        }
      });
    }
  });
});

describe('lean mode', () => {
  it('keeps every building but the focus at massing, and the scheduler fetches nothing for them', () => {
    const sel = new LodSelector(3);
    const bs = [bldg({ distance: 5 }), bldg({ distance: 8, focus: true }), bldg({ distance: 12 })];
    sel.select(bs, frame(0, { lean: true }));
    expect(Array.from(sel.want)).toEqual([LOD_DETAIL, LOD_DETAIL, LOD_DETAIL]);
    expect(Array.from(sel.target)).toEqual([LOD_MASSING, LOD_DETAIL, LOD_MASSING]);
    expect(Array.from(sel.level)).toEqual([LOD_MASSING, LOD_DETAIL, LOD_MASSING]);
    // Lean off: the same buildings climb at once, from the wants kept all along.
    sel.select(bs, frame(5000));
    expect(Array.from(sel.level)).toEqual([LOD_DETAIL, LOD_DETAIL, LOD_DETAIL]);
  });

  it('drops a hidden building to its ceiling too, so no level above it is ever reported', () => {
    const sel = new LodSelector(2);
    const bs = [bldg({ distance: 5 }), bldg({ distance: 5, focus: true })];
    sel.select(bs, frame(0));
    expect(Array.from(sel.level)).toEqual([LOD_DETAIL, LOD_DETAIL]);
    bs[0].visible = false;
    bs[1].visible = false;
    sel.select(bs, frame(100, { lean: true }));
    expect(Array.from(sel.level)).toEqual([LOD_MASSING, LOD_DETAIL]);
    expect([sel.tris, sel.draws]).toEqual([0, 0]);
  });

  it('holds the building the camera is inside at F (maxLevel), even at d = 0', () => {
    const sel = new LodSelector(1);
    sel.select([bldg({ distance: 0, maxLevel: LOD_FACADE })], frame(0));
    expect(sel.want[0]).toBe(LOD_DETAIL);
    expect(sel.level[0]).toBe(LOD_FACADE);
  });
});

describe('the focus building', () => {
  // Past F's switch distance (697 m at τ 2 for this slab) a building wants massing.
  const far = 1_000;

  it('never shows as massing once its F is resident, however far it is', () => {
    const sel = new LodSelector(2);
    const bs = [bldg({ distance: far }), bldg({ distance: far, focus: true })];
    sel.select(bs, frame(0));
    expect(Array.from(sel.want)).toEqual([LOD_MASSING, LOD_MASSING]);
    expect(Array.from(sel.target)).toEqual([LOD_MASSING, LOD_FACADE]);
    expect(Array.from(sel.level)).toEqual([LOD_MASSING, LOD_FACADE]);
    // Selected but its F not yet in: the box stays, and nothing is fetched for it.
    const waiting = new LodSelector(1);
    waiting.select([bldg({ distance: far, focus: true, resident: RESIDENT_MASSING })], frame(0));
    expect([waiting.target[0], waiting.level[0]]).toEqual([LOD_MASSING, LOD_MASSING]);
  });

  it('keeps its ceiling: lean or not, a massing-only ceiling holds it at massing', () => {
    const sel = new LodSelector(1);
    sel.select([bldg({ distance: far, focus: true, maxLevel: LOD_MASSING })], frame(0));
    expect(sel.level[0]).toBe(LOD_MASSING);
  });

  it('takes its step to F before any other upgrade, and only while the caps hold', () => {
    // Room for one F: the near building would win on error per triangle; the focus wins.
    const tight: LodFrame['tier'] = { tauPx: 2, maxTris: 600 + 600 + 40_000, maxDraws: 100 };
    const sel = new LodSelector(2);
    sel.select([bldg({ distance: 50 }), bldg({ distance: far, focus: true })], frame(0, { tier: tight }));
    expect(Array.from(sel.level)).toEqual([LOD_MASSING, LOD_FACADE]);
    // No room at all: it stays massing rather than break a cap.
    const none: LodFrame['tier'] = { tauPx: 2, maxTris: 1_200, maxDraws: 100 };
    const starved = new LodSelector(1);
    starved.select([bldg({ distance: far, focus: true })], frame(0, { tier: none }));
    expect(starved.level[0]).toBe(LOD_MASSING);
  });
});

describe('the selector', () => {
  it('reuses one result: select() returns itself and its arrays are never replaced', () => {
    const sel = new LodSelector(2);
    const arrays = [sel.level, sel.want, sel.target, sel.sse, sel.since];
    const bs = [bldg(), bldg({ distance: 10 })];
    expect(sel.select(bs, frame(0))).toBe(sel);
    expect(sel.select(bs, frame(16))).toBe(sel);
    expect([sel.level, sel.want, sel.target, sel.sse, sel.since]).toEqual(arrays);
    arrays.forEach((a, i) => expect([sel.level, sel.want, sel.target, sel.sse, sel.since][i]).toBe(a));
  });

  it('reports the shown level\'s error, massing\'s while nothing is shown', () => {
    const sel = new LodSelector(2);
    sel.select([bldg({ distance: 100 }), bldg({ distance: 100, resident: 0 })], frame(0));
    expect(sel.sse[0]).toBeCloseTo(screenError(FACADE_ERROR, 100, K), 12);
    expect(sel.sse[1]).toBeCloseTo(screenError(SLAB_E, 100, K), 12);
  });

  it('refuses a building list of the wrong length, and reset() forgets everything', () => {
    const sel = new LodSelector(2);
    expect(() => sel.select([bldg()], frame(0))).toThrow(RangeError);
    expect(() => new LodSelector(-1)).toThrow(RangeError);
    sel.select([bldg({ distance: 10 }), bldg({ distance: 10 })], frame(0));
    sel.reset();
    expect(Array.from(sel.level)).toEqual([LOD_NONE, LOD_NONE]);
    expect(Array.from(sel.want)).toEqual([LOD_MASSING, LOD_MASSING]);
    expect(Array.from(sel.since)).toEqual([-Infinity, -Infinity]);
    expect([sel.tris, sel.draws, sel.overBudget]).toEqual([0, 0, false]);
  });
});
