import { ESTATE_TIERS, PIXEL_RATIO_STEPS, isEstateTier, tierRank, type EstateTier } from './tiers';

// Automatic quality control for the Estate engine (plan §7.9), as pure state.
// The engine (estate/engine/governor.ts) feeds one sample per continuously
// rendered frame and applies whatever notch this leaves it on; nothing here
// reads a clock, the GPU or the DOM. Tiers, pixel-ratio steps and the §7.7
// pixel-ratio rule (capPixelRatio) live in tiers.ts.
//
// Why a drop rate and not a frame-time budget: on a 60 Hz display a vsync-locked
// frame always measures 16.7 ms however light it is, so a "faster than budget"
// test can never step back up. Instead the display period P is estimated from
// the intervals themselves, a frame is dropped when it overruns 1.5 P, and
// headroom is read from CPU (and, where timer queries exist, GPU) time against P.
//
// The intervals alone cannot tell a slow display from a slow scene: a GPU that
// renders every other vsync on a 60 Hz panel measures 33.3 ms a frame, exactly
// a 30 Hz panel. So P is also held under a display floor (see calibrateDisplay):
// the period of frames that drew nothing, or failing that the lowest median the
// session has seen. A run of late frames never raises P by itself; only a fresh
// calibration does, which is how a window dragged to a slower monitor is told
// apart from a GPU falling behind.
//
// Time is injected: the governor's clock is the sum of the kept intervals it has
// been fed. A rest (no frames) or a run of excluded frames (upload, compile,
// resize) therefore pauses every timer — window, probe wait, trial, probation —
// rather than counting as clean time nobody measured. All times are ms.
//
// Allocation: governorSample() writes only into the state's typed arrays.

// ---- thresholds (plan §7.9) ---------------------------------------------------

/** Kept intervals the period median is taken over. */
export const PERIOD_SAMPLES = 90;
// 144 Hz (6.94 ms) is the fastest display the period may claim and 30 Hz the
// slowest: a faster panel reads as 144 Hz (drops are judged leniently there).
export const PERIOD_MIN_MS = 6.9;
export const PERIOD_MAX_MS = 33.4;
// Kept intervals the median needs before any frame is judged. Below this one
// odd interval moves it; 30 is ≤ 0.5 s at ≥ 60 Hz and happens once per engine,
// since the ring outlives rests.
export const PERIOD_WARMUP = 30;
/** A frame is dropped when its interval exceeds DROP_FACTOR · P. */
export const DROP_FACTOR = 1.5;
// P never exceeds the display floor by more than this, so a scene that misses
// every other vsync cannot become the period. rAF jitter on a fixed-rate panel
// is a few per cent; 15 % also absorbs a variable-rate panel's drift.
export const DISPLAY_SLACK = 1.15;
/** Frames the engine draws nothing in, to measure the display for calibrateDisplay. */
export const CALIBRATION_FRAMES = 8;

/** A window closes once it holds ≥ WINDOW_MS of kept time and ≥ WINDOW_FRAMES kept frames. */
export const WINDOW_MS = 2000;
export const WINDOW_FRAMES = 60;
/**
 * …or early, once it holds ≥ EARLY_WINDOW_MS and ≥ EARLY_WINDOW_FRAMES with
 * more than EARLY_DROP_SHARE of them dropped: an overload that plain (a device
 * drawing every third vsync drops ~90 %) needs no 60-frame verdict, and at 13
 * fps a full window took ~5 s per notch, past G3's "settled within 5 s". An
 * extension of §7.9.
 */
export const EARLY_WINDOW_MS = 1000;
export const EARLY_WINDOW_FRAMES = 20;
export const EARLY_DROP_SHARE = 0.5;
/**
 * A calibration this recent (kept time, ms) already answers "display or
 * scene?": a slow spell inside it is the scene's, without a new burst. The
 * engine calibrates in `loading`, so a device slow from its first live frame
 * steps down at once instead of waiting for a burst it should not draw mid-drag.
 */
export const RECENT_CALIBRATION_MS = 10_000;
// Backstop for the per-window CPU/GPU buffers: 1024 frames inside 2 s would
// need a 500 Hz display, so in practice the time rule always closes first.
export const WINDOW_CAP = 1024;
/** Step down when more than this share of a window's frames dropped. */
export const DROP_SHARE = 0.05;
/** …or when CPU p95 exceeds CPU_DOWN · P, or GPU p95 exceeds GPU_DOWN · P. */
export const CPU_DOWN = 0.7;
export const GPU_DOWN = 0.85;
// GPU p95 is only read from a window with at least this many timer results;
// EXT_disjoint_timer_query results arrive late and some come back disjoint.
export const GPU_MIN_READINGS = WINDOW_FRAMES / 2;

// A clean window has at most CLEAN_DROPS drops (§7.9 says 0; one stray late
// frame per 2 s, a GC pause or a compositor hitch, would otherwise restart the
// probe wait for good on a real page, so one transient cost quality for the rest
// of the session) and headroom on what the next notch up adds: CPU p95 <
// CPU_UP · P when that notch is a tier step (more triangles and draws to cull and
// submit), nothing more for a pixel-ratio step, which only adds fill. A window
// that is neither clean nor overloaded pauses the wait rather than restarting it.
export const CLEAN_DROPS = 1;
export const CPU_UP = 0.4;
// Not in the plan's text: where timer queries report, GPU p95 must be under the
// same 0.4 P to count as clean, for either kind of step. One notch costs up to
// 1.8× (pixel ratio 0.75 → 1 is 1.78× the pixels), so a GPU above ~0.47 P would
// trip GPU_DOWN straight after the probe and spend 4 s of dropped frames proving it.
export const GPU_UP = 0.4;
/** Clean time before the first probe; doubled by each failed probe up to the cap. */
export const PROBE_WAIT_MS = 8000;
export const PROBE_WAIT_MAX_MS = 64000;
/** A probe is reverted if more than DROP_SHARE of the frames in its first TRIAL_MS drop. */
export const TRIAL_MS = 4000;

// ---- notches ------------------------------------------------------------------

export interface GovernorNotch {
  readonly tier: EstateTier;
  /** A ceiling: the engine draws at tiers.capPixelRatio(tier, …, pixelRatio). */
  readonly pixelRatio: number;
}

/**
 * The quality ladder, best first. Notch 0 is the start; from there it walks
 * down alternately a pixel-ratio step (first, since fill rate is the cheapest
 * thing to give back) and a tier step, carrying on with whichever axis is left,
 * and ends at (min, 0.75). Only ratios below the start are used, so no notch
 * ever draws sharper than the engine began; a start that is not a step itself
 * (1.1) is kept as given, and one below 0.75 is the only ratio there is.
 */
export const buildLadder = (tier: EstateTier, pixelRatio: number): readonly GovernorNotch[] => {
  if (!isEstateTier(tier)) throw new RangeError(`Unknown estate tier "${String(tier)}"`);
  if (!(pixelRatio > 0) || !Number.isFinite(pixelRatio)) throw new RangeError(`Starting pixel ratio must be a positive number, got ${pixelRatio}`);
  const ratios = [pixelRatio, ...PIXEL_RATIO_STEPS.filter((step) => step < pixelRatio)];
  const tiers = ESTATE_TIERS.slice(tierRank(tier));
  const ladder: GovernorNotch[] = [Object.freeze({ tier: tiers[0], pixelRatio: ratios[0] })];
  let r = 0;
  let t = 0;
  let ratioTurn = true;
  while (r < ratios.length - 1 || t < tiers.length - 1) {
    if (r < ratios.length - 1 && (ratioTurn || t === tiers.length - 1)) r += 1;
    else t += 1;
    ratioTurn = !ratioTurn;
    ladder.push(Object.freeze({ tier: tiers[t], pixelRatio: ratios[r] }));
  }
  return Object.freeze(ladder);
};

// ---- samples and state --------------------------------------------------------

export interface GovernorSample {
  /** ms between this frame's rAF timestamp and the previous one's. */
  interval: number;
  /** ms of performance.now() around update and render. */
  cpuMs: number;
  /** ms from EXT_disjoint_timer_query_webgl2, for whichever query just resolved; absent or NaN when none did. */
  gpuMs?: number;
  /** The frame uploaded geometry, compiled a program or followed a resize. */
  excluded: boolean;
}

/** 'revert' is a step down that undoes a probe; the engine applies it as it does 'down'. */
export type GovernorDecision = 'hold' | 'down' | 'up' | 'revert';

export interface GovernorState {
  readonly ladder: readonly GovernorNotch[];
  /** Index into ladder; 0 is the start and the best the governor will ever use. */
  notch: number;
  /** Clamped median of the kept intervals, ms; NaN before the first. Frames are judged against judgedPeriod(). */
  period: number;
  /**
   * The display floor, ms: the last calibration, lowered by any warm median
   * below it; NaN until either exists. P is held under it × DISPLAY_SLACK.
   */
  displayMs: number;
  /**
   * Set when a window's median runs past DROP_FACTOR × the floor (its typical
   * frame is a drop): the engine should draw nothing for CALIBRATION_FRAMES
   * frames and hand their intervals to calibrateDisplay(). Asked once per slow
   * spell, since the pause shows (8 frames is 0.13 s at 60 Hz).
   */
  recalibrate: boolean;
  /** A calibration found the display unchanged while the scene ran slow; cleared once the median comes back. */
  slowConfirmed: boolean;
  /** Kept time since the last calibration, ms; Infinity before the first. */
  sinceCalibrationMs: number;
  /** Notch changes so far (the §12 route allows ≤ 2 per segment). */
  changes: number;
  /** The last closed window, for the debug readout and bench logs; NaN until one closes. */
  lastDropShare: number;
  lastCpuP95: number;
  lastGpuP95: number;
  /** Clean time a probe needs; doubles on each failure, back to 8 s once a probe holds. */
  waitMs: number;
  /** Clean time on this notch since it was reached or last overloaded. */
  cleanMs: number;
  /** In the TRIAL_MS after a probe. */
  trial: boolean;
  trialMs: number;
  trialFrames: number;
  trialDropped: number;
  // After a trial passes the notch stays on probation for one more wait: an
  // overload there is a late failure of the same probe, so it doubles the wait
  // too. Without it a marginal notch (4 % in its trial, 6 % after) would cycle
  // up and down every ~14 s for good. An extension of §7.9.
  probationMs: number;
  // Window accumulators.
  winMs: number;
  winFrames: number;
  winDropped: number;
  winCpuCount: number;
  winGpuCount: number;
  readonly winCpu: Float64Array;
  readonly winGpu: Float64Array;
  // Period ring (chronological) and the same values kept sorted, so the median
  // costs one O(90) insert per frame instead of a sort.
  readonly ring: Float64Array;
  readonly sorted: Float64Array;
  ringHead: number;
  ringCount: number;
}

export interface GovernorStart {
  tier: EstateTier;
  /** The §7.7 ratio the engine started at: tiers.capPixelRatio(tier, w, h, devicePixelRatio). */
  pixelRatio: number;
}

export const createGovernor = (start: GovernorStart): GovernorState => ({
  ladder: buildLadder(start.tier, start.pixelRatio),
  notch: 0,
  period: Number.NaN,
  displayMs: Number.NaN,
  recalibrate: false,
  slowConfirmed: false,
  sinceCalibrationMs: Infinity,
  changes: 0,
  lastDropShare: Number.NaN,
  lastCpuP95: Number.NaN,
  lastGpuP95: Number.NaN,
  waitMs: PROBE_WAIT_MS,
  cleanMs: 0,
  trial: false,
  trialMs: 0,
  trialFrames: 0,
  trialDropped: 0,
  probationMs: 0,
  winMs: 0,
  winFrames: 0,
  winDropped: 0,
  winCpuCount: 0,
  winGpuCount: 0,
  winCpu: new Float64Array(WINDOW_CAP),
  winGpu: new Float64Array(WINDOW_CAP),
  ring: new Float64Array(PERIOD_SAMPLES),
  sorted: new Float64Array(PERIOD_SAMPLES),
  ringHead: 0,
  ringCount: 0,
});

export const governorNotch = (state: GovernorState): GovernorNotch => state.ladder[state.notch];

/** The P frames are judged against: the median, held under the display floor × DISPLAY_SLACK. NaN before the first interval. */
export const judgedPeriod = (state: GovernorState): number =>
  state.displayMs > 0 ? Math.min(state.period, state.displayMs * DISPLAY_SLACK) : state.period;

// ---- statistics ---------------------------------------------------------------

/**
 * Nearest-rank percentile of values[0, n): the value at rank ceil(q·n). Reorders
 * that range in place (quickselect, middle pivot, so deterministic) rather than
 * allocating a sorted copy. NaN when n is 0.
 */
export const percentileInPlace = (values: Float64Array, n: number, q: number): number => {
  if (n <= 0) return Number.NaN;
  // The epsilon keeps 0.95 · 120 = 114 from ceiling to 115 on a rounding error.
  const k = Math.min(n - 1, Math.max(0, Math.ceil(q * n - 1e-9) - 1));
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const pivot = values[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (values[i] < pivot) i += 1;
      while (values[j] > pivot) j -= 1;
      if (i <= j) {
        const swap = values[i];
        values[i] = values[j];
        values[j] = swap;
        i += 1;
        j -= 1;
      }
    }
    // [lo, j] ≤ pivot ≤ [i, hi]; anything strictly between equals the pivot.
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return values[k];
  }
  return values[k];
};

const clampPeriod = (ms: number): number => Math.min(PERIOD_MAX_MS, Math.max(PERIOD_MIN_MS, ms));

const pushInterval = (s: GovernorState, interval: number) => {
  const sorted = s.sorted;
  let n = s.ringCount;
  if (n === PERIOD_SAMPLES) {
    // Drop the oldest from the sorted copy. Every value there came from the
    // ring, so the lower bound lands on an exact match.
    const oldest = s.ring[s.ringHead];
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < oldest) lo = mid + 1; else hi = mid;
    }
    sorted.copyWithin(lo, lo + 1, n);
    n -= 1;
    s.ring[s.ringHead] = interval;
    s.ringHead = (s.ringHead + 1) % PERIOD_SAMPLES;
  } else {
    s.ring[n] = interval; // head stays 0 until the ring is full
    s.ringCount = n + 1;
  }
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= interval) lo = mid + 1; else hi = mid;
  }
  sorted.copyWithin(lo + 1, lo, n);
  sorted[lo] = interval;
  const m = n + 1;
  const median = m & 1 ? sorted[m >> 1] : 0.5 * (sorted[(m >> 1) - 1] + sorted[m >> 1]);
  s.period = clampPeriod(median);
};

const resetWindow = (s: GovernorState) => {
  s.winMs = 0;
  s.winFrames = 0;
  s.winDropped = 0;
  s.winCpuCount = 0;
  s.winGpuCount = 0;
};

/**
 * Sets the display floor from frames that drew nothing (an empty rAF run of
 * CALIBRATION_FRAMES intervals): the engine runs one during warm-up in
 * `loading`, before any scene is drawn, and another whenever `recalibrate` is
 * set. This is the one way the floor can rise, so it is how a window moved to a
 * slower monitor is believed. Takes the clamped median of the positive finite
 * intervals; with none it keeps the floor it had. The open window is dropped:
 * its frames were judged against the old floor, and the calibration's own
 * frames drew nothing. Returns the floor (NaN while there is none). Allocates;
 * called rarely, never per frame.
 */
export const calibrateDisplay = (state: GovernorState, intervals: ArrayLike<number>): number => {
  const usable: number[] = [];
  for (let i = 0; i < intervals.length; i += 1) {
    const v = intervals[i];
    if (v > 0 && v < Infinity) usable.push(v);
  }
  if (usable.length > 0) {
    usable.sort((a, b) => a - b);
    const m = usable.length;
    state.displayMs = clampPeriod(m & 1 ? usable[m >> 1] : 0.5 * (usable[(m >> 1) - 1] + usable[m >> 1]));
  }
  state.recalibrate = false;
  state.sinceCalibrationMs = 0;
  resetWindow(state);
  // Still slow against the new floor: the scene, not the display. Do not ask
  // again until this spell ends.
  state.slowConfirmed = state.period > DROP_FACTOR * state.displayMs;
  return state.displayMs;
};

// ---- decisions ----------------------------------------------------------------

// Every notch change starts the measurements afresh: what was measured belongs
// to the notch just left.
const moveTo = (s: GovernorState, notch: number) => {
  s.notch = notch;
  s.changes += 1;
  resetWindow(s);
  s.cleanMs = 0;
  s.probationMs = 0;
  s.trial = false;
  s.trialMs = 0;
  s.trialFrames = 0;
  s.trialDropped = 0;
};

const revert = (s: GovernorState): GovernorDecision => {
  s.waitMs = Math.min(2 * s.waitMs, PROBE_WAIT_MAX_MS);
  moveTo(s, Math.min(s.notch + 1, s.ladder.length - 1));
  return 'revert';
};

const closeWindow = (s: GovernorState, period: number): GovernorDecision => {
  const elapsed = s.winMs;
  const dropped = s.winDropped;
  const dropShare = dropped / s.winFrames;
  const cpuP95 = percentileInPlace(s.winCpu, s.winCpuCount, 0.95);
  const gpuP95 = s.winGpuCount >= GPU_MIN_READINGS ? percentileInPlace(s.winGpu, s.winGpuCount, 0.95) : Number.NaN;
  s.lastDropShare = dropShare;
  s.lastCpuP95 = cpuP95;
  s.lastGpuP95 = gpuP95;
  resetWindow(s);

  // The typical frame is itself a drop against the floor: the scene fell
  // behind, or the display got slower. Only a calibration can tell which, and
  // a recent one already has.
  if (s.period > DROP_FACTOR * s.displayMs) {
    if (!s.slowConfirmed) {
      if (s.sinceCalibrationMs < RECENT_CALIBRATION_MS) s.slowConfirmed = true;
      else s.recalibrate = true;
    }
  } else {
    s.slowConfirmed = false;
  }

  // NaN compares false: a window with no CPU readings never overloads on CPU.
  if (dropShare > DROP_SHARE || cpuP95 > CPU_DOWN * period || gpuP95 > GPU_DOWN * period) {
    s.cleanMs = 0;
    if (s.notch === s.ladder.length - 1) return 'hold';
    if (s.trial || s.probationMs > 0) return revert(s);
    moveTo(s, s.notch + 1);
    return 'down';
  }
  if (s.trial) return 'hold';
  if (s.probationMs > 0) {
    s.probationMs -= elapsed;
    if (s.probationMs <= 0) {
      s.probationMs = 0;
      s.waitMs = PROBE_WAIT_MS;
    }
  }
  if (s.notch === 0) return 'hold';
  // Headroom for the notch above: a tier step needs CPU room, and either step
  // GPU room where timers report. A window with no CPU readings is not clean.
  const tierStep = s.ladder[s.notch - 1].tier !== s.ladder[s.notch].tier;
  const cpuRoom = tierStep ? cpuP95 < CPU_UP * period : !Number.isNaN(cpuP95);
  const clean = dropped <= CLEAN_DROPS && cpuRoom && !(gpuP95 >= GPU_UP * period);
  if (!clean) return 'hold'; // and not overloaded either: the wait pauses
  s.cleanMs = Math.min(s.cleanMs + elapsed, PROBE_WAIT_MAX_MS);
  if (s.cleanMs >= s.waitMs) {
    moveTo(s, s.notch - 1);
    s.trial = true;
    return 'up';
  }
  return 'hold';
};

/**
 * Feed one frame; returns what changed. Call only for frames that directly
 * follow another (frameLoop's beginFrame() says so): the first frame after a
 * rest carries the whole rest in its interval. Excluded frames, and intervals
 * that are not a positive finite number, are ignored outright — they move no
 * estimate, counter or timer.
 *
 * Step down at the end of a window if > 5 % dropped, CPU p95 > 0.7 P or GPU p95
 * > 0.85 P. Step up after `waitMs` of clean windows; the probe is reverted if
 * > 5 % of its first 4 s drop — as soon as more drops have happened than 5 % of
 * a full trial at P could absorb, not only at the 4 s mark.
 */
export const governorSample = (s: GovernorState, sample: GovernorSample): GovernorDecision => {
  const interval = sample.interval;
  if (sample.excluded || !(interval > 0) || interval === Infinity) return 'hold';
  pushInterval(s, interval);
  if (s.ringCount < PERIOD_WARMUP) return 'hold';
  // A warm median below the floor lowers it: a faster display, or the first
  // estimate of the display when no calibration has run. It never raises it.
  if (!(s.displayMs <= s.period)) s.displayMs = s.period;
  const period = judgedPeriod(s);
  const dropped = interval > DROP_FACTOR * period;

  s.winMs += interval;
  s.winFrames += 1;
  s.sinceCalibrationMs += interval;
  if (dropped) s.winDropped += 1;
  const cpu = sample.cpuMs;
  if (cpu >= 0 && cpu < Infinity) s.winCpu[s.winCpuCount++] = cpu;
  const gpu = sample.gpuMs;
  if (gpu !== undefined && gpu >= 0 && gpu < Infinity) s.winGpu[s.winGpuCount++] = gpu;

  if (s.trial) {
    s.trialMs += interval;
    s.trialFrames += 1;
    if (dropped) s.trialDropped += 1;
    if (s.trialDropped > DROP_SHARE * (TRIAL_MS / period)) return revert(s);
    if (s.trialMs >= TRIAL_MS && s.trialFrames >= WINDOW_FRAMES) {
      if (s.trialDropped > DROP_SHARE * s.trialFrames) return revert(s);
      s.trial = false;
      s.probationMs = s.waitMs;
    }
  }

  if ((s.winMs >= WINDOW_MS && s.winFrames >= WINDOW_FRAMES) || s.winFrames >= WINDOW_CAP) return closeWindow(s, period);
  // Not while a calibration is owed: until it lands, a slow display and a slow
  // scene look the same, and the full window is the cautious verdict.
  if (!s.recalibrate && s.winMs >= EARLY_WINDOW_MS && s.winFrames >= EARLY_WINDOW_FRAMES && s.winDropped > EARLY_DROP_SHARE * s.winFrames) return closeWindow(s, period);

  return 'hold';

};

// ---- starting tier (plan §7.9 table) --------------------------------------------

// Patterns are tried in this order; the strings are UNMASKED_RENDERER_WEBGL as
// browsers report it, e.g. "ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917)
// Direct3D11 vs_5_0 ps_5_0, D3D11)" in Chrome, "Mesa Intel(R) Xe Graphics (TGL
// GT2)" on Linux, "Apple M1" in Firefox on a Mac.
const SOFTWARE = /swiftshader|llvmpipe|lavapipe|softpipe|basic render|basic display|software render|software rasterizer/i;
const NVIDIA = /nvidia|geforce|quadro|\brtx\b|\bgtx\b/i;
// Discrete Arc has a model number (A770, B580, Pro A60); Meteor Lake's
// integrated GPU is plain "Intel(R) Arc(TM) Graphics", and Lunar Lake's "Arc 140V".
const ARC_DISCRETE = /\barc(?:\s*\(tm\))?\s+(?:pro\s+)?[ab]\d{2,3}\b/i;
// RX, Pro, R9 and VII are discrete. "Radeon(TM) Graphics", "Vega 8 Graphics",
// "780M" are APUs, and an old "HD 7970" is too ambiguous to call high.
const RADEON_DISCRETE = /radeon(?:\s*\(tm\))?\s+(?:rx|pro|r9|vii)\b/i;
const INTEGRATED_MID = /\biris\b|\bxe\b|\barc\b|\bapple\s+m\d|radeon/i;
const INTEL = /intel/i;

/** The table's row for a renderer string; null when it names nothing the table knows ("Apple GPU", "Mozilla", ""). */
export const classifyRenderer = (renderer: string | null | undefined): EstateTier | null => {
  if (typeof renderer !== 'string' || !renderer.trim()) return null;
  if (SOFTWARE.test(renderer)) return 'min';
  if (NVIDIA.test(renderer) || ARC_DISCRETE.test(renderer) || RADEON_DISCRETE.test(renderer)) return 'high';
  if (INTEGRATED_MID.test(renderer)) return 'mid';
  // UHD/HD and any other Intel part that is not Iris, Xe or Arc.
  if (INTEL.test(renderer)) return 'low';
  return null;
};

/** `?estate-quality=` → a tier, case-insensitive; anything else is no override. */
export const parseQualityOverride = (raw: unknown): EstateTier | null => {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return isEstateTier(value) ? value : null;
};

/**
 * The tier the engine starts at. An override wins outright (the e2e runs at
 * ?estate-quality=min on SwiftShader). Otherwise the renderer's row, mid when
 * unknown, then one tier lower when navigator.deviceMemory reports < 4 GB
 * (Chrome only; absent elsewhere, which changes nothing).
 */
export const startingTier = (
  renderer: string | null | undefined, deviceMemory?: number | null, override?: string | null,
): EstateTier => {
  const forced = parseQualityOverride(override);
  if (forced) return forced;
  const rank = tierRank(classifyRenderer(renderer) ?? 'mid');
  const lower = typeof deviceMemory === 'number' && deviceMemory < 4 ? 1 : 0;
  return ESTATE_TIERS[Math.min(ESTATE_TIERS.length - 1, rank + lower)];
};
