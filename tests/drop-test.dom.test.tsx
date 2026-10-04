import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DropTest } from '../components/workbench/DropTest';
import { coreCompetencies } from '../portfolioData';
import { buildLayout, poseTransform } from '../lib/dropTest';
import { PORTFOLIO_WORLD_EVENT } from '../lib/worldEvents';

// The model is held by tests/drop-test.test.ts on the real engine. This file
// holds only what the DOM adds: the stage is hidden from assistive tech but its
// words are not, every pointer action has a button, and with motion halted a
// strike resolves to rest at once without ever starting an animation loop.

const layout = buildLayout(coreCompetencies);
let raf: ReturnType<typeof vi.fn>;

const setup = (reduceMotion: boolean) => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: reduceMotion, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe = (target: Element) => this.callback(
      [{ target, isIntersecting: true } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
    unobserve = vi.fn();
    disconnect = vi.fn();
  });
  raf = vi.fn(() => 1);
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Drop test', () => {
  it('hides the stage from assistive tech but not its words, and offers every action as a button', () => {
    setup(false);
    const { container } = render(<DropTest />);
    const stage = container.querySelector('svg[data-drop-stage]');
    expect(stage?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('g[data-block]')).toHaveLength(layout.blocks.length);
    const list = container.querySelector('ul.sr-only');
    for (const block of layout.blocks) expect(list?.textContent).toContain(block.label);

    const smash = screen.getByRole('button', { name: 'Smash' });
    const gravity = screen.getByRole('button', { name: 'Gravity well' });
    expect(smash.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Strike centre' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Blast radius' })).toBeTruthy();
    // The sliders speak their own values; the <output>s beside them are live
    // regions and would say each one twice.
    expect(container.querySelectorAll('output')).toHaveLength(2);
    container.querySelectorAll('output').forEach((output) => expect(output.getAttribute('aria-hidden')).toBe('true'));

    fireEvent.click(gravity);
    expect(gravity.getAttribute('aria-pressed')).toBe('true');
    expect(smash.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Pull to centre' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Core radius' })).toBeTruthy();
  });

  it('with motion halted, a strike resolves to rest at once and starts no loop', async () => {
    setup(true);
    const struck = vi.fn();
    const onEvent = (event: Event) => struck((event as CustomEvent).detail);
    window.addEventListener(PORTFOLIO_WORLD_EVENT, onEvent);
    try {
      render(<DropTest />);
      fireEvent.click(screen.getByRole('button', { name: 'Strike centre' }));
      const status = await screen.findByText(/^At rest after \d+\.\d\d s: \d+ of 24 blocks off their stacks/);
      expect(status.getAttribute('role')).toBe('status');
      expect(raf).not.toHaveBeenCalled();
      expect(struck).toHaveBeenCalledWith(expect.objectContaining({ type: 'DROP_TEST_STRUCK', mode: 'smash' }));
      // The end state was painted: some block left its home transform.
      const moved = layout.blocks.some((block, index) => (
        document.querySelector(`g[data-block="${index}"]`)?.getAttribute('transform') !== poseTransform(block.home.x, block.home.y)
      ));
      expect(moved).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Reset stack' }));
      // Peak impulse and settle time both clear.
      expect(await screen.findAllByText('—', { selector: 'dd' })).toHaveLength(2);
      expect(raf).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(PORTFOLIO_WORLD_EVENT, onEvent);
    }
  });
});
