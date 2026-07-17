import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ProjectHighlight } from '../types';
import BreakableText from './BreakableText';
import SectionContainer from './SectionContainer';
import { TagIcon } from './icons/GenericIcons';
import { track } from '../lib/analytics';

interface ProjectsSectionProps {
  id: string;
  projects: ProjectHighlight[];
  archiveProjects?: ProjectHighlight[];
}

const FEATURED_PROJECT_COUNT = 10;
const FALLBACK_SORT_DATE = '0000-00-00';

const sortProjectsByDate = (projects: ProjectHighlight[]) => (
  projects
    .map((project, index) => ({ project, index }))
    .sort((a, b) => {
      const dateCompare = (b.project.sortDate ?? FALLBACK_SORT_DATE).localeCompare(a.project.sortDate ?? FALLBACK_SORT_DATE);
      return dateCompare || a.index - b.index;
    })
    .map(({ project }) => project)
);

const accentClasses: Record<ProjectHighlight['accent'], string> = {
  cyan: 'border-cyan-400/50 hover:border-cyan-300 hover:shadow-cyan-500/20 text-cyan-300',
  red: 'border-red-500/50 hover:border-red-400 hover:shadow-red-500/20 text-red-300',
  violet: 'border-violet-400/50 hover:border-violet-300 hover:shadow-violet-500/20 text-violet-300',
  green: 'border-emerald-400/50 hover:border-emerald-300 hover:shadow-emerald-500/20 text-emerald-300',
  amber: 'border-amber-400/50 hover:border-amber-300 hover:shadow-amber-500/20 text-amber-300',
  blue: 'border-blue-400/50 hover:border-blue-300 hover:shadow-blue-500/20 text-blue-300',
};

const ProjectCard: React.FC<{ project: ProjectHighlight; compact?: boolean }> = ({ project, compact = false }) => {
  const href = project.liveUrl ?? project.repoUrl;
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article
      id={`project-${project.id}`}
      data-analytics-id={`project-card-${project.id}`}
      className={`project-card group relative overflow-hidden rounded-lg border bg-gray-950/78 p-5 shadow-2xl backdrop-blur transition-all duration-300 ${accentClasses[project.accent]}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(56,189,248,0.10),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.04),transparent)] opacity-80" aria-hidden="true" />
      <div className="relative z-10 flex h-full flex-col">
        {project.imageUrl && !imageFailed ? (
          <div className={`${compact ? 'h-28' : 'h-36'} mb-4 overflow-hidden rounded-md border border-white/10 bg-black/40`}>
            <img src={project.imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
          </div>
        ) : (
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-md border border-current/40 bg-current/10">
            <TagIcon className="h-8 w-8" />
          </div>
        )}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-current">{project.category}</p>
          {project.dateLabel && <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-gray-300">{project.dateLabel}</span>}
        </div>
        <h3 className="mb-3 text-2xl font-bold text-white">
          <BreakableText text={project.title} />
        </h3>
        <p className="mb-5 flex-grow text-sm leading-relaxed text-gray-300">
          <BreakableText text={project.description} />
        </p>
        <div className="mb-5 flex flex-wrap gap-2">
          {project.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="rounded border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-300">
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              data-analytics-id={`project-open-${project.id}`}
              onClick={() => track('project_link_clicked', { title: project.title, destination: href })}
              className="inline-flex w-fit items-center gap-2 rounded-md border border-current/45 px-3 py-2 text-sm font-semibold text-current transition-colors hover:bg-white/10"
            >
              Open project
            </a>
          )}
          {project.links?.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              data-analytics-id={`project-link-${project.id}`}
              onClick={() => track('project_link_clicked', { title: project.title, destination: link.url })}
              className="inline-flex w-fit items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-gray-200 transition-colors hover:border-current hover:text-current"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </article>
  );
};

const ProjectsSection: React.FC<ProjectsSectionProps> = ({ id, projects, archiveProjects = [] }) => {
  const [showAllFeatured, setShowAllFeatured] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');
  const archiveSearchTouched = useRef(false);

  const sortedProjects = useMemo(() => sortProjectsByDate(projects), [projects]);
  const visibleFeatured = showAllFeatured ? sortedProjects : sortedProjects.slice(0, FEATURED_PROJECT_COUNT);
  const filteredArchive = useMemo(() => {
    const query = archiveSearch.trim().toLowerCase();
    const filteredProjects = query ? archiveProjects.filter((project) => (
      [project.title, project.description, project.category, project.dateLabel, ...project.tags]
        .join(' ')
        .toLowerCase()
        .includes(query)
    )) : archiveProjects;
    return sortProjectsByDate(filteredProjects);
  }, [archiveProjects, archiveSearch]);

  useEffect(() => {
    if (!showArchive || !archiveSearchTouched.current) return;

    const timeoutId = window.setTimeout(() => {
      track('archive_search_changed', {
        query_length: archiveSearch.trim().length,
        result_count: filteredArchive.length,
      });
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [archiveSearch, filteredArchive.length, showArchive]);

  const toggleFeatured = () => {
    const expanded = !showAllFeatured;
    setShowAllFeatured(expanded);
    track('featured_projects_toggled', {
      expanded,
      visible_count: expanded ? sortedProjects.length : FEATURED_PROJECT_COUNT,
    });
  };

  const toggleArchive = () => {
    const expanded = !showArchive;
    setShowArchive(expanded);
    track('project_archive_toggled', {
      expanded,
      visible_count: expanded ? filteredArchive.length : 0,
    });
  };

  return (
    <SectionContainer
      id={id}
      title="Selected Projects"
      subtitle="A sharper map of what I build: agentic AI systems, cyber tooling, civic products, interactive worlds, and the public archive behind them."
      className="bg-gray-950"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">Featured builds</p>
        <div className="flex flex-wrap gap-2">
          {projects.length > FEATURED_PROJECT_COUNT && (
            <button
              type="button"
              onClick={toggleFeatured}
              data-analytics-id="projects-toggle-featured"
              className="rounded-md border border-cyan-300/35 px-3 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/10 dark:border-red-400/35 dark:text-red-100 dark:hover:bg-red-500/10"
            >
              {showAllFeatured ? 'Show fewer featured' : `See more featured (${projects.length - FEATURED_PROJECT_COUNT})`}
            </button>
          )}
          {archiveProjects.length > 0 && (
            <button
              type="button"
              onClick={toggleArchive}
              data-analytics-id="projects-toggle-archive"
              className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-gray-200 transition-colors hover:border-cyan-300 hover:text-cyan-200 dark:hover:border-red-300 dark:hover:text-red-200"
            >
              {showArchive ? 'Hide repo archive' : `Open repo archive (${archiveProjects.length})`}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {visibleFeatured.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>

      {showArchive && (
        <div className="mt-10 rounded-lg border border-white/10 bg-black/30 p-4">
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr,20rem] md:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">Expandable repo archive</p>
              <p className="mt-1 text-sm text-gray-400">Coursework, forks, learning repos, and smaller experiments stay accessible without crowding the main project grid.</p>
            </div>
            <label className="block">
              <span className="sr-only">Search repository archive</span>
              <input
                type="search"
                value={archiveSearch}
                onChange={(event) => {
                  archiveSearchTouched.current = true;
                  setArchiveSearch(event.target.value);
                }}
                placeholder="Search archive..."
                data-analytics-id="projects-archive-search"
                className="h-10 w-full rounded-md border border-white/10 bg-gray-950/80 px-3 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-cyan-300 dark:focus:border-red-300"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredArchive.map((project) => (
              <ProjectCard key={project.id} project={project} compact />
            ))}
          </div>
          {filteredArchive.length === 0 && (
            <div className="rounded-md border border-white/10 bg-gray-950/80 p-5 text-center text-sm text-gray-300">
              No archive projects match that search.
            </div>
          )}
        </div>
      )}
    </SectionContainer>
  );
};

export default ProjectsSection;
