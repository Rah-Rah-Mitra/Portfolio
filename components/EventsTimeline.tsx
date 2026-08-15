import React, { useMemo, useState } from 'react';
import { FieldNote, FieldNoteKind, ProjectHighlight } from '../types';
import SectionContainer from './SectionContainer';
import { track } from '../lib/analytics';

interface EventsTimelineProps {
  id: string;
  notes: FieldNote[];
  projects: ProjectHighlight[];
  archiveProjects?: ProjectHighlight[];
}

const filters: Array<{ id: 'all' | FieldNoteKind; label: string }> = [
  { id: 'all', label: 'All notes' }, { id: 'career', label: 'Experience' },
  { id: 'education', label: 'Education' }, { id: 'achievement', label: 'Achievements' },
  { id: 'project', label: 'Projects' }, { id: 'certification', label: 'Certificates' },
  { id: 'event', label: 'Events' },
];

const kindLabels: Record<FieldNoteKind, string> = {
  event: 'Event', achievement: 'Achievement', project: 'Project', career: 'Experience', education: 'Education', certification: 'Certificate',
};

const getKinds = (note: FieldNote) => note.kinds.length ? note.kinds : [note.kind];
const CONCISE_NOTE_COUNT = 4;

const EventsTimeline: React.FC<EventsTimelineProps> = ({ id, notes, projects, archiveProjects = [] }) => {
  const [filter, setFilter] = useState<'all' | FieldNoteKind>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const projectById = useMemo(() => new Map([...projects, ...archiveProjects].map((project) => [project.id, project])), [archiveProjects, projects]);

  const counts = useMemo(() => notes.reduce<Record<'all' | FieldNoteKind, number>>((acc, note) => {
    acc.all += 1;
    getKinds(note).forEach((kind) => { acc[kind] += 1; });
    return acc;
  }, { all: 0, event: 0, achievement: 0, project: 0, career: 0, education: 0, certification: 0 }), [notes]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return notes.filter((note) => {
      const inFilter = filter === 'all' || getKinds(note).includes(filter);
      const haystack = [note.title, note.summary, note.dateLabel, note.source, ...(note.aliases ?? []), ...note.tags, ...(note.organizations ?? [])].join(' ').toLowerCase();
      return inFilter && (!normalized || haystack.includes(normalized));
    });
  }, [filter, notes, query]);
  const visible = expanded ? filtered : filtered.slice(0, CONCISE_NOTE_COUNT);

  return (
    <SectionContainer
      id={id}
      title="Experience, education, and field notes"
      subtitle="A chronological engineering record spanning professional systems work, education, civic technology, independent research, competitions, and certifications."
      className="experience-section"
    >
      <div className="field-note-controls">
        <div className="filter-row" aria-label="Filter field notes">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => {
                setFilter(item.id);
                setExpanded(false);
                track('field_notes_filter_changed', { filter: item.id });
              }}
            >
              {item.label} <span>{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <label className="search-field compact-search">
          <span>Search the field notebook</span>
          <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setExpanded(false); }} placeholder="Abbott, NUS, security..." />
        </label>
      </div>

      <div className="field-ledger">
        {visible.map((note) => {
          const linkedProjects = (note.linkedProjectIds ?? []).map((projectId) => projectById.get(projectId)).filter((project): project is ProjectHighlight => Boolean(project));
          return (
            <article key={note.id} id={`event-${note.id}`}>
              <time dateTime={note.sortDate}>{note.dateLabel}</time>
              <div className="ledger-mark" aria-hidden="true"><span /></div>
              <div className="ledger-content">
                <div className="ledger-kinds">
                  {getKinds(note).map((kind) => <span key={kind}>{kindLabels[kind]}</span>)}
                  <span>{note.source}</span>
                </div>
                <h3>{note.title}</h3>
                <p>{note.summary}</p>
                <div className="ledger-tags">{note.tags.slice(0, 7).map((tag) => <span key={tag}>{tag}</span>)}</div>
                {(linkedProjects.length > 0 || note.links?.length) && (
                  <div className="ledger-links">
                    {linkedProjects.map((project) => {
                      const href = project.repoUrl ?? project.liveUrl ?? `#project-${project.id}`;
                      const external = href.startsWith('http');
                      return <a key={project.id} href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>{project.title}</a>;
                    })}
                    {note.links?.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>)}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {filtered.length === 0 && <p className="empty-state" role="status">No field note matches that combination. Clear the search or choose a different filter.</p>}
      {filtered.length > CONCISE_NOTE_COUNT && (
        <button type="button" className="ledger-more" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
          {expanded ? 'Show the concise record' : `Open ${filtered.length - visible.length} more field notes`}
        </button>
      )}
    </SectionContainer>
  );
};

export default EventsTimeline;
