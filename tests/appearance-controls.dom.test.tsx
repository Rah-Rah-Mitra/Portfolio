import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppearanceProvider } from '../contexts/AppearanceContext';
import AppearancePreferences from '../components/AppearancePreferences';
import DesktopAppearanceMenu from '../components/DesktopAppearanceMenu';

const Harness = () => (
  <AppearanceProvider>
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('portfolio:openPreferences', { detail: { source: 'test' } }))}>Preferences trigger</button>
    <div data-desktop-field>
      Desktop field
      <p>Recruiter evidence</p>
      <a href="#work">Project link</a>
    </div>
    <DesktopAppearanceMenu />
    <AppearancePreferences />
  </AppearanceProvider>
);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)', media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('desktop appearance controls', () => {
  it('opens Preferences from Ctrl/Cmd+, and exposes four accessible tabs', async () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: ',', ctrlKey: true });
    const preferences = await screen.findByRole('dialog', { name: 'Desktop Preferences' });
    expect(preferences.getAttribute('aria-modal')).toBe('false');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Appearance', 'Desktop', 'Window', 'Accessibility']);
    fireEvent.click(screen.getByRole('tab', { name: 'Desktop' }));
    expect(screen.getByRole('radio', { name: 'Fluid Field' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close Preferences' }));
    expect(screen.queryByRole('dialog', { name: 'Desktop Preferences' })).toBeNull();
  });

  it('changes scheme, accent, window material, and dock size through semantic controls', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Preferences trigger' }));
    await screen.findByRole('dialog', { name: 'Desktop Preferences' });
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Rose' }));
    expect(document.documentElement.dataset.colorScheme).toBe('light');
    expect(document.documentElement.dataset.accent).toBe('rose');
    fireEvent.click(screen.getByRole('tab', { name: 'Window' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Accent tinted' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Large dock' }));
    expect(document.documentElement.dataset.windowTint).toBe('accent');
    expect(document.documentElement.dataset.dockSize).toBe('large');
  });

  it('uses the custom context menu only on a blank desktop field and restores focus on dismissal', async () => {
    render(<Harness />);
    const desktop = screen.getByText('Desktop field').closest('[data-desktop-field]')!;
    fireEvent.contextMenu(desktop, { clientX: 80, clientY: 100 });
    const menu = await screen.findByRole('menu', { name: 'Desktop menu' });
    expect(menu).not.toBeNull();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Fluid Field' }));
    await waitFor(() => expect(document.documentElement.dataset.desktopBackground).toBe('fluid'));

    fireEvent.contextMenu(screen.getByRole('link', { name: 'Project link' }));
    expect(screen.queryByRole('menu', { name: 'Desktop menu' })).toBeNull();
  });
});

describe('n-body seed input hardening', () => {
  it('clamps oversized and fractional seeds to the worker protocol range', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Preferences trigger' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Desktop Preferences' })).not.toBeNull());
    fireEvent.click(screen.getByRole('tab', { name: 'Desktop' }));
    const seed = screen.getByLabelText('Deterministic seed') as HTMLInputElement;

    fireEvent.change(seed, { target: { value: '99999999999' } });
    expect(Number(seed.value)).toBe(2147483647);

    fireEvent.change(seed, { target: { value: '41.9' } });
    expect(Number(seed.value)).toBe(41);

    fireEvent.change(seed, { target: { value: '' } });
    expect(Number(seed.value)).toBe(0);
  });
});

