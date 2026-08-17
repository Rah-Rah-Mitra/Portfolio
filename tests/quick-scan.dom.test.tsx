import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ExperienceModeProvider, useExperienceMode } from '../contexts/ExperienceModeContext';
import { ExperienceModeControl, PortfolioHeader } from '../components/PortfolioExperience';

const PolicyProbe = () => {
  const { policy } = useExperienceMode();
  return <output data-testid="policy">{JSON.stringify(policy)}</output>;
};

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('Guided and Quick Scan control', () => {
  it('reads canonical scan mode and preserves the hash when Guided is selected', async () => {
    window.history.replaceState(null, '', '/?ref=recruiter&mode=scan#project-churp');
    render(
      <ExperienceModeProvider capabilities={{ saveData: false, reducedMotion: false, webgl: 'full' }}>
        <ExperienceModeControl />
      </ExperienceModeProvider>,
    );
    const scan = screen.getByRole('button', { name: 'Quick Scan' });
    await waitFor(() => expect(scan.getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Guided' }));
    expect(window.location.search).toBe('?ref=recruiter');
    expect(window.location.hash).toBe('#project-churp');
    expect(sessionStorage.getItem('portfolio-experience-mode')).toBe('guided');
  });

  it('does not allow Guided to override a hard WebGL failure', async () => {
    render(
      <ExperienceModeProvider capabilities={{ saveData: false, reducedMotion: false, webgl: 'failed' }}>
        <ExperienceModeControl />
      </ExperienceModeProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Quick Scan' }).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByRole('button', { name: 'Guided' })).toHaveProperty('disabled', true);
  });

  it('lets a session choice override Save-Data', async () => {
    render(
      <ExperienceModeProvider capabilities={{ saveData: true, reducedMotion: false, webgl: 'full' }}>
        <ExperienceModeControl />
      </ExperienceModeProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Quick Scan' }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Guided' }));
    expect(screen.getByRole('button', { name: 'Guided' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('enables enhancements after an explicit reduced-motion Guided opt-in', async () => {
    render(
      <ExperienceModeProvider capabilities={{ saveData: false, reducedMotion: true, webgl: 'full' }}>
        <ExperienceModeControl />
        <PolicyProbe />
      </ExperienceModeProvider>,
    );
    await waitFor(() => expect(screen.getByText('Guided, low-motion rendering')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Guided' }));
    expect(screen.getByTestId('policy').textContent).toContain('"allowHeavyAssets":true');
    expect(screen.getByTestId('policy').textContent).toContain('"choice":"explicit"');
  });

  it('synchronizes policy from popstate history without reusing the latest session choice', async () => {
    window.history.replaceState({ portfolioExperienceMode: 'guided' }, '', '/#project-churp');
    sessionStorage.setItem('portfolio-experience-mode', 'scan');
    render(
      <ExperienceModeProvider capabilities={{ saveData: false, reducedMotion: false, webgl: 'full' }}>
        <ExperienceModeControl />
      </ExperienceModeProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Quick Scan' }).getAttribute('aria-pressed')).toBe('true'));

    window.history.replaceState({ portfolioExperienceMode: 'guided' }, '', '/#project-churp');
    window.dispatchEvent(new PopStateEvent('popstate', { state: { portfolioExperienceMode: 'guided' } }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guided' }).getAttribute('aria-pressed')).toBe('true'));
    expect(window.location.hash).toBe('#project-churp');

    window.history.replaceState({ portfolioExperienceMode: 'scan' }, '', '/?mode=scan#project-churp');
    window.dispatchEvent(new PopStateEvent('popstate', { state: { portfolioExperienceMode: 'scan' } }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Quick Scan' }).getAttribute('aria-pressed')).toBe('true'));
  });

  it('renders Explore World as ordinary navigation to the registered future anchor', async () => {
    render(
      <ExperienceModeProvider capabilities={{ saveData: false, reducedMotion: false, webgl: 'full' }}>
        <PortfolioHeader />
      </ExperienceModeProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guided' }).getAttribute('aria-pressed')).toBe('true'));
    const links = screen.getAllByRole('link', { name: 'Explore World' });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => expect(link.getAttribute('href')).toBe('#world'));
  });
});
