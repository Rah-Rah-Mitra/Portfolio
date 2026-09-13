import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FieldWorkbench from '../components/workbench/FieldWorkbench';
import FieldIndex from '../components/workbench/FieldIndex';

// The recruiter deep-link path. /#project-kaogenie has to open the Project
// Archive AND bring the row into view; ?app=… has to mean the same thing on the
// phone, since the mobile registry is the only surface that emits it.
//
// requestAnimationFrame is stubbed to a counter that never calls back. That is
// the whole point: a window is revealed by a React commit, not by a frame, so
// anything that waits for frames before scrolling is racing the commit — which
// is exactly how the boot-time scroll used to land on a still-`display: none`
// section, where scrollIntoView does nothing at all.

let scrolls: Array<{ id: string; display: string }>;

const setup = (url: string) => {
  window.history.replaceState(null, '', url);
  scrolls = [];
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn();
  });
  const ctx: Record<string, unknown> = {};
  for (const method of ['beginPath', 'moveTo', 'lineTo', 'arc', 'closePath', 'stroke', 'fill',
    'fillText', 'setTransform', 'clearRect', 'setLineDash', 'save', 'restore', 'clip']) ctx[method] = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
    scrolls.push({
      id: this.id,
      display: (this.closest('[data-win]') as HTMLElement | null)?.style.display ?? 'n/a',
    });
  });
};

beforeEach(() => {
  // jsdom has no scrollIntoView; give it one so the spy has something to wrap.
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('field workbench — deep links', () => {
  it('scrolls a hash-linked archive row into view on the commit that opens its window', () => {
    setup('/#project-kaogenie');
    const { container } = render(<FieldWorkbench />);

    const win = container.querySelector<HTMLElement>('[data-win="project-archive"]');
    expect(win?.style.display).toBe('flex');
    expect(container.querySelector('#project-kaogenie')).not.toBeNull();
    // No animation frame has run, and the row has still been scrolled to.
    expect(window.requestAnimationFrame).toHaveBeenCalled();
    expect(scrolls).toEqual([{ id: 'project-kaogenie', display: 'flex' }]);
  });

  it('never aims a scroll at a window that is still display:none', () => {
    setup('/#experience-career-singapore-navy');
    render(<FieldWorkbench />);
    expect(scrolls.length).toBe(1);
    for (const call of scrolls) expect(call.display).not.toBe('none');
  });

  it('leaves the boot state alone when there is no deep link', () => {
    setup('/');
    const { container } = render(<FieldWorkbench />);
    expect(container.querySelector<HTMLElement>('[data-win="home"]')?.style.display).toBe('flex');
    expect(container.querySelector<HTMLElement>('[data-win="project-archive"]')?.style.display).toBe('none');
    expect(scrolls).toEqual([]);
  });
});

describe('field index — ?app= deep links', () => {
  it('honours the ?app= URL it emits itself', () => {
    setup('/?app=resume-builder');
    render(<FieldIndex />);

    const chip = screen.getByRole('button', { name: 'RESUMES' });
    expect(chip.getAttribute('data-active')).toBe('true');
    // The row that produced the link is the row that opens.
    expect(screen.getByRole('button', { name: /Resume Builder/, expanded: true })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Churp/ })).toBeNull();
  });

  it('still opts out of deep links under ?mode=scan', () => {
    setup('/?app=resume-builder&mode=scan');
    render(<FieldIndex />);
    expect(screen.getByRole('button', { name: 'ALL' }).getAttribute('data-active')).toBe('true');
    expect(screen.getByRole('button', { name: /Resume Builder/, expanded: false })).not.toBeNull();
  });
});

describe('dossier — graduation date', () => {
  it('states the graduation date on both surfaces', () => {
    setup('/');
    const desktop = render(<FieldWorkbench />);
    expect(desktop.container.querySelector('[data-win="home"]')?.textContent).toContain('Graduating Jul 2027');
    cleanup();
    setup('/');
    const mobile = render(<FieldIndex />);
    expect(mobile.container.textContent).toContain('Graduating Jul 2027');
  });
});
