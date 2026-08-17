import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AskThePage from '../components/AskThePage';
import EffectsLabPanel from '../components/EffectsLabPanel';
import { EffectsProvider, useEffects } from '../contexts/PhysicsContext';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('effects lab world handoff', () => {
  it('keeps the working FX controls and presents Explore World as an honest anchor', () => {
    render(
      <EffectsProvider>
        <EffectsLabPanel />
      </EffectsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /FX, open optional effects lab/ }));
    const dialog = screen.getByRole('dialog', { name: 'Effects lab' });

    ['Smash', 'Gravity', 'Fluid field', 'Text signal'].forEach((label) => {
      expect(within(dialog).getByRole('button', { name: new RegExp(label, 'i') })).not.toBeNull();
    });
    expect(dialog.textContent).not.toMatch(/Spatial portfolio map|Lazy-loaded Three\.js environment/i);
    expect(dialog.textContent).toContain('The shared optical test bench is this site’s enhancement target.');
    expect(within(dialog).getByRole('link', { name: 'Explore World' }).getAttribute('href')).toBe('#world');
  });
});

describe('retired world capability', () => {
  it('is absent from the active effects context', () => {
    const ContextProbe = () => {
      const effects = useEffects();
      return <output>{JSON.stringify({ settings: Object.keys(effects.settings), api: Object.keys(effects) })}</output>;
    };

    render(<EffectsProvider><ContextProbe /></EffectsProvider>);
    const context = JSON.parse(screen.getByRole('status').textContent ?? '{}') as { settings: string[]; api: string[] };

    expect(context.settings).toEqual(['smash', 'gravity', 'fluid', 'pretext']);
    expect(context.api).not.toEqual(expect.arrayContaining(['worldOpen', 'openWorld', 'closeWorld', 'setWorldQuality']));
  });

  it('does not send a retired world capability to the page agent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });

    render(<EffectsProvider><AskThePage /></EffectsProvider>);
    fireEvent.click(screen.getByRole('button', { name: /AI, open Ask this portfolio/ }));
    fireEvent.change(screen.getByLabelText('Question or page command'), { target: { value: 'show optimization work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as { pageState: { effects: Record<string, unknown> } };
    expect(Object.keys(payload.pageState.effects)).toEqual(['smash', 'gravity', 'fluid', 'pretext']);
    expect('world' in payload.pageState.effects).toBe(false);
  });
});
