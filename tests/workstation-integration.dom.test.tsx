import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PortfolioExperience from '../components/PortfolioExperience';
import { WorkstationProvider } from '../contexts/WorkstationContext';
import { ExperienceModeProvider } from '../contexts/ExperienceModeContext';
import { EffectsProvider } from '../contexts/PhysicsContext';

const renderPortfolio = (enabled: boolean) => render(
  <ExperienceModeProvider capabilities={{ saveData: false, reducedMotion: true, webgl: 'full' }}>
    <EffectsProvider>
      <WorkstationProvider enabled={enabled}>
        <PortfolioExperience />
      </WorkstationProvider>
    </EffectsProvider>
  </ExperienceModeProvider>,
);

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width'), media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

describe('portfolio workstation integration', () => {
  it('launches the recruiter dossier and opens evidence as a focused application', async () => {
    renderPortfolio(true);
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Workstation applications' })).not.toBeNull());
    expect(screen.getByRole('heading', { level: 1, name: 'Intelligent systems, made operational.' })).not.toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: 'Selected systems and engineering work' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open Selected Work' }));
    expect(screen.getByRole('dialog', { name: 'Selected Work' })).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Selected systems and engineering work' })).not.toBeNull();
    expect(screen.queryByRole('heading', { level: 1, name: 'Intelligent systems, made operational.' })).toBeNull();
  });

  it('flattens every evidence application when workstation enhancement is disabled', async () => {
    renderPortfolio(false);
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Workstation applications' })).toBeNull());
    expect(screen.getByRole('heading', { level: 1, name: 'Intelligent systems, made operational.' })).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Selected systems and engineering work' })).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Experience and education' })).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'All projects' })).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Role-targeted résumés' })).not.toBeNull();
  });
});
