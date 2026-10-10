import React from 'react';
import { renderToString } from 'react-dom/server';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EffectsContext } from '../contexts/PhysicsContext';
import { defaultBackdropSettings, type BackdropSettings } from '../lib/backdropSettings';
import { DeskBackdrop } from '../components/workbench/DeskBackdrop';
import { claimGpu, releaseGpu } from '../lib/gpuClaim';
import { resolveExperiencePolicy } from '../lib/experienceMode';
import { CREDIT } from '../lib/drawings/site.generated';

// The desk drawing set in the DOM (docs/portfolio/desk-drawing-set.md §5): the gate
// in the main bundle, the layer's desk watcher, the field (canvas, chip, plate
// caption) and the film, with a fake 2D context. The film's timing and the
// scheduler's frame rules are pinned in drawing-schedule; here: what mounts, what
// it loads, and that the GPU claim and the motion switch stop its frames at once.

const policy = { current: resolveExperiencePolicy({ saveData: false, reducedMotion: false }) };
vi.mock('../contexts/ExperienceModeContext', () => ({
  useExperienceMode: () => ({ policy: policy.current, capabilities: null }),
  useOptionalExperienceMode: () => ({ policy: policy.current, capabilities: null, resolved: true }),
}));

const filmLoaded = vi.fn();
vi.mock('../components/workbench/drawing/drawingFilm', async (importOriginal) => {
  filmLoaded();
  return importOriginal();
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

let frames: FrameRequestCallback[];
let desk: { width: number; height: number };

beforeEach(() => {
  frames = [];
  filmLoaded.mockClear();
  policy.current = resolveExperiencePolicy({ saveData: false, reducedMotion: false });
  desk = { width: 1824, height: 1034 };
  for (const [token, value] of Object.entries(TOKENS)) document.documentElement.style.setProperty(token, value);
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => frames.push(cb)));
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
  for (const token of Object.keys(TOKENS)) document.documentElement.style.removeProperty(token);
  document.documentElement.removeAttribute('data-motion-paused');
});

const on: BackdropSettings = { ...defaultBackdropSettings, drawing: { enabled: true } };
const off: BackdropSettings = {
  nbody: { ...defaultBackdropSettings.nbody, enabled: false },
  fluid: { ...defaultBackdropSettings.fluid, enabled: false },
  drawing: { enabled: false },
};

const tree = (settings: BackdropSettings) => (
  <EffectsContext.Provider value={{ settings } as never}>
    <main data-desk>
      <DeskBackdrop />
      <div className="wb-plate"><div className="wb-plate-grid"><div className="wb-plate-slot" /></div></div>
    </main>
  </EffectsContext.Provider>
);

const canvasOf = (container: HTMLElement) => container.querySelector<HTMLCanvasElement>('canvas[data-drawing-canvas]');

describe('the desk drawing set', () => {
  it('renders nothing on the server: the gate opens in an effect', () => {
    expect(renderToString(tree(on))).not.toContain('wb-drawing');
  });

  it('renders nothing with every backdrop off', () => {
    const { container } = render(tree(off));
    expect(container.querySelector('.wb-drawing')).toBeNull();
  });

  it('mounts two decorative hosts around the FX layer, and no backdrop caption of its own', async () => {
    const { container } = render(tree(on));
    await waitFor(() => expect(container.querySelector('.wb-drawing')).not.toBeNull());
    const host = container.querySelector('.wb-drawing')!;
    const text = container.querySelector('.wb-drawing-text')!;
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(text.getAttribute('aria-hidden')).toBe('true');
    expect(host.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('.wb-backdrop-caption')).toBeNull();
    expect(container.querySelector('[data-backdrop-state]')).toBeNull();
  });

  it('parks on a desk with no room: covered, and the drawing is never downloaded', async () => {
    desk = { width: 200, height: 150 };
    const { container } = render(tree(on));
    await waitFor(() => expect(container.querySelector('.wb-drawing')?.getAttribute('data-drawing-state')).toBe('covered'));
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    expect(canvasOf(container)).toBeNull();
    expect(filmLoaded).not.toHaveBeenCalled();
  });

  it('on an empty desk loads the film, which animates, with its chip carrying the exact credit and the plate its caption', async () => {
    const { container } = render(tree(on));
    await waitFor(() => expect(canvasOf(container)).not.toBeNull());
    await waitFor(() => expect(requestAnimationFrame).toHaveBeenCalled());
    expect(filmLoaded).toHaveBeenCalled();
    const chip = container.querySelector('.wb-drawing-chip')!;
    await waitFor(() => expect(chip.textContent).toContain(CREDIT));
    expect(chip.textContent).toContain('not a real town or HDB’s own plans');
    expect(chip.textContent).toContain('/estate/LICENSE.txt');
    const slot = container.querySelector('.wb-plate-slot')!;
    await waitFor(() => expect(slot.textContent).toMatch(/07 OF 07 · ESTATE AERIAL NE/));
    expect(slot.textContent).toMatch(/GENERATED SAMPLE · LIVE/);
    expect(container.querySelector('.wb-drawing')!.getAttribute('data-drawing-mode')).toBe('desk');
  });

  it('yields to the Estate window at once: the claim cancels its frame and requests no other; the release resumes', async () => {
    const { container } = render(tree(on));
    await waitFor(() => expect(requestAnimationFrame).toHaveBeenCalled());
    const before = vi.mocked(requestAnimationFrame).mock.calls.length;
    try {
      claimGpu('estate');
      expect(cancelAnimationFrame).toHaveBeenCalled();
      for (const frame of frames.splice(0)) frame(performance.now());
      expect(vi.mocked(requestAnimationFrame).mock.calls.length).toBe(before);
      await waitFor(() => expect(container.querySelector('.wb-drawing')!.getAttribute('data-drawing-state')).toBe('yielded'));
    } finally {
      act(() => { releaseGpu('estate'); });
    }
    await waitFor(() => expect(vi.mocked(requestAnimationFrame).mock.calls.length).toBeGreaterThan(before));
  });

  it('holds still once motion is paused: its act ends in one paint and no frame is requested', async () => {
    const { container } = render(tree(on));
    await waitFor(() => expect(requestAnimationFrame).toHaveBeenCalled());
    document.documentElement.setAttribute('data-motion-paused', 'true');
    await waitFor(() => expect(container.querySelector('.wb-drawing')!.getAttribute('data-drawing-state')).toBe('motion-halted'));
    const before = vi.mocked(requestAnimationFrame).mock.calls.length;
    for (const frame of frames.splice(0)) frame(performance.now());
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    expect(vi.mocked(requestAnimationFrame).mock.calls.length).toBe(before);
    expect(container.querySelector('.wb-plate-slot')!.textContent).toMatch(/GENERATED SAMPLE · STILL/);
  });

  it('on Data Saver paints one still cover and never downloads the film', async () => {
    policy.current = resolveExperiencePolicy({ saveData: true, reducedMotion: false });
    const { container } = render(tree(on));
    await waitFor(() => expect(container.querySelector('.wb-drawing')?.getAttribute('data-drawing-state')).toBe('save-data'));
    await waitFor(() => expect(container.querySelector('.wb-drawing-chip')!.textContent).toContain(CREDIT));
    expect(container.querySelector('.wb-plate-slot')!.textContent).toMatch(/· STILL/);
    expect(filmLoaded).not.toHaveBeenCalled();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('keeps the plain grid under ?mode=scan', async () => {
    policy.current = resolveExperiencePolicy({ saveData: false, reducedMotion: false }, 'scan');
    const { container } = render(tree(on));
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    expect(container.querySelector('.wb-drawing')).toBeNull();
  });

  it('says it cannot draw when the browser gives no 2D context, without an error', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const error = vi.spyOn(console, 'error');
    const { container } = render(tree(on));
    await waitFor(() => expect(container.querySelector('.wb-drawing')?.getAttribute('data-drawing-unavailable')).toBe('true'));
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('survives StrictMode with one canvas, and leaves nothing behind when switched off', async () => {
    const view = render(<React.StrictMode>{tree(on)}</React.StrictMode>);
    await waitFor(() => expect(canvasOf(view.container)).not.toBeNull());
    await waitFor(() => expect(view.container.querySelectorAll('canvas[data-drawing-canvas]')).toHaveLength(1));
    view.rerender(<React.StrictMode>{tree(off)}</React.StrictMode>);
    expect(view.container.querySelector('.wb-drawing')).toBeNull();
    expect(view.container.querySelector('canvas[data-drawing-canvas]')).toBeNull();
    expect(view.container.querySelector('.wb-plate-slot')!.textContent).toBe('');
  });
});
