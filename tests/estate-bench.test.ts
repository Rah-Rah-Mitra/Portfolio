import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BenchSegment, benchVerdict, GAP_MS, isEstatePath, MAX_CHANGES_PER_SEGMENT, OFF_ROUTE_SEGMENTS, percentile, segmentAt, summariseSegment,
  ZERO_BYTE_SEGMENTS, type BenchFrame, type BenchSegmentReport,
} from '../lib/estate/bench';
import { DROP_FACTOR } from '../lib/estate/governorCore';
import { DRAIN_MAX_MS, whenGpuIdle, type DrainHost, type FenceGl } from '../components/workbench/estate/engine/drain';
import { benchFromSearch, debugFromSearch } from '../components/workbench/estate/shellDom';

// P7: the §12.4 bench's arithmetic (lib/estate/bench.ts), the GPU drain a
// governor notch waits on before it resizes (engine/drain.ts), the
// `?estate-bench=1` switch, and the rule that keeps the bench out of every
// visitor's download: engine/bench.ts is reached only by the engine's own
// import(), and only when the shell passed `bench`.

const root = fileURLToPath(new URL('..', import.meta.url));

const frame = (overrides: Partial<BenchFrame> = {}): BenchFrame => ({
  interval: 16.7, continuous: true, judgedMs: 16.7, cpuMs: 1, gpuMs: Number.NaN, draws: 20, tris: 1000, gpuBytes: 12e6,
  programs: 6, tier: 'min', pixelRatio: 1, excluded: false, settling: false, ...overrides,
});

describe('BenchSegment and its summary', () => {
  it('counts drops by the governor\'s own rule and gaps by the long-task threshold, over continuous frames only', () => {
    const s = new BenchSegment('s2-orbit', 1000);
    s.frame(frame({ continuous: false, interval: 900 })); // the first after a rest: drawn, not sampled
    s.frame(frame());
    s.frame(frame({ interval: DROP_FACTOR * 16.7 + 0.1 })); // a drop, not a gap
    s.frame(frame({ interval: GAP_MS + 1 })); // a drop and a gap
    s.frame(frame({ interval: 40, judgedMs: Number.NaN })); // no period yet: not judged
    s.frame(frame({ interval: 0 })); // a zero interval says nothing
    expect(s.frames).toBe(6);
    expect(s.continuous).toBe(4);
    expect(s.dropped).toBe(2);
    expect(s.gaps).toBe(1);
  });

  it('reports peaks, nearest-rank percentiles, bytes split by owner, long tasks and slow frames', () => {
    const s = new BenchSegment('lift-l5', 2000);
    for (let i = 1; i <= 100; i += 1) s.frame(frame({ interval: i, cpuMs: i / 10, gpuMs: i % 2 ? i : Number.NaN, draws: i, tris: 1000 * i, gpuBytes: 1e5 * i }));
    s.resources.push({ path: '/estate/v1.2/i/BLK_509.0123abcd.glb.gz', bytes: 5000 }, { path: '/assets/estate-bench-x.js', bytes: 900 });
    s.longTasks.push(60, 120);
    s.slowFrames.push({ blockingMs: 10, script: 'a' }, { blockingMs: 0, script: 'b' }, { blockingMs: 70, script: null });
    s.changes.push('down → min ×0.75');
    s.note('placed at Entrance E for the route');
    s.endMs = 3500;
    const r = summariseSegment(s);
    expect(r).toMatchObject({
      name: 'lift-l5', ok: true, ms: 1500, frames: 100, sampled: 100,
      intervalP50: 50, intervalP99: 99, cpuP95: 9.5, gpuP95: 95,
      draws: 100, tris: 100_000, gpuMB: 10, bytes: 5000, requests: 1, otherBytes: 900,
      longTasks: { count: 2, maxMs: 120, totalMs: 180 },
      slowFrames: { count: 2, maxBlockingMs: 70, scripts: ['70 ms (no script)', '10 ms a'] },
      governorChanges: 1, notes: ['placed at Entrance E for the route'],
    });
    // Frames over 1.5 × 16.7 ms are drops: 26 … 100.
    expect(r.droppedPct).toBe(75);
  });

  it('keeps G3’s figures beside the raw ones: upload, compile and resize frames left out, and the first 5 s after a notch for "settled"', () => {
    const s = new BenchSegment('blk509-void-deck', 0);
    s.frame(frame({ interval: 120, excluded: true })); // an upload frame: a drop and a gap, raw only
    s.frame(frame({ interval: 60, settling: true })); // after a notch: G3, not settled
    for (let i = 0; i < 8; i += 1) s.frame(frame()); // clean
    s.endMs = 1000;
    const r = summariseSegment(s);
    expect(r).toMatchObject({ sampled: 10, droppedPct: 20, gaps: 2 });
    expect(r.g3).toEqual({ sampled: 9, excluded: 1, droppedPct: 11.1, intervalP99: 60, cpuP95: 1, gaps: 1 });
    expect(r.settled).toEqual({ sampled: 8, droppedPct: 0, intervalP99: 16.7 });
  });

  it('says nothing it did not measure', () => {
    const s = new BenchSegment('esc-overview', 0);
    s.endMs = 10;
    const r = summariseSegment(s);
    expect([r.droppedPct, r.intervalP50, r.cpuP95, r.gpuP95, r.gpuMB, r.longTasks.maxMs]).toEqual([null, null, null, null, null, null]);
    expect(r.g3).toEqual({ sampled: 0, excluded: 0, droppedPct: null, intervalP99: null, cpuP95: null, gaps: 0 });
    expect(r.settled).toEqual({ sampled: 0, droppedPct: null, intervalP99: null });
    expect(s.ok).toBe(true);
    s.note('not in Overview', true);
    expect(summariseSegment(s).ok).toBe(false);
  });

  it('takes nearest-rank percentiles without reordering its input', () => {
    const values = [5, 1, 4, 2, 3];
    expect(percentile(values, 0.5)).toBe(3);
    expect(percentile(values, 0.95)).toBe(5);
    expect(percentile(values, 0)).toBe(1);
    expect(percentile([], 0.5)).toBeNull();
    expect(values).toEqual([5, 1, 4, 2, 3]);
  });

  it('books a timestamp to the segment it falls in, the open one included', () => {
    const a = new BenchSegment('a', 0);
    a.endMs = 100;
    const b = new BenchSegment('b', 150);
    expect(segmentAt([a, b], 50)?.name).toBe('a');
    expect(segmentAt([a, b], 120)).toBeNull();
    expect(segmentAt([a, b], 10_000)?.name).toBe('b');
    expect(isEstatePath('/estate/v1.2/pack.0123abcd.json')).toBe(true);
    expect(isEstatePath('/assets/estate-engine-x.js')).toBe(false);
  });
});

describe('benchVerdict (§12.4 pass)', () => {
  const report = (name: string, overrides: Partial<BenchSegmentReport> = {}): BenchSegmentReport => {
    const s = new BenchSegment(name, 0);
    s.endMs = 1;
    return { ...summariseSegment(s), ...overrides };
  };

  const NO_G3 = { dropped: null, p99: null, settledDropped: null, settledP99: null };

  it('passes a clean route', () => {
    expect(benchVerdict(['s1-first-frame', ...ZERO_BYTE_SEGMENTS].map((name) => report(name)))).toEqual({
      routeOk: true, governorOk: true, bytesOnMoves: [], longTasks: [], gaps: [], g3: NO_G3,
    });
  });

  it('names the worst G3 figures on §12.4’s route, leaving out the load and the recovery leg', () => {
    const g3 = (droppedPct: number, intervalP99: number) => ({ sampled: 100, excluded: 0, droppedPct, intervalP99, cpuP95: 1, gaps: 0 });
    const verdict = benchVerdict([
      report('s1-first-frame', { g3: g3(90, 900) }),
      report('s2-orbit', { g3: g3(4, 30), settled: { sampled: 50, droppedPct: 1, intervalP99: 20 } }),
      report('nc514-hall', { g3: g3(2, 45), settled: { sampled: 50, droppedPct: 3, intervalP99: 40 } }),
      report('bs1-recovery', { g3: g3(50, 200) }),
    ]);
    expect(OFF_ROUTE_SEGMENTS).toEqual(['s1-first-frame', 'bs1-recovery']);
    expect(verdict.g3).toEqual({
      dropped: { pct: 4, segment: 's2-orbit' },
      p99: { ms: 45, segment: 'nc514-hall' },
      settledDropped: { pct: 3, segment: 'nc514-hall' },
      settledP99: { ms: 40, segment: 'nc514-hall' },
    });
  });

  it(`fails more than ${MAX_CHANGES_PER_SEGMENT} notch changes in a segment, a download on a storey move, a refused leg`, () => {
    const verdict = benchVerdict([
      report('s2-orbit', { governorChanges: MAX_CHANGES_PER_SEGMENT + 1, gaps: 3, g3: { sampled: 10, excluded: 2, droppedPct: null, intervalP99: null, cpuP95: null, gaps: 1 } }),
      report('bs1-street', { gaps: 2 }), // raw gaps only (upload frames): not G3's
      report('lift-l12', { requests: 1, bytes: 300 }),
      report('blk509-void-deck', { requests: 16 }), // entering downloads, by design
      report('mscp-ramp', { ok: false, longTasks: { count: 1, maxMs: 80, totalMs: 80 } }),
    ]);
    expect(verdict).toEqual({
      routeOk: false, governorOk: false, bytesOnMoves: ['lift-l12'], longTasks: ['mscp-ramp'], gaps: ['s2-orbit'], g3: NO_G3,
    });
  });
});

describe('whenGpuIdle (a notch resizes only behind a drained GPU)', () => {
  const fakeGl = (signalAfterPolls: number, fence: object | null = {}) => {
    const calls: string[] = [];
    let polls = 0;
    const gl = {
      SYNC_GPU_COMMANDS_COMPLETE: 0x9117, SYNC_STATUS: 0x9114, SIGNALED: 0x9119,
      fenceSync: () => { calls.push('fence'); return fence; },
      flush: () => { calls.push('flush'); },
      getSyncParameter: () => { polls += 1; calls.push('poll'); return polls > signalAfterPolls ? 0x9119 : 0x9118; },
      deleteSync: () => { calls.push('delete'); },
    } as unknown as FenceGl;
    return { gl, calls };
  };
  const host = (abandoned = () => false) => {
    let t = 0;
    const queue: Array<() => void> = [];
    const h: DrainHost & { run(): void; t(): number } = {
      after: (ms, run) => { queue.push(() => { t += ms; run(); }); },
      now: () => t,
      abandoned,
      run: () => { while (queue.length) queue.shift()!(); },
      t: () => t,
    };
    return h;
  };

  it('places the fence, flushes, never blocks, and resolves once it signals', () => {
    const { gl, calls } = fakeGl(3);
    const h = host();
    const done: boolean[] = [];
    whenGpuIdle(gl, h, (signalled) => done.push(signalled));
    expect(calls).toEqual(['fence', 'flush']); // nothing read in the frame that placed it
    h.run();
    expect(done).toEqual([true]);
    expect(calls).toEqual(['fence', 'flush', 'poll', 'poll', 'poll', 'poll', 'delete']);
  });

  it('gives up after its cap and resizes anyway', () => {
    const { gl } = fakeGl(Infinity);
    const h = host();
    const done: boolean[] = [];
    whenGpuIdle(gl, h, (signalled) => done.push(signalled));
    h.run();
    expect(done).toEqual([false]);
    expect(h.t()).toBeGreaterThanOrEqual(DRAIN_MAX_MS);
  });

  it('stops without a word once abandoned (dispose, a lost context), leaving a dead fence alone', () => {
    const { gl, calls } = fakeGl(Infinity);
    let lost = false;
    const h = host(() => lost);
    const done: boolean[] = [];
    whenGpuIdle(gl, h, (signalled) => done.push(signalled));
    lost = true;
    h.run();
    expect(done).toEqual([]);
    expect(calls).not.toContain('delete');
  });

  it('treats a context that made no fence as drained', () => {
    const { gl } = fakeGl(Infinity, null);
    const h = host();
    const done: boolean[] = [];
    whenGpuIdle(gl, h, (signalled) => done.push(signalled));
    h.run();
    expect(done).toEqual([true]);
  });
});

describe('?estate-bench=1', () => {
  it('turns on the bench, and with it the debug readouts', () => {
    expect(benchFromSearch('?app=world-3d&estate-bench=1')).toBe(true);
    expect(debugFromSearch('?app=world-3d&estate-bench=1')).toBe(true);
    expect(benchFromSearch('?estate-bench=true')).toBe(false);
    // Maximised (§12.4's "default size and maximised"): the bench presses Maximize itself.
    expect(benchFromSearch('?estate-bench=max')).toBe(true);
    expect(debugFromSearch('?estate-bench=max')).toBe(true);
    expect(benchFromSearch('?estate-debug=1')).toBe(false);
    expect(benchFromSearch('')).toBe(false);
  });

  it('reaches engine/bench.ts only through the engine\'s own import(), gated on the shell\'s flag', async () => {
    const index = await readFile(path.join(root, 'components/workbench/estate/engine/index.ts'), 'utf8');
    expect(index).toMatch(/if \(options\.bench\) \{[\s\S]{0,200}import\('\.\/bench'\)/);
    const controller = await readFile(path.join(root, 'components/workbench/estate/EstateController.tsx'), 'utf8');
    expect(controller).toContain('bench: benchFromSearch(search)');
    // No static import of the bench anywhere, in any spelling: tests/estate-boundary.test.ts
    // checks every file of the app with the TypeScript parser, and the build's
    // check-bundle fails a Load click or main bundle that carries its schema string.
  });
});
