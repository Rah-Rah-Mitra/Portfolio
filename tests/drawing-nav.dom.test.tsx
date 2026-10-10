import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DrawingField, { NAV_H } from '../components/workbench/drawing/DrawingField';
import { SheetTraverse, landedText, stationName } from '../components/workbench/drawing/SheetTraverse';
import type { FilmTarget, NavState } from '../components/workbench/drawing/drawingFilm';
import type { DeskSnapshot } from '../lib/drawings/deskWatch';
import { CELL, type Region } from '../lib/drawings/occupancy';
import { HERO_ORDER, sheetsFor, startHero } from '../lib/drawings/sequence';
import { SITES } from '../lib/drawings/site.generated';

// The sheet traverse (components/workbench/drawing/SheetTraverse.tsx): first on its
// own with a fake film, for its names, its one Tab stop and what each press asks;
// then inside the real field and film, for its host, the row the chip keeps for
// it, the status it speaks only after a press, and where it does not appear. The
// film's jumps themselves are pinned in drawing-film.dom.

const navOf = (id: string, o: Partial<NavState> & { off?: number[] } = {}): NavState => {
  const site = SITES.find((s) => s.id === id)!;
  return {
    hero: id, name: site.short, mode: 'reading', jump: false, current: 2, chip: { x: 8, y: 600, w: 420 },
    sheets: sheetsFor(site).map((d, i) => ({
      no: d.no, title: d.title, available: !o.off?.includes(i), reason: o.off?.includes(i) ? 'not drawn at this size' : '',
    })),
    ...o,
  };
};

const fakeFilm = () => ({ goTo: vi.fn<(target: FilmTarget) => void>(), prefetch: vi.fn() });

/** The traverse in a host of its own, as DrawingField mounts it (focusable, tabIndex −1). */
let navHost: HTMLElement;
const Traverse = (props: { nav: NavState | null; film: ReturnType<typeof fakeFilm> }) => <SheetTraverse {...props} host={navHost} />;

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  navHost = document.createElement('div');
  navHost.tabIndex = -1;
  document.body.append(navHost);
});

afterEach(() => {
  cleanup();
  navHost.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-motion-paused');
});

describe('the sheet traverse’s toolbar', () => {
  it('names its stations for their sheets, short and in sentence case, and its arrows by what they do', () => {
    render(<Traverse nav={navOf('BLK_501', { off: [4] })} film={fakeFilm()} />);
    const bar = screen.getByRole('toolbar', { name: 'Drawing sheets' });
    expect(bar.hasAttribute('data-drawing-nav')).toBe(true);
    expect(within(bar).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Previous building', 'Previous sheet',
      '01 Site plan', '02 L1 plan', '03 Typical plan L2–L20', '04 Roof plan', '05 Exploded axonometric, not drawn at this size',
      '06 Axonometric', '07 Aerial NE',
      'Next sheet', 'Next building',
    ]);
    // Each station's visible number is the start of its name.
    expect(within(bar).getByRole('button', { name: '03 Typical plan L2–L20' }).textContent).toBe('03');
    for (const name of ['Previous building', 'Previous sheet', 'Next sheet', 'Next building']) {
      expect(within(bar).getByRole('button', { name }).classList.contains('ph-no-rageclick')).toBe(true);
    }
  });

  it.each([
    ['03 TYPICAL PLAN L2–L20 (×19) · FFL +3.60 TO +54.00', '03 Typical plan L2–L20'],
    ['02 L1 PLAN · FFL ±0.00', '02 L1 plan'],
    ['03 L2 PLAN · FFL +4.50', '03 L2 plan'],
    ['04 ROOF PLAN · RF +57.60 · MODEL TOP +61.20', '04 Roof plan'],
    ['03 DECK PLAN L2–L5 (×4) · FFL +3.20 TO +12.80', '03 Deck plan L2–L5'],
    ['06 AXONOMETRIC · BLOCK · L1–L20 + RF', '06 Axonometric'],
    ['07 AERIAL NE · POSTER CAMERA', '07 Aerial NE'],
  ])('names %s “%s”', (title, name) => {
    expect(stationName(title)).toBe(name);
  });

  it('marks the sheet on show aria-current="step", and an undrawable one aria-disabled, focusable and inert', () => {
    const film = fakeFilm();
    render(<Traverse nav={navOf('BLK_501', { off: [0, 4] })} film={film} />);
    const stations = screen.getAllByRole('button').filter((b) => /^\d\d /.test(b.getAttribute('aria-label') ?? ''));
    expect(stations.map((b) => b.getAttribute('aria-current'))).toEqual([null, null, 'step', null, null, null, null]);
    expect(stations.map((b) => b.getAttribute('aria-disabled'))).toEqual(['true', null, null, null, 'true', null, null]);
    expect(stations[0].getAttribute('aria-label')).toBe('01 Site plan, not drawn at this size');
    expect(stations[0].hasAttribute('disabled')).toBe(false);
    fireEvent.click(stations[0]);
    expect(film.goTo).not.toHaveBeenCalled();
    fireEvent.click(stations[5]);
    expect(film.goTo).toHaveBeenCalledWith({ sheet: 5 });
  });

  it('asks the film for each target', () => {
    const film = fakeFilm();
    render(<Traverse nav={navOf('BLK_501')} film={film} />);
    for (const [name, target] of [
      ['Previous building', { building: -1 }], ['Previous sheet', { step: -1 }], ['Next sheet', { step: 1 }], ['Next building', { building: 1 }],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(film.goTo).toHaveBeenLastCalledWith(target);
    }
  });

  it('is one Tab stop, the sheet on show; ←/→ move along it and wrap, Home and End go to its ends, and no other key is taken', () => {
    render(<Traverse nav={navOf('BLK_501')} film={fakeFilm()} />);
    const buttons = screen.getAllByRole('button');
    const stops = () => buttons.filter((b) => b.tabIndex === 0);
    expect(stops()).toEqual([screen.getByRole('button', { name: '03 Typical plan L2–L20' })]);
    act(() => stops()[0].focus());
    const press = (key: string, modifiers: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
      act(() => { document.activeElement!.dispatchEvent(event); });
      return event.defaultPrevented;
    };
    // A modified key is the browser's or the screen reader's (Alt+← is Back): not taken, focus not moved.
    for (const modifiers of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      expect(press('ArrowLeft', modifiers)).toBe(false);
      expect(press('End', modifiers)).toBe(false);
      expect(document.activeElement).toBe(stops()[0]);
    }
    expect(press('ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(buttons[5]);
    expect(stops()).toEqual([buttons[5]]);
    expect(press('End')).toBe(true);
    expect(document.activeElement).toBe(buttons[10]);
    press('ArrowRight');
    expect(document.activeElement).toBe(buttons[0]);
    press('ArrowLeft');
    expect(document.activeElement).toBe(buttons[10]);
    expect(press('Home')).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    expect(stops()).toEqual([buttons[0]]);
    for (const key of ['Escape', 'ArrowUp', 'ArrowDown', 'PageDown', 'Tab']) expect(press(key)).toBe(false);
    expect(document.activeElement).toBe(buttons[0]);
    // Focus gone elsewhere: the stop is the sheet on show again.
    const outside = document.createElement('button');
    document.body.append(outside);
    act(() => outside.focus());
    expect(stops()).toEqual([buttons[4]]);
    outside.remove();
  });

  it('leaves « » out where the chip is too narrow for them beside seven stations', () => {
    render(<Traverse nav={navOf('BLK_501', { chip: { x: 8, y: 600, w: 248 } })} film={fakeFilm()} />);
    expect(screen.queryByRole('button', { name: 'Previous building' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next building' })).toBeNull();
    expect(screen.getByRole('button', { name: '03 Typical plan L2–L20' }).tabIndex).toBe(0);
  });

  it('keeps seven slots for the hawker centre’s six sheets, the seventh no button', () => {
    const { container } = render(<Traverse nav={navOf('NC_514', { current: 5 })} film={fakeFilm()} />);
    const rail = container.querySelector<HTMLElement>('.wb-drawing-nav-rail')!;
    expect(rail.querySelectorAll('button')).toHaveLength(6);
    expect(rail.style.getPropertyValue('--n')).toBe('6');
    expect(rail.style.getPropertyValue('--at')).toBe('5');
    expect(screen.getByRole('button', { name: '06 Aerial NE' }).getAttribute('aria-current')).toBe('step');
  });

  it('stands on the chip’s box, and its trolley is keyed by building, so a new building cuts rather than slides', () => {
    const { container, rerender } = render(<Traverse nav={navOf('BLK_501')} film={fakeFilm()} />);
    const bar = screen.getByRole('toolbar');
    expect([bar.style.left, bar.style.top, bar.style.width]).toEqual(['8px', '600px', '420px']);
    const car = container.querySelector('.wb-drawing-nav-car')!;
    expect(car.getAttribute('aria-hidden')).toBe('true');
    rerender(<Traverse nav={navOf('BLK_501', { current: 3 })} film={fakeFilm()} />);
    expect(container.querySelector('.wb-drawing-nav-car')).toBe(car);
    rerender(<Traverse nav={navOf('BLK_509', { current: 0 })} film={fakeFilm()} />);
    expect(container.querySelector('.wb-drawing-nav-car')).not.toBe(car);
  });

  it.each(['pointer', 'focus'] as const)('loads the previous building once a visitor reaches for it by %s, and not before', (how) => {
    const film = fakeFilm();
    render(<Traverse nav={navOf('BLK_501')} film={film} />);
    expect(film.prefetch).not.toHaveBeenCalled();
    if (how === 'pointer') fireEvent.pointerEnter(screen.getByRole('toolbar'));
    else act(() => screen.getByRole('button', { name: 'Next sheet' }).focus());
    expect(film.prefetch).toHaveBeenCalledTimes(1);
  });

  it('speaks a jump once it lands, and nothing for the film’s own advance', () => {
    const { rerender } = render(<Traverse nav={navOf('BLK_501', { current: 3 })} film={fakeFilm()} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    rerender(<Traverse nav={navOf('BLK_501', { current: 3, jump: true })} film={fakeFilm()} />);
    expect(status.textContent).toBe('Sheet 04 of 07, Blk 501 roof plan');
    rerender(<Traverse nav={navOf('BLK_501', { current: 4 })} film={fakeFilm()} />);
    expect(status.textContent).toBe('');
    expect(landedText(navOf('NC_514', { current: 2 }))).toBe('Sheet 03 of 06, NC 514 L2 plan');
    expect(landedText(navOf('BLK_501', { current: 6 }))).toBe('Sheet 07 of 07, Blk 501 aerial NE');
  });

  it('asks for the previous building once per building, however often it is reached for', () => {
    const film = fakeFilm();
    const { rerender } = render(<Traverse nav={navOf('BLK_501')} film={film} />);
    fireEvent.pointerEnter(screen.getByRole('toolbar'));
    fireEvent.pointerEnter(screen.getByRole('toolbar'));
    act(() => screen.getByRole('button', { name: 'Next sheet' }).focus());
    expect(film.prefetch).toHaveBeenCalledTimes(1);
    rerender(<Traverse nav={navOf('BLK_509')} film={film} />);
    fireEvent.pointerEnter(screen.getByRole('toolbar'));
    expect(film.prefetch).toHaveBeenCalledTimes(2);
  });

  it('draws « » as ‹ › doubled', () => {
    render(<Traverse nav={navOf('BLK_501')} film={fakeFilm()} />);
    const d = (name: string) => screen.getByRole('button', { name }).querySelector('path')!.getAttribute('d')!;
    expect(d('Previous sheet')).toBe('m15 18-6-6 6-6');
    expect(d('Next sheet')).toBe('m9 18 6-6-6-6');
    expect(d('Previous building').match(/-6-6 6-6/g)).toHaveLength(2);
    expect(d('Next building').match(/ 6-6-6-6/g)).toHaveLength(2);
  });

  it('never calls the sheet on show undrawable: the welcome’s aerial in a plans-only cycle is current, not disabled', () => {
    const film = fakeFilm();
    render(<Traverse nav={navOf('BLK_501', { off: [4, 5, 6], current: 6 })} film={film} />);
    const aerial = screen.getByRole('button', { name: '07 Aerial NE' });
    expect(aerial.getAttribute('aria-current')).toBe('step');
    expect(aerial.hasAttribute('aria-disabled')).toBe(false);
    fireEvent.click(aerial);
    expect(film.goTo).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '06 Axonometric, not drawn at this size' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('names a closed station by its own reason', () => {
    const nav = navOf('BLK_501', { current: 6 });
    nav.sheets[1] = { ...nav.sheets[1], available: false, reason: 'still loading' };
    render(<Traverse nav={nav} film={fakeFilm()} />);
    expect(screen.getByRole('button', { name: '02 L1 plan, still loading' }).getAttribute('aria-disabled')).toBe('true');
  });

  describe('when the control holding focus goes', () => {
    const stops = () => within(screen.getByRole('toolbar')).getAllByRole('button').filter((b) => b.tabIndex === 0);

    it('hands it from station 07 to the sheet on show when the next building has six sheets, its Tab stop with it', () => {
      const { rerender } = render(<Traverse nav={navOf('BLK_507', { current: 6 })} film={fakeFilm()} />);
      act(() => screen.getByRole('button', { name: '07 Aerial NE' }).focus());
      // The film's own advance: the hawker centre's opening aerial, its sixth sheet.
      rerender(<Traverse nav={navOf('NC_514', { current: 5 })} film={fakeFilm()} />);
      const shown = screen.getByRole('button', { name: '06 Aerial NE' });
      expect(document.activeElement).toBe(shown);
      expect(stops()).toEqual([shown]);
    });

    it('hands « » on to ‹ › when the chip grows too narrow for them', () => {
      const { rerender } = render(<Traverse nav={navOf('BLK_501')} film={fakeFilm()} />);
      act(() => screen.getByRole('button', { name: 'Next building' }).focus());
      rerender(<Traverse nav={navOf('BLK_501', { chip: { x: 8, y: 600, w: 248 } })} film={fakeFilm()} />);
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next sheet' }));
      expect(stops()).toEqual([screen.getByRole('button', { name: 'Next sheet' })]);
    });

    it('keeps the one Tab stop on the focused station when « » go before it', () => {
      const { rerender } = render(<Traverse nav={navOf('BLK_501')} film={fakeFilm()} />);
      const fifth = screen.getByRole('button', { name: '05 Exploded axonometric' });
      act(() => fifth.focus());
      rerender(<Traverse nav={navOf('BLK_501', { chip: { x: 8, y: 600, w: 248 } })} film={fakeFilm()} />);
      expect(document.activeElement).toBe(fifth);
      expect(stops()).toEqual([fifth]);
    });

    it('waits on the host while the film is parked, and goes back to the toolbar’s stop when it returns', () => {
      const { rerender } = render(<Traverse nav={navOf('BLK_501')} film={fakeFilm()} />);
      act(() => screen.getByRole('button', { name: '05 Exploded axonometric' }).focus());
      rerender(<Traverse nav={null} film={fakeFilm()} />);
      expect(screen.queryByRole('toolbar')).toBeNull();
      expect(document.activeElement).toBe(navHost);
      expect(screen.getByRole('status').textContent).toBe('');
      rerender(<Traverse nav={navOf('BLK_501', { current: 3 })} film={fakeFilm()} />);
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '04 Roof plan' }));
    });

    it('takes nothing back that the visitor moved elsewhere', () => {
      const { rerender } = render(<Traverse nav={navOf('BLK_507', { current: 6 })} film={fakeFilm()} />);
      const aerial = screen.getByRole('button', { name: '07 Aerial NE' });
      act(() => aerial.focus());
      act(() => aerial.blur());
      expect(document.activeElement).toBe(document.body);
      rerender(<Traverse nav={navOf('NC_514', { current: 5 })} film={fakeFilm()} />);
      expect(document.activeElement).toBe(document.body);
      rerender(<Traverse nav={null} film={fakeFilm()} />);
      expect(document.activeElement).toBe(document.body);
    });
  });

  it('requests no animation frame, whatever is pressed: the trolley moves by CSS', () => {
    const film = fakeFilm();
    const { rerender } = render(<Traverse nav={navOf('BLK_501')} film={film} />);
    for (const button of screen.getAllByRole('button')) fireEvent.click(button);
    act(() => screen.getAllByRole('button')[2].focus());
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    rerender(<Traverse nav={navOf('BLK_501', { current: 6, jump: true })} film={film} />);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});

describe('the sheet traverse’s host and stylesheet', () => {
  const css = readFileSync(path.join(process.cwd(), 'index.css'), 'utf8');
  const rule = (selector: string) => {
    const at = css.indexOf(`\n${selector} {`);
    expect(at, selector).toBeGreaterThanOrEqual(0);
    return css.slice(at, css.indexOf('}', at));
  };

  it('spans the desk without taking a pointer, its toolbar taking them; the chip keeps the strip’s row', () => {
    expect(rule('.wb-drawing-nav')).toMatch(/position: absolute; inset: 0; z-index: 0; pointer-events: none;/);
    expect(rule('.wb-drawing-nav-bar')).toMatch(/height: 30px;[^]*pointer-events: auto;/);
    expect(rule('.wb-drawing-chip[data-nav]')).toContain(`padding-top: ${NAV_H + 5}px;`);
  });

  it('stills the trolley under the motion rule', () => {
    expect(css).toContain('html[data-motion-paused="true"] .wb-drawing-nav-car { transition: none; }');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.wb-drawing-nav-car \{ transition: none; \}/);
  });
});

// ---- inside the real field and film -----------------------------------------------------------

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

/** The chip's height by index.css .wb-drawing-chip, from the fake context's 6 px a character (as desk-drawing.dom works it out). */
const chipEstimate = (lines: readonly string[], maxWidth: number): number => {
  const room = maxWidth - 20;
  let rows = 0;
  lines.forEach((line, i) => {
    const perChar = 6 + (i === 0 ? 0.55 : 1);
    let used = 0;
    rows += 1;
    for (const word of line.split(' ')) {
      const w = word.length * perChar;
      if (used > 0 && used + perChar + w > room) { rows += 1; used = w; } else used += (used > 0 ? perChar : 0) + w;
    }
  });
  return rows * 14 + 12;
};

const H = 1034;
const REGION: Region = { col: 4, row: 0, cols: 60, rows: 30, x: 4 * CELL, y: H - 30 * CELL, w: 60 * CELL, h: 30 * CELL };
const snap = (room: boolean): DeskSnapshot => ({
  w: 1824, h: H, obstacles: [], windowsOpen: true, regions: room ? [REGION] : [], room, poster: null, dpr: 1,
});

describe('the sheet traverse in the field', () => {
  let desk: HTMLElement;
  let canvasHost: HTMLElement;
  let textHost: HTMLElement;

  beforeEach(() => {
    for (const [token, value] of Object.entries(TOKENS)) document.documentElement.style.setProperty(token, value);
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => window.setTimeout(cb, 0));
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      return fake2d(this) as never;
    });
    desk = document.createElement('main');
    desk.setAttribute('data-desk', '');
    canvasHost = document.createElement('div');
    canvasHost.className = 'wb-drawing';
    canvasHost.setAttribute('aria-hidden', 'true');
    textHost = document.createElement('div');
    textHost.className = 'wb-drawing-text';
    textHost.setAttribute('aria-hidden', 'true');
    const plate = document.createElement('div');
    plate.innerHTML = '<div class="wb-plate-grid"><div class="wb-plate-slot"></div></div>';
    desk.append(canvasHost, textHost, plate);
    document.body.append(desk);
  });

  afterEach(() => {
    for (const token of Object.keys(TOKENS)) document.documentElement.style.removeProperty(token);
    document.body.replaceChildren();
  });

  const field = (scope: 'film' | 'cover', room = true) => (
    <DrawingField scope={scope} snapshot={snap(room)} fx={false} canvasHost={canvasHost} textHost={textHost} />
  );

  it('rides the film’s chip in a host after the text, not aria-hidden, and the chip keeps it its row', async () => {
    render(field('film'));
    await waitFor(() => expect(desk.querySelector('[data-drawing-nav]')).not.toBeNull());
    const host = textHost.nextElementSibling as HTMLElement;
    expect(host.className).toBe('wb-drawing-nav');
    expect(host.hasAttribute('aria-hidden')).toBe(false);
    expect(host.closest('[aria-hidden]')).toBeNull();
    // Focusable by script only: where focus waits through a park.
    expect(host.tabIndex).toBe(-1);
    const bar = within(host).getByRole('toolbar', { name: 'Drawing sheets' });
    const chip = textHost.querySelector<HTMLElement>('.wb-drawing-chip')!;
    expect(chip.hasAttribute('data-nav')).toBe(true);
    expect([bar.style.left, bar.style.top, bar.style.width]).toEqual([chip.style.left, chip.style.top, chip.style.maxWidth]);
    const lines = [...chip.children].map((c) => c.textContent ?? '');
    const band = REGION.y + REGION.h - parseFloat(chip.style.top);
    expect(band).toBeGreaterThanOrEqual(chipEstimate(lines, parseFloat(chip.style.maxWidth)) + NAV_H);
    expect(within(bar).getByRole('button', { name: '07 Aerial NE' }).getAttribute('aria-current')).toBe('step');
  });

  it('speaks only after a press: the film’s opening says nothing, a jump says where it landed', async () => {
    document.documentElement.setAttribute('data-motion-paused', 'true');
    render(field('film'));
    await waitFor(() => expect(desk.querySelector('[data-drawing-nav]')).not.toBeNull());
    const status = within(desk).getByRole('status');
    expect(status.textContent).toBe('');
    fireEvent.click(within(desk).getByRole('button', { name: 'Next sheet' }));
    // Halted, the jump lands in one paint.
    // The day's building, whichever it is.
    const site = SITES.find((s) => s.id === HERO_ORDER[startHero(Date.now())])!;
    expect(status.textContent).toBe(`Sheet 01 of 0${sheetsFor(site).length}, ${site.short.replace('BLK', 'Blk')} site plan`);
    expect(within(desk).getByRole('button', { name: '01 Site plan' }).getAttribute('aria-current')).toBe('step');
    expect(canvasHost.dataset.drawingSheet).toBe(`${site.id}:R1`);
  });

  it('goes when the film parks, and the cover still has none', async () => {
    const view = render(field('film'));
    await waitFor(() => expect(desk.querySelector('[data-drawing-nav]')).not.toBeNull());
    view.rerender(field('film', false));
    await waitFor(() => expect(desk.querySelector('[data-drawing-nav]')).toBeNull());
    expect(desk.querySelector('.wb-drawing-nav')).not.toBeNull();
    view.unmount();
    expect(desk.querySelector('.wb-drawing-nav')).toBeNull();

    render(field('cover'));
    await waitFor(() => expect(textHost.querySelector('.wb-drawing-chip')?.textContent).not.toBe(''));
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    expect(desk.querySelector('.wb-drawing-nav')).toBeNull();
    expect(textHost.querySelector('.wb-drawing-chip')!.hasAttribute('data-nav')).toBe(false);
  });
});
