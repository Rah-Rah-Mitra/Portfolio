import React from 'react';
import { ProjectHighlight } from '../types';
import BreakableText from './BreakableText';
import SectionContainer from './SectionContainer';
import { TagIcon } from './icons/GenericIcons';
import { track } from '../lib/analytics';

interface ProjectsSectionProps {
  id: string;
  projects: ProjectHighlight[];
}

const accentClasses: Record<ProjectHighlight['accent'], string> = {
  cyan: 'border-cyan-400/50 hover:border-cyan-300 hover:shadow-cyan-500/20 text-cyan-300',
  red: 'border-red-500/50 hover:border-red-400 hover:shadow-red-500/20 text-red-300',
  violet: 'border-violet-400/50 hover:border-violet-300 hover:shadow-violet-500/20 text-violet-300',
  green: 'border-emerald-400/50 hover:border-emerald-300 hover:shadow-emerald-500/20 text-emerald-300',
  amber: 'border-amber-400/50 hover:border-amber-300 hover:shadow-amber-500/20 text-amber-300',
  blue: 'border-blue-400/50 hover:border-blue-300 hover:shadow-blue-500/20 text-blue-300',
};

const ProjectCard: React.FC<{ project: ProjectHighlight }> = ({ project }) => {
  const href = project.liveUrl ?? project.repoUrl;
  return (
    <article
      className={`project-card group relative overflow-hidden rounded-lg border bg-gray-950/78 p-5 shadow-2xl backdrop-blur transition-all duration-300 ${accentClasses[project.accent]}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(56,189,248,0.10),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.04),transparent)] opacity-80" aria-hidden="true" />
      <div className="relative z-10 flex h-full flex-col">
        {project.imageUrl ? (
          <div className="mb-4 h-36 overflow-hidden rounded-md border border-white/10 bg-black/40">
            <img src={project.imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
          </div>
        ) : (
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-md border border-current/40 bg-current/10">
            <TagIcon className="h-8 w-8" />
          </div>
        )}
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-current">{project.category}</p>
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
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('project_link_clicked', { title: project.title, destination: href })}
            className="inline-flex w-fit items-center gap-2 rounded-md border border-current/45 px-3 py-2 text-sm font-semibold text-current transition-colors hover:bg-white/10"
          >
            Open project
          </a>
        )}
      </div>
    </article>
  );
};

const ProjectsSection: React.FC<ProjectsSectionProps> = ({ id, projects }) => (
  <SectionContainer
    id={id}
    title="Selected Projects"
    subtitle="A sharper map of what I build: agentic AI systems, cyber tooling, civic products, and interactive worlds."
    className="bg-gray-950"
  >
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  </SectionContainer>
);

export default ProjectsSection;
