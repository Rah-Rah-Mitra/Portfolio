import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FieldWorkbench from '../components/workbench/FieldWorkbench';

// The Mechanism Bench runs its own loop (it sleeps offscreen; pinned in
// mechanism-bench.dom.test.tsx). Out of the way here, any frame left queued is the rig's.
vi.mock('../components/workbench/MechanismBench', () => ({ MechanismBench: () => null }));

// The window rig loop used to request a frame on every vsync forever, idle or
// not. It now sleeps once the cable, weight and hoisted cards have settled and
// wakes on whatever can move them again. Frames are replayed from a queue: a
// loop that never sleeps never drains it.

let frames: FrameRequestCallback[];

// Replays queued frames until none are left (true) or the cap is hit (false).
const drain = (cap = 5000) => {
  let ran = 0;
  act(() => {
    while (frames.length && ran < cap) {
      frames.shift()!(16 * ran);
      ran += 1;
    }
  });
  return frames.length === 0;
};

beforeEach(() => {
  frames = [];
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => frames.push(callback)));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('IntersectionObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('field workbench — idle rig loop', () => {
  it('stops requesting frames once settled, and wakes on a scroll', () => {
    const { container } = render(<FieldWorkbench />);
    expect(drain()).toBe(true);

    const sheet = container.querySelector<HTMLElement>('[data-scroll="home"]')!;
    sheet.scrollTop = 120;
    fireEvent.scroll(sheet);
    expect(frames.length).toBeGreaterThan(0);
    expect(drain()).toBe(true);
  });

  it('wakes when a hoisted card is nudged', () => {
    const { container } = render(<FieldWorkbench />);
    expect(drain()).toBe(true);
    const sheet = container.querySelector<HTMLElement>('[data-scroll="home"]')!;
    fireEvent.scroll(sheet); // hands the loop its scroller, so hoists are driven
    expect(drain()).toBe(true);

    fireEvent.pointerDown(container.querySelector('[data-win="home"] [data-hoist]')!, { clientX: 1 });
    expect(frames.length).toBeGreaterThan(0);
    expect(drain()).toBe(true);
  });

  // The boot layout lays out every boot window, and each layout caches its own
  // window's hoists: the deep-linked window has to take them back after.
  it('drives the deep-linked window’s hoisted cards, not the last boot window’s', () => {
    window.history.replaceState(null, '', '/?app=selected-work');
    try {
      const { container } = render(<FieldWorkbench />);
      expect(drain()).toBe(true);
      fireEvent.scroll(container.querySelector<HTMLElement>('[data-scroll="selected-work"]')!);
      expect(drain()).toBe(true);

      fireEvent.pointerDown(container.querySelector('[data-win="selected-work"] [data-hoist]')!, { clientX: 1 });
      expect(frames.length).toBeGreaterThan(0);
      expect(drain()).toBe(true);
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});
