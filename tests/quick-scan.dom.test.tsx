import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ExperienceModeProvider } from '../contexts/ExperienceModeContext';
import { ExperienceModeControl } from '../components/PortfolioExperience';

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
});
