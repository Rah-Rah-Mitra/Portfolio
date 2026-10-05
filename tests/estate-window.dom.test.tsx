import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperienceModeProvider } from '../contexts/ExperienceModeContext';
import { EstateWindow } from '../components/workbench/estate/EstateWindow';
import { ESTATE_DISPLAY_NAME, ESTATE_REPO_URL } from '../components/workbench/estate/EstateRegistry';
import { ESTATE_FOCUS_EVENT_NAME } from '../components/workbench/estate/EstateWindow';
import { ESTATE_NAME } from '../lib/estate/ids';
import { SHELL_TIERS, qualityFromSearch } from '../components/workbench/estate/shellDom';
import { EstateLoadError, loadEngine } from '../components/workbench/estate/loadEngine';
import type {
  EstateEngine, EstateEngineEvent, EstateEngineOptions, EstateHudProps, EstateRuntime, EstateView,
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
    subscribe: () => () => {},
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
    walkStep: vi.fn(() => false),
    setStick: vi.fn(() => false),
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
      options.onEvent({ type: 'location', token: options.token, ...view });
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
    expect(stage.getAttribute('aria-describedby')).toBe('estate-keys');
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
    const { engine, rerender } = await mountLive();
    rerender(<Desk open={false} homeOpen={false} />);
    await flush();
    expect(engine.dispose).toHaveBeenCalledTimes(1);
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

  it('a loss while frozen is not counted and shows nothing', async () => {
    const { container, engine, rerender } = await mountLive();
    rerender(<Desk open={false} />);
    await flush();
    engine.emit({ type: 'lost', frozen: true });
    rerender(<Desk open />);
    await flush();
    expect(phaseOf(container)).toBe('live');
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

  it('a failed download offers Retry, which imports again', async () => {
    loadMock.mockRejectedValueOnce(new EstateLoadError('failed', new Error('offline')));
    loadMock.mockResolvedValue(runtime);
    const { container } = render(<Desk />);
    await flush();
    runIdle();
    await flush();
    expect(phaseOf(container)).toBe('error');
    expect(stateText(container)).toBe(ESTATE_REASONS.error);
    act(() => { fireEvent.click(actionButton(container)!); });
    await flush();
    expect(loadMock).toHaveBeenCalledTimes(2);
    expect(instances[0].start).toHaveBeenCalledTimes(1);
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

  it('in consent, a row press highlights it and says to load first', async () => {
    const { container } = render(<Desk device={SAVE_DATA} />);
    await flush();
    act(() => { fireEvent.click(container.querySelector('[data-estate-site="MSCP_513"]')!); });
    expect(container.querySelector('[data-estate-site="MSCP_513"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.wb-estate-notice')?.textContent).toBe('Load the 3D estate to fly there.');
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
});
