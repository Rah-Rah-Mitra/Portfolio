import React, { useMemo, useState } from 'react';
import { FieldNote, FieldNoteKind, ProjectHighlight } from '../types';
import BreakableText from './BreakableText';
import SectionContainer from './SectionContainer';
import { CalendarDaysIcon, TagIcon } from './icons/GenericIcons';
import { track } from '../lib/analytics';

interface EventsTimelineProps {
  id: string;
  notes: FieldNote[];
  projects: ProjectHighlight[];
  archiveProjects?: ProjectHighlight[];
}

const FILTERS: Array<{ id: 'all' | FieldNoteKind; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'event', label: 'Events' },
  { id: 'achievement', label: 'Achievements' },
  { id: 'project', label: 'Projects' },
  { id: 'career', label: 'Career' },
  { id: 'education', label: 'Education' },
  { id: 'certification', label: 'Certifications' },
];

const INITIAL_VISIBLE_NOTES = 8;

const kindLabels: Record<FieldNoteKind, string> = {
  event: 'Event',
  achievement: 'Achievement',
  project: 'Project',
  career: 'Career',
  education: 'Education',
  certification: 'Certification',
};

const kindClasses: Record<FieldNoteKind, string> = {
  event: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
  achievement: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  project: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
  career: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  education: 'border-blue-400/30 bg-blue-400/10 text-blue-200',
  certification: 'border-red-400/30 bg-red-400/10 text-red-200',
};

const noteMatchesSearch = (note: FieldNote, query: string) => {
  if (!query) return true;
  const haystack = [
    note.title,
    note.dateLabel,
    note.source,
    note.summary,
    note.kind,
    ...(note.tags ?? []),
    ...(note.organizations ?? []),
    ...(note.people ?? []),
  ].join(' ').toLowerCase();
  return haystack.includes(query);
};

const EventsTimeline: React.FC<EventsTimelineProps> = ({ id, notes, projects, archiveProjects = [] }) => {
  const [activeFilter, setActiveFilter] = useState<'all' | FieldNoteKind>('all');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const projectById = useMemo(() => (
    new Map([...projects, ...archiveProjects].map((project) => [project.id, project]))
  ), [archiveProjects, projects]);

  const counts = useMemo(() => (
    notes.reduce<Record<'all' | FieldNoteKind, number>>((acc, note) => {
      acc.all += 1;
      acc[note.kind] += 1;
      return acc;
    }, { all: 0, event: 0, achievement: 0, project: 0, career: 0, education: 0, certification: 0 })
  ), [notes]);

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return notes.filter((note) => (
      (activeFilter === 'all' || note.kind === activeFilter) &&
      noteMatchesSearch(note, query)
    ));
  }, [activeFilter, notes, search]);

  const visibleNotes = showAll ? filteredNotes : filteredNotes.slice(0, INITIAL_VISIBLE_NOTES);
  const hasHiddenNotes = filteredNotes.length > visibleNotes.length;

  const handleFilterChange = (filter: 'all' | FieldNoteKind) => {
    setActiveFilter(filter);
    setShowAll(false);
    track('field_notes_filter_changed', { filter });
  };

  return (
    <SectionContainer
      id={id}
      title="Field Notes & Events"
      subtitle="A searchable timeline of hackathons, projects, achievements, education, career moves, and certification milestones."
      className="bg-black"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 grid gap-3 lg:grid-cols-[1fr,18rem]">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => {
              const isActive = activeFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => handleFilterChange(filter.id)}
                  aria-pressed={isActive}
                  className={`rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'border-cyan-300 bg-cyan-300 text-gray-950 dark:border-red-400 dark:bg-red-500 dark:text-white'
                      : 'border-white/10 bg-white/5 text-gray-300 hover:border-cyan-300 hover:text-cyan-200 dark:hover:border-red-300 dark:hover:text-red-200'
                  }`}
                >
                  {filter.label}
                  <span className="ml-2 text-xs opacity-70">{counts[filter.id]}</span>
                </button>
              );
            })}
          </div>
          <label className="block">
            <span className="sr-only">Search field notes</span>
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setShowAll(false);
              }}
              placeholder="Search events, career, certs..."
              className="h-10 w-full rounded-md border border-white/10 bg-gray-950/80 px-3 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-cyan-300 dark:focus:border-red-300"
            />
          </label>
        </div>

        <div className="relative border-l border-cyan-400/25 pl-5 md:pl-10">
          {visibleNotes.map((note) => {
            const linkedProjects = (note.linkedProjectIds ?? [])
              .map((projectId) => projectById.get(projectId))
              .filter((project): project is ProjectHighlight => Boolean(project));

            return (
              <article id={`event-${note.id}`} key={note.id} className="event-node relative mb-7 scroll-mt-28 rounded-lg border border-white/10 bg-gray-950/82 p-5 shadow-2xl backdrop-blur last:mb-0">
                <div className="absolute -left-[27px] top-6 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.9)] md:-left-[49px]" aria-hidden="true" />
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-gray-400">
                  <span className="inline-flex items-center gap-2 rounded border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 font-semibold text-cyan-200">
                    <CalendarDaysIcon className="h-4 w-4" />
                    {note.dateLabel}
                  </span>
                  <span className={`rounded border px-2.5 py-1 text-xs font-semibold ${kindClasses[note.kind]}`}>
                    {kindLabels[note.kind]}
                  </span>
                  <span className="rounded border border-white/10 bg-white/5 px-2.5 py-1">{note.source}</span>
                </div>
                <h3 className="mb-3 text-2xl font-bold text-white">
                  <BreakableText text={note.title} />
                </h3>
                <p className="mb-4 text-sm leading-relaxed text-gray-300">
                  <BreakableText text={note.summary} />
                </p>
                {linkedProjects.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {linkedProjects.map((project) => {
                      const href = project.repoUrl ?? project.liveUrl ?? `#${id}`;
                      return (
                        <a
                          key={project.id}
                          href={href}
                          target={project.repoUrl || project.liveUrl ? '_blank' : undefined}
                          rel={project.repoUrl || project.liveUrl ? 'noopener noreferrer' : undefined}
                          onClick={() => track('event_project_link_clicked', { event: note.title, project: project.title })}
                          className="rounded border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-400/20"
                        >
                          {project.title}
                        </a>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {note.tags.map((tag) => (
                    <span key={tag} className="rounded bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-300">
                      {tag}
                    </span>
                  ))}
                </div>
                {note.links && note.links.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {note.links.map((link) => (
                      <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => track('event_link_clicked', { event: note.title, destination: link.url })}
                        className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-cyan-300 hover:text-cyan-200"
                      >
                        <TagIcon className="h-4 w-4" />
                        {link.label}
                      </a>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {filteredNotes.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-gray-950/82 p-6 text-center text-gray-300">
            No field notes match that search yet.
          </div>
        )}

        {(hasHiddenNotes || showAll) && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
              className="rounded-md border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100 transition-colors hover:bg-cyan-300/20 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-100 dark:hover:bg-red-500/20"
            >
              {showAll ? 'Show fewer field notes' : `See more field notes (${filteredNotes.length - visibleNotes.length} hidden)`}
            </button>
          </div>
        )}
      </div>
    </SectionContainer>
  );
};

export default EventsTimeline;
