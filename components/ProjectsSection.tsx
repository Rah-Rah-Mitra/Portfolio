import React, { useMemo, useState } from 'react';
import { ProjectHighlight } from '../types';
import SectionContainer from './SectionContainer';
import { track } from '../lib/analytics';

interface ProjectsSectionProps {
  id: string;
  projects: ProjectHighlight[];
  archiveProjects?: ProjectHighlight[];
}

const accentLabels: Record<ProjectHighlight['accent'], string> = {
  cyan: 'Systems', red: 'Security', violet: 'Spatial / AI', green: 'Civic', amber: 'Optimization', blue: 'Architecture',
};

const ProjectLinks: React.FC<{ project: ProjectHighlight }> = ({ project }) => {
  const primary = project.repoUrl ?? project.liveUrl;
  return (
    <div className="case-links">
      {primary && (
        <a
          href={primary}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('project_link_clicked', { title: project.title, destination: primary })}
        >
          {project.repoUrl ? 'Repository' : 'Open work'} <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      {project.links?.map((link) => (
        <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" onClick={() => track('project_link_clicked', { title: project.title, destination: link.url })}>
          {link.label} <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ))}
    </div>
  );
};

const CaseStudyPreview: React.FC<{ project: ProjectHighlight; index: number }> = ({ project, index }) => (
  <article id={`project-${project.id}`} className={`case-study case-study-${(index % 3) + 1}`} data-accent={project.accent}>
    <div className="case-main">
      <div className="case-meta">
        <span>{accentLabels[project.accent]}</span>
        <span>{project.dateLabel}</span>
      </div>
      <h3>{project.title}</h3>
      <p className="case-context">{project.spotlight?.context ?? project.description}</p>

      {project.spotlight && (
        <dl className="case-evidence">
          <div><dt>Contribution</dt><dd>{project.spotlight.contribution}</dd></div>
          <div><dt>Technical approach</dt><dd>{project.spotlight.approach}</dd></div>
          <div><dt>Result / state</dt><dd>{project.spotlight.outcome}</dd></div>
        </dl>
      )}

      <div className="method-list" aria-label={`${project.title} methods`}>
        {project.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <ProjectLinks project={project} />
    </div>
    {project.imageUrl && (
      <figure className="case-visual">
        <img src={project.imageUrl} alt={`Visual evidence for ${project.title}`} loading="lazy" decoding="async" />
        <figcaption>{project.category}</figcaption>
      </figure>
    )}
  </article>
);

const ProjectsSection: React.FC<ProjectsSectionProps> = ({ id, projects, archiveProjects = [] }) => {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = useMemo(() => projects
    .filter((project) => project.spotlight)
    .sort((a, b) => (a.featuredPriority ?? 99) - (b.featuredPriority ?? 99))
    .slice(0, 7), [projects]);
  const completeArchive = useMemo(() => {
    const selectedIds = new Set(selected.map((project) => project.id));
    return [...projects.filter((project) => !selectedIds.has(project.id)), ...archiveProjects]
      .sort((a, b) => (b.sortDate ?? '').localeCompare(a.sortDate ?? ''));
  }, [archiveProjects, projects, selected]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return completeArchive;
    return completeArchive.filter((project) => [project.title, project.description, project.category, ...project.tags].join(' ').toLowerCase().includes(normalized));
  }, [completeArchive, query]);

  return (
    <SectionContainer
      id={id}
      title="Selected engineering work"
      subtitle="Representative systems, presented as operating problems rather than a wall of equal-weight projects. Confidential professional work stays deliberately abstracted."
      className="work-section"
    >
      <div className="case-study-list">
        {selected.map((project, index) => <CaseStudyPreview key={project.id} project={project} index={index} />)}
      </div>

      <div className="archive-drawer">
        <div>
          <h3>Complete project archive</h3>
          <p>Coursework, public repositories, learning artifacts, and smaller experiments remain searchable without competing with selected work.</p>
        </div>
        <button
          type="button"
          className="button button-secondary"
          aria-expanded={archiveOpen}
          aria-controls="project-archive"
          onClick={() => {
            setArchiveOpen((current) => !current);
            track('project_archive_toggled', { expanded: !archiveOpen, visible_count: !archiveOpen ? completeArchive.length : 0 });
          }}
        >
          {archiveOpen ? 'Close archive' : `Browse ${completeArchive.length} more`}
        </button>
      </div>

      {archiveOpen && (
        <div id="project-archive" className="archive-panel">
          <label className="search-field">
            <span>Search projects and methods</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try Python, security, geometry..." />
          </label>
          <p className="archive-count" role="status">{filtered.length} result{filtered.length === 1 ? '' : 's'}</p>
          <div className="archive-list">
            {filtered.map((project) => (
              <article key={project.id} id={`project-${project.id}`}>
                <div>
                  <span>{project.dateLabel ?? 'Archive'}</span>
                  <h4>{project.title}</h4>
                  <p>{project.description}</p>
                </div>
                <div className="archive-actions">
                  <span>{project.category}</span>
                  <ProjectLinks project={project} />
                </div>
              </article>
            ))}
          </div>
          {filtered.length === 0 && <p className="empty-state">No project matches that search. Try a broader method or domain.</p>}
        </div>
      )}
    </SectionContainer>
  );
};

export default ProjectsSection;
