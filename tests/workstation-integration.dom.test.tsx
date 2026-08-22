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
  it('starts on the desktop and opens the dossier and evidence as focused applications', async () => {
    renderPortfolio(true);
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Workstation applications' })).not.toBeNull());
    expect(screen.queryByRole('heading', { level: 1, name: 'Intelligent systems, made operational.' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: 'Selected systems and engineering work' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Desktop' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open Home / Dossier' }));
    expect(screen.getByRole('dialog', { name: 'Home / Dossier' })).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Intelligent systems, made operational.' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open Selected Work' }));
    expect(screen.getByRole('dialog', { name: 'Selected Work' })).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Selected systems and engineering work' })).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Intelligent systems, made operational.' })).not.toBeNull();
  });

  it('uses the rendered optical bench instead of SVG demonstration artwork', async () => {
    const { container } = renderPortfolio(true);
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Workstation applications' })).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Open Home / Dossier' }));
    const render = await screen.findByRole('img', { name: 'Rendered optical rail with camera, aperture, and calibration plane' });
    expect(render.getAttribute('src')).toBe('/workstation/posters/optical-bench.webp');
    expect(container.querySelector('.hero-calibration-static svg')).toBeNull();
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
