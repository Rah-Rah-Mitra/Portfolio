import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_FRAMES, CLEAN_DROPS, CPU_DOWN, CPU_UP, DISPLAY_SLACK, DROP_FACTOR, GPU_DOWN, PERIOD_MAX_MS, PERIOD_MIN_MS,
  PERIOD_SAMPLES, PERIOD_WARMUP, PROBE_WAIT_MAX_MS, PROBE_WAIT_MS, TRIAL_MS, WINDOW_FRAMES, WINDOW_MS, buildLadder,
  calibrateDisplay, classifyRenderer, createGovernor, governorNotch, governorSample, judgedPeriod, parseQualityOverride,
  percentileInPlace, startingTier, type GovernorDecision, type GovernorSample, type GovernorState,
} from '../lib/estate/governorCore';
import { ESTATE_TIERS, PIXEL_RATIO_STEPS, tierRank, type EstateTier } from '../lib/estate/tiers';

// The quality governor of plan §7.9, driven by synthetic frame streams. Time is
// the sum of the intervals fed, so a "60 s" test is 3,600 calls and no waiting.

const HZ60 = 1000 / 60;
const HZ144 = 1000 / 144;

// Deterministic jitter: mulberry32, as tests/estate-frames.test.ts.
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const sample = (interval: number, cpuMs = 2, gpuMs?: number, excluded = false): GovernorSample => ({ interval, cpuMs, gpuMs, excluded });

/** Feeds n identical frames; returns every decision that was not 'hold'. */
const feed = (s: GovernorState, n: number, frame: GovernorSample): GovernorDecision[] => {
  const out: GovernorDecision[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = governorSample(s, frame);
    if (d !== 'hold') out.push(d);
  }
  return out;
};

// The 30th kept interval is the first one judged, so 29 leave the window empty.
const warm = (s: GovernorState, period = HZ60) => feed(s, PERIOD_WARMUP - 1, sample(period));

interface Load {
  /** Share of frames that take two periods, spread evenly. */
  drops: number;
  cpu: number;
  gpu?: number;
}
interface Change { t: number; decision: GovernorDecision; notch: number; wait: number }

/**
 * Runs `ms` of rendering at `period`, asking `load` for each frame's cost given
 * the notch and the time since the last change. Returns the notch changes with
 * the governor clock (kept ms) they happened at.
 */
const simulate = (
  s: GovernorState, ms: number, load: (notch: number, sinceChange: number) => Load, period = HZ60, start = 0,
): Change[] => {
  const changes: Change[] = [];
  const frame = sample(period);
  let t = start;
  let lastChange = start;
  let i = 0;
  while (t < start + ms) {
    const l = load(s.notch, t - lastChange);
    const drop = Math.floor((i + 1) * l.drops) > Math.floor(i * l.drops);
    frame.interval = drop ? 2 * period : period;
    frame.cpuMs = l.cpu;
    frame.gpuMs = l.gpu;
    const decision = governorSample(s, frame);
    t += frame.interval;
    i += 1;
    if (decision !== 'hold') {
      changes.push({ t, decision, notch: s.notch, wait: s.waitMs });
      lastChange = t;
    }
  }
  return changes;
};

/** Feeds frames until `count` windows have closed (a notch change empties one too); returns the decisions that were not 'hold'. */
const closeWindows = (s: GovernorState, count: number, frame: (i: number) => GovernorSample): GovernorDecision[] => {
  const out: GovernorDecision[] = [];
  let closed = 0;
  for (let i = 0; closed < count; i += 1) {
    if (i > 100_000) throw new Error('no window closed');
    const before = s.winFrames;
    const d = governorSample(s, frame(i));
    if (d !== 'hold') out.push(d);
    if (before > 0 && s.winFrames === 0) closed += 1;
  }
  return out;
};

/** A 60 Hz scene where every fifth frame misses a vsync, until the governor steps down once. */
const downOnce = (s: GovernorState) => {
  const notch = s.notch;
  for (let i = 0; s.notch === notch; i += 1) {
    if (i > 10_000) throw new Error('never stepped down');
    governorSample(s, sample(i % 5 === 4 ? 2 * HZ60 : HZ60, 3));
  }
};

const LIGHT: Load = { drops: 0, cpu: 3 };
const HEAVY: Load = { drops: 0.2, cpu: 3 };

describe('display period', () => {
  it('estimates 60 Hz from jittered intervals with drops in them', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    const r = rng(7);
    for (let i = 0; i < 600; i += 1) {
      const base = i % 33 === 32 ? 2 * HZ60 : HZ60;
      governorSample(s, sample(base + (r() - 0.5)));
    }
    expect(Math.abs(s.period - HZ60)).toBeLessThan(0.2);
  });

  it('estimates 144 Hz, and judges drops against it rather than against 60 Hz', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    const r = rng(11);
    for (let i = 0; i < 600; i += 1) governorSample(s, sample(HZ144 + 0.6 * (r() - 0.5)));
    expect(Math.abs(s.period - HZ144)).toBeLessThan(0.1);
    // A 13.9 ms frame is one missed vsync at 144 Hz (> 1.5 · 6.94 = 10.4) but
    // would pass for a normal frame at 60 Hz.
    const before = s.winDropped;
    governorSample(s, sample(2 * HZ144));
    expect(s.winDropped).toBe(before + 1);
    governorSample(s, sample(1.4 * HZ144));
    expect(s.winDropped).toBe(before + 1);
  });

  it('follows the window to another display within half the ring', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    feed(s, PERIOD_SAMPLES, sample(HZ60));
    feed(s, PERIOD_SAMPLES / 2 - 1, sample(HZ144));
    expect(s.period).toBeGreaterThan(10); // the median straddles the two
    feed(s, 2, sample(HZ144));
    expect(s.period).toBeCloseTo(HZ144, 9);
  });

  it('clamps to 6.9–33.4 ms', () => {
    const fast = createGovernor({ tier: 'high', pixelRatio: 2 });
    feed(fast, 120, sample(1000 / 240));
    expect(fast.period).toBe(PERIOD_MIN_MS);
    const slow = createGovernor({ tier: 'high', pixelRatio: 2 });
    feed(slow, 120, sample(50));
    expect(slow.period).toBe(PERIOD_MAX_MS);
  });

  it('takes the median of the last 90 kept intervals exactly', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    const r = rng(3);
    const all: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      const x = 10 + 15 * r();
      all.push(x);
      governorSample(s, sample(x));
      const last = all.slice(-PERIOD_SAMPLES).sort((a, b) => a - b);
      const m = last.length;
      const median = m % 2 ? last[(m - 1) / 2] : (last[m / 2 - 1] + last[m / 2]) / 2;
      expect(s.period).toBe(Math.min(PERIOD_MAX_MS, Math.max(PERIOD_MIN_MS, median)));
    }
  });

  it('judges no frame until 30 kept intervals have warmed the estimate', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    feed(s, PERIOD_WARMUP - 1, sample(3 * HZ60));
    expect(s.winFrames).toBe(0);
    governorSample(s, sample(HZ60));
    expect(s.winFrames).toBe(1);
  });
});

describe('display floor', () => {
  // The intervals alone cannot tell a GPU that misses every other vsync on a
  // 60 Hz panel from a 30 Hz panel: both measure 33.3 ms. The floor can.

  it('steps down a scene stuck at 30 fps on a 60 Hz display, though its intervals look like a 30 Hz panel', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    feed(s, PERIOD_SAMPLES, sample(HZ60));
    expect(s.displayMs).toBeCloseTo(HZ60, 9);
    // The scene turns heavy: every frame now misses one vsync, at a light CPU.
    const out = feed(s, 300, sample(2 * HZ60, 4));
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.every((d) => d === 'down')).toBe(true);
    // The median took the slow interval; the frames are judged against the floor.
    expect(s.period).toBeCloseTo(2 * HZ60, 9);
    expect(judgedPeriod(s)).toBeCloseTo(HZ60 * DISPLAY_SLACK, 9);
  });

  it('steps down at a steady 20 fps, which the 33.4 ms clamp alone would read as a slow display', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    feed(s, PERIOD_SAMPLES, sample(HZ60));
    const out = feed(s, 200, sample(50, 4));
    expect(out[0]).toBe('down');
    expect(out.every((d) => d === 'down')).toBe(true);
  });

  it('steps down with 60 % of frames late from the first frame, given the warm-up calibration', () => {
    // Without one, a scene slow from its first frame is the session's only
    // evidence, and it reads as a 30 Hz display: the reason the engine calibrates in loading.
    const blind = createGovernor({ tier: 'high', pixelRatio: 2 });
    expect(simulate(blind, 20_000, () => ({ drops: 1, cpu: 3 }))).toEqual([]);
    expect(blind.displayMs).toBeCloseTo(2 * HZ60, 9);

    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    expect(calibrateDisplay(s, Array.from({ length: CALIBRATION_FRAMES }, (_, i) => HZ60 + (i % 2 ? 0.3 : -0.3)))).toBeCloseTo(HZ60, 9);
    const changes = simulate(s, 4_000, () => ({ drops: 0.6, cpu: 3 }));
    expect(changes[0]?.decision).toBe('down');
    expect(changes[0].t).toBeLessThan(3_000);
  });

  it('believes a slower display only from a calibration: a window dragged to a 30 Hz monitor', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    feed(s, PERIOD_SAMPLES, sample(HZ60));
    expect(s.recalibrate).toBe(false);
    // Light frames, every one 33.3 ms: drops against the 60 Hz floor until measured.
    const before = feed(s, 120, sample(2 * HZ60, 3));
    expect(before).toEqual(['down', 'down']);
    expect(s.recalibrate).toBe(true);
    // The engine draws nothing for a few frames: the panel really is slower.
    expect(calibrateDisplay(s, new Array(CALIBRATION_FRAMES).fill(2 * HZ60))).toBeCloseTo(2 * HZ60, 9);
    expect(s.recalibrate).toBe(false);
    expect(s.slowConfirmed).toBe(false);
    expect(judgedPeriod(s)).toBeCloseTo(2 * HZ60, 9);
    // Now the same frames are clean, and it probes back to the start.
    const after = simulate(s, 40_000, () => LIGHT, 2 * HZ60);
    expect(after.map((c) => c.decision)).toEqual(['up', 'up']);
    expect(s.notch).toBe(0);
  });

  it('asks once per slow spell when a calibration finds the display unchanged', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    feed(s, PERIOD_SAMPLES, sample(HZ60));
    feed(s, 120, sample(2 * HZ60, 3));
    expect(s.recalibrate).toBe(true);
    // The display is still 60 Hz: the scene is slow. No second request this spell.
    calibrateDisplay(s, new Array(CALIBRATION_FRAMES).fill(HZ60));
    expect(s.displayMs).toBeCloseTo(HZ60, 9);
    expect(s.slowConfirmed).toBe(true);
    feed(s, 600, sample(2 * HZ60, 3));
    expect(s.recalibrate).toBe(false);
    // The spell ends (frames back on time), and a later one asks again.
    feed(s, 300, sample(HZ60, 3));
    expect(s.slowConfirmed).toBe(false);
    feed(s, 200, sample(2 * HZ60, 3));
    expect(s.recalibrate).toBe(true);
  });

  it('follows a faster display down without a calibration, and keeps the last floor when one has nothing usable', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    feed(s, PERIOD_SAMPLES, sample(HZ60));
    feed(s, PERIOD_SAMPLES, sample(HZ144));
    expect(s.displayMs).toBeCloseTo(HZ144, 9);
    expect(calibrateDisplay(s, [0, -1, Number.NaN, Infinity])).toBeCloseTo(HZ144, 9);
    expect(calibrateDisplay(s, [5, 5, 5])).toBe(PERIOD_MIN_MS);
  });
});

describe('drops and excluded frames', () => {
  it('counts a frame as dropped only past 1.5 periods', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    warm(s);
    governorSample(s, sample(DROP_FACTOR * HZ60 - 0.01));
    expect(s.winDropped).toBe(0);
    governorSample(s, sample(DROP_FACTOR * HZ60 + 0.01));
    expect(s.winDropped).toBe(1);
    expect(s.winFrames).toBe(2);
  });

  it('ignores excluded frames entirely: no estimate, counter, timer or decision moves', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    warm(s);
    const snapshot = JSON.stringify(s);
    // Shader compiles and uploads: half-second stalls at full CPU, flagged.
    expect(feed(s, 500, sample(500, 400, 300, true))).toEqual([]);
    // Nonsense intervals are dropped the same way.
    for (const bad of [0, -5, Number.NaN, Infinity]) expect(governorSample(s, sample(bad, 400))).toBe('hold');
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('makes the same decisions with and without excluded frames interleaved', () => {
    const load = (notch: number): Load => (notch === 0 ? HEAVY : LIGHT);
    const plain = createGovernor({ tier: 'high', pixelRatio: 2 });
    const mixed = createGovernor({ tier: 'high', pixelRatio: 2 });
    const changes = simulate(plain, 60_000, load);
    expect(changes.length).toBeGreaterThan(2);
    // The same stream with a stall after every 7th frame.
    const frame = sample(HZ60);
    const stall = sample(250, 200, 100, true);
    const seen: GovernorDecision[] = [];
    let t = 0;
    for (let i = 0; t < 60_000; i += 1) {
      const l = load(mixed.notch);
      const drop = Math.floor((i + 1) * l.drops) > Math.floor(i * l.drops);
      frame.interval = drop ? 2 * HZ60 : HZ60;
      frame.cpuMs = l.cpu;
      const d = governorSample(mixed, frame);
      if (d !== 'hold') seen.push(d);
      t += frame.interval;
      if (i % 7 === 6) expect(governorSample(mixed, stall)).toBe('hold');
    }
    expect(seen).toEqual(changes.map((c) => c.decision));
    expect(mixed.notch).toBe(plain.notch);
    expect(mixed.waitMs).toBe(plain.waitMs);
  });
});

describe('stepping down', () => {
  // 62.5 Hz keeps the window sums exact: 125 frames of 16 ms is 2,000 ms.
  const P = 16;
  const firstWindow = (dropEvery: number, cpu: (i: number) => number, gpu?: (i: number) => number | undefined) => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    warm(s, P);
    for (let i = 0; i < 400; i += 1) {
      const d = governorSample(s, sample(dropEvery && i % dropEvery === dropEvery - 1 ? 2 * P : P, cpu(i), gpu?.(i)));
      if (s.lastDropShare === s.lastDropShare) return { s, d }; // the first window has closed
    }
    throw new Error('no window closed');
  };

  it('closes a window at ≥ 2 s and ≥ 60 kept frames', () => {
    const { s } = firstWindow(0, () => 2);
    expect(s.lastDropShare).toBe(0);
    expect(s.winFrames).toBe(0);
    // At 25 fps the frame count rules: 59 frames are already 2.36 s.
    const slow = createGovernor({ tier: 'high', pixelRatio: 2 });
    warm(slow, 40);
    feed(slow, WINDOW_FRAMES - 1, sample(40));
    expect(slow.winMs).toBeGreaterThan(WINDOW_MS);
    expect(slow.lastDropShare).toBeNaN();
    governorSample(slow, sample(40));
    expect(slow.lastDropShare).toBe(0);
    expect(slow.period).toBe(PERIOD_MAX_MS);
  });

  it('steps down when more than 5 % of a window dropped, and holds at 5 % or less', () => {
    for (const every of [8, 10, 16, 19, 20, 21, 25, 40]) {
      const { s, d } = firstWindow(every, () => 2);
      expect(d, `1 in ${every}: ${s.lastDropShare}`).toBe(s.lastDropShare > 0.05 ? 'down' : 'hold');
      expect(s.notch).toBe(d === 'down' ? 1 : 0);
    }
    expect(firstWindow(16, () => 2).d).toBe('down');
    // 1 in 20 is exactly 5 %, which is not more than 5 %.
    const { s, d } = firstWindow(20, () => 2);
    expect(s.lastDropShare).toBe(0.05);
    expect(d).toBe('hold');
  });

  it('steps down on CPU p95 above 0.7 P with no frame dropped', () => {
    const over = CPU_DOWN * P + 0.5;
    // 125 frames: nearest-rank p95 is the 119th, so 7 slow frames set it and 6 do not.
    const slow7 = firstWindow(0, (i) => (i % 125 < 7 ? over : 3));
    expect(slow7.s.lastCpuP95).toBe(over);
    expect(slow7.d).toBe('down');
    const slow6 = firstWindow(0, (i) => (i % 125 < 6 ? over : 3));
    expect(slow6.s.lastCpuP95).toBe(3);
    expect(slow6.d).toBe('hold');
  });

  it('steps down on GPU p95 above 0.85 P where timer queries report, and only then', () => {
    const over = GPU_DOWN * P + 0.5;
    expect(firstWindow(0, () => 3, (i) => (i % 10 === 0 ? over : 5)).d).toBe('down');
    expect(firstWindow(0, () => 3, () => GPU_DOWN * P - 0.5).d).toBe('hold');
    // No timer results (Firefox), or too few to read a p95 from: ignored.
    expect(firstWindow(0, () => 3).s.lastGpuP95).toBeNaN();
    const sparse = firstWindow(0, () => 3, (i) => (i % 5 === 0 ? over : undefined));
    expect(sparse.s.lastGpuP95).toBeNaN();
    expect(sparse.d).toBe('hold');
  });

  it('holds at the bottom notch however bad it gets', () => {
    const s = createGovernor({ tier: 'min', pixelRatio: 0.75 });
    expect(s.ladder).toHaveLength(1);
    expect(simulate(s, 20_000, () => ({ drops: 0.3, cpu: 30 }))).toEqual([]);
    expect(s.notch).toBe(0);
  });
});

describe('stepping up by probing', () => {
  it('recovers to the start at 60 Hz, where every frame is vsync-locked at 16.7 ms', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    // A dense scene walks it down four notches; there the scene turns light,
    // still at exactly 60 Hz, and stays light at every notch.
    let light = false;
    const changes = simulate(s, 120_000, (notch) => {
      if (notch === 4) light = true;
      return light ? LIGHT : HEAVY;
    });
    expect(changes.map((c) => c.decision)).toEqual(['down', 'down', 'down', 'down', 'up', 'up', 'up', 'up']);
    expect(s.notch).toBe(0);
    const down = changes.slice(0, 4);
    const up = changes.slice(4);
    // The first probe waits 8 s of clean windows; each next one also sits out
    // the 4 s trial and its 8 s probation.
    let last = down[down.length - 1].t;
    for (const [i, change] of up.entries()) {
      const gap = change.t - last;
      const least = i === 0 ? PROBE_WAIT_MS : TRIAL_MS + PROBE_WAIT_MS;
      expect(gap).toBeGreaterThanOrEqual(least - 1e-6); // sums of 16.67 ms in another order
      expect(gap).toBeLessThan(least + 2 * WINDOW_MS + 100);
      last = change.t;
    }
    expect(s.waitMs).toBe(PROBE_WAIT_MS);
    // At the start it stays: there is nothing above notch 0.
    expect(simulate(s, 60_000, () => LIGHT, HZ60, 200_000)).toEqual([]);
  });

  it('lets a stray late frame through: a window with one drop still counts as clean', () => {
    expect(CLEAN_DROPS).toBe(1);
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    downOnce(s);
    expect(s.notch).toBe(1);
    // One late frame every 5 s, a GC pause or a compositor hitch: still back up
    // after 8 s, plus up to two windows straddling the change of load.
    const changes = simulate(s, 14_000, () => ({ drops: 1 / 300, cpu: 3 }));
    expect(changes.map((c) => c.decision)).toEqual(['up']);
    expect(changes[0].t).toBeLessThan(PROBE_WAIT_MS + 2 * WINDOW_MS + 100);
  });

  it('recovers from a heavy transient under sparse jitter, rather than keeping the session at a lower notch', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    const down = simulate(s, 5_000, () => HEAVY);
    expect(down.map((c) => c.decision)).toEqual(['down', 'down']);
    const back = simulate(s, 120_000, () => ({ drops: 1 / 300, cpu: 3 }), HZ60, 5_000);
    expect(back.map((c) => c.decision)).toEqual(['up', 'up']);
    expect(s.notch).toBe(0);
    expect(back[1].t).toBeLessThan(5_000 + 2 * PROBE_WAIT_MS + TRIAL_MS + 4 * WINDOW_MS);
  });

  it('pauses the wait through windows that are neither clean nor overloaded, rather than restarting it', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    downOnce(s);
    // 6 s of clean windows count towards the 8 s wait.
    expect(closeWindows(s, 3, () => sample(HZ60, 3))).toEqual([]);
    expect(s.cleanMs).toBeGreaterThanOrEqual(6_000 - 1e-6);
    const banked = s.cleanMs;
    // Three late frames a window (2.6 %): too many to be clean, too few to step
    // down. A minute of them leaves the banked time where it was.
    expect(closeWindows(s, 30, (i) => sample(i % 40 === 39 ? 2 * HZ60 : HZ60, 3))).toEqual([]);
    expect(s.cleanMs).toBe(banked);
    // One more clean window completes the wait.
    expect(closeWindows(s, 1, () => sample(HZ60, 3))).toEqual(['up']);
  });

  it('asks for CPU room only before a tier step, and GPU room (where timers report) before either', () => {
    // From (high, 2): notch 1 is high@1.75, a pixel-ratio step below notch 0;
    // notch 2 is mid@1.75, a tier step below notch 1.
    const ratioStep = createGovernor({ tier: 'high', pixelRatio: 2 });
    downOnce(ratioStep);
    expect(ratioStep.ladder[0].tier).toBe(ratioStep.ladder[1].tier);
    // CPU p95 at 0.5 P: fill rate is all a pixel-ratio step adds, so it probes.
    expect(CPU_UP * HZ60).toBeLessThan(0.5 * HZ60);
    expect(simulate(ratioStep, 14_000, () => ({ drops: 0, cpu: 0.5 * HZ60 })).map((c) => c.decision)).toEqual(['up']);

    const tierStep = createGovernor({ tier: 'high', pixelRatio: 2 });
    downOnce(tierStep);
    downOnce(tierStep);
    expect(tierStep.ladder[1].tier).not.toBe(tierStep.ladder[2].tier);
    // The same CPU at a tier step: not overloaded, not idle enough to add triangles and draws.
    expect(simulate(tierStep, 60_000, () => ({ drops: 0, cpu: 0.5 * HZ60 }))).toEqual([]);
    expect(simulate(tierStep, 14_000, () => LIGHT).map((c) => c.decision)).toEqual(['up']);

    // GPU p95 at 0.5 P blocks either step (the GPU_UP extension): one notch can
    // cost 1.8× the fill, which would trip GPU_DOWN straight after the probe.
    const gpu = createGovernor({ tier: 'high', pixelRatio: 2 });
    downOnce(gpu);
    expect(simulate(gpu, 60_000, () => ({ drops: 0, cpu: 3, gpu: 0.5 * HZ60 }))).toEqual([]);
    expect(simulate(gpu, 14_000, () => ({ drops: 0, cpu: 3, gpu: 0.3 * HZ60 })).map((c) => c.decision)).toEqual(['up']);
  });

  it('reverts a failed probe and doubles the wait: 8 → 16 → 32 → 64 s, then holds at 64', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    // The start is too heavy for this machine; one notch down is fine.
    const changes = simulate(s, 400_000, (notch) => (notch === 0 ? HEAVY : LIGHT));
    expect(changes[0].decision).toBe('down');
    const rest = changes.slice(1);
    expect(rest.map((c) => c.decision)).toEqual(Array.from({ length: rest.length }, (_, i) => (i % 2 ? 'revert' : 'up')));
    const reverts = rest.filter((c) => c.decision === 'revert');
    expect(reverts.length).toBeGreaterThanOrEqual(5);
    expect(reverts.map((c) => c.wait)).toEqual(reverts.map((_, i) => Math.min(PROBE_WAIT_MS * 2 ** (i + 1), PROBE_WAIT_MAX_MS)));
    expect(reverts.slice(0, 4).map((c) => c.wait)).toEqual([16_000, 32_000, 64_000, 64_000]);
    // Each probe waited the wait in force, and each failure was cut short.
    let wait = PROBE_WAIT_MS;
    let since = changes[0].t;
    for (let i = 0; i < rest.length; i += 2) {
      const probe = rest[i];
      const failed = rest[i + 1];
      expect(probe.t - since).toBeGreaterThanOrEqual(wait - 1e-6);
      expect(probe.t - since).toBeLessThan(wait + 2 * WINDOW_MS + 100);
      if (!failed) break;
      expect(failed.t - probe.t).toBeLessThan(WINDOW_MS);
      wait = failed.wait;
      since = failed.t;
    }
  });

  it('reverts as soon as a trial cannot pass, before its 4 s are up', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    const [down, up, revert] = simulate(s, 20_000, (notch) => (notch === 0 ? { drops: 0.3, cpu: 3 } : LIGHT));
    expect([down.decision, up.decision, revert.decision]).toEqual(['down', 'up', 'revert']);
    // 5 % of a 4 s trial at 60 Hz is 12 frames; the 13th drop ends it, ~0.9 s
    // in at 30 % drops — well before the first window could close at 2 s.
    expect(revert.t - up.t).toBeLessThan(1200);
  });

  it('keeps a probe that passes its trial, and resets the wait once it survives probation', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    let heavyUntil = 60_000;
    let t = 0;
    const step = (ms: number) => {
      const out = simulate(s, ms, (notch) => (notch === 0 && t < heavyUntil ? HEAVY : LIGHT), HZ60, t);
      t += ms;
      return out;
    };
    step(60_000);
    expect(s.waitMs).toBe(32_000);
    heavyUntil = 0; // the scene lightens
    const changes = step(50_000);
    expect(changes.map((c) => c.decision)).toEqual(['up']);
    expect(s.notch).toBe(0);
    expect(s.trial).toBe(false);
    // Probation lasts one wait (32 s) of kept time after the 4 s trial.
    expect(s.waitMs).toBe(PROBE_WAIT_MS);
    expect(s.probationMs).toBe(0);
  });

  it('treats an overload during probation as a late failure of the probe', () => {
    const s = createGovernor({ tier: 'high', pixelRatio: 2 });
    simulate(s, 3_000, () => HEAVY);
    expect(s.notch).toBe(1);
    // Notch 0 drops 4 % for its first 4.5 s (the trial passes), then 10 %.
    const changes = simulate(s, 30_000, (notch, since) => {
      if (notch !== 0) return LIGHT;
      return { drops: since < 4500 ? 0.04 : 0.1, cpu: 3 };
    }, HZ60, 3_000);
    expect(changes.slice(0, 2).map((c) => c.decision)).toEqual(['up', 'revert']);
    expect(changes[1].t - changes[0].t).toBeGreaterThan(TRIAL_MS);
    expect(changes[1].wait).toBe(2 * PROBE_WAIT_MS);
  });

  it('never leaves the ladder: notch 0 is the ceiling, the last notch the floor', () => {
    const s = createGovernor({ tier: 'mid', pixelRatio: 1.5 });
    const r = rng(5);
    let t = 0;
    for (let k = 0; k < 40; k += 1) {
      const load: Load = { drops: r() * 0.3, cpu: r() * 16 };
      simulate(s, 3_000 + r() * 20_000, () => load, HZ60, t);
      t += 25_000;
      expect(s.notch).toBeGreaterThanOrEqual(0);
      expect(s.notch).toBeLessThan(s.ladder.length);
      expect(governorNotch(s).pixelRatio).toBeLessThanOrEqual(1.5);
      expect(tierRank(governorNotch(s).tier)).toBeGreaterThanOrEqual(tierRank('mid'));
    }
  });
});

describe('notch ladder', () => {
  it('alternates pixel ratio and tier from (high, 2) down to (min, 0.75)', () => {
    expect(buildLadder('high', 2).map((n) => `${n.tier}@${n.pixelRatio}`)).toEqual([
      'high@2', 'high@1.75', 'mid@1.75', 'mid@1.5', 'low@1.5', 'low@1.25', 'min@1.25', 'min@1', 'min@0.75',
    ]);
    expect(buildLadder('mid', 1).map((n) => `${n.tier}@${n.pixelRatio}`)).toEqual(['mid@1', 'mid@0.75', 'low@0.75', 'min@0.75']);
    expect(buildLadder('low', 2).map((n) => `${n.tier}@${n.pixelRatio}`)).toEqual([
      'low@2', 'low@1.75', 'min@1.75', 'min@1.5', 'min@1.25', 'min@1', 'min@0.75',
    ]);
  });

  it('never raises the pixel ratio above its start, and moves one axis one step at a time', () => {
    for (const tier of ESTATE_TIERS) {
      for (const start of [...PIXEL_RATIO_STEPS, 1.1, 3, 0.6]) {
        const ladder = buildLadder(tier, start);
        const ratios = [start, ...PIXEL_RATIO_STEPS.filter((r) => r < start)];
        expect(ladder[0]).toEqual({ tier, pixelRatio: start });
        const last = ladder[ladder.length - 1];
        expect(last).toEqual({ tier: 'min', pixelRatio: Math.min(start, 0.75) });
        for (let i = 1; i < ladder.length; i += 1) {
          const a = ladder[i - 1];
          const b = ladder[i];
          expect(b.pixelRatio).toBeLessThanOrEqual(start);
          const ratioStep = ratios.indexOf(b.pixelRatio) - ratios.indexOf(a.pixelRatio);
          const tierStep = tierRank(b.tier) - tierRank(a.tier);
          expect([ratioStep, tierStep].sort()).toEqual([0, 1]);
        }
        expect(ladder).toHaveLength(ratios.length + (ESTATE_TIERS.length - tierRank(tier)) - 1);
        expect(Object.isFrozen(ladder) && Object.isFrozen(ladder[0])).toBe(true);
      }
    }
  });

  it('rejects a start it cannot build from', () => {
    expect(() => buildLadder('ultra' as EstateTier, 1)).toThrow(RangeError);
    for (const bad of [0, -1, Number.NaN, Infinity]) expect(() => buildLadder('high', bad)).toThrow(RangeError);
  });
});

describe('percentile', () => {
  it('matches a sorted nearest-rank reference', () => {
    const r = rng(19);
    for (const n of [1, 2, 3, 60, 125, 288, 1000]) {
      for (const q of [0.5, 0.95, 0.99, 1]) {
        const values = Array.from({ length: n }, () => Math.round(r() * 40 * 4) / 4); // with ties
        const ref = [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(q * n) - 1)];
        expect(percentileInPlace(Float64Array.from(values), n, q), `n ${n} q ${q}`).toBe(ref);
      }
    }
    expect(percentileInPlace(new Float64Array(4), 0, 0.95)).toBeNaN();
    // Only the first n values are read.
    expect(percentileInPlace(Float64Array.from([1, 2, 3, 100]), 3, 1)).toBe(3);
  });
});

describe('starting tier (§7.9 table)', () => {
  const cases: Array<[string, EstateTier | null]> = [
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'min'],
    ['llvmpipe (LLVM 15.0.6, 256 bits)', 'min'],
    ['ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'min'],
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'low'],
    ['ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0)', 'low'],
    ['Mesa Intel(R) UHD Graphics 630 (CFL GT2)', 'low'],
    ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'mid'],
    ['Mesa Intel(R) Xe Graphics (TGL GT2)', 'mid'],
    ['ANGLE (Intel Inc., Intel(R) Iris(TM) Plus Graphics 655, OpenGL 4.1)', 'mid'],
    ['ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'mid'],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'mid'],
    ['AMD Radeon Vega 8 Graphics', 'mid'],
    ['ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)', 'mid'],
    ['Apple M2', 'mid'],
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU (0x00002560) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['NVIDIA GeForce GTX 1080/PCIe/SSE2', 'high'],
    ['ANGLE (AMD, AMD Radeon RX 6700 XT (0x000073DF) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['AMD Radeon Pro 5500M OpenGL Engine', 'high'],
    ['ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['Apple GPU', null],
    ['Mozilla', null],
    ['', null],
  ];

  it('classifies real renderer strings', () => {
    for (const [renderer, tier] of cases) expect(classifyRenderer(renderer), renderer).toBe(tier);
    expect(classifyRenderer(null)).toBeNull();
    expect(classifyRenderer(undefined)).toBeNull();
  });

  it('starts unknown renderers at mid and drops a tier under 4 GB of device memory', () => {
    expect(startingTier('Apple GPU')).toBe('mid');
    expect(startingTier(null, null)).toBe('mid');
    expect(startingTier('NVIDIA GeForce GTX 1080', 8)).toBe('high');
    expect(startingTier('NVIDIA GeForce GTX 1080', 4)).toBe('high');
    expect(startingTier('NVIDIA GeForce GTX 1080', 2)).toBe('mid');
    expect(startingTier('Apple GPU', 2)).toBe('low');
    expect(startingTier('Intel(R) UHD Graphics 620', 0.5)).toBe('min');
    expect(startingTier('SwiftShader', 1)).toBe('min');
    expect(startingTier('NVIDIA GeForce GTX 1080', Number.NaN)).toBe('high');
  });

  it('lets ?estate-quality= override everything, and ignores a value it does not know', () => {
    expect(startingTier('NVIDIA GeForce RTX 4090', 8, 'min')).toBe('min');
    expect(startingTier('SwiftShader', 1, ' HIGH ')).toBe('high');
    expect(startingTier('NVIDIA GeForce RTX 4090', 8, 'ultra')).toBe('high');
    expect(startingTier('Apple GPU', 2, '')).toBe('low');
    expect(parseQualityOverride('Mid')).toBe('mid');
    expect(parseQualityOverride(['min'])).toBeNull();
    expect(parseQualityOverride('medium')).toBeNull();
  });
});
