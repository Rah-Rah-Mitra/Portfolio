import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowShopBench } from '../components/workbench/FlowShopBench';
import { PORTFOLIO_WORLD_EVENT } from '../lib/worldEvents';
import type { PortfolioWorldEvent } from '../types';

// FIG. 05d. The numbers are pinned in tests/permutation-flow-shop.test.ts;
// this file holds what only a mounted bench can: the SSR-meaningful content,
// the event contract, focus across a keyboard reorder, and the native drag —
// one event per drop, no hoist swing, and Escape reverting without closing
// the window. jsdom has PointerEvent but no setPointerCapture; the bench's
// optional call covers that, and FALLBACK_PITCH stands in for layout.

let events: PortfolioWorldEvent[] = [];
const record = (event: Event) => events.push((event as CustomEvent<PortfolioWorldEvent>).detail);

beforeEach(() => {
  events = [];
  window.addEventListener(PORTFOLIO_WORLD_EVENT, record);
});

afterEach(() => {
  cleanup();
  window.removeEventListener(PORTFOLIO_WORLD_EVENT, record);
});

const job = (letter: string) => screen.getByRole('button', { name: new RegExp(`^Job ${letter}:`) });
const method = (name: RegExp) => screen.getByRole('button', { name });
const status = () => screen.getByRole('status').textContent;
const makespan = (container: HTMLElement) => container.querySelector('.wb-fs-metrics strong')?.textContent;

describe('Sequencing bench (FIG. 05d)', () => {
  it('renders the start schedule, its explanation and every rule with no interaction', () => {
    const { container } = render(<FlowShopBench />);
    const figure = screen.getByRole('figure', { name: /Sequencing Bench/ });
    expect(figure.textContent).toContain('TEACHING MODEL');
    expect(figure.textContent).toContain('unrelated to FIG. 05a');

    const tiles = screen.getAllByRole('button', { name: /^Job [A-F]:/ });
    expect(tiles.map((tile) => tile.dataset.fsJob)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(tiles[0].getAttribute('aria-label')).toBe('Job A: 6, 8 and 5 units on M1, M2 and M3. Position 1 of 6.');

    const metrics = container.querySelector('.wb-fs-metrics')?.textContent ?? '';
    expect(metrics).toContain('54');
    expect(metrics).toContain('660/720');
    expect(figure.textContent).toContain('job A clears M1 and M2 (6 + 8); job E would get there in 4');
    screen.getByRole('img', { name: /Gantt chart of job order A B C D E F/ });
    expect(container.querySelector('table caption')?.textContent).toMatch(/makespan 54/);

    method(/Apply Exhaustive order E C B F D A, makespan 41/);
    method(/Apply NEH order E C D B F A, makespan 43/);
    method(/Apply Johnson · CDS order D B E C F A, makespan 46/);
    expect((screen.getByRole('button', { name: 'Move job A earlier' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Move job A later' }) as HTMLButtonElement).disabled).toBe(false);
    expect(status()).toBe('');
    expect(events).toEqual([]);
  });

  it('reorders from the keyboard, keeps focus, and notices a visitor reaching the optimum', () => {
    const { container } = render(<FlowShopBench />);
    job('A').focus();
    fireEvent.keyDown(job('A'), { key: 'ArrowRight' });
    expect(status()).toBe('Job A moved to position 2 of 6 — makespan 50, 4 lower.');
    expect(events).toEqual([
      { type: 'JOB_REORDERED', oldMakespan: 54, newMakespan: 50, makespanDelta: -4, order: ['B', 'A', 'C', 'D', 'E', 'F'] },
    ]);

    fireEvent.keyDown(job('A'), { key: 'End' });
    expect(status()).toContain('makespan 47');
    expect(document.activeElement).toBe(job('A'));

    fireEvent.click(method(/Apply NEH/));
    expect(events.at(-1)).toEqual({ type: 'SCHEDULE_SOLVED', method: 'neh', makespan: 43, optimal: false });
    expect(status()).toBe('NEH order E C D B F A — makespan 43, 2 above the best.');

    job('D').focus();
    fireEvent.keyDown(job('D'), { key: 'ArrowRight' });
    expect(status()).toBe('Job D moved to position 4 of 6 — makespan 46, 3 higher.');

    const before = events.length;
    fireEvent.keyDown(job('D'), { key: 'ArrowRight' });
    expect(events.slice(before)).toEqual([
      { type: 'JOB_REORDERED', oldMakespan: 46, newMakespan: 41, makespanDelta: -5, order: ['E', 'C', 'B', 'F', 'D', 'A'] },
      { type: 'SCHEDULE_SOLVED', method: 'visitor', makespan: 41, optimal: true },
    ]);
    expect(status()).toMatch(/— the best possible\.$/);
    expect(method(/Apply Exhaustive/).getAttribute('aria-pressed')).toBe('true');
    expect(makespan(container)).toBe('41');
  });

  it('hands focus to the moved tile when Earlier / Later disables itself at an end', () => {
    render(<FlowShopBench />);
    const later = (letter: string) => screen.getByRole('button', { name: `Move job ${letter} later` }) as HTMLButtonElement;
    const earlier = (letter: string) => screen.getByRole('button', { name: `Move job ${letter} earlier` }) as HTMLButtonElement;
    const order = () => screen.getAllByRole('button', { name: /^Job [A-F]:/ }).map((tile) => tile.dataset.fsJob).join('');

    // A mid-strip move leaves the button usable, so focus stays on it for the next press.
    act(() => job('C').focus());
    act(() => later('C').focus());
    fireEvent.click(later('C'));
    expect(order()).toBe('ABDCEF');
    expect(later('C').disabled).toBe(false);
    expect(document.activeElement).toBe(later('C'));

    // The final press disables Later; focus must not be left on a disabled control.
    act(() => job('E').focus());
    act(() => later('E').focus());
    fireEvent.click(later('E'));
    expect(order()).toBe('ABDCFE');
    expect(later('E').disabled).toBe(true);
    expect(document.activeElement).toBe(job('E'));

    act(() => job('B').focus());
    act(() => earlier('B').focus());
    fireEvent.click(earlier('B'));
    expect(order()).toBe('BADCFE');
    expect(earlier('B').disabled).toBe(true);
    expect(document.activeElement).toBe(job('B'));
  });

  it('applies rules once, moves by button, and drags natively with Escape to revert', () => {
    const { container } = render(<FlowShopBench />);
    fireEvent.click(method(/Apply Exhaustive/));
    expect(events).toEqual([{ type: 'SCHEDULE_SOLVED', method: 'exhaustive', makespan: 41, optimal: true }]);
    expect(container.textContent).toContain('No order finishes sooner');
    fireEvent.click(method(/Apply Exhaustive/));
    expect(events).toHaveLength(1);

    fireEvent.click(method(/Apply start order/));
    expect(events.at(-1)).toEqual({ type: 'LAB_RESET', sceneId: 'systems-in-motion' });
    expect(makespan(container)).toBe('54');

    fireEvent.click(screen.getByRole('button', { name: 'Move job A later' }));
    expect(events.at(-1)).toMatchObject({ type: 'JOB_REORDERED', oldMakespan: 54, newMakespan: 50 });
    fireEvent.click(method(/Apply start order/));
    expect(makespan(container)).toBe('54');

    // The hoist nudge is a native pointerdown above the bench; it must not see a tile drag.
    const hoistNudge = vi.fn();
    const windowKey = vi.fn();
    container.addEventListener('pointerdown', hoistNudge);
    window.addEventListener('keydown', windowKey);
    try {
      let before = events.length;
      fireEvent.pointerDown(job('A'), { pointerId: 1, clientX: 0, button: 0 });
      fireEvent.pointerMove(job('A'), { pointerId: 1, clientX: 500 });
      fireEvent.pointerUp(job('A'), { pointerId: 1, clientX: 500 });
      expect(events.slice(before)).toEqual([
        { type: 'JOB_REORDERED', oldMakespan: 54, newMakespan: 47, makespanDelta: -7, order: ['B', 'C', 'D', 'E', 'F', 'A'] },
      ]);
      expect(hoistNudge).not.toHaveBeenCalled();
      expect(makespan(container)).toBe('47');

      before = events.length;
      fireEvent.pointerDown(job('B'), { pointerId: 2, clientX: 0, button: 0 });
      fireEvent.pointerMove(job('B'), { pointerId: 2, clientX: 300 });
      const order = () => screen.getAllByRole('button', { name: /^Job [A-F]:/ }).map((tile) => tile.dataset.fsJob).join('');
      expect(order()).toBe('CDEBFA');
      fireEvent.keyDown(job('B'), { key: 'Escape' });
      expect(order()).toBe('BCDEFA');
      expect(makespan(container)).toBe('47');
      expect(windowKey).not.toHaveBeenCalled();
      fireEvent.pointerUp(job('B'), { pointerId: 2, clientX: 300 });
      expect(events.length).toBe(before);
    } finally {
      container.removeEventListener('pointerdown', hoistNudge);
      window.removeEventListener('keydown', windowKey);
    }
  });
});
