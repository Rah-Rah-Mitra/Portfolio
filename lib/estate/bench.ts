import { DROP_FACTOR } from './governorCore';

// The §12.4 benchmark's bookkeeping (P7, `?estate-bench=1`): pure, so node tests
// pin it. The engine's bench driver (components/workbench/estate/engine/bench.ts,
// a lazy chunk of its own that only `?estate-bench=1` ever downloads) feeds one
// BenchSegment per leg of the route — a frame tap from the render core, the
// governor's notch changes, long tasks and resource timings — and reports each
// with summariseSegment(). Nothing here reads a clock or the DOM.
//
// "Dropped" is the governor's own test (§7.9): an interval over DROP_FACTOR ×
// the period the governor was judging frames against at that moment, so the
// bench and the quality control agree on what a drop is. Only continuous frames
// count (one that follows another; the first after a rest carries the rest).
// Firefox has no long-task observer, so every segment also counts frame gaps:
// continuous intervals over GAP_MS, the same 50 ms a long task is.
//
// Each segment keeps two sets of figures side by side. The raw ones count every
// continuous frame. The G3 ones (plan §1 G3) leave out the frames G3 does: those
// that uploaded geometry, compiled a shader or followed a resize (the render
// core's own `excluded`, the frames the governor does not judge either); and
// `settled` further leaves out the first SETTLED_AFTER_MS after live and after
// every notch change, G3's "after the quality control has settled" for the 4×
// CPU row. The verdict reads the G3 figures.

/** A frame interval this long is a gap, ms (the long-task threshold). */
export const GAP_MS = 50;
/** §12.4's pass: at most this many governor notch changes in any one segment. */
export const MAX_CHANGES_PER_SEGMENT = 2;
/** Segments that must download nothing (§3 P5, §12.4): storey, lift and stair moves inside a building already entered. */
export const ZERO_BYTE_SEGMENTS: readonly string[] = ['stairs-l2', 'lift-l5', 'lift-l12'];
/** G3's slow-device row leaves out this long after live and after each notch change, ms. */
export const SETTLED_AFTER_MS = 5000;
/** Segments outside §12.4's route as G3 measures it: the load itself, and the recovery leg the bench adds. */
export const OFF_ROUTE_SEGMENTS: readonly string[] = ['s1-first-frame', 'bs1-recovery'];

export interface BenchFrame {
  /** rAF interval since the previous drawn frame, ms (NaN for the first after a rest). */
  interval: number;
  /** It directly followed another frame (frameLoop's continuous). */
  continuous: boolean;
  /** The period the governor judged frames against (governorCore judgedPeriod), ms; NaN before it has one. */
  judgedMs: number;
  cpuMs: number;
  /** GPU ms from the timer query, NaN where there is none (SwiftShader, Firefox). */
  gpuMs: number;
  draws: number;
  tris: number;
  /** Geometry plus the drawing buffer, bytes (scheduler.usedBytes). */
  gpuBytes: number;
  programs: number;
  tier: string;
  pixelRatio: number;
  /** It uploaded, compiled, followed a resize or waited on a notch's resize: G3 leaves it out (core.ts `excluded`). */
  excluded: boolean;
  /** Within SETTLED_AFTER_MS of live or of a notch change: left out of the `settled` figures. */
  settling: boolean;
}

export interface BenchResource {
  /** URL path, e.g. /estate/v1.2/i/BLK_509.<h8>.glb.gz. */
  path: string;
  /** Bytes over the wire (transferSize; encodedBodySize when the cache answered with 0 and a body). */
  bytes: number;
}

export class BenchSegment {
  readonly name: string;
  readonly startMs: number;
  endMs = Number.NaN;
  frames = 0;
  continuous = 0;
  dropped = 0;
  gaps = 0;
  readonly intervals: number[] = [];
  readonly cpu: number[] = [];
  readonly gpu: number[] = [];
  draws = 0;
  tris = 0;
  gpuBytes = 0;
  programs = 0;
  tier = '';
  pixelRatio = Number.NaN;
  /** Continuous frames G3 leaves out (uploads, compiles, resizes). */
  excluded = 0;
  /** G3's sample: continuous frames not excluded. */
  g3Sampled = 0;
  g3Dropped = 0;
  g3Gaps = 0;
  readonly g3Intervals: number[] = [];
  readonly g3Cpu: number[] = [];
  /** …and of those, the ones past SETTLED_AFTER_MS after live or a notch. */
  settledSampled = 0;
  settledDropped = 0;
  readonly settledIntervals: number[] = [];
  /** Governor notch changes, as 'down → mid ×1' strings. */
  readonly changes: string[] = [];
  /** Long-task durations, ms (Chrome's PerformanceObserver 'longtask'). */
  readonly longTasks: number[] = [];
  /**
   * Long animation frames (Chrome's 'long-animation-frame'): each one's blocking
   * ms and its longest script as 'invoker · function', which says what a long
   * task was where the long-task entry cannot.
   */
  readonly slowFrames: { blockingMs: number; script: string | null }[] = [];
  readonly resources: BenchResource[] = [];
  ok = true;
  readonly notes: string[] = [];

  constructor(name: string, startMs: number) {
    this.name = name;
    this.startMs = startMs;
  }

  frame(f: BenchFrame): void {
    this.frames += 1;
    this.draws = Math.max(this.draws, f.draws);
    this.tris = Math.max(this.tris, f.tris);
    this.gpuBytes = Math.max(this.gpuBytes, f.gpuBytes);
    this.programs = Math.max(this.programs, f.programs);
    this.tier = f.tier;
    this.pixelRatio = f.pixelRatio;
    if (!f.continuous || !(f.interval > 0)) return;
    const dropped = f.judgedMs > 0 && f.interval > DROP_FACTOR * f.judgedMs;
    const gap = f.interval > GAP_MS;
    this.continuous += 1;
    this.intervals.push(f.interval);
    this.cpu.push(f.cpuMs);
    if (Number.isFinite(f.gpuMs)) this.gpu.push(f.gpuMs);
    if (dropped) this.dropped += 1;
    if (gap) this.gaps += 1;
    if (f.excluded) {
      this.excluded += 1;
      return;
    }
    this.g3Sampled += 1;
    this.g3Intervals.push(f.interval);
    this.g3Cpu.push(f.cpuMs);
    if (dropped) this.g3Dropped += 1;
    if (gap) this.g3Gaps += 1;
    if (f.settling) return;
    this.settledSampled += 1;
    this.settledIntervals.push(f.interval);
    if (dropped) this.settledDropped += 1;
  }

  note(text: string, failed = false): void {
    this.notes.push(text);
    if (failed) this.ok = false;
  }
}

/** Nearest-rank percentile (rank ceil(q·n)), on a sorted copy; null when empty. */
export const percentile = (values: readonly number[], q: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const k = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length - 1e-9) - 1));
  return sorted[k];
};

const round = (value: number | null, digits = 2): number | null => (value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits)));

/** Is this resource the estate's own (pack files under /estate/)? */
export const isEstatePath = (path: string): boolean => path.startsWith('/estate/');

export interface BenchSegmentReport {
  name: string;
  ok: boolean;
  ms: number;
  frames: number;
  /** Continuous frames, the ones dropped % and the percentiles are over. */
  sampled: number;
  droppedPct: number | null;
  intervalP50: number | null;
  intervalP99: number | null;
  cpuP95: number | null;
  gpuP95: number | null;
  /** Continuous intervals over GAP_MS (Firefox's stand-in for long tasks). */
  gaps: number;
  /**
   * G3's figures: the same, without the frames that uploaded, compiled or
   * followed a resize (`excluded` of them); `gaps` is G3's Firefox measure,
   * "animation-frame gaps over 50 ms outside upload frames".
   */
  g3: { sampled: number; excluded: number; droppedPct: number | null; intervalP99: number | null; cpuP95: number | null; gaps: number };
  /** …past the first SETTLED_AFTER_MS after live and after each notch change: G3's 4× CPU row. */
  settled: { sampled: number; droppedPct: number | null; intervalP99: number | null };
  longTasks: { count: number; maxMs: number | null; totalMs: number };
  /** Long animation frames that blocked (Chrome): count, the worst, and the scripts behind the three worst. */
  slowFrames: { count: number; maxBlockingMs: number | null; scripts: string[] };
  draws: number;
  tris: number;
  /** Geometry plus drawing buffer, decimal MB, the segment's peak. */
  gpuMB: number | null;
  /** Bytes and requests for /estate/ files that started in this segment. */
  bytes: number;
  requests: number;
  /** Anything else fetched meanwhile (the engine's own chunks, the API). */
  otherBytes: number;
  programs: number;
  governorChanges: number;
  changes: string[];
  tier: string;
  pixelRatio: number | null;
  notes: string[];
}

const slowFrameSummary = (frames: BenchSegment['slowFrames']): BenchSegmentReport['slowFrames'] => {
  const blocking = frames.filter((f) => f.blockingMs > 0).sort((a, b) => b.blockingMs - a.blockingMs);
  return {
    count: blocking.length,
    maxBlockingMs: blocking.length ? round(blocking[0].blockingMs, 0) : null,
    scripts: blocking.slice(0, 3).map((f) => `${round(f.blockingMs, 0)} ms ${f.script ?? '(no script)'}`),
  };
};

export const summariseSegment = (s: BenchSegment): BenchSegmentReport => {
  const estate = s.resources.filter((r) => isEstatePath(r.path));
  return {
    name: s.name,
    ok: s.ok,
    ms: round(s.endMs - s.startMs, 0) ?? 0,
    frames: s.frames,
    sampled: s.continuous,
    droppedPct: s.continuous ? round((100 * s.dropped) / s.continuous, 1) : null,
    intervalP50: round(percentile(s.intervals, 0.5)),
    intervalP99: round(percentile(s.intervals, 0.99)),
    cpuP95: round(percentile(s.cpu, 0.95)),
    gpuP95: round(percentile(s.gpu, 0.95)),
    gaps: s.gaps,
    g3: {
      sampled: s.g3Sampled,
      excluded: s.excluded,
      droppedPct: s.g3Sampled ? round((100 * s.g3Dropped) / s.g3Sampled, 1) : null,
      intervalP99: round(percentile(s.g3Intervals, 0.99)),
      cpuP95: round(percentile(s.g3Cpu, 0.95)),
      gaps: s.g3Gaps,
    },
    settled: {
      sampled: s.settledSampled,
      droppedPct: s.settledSampled ? round((100 * s.settledDropped) / s.settledSampled, 1) : null,
      intervalP99: round(percentile(s.settledIntervals, 0.99)),
    },
    longTasks: {
      count: s.longTasks.length,
      maxMs: s.longTasks.length ? round(Math.max(...s.longTasks), 0) : null,
      totalMs: round(s.longTasks.reduce((sum, ms) => sum + ms, 0), 0) ?? 0,
    },
    slowFrames: slowFrameSummary(s.slowFrames),
    draws: s.draws,
    tris: s.tris,
    gpuMB: s.gpuBytes > 0 ? round(s.gpuBytes / 1e6, 1) : null,
    bytes: estate.reduce((sum, r) => sum + r.bytes, 0),
    requests: estate.length,
    otherBytes: s.resources.filter((r) => !isEstatePath(r.path)).reduce((sum, r) => sum + r.bytes, 0),
    programs: s.programs,
    governorChanges: s.changes.length,
    changes: [...s.changes],
    tier: s.tier,
    pixelRatio: round(s.pixelRatio),
    notes: [...s.notes],
  };
};

export interface BenchVerdict {
  /** Every segment ran its route as written (no fallback, no timeout). */
  routeOk: boolean;
  /** ≤ MAX_CHANGES_PER_SEGMENT notch changes in every segment. */
  governorOk: boolean;
  /** The ZERO_BYTE_SEGMENTS present that downloaded something (should be empty). */
  bytesOnMoves: string[];
  /**
   * Segments with a long task: where G3's "no task over 50 ms" fails on this
   * machine. s1-first-frame's are before live (G3 counts "from live onward"),
   * so a run is fit on this count when the list holds nothing else.
   */
  longTasks: string[];
  /** Segments with a G3 frame gap over GAP_MS, outside upload frames (Firefox's measure; on Chrome without long tasks, the GPU falling behind). */
  gaps: string[];
  /**
   * The worst G3 figures over §12.4's route (OFF_ROUTE_SEGMENTS left out), each
   * with its segment, to hold against the G3 row the run was made for: default
   * window ≤ 2 % dropped and p99 ≤ 2 periods; maximised ≤ 5 %; 4× CPU, settled,
   * ≤ 10 % and p99 ≤ 50 ms. null where nothing was sampled.
   */
  g3: {
    dropped: { pct: number; segment: string } | null;
    p99: { ms: number; segment: string } | null;
    settledDropped: { pct: number; segment: string } | null;
    settledP99: { ms: number; segment: string } | null;
  };
}

/** The segment with the largest value of `read` (null values skipped), or null. */
const worst = (segments: readonly BenchSegmentReport[], read: (s: BenchSegmentReport) => number | null) => {
  let best: { value: number; segment: string } | null = null;
  for (const s of segments) {
    const value = read(s);
    if (value !== null && (best === null || value > best.value)) best = { value, segment: s.name };
  }
  return best;
};

export const benchVerdict = (segments: readonly BenchSegmentReport[]): BenchVerdict => {
  const route = segments.filter((s) => !OFF_ROUTE_SEGMENTS.includes(s.name));
  const dropped = worst(route, (s) => s.g3.droppedPct);
  const p99 = worst(route, (s) => s.g3.intervalP99);
  const settledDropped = worst(route, (s) => s.settled.droppedPct);
  const settledP99 = worst(route, (s) => s.settled.intervalP99);
  return {
    routeOk: segments.every((s) => s.ok),
    governorOk: segments.every((s) => s.governorChanges <= MAX_CHANGES_PER_SEGMENT),
    bytesOnMoves: segments.filter((s) => ZERO_BYTE_SEGMENTS.includes(s.name) && s.requests > 0).map((s) => s.name),
    longTasks: segments.filter((s) => s.longTasks.count > 0).map((s) => s.name),
    gaps: segments.filter((s) => s.g3.gaps > 0).map((s) => s.name),
    g3: {
      dropped: dropped && { pct: dropped.value, segment: dropped.segment },
      p99: p99 && { ms: p99.value, segment: p99.segment },
      settledDropped: settledDropped && { pct: settledDropped.value, segment: settledDropped.segment },
      settledP99: settledP99 && { ms: settledP99.value, segment: settledP99.segment },
    },
  };
};

/** Which segment a timestamp (performance.now() base) falls in: [start, end), the last one open-ended while running. */
export const segmentAt = <T extends { startMs: number; endMs: number }>(segments: readonly T[], t: number): T | null => {
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const s = segments[i];
    if (t >= s.startMs && (Number.isNaN(s.endMs) || t < s.endMs)) return s;
  }
  return null;
};
