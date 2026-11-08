import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResumeBuilder } from '../components/workbench/ResumeBuilder';
import { buildSpec, builderContent as content, draftFromConfig } from '../components/workbench/ResumeBuilderPanel';
import { assemble } from '../server/resumeAssemble.mjs';
import { pools, resumeConfigs } from '../server/resumeContent.mjs';

// The Résumé Builder window (WIN-11) starts from a ready-made résumé, and
// "General Master CV" is the master CV. Before Nov 2026 it kept only a preset's
// ids: no SUMMARY, "EXPERIENCE" for the CV's "WORK EXPERIENCE", projects as
// headed entries rather than the CV's inline lines, and none of a preset's
// per-bullet tiers. These pin that a preset builds the document it names.

type Config = Parameters<typeof draftFromConfig>[0];
const configs = resumeConfigs as unknown as Array<Config & { detail: 'full' | 'standard' }>;
const general = configs.find((config) => config.slug === 'general') as Config & { detail: 'full' };

describe('a preset in the builder', () => {
  it.each(configs.map((config) => [config.slug, config] as const))('%s prints what the ready-made résumé prints', (_slug, config) => {
    const built = buildSpec(content, draftFromConfig(config), config.detail, config.pages, 'nus');
    expect(assemble(built, pools)).toEqual(assemble(config, pools));
  });

  it('opens the master CV with its SUMMARY, its headings and inline projects', () => {
    const built = buildSpec(content, draftFromConfig(general), 'full', 2, 'nus');
    expect(built.sections.map((section) => section.title)).toEqual([
      'SUMMARY', 'EDUCATION', 'WORK EXPERIENCE', 'RESEARCH EXPERIENCE', 'PROJECTS',
      'CO-CURRICULAR ACTIVITIES AND VOLUNTEER EXPERIENCES', 'NATIONAL SERVICE', 'SKILLS AND CERTIFICATIONS',
    ]);
    expect(built.sections.find((section) => section.type === 'projects')).toMatchObject({ render: 'cv-inline' });
  });
});

describe('the builder window', () => {
  let posted: Array<Record<string, unknown>>;

  beforeEach(() => {
    localStorage.clear();
    posted = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      posted.push(JSON.parse(String(init?.body)).spec);
      return new Response(new Blob(['%PDF-1.4']), { headers: { 'X-Resume-Pages': '2', 'X-Resume-Fit': '8.5pt/0.5in' } });
    }));
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  const pressed = (group: string) => screen.getByRole('group', { name: group }).querySelector('[aria-pressed="true"]')?.textContent;

  it('starting from General Master CV takes its summary, tier, layout and page budget', async () => {
    render(<ResumeBuilder />);
    const select = await screen.findByRole('combobox', { name: 'Start from an existing résumé' });
    fireEvent.change(select, { target: { value: 'general' } });

    expect((screen.getByRole('group', { name: 'SUMMARY' }).querySelector('input') as HTMLInputElement).checked).toBe(true);
    expect(pressed('Bullet length')).toBe('FULL');
    expect(pressed('Project layout')).toBe('INLINE');
    expect(pressed('Page budget')).toBe('2 PAGES');
    // Inline, a project prints one bullet, so its bullets are radios.
    expect(screen.getByRole('group', { name: 'PROJECTS' }).querySelectorAll('input[type="radio"]').length).toBeGreaterThan(0);

    const expected = buildSpec(content, draftFromConfig(general), 'full', 2, 'nus');
    await waitFor(() => expect(posted.at(-1)).toEqual(expected));
  });

  it('keeps a preset’s per-bullet tiers until one length is chosen for every bullet', async () => {
    render(<ResumeBuilder />);
    // Highlights opens the window, and pins setpoint, validation and churp short.
    await screen.findByRole('combobox', { name: 'Start from an existing résumé' });
    await waitFor(() => expect(posted.length).toBeGreaterThan(0));
    const bullets = (posted.at(-1)?.sections as Array<{ entries?: Array<{ id: string; bullets: unknown[] }> }>)
      .flatMap((section) => section.entries ?? []).flatMap((entry) => entry.bullets);
    expect(bullets).toContainEqual({ id: 'setpoint', tier: 'short' });
    expect(screen.getAllByText('SHORT', { selector: '.wb-tick-pin' }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'STANDARD' }));
    expect(document.querySelector('.wb-tick-pin')).toBeNull();
    await waitFor(() => expect(JSON.stringify(posted.at(-1))).not.toContain('"tier"'));
  });

  it('switching projects to inline keeps one bullet each, the master CV’s own', async () => {
    render(<ResumeBuilder />);
    await screen.findByRole('combobox', { name: 'Start from an existing résumé' });
    const projects = () => screen.getByRole('group', { name: 'PROJECTS' });
    const swarmline = () => Array.from(projects().querySelectorAll('.wb-builder-entry'))
      .find((entry) => entry.textContent?.includes('Swarmline')) as HTMLElement;
    // Entries layout: Swarmline afresh takes its first two bullets; tick its third,
    // the one sentence the master CV prints for it, as well.
    fireEvent.click(screen.getByRole('button', { name: 'ENTRIES' }));
    const entryBox = () => swarmline().querySelector('input') as HTMLInputElement;
    if (entryBox().checked) fireEvent.click(entryBox());
    fireEvent.click(entryBox());
    const subs = () => Array.from(swarmline().querySelectorAll<HTMLInputElement>('.wb-tick-sub input'));
    fireEvent.click(subs().find((input) => !input.checked) as HTMLInputElement);
    expect(subs().filter((input) => input.checked)).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'INLINE' }));
    expect(subs().filter((input) => input.checked)).toHaveLength(1);
    await waitFor(() => {
      const section = (posted.at(-1)?.sections as Array<{ type: string; render?: string; entries: Array<{ id: string; bullets: string[] }> }>)
        .find((item) => item.type === 'projects');
      expect(section?.render).toBe('cv-inline');
      for (const entry of section?.entries ?? []) expect(entry.bullets).toHaveLength(1);
      expect(section?.entries.find((entry) => entry.id === 'swarmline')?.bullets).toEqual(['combined']);
    });
  });
});
