import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FieldWorkbench from '../components/workbench/FieldWorkbench';
import FieldIndex from '../components/workbench/FieldIndex';
import { ExperienceModeProvider } from '../contexts/ExperienceModeContext';
import { loadEngine } from '../components/workbench/estate/loadEngine';
import { dispatchWorkbenchOpen } from '../lib/workbench';

// The Estate engine is a lazy chunk; here only whether, and when, the window
// asks for it matters, so the loader is a spy that never resolves.
vi.mock('../components/workbench/estate/loadEngine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/workbench/estate/loadEngine')>()),
  loadEngine: vi.fn(() => new Promise(() => {})),
}));

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

  it('keeps the deep-linked window in front once the boot layout runs', () => {
    setup('/?app=camera-lab');
    // Run frames for real, in order: the deep link's focus frame is queued
    // before the boot layout's, and the boot layout used to re-focus Home.
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => frames.push(callback)));
    const { container } = render(<FieldWorkbench />);
    act(() => { for (let i = 0; i < frames.length && i < 50; i += 1) frames[i]!(16 * i); });
    expect(container.querySelector('[data-win="camera-lab"]')?.hasAttribute('data-focused')).toBe(true);
    expect(container.querySelector('[data-win="home"]')?.hasAttribute('data-focused')).toBe(false);
  });

  it('raises Home above the Estate on a plain visit', () => {
    setup('/');
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => frames.push(callback)));
    const { container } = render(<FieldWorkbench />);
    act(() => { for (let i = 0; i < frames.length && i < 50; i += 1) frames[i]!(16 * i); });
    const z = (id: string) => Number(container.querySelector<HTMLElement>(`[data-win="${id}"]`)?.style.zIndex || 0);
    expect(container.querySelector('[data-win="home"]')?.hasAttribute('data-focused')).toBe(true);
    expect(container.querySelector('[data-win="world-3d"]')?.hasAttribute('data-focused')).toBe(false);
    expect(z('home')).toBeGreaterThan(z('world-3d'));
  });

  it('leaves the boot state alone when there is no deep link: Home and the Estate open, Selected Work a click away', () => {
    setup('/');
    const { container } = render(<FieldWorkbench />);
    const display = (id: string) => container.querySelector<HTMLElement>(`[data-win="${id}"]`)?.style.display;
    expect(display('home')).toBe('flex');
    expect(display('world-3d')).toBe('flex');
    expect(display('selected-work')).toBe('none');
    expect(display('project-archive')).toBe('none');
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

  it('opens a window’s own row when the assistant opens that window, as its ?app= link does', () => {
    setup('/');
    render(<FieldIndex />);
    expect(screen.getByRole('button', { name: /Sample Town N5/, expanded: false })).not.toBeNull();
    // The Estate command on a phone: world-3d, targeting the window's anchor (never a building id).
    act(() => { dispatchWorkbenchOpen({ appId: 'world-3d', targetId: 'world' }); });
    expect(screen.getByRole('button', { name: 'PROJECTS' }).getAttribute('data-active')).toBe('true');
    expect(screen.getByRole('button', { name: /Sample Town N5/, expanded: true })).not.toBeNull();
    act(() => { dispatchWorkbenchOpen({ appId: 'resume-builder', targetId: 'resume-builder' }); });
    expect(screen.getByRole('button', { name: 'RESUMES' }).getAttribute('data-active')).toBe('true');
    expect(screen.getByRole('button', { name: /Resume Builder/, expanded: true })).not.toBeNull();
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

describe('Estate window — the boot layout and deep links (?app=world-3d)', () => {
  // Microtasks: the window reads its section's display through a MutationObserver.
  // The window imports its controller chunk when it first opens; awaiting the
  // same import means the window's has settled too.
  const flush = () => act(async () => {
    await import('../components/workbench/estate/EstateController');
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
  const phaseOf = (container: HTMLElement) => container.querySelector('#world')?.getAttribute('data-estate-phase');
  const estateFetches = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/estate/'));
  // Every phase the window passes through, so a flash of consent cannot hide between two reads.
  const watchPhases = (container: HTMLElement) => {
    const seen: string[] = [String(phaseOf(container))];
    const observer = new MutationObserver(() => seen.push(String(phaseOf(container))));
    observer.observe(container.querySelector('#world')!, { attributes: true, attributeFilter: ['data-estate-phase'] });
    return { seen, stop: () => observer.disconnect() };
  };
  let idle: Array<() => void>;

  beforeEach(() => {
    vi.mocked(loadEngine).mockClear();
    idle = [];
  });

  const stubIdle = () => {
    vi.stubGlobal('requestIdleCallback', vi.fn((callback: () => void) => idle.push(callback)));
    vi.stubGlobal('cancelIdleCallback', vi.fn());
  };

  it('(a) a bare mount opens on the poster and asks for nothing', async () => {
    setup('/?app=world-3d');
    stubIdle();
    const { container } = render(<FieldWorkbench />);
    await flush();
    act(() => { idle.splice(0).forEach((callback) => callback()); });
    expect(container.querySelector<HTMLElement>('[data-win="world-3d"]')?.style.display).toBe('flex');
    expect(phaseOf(container)).toBe('poster');
    expect(container.querySelector('#world img')?.getAttribute('alt')).toBeTruthy();
    expect(loadEngine).not.toHaveBeenCalled();
    expect(estateFetches()).toEqual([]);
    expect(container.querySelector('[data-estate-action]')).toBeNull();
  });

  it('(b) allowed heavy assets load once, only after readyState is complete and the page is idle, never via consent', async () => {
    setup('/?app=world-3d');
    stubIdle();
    // The deep link focuses its window on the next frame, which brings it forward.
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => frames.push(callback)));
    let readyState: DocumentReadyState = 'interactive';
    vi.spyOn(document, 'readyState', 'get').mockImplementation(() => readyState);
    const { container } = render(
      <ExperienceModeProvider capabilities={{ saveData: false, reducedMotion: false }}><FieldWorkbench /></ExperienceModeProvider>,
    );
    const phases = watchPhases(container);
    act(() => { for (let i = 0; i < frames.length && i < 50; i += 1) frames[i]!(16 * i); frames.length = 0; });
    await flush();
    expect(phaseOf(container)).toBe('poster');
    expect(idle).toHaveLength(0);
    expect(loadEngine).not.toHaveBeenCalled();

    readyState = 'complete';
    act(() => { document.dispatchEvent(new Event('readystatechange')); });
    await flush();
    expect(phaseOf(container)).toBe('loading');
    expect(loadEngine).not.toHaveBeenCalled(); // waits for idle

    act(() => { idle.splice(0).forEach((callback) => callback()); });
    await flush();
    expect(loadEngine).toHaveBeenCalledTimes(1);
    expect(phaseOf(container)).toBe('loading');
    phases.stop();
    expect(phases.seen).not.toContain('consent');
  });

  it('(d) a plain visit opens it behind Home on its poster; allowed, it loads once only when brought forward', async () => {
    setup('/');
    stubIdle();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => frames.push(callback)));
    const runFrames = () => act(() => { for (let i = 0; i < frames.length && i < 50; i += 1) frames[i]!(16 * i); frames.length = 0; });
    const runIdle = () => act(() => { idle.splice(0).forEach((callback) => callback()); });
    const { container } = render(
      <ExperienceModeProvider capabilities={{ saveData: false, reducedMotion: false }}><FieldWorkbench /></ExperienceModeProvider>,
    );
    runFrames();
    await flush();
    runIdle();
    await flush();
    const estate = container.querySelector<HTMLElement>('[data-win="world-3d"]')!;
    expect(estate.style.display).toBe('flex');
    expect(container.querySelector('[data-win="home"]')?.hasAttribute('data-focused')).toBe(true);
    expect(phaseOf(container)).toBe('poster');
    expect(loadEngine).not.toHaveBeenCalled();
    expect(estateFetches()).toEqual([]);

    // The rail, a press inside it, the assistant: every way forward focuses it.
    act(() => { dispatchWorkbenchOpen({ appId: 'world-3d' }); });
    runFrames();
    await flush();
    runIdle();
    await flush();
    expect(estate.hasAttribute('data-focused')).toBe(true);
    expect(loadEngine).toHaveBeenCalledTimes(1);
  });

  it('(e) the boot layout’s open Estate takes its controller on a desktop, never on a phone', async () => {
    const mount = () => {
      stubIdle();
      return render(
        <ExperienceModeProvider capabilities={{ saveData: true, reducedMotion: false }}><FieldWorkbench /></ExperienceModeProvider>,
      );
    };
    setup('/');
    const desktop = mount();
    await flush();
    // The controller's own phase: Save-Data shows consent, even behind Home…
    expect(phaseOf(desktop.container)).toBe('consent');
    // …its Load button, and a status line that says nothing until the window comes forward.
    expect(desktop.container.querySelector('[data-estate-action]')?.textContent).toMatch(/^Load the 3D estate · \d+\.\d MB$/);
    expect(desktop.container.querySelector('#world .wb-estate-state')?.textContent).toBe('');
    cleanup();

    setup('/');
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(max-width: 880px)', addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
    const phone = mount();
    await flush();
    act(() => { idle.splice(0).forEach((callback) => callback()); });
    await flush();
    // App drops this surface on a phone: no controller, so the prerender's poster stands.
    expect(phaseOf(phone.container)).toBe('poster');
    expect(loadEngine).not.toHaveBeenCalled();
    expect(estateFetches()).toEqual([]);
  });

  it('(c) under Save-Data it waits for consent and requests nothing', async () => {
    setup('/?app=world-3d');
    stubIdle();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => frames.push(callback)));
    const { container } = render(
      <ExperienceModeProvider capabilities={{ saveData: true, reducedMotion: false }}><FieldWorkbench /></ExperienceModeProvider>,
    );
    act(() => { for (let i = 0; i < frames.length && i < 50; i += 1) frames[i]!(16 * i); frames.length = 0; });
    await flush();
    act(() => { idle.splice(0).forEach((callback) => callback()); });
    await flush();
    expect(phaseOf(container)).toBe('consent');
    const load = container.querySelector<HTMLButtonElement>('[data-estate-action]');
    expect(load?.textContent).toMatch(/^Load the 3D estate · \d+\.\d MB$/);
    expect(container.querySelector('#world .wb-estate-state')?.textContent).toMatch(/held: Data Saver is on/);
    expect(loadEngine).not.toHaveBeenCalled();
    expect(estateFetches()).toEqual([]);
  });
});
