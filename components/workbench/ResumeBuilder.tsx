import React from 'react';
import { Corners, Kicker } from './bits';
import { track } from '../../lib/analytics';

// Résumé Builder — pick blocks from the evidence record, watch the real PDF
// rebuild, download it. The preview is the actual /api/resume output rather than
// an HTML approximation, so what you see is the document you send.
//
// Content is loaded after mount (never during SSR): the prerendered document
// stays small, and none of these controls appear in the no-JavaScript surface.
// Ids here are prefixed `rb-` because the e2e suite counts `experience-*`
// anchors across the whole document.

type PoolBullet = { id: string; text: Record<string, string> };
type PoolEntry = {
  id: string; organization: string; role?: string; location?: string;
  dateLabel: string; start?: string; sort?: string; blocked?: string; bullets?: PoolBullet[];
};
type SkillLine = { id: string; label: string; items: string };
type SpecSection =
  | { type: SectionType; title: string; entries: Array<{ id: string; bullets: string[] }> }
  | { type: 'skills'; title: string; lines: string[] };
type Spec = { subject: string; pages: number; detail?: 'standard' | 'deep'; sections: SpecSection[] };
type Config = { slug: string; subject: string; pages: number; sections: SpecSection[] };
type SectionType = 'education' | 'experience' | 'projects' | 'leadership';

type Content = {
  pools: Record<SectionType | 'skills', { entries?: PoolEntry[]; lines?: SkillLine[] }>;
  configs: Config[];
};

const SECTIONS: Array<{ type: SectionType; title: string }> = [
  { type: 'education', title: 'EDUCATION' },
  { type: 'experience', title: 'EXPERIENCE' },
  { type: 'projects', title: 'PROJECTS' },
  { type: 'leadership', title: 'LEADERSHIP AND ACTIVITIES' },
];
const SKILLS_TITLE = 'SKILLS AND CERTIFICATIONS';

/** entryId -> selected bullet ids. An entry with no bullets is still included. */
type Picks = Record<string, string[]>;

const picksFromConfig = (config: Config) => {
  const picks: Picks = {};
  let lines: string[] = [];
  for (const section of config.sections) {
    if (section.type === 'skills') lines = [...section.lines];
    else for (const entry of section.entries) picks[entry.id] = [...(entry.bullets ?? [])];
  }
  return { picks, lines };
};

const buildSpec = (content: Content, picks: Picks, lines: string[], detail: 'standard' | 'deep', pages: number): Spec => {
  const sections: SpecSection[] = [];
  for (const { type, title } of SECTIONS) {
    const entries = (content.pools[type].entries ?? [])
      .filter((entry) => !entry.blocked && picks[entry.id])
      .map((entry) => ({ id: entry.id, bullets: picks[entry.id] }));
    if (entries.length) sections.push({ type, title, entries });
  }
  if (lines.length) sections.push({ type: 'skills', title: SKILLS_TITLE, lines });
  return { subject: 'Custom Resume', pages, detail, sections };
};

export const ResumeBuilder: React.FC = () => {
  const [content, setContent] = React.useState<Content | null>(null);
  const [picks, setPicks] = React.useState<Picks>({});
  const [lines, setLines] = React.useState<string[]>([]);
  const [detail, setDetail] = React.useState<'standard' | 'deep'>('standard');
  const [pages, setPages] = React.useState(1);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<{ pages: number; fit: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const blobRef = React.useRef<string | null>(null);

  // Load the blocks once the window is live. server/resumeContent.mjs imports
  // only JSON, so the same module feeds the browser and the serverless build.
  React.useEffect(() => {
    let cancelled = false;
    import('../../server/resumeContent.mjs').then((module) => {
      if (cancelled) return;
      // The pools come from JSON, so TS infers literal shapes; name them once here.
      const loaded = { pools: module.pools, configs: module.resumeConfigs } as unknown as Content;
      setContent(loaded);
      const start = loaded.configs.find((config) => config.slug === 'highlights') ?? loaded.configs[0];
      const initial = picksFromConfig(start);
      setPicks(initial.picks);
      setLines(initial.lines);
      setPages(start.pages);
    }).catch(() => setError('Could not load the evidence record.'));
    return () => { cancelled = true; };
  }, []);

  const spec = React.useMemo(
    () => (content ? buildSpec(content, picks, lines, detail, pages) : null),
    [content, picks, lines, detail, pages],
  );
  const specKey = spec ? JSON.stringify(spec) : '';

  // Debounced rebuild. POSTing the spec avoids compressing it in the browser;
  // the response headers carry the page count and the encoded shareable spec.
  React.useEffect(() => {
    if (!spec || !spec.sections.length) { setPreview(null); setStatus(null); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch('/api/resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spec }),
          signal: controller.signal,
        });
        if (!response.ok) {
          setError(((await response.json()) as { error?: string }).error ?? 'Could not build that résumé.');
          return;
        }
        setStatus({ pages: Number(response.headers.get('X-Resume-Pages') ?? 0), fit: response.headers.get('X-Resume-Fit') ?? '' });
        const url = URL.createObjectURL(await response.blob());
        if (blobRef.current) URL.revokeObjectURL(blobRef.current);
        blobRef.current = url;
        setPreview(url);
      } catch (cause) {
        if ((cause as Error)?.name !== 'AbortError') setError('The résumé service is unreachable.');
      } finally {
        setBusy(false);
      }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [specKey]);

  React.useEffect(() => () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current); }, []);

  const download = async (format: 'pdf' | 'docx') => {
    if (!spec) return;
    track('resume_download_clicked', { role: 'Custom build', format });
    const response = await fetch(`/api/resume?format=${format}&download=1`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec }),
    });
    if (!response.ok) { setError('Could not produce that file.'); return; }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `rahul-mitra-custom.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toggleEntry = (entry: PoolEntry) => setPicks((current) => {
    const next = { ...current };
    if (next[entry.id]) delete next[entry.id];
    else next[entry.id] = (entry.bullets ?? []).slice(0, 2).map((bullet) => bullet.id);
    return next;
  });

  const toggleBullet = (entry: PoolEntry, bulletId: string) => setPicks((current) => {
    const chosen = current[entry.id] ?? [];
    const order = (entry.bullets ?? []).map((bullet) => bullet.id);
    const next = chosen.includes(bulletId) ? chosen.filter((id) => id !== bulletId) : [...chosen, bulletId];
    return { ...current, [entry.id]: next.sort((a, b) => order.indexOf(a) - order.indexOf(b)) };
  });

  const toggleLine = (id: string) => setLines((current) => (
    current.includes(id) ? current.filter((line) => line !== id) : [...current, id]
  ));

  if (!content) {
    return (
      <div id="resume-builder">
        <Kicker>C11 / COMPOSE — TARGETED RESUME FROM THE EVIDENCE RECORD</Kicker>
        <p className="wb-note">{error ?? 'Loading the evidence record…'}</p>
      </div>
    );
  }

  const selectedCount = Object.values(picks).reduce((total, bullets) => total + bullets.length, 0);

  return (
    <div id="resume-builder" className="wb-builder">
      <Kicker>C11 / COMPOSE — TARGETED RESUME FROM THE EVIDENCE RECORD</Kicker>

      <div className="wb-archbar">
        <label className="wb-builder-field">
          <span>START FROM</span>
          <select
            className="input"
            onChange={(event) => {
              const config = content.configs.find((item) => item.slug === event.target.value);
              if (!config) return;
              const next = picksFromConfig(config);
              setPicks(next.picks);
              setLines(next.lines);
              setPages(config.pages);
              track('resume_builder_preset_applied', { preset: config.slug });
            }}
            defaultValue="highlights"
            aria-label="Start from an existing résumé"
          >
            {content.configs.map((config) => (
              <option key={config.slug} value={config.slug}>{config.subject}</option>
            ))}
          </select>
        </label>

        <div className="wb-domainseg" role="group" aria-label="Bullet detail">
          {(['standard', 'deep'] as const).map((mode) => (
            <button key={mode} type="button" data-active={detail === mode || undefined} onClick={() => setDetail(mode)}>
              {mode === 'standard' ? 'STANDARD' : 'DEEP'}
            </button>
          ))}
        </div>

        <div className="wb-domainseg" role="group" aria-label="Page budget">
          {[1, 2].map((count) => (
            <button key={count} type="button" data-active={pages === count || undefined} onClick={() => setPages(count)}>
              {count} PAGE{count > 1 ? 'S' : ''}
            </button>
          ))}
        </div>

        <span className="wb-archcount" role="status">
          {busy ? 'BUILDING…' : status ? `${status.pages} PAGE${status.pages > 1 ? 'S' : ''} · ${status.fit}` : `${selectedCount} BULLETS`}
        </span>
      </div>

      <div className="wb-builder-grid">
        <div className="wb-builder-picker">
          {SECTIONS.map(({ type, title }) => (
            <fieldset key={type} className="wb-builder-group">
              <legend>{title}</legend>
              {(content.pools[type].entries ?? []).filter((entry) => !entry.blocked).map((entry) => {
                const chosen = picks[entry.id];
                return (
                  <div className="wb-builder-entry" key={entry.id}>
                    <label className="wb-tick">
                      <input type="checkbox" checked={Boolean(chosen)} onChange={() => toggleEntry(entry)} />
                      <span className="wb-tick-title">{entry.organization}</span>
                      <span className="wb-tick-meta">{entry.dateLabel}</span>
                    </label>
                    {chosen && (entry.bullets ?? []).map((bullet) => (
                      <label className="wb-tick wb-tick-sub" key={bullet.id}>
                        <input
                          type="checkbox"
                          checked={chosen.includes(bullet.id)}
                          onChange={() => toggleBullet(entry, bullet.id)}
                        />
                        <span>{(detail === 'deep' && bullet.text.deep) || bullet.text.default}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </fieldset>
          ))}

          <fieldset className="wb-builder-group">
            <legend>{SKILLS_TITLE}</legend>
            {(content.pools.skills.lines ?? []).map((line) => (
              <label className="wb-tick" key={line.id}>
                <input type="checkbox" checked={lines.includes(line.id)} onChange={() => toggleLine(line.id)} />
                <span className="wb-tick-title">{line.label}</span>
                <span className="wb-tick-meta">{line.items.slice(0, 64)}…</span>
              </label>
            ))}
          </fieldset>
        </div>

        <div className="wb-builder-preview">
          <div className="blueprint wb-builder-frame">
            <Corners />
            {error
              ? <p className="wb-note">{error}</p>
              : preview
                ? <iframe src={preview} title="Résumé preview" />
                : <p className="wb-note">Select at least one entry to build a résumé.</p>}
          </div>
          <div className="wb-actions">
            <button type="button" className="btn btn-primary" onClick={() => download('pdf')} disabled={!preview}>Download PDF</button>
            <button type="button" className="btn btn-secondary" onClick={() => download('docx')} disabled={!preview}>DOCX</button>
          </div>
          <p className="wb-note">
            Every line comes from the recorded evidence — the builder cannot invent one.
            Agents compose the same way through the <code>build_resume</code> tool at <code>/api/mcp</code>.
          </p>
        </div>
      </div>
    </div>
  );
};
