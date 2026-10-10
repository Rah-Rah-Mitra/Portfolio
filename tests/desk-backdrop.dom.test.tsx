import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EffectsContext } from '../contexts/PhysicsContext';
import { defaultBackdropSettings, defaultFluidPreferences, defaultNBodyPreferences, type BackdropSettings } from '../lib/backdropSettings';
import { normalizeNBodyWorkerMessage, toFieldPoint } from '../lib/nbody/workerProtocol';
import { DeskBackdrop } from '../components/workbench/DeskBackdrop';
import NBodyField from '../components/workbench/NBodyField';
import FluidField from '../components/workbench/FluidField';
import { claimGpu, releaseGpu } from '../lib/gpuClaim';

// One DOM file for the whole desk-backdrop feature: the host's mount rules, the
// N-body worker handshake and the fluid GL request. The rules themselves are
// pure and live in desktop-background / nbody-worker / nbody-paint.

const policy = { allowHeavyAssets: true };
vi.mock('../contexts/ExperienceModeContext', () => ({
  useExperienceMode: () => ({ policy, capabilities: null }),
  useOptionalExperienceMode: () => ({ policy, capabilities: null, resolved: true }),
}));

class WorkerStub {
  static instances: WorkerStub[] = [];
  messages: Array<Record<string, unknown>> = [];
  listeners = new Map<string, EventListener>();
  terminate = vi.fn();
  constructor() { WorkerStub.instances.push(this); }
  addEventListener(type: string, listener: EventListener) { this.listeners.set(type, listener); }
  removeEventListener(type: string) { this.listeners.delete(type); }
  postMessage(message: Record<string, unknown>) { this.messages.push(message); }
  reply(data: Record<string, unknown>) { act(() => { this.listeners.get('message')?.({ data } as unknown as Event); }); }
  last(type: string) { return [...this.messages].reverse().find((message) => message.type === type); }
}

// jsdom has no ResizeObserver; tests that need one stub it and fire it by hand.
class ResizeObserverStub {
  static instances: ResizeObserverStub[] = [];
  constructor(private readonly callback: ResizeObserverCallback) { ResizeObserverStub.instances.push(this); }
  observe() {}
  unobserve() {}
  disconnect() {}
  resize(width: number, height: number) {
    act(() => { this.callback([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver); });
  }
}

// Enough of a WebGL2 context for FluidField to build its pipeline, counting calls.
const fakeWebGl2 = () => {
  const calls: Record<string, number> = {};
  const constants = new Map<string, number>();
  const constant = (name: string) => {
    if (!constants.has(name)) constants.set(name, constants.size + 1);
    return constants.get(name)!;
  };
  const gl = new Proxy({}, {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      if (/^[A-Z][A-Z0-9_]*$/.test(key)) return constant(key);
      if (key === 'drawingBufferWidth' || key === 'drawingBufferHeight') return 1;
      return (...args: unknown[]) => {
        calls[key] = (calls[key] ?? 0) + 1;
        if (key === 'getExtension') return args[0] === 'WEBGL_lose_context' ? { loseContext: () => undefined } : {};
        if (key === 'getProgramParameter') return args[1] === constant('ACTIVE_UNIFORMS') ? 0 : true;
        if (key === 'getShaderParameter') return true;
        return {};
      };
    },
  });
  return { gl, calls };
};

const palette = { accent: '#5980a6', accentDeep: '#416180' };
let frames: FrameRequestCallback[];

beforeEach(() => {
  WorkerStub.instances = [];
  ResizeObserverStub.instances = [];
  frames = [];
  policy.allowHeavyAssets = true;
  vi.stubGlobal('Worker', WorkerStub);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => frames.push(callback)));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  document.documentElement.style.setProperty('--color-accent', palette.accent);
  document.documentElement.style.setProperty('--color-accent-700', palette.accentDeep);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty('--color-accent');
  document.documentElement.style.removeProperty('--color-accent-700');
});

// The Estate drawing set is on by default; these cases are about the other two,
// so they start from every backdrop off (the drawing's own: desk-drawing.dom).
const allOff: BackdropSettings = { ...defaultBackdropSettings, drawing: { enabled: false } };

const withSettings = (settings: BackdropSettings) => (
  <EffectsContext.Provider value={{ settings } as never}>
    <main data-desk><DeskBackdrop /></main>
  </EffectsContext.Provider>
);

describe('DeskBackdrop host', () => {
  it('renders nothing while every backdrop is off, or with no FX provider at all', () => {
    expect(render(withSettings(allOff)).container.querySelector('main')!.childElementCount).toBe(0);
    cleanup();
    expect(render(<main data-desk><DeskBackdrop /></main>).container.querySelector('main')!.childElementCount).toBe(0);
    expect(WorkerStub.instances).toHaveLength(0);
  });

  it('on the shared defaults mounts the drawing’s hosts and neither engine', async () => {
    const { container } = render(withSettings(defaultBackdropSettings));
    await waitFor(() => expect(container.querySelector('.wb-drawing')).not.toBeNull());
    expect(container.querySelector('.wb-backdrop')).toBeNull();
    expect(container.querySelector('canvas[data-backdrop]')).toBeNull();
    expect(WorkerStub.instances).toHaveLength(0);
  });

  it('never takes the N-body lease on the light policy', () => {
    policy.allowHeavyAssets = false;
    const { container } = render(withSettings({ ...allOff, nbody: { ...defaultBackdropSettings.nbody, enabled: true } }));
    expect(container.querySelector('.wb-backdrop')).toBeNull();
    expect(WorkerStub.instances).toHaveLength(0);
  });

  it('lazy-mounts the N-body engine behind an aria-hidden layer with a plain-text caption', async () => {
    const { container } = render(withSettings({ ...allOff, nbody: { ...defaultBackdropSettings.nbody, enabled: true } }));
    await waitFor(() => expect(WorkerStub.instances).toHaveLength(1));
    const layer = container.querySelector('.wb-backdrop')!;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.querySelector('canvas[data-backdrop="nbody"]')).not.toBeNull();
    expect(layer.querySelector('canvas[data-backdrop="fluid"]')).toBeNull();
    expect(layer.textContent).toContain('2D LOG-FMM');
    expect(layer.textContent).toContain('LIVE');
  });

  it('yields to the Estate window: a claim holds a live field (HELD · ESTATE), a release resumes it', async () => {
    const { container } = render(withSettings({ ...allOff, nbody: { ...defaultBackdropSettings.nbody, enabled: true } }));
    await waitFor(() => expect(WorkerStub.instances).toHaveLength(1));
    const state = () => container.querySelector('[data-backdrop-state]');
    expect(state()?.getAttribute('data-backdrop-state')).toBe('running');
    try {
      act(() => { claimGpu('estate'); });
      expect(state()?.getAttribute('data-backdrop-state')).toBe('yielded');
      expect(state()?.textContent).toContain('HELD · ESTATE');
      // Still mounted: the field keeps its worker and its last frame.
      expect(container.querySelector('canvas[data-backdrop="nbody"]')).not.toBeNull();
      expect(WorkerStub.instances).toHaveLength(1);
    } finally {
      act(() => { releaseGpu('estate'); });
    }
    expect(state()?.getAttribute('data-backdrop-state')).toBe('running');
    expect(state()?.textContent).toContain('LIVE');
  });

  it('gives each engine its own Suspense boundary, so loading the second never hides the first', async () => {
    // A fresh module graph, so the fluid engine's lazy chunk is genuinely unloaded here.
    vi.resetModules();
    const { DeskBackdrop: FreshBackdrop } = await import('../components/workbench/DeskBackdrop');
    const { EffectsContext: FreshContext } = await import('../contexts/PhysicsContext');
    const tree = (fluid: boolean) => (
      <FreshContext.Provider value={{ settings: { nbody: { ...defaultBackdropSettings.nbody, enabled: true }, fluid: { ...defaultBackdropSettings.fluid, enabled: fluid }, drawing: { enabled: false } } } as never}>
        <main data-desk><FreshBackdrop /></main>
      </FreshContext.Provider>
    );
    const view = render(tree(false));
    await waitFor(() => expect(view.container.querySelector('canvas[data-backdrop="nbody"]')).not.toBeNull());
    view.rerender(tree(true));
    // The fluid chunk is still loading. A shared boundary would have hidden the
    // running N-body host with display: none until it arrived.
    const host = view.container.querySelector('canvas[data-backdrop="nbody"]')!.parentElement!;
    expect(host.style.display).not.toBe('none');
    await waitFor(() => expect(view.container.querySelector('canvas[data-backdrop="fluid"]')).not.toBeNull());
    expect(host.style.display).not.toBe('none');
  });
});

describe('NBodyField', () => {
  const mount = (running: boolean, params = defaultNBodyPreferences) => (
    <main data-desk><NBodyField params={params} palette={palette} running={running} /></main>
  );

  it('initializes a deterministic worker, and steps with the accent ramp only after ready', () => {
    render(mount(true));
    const [worker] = WorkerStub.instances;
    expect(worker!.messages[0]).toMatchObject({ type: 'initialize', config: { particleCount: 2048, expansionOrder: 8, leafCapacity: 48, seed: 41 } });
    frames.at(-1)!(1000);
    expect(worker!.last('step')).toBeUndefined();
    worker!.reply({ type: 'ready', effectiveParticleCount: 768 });
    frames.at(-1)!(1016);
    const step = worker!.last('step')!;
    expect(step).toMatchObject({ accent: palette.accent, accentDeep: palette.accentDeep, trailPersistence: 38 });
    expect(step.dt as number).toBeGreaterThan(0);
    expect(step).not.toHaveProperty('surface');
  });

  it('a halted field starts no loop and paints one still frame (a zero-length step)', () => {
    render(mount(false));
    const [worker] = WorkerStub.instances;
    expect(worker!.last('pause')).toEqual({ type: 'pause', paused: true });
    worker!.reply({ type: 'ready', effectiveParticleCount: 768 });
    expect(worker!.last('step')).toMatchObject({ dt: 0 });
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('survives StrictMode: each effect run transfers a canvas of its own', () => {
    // A real canvas refuses a second transfer; the dev double-run once crashed the app here.
    const transferred = new WeakSet<HTMLCanvasElement>();
    Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', {
      configurable: true,
      value(this: HTMLCanvasElement) {
        if (transferred.has(this)) throw new DOMException('Cannot transfer control more than once', 'InvalidStateError');
        transferred.add(this);
        return {};
      },
    });
    try {
      const { container } = render(<React.StrictMode>{mount(true)}</React.StrictMode>);
      expect(WorkerStub.instances).toHaveLength(2);
      expect(WorkerStub.instances[0]!.terminate).toHaveBeenCalled();
      expect(container.querySelectorAll('canvas[data-backdrop="nbody"]')).toHaveLength(1);
    } finally {
      delete (HTMLCanvasElement.prototype as { transferControlToOffscreen?: unknown }).transferControlToOffscreen;
    }
  });

  it('keeps stepping through a replacement worker after a configuration change', () => {
    const view = render(mount(true));
    view.rerender(mount(true, { ...defaultNBodyPreferences, particleCount: 1024 }));
    const [first, second] = WorkerStub.instances;
    expect(first!.terminate).toHaveBeenCalled();
    expect(second!.messages[0]).toMatchObject({ type: 'initialize', config: { particleCount: 1024 } });
    second!.reply({ type: 'ready', effectiveParticleCount: 768 });
    frames.at(-1)!(1000);
    expect(second!.last('step')).toBeDefined();
    expect(first!.last('step')).toBeUndefined();
  });

  it('tunes a running field in place: a live setting is a configure to the same worker, not a restart', () => {
    const view = render(mount(true));
    view.rerender(mount(true, { ...defaultNBodyPreferences, gravity: 1.5, timeScale: 0.5, softening: 0.02, expansionOrder: 6, leafCapacity: 72, showTree: true }));
    expect(WorkerStub.instances).toHaveLength(1);
    const [worker] = WorkerStub.instances;
    expect(worker!.terminate).not.toHaveBeenCalled();
    expect(worker!.messages.filter((message) => message.type === 'initialize')).toHaveLength(1);
    const configure = worker!.last('configure');
    expect(configure).toEqual({ type: 'configure', timeScale: 0.5, gravity: 1.5, softening: 0.02, expansionOrder: 6, leafCapacity: 72, pointerAttraction: true, showTree: true });
    expect(normalizeNBodyWorkerMessage(configure)).toEqual(configure);
  });

  it('repaints a frozen field after a live change, so a quadtree switched on while paused appears', () => {
    const view = render(mount(false));
    const [worker] = WorkerStub.instances;
    const steps = () => worker!.messages.filter((message) => message.type === 'step');
    worker!.reply({ type: 'ready', effectiveParticleCount: 768 });
    const still = worker!.last('step')!;
    worker!.reply({ type: 'frame', buffer: still.buffer, bodyCount: 768 });
    const before = steps().length;
    view.rerender(mount(false, { ...defaultNBodyPreferences, showTree: true }));
    expect(steps()).toHaveLength(before + 1);
    expect(steps().at(-1)).toMatchObject({ dt: 0 });
    expect(WorkerStub.instances).toHaveLength(1);
  });

  it('keeps its size while its host is hidden (0×0), and repaints a frozen field at a real new size', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    render(mount(false));
    const [worker] = WorkerStub.instances;
    const steps = () => worker!.messages.filter((message) => message.type === 'step');
    worker!.reply({ type: 'ready', effectiveParticleCount: 768 });
    worker!.reply({ type: 'frame', buffer: worker!.last('step')!.buffer, bodyCount: 768 });
    const observer = ResizeObserverStub.instances.at(-1)!;
    const before = steps().length;
    observer.resize(0, 0);
    expect(steps()).toHaveLength(before);
    observer.resize(1200, 800);
    expect(steps().at(-1)).toMatchObject({ dt: 0, width: 1200, height: 800 });
  });

  it('honours "Pointer pulls bodies" live: off releases the attractor and stops pointer traffic', () => {
    const view = render(mount(true));
    const desk = view.container.querySelector('main')!;
    Object.defineProperty(desk, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) }) });
    const [worker] = WorkerStub.instances;
    view.rerender(mount(true, { ...defaultNBodyPreferences, pointerAttraction: false }));
    expect(worker!.last('pointer')).toMatchObject({ active: false });
    const sent = worker!.messages.length;
    fireEvent.pointerMove(desk, { clientX: 700, clientY: 100 });
    expect(worker!.messages).toHaveLength(sent);
    view.rerender(mount(true));
    fireEvent.pointerMove(desk, { clientX: 700, clientY: 100 });
    expect(worker!.last('pointer')).toMatchObject({ active: true });
    expect(WorkerStub.instances).toHaveLength(1);
  });

  it('reads the pointer off the desk, in the frame the worker draws with', () => {
    const { container } = render(mount(true));
    const desk = container.querySelector('main')!;
    Object.defineProperty(desk, 'getBoundingClientRect', { value: () => ({ left: 100, top: 40, width: 1000, height: 500, right: 1100, bottom: 540, x: 100, y: 40, toJSON: () => ({}) }) });
    fireEvent.pointerMove(desk, { clientX: 850, clientY: 165 });
    expect(WorkerStub.instances[0]!.last('pointer')).toEqual({ type: 'pointer', ...toFieldPoint(750, 125, 1000, 500), active: true });
    fireEvent.pointerLeave(desk);
    expect(WorkerStub.instances[0]!.last('pointer')).toMatchObject({ active: false });
  });
});

describe('FluidField', () => {
  it('asks for a transparent, premultiplied WebGL2 context and reports a GPU that has none', () => {
    const onUnavailable = vi.fn();
    render(<main data-desk><FluidField params={defaultFluidPreferences} palette={palette} running onUnavailable={onUnavailable} /></main>);
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('webgl2', expect.objectContaining({ alpha: true, premultipliedAlpha: true }));
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it('on resize redraws at once and rebuilds the grids once it settles, carrying the smoke instead of re-priming', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const { gl, calls } = fakeWebGl2();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(gl as never);
    try {
      const onUnavailable = vi.fn();
      render(<main data-desk><FluidField params={defaultFluidPreferences} palette={palette} running={false} onUnavailable={onUnavailable} /></main>);
      expect(onUnavailable).not.toHaveBeenCalled();
      const observer = ResizeObserverStub.instances.at(-1)!;
      const count = () => ({ draws: calls.drawArrays ?? 0, textures: calls.texImage2D ?? 0, freed: calls.deleteTexture ?? 0 });
      const primed = count();
      expect(primed.draws).toBeGreaterThan(120); // a field that mounts halted is primed once, unseen
      expect(primed.textures).toBe(8);

      observer.resize(0, 0); // hidden by a Suspense fallback: nothing to do
      expect(count()).toEqual(primed);

      observer.resize(1200, 800);
      observer.resize(1260, 800);
      const dragged = count();
      expect(dragged.draws - primed.draws).toBe(2); // one redraw per callback, never a re-prime
      expect(dragged.textures).toBe(primed.textures);

      act(() => { vi.advanceTimersByTime(150); });
      const settled = count();
      expect(settled.textures - dragged.textures).toBe(8); // rebuilt once for the whole drag
      expect(settled.freed - dragged.freed).toBe(8);
      expect(settled.draws - dragged.draws).toBe(3); // resample velocity and smoke, then the frozen frame
    } finally {
      vi.useRealTimers();
    }
  });
});
