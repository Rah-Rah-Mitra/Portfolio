import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstateEngineEvent, EstateEngineOptions } from '../components/workbench/estate/engineApi';
import { createEngine } from '../components/workbench/estate/engine/index';
import {
  ContextWatch, EngineEmitter, runTeardown, TEARDOWN_ORDER, TimerSet, type TeardownSteps,
} from '../components/workbench/estate/engine/lifecycle';
import { resetGpuProbe } from '../components/workbench/estate/engine/renderer';

// Plan §10.2 tests/estate-engine-dispose.test.ts: the engine's lifecycle core
// with a fake canvas whose loseContext() dispatches webglcontextlost
// synchronously (as WEBGL_lose_context may). Once dispose() has begun, no
// `lost`, `unavailable` or anything else may come out, the event its own
// forceContextLoss() fires included; and the handle stays inert afterwards.

/** A canvas stand-in: an EventTarget with the few members the core touches, whose context loss fires synchronously. */
class FakeCanvas extends EventTarget {
  width = 0;
  height = 0;
  className = '';
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  removed = 0;
  contexts = 0;
  /** What getContext('webgl2') answers: null (no WebGL2) unless a test sets a context. */
  context: unknown = null;
  setAttribute() { /* aria-hidden */ }
  remove() { this.removed += 1; }
  getContext() { this.contexts += 1; return this.context; }
  /** WEBGL_lose_context.loseContext(), synchronous here. */
  loseContext() {
    this.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  }
}

const fakeHost = () => {
  const attrs = new Map<string, string>();
  const children: unknown[] = [];
  return {
    clientWidth: 800,
    clientHeight: 600,
    children,
    getBoundingClientRect: () => ({ width: 800, height: 600 }),
    appendChild: (child: unknown) => { children.push(child); return child; },
    setAttribute: (name: string, value: string) => { attrs.set(name, value); },
    getAttribute: (name: string) => attrs.get(name) ?? null,
    hasAttribute: (name: string) => attrs.has(name),
    removeAttribute: (name: string) => { attrs.delete(name); },
    attrs,
  };
};

const COLOURS = new Proxy({}, { get: () => 'rgb(128, 128, 128)' }) as Record<string, string>;

const options = (overrides: Partial<EstateEngineOptions> & { events?: EstateEngineEvent[] } = {}) => {
  const events = overrides.events ?? [];
  const host = fakeHost();
  const canvases: FakeCanvas[] = [];
  const base: EstateEngineOptions = {
    host: host as unknown as HTMLElement,
    token: 7,
    packUrl: '/estate/v1.2/pack.00000000.json',
    lean: false,
    motionHalted: () => false,
    colours: COLOURS,
    onEvent: (event) => { events.push(event); },
    createCanvas: () => {
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    },
    fetch: (() => Promise.reject(new Error('no network in this test'))) as typeof fetch,
  };
  return { options: { ...base, ...overrides }, events, host, canvases };
};

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => resetGpuProbe());
afterEach(() => vi.unstubAllGlobals());

describe('EngineEmitter', () => {
  it('stamps the token and reaches the shell before subscribers', () => {
    const order: string[] = [];
    const emitter = new EngineEmitter(3, (e) => order.push(`shell:${e.type}:${e.token}`));
    emitter.subscribe((e) => order.push(`hud:${e.type}:${e.token}`));
    emitter.emit({ type: 'restored' });
    expect(order).toEqual(['shell:restored:3', 'hud:restored:3']);
  });

  it('delivers nothing once closed, even to a listener later in the same round', () => {
    const seen: string[] = [];
    let emitter: EngineEmitter;
    emitter = new EngineEmitter(1, (e) => { seen.push(`shell:${e.type}`); emitter.close(); });
    emitter.subscribe((e) => seen.push(`hud:${e.type}`));
    emitter.emit({ type: 'lost', frozen: false });
    emitter.emit({ type: 'restored' });
    expect(seen).toEqual(['shell:lost']);
    expect(emitter.subscribe(() => undefined)()).toBeUndefined();
  });
});

describe('ContextWatch and the ordered teardown', () => {
  const rig = () => {
    const canvas = new FakeCanvas();
    const events: EstateEngineEvent[] = [];
    const emitter = new EngineEmitter(9, (e) => events.push(e));
    const watch = new ContextWatch(canvas, {
      lost: () => emitter.emit({ type: 'lost', frozen: false }),
      restored: () => emitter.emit({ type: 'restored' }),
    });
    watch.attach();
    return { canvas, events, emitter, watch };
  };

  it('reports a loss while attached (the fake is honest) and prevents the default', () => {
    const { canvas, events } = rig();
    const event = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['lost']);
  });

  it('emits nothing for the synchronous loss its own teardown causes', () => {
    const { canvas, events, emitter, watch } = rig();
    const calls: string[] = [];
    const steps: TeardownSteps = {
      close: () => { calls.push('close'); emitter.close(); },
      detachContextListeners: () => { calls.push('detachContextListeners'); watch.detach(); },
      clearTimers: () => calls.push('clearTimers'),
      disposeRenderer: () => calls.push('disposeRenderer'),
      loseContext: () => { calls.push('loseContext'); canvas.loseContext(); },
      removeCanvas: () => { calls.push('removeCanvas'); canvas.remove(); },
      releaseWorkers: () => calls.push('releaseWorkers'),
      abortDownloads: () => calls.push('abortDownloads'),
    };
    runTeardown(steps);
    expect(events).toEqual([]);
    expect(calls).toEqual([...TEARDOWN_ORDER]);
    expect(canvas.removed).toBe(1);
  });

  it('stays silent even if the listeners were somehow still attached: the emitter closes first', () => {
    const { canvas, events, emitter } = rig();
    runTeardown({ close: () => emitter.close(), loseContext: () => canvas.loseContext() });
    expect(events).toEqual([]);
  });

  it('pins the §7.10 order', () => {
    expect(TEARDOWN_ORDER).toEqual([
      'close', 'detachContextListeners', 'clearTimers', 'disposeRenderer', 'loseContext', 'removeCanvas', 'releaseWorkers', 'abortDownloads',
    ]);
  });

  it('TimerSet clears everything it armed', () => {
    vi.useFakeTimers();
    try {
      const timers = new TimerSet();
      const fired: number[] = [];
      timers.after(10, () => fired.push(1));
      timers.after(20, () => fired.push(2));
      expect(timers.size).toBe(2);
      vi.advanceTimersByTime(15);
      expect(fired).toEqual([1]);
      expect(timers.size).toBe(1);
      timers.clear();
      vi.advanceTimersByTime(50);
      expect(fired).toEqual([1]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the engine handle', () => {
  it('without WebGL2 reports unavailable once, with its token, and a disposing listener ends it there', async () => {
    const events: EstateEngineEvent[] = [];
    let engine: ReturnType<typeof createEngine> | null = null;
    const { options: opts } = options({
      events,
      onEvent: (event) => {
        events.push(event);
        if (event.type === 'unavailable') engine?.dispose();
      },
    });
    engine = createEngine(opts);
    engine.start();
    await flush();
    expect(events).toEqual([{ type: 'unavailable', reason: 'no-webgl2', token: 7 }]);
    // Inert after dispose: commands refuse, listeners are not taken, nothing is emitted.
    engine.start();
    engine.freeze();
    engine.resume();
    engine.dispose();
    await engine.preload();
    expect(engine.select('BLK_509')).toBe(false);
    expect(engine.home()).toBe(false);
    expect(engine.setPopover('help')).toBe(false);
    const late: EstateEngineEvent[] = [];
    engine.subscribe((e) => late.push(e))();
    await flush();
    expect(events).toHaveLength(1);
    expect(late).toEqual([]);
  });

  it('when no context comes up, says so and leaves no canvas behind after dispose', async () => {
    vi.stubGlobal('WebGL2RenderingContext', class {});
    const { options: opts, events, canvases, host } = options({ tier: 'min' });
    const engine = createEngine(opts);
    engine.start();
    await flush();
    expect(events.map((e) => e.type)).toEqual(['unavailable']);
    expect(events[0]).toMatchObject({ reason: 'context-failed', token: 7 });
    expect(canvases).toHaveLength(1);
    expect(host.children).toHaveLength(1);
    engine.dispose();
    expect(canvases[0].removed).toBe(1);
    expect(host.attrs.size).toBe(0);
    engine.dispose();
    expect(canvases[0].removed).toBe(1);
  });

  it('probes the GPU on a throwaway canvas when there is no tier override', async () => {
    vi.stubGlobal('WebGL2RenderingContext', class {});
    const { options: opts, events, canvases } = options();
    const engine = createEngine(opts);
    engine.start();
    await flush();
    // Probe: with failIfMajorPerformanceCaveat, then without; both null.
    expect(canvases[0].contexts).toBe(1);
    expect(canvases[1].contexts).toBe(1);
    expect(events.map((e) => e.type)).toEqual(['unavailable']);
    expect(events[0]).toMatchObject({ reason: 'no-webgl2' });
    engine.dispose();
  });

  it('dispose before start makes start a no-op', async () => {
    const { options: opts, events, canvases } = options();
    const engine = createEngine(opts);
    engine.dispose();
    engine.start();
    await engine.preload();
    await flush();
    expect(events).toEqual([]);
    expect(canvases).toHaveLength(0);
  });

  it('a 404 on pack.json is stale (no retry), and nothing follows a dispose in its listener', async () => {
    const urls: string[] = [];
    const events: EstateEngineEvent[] = [];
    let engine: ReturnType<typeof createEngine> | null = null;
    const { options: opts } = options({
      events,
      fetch: ((url: string) => { urls.push(url); return Promise.resolve(new Response('gone', { status: 404 })); }) as unknown as typeof fetch,
      onEvent: (event) => { events.push(event); if (event.type === 'stale') engine?.dispose(); },
    });
    engine = createEngine(opts);
    await engine.preload();
    await flush();
    expect(urls).toEqual(['/estate/v1.2/pack.00000000.json']);
    expect(events).toEqual([{ type: 'stale', url: '/estate/v1.2/pack.00000000.json', token: 7 }]);
  });

  it('a pack that fails parsePack is an error, reported once', async () => {
    const events: EstateEngineEvent[] = [];
    const { options: opts } = options({
      events,
      fetch: (() => Promise.resolve(new Response('{"schema":"something/else"}', { status: 200 }))) as unknown as typeof fetch,
    });
    const engine = createEngine(opts);
    await engine.preload();
    await engine.preload();
    await flush();
    expect(events.map((e) => e.type)).toEqual(['error']);
    expect((events[0] as { message: string }).message).toMatch(/pack\.schema/);
    engine.dispose();
  });

  it('starts with the view the contract describes, honouring lean and a resumed selection', () => {
    const { options: opts } = options({
      lean: true,
      resume: { mode: 'overview', selection: 'NC_514', position: [1, 2, 3], target: [4, 5, 6] },
    });
    const engine = createEngine(opts);
    expect(engine.token).toBe(7);
    expect(engine.getView()).toMatchObject({
      selection: 'NC_514', lean: true, popover: null, popoverOpen: false, transition: null, flight: false, moving: false,
      location: { site: null, storey: null, unit: null, room: null, mode: 'overview' },
    });
    expect(engine.getResume()).toEqual({ mode: 'overview', selection: 'NC_514', position: [1, 2, 3], target: [4, 5, 6] });
    engine.setLean(false);
    expect(engine.getView().lean).toBe(false);
    // Not ready: navigation refuses.
    expect(engine.flyTo('BLK_509')).toBe(false);
    expect(engine.setMode('fly')).toBe(false);
    expect(engine.escape('clear-selection')).toBe(false);
    engine.dispose();
  });
});
