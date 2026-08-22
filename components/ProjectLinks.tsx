import React from 'react';
import type { ProjectHighlight } from '../types';
import { track } from '../lib/analytics';

export const ExternalLabel: React.FC = () => <span className="sr-only"> (opens in a new tab)</span>;

export const ProjectLinks: React.FC<{ project: ProjectHighlight }> = ({ project }) => {
  const links = [
    ...(project.repoUrl ? [{ label: 'Repository', url: project.repoUrl }] : []),
    ...(project.liveUrl ? [{ label: 'Live project', url: project.liveUrl }] : []),
    ...(project.links ?? []),
  ];
  if (links.length === 0) return <span className="project-link-muted">Evidence described in portfolio</span>;
  return (
    <div className="project-links">
      {links.map((link) => (
        <a key={`${project.id}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" onClick={() => track('project_link_clicked', { title: project.title, destination: link.url })}>
          {link.label}<ExternalLabel />
        </a>
      ))}
    </div>
  );
};
