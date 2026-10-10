import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppErrorBoundary from '../components/AppErrorBoundary';
import { DeskBackdrop } from '../components/workbench/DeskBackdrop';
import { EffectsContext } from '../contexts/PhysicsContext';
import { captureAnalyticsException } from '../lib/analytics';
import { defaultBackdropSettings } from '../lib/backdropSettings';
import { onCaughtError } from '../lib/rootErrors';

// The root's onCaughtError (lib/rootErrors, passed by index.tsx to both
// hydrateRoot and createRoot). React's default logs every error a boundary caught
// with console.error, in production too, and tests/e2e/quality.spec.ts fails on
// any console.error. Each boundary reports its own failure, once: here under the
// same tree and root option as index.tsx, StrictMode included.

vi.mock('../lib/analytics', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/analytics')>(),
  captureAnalyticsException: vi.fn(),
}));

// The desk-backdrop layer's chunk, failing. It stands for any failure the layer
// can raise into DeskBackdrop's boundary: a chunk that 404s after a redeploy, a
// worker the CSP refuses, a WebGL driver error.
vi.mock('../components/workbench/DeskBackdropLayer', () => ({
  default: () => { throw new Error('desk layer failed'); },
}));

const Thrower: React.FC<{ message: string }> = ({ message }) => { throw new Error(message); };

const asRoot = (children: React.ReactNode) => (
  <React.StrictMode>
    <AppErrorBoundary>{children}</AppErrorBoundary>
  </React.StrictMode>
);

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(captureAnalyticsException).mockClear();
});

describe("the root's onCaughtError", () => {
  it('a desk backdrop that fails: its boundary warns once, nothing logs an error, the page stays up', async () => {
    const settings = { ...defaultBackdropSettings, nbody: { ...defaultBackdropSettings.nbody, enabled: true } };
    const view = render(asRoot(
      <EffectsContext.Provider value={{ settings } as never}>
        <main data-desk><DeskBackdrop /><p>workbench</p></main>
      </EffectsContext.Provider>,
    ), { onCaughtError });

    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe('[backdrop]');
    expect((warn.mock.calls[0]![1] as Error).message).toBe('desk layer failed');
    expect(error).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-desk]')!.textContent).toBe('workbench');
    expect(captureAnalyticsException).not.toHaveBeenCalled();
  });

  it('the whole page failing: AppErrorBoundary reports once, as an error, and React adds nothing', () => {
    render(asRoot(<Thrower message="app failed" />), { onCaughtError });

    expect(screen.getByRole('heading', { name: 'Something went wrong.' })).toBeTruthy();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]![0]).toBe('[app]');
    expect((error.mock.calls[0]![1] as Error).message).toBe('app failed');
    expect(warn).not.toHaveBeenCalled();
    expect(captureAnalyticsException).toHaveBeenCalledTimes(1);
  });

  it('a boundary that does not report its failure: the root warns for it, once', () => {
    class Silent extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() { return { failed: true }; }
      render() { return this.state.failed ? null : this.props.children; }
    }
    render(asRoot(<Silent><Thrower message="silent failed" /></Silent>), { onCaughtError });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe('[boundary]');
    expect((warn.mock.calls[0]![1] as Error).message).toBe('silent failed');
    expect(error).not.toHaveBeenCalled();
  });

  it("without it, React's own report is a console.error on top of the boundary's warning", async () => {
    const settings = { ...defaultBackdropSettings, nbody: { ...defaultBackdropSettings.nbody, enabled: true } };
    render(asRoot(
      <EffectsContext.Provider value={{ settings } as never}>
        <main data-desk><DeskBackdrop /></main>
      </EffectsContext.Provider>,
    ));

    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(error).toHaveBeenCalled();
  });
});
