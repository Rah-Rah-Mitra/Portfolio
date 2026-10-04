import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MechanismBench } from '../components/workbench/MechanismBench';
import { MECHANISMS } from '../lib/pgaMechanisms';

// A <canvas> is invisible to assistive tech and to axe, so the accessible name
// and the reduced-motion bail-out are the two things only a test can hold.

const stubContext = () => {
  const ctx: Record<string, unknown> = {};
  for (const m of ['beginPath', 'moveTo', 'lineTo', 'arc', 'closePath', 'stroke', 'fill',
    'fillText', 'setTransform', 'clearRect', 'setLineDash', 'save', 'restore', 'clip']) ctx[m] = vi.fn();
  return ctx as unknown as CanvasRenderingContext2D;
};

let ctx: CanvasRenderingContext2D;
let raf: ReturnType<typeof vi.fn>;

const setup = (reduceMotion: boolean) => {
  ctx = stubContext();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: reduceMotion, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn();
  });
  raf = vi.fn(() => 1);
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
};

beforeEach(() => { vi.useRealTimers(); });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Mechanism bench', () => {
  it('gives every canvas an accessible name built from the mechanism itself', () => {
    setup(false);
    const { container } = render(<MechanismBench />);
    const canvases = [...container.querySelectorAll('canvas')];
    expect(canvases).toHaveLength(MECHANISMS.length);
    for (const [index, canvas] of canvases.entries()) {
      const mech = MECHANISMS[index];
      expect(canvas.getAttribute('role')).toBe('img');
      expect(canvas.getAttribute('aria-label')).toBe(`${mech.n}. ${mech.i}`);
      // The same words also exist as real text, so the content survives no-JS.
      expect(container.textContent).toContain(mech.n);
      expect(container.textContent).toContain(mech.why);
    }
  });

  it('runs one shared animation loop when motion is allowed', () => {
    setup(false);
    render(<MechanismBench />);
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it('stops requesting frames while no mechanism is on screen, and resumes when one is', () => {
    setup(false);
    let report: IntersectionObserverCallback = () => {};
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { report = callback; }
      observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn();
    });
    const frames: FrameRequestCallback[] = [];
    raf = vi.fn((callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal('requestAnimationFrame', raf);
    const { container } = render(<MechanismBench />);
    const canvases = [...container.querySelectorAll('canvas')];
    const see = (visible: boolean) => report(
      canvases.map((target) => ({ target, isIntersecting: visible }) as unknown as IntersectionObserverEntry), {} as IntersectionObserver);

    see(false); // the Systems Lab is closed: every canvas is display:none
    frames.splice(0).forEach((frame) => frame(16));
    expect(frames).toHaveLength(0);

    see(true);
    expect(frames).toHaveLength(1);
  });

  it('draws a static frame and starts no loop under prefers-reduced-motion', () => {
    setup(true);
    render(<MechanismBench />);
    expect(raf).not.toHaveBeenCalled();
    // Still painted once: reduced motion means no animation, not no drawing.
    expect(ctx.setTransform).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });
});
