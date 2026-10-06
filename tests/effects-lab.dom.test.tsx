import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AskThePage from '../components/AskThePage';
import EffectsLabPanel from '../components/EffectsLabPanel';
import { EffectsProvider, useEffects } from '../contexts/PhysicsContext';
import { ExperienceModeProvider } from '../contexts/ExperienceModeContext';
import { WORKBENCH_OPEN_EVENT, type WorkbenchOpenDetail } from '../lib/workbench';
import { claimGpu, releaseGpu } from '../lib/gpuClaim';

// jsdom has no matchMedia. `narrow` is the ≤880px Field Index surface.
const stubMedia = ({ narrow = false } = {}) => vi.stubGlobal('matchMedia', (query: string) => ({
  matches: query.includes('max-width: 880px') ? narrow : false,
  media: query,
  addEventListener: vi.fn(), removeEventListener: vi.fn(),
  addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
}));

const capabilities = { saveData: false, reducedMotion: false };

const openDrawer = (device = capabilities) => {
  render(
    <ExperienceModeProvider capabilities={device}>
      <EffectsProvider><EffectsLabPanel /></EffectsProvider>
    </ExperienceModeProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'FX, open optional effects lab' }));
  return screen.getByRole('dialog', { name: 'Effects lab' });
};

beforeEach(() => stubMedia());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('effects lab drawer', () => {
  it('offers motion, sound and the two desk backgrounds, all off at boot, and none of the retired controls', () => {
    const dialog = openDrawer();
    expect(within(dialog).getByRole('button', { name: 'Pause all motion' }).getAttribute('aria-pressed')).toBe('false');
    expect(within(dialog).getByRole('button', { name: /Sound cues/ }).getAttribute('aria-pressed')).toBe('false');
    expect(within(dialog).getByRole('button', { name: /N-body field/ }).getAttribute('aria-pressed')).toBe('false');
    expect(within(dialog).getByRole('button', { name: /Fluid smoke/ }).getAttribute('aria-pressed')).toBe('false');
    expect(within(dialog).getByRole('button', { name: /Drop test.*Systems Lab/ })).not.toBeNull();

    expect(dialog.textContent).not.toMatch(/Smash\b(?! and gravity)|Text signal|Supporting media|Visual density|World quality|Explore World|Reset displaced text/);
    expect(within(dialog).queryByRole('link')).toBeNull();
    expect(within(dialog).queryByLabelText('Bodies')).toBeNull(); // settings appear only once a backdrop is on
  });

  it('pauses motion site-wide, reports sound honestly and reveals a backdrop\'s labelled settings when it is on', () => {
    const dialog = openDrawer();
    const pause = within(dialog).getByRole('button', { name: 'Pause all motion' });
    fireEvent.click(pause);
    expect(pause.getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.getAttribute('data-motion-paused')).toBe('true');
    fireEvent.click(pause);
    expect(document.documentElement.getAttribute('data-motion-paused')).toBe('false');

    const sound = within(dialog).getByRole('button', { name: /Sound cues/ });
    expect(sound.textContent).toContain('Off');
    fireEvent.click(sound);
    expect(sound.getAttribute('aria-pressed')).toBe('true');
    expect(sound.textContent).toContain('starts after your first click or key press');
    act(() => { window.dispatchEvent(new Event('pointerdown')); });
    expect(sound.textContent).toMatch(/On$/);

    fireEvent.click(within(dialog).getByRole('button', { name: /N-body field/ }));
    const nbody = within(dialog).getByRole('group', { name: 'N-body field settings' });
    const bodies = within(nbody).getByLabelText('Bodies') as HTMLInputElement;
    expect(bodies.value).toBe('2048');
    fireEvent.change(bodies, { target: { value: '512' } });
    expect((within(nbody).getByLabelText('Bodies') as HTMLInputElement).value).toBe('512');
    fireEvent.click(within(nbody).getByRole('button', { name: 'Binary' }));
    expect(within(nbody).getByRole('button', { name: 'Binary' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(nbody).getByRole('button', { name: 'Galaxy' }).getAttribute('aria-pressed')).toBe('false');
    ['Gravity', 'Time scale', 'Trail', 'Pointer pulls bodies', 'Show the quadtree', 'Multipole order', 'Leaf capacity']
      .forEach((label) => expect(within(nbody).getByLabelText(label)).not.toBeNull());

    fireEvent.click(within(dialog).getByRole('button', { name: /Fluid smoke/ }));
    const fluid = within(dialog).getByRole('group', { name: 'Fluid smoke settings' });
    ['Speed', 'Intensity', 'Opacity', 'Curl', 'Splat radius', 'Pointer stirs the smoke']
      .forEach((label) => expect(within(fluid).getByLabelText(label)).not.toBeNull());
    fireEvent.click(within(fluid).getByRole('button', { name: 'Vivid' }));
    expect((within(fluid).getByLabelText('Opacity') as HTMLInputElement).value).toBe('72');

    // Each slider speaks its value through aria-valuetext; the visible <output>
    // beside it is a live region, so it is hidden or every step is said twice.
    const opacity = within(fluid).getByLabelText('Opacity');
    expect(opacity.getAttribute('aria-valuetext')).toBe('72%');
    expect(within(dialog).queryAllByRole('status')).toHaveLength(0);
    dialog.querySelectorAll('output').forEach((output) => expect(output.getAttribute('aria-hidden')).toBe('true'));
  });

  it('says why a backdrop stays off on a light policy, and shows no settings that would do nothing', () => {
    const dialog = openDrawer({ saveData: true, reducedMotion: false });
    const nbody = within(dialog).getByRole('button', { name: /N-body field/ });
    expect(nbody.textContent).toContain('Off · held: Data Saver is on');
    fireEvent.click(nbody);
    expect(nbody.getAttribute('aria-pressed')).toBe('true');
    expect(nbody.textContent).toContain('On · held: Data Saver is on');
    expect(nbody.hasAttribute('aria-controls')).toBe(false);
    expect(within(dialog).queryByRole('group', { name: 'N-body field settings' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: /Fluid smoke/ }).textContent).toContain('held: Data Saver is on');
  });

  it('says nothing is held on a capable device', () => {
    const dialog = openDrawer();
    expect(dialog.textContent).not.toMatch(/held:/i);
  });

  it('says an enabled backdrop is held while the Estate window uses the GPU', () => {
    const dialog = openDrawer();
    const fluid = within(dialog).getByRole('button', { name: /Fluid smoke/ });
    fireEvent.click(fluid);
    expect(fluid.textContent).not.toMatch(/held:/);
    try {
      act(() => { claimGpu('estate'); });
      expect(fluid.textContent).toContain('On · held: the Estate window is using the GPU');
      // An off backdrop is not being held by anything.
      expect(within(dialog).getByRole('button', { name: /N-body field/ }).textContent).not.toMatch(/held:/);
    } finally {
      act(() => { releaseGpu('estate'); });
    }
    expect(fluid.textContent).not.toMatch(/held:/);
  });

  it('says the backgrounds are desktop-only on the narrow surface, disables them and omits the drop-test handoff', () => {
    stubMedia({ narrow: true });
    const dialog = openDrawer();
    expect((within(dialog).getByRole('button', { name: /N-body field/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole('button', { name: /Fluid smoke/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(dialog.textContent).toContain('This screen shows the registry instead');
    expect(within(dialog).queryByRole('button', { name: /Drop test/ })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Pause all motion' })).not.toBeNull();
  });

  it('hands the drop test off to the Systems Lab window and closes the drawer', () => {
    const requests: WorkbenchOpenDetail[] = [];
    const listen = (event: Event) => requests.push((event as CustomEvent<WorkbenchOpenDetail>).detail);
    window.addEventListener(WORKBENCH_OPEN_EVENT, listen);
    const dialog = openDrawer();
    fireEvent.click(within(dialog).getByRole('button', { name: /Drop test.*Systems Lab/ }));
    window.removeEventListener(WORKBENCH_OPEN_EVENT, listen);
    expect(requests).toEqual([{ appId: 'systems-lab', targetId: 'drop-test' }]);
    expect(screen.queryByRole('dialog', { name: 'Effects lab' })).toBeNull();
  });
});

describe('effects context surface', () => {
  it('carries the backdrop settings and no page-wide word physics', () => {
    const ContextProbe = () => {
      const effects = useEffects();
      return <output>{JSON.stringify({ settings: Object.keys(effects.settings), api: Object.keys(effects) })}</output>;
    };

    render(<EffectsProvider><ContextProbe /></EffectsProvider>);
    const context = JSON.parse(screen.getByRole('status').textContent ?? '{}') as { settings: string[]; api: string[] };

    expect(context.settings).toEqual(['nbody', 'fluid']);
    expect(context.api).toEqual(expect.arrayContaining(['toggleEffect', 'updateEffect', 'setMotionPaused', 'setSoundEnabled', 'pauseAll']));
    ['registerWords', 'restoreAll', 'isInteractionActive', 'setVisualDensity', 'setMediaEnabled', 'setQuality', 'worldOpen', 'openWorld']
      .forEach((retired) => expect(context.api).not.toContain(retired));
  });

  it('sends the backdrop state, not word physics or a retired world capability, to the page agent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });

    render(<ExperienceModeProvider capabilities={capabilities}><EffectsProvider><AskThePage /></EffectsProvider></ExperienceModeProvider>);
    fireEvent.click(screen.getByRole('button', { name: /AI, open Ask this portfolio/ }));
    fireEvent.change(screen.getByLabelText('Question or page command'), { target: { value: 'show optimization work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as { pageState: Record<string, unknown> };
    // lib/askPageState.ts (assistant layer) sends only whether each backdrop is on.
    expect(payload.pageState.backdrops).toEqual({ nbody: false, fluid: false });
    expect(JSON.stringify(payload.pageState)).not.toMatch(/"(smash|pretext|world|registerWords)"/);
    expect(payload.pageState.surface).toBe('field-workbench');
  });

  it('on the phone registry offers no lab starter and tells the page agent which surface asked', async () => {
    // ≤880px there is no Camera Lab to open: the starter would describe a window
    // that is not there, and the model would offer to open it.
    stubMedia({ narrow: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });

    render(<ExperienceModeProvider capabilities={capabilities}><EffectsProvider><AskThePage /></EffectsProvider></ExperienceModeProvider>);
    fireEvent.click(screen.getByRole('button', { name: /AI, open Ask this portfolio/ }));
    const starters = within(screen.getByLabelText('Starter questions'));
    expect(starters.queryByRole('button', { name: /Camera Lab/ })).toBeNull();
    fireEvent.click(starters.getByRole('button', { name: 'Tell me about Swarmline.' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as { pageState: Record<string, unknown> };
    expect(payload.pageState.surface).toBe('field-index');
  });
});
