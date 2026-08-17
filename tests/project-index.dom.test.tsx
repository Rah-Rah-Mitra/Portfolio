import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AllProjectsSection, SelectedWork } from '../components/PortfolioExperience';
import { allProjects } from '../portfolioData';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('recruiter project evidence', () => {
  it('leads with the required five evidence-rich selected cases', () => {
    const { container } = render(<SelectedWork />);
    const titles = Array.from(container.querySelectorAll('.selected-project h3'), (node) => node.textContent);
    expect(titles).toHaveLength(5);
    expect(titles.slice(0, 3)).toEqual(['Hybrid Flow Shop Digital Twin Optimizer', 'Churp', 'OnTheSpectrum']);
    expect(container.querySelectorAll('.project-evidence')).toHaveLength(5);
    Array.from(container.querySelectorAll<HTMLElement>('.selected-project')).forEach((project, index) => {
      const image = project.querySelector<HTMLImageElement>('.selected-project-media img');
      if (image && index > 0) expect(image.getAttribute('loading')).toBe('lazy');
    });
  });

  it('compacts to eight projects after hydration and loads four more', async () => {
    const { container } = render(<AllProjectsSection />);
    await waitFor(() => expect(container.querySelectorAll('.project-index-list article')).toHaveLength(8));
    fireEvent.click(screen.getByRole('button', { name: /Load 4 more projects/ }));
    expect(container.querySelectorAll('.project-index-list article')).toHaveLength(12);
  });

  it('searches all 28 records, including projects outside the first batch', async () => {
    const hiddenProject = allProjects[20];
    const { container } = render(<AllProjectsSection />);
    await waitFor(() => expect(container.querySelectorAll('.project-index-list article')).toHaveLength(8));
    fireEvent.change(screen.getByRole('searchbox', { name: /Search by project/ }), { target: { value: hiddenProject.title } });
    expect(screen.getByRole('heading', { name: hiddenProject.title })).not.toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Showing 1 of 28 projects');
  });

  it('reveals the batch containing a matching project hash', async () => {
    const hiddenProject = allProjects[20];
    window.history.replaceState(null, '', `/#project-${hiddenProject.id}`);
    const { container } = render(<AllProjectsSection />);
    await waitFor(() => expect(container.querySelector(`#project-${hiddenProject.id}`)).not.toBeNull());
    expect(container.querySelectorAll('.project-index-list article').length).toBeGreaterThanOrEqual(21);
  });

  it('steps through the currently filtered result set with buttons and Arrow/Home/End', async () => {
    const { container } = render(<AllProjectsSection />);
    const search = screen.getByRole('searchbox', { name: /Search by project/ });
    fireEvent.change(search, { target: { value: 'Python' } });
    const list = container.querySelector<HTMLElement>('.project-index-list');
    if (!list) throw new Error('project list is required');
    const results = within(list).getAllByRole('article') as HTMLElement[];
    expect(results.length).toBeGreaterThan(2);

    results[0].focus();
    fireEvent.keyDown(results[0], { key: 'End' });
    expect(document.activeElement).toBe(results.at(-1));
    fireEvent.keyDown(results.at(-1)!, { key: 'Home' });
    expect(document.activeElement).toBe(results[0]);
    fireEvent.keyDown(results[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(results[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Next project' }));
    expect(document.activeElement).toBe(results[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Previous project' }));
    expect(document.activeElement).toBe(results[1]);
  });
});
