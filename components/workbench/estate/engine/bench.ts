import {
  benchVerdict, BenchSegment, segmentAt, summariseSegment, type BenchSegmentReport, type BenchVerdict,
} from '../../../../lib/estate/bench';
import { judgedPeriod } from '../../../../lib/estate/governorCore';
import type { EstateSiteId, EstateStoreyTag } from '../../../../lib/estate/ids';
import type { EstateEngineEvent, EstateView, EstateWalkStep } from '../engineApi';
import type { EngineProbe } from './core';
import type { EngineInternals } from './index';

// `?estate-bench=1` (P7, plan §12.4): the benchmark route, run by itself on the
// real engine in the visitor's own window, logged as JSON to
// window.__estateBench and the console. A chunk of its own: engine/index.ts
// imports it only when the shell passed `bench`, so no visitor downloads it.
//
// The route drives the engine through its public handle — the commands the HUD
// and the assistant use (flyTo, enter, walkFrom, the step buttons, the storey
// strip, takeStairs, planView, walkIn, escape) — plus keys held on the stage
// (Shift+W up the car park's ramps, as tests/e2e/estate.spec.ts case 8b climbs
// them, and through the hawker hall). One leg past §12.4's route,
// bs1-recovery, turns on the spot for 16 s to show whether the governor climbs
// back once the view is light. Each
// segment is one leg and the settle after it (nothing moving, nothing
// downloading); the render core taps every drawn frame and notch change into
// it (core.ts EngineProbe), and long tasks and resource timings are booked to
// the segment they started in. lib/estate/bench.ts does the arithmetic.
//
// Routes that depend on where a walker stands start from a named spawn (a cut,
// engineApi walkFrom) so that a different window size, which moves where a
// fly-to lands and so which entrance Enter picks, cannot change the route: the
// step-button routes are the e2e tour's. A leg that cannot run as written says
// so in its notes and is marked not ok; the route goes on.

export const BENCH_SCHEMA = 'portfolio/estate-bench/1';

export interface BenchReport {
  schema: typeof BENCH_SCHEMA;
  state: 'running' | 'done' | 'failed';
  meta: Record<string, string | number | boolean | null>;
  segments: BenchSegmentReport[];
  verdict: BenchVerdict | null;
  error: string | null;
}

type BenchWindow = Window & { __estateBench?: BenchReport };

const SETTLE_QUIET_MS = 700;
const SETTLE_TIMEOUT_MS = 30_000;
const POLL_MS = 50;

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });
const pathOf = (url: string): string => {
  try { return new URL(url, location.href).pathname; } catch { return url; }
};

/** The renderer's name (unmasked where the browser still allows it), for the report's header. */
const rendererName = (host: HTMLElement): string | null => {
  const canvas = host.querySelector<HTMLCanvasElement>('canvas[data-estate-canvas]');
  const gl = canvas?.getContext('webgl2') ?? null;
  if (!gl) return null;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
};

/** When the poster image finished arriving, ms since navigation, or null. */
const posterArrival = (): number | null => {
  const entry = performance.getEntriesByType('resource').find((e) => /\/estate\/v[\d.]+\/poster\//.test(e.name));
  return entry ? Math.round((entry as PerformanceResourceTiming).responseEnd) : null;
};

interface LoafScript { duration: number; invoker?: string; sourceFunctionName?: string }

/** A long animation frame's blocking time and its longest script. */
const slowFrame = (entry: PerformanceEntry): { blockingMs: number; script: string | null } => {
  const loaf = entry as PerformanceEntry & { blockingDuration?: number; scripts?: LoafScript[] };
  const top = [...(loaf.scripts ?? [])].sort((a, b) => b.duration - a.duration)[0];
  const script = top ? [top.invoker, top.sourceFunctionName].filter(Boolean).join(' · ') || null : null;
  return { blockingMs: loaf.blockingDuration ?? 0, script };
};

const observe = (type: string, onEntry: (entry: PerformanceEntry) => void): PerformanceObserver | null => {
  try {
    if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes(type)) return null;
    const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) onEntry(entry); });
    observer.observe({ type, buffered: true });
    return observer;
  } catch {
    return null;
  }
};

export const runBench = async (internals: EngineInternals, startedAt: number): Promise<BenchReport> => {
  const { engine, core } = internals;
  const host = core.options.host;
  const scope = window as BenchWindow;
  const segments: BenchSegment[] = [];
  const report: BenchReport = { schema: BENCH_SCHEMA, state: 'running', meta: {}, segments: [], verdict: null, error: null };
  scope.__estateBench = report;
  let current: BenchSegment | null = null;
  let lastFrame = Number.NaN;
  let failure: string | null = null;

  // The render core's tap: one call per drawn frame and per notch change.
  const probe: EngineProbe = {
    frame: (time, continuous, cpuMs, stats, governor) => {
      const interval = time - lastFrame;
      lastFrame = time;
      current?.frame({
        interval, continuous, judgedMs: judgedPeriod(governor.state), cpuMs, gpuMs: governor.lastGpuMs,
        draws: stats.draws, tris: stats.tris, gpuBytes: stats.gpuBytes, programs: stats.programs, tier: stats.tier, pixelRatio: stats.pixelRatio,
      });
    },
    notch: (change) => {
      current?.changes.push(`${change.decision} → ${change.notch.tier} ×${change.notch.pixelRatio}`);
    },
  };
  core.probe = probe;

  // Long tasks (Chrome) and resource timings, booked by start time.
  const longTasks = observe('longtask', (entry) => { segmentAt(segments, entry.startTime)?.longTasks.push(entry.duration); });
  const slowFrames = observe('long-animation-frame', (entry) => {
    segmentAt(segments, entry.startTime)?.slowFrames.push(slowFrame(entry));
  });
  const resources = observe('resource', (entry) => {
    const timing = entry as PerformanceResourceTiming;
    segmentAt(segments, timing.startTime)?.resources.push({ path: pathOf(timing.name), bytes: timing.transferSize > 0 ? timing.transferSize : 0 });
  });

  const unsubscribe = engine.subscribe((event: EstateEngineEvent) => {
    if (event.type === 'error' || event.type === 'stale' || event.type === 'unavailable') failure = event.type;
  });

  const view = (): EstateView => engine.getView();
  const busy = (): boolean => {
    const v = view();
    return v.moving || v.flight || v.transition !== null || (v.walk?.ride ?? null) !== null || (v.walk?.preparing ?? false);
  };
  const pending = (): number => core.streaming?.pending ?? 0;

  /** Poll until `test` holds (true) or the timeout passes (false). */
  const until = async (test: () => boolean, timeoutMs: number): Promise<boolean> => {
    const end = performance.now() + timeoutMs;
    for (;;) {
      if (failure) throw new Error(`engine ${failure}`);
      if (test()) return true;
      if (performance.now() > end) return false;
      await sleep(POLL_MS);
    }
  };

  /** Nothing moving and nothing downloading for SETTLE_QUIET_MS. */
  const settle = async (segment: BenchSegment): Promise<void> => {
    let since = Number.NaN;
    const ok = await until(() => {
      if (busy() || pending() > 0) { since = Number.NaN; return false; }
      if (Number.isNaN(since)) since = performance.now();
      return performance.now() - since >= SETTLE_QUIET_MS;
    }, SETTLE_TIMEOUT_MS);
    if (!ok) segment.note(`did not settle within ${SETTLE_TIMEOUT_MS / 1000} s (moving ${view().moving}, pending ${pending()})`, true);
  };

  const begin = (name: string, at = performance.now()): BenchSegment => {
    const segment = new BenchSegment(name, at);
    segments.push(segment);
    current = segment;
    lastFrame = Number.NaN;
    return segment;
  };
  const end = (segment: BenchSegment) => {
    segment.endMs = performance.now();
    current = null;
    const line = summariseSegment(segment);
    report.segments.push(line);
    console.info('[estate-bench]', JSON.stringify(line));
  };

  /** One leg: run `act`, settle, close the segment. A throw ends the route. */
  const leg = async (name: string, act: (segment: BenchSegment) => Promise<void>) => {
    const segment = begin(name);
    try {
      await act(segment);
      await settle(segment);
    } finally {
      end(segment);
    }
  };

  const check = (segment: BenchSegment, done: boolean, what: string) => {
    if (!done) segment.note(`${what}: refused`, true);
    return done;
  };
  const storey = (): EstateStoreyTag | null => view().location.storey;
  const steps = (route: string): number => {
    const kinds: Record<string, EstateWalkStep> = { f: 'forward', b: 'back', l: 'turn-left', r: 'turn-right' };
    let refused = 0;
    for (const move of route.split(' ')) {
      for (let i = 0; i < Number(move.slice(1)); i += 1) if (!engine.walkStep(kinds[move[0]])) refused += 1;
    }
    return refused;
  };
  /** Hold keys on the stage (keydown on it, keyup on window, as the controls listen) for at most `ms` or until `test`. */
  const hold = async (codes: string[], ms: number, test: () => boolean): Promise<boolean> => {
    const shiftKey = codes.some((code) => code.startsWith('Shift'));
    for (const code of codes) host.dispatchEvent(new KeyboardEvent('keydown', { code, shiftKey, bubbles: false, cancelable: true }));
    try {
      return await until(test, ms);
    } finally {
      for (const code of [...codes].reverse()) window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: false }));
    }
  };
  /** Enter `site` (the arc into Walk from wherever the camera is), then stand at `spawn` (its full pack name) with its walk grid in. */
  const enterAt = async (segment: BenchSegment, site: EstateSiteId, spawn: string) => {
    if (!check(segment, engine.enter(site), `enter ${site}`)) return;
    const inside = await until(() => !busy() && view().walk?.site === site && (view().walk?.levels.length ?? 0) > 0, SETTLE_TIMEOUT_MS);
    if (!inside) segment.note(`not standing in ${site} after its Enter arc`, true);
    if (check(segment, engine.walkFrom(`${site} ${spawn}`), `walkFrom ${spawn}`)) segment.note(`placed at ${spawn} for the route`);
  };

  try {
    const s1 = begin('s1-first-frame', startedAt);
    if (!(await until(() => core.isReady, 120_000))) s1.note('not live within 120 s', true);
    report.meta = {
      userAgent: navigator.userAgent,
      renderer: rendererName(host),
      tierStart: core.tier,
      msaa: core.msaa,
      pixelRatioStart: core.pixelRatio,
      devicePixelRatio: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
      cssWidth: host.clientWidth,
      cssHeight: host.clientHeight,
      motionHalted: core.options.motionHalted(),
      liveMs: Math.round(performance.now() - startedAt),
      // From navigation (performance's time origin), and when the poster had arrived.
      liveSinceNavigationMs: Math.round(performance.now()),
      posterMs: posterArrival(),
      longTaskObserver: longTasks !== null,
      longFrameObserver: slowFrames !== null,
      startedAt: new Date().toISOString(),
    };
    await settle(s1);
    end(s1);

    await leg('s2-orbit', async (segment) => {
      // A full turn in 24 steps of 15°, then three zooms in and out: every building at F.
      for (let i = 0; i < 24; i += 1) {
        if (!engine.walkStep('turn-left')) segment.note('orbit step refused', true);
        await sleep(150);
      }
      for (const kind of ['forward', 'forward', 'forward', 'back', 'back', 'back'] as const) {
        engine.walkStep(kind);
        await sleep(250);
      }
    });

    await leg('bs1-street', async (segment) => {
      if (!check(segment, engine.walkFrom('BS1'), 'walkFrom BS1')) return;
      await settle(segment);
      engine.setStick(0, 1);
      await sleep(3000);
      engine.setStick(0, 0);
    });

    await leg('blk509-void-deck', async (segment) => {
      await enterAt(segment, 'BLK_509', 'Void deck entrance E');
    });

    await leg('stairs-l2', async (segment) => {
      // The e2e tour's route from the east void deck into stair 5's doorway.
      if (steps('f6 r6 f2') > 0) segment.note('a step was refused', true);
      await settle(segment);
      const offer = view().walk?.stair ?? null;
      if (offer?.up && engine.takeStairs(1)) segment.note(`climbing ${offer.label} to ${offer.up}`);
      else {
        segment.note('no stair offered at the tour\'s doorway: the strip routes to L2 instead', true);
        engine.setStorey('L2');
      }
      if (!(await until(() => storey() === 'L2' && !busy(), SETTLE_TIMEOUT_MS))) segment.note('not on L2', true);
    });

    await leg('lift-l5', async (segment) => {
      // The storey strip's lift ride, as the tour does (the stair landing is 17 m from a lift).
      check(segment, engine.setStorey('L5'), 'strip to L5');
      if (!(await until(() => storey() === 'L5' && !busy(), SETTLE_TIMEOUT_MS))) segment.note('not on L5', true);
    });

    await leg('plan-l5', async (segment) => {
      if (!check(segment, engine.planView('BLK_509', 'L5'), 'plan BLK_509 L5')) return;
      if (!(await until(() => (view().plan?.ready ?? false) && !busy(), SETTLE_TIMEOUT_MS))) segment.note('plan not ready', true);
    });

    await leg('walk-in-05-105', async (segment) => {
      const rooms = view().plan?.rooms ?? [];
      const ofFlat = rooms.map((room, index) => ({ room, index })).filter(({ room }) => room.flat === '#05-105');
      const pick = ofFlat.find(({ room }) => / LD$/.test(room.name)) ?? ofFlat[0];
      if (!pick) { segment.note('no #05-105 on the plan', true); return; }
      engine.pickRoom(pick.index);
      if (!check(segment, engine.walkIn(pick.index), `walk into ${pick.room.name}`)) return;
      const inside = await until(() => view().location.mode === 'walk' && !busy() && view().location.unit === '#05-105', SETTLE_TIMEOUT_MS);
      segment.note(inside ? `standing in ${pick.room.name} (${pick.room.label})` : `not in #05-105 (${view().location.unit ?? 'no unit'})`, !inside);
    });

    await leg('lift-l12', async (segment) => {
      check(segment, engine.setStorey('L12'), 'strip to L12');
      if (!(await until(() => storey() === 'L12' && !busy(), SETTLE_TIMEOUT_MS))) segment.note('not on L12', true);
    });

    await leg('esc-overview', async (segment) => {
      check(segment, engine.escape('overview'), 'Esc to Overview');
      if (!(await until(() => view().location.mode === 'overview' && !busy(), SETTLE_TIMEOUT_MS))) segment.note('not in Overview', true);
    });

    await leg('fly-nc514', async (segment) => {
      if (!check(segment, engine.flyTo('NC_514'), 'fly to NC_514')) return;
      await until(() => !view().flight, SETTLE_TIMEOUT_MS);
    });

    await leg('nc514-hall', async (segment) => {
      await enterAt(segment, 'NC_514', 'Entrance E 2');
      await settle(segment);
      // Along the walkway into the hall, Shift+W (the tour's 70 m of steps, walked).
      const seated = await hold(['ShiftLeft', 'KeyW'], 20_000, () => /seating/i.test(view().location.room ?? ''));
      segment.note(seated ? `in the hall: ${view().location.room}` : `not at the seating (${view().location.room ?? 'no room'})`, !seated);
    });

    await leg('mscp-ramp', async (segment) => {
      await enterAt(segment, 'MSCP_513', 'Entrance E');
      // The tour's route to the foot of the west ramp, facing up it.
      if (steps('f18 r6 f82 l6 f58 r6 f14 r6') > 0) segment.note('a step was refused', true);
      await settle(segment);
      const l2 = await hold(['ShiftLeft', 'KeyW'], 25_000, () => storey() === 'L2');
      if (!l2) { segment.note(`not up the ramp to L2 (${storey()})`, true); return; }
      // On to the east landing's wall; L2's ramp up is the lane beside, back west.
      await hold(['ShiftLeft', 'KeyW'], 2500, () => false);
      await settle(segment);
      steps('l6 f14 l6');
      const l3 = await hold(['ShiftLeft', 'KeyW'], 25_000, () => storey() === 'L3');
      segment.note(l3 ? 'L1 → L3 by the ramps' : `reached L2, not L3 (${storey()} · ${view().location.room ?? ''})`, !l3);
    });

    await leg('bs1-recovery', async (segment) => {
      // Not in §12.4's route: a light view drawn continuously for 16 s (turning
      // on the spot at BS1), long enough for the governor's 8 s clean wait, a
      // probe up and its 4 s trial, so a run shows whether it climbs back.
      if (!check(segment, engine.walkFrom('BS1'), 'walkFrom BS1')) return;
      await settle(segment);
      await hold(['ArrowLeft'], 16_000, () => false);
    });

    report.state = 'done';
  } catch (error) {
    if (current) end(current);
    report.state = 'failed';
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    core.probe = null;
    unsubscribe();
    for (const observer of [longTasks, slowFrames, resources]) {
      if (!observer) continue;
      // Entries still queued land in their segments, then the reports are redone with them.
      for (const entry of observer.takeRecords()) {
        const segment = segmentAt(segments, entry.startTime);
        if (!segment) continue;
        if (entry.entryType === 'longtask') segment.longTasks.push(entry.duration);
        else if (entry.entryType === 'long-animation-frame') segment.slowFrames.push(slowFrame(entry));
        else segment.resources.push({ path: pathOf(entry.name), bytes: (entry as PerformanceResourceTiming).transferSize || 0 });
      }
      observer.disconnect();
    }
    report.segments = segments.filter((s) => !Number.isNaN(s.endMs)).map(summariseSegment);
    report.verdict = benchVerdict(report.segments);
    scope.__estateBench = report;
    console.info('[estate-bench] report', JSON.stringify(report));
  }
  return report;
};
