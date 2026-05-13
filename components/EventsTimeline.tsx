import React from 'react';
import { EventHighlight, ProjectHighlight } from '../types';
import BreakableText from './BreakableText';
import SectionContainer from './SectionContainer';
import { CalendarDaysIcon } from './icons/GenericIcons';
import { track } from '../lib/analytics';

interface EventsTimelineProps {
  id: string;
  events: EventHighlight[];
  projects: ProjectHighlight[];
}

const EventsTimeline: React.FC<EventsTimelineProps> = ({ id, events, projects }) => {
  const projectById = new Map(projects.map((project) => [project.id, project]));

  return (
    <SectionContainer
      id={id}
      title="Field Notes & Events"
      subtitle="Hackathons, internships, certifications, and public build notes pulled from the LinkedIn activity text you provided."
      className="bg-black"
    >
      <div className="mx-auto max-w-5xl">
        <div className="relative border-l border-cyan-400/25 pl-6 md:pl-10">
          {events.map((event) => {
            const linkedProjects = (event.linkedProjectIds ?? [])
              .map((projectId) => projectById.get(projectId))
              .filter((project): project is ProjectHighlight => Boolean(project));

            return (
              <article id={`event-${event.id}`} key={event.id} className="event-node relative mb-10 scroll-mt-28 rounded-lg border border-white/10 bg-gray-950/82 p-5 shadow-2xl backdrop-blur last:mb-0">
                <div className="absolute -left-[33px] top-6 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.9)] md:-left-[49px]" aria-hidden="true" />
                <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-gray-400">
                  <span className="inline-flex items-center gap-2 rounded border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 font-semibold text-cyan-200">
                    <CalendarDaysIcon className="h-4 w-4" />
                    {event.dateLabel}
                  </span>
                  <span className="rounded border border-white/10 bg-white/5 px-2.5 py-1">{event.source}</span>
                  {event.exactDateRange && <span>{event.exactDateRange}</span>}
                </div>
                <h3 className="mb-3 text-2xl font-bold text-white">
                  <BreakableText text={event.title} />
                </h3>
                <p className="mb-4 text-sm leading-relaxed text-gray-300">
                  <BreakableText text={event.summary} />
                </p>
                {linkedProjects.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {linkedProjects.map((project) => (
                      <a
                        key={project.id}
                        href={project.repoUrl ?? project.liveUrl ?? `#${id}`}
                        target={project.repoUrl || project.liveUrl ? '_blank' : undefined}
                        rel={project.repoUrl || project.liveUrl ? 'noopener noreferrer' : undefined}
                        onClick={() => track('event_project_link_clicked', { event: event.title, project: project.title })}
                        className="rounded border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-400/20"
                      >
                        {project.title}
                      </a>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {event.tags.map((tag) => (
                    <span key={tag} className="rounded bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-300">
                      {tag}
                    </span>
                  ))}
                </div>
                {event.linkUrl && (
                  <a
                    href={event.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => track('event_link_clicked', { event: event.title, destination: event.linkUrl ?? '' })}
                    className="mt-5 inline-flex rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-cyan-300 hover:text-cyan-200"
                  >
                    View linked media
                  </a>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </SectionContainer>
  );
};

export default EventsTimeline;
