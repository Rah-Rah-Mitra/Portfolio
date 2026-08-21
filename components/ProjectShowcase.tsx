import React, { useEffect, useMemo, useState } from 'react';
import type { ProjectHighlight } from '../types';
import CarouselStacked, { type StackedSlide } from './ui/carousel-stacked';
import { ProjectLinks } from './ProjectLinks';
import { track } from '../lib/analytics';

const accentPlateClass: Record<ProjectHighlight['accent'], string> = {
  cyan: 'project-plate-cyan',
  red: 'project-plate-red',
  violet: 'project-plate-violet',
  green: 'project-plate-green',
  amber: 'project-plate-amber',
  blue: 'project-plate-blue',
};

const monogramFor = (title: string): string => {
  const words = title.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '··';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
};

interface ProjectShowcaseProps {
  projects: ProjectHighlight[];
  domainLabels: Record<ProjectHighlight['accent'], string>;
}

/** Draggable stacked-card menu over the archive: the centered card exposes its
 * evidence links directly and jumps to the full entry below on activation. */
const ProjectShowcase: React.FC<ProjectShowcaseProps> = ({ projects, domainLabels }) => {
  const [enhanced, setEnhanced] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => setEnhanced(true), []);

  const slides = useMemo<StackedSlide[]>(() => projects.map((project) => ({
    id: project.id,
    image: project.imageUrl,
    title: project.title,
    description: project.description,
    badge: domainLabels[project.accent],
    monogram: monogramFor(project.title),
    accentClass: accentPlateClass[project.accent],
  })), [domainLabels, projects]);

  if (!enhanced || projects.length === 0) return null;

  const activeProject = projects[Math.min(activeIndex, projects.length - 1)]!;

  const jumpToArchiveEntry = (project: ProjectHighlight) => {
    track('project_showcase_opened', { title: project.title });
    const targetHash = `#project-${project.id}`;
    if (window.location.hash !== targetHash) window.location.hash = targetHash;
    window.setTimeout(() => {
      const entry = document.getElementById(`project-${project.id}`);
      entry?.scrollIntoView({ block: 'start', behavior: 'auto' });
      (entry as HTMLElement | null)?.focus({ preventScroll: true });
    }, 90);
  };

  return (
    <section className="project-showcase" aria-label="Project showcase carousel">
      <div className="project-showcase-heading">
        <h3>Showcase</h3>
        <p>Drag the deck or step through it; the centered card is expanded below. Select a card to open its archive entry.</p>
      </div>
      <CarouselStacked
        slides={slides}
        onActiveChange={setActiveIndex}
        onSlideActivate={(index) => {
          const project = projects[index];
          if (project) jumpToArchiveEntry(project);
        }}
      />
      <div className="project-showcase-detail" data-project-id={activeProject.id}>
        <div className="project-showcase-detail-meta">
          <span>{domainLabels[activeProject.accent]}</span>
          <time>{activeProject.dateLabel ?? 'Archive'}</time>
        </div>
        <h4>{activeProject.title}</h4>
        <p>{activeProject.description}</p>
        <div className="project-showcase-detail-actions">
          <ProjectLinks project={activeProject} />
          <button type="button" onClick={() => jumpToArchiveEntry(activeProject)}>Open archive entry ↓</button>
        </div>
      </div>
    </section>
  );
};

export default ProjectShowcase;
