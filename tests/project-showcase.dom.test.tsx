import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ProjectShowcase from '../components/ProjectShowcase';
import type { ProjectHighlight } from '../types';

const domainLabels: Record<ProjectHighlight['accent'], string> = {
  cyan: 'Software & systems',
  red: 'Responsible security',
  violet: 'AI & 3D perception',
  green: 'Civic & product',
  amber: 'Operations research',
  blue: 'Architecture',
};

const projects: ProjectHighlight[] = [
  {
    id: 'alpha',
    title: 'Alpha System',
    description: 'A deterministic scheduling twin.',
    category: 'Systems',
    tags: ['CP-SAT'],
    accent: 'cyan',
    repoUrl: 'https://github.com/example/alpha',
    dateLabel: '2026',
  },
  {
    id: 'beta',
    title: 'Beta Vision',
    description: 'Multi-view geometry toolkit.',
    category: 'Perception',
    tags: ['3D'],
    accent: 'violet',
    liveUrl: 'https://beta.example.com',
    dateLabel: '2025',
  },
  {
    id: 'gamma',
    title: 'Gamma Ledger',
    description: 'Civic evidence platform.',
    category: 'Civic',
    tags: ['GIS'],
    accent: 'green',
  },
];

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('project showcase carousel', () => {
  it('renders a card per project with domain badges and the active detail strip', async () => {
    const { container } = render(<ProjectShowcase projects={projects} domainLabels={domainLabels} />);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Project showcase carousel' })).not.toBeNull());
    await waitFor(() => expect(container.querySelectorAll('[data-carousel-card]')).toHaveLength(3));
    expect(screen.getAllByText('Software & systems').length).toBeGreaterThan(0);

    const detail = container.querySelector('.project-showcase-detail');
    expect(detail?.getAttribute('data-project-id')).toBe('alpha');
    const repoLink = screen.getByRole('link', { name: /Repository/ });
    expect(repoLink.getAttribute('href')).toBe('https://github.com/example/alpha');
    expect(repoLink.getAttribute('target')).toBe('_blank');
    expect(repoLink.getAttribute('rel')).toBe('noreferrer');
  });

  it('steps the deck with the controls and swaps the detail strip to the centered card', async () => {
    const { container } = render(<ProjectShowcase projects={projects} domainLabels={domainLabels} />);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Project showcase controls' })).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Show next showcase card' }));
    await waitFor(() => expect(container.querySelector('.project-showcase-detail')?.getAttribute('data-project-id')).toBe('beta'));
    const liveLink = screen.getByRole('link', { name: /Live project/ });
    expect(liveLink.getAttribute('href')).toBe('https://beta.example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Show previous showcase card' }));
    await waitFor(() => expect(container.querySelector('.project-showcase-detail')?.getAttribute('data-project-id')).toBe('alpha'));
  });

  it('wraps backwards past the first card and keeps fallback plates for image-less projects', async () => {
    const { container } = render(<ProjectShowcase projects={projects} domainLabels={domainLabels} />);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Project showcase controls' })).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Show previous showcase card' }));
    await waitFor(() => expect(container.querySelector('.project-showcase-detail')?.getAttribute('data-project-id')).toBe('gamma'));
    expect(screen.getByText('Evidence described in portfolio')).not.toBeNull();
    expect(container.querySelectorAll('.project-card-plate').length).toBeGreaterThan(0);
  });

  it('jumps to the archive entry through the explicit action', async () => {
    render(<ProjectShowcase projects={projects} domainLabels={domainLabels} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open archive entry ↓' })).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Open archive entry ↓' }));
    expect(window.location.hash).toBe('#project-alpha');
  });
});
