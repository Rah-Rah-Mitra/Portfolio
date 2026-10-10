import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EffectsContext } from '../contexts/PhysicsContext';
import { defaultBackdropSettings, type BackdropSettings } from '../lib/backdropSettings';
import { DeskBackdrop } from '../components/workbench/DeskBackdrop';
import { readDesk, watchDesk, type DeskSnapshot } from '../lib/drawings/deskWatch';
import { resolveExperiencePolicy } from '../lib/experienceMode';
import { onCaughtError } from '../lib/rootErrors';

// The desk-backdrop layer as one composition: the Estate drawing beside the N-body
// field (docs/portfolio/desk-drawing-set.md §5), and the desk watcher it runs. The
// drawing's own behaviour is desk-drawing.dom; the engines' is desk-backdrop.dom.
// Here: the FX layer coming and going never touches the drawing, one engine's
// failure stays its own, and the watcher sees every obstacle it reads.

const policy = { current: resolveExperiencePolicy({ saveData: false, reducedMotion: false }) };
vi.mock('../contexts/ExperienceModeContext', () => ({
  useExperienceMode: () => ({ policy: policy.current, capabilities: null }),
  useOptionalExperienceMode: () => ({ policy: policy.current, capabilities: null, resolved: true }),
}));

const films = vi.hoisted(() => ({ created: 0 }));
vi.mock('../components/workbench/drawing/drawingFilm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/workbench/drawing/drawingFilm')>();
  return {
    ...actual,
    createFilm: (...args: Parameters<typeof actual.createFilm>) => {
      films.created += 1;
      return actual.createFilm(...args);
    },
  };
});

const TOKENS: Record<string, string> = {
  '--color-bg': '#f2f2f3', '--color-text': '#1d1f20', '--color-accent': '#5980a6', '--color-accent-700': '#416180',
  '--color-accent-900': '#1d2d3d', '--color-neutral-500': '#98989b', '--color-neutral-700': '#5d5d60',
};

/** Enough of a 2D context for the painters: every method a no-op, every property settable, text 6 px a character. */
const fake2d = (canvas: HTMLCanvasElement) => {
  const state: Record<string | symbol, unknown> = { canvas };
  return new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return (text: string) => ({ width: text.length * 6 });
      if (key === 'getLineDash') return () => [];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
};

class WorkerStub {
  messages: unknown[] = [];
  terminate = vi.fn();
  addEventListener() {}
  removeEventListener() {}
  postMessage(message: unknown) { this.messages.push(message); }
}

/** jsdom has no ResizeObserver: this one records what it watches and is fired by hand. */
class ResizeObserverStub {
  static instances: ResizeObserverStub[] = [];
  readonly targets = new Set<Element>();
  constructor(private readonly callback: ResizeObserverCallback) { ResizeObserverStub.instances.push(this); }
  observe(target: Element) { this.targets.add(target); }
  unobserve(target: Element) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); }
  resize(width: number, height: number) {
    this.callback([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}

let desk: { width: number; height: number };

beforeEach(() => {
  films.created = 0;
  ResizeObserverStub.instances = [];
  policy.current = resolveExperiencePolicy({ saveData: false, reducedMotion: false });
  desk = { width: 1824, height: 1034 };
  for (const [token, value] of Object.entries(TOKENS)) document.documentElement.style.setProperty(token, value);
  vi.stubGlobal('Worker', WorkerStub);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('requestIdleCallback', (cb: () => void) => window.setTimeout(cb, 0));
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return fake2d(this) as never;
  });
  // jsdom lays nothing out: the desk reports its size by hand.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-desk') ? desk.width : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-desk') ? desk.height : 0;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const token of Object.keys(TOKENS)) document.documentElement.style.removeProperty(token);
  document.body.replaceChildren();
});

const settings = (nbody: boolean): BackdropSettings => ({
  ...defaultBackdropSettings,
  nbody: { ...defaultBackdropSettings.nbody, enabled: nbody },
  drawing: { enabled: true },
});

const tree = (nbody: boolean) => (
  <EffectsContext.Provider value={{ settings: settings(nbody) } as never}>
    <main data-desk>
      <DeskBackdrop />
      <div className="wb-plate"><div className="wb-plate-grid"><div className="wb-plate-slot" /></div></div>
    </main>
  </EffectsContext.Provider>
);

const canvasOf = (container: HTMLElement) => container.querySelector<HTMLCanvasElement>('canvas[data-drawing-canvas]');
const nbodyOf = (container: HTMLElement) => container.querySelector('canvas[data-backdrop="nbody"]');

describe('the desk-backdrop layer', () => {
  it('switching N-body on and off never moves the drawing: the same canvas, text host and film throughout', async () => {
    const view = render(tree(false));
    await waitFor(() => expect(canvasOf(view.container)).not.toBeNull());
    // The film is playing: its sheet caption is on the plate.
    await waitFor(() => expect(view.container.querySelector('.wb-plate-slot')!.textContent).not.toBe(''));
    const host = view.container.querySelector('.wb-drawing')!;
    const text = view.container.querySelector('.wb-drawing-text')!;
    const canvas = canvasOf(view.container)!;
    expect(films.created).toBe(1);

    view.rerender(tree(true));
    await waitFor(() => expect(nbodyOf(view.container)).not.toBeNull());
    const layer = view.container.querySelector('.wb-backdrop')!;
    expect(canvasOf(view.container)).toBe(canvas);
    expect(view.container.querySelector('.wb-drawing-text')).toBe(text);
    expect(text.className).toBe('wb-drawing-text');
    // In paint order: the line work under the FX layer, its text over it.
    expect(host.nextElementSibling).toBe(layer);
    expect(layer.nextElementSibling).toBe(text);

    view.rerender(tree(false));
    expect(view.container.querySelector('.wb-backdrop')).toBeNull();
    expect(canvasOf(view.container)).toBe(canvas);
    expect(view.container.querySelector('.wb-drawing-text')).toBe(text);
    expect(canvas.isConnected).toBe(true);
    expect(films.created).toBe(1);
  });

  it('a failing N-body drops that engine only: one warning, no error, the drawing untouched, and its toggle retries', async () => {
    // No 2D context: the drawing stands as its canvas alone, and nothing else warns.
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error');
    // React reports an error a boundary caught through the root's onCaughtError,
    // whose default is console.error: the root option index.tsx passes keeps it quiet.
    const caught = vi.fn(onCaughtError);
    const view = render(tree(false), { onCaughtError: caught });
    await waitFor(() => expect(canvasOf(view.container)).not.toBeNull());
    const canvas = canvasOf(view.container)!;
    const text = view.container.querySelector('.wb-drawing-text')!;

    // The engine will not start (a worker-src policy, say).
    vi.stubGlobal('Worker', class { constructor() { throw new DOMException('Worker refused', 'SecurityError'); } });
    view.rerender(tree(true));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe('[backdrop:nbody]');
    expect(caught).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(nbodyOf(view.container)).toBeNull();
    expect(canvasOf(view.container)).toBe(canvas);
    expect(view.container.querySelector('.wb-drawing-text')).toBe(text);
    // A failed engine animates nothing, so the drawing is not held for it, and its caption says so.
    await waitFor(() => expect(view.container.querySelector('.wb-drawing')!.getAttribute('data-drawing-state')).not.toBe('fx'));
    const caption = view.container.querySelector('.wb-backdrop-caption [data-backdrop-state]')!;
    expect(caption.getAttribute('data-backdrop-state')).toBe('unavailable');
    expect(caption.textContent).toMatch(/· UNAVAILABLE$/);

    // Off and on again, with a worker that starts: a fresh boundary and a field.
    vi.stubGlobal('Worker', WorkerStub);
    view.rerender(tree(false));
    view.rerender(tree(true));
    await waitFor(() => expect(nbodyOf(view.container)).not.toBeNull());
    expect(canvasOf(view.container)).toBe(canvas);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });
});

const rect = (x: number, y: number, w: number, h: number) => ({
  x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h, toJSON: () => ({}),
}) as DOMRect;

/** Lays an element out by hand (jsdom lays nothing out). */
const place = (el: Element, box: DOMRect | null) => {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(box ?? rect(0, 0, 0, 0));
  vi.spyOn(el, 'getClientRects').mockReturnValue((box ? [box] : []) as unknown as DOMRectList);
};

const makeDesk = () => {
  const el = document.createElement('main');
  el.setAttribute('data-desk', '');
  document.body.append(el);
  place(el, rect(0, 0, desk.width, desk.height));
  return el;
};

describe('the desk watcher', () => {
  it('reserves the sheet caption’s line over the title plate only while the slot is empty: one obstacle in both states', () => {
    const el = makeDesk();
    el.innerHTML = '<div class="wb-plate"><div class="wb-plate-grid"><div class="wb-plate-slot"></div></div></div>';
    const plate = el.querySelector('.wb-plate')!;
    const slot = el.querySelector('.wb-plate-slot')!;
    // The plate stands on its foot (bottom: 22px), so the caption's extra line grows it upward.
    place(plate, rect(1490, 900, 308, 112));
    const empty = readDesk(el, null).obstacles;
    slot.innerHTML = '<div class="wb-plate-key">SHEET</div><div class="wb-plate-val wb-plate-lines"><span>07 OF 07 · ESTATE AERIAL NE</span><span>GENERATED SAMPLE · LIVE</span></div>';
    place(plate, rect(1490, 887, 308, 125));
    const filled = readDesk(el, null).obstacles;
    expect(empty).toEqual([{ x: 1490, y: 887, w: 308, h: 125 }]);
    expect(filled).toEqual(empty);
  });

  it('reads the desk again when the FX layer mounts or unmounts, and when its caption changes size', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const el = makeDesk();
    const seen: DeskSnapshot[] = [];
    const stop = watchDesk(el, (snapshot) => { seen.push(snapshot); });
    const settle = async () => {
      await Promise.resolve(); // a MutationObserver's records arrive as a microtask
      vi.advanceTimersByTime(250);
    };
    try {
      expect(seen).toHaveLength(1);
      expect(seen[0]!.obstacles).toEqual([]);

      // N-body on: its layer mounts with the caption at the desk's top right, and no window moves.
      const layer = document.createElement('div');
      layer.className = 'wb-backdrop';
      const caption = document.createElement('p');
      caption.className = 'wb-backdrop-caption';
      place(caption, rect(1500, 16, 302, 26));
      layer.append(caption);
      el.append(layer);
      await settle();
      expect(seen).toHaveLength(2);
      expect(seen[1]!.obstacles).toEqual([{ x: 1500, y: 16, w: 302, h: 26 }]);

      // Smoke joins it: the caption grows a line, which its size observer reports.
      const sizes = ResizeObserverStub.instances.find((observer) => observer.targets.has(caption));
      expect(sizes).toBeDefined();
      place(caption, rect(1440, 16, 362, 42));
      sizes!.resize(362, 42);
      await settle();
      expect(seen).toHaveLength(3);
      expect(seen[2]!.obstacles).toEqual([{ x: 1440, y: 16, w: 362, h: 42 }]);

      // Both off: the layer goes, and its obstacle with it.
      layer.remove();
      await settle();
      expect(seen).toHaveLength(4);
      expect(seen[3]!.obstacles).toEqual([]);
      expect(sizes!.targets.has(caption)).toBe(false);
    } finally {
      stop();
    }
  });
});
