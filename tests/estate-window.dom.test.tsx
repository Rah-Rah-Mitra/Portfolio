import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperienceModeProvider } from '../contexts/ExperienceModeContext';
import { EstateWindow } from '../components/workbench/estate/EstateWindow';
import { ESTATE_DISPLAY_NAME, ESTATE_REPO_URL } from '../components/workbench/estate/EstateRegistry';
import { ESTATE_FOCUS_EVENT_NAME } from '../components/workbench/estate/EstateWindow';
import { ESTATE_NAME } from '../lib/estate/ids';
import { RELEASE_OVERRIDE_RANGE, SHELL_TIERS, qualityFromSearch, releaseMsFromSearch, reloadPage } from '../components/workbench/estate/shellDom';
import { EstateLoadError, loadEngine } from '../components/workbench/estate/loadEngine';
import type {
  EstateEngine, EstateEngineEvent, EstateEngineOptions, EstateHudProps, EstateRuntime, EstateView, EstateWalkView,
} from '../components/workbench/estate/engineApi';
import { ESTATE_FOCUS_EVENT } from '../lib/estate/events';
import { ESTATE_REPO } from '../lib/estate/schema';
import { ESTATE_TIERS } from '../lib/estate/tiers';
import { parseQualityOverride } from '../lib/estate/governorCore';
import { ESTATE_REASONS, RELEASE_AFTER_MS } from '../lib/estate/policy';
import { WORKBENCH_OPEN_EVENT } from '../lib/workbench';
import { isGpuClaimed } from '../lib/gpuClaim';

// The Estate window's shell against a FAKE engine (plan §10.2): the real one is
// a lazy chunk with three in it, and none of what is pinned here depends on how
// it draws — only on what the shell asks of it and when. The loader is mocked
// so each test decides when, and whether, the chunk "arrives". The window sits
// in a hand-built desk: a world-3d section (opened and closed by its inline
// display, as FieldWorkbench does) beside one other window.

vi.mock('../components/workbench/estate/loadEngine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/workbench/estate/loadEngine')>()),
  loadEngine: vi.fn(),
}));
const loadMock = vi.mocked(loadEngine);
// Reload is the answer to a failed chunk; jsdom cannot navigate, so it is recorded.
vi.mock('../components/workbench/estate/shellDom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/workbench/estate/shellDom')>()),
  reloadPage: vi.fn(),
}));

/** An event as a test writes it: the fake stamps its own token. Distributes over the union. */
type Untokened<E> = E extends unknown ? Omit<E, 'token'> : never;

interface FakeEngine extends EstateEngine {
  options: EstateEngineOptions;
  canvas: HTMLCanvasElement | null;
  disposed: boolean;
  emit: (event: Untokened<EstateEngineEvent>) => void;
  setView: (patch: Partial<EstateView>) => void;
}

const INITIAL_VIEW: EstateView = {
  location: { site: null, storey: null, unit: null, room: null, mode: 'overview' },
  selection: null, transition: null, flight: false, popover: null, popoverOpen: false,
  moving: false, pointerLocked: false, pointerUnlockedAtMs: null, lean: false,
};

let instances: FakeEngine[];

const createFake = (options: EstateEngineOptions): FakeEngine => {
  let view: EstateView = { ...INITIAL_VIEW, lean: options.lean };
  // The HUD subscribes; the shell hears everything first through options.onEvent.
  const listeners = new Set<(event: EstateEngineEvent) => void>();
  const fake: FakeEngine = {
    token: options.token,
    options,
    canvas: null,
    disposed: false,
    features: { overview: true, fly: true, flyTo: true, walk: false, enter: false, interiors: false, plan: false },
    preload: vi.fn(() => Promise.resolve()),
    // A fresh canvas per instance, appended after React's children, as engineApi says.
    start: vi.fn(() => {
      const canvas = document.createElement('canvas');
      canvas.getContext('webgl2');
      options.host.appendChild(canvas);
      fake.canvas = canvas;
    }),
    freeze: vi.fn(),
    resume: vi.fn(),
    dispose: vi.fn(() => {
      fake.disposed = true;
      fake.canvas?.remove();
      fake.canvas = null;
    }),
    getResume: vi.fn(() => ({ mode: 'overview' as const, selection: view.selection, position: [1, 2, 3] as [number, number, number], target: [4, 5, 6] as [number, number, number] })),
    getView: () => view,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    flyTo: vi.fn((site) => {
      fake.setView({ selection: site, location: { ...view.location, site } });
      return true;
    }),
    enter: vi.fn(() => false),
    setMode: vi.fn(() => false),
    setStorey: vi.fn(() => false),
    takeLift: vi.fn(() => false),
    takeStairs: vi.fn(() => false),
    planView: vi.fn(() => false),
    pickRoom: vi.fn(() => false),
    walkIn: vi.fn(() => false),
    setCut: vi.fn(() => false),
    walkStep: vi.fn(() => false),
    setStick: vi.fn(() => false),
    walkFrom: vi.fn(() => false),
    siteFiles: vi.fn(() => null),
    select: vi.fn((site) => {
      fake.setView({ selection: site });
      return true;
    }),
    home: vi.fn(() => true),
    escape: vi.fn((action) => {
      if (action === 'close-popover') fake.setView({ popover: null, popoverOpen: false });
      if (action === 'clear-selection') fake.setView({ selection: null });
      if (action === 'overview') fake.setView({ location: { ...view.location, mode: 'overview' } });
      return action !== 'none';
    }),
    setPopover: vi.fn(() => true),
    capture: vi.fn(() => false),
    setLean: vi.fn(),
    emit: (event) => act(() => { options.onEvent({ ...event, token: options.token } as EstateEngineEvent); }),
    setView: (patch) => {
      view = { ...view, ...patch };
      const event: EstateEngineEvent = { type: 'location', token: options.token, ...view };
      options.onEvent(event);
      for (const listener of listeners) listener(event);
    },
  };
  instances.push(fake);
  return fake;
};

const FakeHud: React.FC<EstateHudProps> = ({ phase }) => <div data-fake-hud={phase} />;
const runtime: EstateRuntime = { createEngine: vi.fn(createFake), EstateHud: FakeHud };

interface Deferred { resolve: (value: EstateRuntime) => void; reject: (error: unknown) => void }
let pendingLoad: Deferred | null;

const deferLoad = () => loadMock.mockImplementation(() => new Promise<EstateRuntime>((resolve, reject) => {
  pendingLoad = { resolve, reject };
}));

// Microtasks: MutationObserver records, the loaders' promises. The window
// imports its controller chunk when it first opens; awaiting the same import
// here means the window's own import has settled too, whatever the timers.
const flush = () => act(async () => {
  await import('../components/workbench/estate/EstateController');
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
});

let idle: Array<() => void>;
const runIdle = () => act(() => { idle.splice(0).forEach((callback) => callback()); });

type Device = { saveData: boolean; reducedMotion: boolean };
const ALLOWED: Device = { saveData: false, reducedMotion: false };
const SAVE_DATA: Device = { saveData: true, reducedMotion: false };

// A desk with Home open beside the Estate, so closing the Estate alone is not DESK.
const Desk: React.FC<{ open?: boolean; homeOpen?: boolean; focused?: boolean; device?: Device | null; strict?: boolean }> = ({
  open = true, homeOpen = true, focused = true, device = ALLOWED, strict = false,
}) => {
  const desk = (
    <main data-desk>
      <button type="button" className="wb-rail-desk">DESK</button>
      <section data-win="home" style={{ display: homeOpen ? 'flex' : 'none' }}><button type="button">Home body</button></section>
      <section data-win="world-3d" data-focused={focused || undefined} style={{ display: open ? 'flex' : 'none' }}>
        <header className="wb-titlebar"><button type="button" aria-label="Close Estate">×</button></header>
        <div data-scroll="world-3d"><EstateWindow /></div>
      </section>
    </main>
  );
  const tree = device ? <ExperienceModeProvider capabilities={device}>{desk}</ExperienceModeProvider> : desk;
  return strict ? <React.StrictMode>{tree}</React.StrictMode> : tree;
};

const phaseOf = (container: HTMLElement) => container.querySelector('#world')?.getAttribute('data-estate-phase');
const stageOf = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-estate-stage]')!;
const stateText = (container: HTMLElement) => container.querySelector('.wb-estate-state')?.textContent ?? '';
const actionButton = (container: HTMLElement) => container.querySelector<HTMLButtonElement>('[data-estate-action]');

/** Mount allowed, let the idle callback start the load, deliver the chunk, emit ready: live. */
const mountLive = async (props: React.ComponentProps<typeof Desk> = {}) => {
  loadMock.mockResolvedValue(runtime);
  const view = render(<Desk {...props} />);
  await flush();
  runIdle();
  await flush();
  const engine = instances[instances.length - 1];
  engine.emit({ type: 'ready', tier: 'mid', msaa: false, programs: 6 });
  await flush();
  return { ...view, engine };
};

let rafSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  instances = [];
  pendingLoad = null;
  idle = [];
  loadMock.mockReset();
  vi.mocked(reloadPage).mockClear();
  vi.mocked(runtime.createEngine).mockClear();
  rafSpy = vi.fn(() => 1);
  vi.stubGlobal('requestAnimationFrame', rafSpy);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('requestIdleCallback', vi.fn((callback: () => void) => idle.push(callback)));
  vi.stubGlobal('cancelIdleCallback', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Estate window — loading', () => {
  it('closed: no import, no frames, no engine', async () => {
    loadMock.mockResolvedValue(runtime);
    const { container } = render(<Desk open={false} />);
    await flush();
    runIdle();
    await flush();
    expect(phaseOf(container)).toBe('poster');
    expect(loadMock).not.toHaveBeenCalled();
    expect(runtime.createEngine).not.toHaveBeenCalled();
    expect(rafSpy).not.toHaveBeenCalled();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('open and allowed: one load, one engine, one start, and StrictMode leaves exactly one canvas', async () => {
    const { container, engine } = await mountLive({ strict: true });
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(runtime.createEngine).toHaveBeenCalledTimes(1);
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(engine.options.host).toBe(stageOf(container));
    expect(engine.options.packUrl).toMatch(/^\/estate\/v\d+\.\d+\/pack\.[0-9a-f]{8}\.json$/);
    expect(stageOf(container).querySelectorAll('canvas')).toHaveLength(1);
    expect(phaseOf(container)).toBe('live');
    // Only now is the stage a keyboard viewport.
    const stage = stageOf(container);
    expect(stage.getAttribute('role')).toBe('application');
    expect(stage.tabIndex).toBe(0);
    // Described by the HUD's always-present key summary: #estate-keys sits in a
    // closed <details>, outside the accessibility tree until opened.
    expect(stage.getAttribute('aria-describedby')).toBe('estate-keys-desc');
    expect(container.querySelector('[data-fake-hud="live"]')).not.toBeNull();
    // An automatic load never moves focus.
    expect(document.activeElement).toBe(document.body);
  });

  it('waits for consent under Save-Data, then loads on the click and focuses the stage', async () => {
    loadMock.mockResolvedValue(runtime);
    const { container } = render(<Desk device={SAVE_DATA} />);
    await flush();
    runIdle();
    expect(phaseOf(container)).toBe('consent');
    expect(stageOf(container).hasAttribute('role')).toBe(false);
    expect(stageOf(container).hasAttribute('tabindex')).toBe(false);
    expect(loadMock).not.toHaveBeenCalled();
    const load = actionButton(container)!;
    expect(load.textContent).toMatch(/^Load the 3D estate · \d+\.\d MB$/);
    expect(stateText(container)).toBe('Still render · held: Data Saver is on.');

    act(() => { load.focus(); fireEvent.click(load); });
    await flush();
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(phaseOf(container)).toBe('loading');
    // The button went away; focus did not fall to the body.
    expect(document.activeElement).toBe(stageOf(container));
    const engine = instances[0];
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(engine.options.lean).toBe(true);
    engine.emit({ type: 'ready', tier: 'low', msaa: false, programs: 6 });
    await flush();
    expect(phaseOf(container)).toBe('live');
    expect(document.activeElement).toBe(stageOf(container));
  });

  it('a load that lands after the visitor went to another window leaves focus and the stack alone', async () => {
    let resolveLoad: (value: EstateRuntime) => void = () => {};
    loadMock.mockImplementation(() => new Promise<EstateRuntime>((resolve) => { resolveLoad = resolve; }));
    const { container } = render(<Desk device={SAVE_DATA} />);
    await flush();
    runIdle();
    const load = actionButton(container)!;
    act(() => { load.focus(); fireEvent.click(load); });
    await flush();
    expect(phaseOf(container)).toBe('loading');
    // The visitor presses another window and focuses something in it.
    const other = container.querySelector<HTMLButtonElement>('section[data-win="home"] button')!;
    act(() => { other.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); other.focus(); });
    const opens: unknown[] = [];
    const onOpen = (event: Event) => opens.push((event as CustomEvent).detail);
    window.addEventListener(WORKBENCH_OPEN_EVENT, onOpen);
    try {
      await act(async () => { resolveLoad(runtime); });
      await flush();
      instances[0].emit({ type: 'ready', tier: 'low', msaa: false, programs: 6 });
      await flush();
      expect(phaseOf(container)).toBe('live');
      expect(document.activeElement).toBe(other);
      expect(opens).toEqual([]);
    } finally {
      window.removeEventListener(WORKBENCH_OPEN_EVENT, onOpen);
    }
  });

  it('a deep link without the experience provider stays on the poster', async () => {
    loadMock.mockResolvedValue(runtime);
    const { container } = render(<Desk device={null} />);
    await flush();
    runIdle();
    expect(phaseOf(container)).toBe('poster');
    expect(loadMock).not.toHaveBeenCalled();
  });

  it('unmounted while the chunk downloads: the module is discarded and never touches the GPU', async () => {
    deferLoad();
    const { unmount } = render(<Desk />);
    await flush();
    runIdle();
    await flush();
    expect(loadMock).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => { pendingLoad!.resolve(runtime); });
    await flush();
    expect(runtime.createEngine).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
  });

  it('closed while the chunk downloads: the first frame may preload, no renderer until it opens', async () => {
    deferLoad();
    const { container, rerender } = render(<Desk />);
    await flush();
    runIdle();
    await flush();
    rerender(<Desk open={false} />);
    await flush();
    await act(async () => { pendingLoad!.resolve(runtime); });
    await flush();
    const engine = instances[0];
    expect(engine.preload).toHaveBeenCalledTimes(1);
    expect(engine.start).not.toHaveBeenCalled();
    expect(container.querySelector('canvas')).toBeNull();
    rerender(<Desk open />);
    await flush();
    expect(engine.start).toHaveBeenCalledTimes(1);
  });
});

describe('Estate window — lifecycle', () => {
  it('close freezes; reopening at 10 s resumes; 30 s closed disposes and reopening resumes the pose', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { container, engine, rerender } = await mountLive();
    rerender(<Desk open={false} />);
    await flush();
    expect(phaseOf(container)).toBe('frozen');
    expect(engine.freeze).toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    rerender(<Desk open />);
    await flush();
    expect(phaseOf(container)).toBe('live');
    expect(engine.resume).toHaveBeenCalled();
    expect(engine.dispose).not.toHaveBeenCalled();

    rerender(<Desk open={false} />);
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(RELEASE_AFTER_MS - 1); });
    expect(engine.dispose).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await flush();
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    expect(phaseOf(container)).toBe('poster');
    expect(container.querySelector('canvas')).toBeNull();

    rerender(<Desk open />);
    await flush();
    runIdle();
    await flush();
    expect(instances).toHaveLength(2);
    expect(instances[1].options.resume).toEqual({ mode: 'overview', selection: null, position: [1, 2, 3], target: [4, 5, 6] });
    expect(instances[1].token).not.toBe(engine.token);
  });

  it('a context lost while closed and never restored is released on reopen and loaded afresh, never shown live on the dead one', async () => {
    const { container, engine, rerender } = await mountLive();
    const resumes = vi.mocked(engine.resume).mock.calls.length;
    rerender(<Desk open={false} />);
    await flush();
    engine.emit({ type: 'lost', frozen: true });
    await flush();
    expect(phaseOf(container)).toBe('frozen'); // uncounted, unseen
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(String(phaseOf(container))));
    observer.observe(container.querySelector('#world')!, { attributes: true, attributeFilter: ['data-estate-phase'] });
    rerender(<Desk open />);
    await flush();
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    expect(vi.mocked(engine.resume).mock.calls.length).toBe(resumes);
    runIdle();
    await flush();
    expect(instances).toHaveLength(2);
    expect(instances[1].options.resume).toEqual({ mode: 'overview', selection: null, position: [1, 2, 3], target: [4, 5, 6] });
    instances[1].emit({ type: 'ready', tier: 'mid', msaa: false, programs: 6 });
    await flush();
    observer.disconnect();
    expect(phaseOf(container)).toBe('live');
    // Live only once the new instance is: never on the lost one, never a failure.
    expect(seen.indexOf('live')).toBe(seen.length - 1);
    expect(seen).not.toContain('lost');
    expect(seen).not.toContain('unavailable');
  });

  it('holds the GPU only while live, focused and under no panel', async () => {
    const { engine, rerender } = await mountLive();
    expect(isGpuClaimed()).toBe(true);
    // The AI or FX panel's modal backdrop: the stage cannot have focus behind it.
    const backdrop = document.createElement('div');
    backdrop.className = 'panel-backdrop';
    document.body.appendChild(backdrop);
    await flush();
    expect(isGpuClaimed()).toBe(false);
    backdrop.remove();
    await flush();
    expect(isGpuClaimed()).toBe(true);
    rerender(<Desk focused={false} />);
    await flush();
    expect(isGpuClaimed()).toBe(false);
    rerender(<Desk />);
    await flush();
    expect(isGpuClaimed()).toBe(true);
    rerender(<Desk open={false} />);
    await flush();
    expect(isGpuClaimed()).toBe(false);
    expect(engine.freeze).toHaveBeenCalled();
  });

  it('DESK (every window closed at once) releases without waiting', async () => {
    const { container, engine, rerender } = await mountLive();
    fireEvent.click(container.querySelector('.wb-rail-desk')!);
    rerender(<Desk open={false} homeOpen={false} />);
    await flush();
    expect(engine.dispose).toHaveBeenCalledTimes(1);
  });

  it('closing the last open window by hand is an ordinary close: frozen, and resumed on reopen', async () => {
    const { engine, rerender } = await mountLive({ homeOpen: false });
    rerender(<Desk open={false} homeOpen={false} />);
    await flush();
    expect(engine.freeze).toHaveBeenCalled();
    expect(engine.dispose).not.toHaveBeenCalled();
    rerender(<Desk homeOpen={false} />);
    await flush();
    expect(engine.resume).toHaveBeenCalled();
    expect(instances).toHaveLength(1);
  });

  it('ignores events from an instance it has dropped', async () => {
    const { container, engine } = await mountLive();
    engine.emit({ type: 'unavailable', reason: 'no-webgl2' });
    await flush();
    expect(phaseOf(container)).toBe('unavailable');
    engine.emit({ type: 'ready', tier: 'mid', msaa: false, programs: 6 });
    await flush();
    expect(phaseOf(container)).toBe('unavailable');
  });
});

describe('Estate window — focus through a GPU reset', () => {
  it('moves focus from the stage to Retry when a live context is lost, and back when it returns', async () => {
    const { container, engine } = await mountLive();
    act(() => { stageOf(container).focus(); });
    engine.emit({ type: 'lost', frozen: false });
    await flush();
    expect(phaseOf(container)).toBe('lost');
    expect(document.activeElement).toBe(actionButton(container));
    expect(actionButton(container)?.textContent).toBe('Retry');
    engine.emit({ type: 'restored' });
    await flush();
    expect(phaseOf(container)).toBe('live');
    expect(document.activeElement).toBe(stageOf(container));
  });

  it('never pulls focus from another window when the reset happens', async () => {
    const { container, engine } = await mountLive();
    const other = container.querySelector<HTMLButtonElement>('section[data-win="home"] button')!;
    act(() => { other.focus(); });
    engine.emit({ type: 'lost', frozen: false });
    await flush();
    expect(document.activeElement).toBe(other);
  });
});

describe('Estate window — failures', () => {

  it('a live context loss shows the reason and Retry; a restore goes back to live', async () => {
    const { container, engine } = await mountLive();
    engine.emit({ type: 'lost', frozen: false });
    await flush();
    expect(phaseOf(container)).toBe('lost');
    expect(stateText(container)).toBe(ESTATE_REASONS.lost);
    expect(actionButton(container)?.textContent).toBe('Retry');
    expect(container.querySelector('.wb-estate-plate')?.textContent).toContain(ESTATE_REASONS.lost);
    engine.emit({ type: 'restored' });
    await flush();
    expect(phaseOf(container)).toBe('live');
    expect(engine.dispose).not.toHaveBeenCalled();
  });

  it('two live resets in a minute make it unavailable, with Reload', async () => {
    const { container, engine } = await mountLive();
    engine.emit({ type: 'lost', frozen: false });
    engine.emit({ type: 'restored' });
    engine.emit({ type: 'lost', frozen: false });
    await flush();
    expect(phaseOf(container)).toBe('unavailable');
    expect(stateText(container)).toBe(ESTATE_REASONS.resets);
    expect(actionButton(container)?.textContent).toBe('Reload');
    expect(engine.dispose).toHaveBeenCalledTimes(1);
  });

  it('a live loss with no restore inside 5 s makes it unavailable', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { container, engine } = await mountLive();
    engine.emit({ type: 'lost', frozen: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
    expect(phaseOf(container)).toBe('lost');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await flush();
    expect(phaseOf(container)).toBe('unavailable');
    expect(stateText(container)).toBe(ESTATE_REASONS.noRestore);
    expect(engine.dispose).toHaveBeenCalledTimes(1);
  });

  it('a loss while frozen is not counted and shows nothing: restored meanwhile, the same instance is live on reopen', async () => {
    const { container, engine, rerender } = await mountLive();
    rerender(<Desk open={false} />);
    await flush();
    engine.emit({ type: 'lost', frozen: true });
    await flush();
    expect(phaseOf(container)).toBe('frozen');
    engine.emit({ type: 'restored' });
    rerender(<Desk open />);
    await flush();
    expect(phaseOf(container)).toBe('live');
    expect(engine.dispose).not.toHaveBeenCalled();
    // (Not restored by the time it is seen: released and loaded afresh, the lifecycle case above.)
  });

  it('no WebGL2: unavailable, the engine disposed, the registry still there', async () => {
    const { container, engine } = await mountLive();
    engine.emit({ type: 'unavailable', reason: 'no-webgl2' });
    await flush();
    expect(phaseOf(container)).toBe('unavailable');
    expect(stateText(container)).toBe(ESTATE_REASONS.unsupported);
    expect(actionButton(container)?.textContent).toBe('Reload');
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('[data-estate-site]')).toHaveLength(14);
    expect(stageOf(container).hasAttribute('role')).toBe(false);
  });

  it('a chunk that 404s after a redeploy is stale: Reload, no retry', async () => {
    loadMock.mockRejectedValue(new EstateLoadError('stale', new Error('404')));
    const { container } = render(<Desk />);
    await flush();
    runIdle();
    await flush();
    expect(phaseOf(container)).toBe('stale');
    expect(stateText(container)).toBe(ESTATE_REASONS.stale);
    expect(actionButton(container)?.textContent).toBe('Reload');
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it('an engine chunk that failed to load offers Reload: a failed import() never fetches again', async () => {
    loadMock.mockRejectedValueOnce(new EstateLoadError('failed', new Error('Failed to fetch dynamically imported module')));
    loadMock.mockResolvedValue(runtime);
    const { container } = render(<Desk />);
    await flush();
    runIdle();
    await flush();
    expect(phaseOf(container)).toBe('error');
    expect(stateText(container)).toBe('The 3D viewer did not download. Reload to try again.');
    expect(actionButton(container)?.textContent).toBe('Reload');
    act(() => { fireEvent.click(actionButton(container)!); });
    await flush();
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it('a failure after the chunk ran (the engine says error) keeps Retry, which builds a new instance', async () => {
    const { container, engine } = await mountLive();
    engine.emit({ type: 'error', message: 'pack.json: 503' });
    await flush();
    expect(phaseOf(container)).toBe('error');
    expect(stateText(container)).toBe(ESTATE_REASONS.error);
    expect(actionButton(container)?.textContent).toBe('Retry');
    act(() => { fireEvent.click(actionButton(container)!); });
    await flush();
    expect(reloadPage).not.toHaveBeenCalled();
    expect(instances).toHaveLength(2);
    expect(instances[1].start).toHaveBeenCalledTimes(1);
  });

  it('a pack file that 404s mid-load (the engine says stale) is stale too', async () => {
    loadMock.mockResolvedValue(runtime);
    const { container } = render(<Desk />);
    await flush();
    runIdle();
    await flush();
    instances[0].emit({ type: 'stale', url: '/estate/v1.2/f/BLK_509.deadbeef.glb.gz' });
    await flush();
    expect(phaseOf(container)).toBe('stale');
    expect(instances[0].dispose).toHaveBeenCalledTimes(1);
  });
});

describe('Estate window — focus requests, Esc and raising', () => {
  it('holds focus requests until live, delivers the latest once, and never moves DOM focus', async () => {
    deferLoad();
    const { container } = render(<Desk />);
    await flush();
    const dispatch = (detail: unknown) => act(() => { window.dispatchEvent(new CustomEvent(ESTATE_FOCUS_EVENT, { detail })); });
    dispatch({ site: 'BLK_599' }); // not a site: ignored
    dispatch({ site: 'BLK_501' });
    dispatch({ site: 'BLK_509', storey: 'L99' });
    expect(container.querySelector('[data-estate-site="BLK_509"]')?.getAttribute('aria-pressed')).toBe('true');
    runIdle();
    await flush();
    await act(async () => { pendingLoad!.resolve(runtime); });
    await flush();
    const engine = instances[0];
    expect(engine.flyTo).not.toHaveBeenCalled();
    engine.emit({ type: 'ready', tier: 'mid', msaa: false, programs: 6 });
    await flush();
    expect(engine.flyTo).toHaveBeenCalledTimes(1);
    expect(engine.flyTo).toHaveBeenCalledWith('BLK_509');
    expect(document.activeElement).toBe(document.body);
    // Live, a request applies at once.
    dispatch({ site: 'NC_514' });
    expect(engine.flyTo).toHaveBeenLastCalledWith('NC_514');
    expect(engine.flyTo).toHaveBeenCalledTimes(2);
  });

  it('applies a held request by what it asks: a storey opens Plan there, enter walks in (at that storey), else a fly-to (P6)', async () => {
    const { engine } = await mountLive();
    Object.assign(engine.features, { walk: true, enter: true, interiors: true, plan: true });
    vi.mocked(engine.planView).mockReturnValue(true);
    vi.mocked(engine.enter).mockReturnValue(true);
    const dispatch = (detail: unknown) => act(() => { window.dispatchEvent(new CustomEvent(ESTATE_FOCUS_EVENT, { detail })); });
    dispatch({ site: 'BLK_509', storey: 'L05' });
    expect(engine.planView).toHaveBeenLastCalledWith('BLK_509', 'L5');
    dispatch({ site: 'NC_514', enter: true });
    expect(engine.enter).toHaveBeenLastCalledWith('NC_514', undefined);
    dispatch({ site: 'BLK_509', storey: 'L12', enter: true });
    expect(engine.enter).toHaveBeenLastCalledWith('BLK_509', { storey: 'L12' });
    expect(engine.planView).toHaveBeenCalledTimes(1);
    // A storey the building lacks is dropped: a plain fly-to.
    dispatch({ site: 'MSCP_513', storey: 'L9' });
    expect(engine.flyTo).toHaveBeenLastCalledWith('MSCP_513');
    expect(document.activeElement).toBe(document.body);
  });

  it('in consent, a focus request highlights its row and says to load first, without moving focus', async () => {
    const { container } = render(<Desk device={SAVE_DATA} />);
    await flush();
    act(() => { window.dispatchEvent(new CustomEvent(ESTATE_FOCUS_EVENT, { detail: { site: 'NC_514', enter: true } })); });
    await flush();
    expect(container.querySelector('[data-estate-site="NC_514"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.wb-estate-state .wb-estate-notice')?.textContent).toBe('Load the 3D estate to fly there.');
    expect(document.activeElement).toBe(document.body);
  });

  it('draws the runtime’s room list in the side panel, above BUILDINGS, with the HUD’s props, while the HUD is drawn (P6)', async () => {
    const Rooms: React.FC<EstateHudProps> = ({ phase, engine }) => <section data-fake-rooms={phase} data-token={engine.token} />;
    const withRooms: EstateRuntime = { ...runtime, EstatePlanRooms: Rooms };
    loadMock.mockResolvedValue(withRooms);
    const { container } = render(<Desk />);
    await flush();
    runIdle();
    await flush();
    expect(container.querySelector('[data-fake-rooms]')).toBeNull();
    const engine = instances[instances.length - 1];
    engine.emit({ type: 'ready', tier: 'mid', msaa: false, programs: 6 });
    await flush();
    const rooms = container.querySelector('aside [data-fake-rooms]')!;
    expect(rooms.getAttribute('data-fake-rooms')).toBe('live');
    expect(rooms.getAttribute('data-token')).toBe(String(engine.token));
    // Between the status line and BUILDINGS.
    expect(rooms.previousElementSibling?.classList.contains('wb-estate-action')).toBe(true);
    expect(rooms.nextElementSibling?.textContent).toBe('BUILDINGS');
  });

  it('in consent, a row press highlights it and says to load first', async () => {
    const { container } = render(<Desk device={SAVE_DATA} />);
    await flush();
    act(() => { fireEvent.click(container.querySelector('[data-estate-site="MSCP_513"]')!); });
    expect(container.querySelector('[data-estate-site="MSCP_513"]')?.getAttribute('aria-pressed')).toBe('true');
    // In the polite status line beside the Load button, not under fourteen rows.
    expect(container.querySelector('.wb-estate-state .wb-estate-notice')?.textContent).toBe('Load the 3D estate to fly there.');
    expect(stateText(container)).toBe('Load the 3D estate to fly there. Still render · held: Data Saver is on.');
  });

  it('live, a row flies there and puts the keys on the stage', async () => {
    const { container, engine } = await mountLive();
    const row = container.querySelector<HTMLButtonElement>('[data-estate-site="BLK_509"]')!;
    expect(row.textContent).toMatch(/^Fly to Blk 509/);
    act(() => { fireEvent.click(row); });
    expect(engine.flyTo).toHaveBeenCalledWith('BLK_509');
    expect(document.activeElement).toBe(stageOf(container));
    await flush();
    expect(row.getAttribute('aria-pressed')).toBe('true');
  });

  it('Esc peels one layer from a registry button and passes only when nothing is left', async () => {
    const { container, engine } = await mountLive();
    const minimise = vi.fn();
    window.addEventListener('keydown', minimise);
    try {
      const row = container.querySelector<HTMLButtonElement>('[data-estate-site="BLK_510"]')!;
      act(() => { fireEvent.click(row); row.focus(); });
      engine.setPopover('help');
      act(() => { engine.setView({ popover: 'help', popoverOpen: true }); });

      fireEvent.keyDown(row, { key: 'Escape', code: 'Escape' });
      expect(engine.escape).toHaveBeenLastCalledWith('close-popover');
      expect(minimise).not.toHaveBeenCalled();

      fireEvent.keyDown(row, { key: 'Escape', code: 'Escape' });
      expect(engine.escape).toHaveBeenLastCalledWith('clear-selection');
      expect(minimise).not.toHaveBeenCalled();

      fireEvent.keyDown(row, { key: 'Escape', code: 'Escape' });
      expect(engine.escape).toHaveBeenCalledTimes(2);
      expect(minimise).toHaveBeenCalledTimes(1); // the workbench's turn: it minimises
    } finally {
      window.removeEventListener('keydown', minimise);
    }
  });

  it('Esc in Fly goes back to Overview first, from the stage', async () => {
    const { container, engine } = await mountLive();
    act(() => { engine.setView({ location: { ...engine.getView().location, mode: 'fly' } }); });
    const minimise = vi.fn();
    window.addEventListener('keydown', minimise);
    try {
      fireEvent.keyDown(stageOf(container), { key: 'Escape', code: 'Escape' });
      expect(engine.escape).toHaveBeenLastCalledWith('overview');
      expect(minimise).not.toHaveBeenCalled();
      fireEvent.keyDown(stageOf(container), { key: 'Escape', code: 'Escape' });
      expect(minimise).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', minimise);
    }
  });

  it('Esc passes straight through while nothing is loaded', async () => {
    const { container } = render(<Desk device={SAVE_DATA} />);
    await flush();
    const minimise = vi.fn();
    window.addEventListener('keydown', minimise);
    try {
      fireEvent.keyDown(actionButton(container)!, { key: 'Escape', code: 'Escape' });
      expect(minimise).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', minimise);
    }
  });

  it('a press in the body raises an unfocused window; the titlebar and a focused window do not', async () => {
    const opened = vi.fn();
    window.addEventListener(WORKBENCH_OPEN_EVENT, opened);
    try {
      const { container, rerender } = render(<Desk device={SAVE_DATA} focused={false} />);
      await flush();
      fireEvent.pointerDown(container.querySelector('[data-estate-site="BLK_501"]')!);
      expect(opened).toHaveBeenCalledTimes(1);
      expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({ appId: 'world-3d' });
      fireEvent.pointerDown(container.querySelector('.wb-titlebar button')!);
      expect(opened).toHaveBeenCalledTimes(1);
      rerender(<Desk device={SAVE_DATA} focused />);
      await flush();
      fireEvent.focusIn(actionButton(container)!);
      expect(opened).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(WORKBENCH_OPEN_EVENT, opened);
    }
  });
});

describe('Estate window — inside the workbench, with the real HUD module', () => {
  it('Esc clears a selection and keeps the window; the next Esc is the workbench’s and minimises it', async () => {
    window.history.replaceState(null, '', '/?app=world-3d');
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => frames.push(callback)));
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    // The other windows' labs want one; it never reports, so the stage stays "on screen".
    vi.stubGlobal('IntersectionObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
    // …and a 2D context for the mechanism bench: every method a no-op.
    const ctx = new Proxy({} as Record<string | symbol, unknown>, { get: (target, key) => (target[key] ??= vi.fn()) });
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(() => ctx as never);
    const runFrames = () => act(() => { for (let i = 0; i < frames.length && i < 200; i += 1) frames[i]!(16 * i); frames.length = 0; });
    const { EstateHud } = await import('../components/workbench/estate/live/EstateHud');
    const { default: FieldWorkbench } = await import('../components/workbench/FieldWorkbench');
    loadMock.mockResolvedValue({ createEngine: runtime.createEngine, EstateHud });
    try {
      const { container } = render(<ExperienceModeProvider capabilities={ALLOWED}><FieldWorkbench /></ExperienceModeProvider>);
      runFrames();
      await flush();
      runIdle();
      await flush();
      const engine = instances[0];
      engine.emit({ type: 'ready', tier: 'mid', msaa: false, programs: 6 });
      await flush();
      runFrames();
      const win = container.querySelector<HTMLElement>('[data-win="world-3d"]')!;
      expect(win.hasAttribute('data-focused')).toBe(true);
      expect(phaseOf(container)).toBe('live');

      act(() => { fireEvent.click(container.querySelector('[data-estate-site="NC_514"]')!); });
      const stage = stageOf(container);
      expect(document.activeElement).toBe(stage);
      fireEvent.keyDown(stage, { key: 'Escape', code: 'Escape' });
      expect(engine.escape).toHaveBeenLastCalledWith('clear-selection');
      expect(win.style.display).toBe('flex');

      fireEvent.keyDown(stage, { key: 'Escape', code: 'Escape' });
      await flush();
      expect(win.style.display).toBe('none');

      // Every control the window offers has a name a screen reader can say.
      for (const button of win.querySelectorAll('button')) {
        const name = (button.getAttribute('aria-label') ?? button.textContent ?? '').trim();
        expect(name, button.outerHTML.slice(0, 80)).not.toBe('');
      }
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});

describe('Estate window — Walk, with the real HUD module inside the workbench', () => {
  const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'L16'] as const;
  const WALK: EstateWalkView = {
    site: 'BLK_509',
    storey: 'L5',
    preparing: false,
    lift: { name: 'Lift 3', text: 'LIFT 3 · CHOOSE A LEVEL', current: 'L5', served: LEVELS },
    stair: null,
    ride: null,
    levels: [
      ...LEVELS.map((tag, i) => ({ tag, ffl: i === 0 ? 0 : 0.8 + 2.8 * i, route: tag === 'L5' ? 'here' as const : 'lift' as const, reason: null })),
      { tag: 'RF', ffl: 45.6, route: null, reason: 'No lift or stair reaches RF' },
    ],
  };

  /** FieldWorkbench with the real HUD over a fake engine that has Walk and Enter, live and walking on Blk 509's L5 by Lift 3. */
  const mountWalking = async () => {
    window.history.replaceState(null, '', '/?app=world-3d');
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => frames.push(callback)));
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    vi.stubGlobal('IntersectionObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
    const ctx = new Proxy({} as Record<string | symbol, unknown>, { get: (target, key) => (target[key] ??= vi.fn()) });
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(() => ctx as never);
    const runFrames = () => act(() => { for (let i = 0; i < frames.length && i < 200; i += 1) frames[i]!(16 * i); frames.length = 0; });
    const { EstateHud } = await import('../components/workbench/estate/live/EstateHud');
    const { default: FieldWorkbench } = await import('../components/workbench/FieldWorkbench');
    loadMock.mockResolvedValue({ createEngine: runtime.createEngine, EstateHud });
    const view = render(<ExperienceModeProvider capabilities={ALLOWED}><FieldWorkbench /></ExperienceModeProvider>);
    runFrames();
    await flush();
    runIdle();
    await flush();
    const engine = instances[0];
    Object.assign(engine.features, { walk: true, enter: true, interiors: true });
    // The engine's own popover rule: the lift panel only with a lift on offer.
    engine.setPopover = vi.fn((popover) => {
      if (popover === engine.getView().popover || (popover === 'lift' && !engine.getView().walk?.lift)) return false;
      engine.setView({ popover, popoverOpen: popover !== null });
      return true;
    });
    engine.setStorey = vi.fn(() => true);
    engine.setStick = vi.fn(() => true);
    engine.siteFiles = vi.fn(() => ({ name: 'Blk 509', facade: { bytes: 89_117 }, detail: { bytes: 21_153 }, interior: { bytes: 47_728 }, walk: { bytes: 16_732 }, nav: { bytes: 14_580 } }));
    engine.emit({ type: 'ready', tier: 'mid', msaa: false, programs: 6 });
    await flush();
    runFrames();
    act(() => engine.setView({
      location: { site: 'BLK_509', storey: 'L5', unit: null, room: 'Common corridor', mode: 'walk' },
      selection: 'BLK_509',
      walk: WALK,
      interior: { site: 'BLK_509', state: 'ready', storey: 'L5', band: 'L4–L6', reason: null },
    }));
    const win = view.container.querySelector<HTMLElement>('[data-win="world-3d"]')!;
    return { ...view, engine, win };
  };

  afterEach(() => { window.history.replaceState(null, '', '/'); });

  it('Tab to a lift level, Esc closes the panel and keeps the window; Esc in Overview at last minimises it', async () => {
    const { container, engine, win } = await mountWalking();
    expect(phaseOf(container)).toBe('live');
    const lift = container.querySelector<HTMLButtonElement>('[data-estate-lift]')!;
    expect(lift.textContent).toBe('LIFT 3 · CHOOSE A LEVEL');
    act(() => { fireEvent.click(lift); });
    expect(engine.setPopover).toHaveBeenLastCalledWith('lift');
    const panel = container.querySelector<HTMLElement>('[data-estate-popover="lift"]')!;
    expect(panel.getAttribute('aria-label')).toBe('Lift 3, levels');
    expect(lift.getAttribute('aria-expanded')).toBe('true');
    // The storey underfoot is listed and disabled; the others ride.
    const here = [...panel.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'L5, here')!;
    expect(here.disabled).toBe(true);
    const l12 = [...panel.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Lift 3 to L12')!;
    expect(l12.disabled).toBe(false);
    // Every control in the window has a name a screen reader can say, panel open.
    for (const button of win.querySelectorAll('button')) {
      const name = (button.getAttribute('aria-label') ?? button.textContent ?? '').trim();
      expect(name, button.outerHTML.slice(0, 80)).not.toBe('');
    }

    // A keyboard visitor in the panel: Esc closes it (layer 1), the window stays, focus goes back to the lift chip.
    act(() => { l12.focus(); });
    act(() => { fireEvent.keyDown(l12, { key: 'Escape', code: 'Escape' }); });
    expect(engine.escape).toHaveBeenLastCalledWith('close-popover');
    expect(container.querySelector('[data-estate-popover="lift"]')).toBeNull();
    expect(win.style.display).toBe('flex');
    expect(document.activeElement).toBe(container.querySelector('[data-estate-lift]'));

    // From that HUD button: Walk → Overview, then the selection, then the window.
    act(() => { fireEvent.keyDown(document.activeElement!, { key: 'Escape', code: 'Escape' }); });
    expect(engine.escape).toHaveBeenLastCalledWith('overview');
    expect(win.style.display).toBe('flex');
    const stage = stageOf(container);
    act(() => { stage.focus(); });
    act(() => { fireEvent.keyDown(stage, { key: 'Escape', code: 'Escape' }); });
    expect(engine.escape).toHaveBeenLastCalledWith('clear-selection');
    expect(win.style.display).toBe('flex');
    act(() => { fireEvent.keyDown(stage, { key: 'Escape', code: 'Escape' }); });
    await flush();
    expect(win.style.display).toBe('none');
  });

  it('Enter on a focused HUD button is the button’s, never a stage action; the strip routes and explains', async () => {
    const { container, engine } = await mountWalking();
    const strip = container.querySelector<HTMLElement>('.wb-estate-strip')!;
    expect(strip.getAttribute('aria-label')).toBe('Storeys of Blk 509');
    const names = [...strip.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    // Top down, from the data; the storey underfoot current, a storey nothing reaches disabled with why.
    expect(names[0]).toBe('RF +45.60, No lift or stair reaches RF');
    expect(names.at(-1)).toBe('L1 ±0.00, by lift');
    // Unreachable: aria-disabled, not disabled, so Tab reaches it and its reason can be heard;
    // pressing it asks the engine, which refuses and says why (and focus stays on it).
    const rf = strip.querySelector<HTMLButtonElement>('[data-route="none"]')!;
    expect(rf.disabled).toBe(false);
    expect(rf.getAttribute('aria-disabled')).toBe('true');
    act(() => { rf.focus(); });
    act(() => { fireEvent.click(rf); });
    expect(engine.setStorey).toHaveBeenLastCalledWith('RF');
    expect(document.activeElement).toBe(rf);
    vi.mocked(engine.setStorey).mockClear();
    const here = strip.querySelector<HTMLButtonElement>('[aria-current]')!;
    expect(here.getAttribute('aria-label')).toBe('L5 +12.00, here');
    expect(here.disabled).toBe(true);
    const l12 = [...strip.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'L12 +31.60, by lift')!;
    act(() => { l12.focus(); });
    const enter = fireEvent.keyDown(l12, { key: 'Enter', code: 'Enter' });
    // Not consumed by any stage listener, and no engine command ran on the keydown.
    expect(enter).toBe(true);
    expect(engine.setStorey).not.toHaveBeenCalled();
    expect(engine.enter).not.toHaveBeenCalled();
    act(() => { fireEvent.click(l12); });
    expect(engine.setStorey).toHaveBeenLastCalledWith('L12');
    // Enter and Exit, mirrored: in Walk the HUD offers Exit and the registry's row says the same.
    expect(container.querySelector('[data-estate-exit]')!.textContent).toBe('Exit Blk 509');
    expect(container.querySelector('[data-estate-row-action="exit"]')!.textContent).toBe('Exit Blk 509');
  });

  it('a first touch shows the 96 px stick in Walk; its deflection goes to setStick, and letting go releases it', async () => {
    const { container, engine } = await mountWalking();
    expect(container.querySelector('[data-estate-stick]')).toBeNull();
    const stage = stageOf(container);
    act(() => { fireEvent.pointerDown(stage, { pointerType: 'touch', pointerId: 7 }); });
    const stick = container.querySelector<HTMLElement>('[data-estate-stick]')!;
    expect(stick).not.toBeNull();
    expect(stick.getAttribute('aria-hidden')).toBe('true');
    // jsdom lays nothing out: the stick's centre is (0, 0), and 34 px is a full deflection.
    act(() => { fireEvent.pointerDown(stick, { pointerType: 'touch', pointerId: 9, clientX: 0, clientY: -34 }); });
    expect(engine.setStick).toHaveBeenLastCalledWith(0, 1);
    act(() => { fireEvent.pointerMove(stick, { pointerType: 'touch', pointerId: 9, clientX: 17, clientY: 0 }); });
    expect(engine.setStick).toHaveBeenLastCalledWith(0.5, 0);
    act(() => { fireEvent.pointerUp(stick, { pointerType: 'touch', pointerId: 9 }); });
    expect(engine.setStick).toHaveBeenLastCalledWith(0, 0);
  });

  it('Enter on the stage opens the lift panel with focus on the nearest level up, says so, and Esc hands focus back to the stage', async () => {
    const { container, engine } = await mountWalking();
    const stage = stageOf(container);
    act(() => { stage.focus(); });
    // What the engine does on Enter at a landing (controls activate → popover 'lift').
    act(() => engine.setView({ popover: 'lift', popoverOpen: true }));
    const panel = container.querySelector<HTMLElement>('[data-estate-popover="lift"]')!;
    expect(panel).not.toBeNull();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Lift 3 to L6');
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(container.querySelector('.wb-estate-hud [role="status"]')!.textContent).toBe('Lift 3: choose a level');
    act(() => { fireEvent.keyDown(document.activeElement!, { key: 'Escape', code: 'Escape' }); });
    expect(engine.escape).toHaveBeenLastCalledWith('close-popover');
    expect(container.querySelector('[data-estate-popover="lift"]')).toBeNull();
    expect(document.activeElement).toBe(stage);
  });

  it('a lift level rides from the panel; pressed from the keyboard, focus lands on the stage once the panel goes', async () => {
    const { container, engine } = await mountWalking();
    // The engine's ride: the panel closes and the paper is up (the chip goes with the offer).
    engine.takeLift = vi.fn(() => {
      engine.setView({ popover: null, popoverOpen: false, transition: 'fade', walk: { ...engine.getView().walk!, lift: null, ride: 'LIFT 3 · L5 → L12' } });
      return true;
    });
    const lift = container.querySelector<HTMLButtonElement>('[data-estate-lift]')!;
    expect(lift.getAttribute('aria-label')).toBe('Lift 3: choose a level');
    act(() => { fireEvent.click(lift); });
    const l12 = container.querySelector<HTMLButtonElement>('[data-estate-level="L12"]')!;
    act(() => { l12.focus(); });
    // fireEvent.click is a keyboard press here (detail 0): the button keeps focus until it goes.
    act(() => { fireEvent.click(l12); });
    expect(engine.takeLift).toHaveBeenLastCalledWith('L12');
    expect(container.querySelector('[data-estate-popover="lift"]')).toBeNull();
    expect(document.activeElement).toBe(stageOf(container));
    expect(container.querySelector('[data-estate-ride]')!.textContent).toBe('LIFT 3 · L5 → L12');
  });

  it('Esc on a registry row’s Enter clears the selection and leaves focus on that row, never on the page', async () => {
    const { container, engine } = await mountWalking();
    act(() => engine.setView({ location: { site: null, storey: null, unit: null, room: null, mode: 'overview' }, walk: null, interior: null }));
    const enter = container.querySelector<HTMLButtonElement>('[data-estate-row-action="enter"]')!;
    expect(enter.textContent).toBe('Enter Blk 509 · 0.2 MB');
    act(() => { enter.focus(); });
    act(() => { fireEvent.keyDown(enter, { key: 'Escape', code: 'Escape' }); });
    expect(engine.escape).toHaveBeenLastCalledWith('clear-selection');
    expect(container.querySelector('[data-estate-row-action]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('[data-estate-site="BLK_509"]'));
  });

  it('walking outdoors keeps the selection’s Enter, on the HUD and on its registry row', async () => {
    const { container, engine } = await mountWalking();
    act(() => engine.setView({
      location: { site: null, storey: null, unit: null, room: null, mode: 'walk' },
      selection: 'NC_514',
      walk: { site: null, storey: null, preparing: false, lift: null, stair: null, ride: null, levels: [] },
      interior: null,
    }));
    expect(container.querySelector('[data-estate-enter="NC_514"]')).not.toBeNull();
    expect(container.querySelector('[data-estate-row-action="enter"]')!.textContent).toMatch(/^Enter /);
    // Inside a building the HUD offers Exit instead, as before.
    act(() => engine.setView({ location: { site: 'BLK_509', storey: 'L5', unit: null, room: null, mode: 'walk' }, selection: 'BLK_509', walk: WALK }));
    expect(container.querySelector('[data-estate-enter]')).toBeNull();
    expect(container.querySelector('[data-estate-row-action="exit"]')).not.toBeNull();
  });
});

describe('Estate window — Plan’s room list, with the real HUD module inside the workbench (the P6/P7 review)', () => {
  const ROOMS = Object.freeze([
    Object.freeze({ name: '#05-101 LD', label: 'Living / Dining', flat: '#05-101' }),
    Object.freeze({ name: '#05-101 BED', label: 'Bedroom', flat: '#05-101' }),
    Object.freeze({ name: 'L5-CORR', label: 'Common corridor', flat: null }),
  ]);
  const PLAN_LOCATION = { site: 'BLK_509' as const, storey: 'L5' as const, unit: null, room: null, mode: 'plan' as const };

  /** FieldWorkbench with the real HUD and room list over a fake engine in Plan on Blk 509 L5, whose walkIn, pickRoom and Esc layers act. */
  const mountPlan = async () => {
    window.history.replaceState(null, '', '/?app=world-3d');
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => frames.push(callback)));
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    vi.stubGlobal('IntersectionObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
    const ctx = new Proxy({} as Record<string | symbol, unknown>, { get: (target, key) => (target[key] ??= vi.fn()) });
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(() => ctx as never);
    const runFrames = () => act(() => { for (let i = 0; i < frames.length && i < 200; i += 1) frames[i]!(16 * i); frames.length = 0; });
    const { EstateHud, EstatePlanRooms } = await import('../components/workbench/estate/live/EstateHud');
    const { default: FieldWorkbench } = await import('../components/workbench/FieldWorkbench');
    loadMock.mockResolvedValue({ createEngine: runtime.createEngine, EstateHud, EstatePlanRooms });
    const view = render(<ExperienceModeProvider capabilities={ALLOWED}><FieldWorkbench /></ExperienceModeProvider>);
    runFrames();
    await flush();
    runIdle();
    await flush();
    const engine = instances[0];
    Object.assign(engine.features, { walk: true, enter: true, interiors: true, plan: true });
    const inPlan = (room = -1): Partial<EstateView> => ({
      location: PLAN_LOCATION, selection: 'BLK_509',
      plan: { site: 'BLK_509', storey: 'L5', cut: 1.2, rooms: ROOMS, ready: true, room },
    });
    engine.pickRoom = vi.fn((index: number | null) => { engine.setView(inPlan(index ?? -1)); return true; });
    engine.walkIn = vi.fn(() => {
      engine.setView({ plan: null, location: { site: 'BLK_509', storey: 'L5', unit: '#05-101', room: 'Bedroom', mode: 'walk' } });
      return true;
    });
    engine.escape = vi.fn((action) => {
      if (action === 'exit-plan') engine.setView({ plan: null, selection: null, location: { ...PLAN_LOCATION, storey: null, mode: 'overview' } });
      else if (action === 'overview') engine.setView({ location: { ...engine.getView().location, mode: 'overview' } });
      else if (action === 'clear-selection') engine.setView({ selection: null });
      return action !== 'none';
    });
    engine.emit({ type: 'ready', tier: 'mid', msaa: false, programs: 6 });
    await flush();
    runFrames();
    act(() => engine.setView(inPlan()));
    const win = view.container.querySelector<HTMLElement>('[data-win="world-3d"]')!;
    return { ...view, engine, win };
  };

  afterEach(() => { window.history.replaceState(null, '', '/'); });

  it('is one Tab stop; its arrows pick; Walk into from the keyboard hands the keys to the stage, so Esc goes to Overview and keeps the window', async () => {
    const { container, engine, win } = await mountPlan();
    expect(phaseOf(container)).toBe('live');
    const list = container.querySelector<HTMLElement>('aside [data-estate-rooms] [role="toolbar"]')!;
    const room = (i: number) => list.querySelector<HTMLButtonElement>(`[data-estate-room="${i}"]`)!;
    const walkInto = container.querySelector<HTMLButtonElement>('aside [data-estate-rooms-walkin]')!;
    // One stop in the tab order; the slot under the list is there before any pick.
    expect([0, 1, 2].map((i) => room(i).tabIndex)).toEqual([0, -1, -1]);
    expect(walkInto.disabled).toBe(true);
    expect(walkInto.textContent).toBe('Pick a room to walk in');
    expect(walkInto.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    // ↓ picks the next room and moves there (after the commit that marks it pressed); End and ↓ wrap.
    act(() => { room(0).focus(); });
    act(() => { fireEvent.keyDown(room(0), { key: 'ArrowDown', code: 'ArrowDown' }); });
    expect(engine.pickRoom).toHaveBeenLastCalledWith(1);
    expect(document.activeElement).toBe(room(1));
    expect(room(1).getAttribute('aria-pressed')).toBe('true');
    expect([0, 1, 2].map((i) => room(i).tabIndex)).toEqual([-1, 0, -1]);
    act(() => { fireEvent.keyDown(room(1), { key: 'End', code: 'End' }); });
    expect(document.activeElement).toBe(room(2));
    act(() => { fireEvent.keyDown(room(2), { key: 'ArrowDown', code: 'ArrowDown' }); });
    expect(engine.pickRoom).toHaveBeenLastCalledWith(0);
    expect(document.activeElement).toBe(room(0));
    act(() => { fireEvent.keyDown(room(0), { key: 'ArrowDown', code: 'ArrowDown' }); });
    // Walk into, from the keyboard (a click with detail 0): Walk, and the keys on the stage, not the page.
    expect(walkInto.textContent).toBe('Walk into #05-101 · Bedroom');
    act(() => { walkInto.focus(); });
    act(() => { fireEvent.click(walkInto, { detail: 0 }); });
    expect(engine.walkIn).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-estate-rooms]')).toBeNull();
    const stage = stageOf(container);
    expect(document.activeElement).toBe(stage);
    // Esc in Walk is Walk → Overview: the window stays.
    act(() => { fireEvent.keyDown(stage, { key: 'Escape', code: 'Escape' }); });
    expect(engine.escape).toHaveBeenLastCalledWith('overview');
    await flush();
    expect(win.style.display).toBe('flex');
  });

  it('Esc on a room leaves Plan with the keys on the stage; the next Esc minimises the window', async () => {
    const { container, engine, win } = await mountPlan();
    const room = container.querySelector<HTMLButtonElement>('aside [data-estate-room="0"]')!;
    act(() => { room.focus(); });
    act(() => { fireEvent.keyDown(room, { key: 'Escape', code: 'Escape' }); });
    expect(engine.escape).toHaveBeenLastCalledWith('exit-plan');
    expect(container.querySelector('[data-estate-rooms]')).toBeNull();
    const stage = stageOf(container);
    expect(document.activeElement).toBe(stage);
    expect(win.style.display).toBe('flex');
    act(() => { fireEvent.keyDown(stage, { key: 'Escape', code: 'Escape' }); });
    await flush();
    expect(win.style.display).toBe('none');
  });

  it('a focus request for the plan already shown is done: no fly-to back to Overview', async () => {
    const { engine } = await mountPlan();
    engine.planView = vi.fn(() => false); // the engine refuses the storey it already shows
    act(() => { window.dispatchEvent(new CustomEvent(ESTATE_FOCUS_EVENT, { detail: { site: 'BLK_509', storey: 'L05' } })); });
    expect(engine.planView).not.toHaveBeenCalled();
    expect(engine.flyTo).not.toHaveBeenCalled();
    expect(engine.getView().location.mode).toBe('plan');
    // Another storey is a new plan.
    act(() => { window.dispatchEvent(new CustomEvent(ESTATE_FOCUS_EVENT, { detail: { site: 'BLK_509', storey: 'L6' } })); });
    expect(engine.planView).toHaveBeenLastCalledWith('BLK_509', 'L6');
  });
});

describe('Estate shell — restated constants', () => {
  it('agree with the lib/estate modules the shell must not import', () => {
    expect(ESTATE_REPO_URL).toBe(ESTATE_REPO);
    expect(ESTATE_DISPLAY_NAME).toBe(ESTATE_NAME);
    expect(ESTATE_FOCUS_EVENT_NAME).toBe(ESTATE_FOCUS_EVENT);
    expect(SHELL_TIERS).toEqual(ESTATE_TIERS);
    for (const raw of ['min', ' MID ', 'high', 'ultra', '', 'low']) {
      expect(qualityFromSearch(`?estate-quality=${encodeURIComponent(raw)}`) ?? null, raw).toBe(parseQualityOverride(raw));
    }
    expect(qualityFromSearch('')).toBeUndefined();
  });

  it('honours ?estate-release-ms= only to shorten the release hold (test seam, §10.2 case 14)', () => {
    const at = (raw: string) => releaseMsFromSearch(`?estate-release-ms=${encodeURIComponent(raw)}`, RELEASE_AFTER_MS);
    expect(releaseMsFromSearch('', RELEASE_AFTER_MS)).toBe(RELEASE_AFTER_MS);
    expect(at('1000')).toBe(1000);
    expect(at(' 250 ')).toBe(250);
    expect(at(String(RELEASE_OVERRIDE_RANGE[0]))).toBe(RELEASE_OVERRIDE_RANGE[0]);
    // Never longer than the policy's hold, never below the floor, never a non-integer.
    for (const raw of ['99', '0', '-5', '60000', '1e3', '1.5', 'soon', '']) expect(at(raw), raw).toBe(RELEASE_AFTER_MS);
  });
});
