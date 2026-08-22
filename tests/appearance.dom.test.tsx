import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppearanceProvider, useAppearance } from '../contexts/AppearanceContext';
import { APPEARANCE_STORAGE_KEY, applyAppearanceToDocument, defaultAppearancePreferences } from '../lib/appearance';

const Probe = () => {
  const { preferences, resolvedScheme, setScheme, setAccent, setBackgroundTheme } = useAppearance();
  return (
    <div>
      <output data-testid="appearance">{JSON.stringify({ preferences, resolvedScheme })}</output>
      <button type="button" onClick={() => setScheme('light')}>Use light</button>
      <button type="button" onClick={() => setAccent('rose')}>Use rose</button>
      <button type="button" onClick={() => setBackgroundTheme('fluid')}>Use fluid</button>
    </div>
  );
};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-color-scheme');
  document.documentElement.removeAttribute('data-accent');
  document.documentElement.removeAttribute('data-desktop-background');
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)',
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AppearanceProvider', () => {
  it('applies theme attributes, titlebar opacity, and browser chrome color together', () => {
    const root = document.createElement('html');
    const themeColor = document.createElement('meta');
    themeColor.name = 'theme-color';
    applyAppearanceToDocument(root, themeColor, {
      ...defaultAppearancePreferences,
      accent: 'amber',
      background: 'fluid',
      windowTint: 'accent',
      dockSize: 'small',
      titlebarOpacity: 87,
    }, 'dark');

    expect(root.dataset.colorScheme).toBe('dark');
    expect(root.dataset.accent).toBe('amber');
    expect(root.dataset.desktopBackground).toBe('fluid');
    expect(root.dataset.windowTint).toBe('accent');
    expect(root.dataset.dockSize).toBe('small');
    expect(root.style.getPropertyValue('--titlebar-opacity')).toBe('0.87');
    expect(themeColor.content).toBe('#0b0e12');
  });

  it('persists visitor choices and synchronizes root attributes', async () => {
    render(<AppearanceProvider><Probe /></AppearanceProvider>);
    await waitFor(() => expect(document.documentElement.dataset.colorScheme).toBe('dark'));

    fireEvent.click(screen.getByRole('button', { name: 'Use light' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use rose' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use fluid' }));

    await waitFor(() => expect(document.documentElement.dataset.colorScheme).toBe('light'));
    expect(document.documentElement.dataset.accent).toBe('rose');
    expect(document.documentElement.dataset.desktopBackground).toBe('fluid');
    const saved = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? '{}');
    expect(saved).toMatchObject({ scheme: 'light', accent: 'rose', background: 'fluid' });
    expect(screen.getByTestId('appearance').textContent).toContain('"resolvedScheme":"light"');
  });
});

describe('appearance persistence resilience', () => {
  it('renders with defaults when storage reads and writes are rejected', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage disabled'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage disabled'); });
    try {
      render(<AppearanceProvider><ProbeConsumer /></AppearanceProvider>);
      expect(screen.getByTestId('appearance-probe').textContent).toContain('nbody');
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

const ProbeConsumer = () => {
  const { preferences } = useAppearance();
  return <output data-testid="appearance-probe">{preferences.background}</output>;
};

