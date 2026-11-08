import React from 'react';
import { Corners, Kicker } from './bits';
import { track } from '../../lib/analytics';
import { pools, profile, resumeConfigs } from '../../server/resumeContent.mjs';
import { resolveBullet } from '../../server/resumeAssemble.mjs';

// Résumé Builder — pick blocks from the evidence record, watch the real PDF
// rebuild, download it. The preview is the actual /api/resume output rather than
// an HTML approximation, so what you see is the document you send.
//
// This is the window's whole UI, a lazy chunk with the evidence record it reads
// (server/resumeContent.mjs imports only JSON, so the same module feeds the
// browser and the serverless build). ResumeBuilder.tsx, in the main bundle,
// imports it after mount: none of it is prerendered or in the no-JavaScript
// surface. Ids here are prefixed `rb-` because the e2e suite counts
// `experience-*` anchors across the whole document.

type PoolBullet = { id: string; text: Record<string, string>; rank?: number };
type PoolEntry = {
  id: string; organization: string; role?: string | Record<string, string>; location?: string;
  dateLabel: string; start?: string; sort?: string; blocked?: string; bullets?: PoolBullet[];
};
type SkillLine = { id: string; label: string; items: string };
type ConfigBullet = string | { id: string; tier?: Tier };
type SpecSection =
  | { type: SectionType; title: string; render?: 'cv-inline'; entries: Array<{ id: string; bullets?: ConfigBullet[] }> }
  | { type: 'skills'; title: string; lines: string[] }
  | { type: 'summary'; title: string };
type Style = 'nus' | 'harvard';
// The four length tiers (server/resumeAssemble.mjs TIERS).
type Tier = 'short' | 'standard' | 'full' | 'deep';
const TIER_OPTIONS: Tier[] = ['short', 'standard', 'full', 'deep'];
type Spec = { slug?: string; subject: string; pages: number; detail?: Tier; style?: Style; sections: SpecSection[] };
type Config = { slug: string; subject: string; pages: number; detail?: Tier; sections: SpecSection[] };
type Resolve = (bullet: PoolBullet, spec: { slug?: string }, tier: Tier, ref: string) => { text: string; tierUsed: Tier };
type SectionType = 'education' | 'experience' | 'research' | 'projects' | 'leadership' | 'national-service';

type Content = {
  pools: Record<SectionType | 'skills', { entries?: PoolEntry[]; lines?: SkillLine[] }>;
  configs: Config[];
  // profile.json's paragraph: the master CV's SUMMARY.
  summary: string;
  // The assembler's own tier rule, so the picker shows the sentence a build prints.
  resolve: Resolve;
};

// The master CV's headings, in its order (server/resumeGuide.mjs "Section
// skeleton"); every ready-made résumé uses them.
const SECTIONS: Array<{ type: SectionType; title: string }> = [
  { type: 'education', title: 'EDUCATION' },
  { type: 'experience', title: 'WORK EXPERIENCE' },
  { type: 'research', title: 'RESEARCH EXPERIENCE' },
  { type: 'projects', title: 'PROJECTS' },
  { type: 'leadership', title: 'CO-CURRICULAR ACTIVITIES AND VOLUNTEER EXPERIENCES' },
  { type: 'national-service', title: 'NATIONAL SERVICE' },
];
const SKILLS_TITLE = 'SKILLS AND CERTIFICATIONS';

/**
 * What the picker holds: entryId -> selected bullet ids (an entry with no
 * bullets is still included), the skills lines, a tier a preset gave one bullet
 * of its own ("entry.bullet" -> tier), whether the SUMMARY opens it, whether
 * projects print inline (the master CV's "Role, Organisation (Date): sentence",
 * one bullet each), and the preset's slug, whose per-role wordings it keeps.
 */
type Draft = {
  picks: Record<string, string[]>; lines: string[]; pins: Record<string, Tier>;
  summary: boolean; inline: boolean; slug?: string;
};

export const draftFromConfig = (config: Config): Draft => {
  const draft: Draft = { picks: {}, lines: [], pins: {}, summary: false, inline: false, slug: config.slug };
  for (const section of config.sections) {
    if (section.type === 'summary') draft.summary = true;
    else if (section.type === 'skills') draft.lines = [...section.lines];
    else {
      if (section.render === 'cv-inline') draft.inline = true;
      for (const entry of section.entries) draft.picks[entry.id] = (entry.bullets ?? []).map((item) => {
        if (typeof item === 'string') return item;
        if (item.tier) draft.pins[`${entry.id}.${item.id}`] = item.tier;
        return item.id;
      });
    }
  }
  return draft;
};

export const buildSpec = (content: Content, draft: Draft, detail: Tier, pages: number, style: Style): Spec => {
  const sections: SpecSection[] = draft.summary ? [{ type: 'summary', title: 'SUMMARY' }] : [];
  // In the order picked, a preset's first: the assembler sorts by date and keeps
  // this order for a tie (Volt Pulse before Waaah, both Jan 2026, on the master CV).
  const order = Object.keys(draft.picks);
  for (const { type, title } of SECTIONS) {
    const entries = (content.pools[type].entries ?? [])
      .filter((entry) => !entry.blocked && draft.picks[entry.id])
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
      .map((entry) => ({
        id: entry.id,
        bullets: draft.picks[entry.id].map((id) => {
          const tier = draft.pins[`${entry.id}.${id}`];
          return tier ? { id, tier } : id;
        }),
      }));
    if (entries.length) sections.push({ type, title, ...(type === 'projects' && draft.inline ? { render: 'cv-inline' as const } : {}), entries });
  }
  if (draft.lines.length) sections.push({ type: 'skills', title: SKILLS_TITLE, lines: draft.lines });
  return { ...(draft.slug ? { slug: draft.slug } : {}), subject: 'Custom Resume', pages, detail, style, sections };
};

// The pools come from JSON, so TS infers literal shapes; name them once here.
export const builderContent = { pools, configs: resumeConfigs, summary: profile.summary, resolve: resolveBullet } as unknown as Content;

const without = (pins: Draft['pins'], refs: string[]) => {
  const next = { ...pins };
  for (const ref of refs) delete next[ref];
  return next;
};

/** A row of mutually exclusive buttons, the design system's segmented control. */
function Segments<T extends string | number | boolean>({ label, value, options, name, onPick }: {
  label: string; value: T; options: T[]; name: (option: T) => string; onPick: (option: T) => void;
}) {
  return (
    <div className="wb-domainseg" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={String(option)} type="button" aria-pressed={value === option} data-active={value === option || undefined} onClick={() => onPick(option)}>
          {name(option)}
        </button>
      ))}
    </div>
  );
}

export const ResumeBuilderPanel: React.FC = () => {
  const content = builderContent;
  // A preset carries over everything it prints: picks, lines, per-bullet tiers,
  // the SUMMARY, the project layout, its tier and its page budget. The window
  // opens on Highlights.
  const opening = content.configs.find((config) => config.slug === 'highlights') ?? content.configs[0];
  const [draft, setDraft] = React.useState<Draft>(() => draftFromConfig(opening));
  const [detail, setDetail] = React.useState<Tier>(opening.detail ?? 'standard');
  const [pages, setPages] = React.useState(opening.pages);
  const [style, setStyle] = React.useState<Style>('nus');
  const [preview, setPreview] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<{ pages: number; fit: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const blobRef = React.useRef<string | null>(null);

  const apply = (config: Config) => {
    setDraft(draftFromConfig(config));
    setPages(config.pages);
    setDetail(config.detail ?? 'standard');
  };

  const spec = React.useMemo(() => buildSpec(content, draft, detail, pages, style), [content, draft, detail, pages, style]);
  const specKey = JSON.stringify(spec);

  // Debounced rebuild. POSTing the spec avoids compressing it in the browser;
  // the response headers carry the page count and the encoded shareable spec.
  React.useEffect(() => {
    if (!spec.sections.length) { setPreview(null); setStatus(null); return; }
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

  // The master CV's own bullet for a project, which an inline section prints.
  const inlineBullet = (entry: PoolEntry) => {
    const master = content.configs.find((config) => config.slug === 'general');
    return (master && draftFromConfig(master).picks[entry.id]?.[0]) || entry.bullets?.[0]?.id;
  };

  const toggleEntry = (entry: PoolEntry, type: SectionType) => setDraft((current) => {
    const picks = { ...current.picks };
    const chosen = picks[entry.id];
    if (chosen) delete picks[entry.id];
    else if (type === 'projects' && current.inline) picks[entry.id] = [inlineBullet(entry)].filter(Boolean) as string[];
    else picks[entry.id] = (entry.bullets ?? []).slice(0, 2).map((bullet) => bullet.id);
    return { ...current, picks, pins: without(current.pins, (chosen ?? []).map((id) => `${entry.id}.${id}`)) };
  });

  const toggleBullet = (entry: PoolEntry, type: SectionType, bulletId: string) => setDraft((current) => {
    const chosen = current.picks[entry.id] ?? [];
    // Inline, a project prints exactly one bullet, so its bullets are radios.
    const next = type === 'projects' && current.inline ? [bulletId]
      : chosen.includes(bulletId) ? chosen.filter((id) => id !== bulletId) : [...chosen, bulletId];
    const order = (entry.bullets ?? []).map((bullet) => bullet.id);
    const dropped = chosen.filter((id) => !next.includes(id)).map((id) => `${entry.id}.${id}`);
    return {
      ...current,
      picks: { ...current.picks, [entry.id]: next.sort((a, b) => order.indexOf(a) - order.indexOf(b)) },
      pins: without(current.pins, dropped),
    };
  });

  // Inline keeps one bullet per selected project: the master CV's own if it is
  // already ticked, else the first ticked.
  const setInline = (inline: boolean) => setDraft((current) => {
    const picks = { ...current.picks };
    if (inline) for (const entry of content.pools.projects.entries ?? []) {
      const chosen = picks[entry.id];
      if (!chosen || chosen.length === 1) continue;
      const own = inlineBullet(entry);
      picks[entry.id] = [own && chosen.includes(own) ? own : chosen[0] ?? own].filter(Boolean) as string[];
    }
    return { ...current, picks, inline };
  });

  const toggleLine = (id: string) => setDraft((current) => ({
    ...current,
    lines: current.lines.includes(id) ? current.lines.filter((line) => line !== id) : [...current.lines, id],
  }));

  const selectedCount = Object.values(draft.picks).reduce((total, bullets) => total + bullets.length, 0);

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
              apply(config);
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

        {/* One length for every bullet: choosing it drops a preset's per-bullet tiers. */}
        <Segments label="Bullet length" value={detail} options={TIER_OPTIONS} name={(mode) => mode.toUpperCase()}
          onPick={(mode) => { setDetail(mode); setDraft((current) => ({ ...current, pins: {} })); }} />
        <Segments label="Résumé style" value={style} options={['nus', 'harvard'] as Style[]}
          name={(option) => (option === 'nus' ? 'NUS CDE' : 'HARVARD')} onPick={setStyle} />
        <Segments label="Page budget" value={pages} options={[1, 2]} name={(count) => `${count} PAGE${count > 1 ? 'S' : ''}`} onPick={setPages} />

        <span className="wb-archcount" role="status">
          {busy ? 'BUILDING…' : status ? `${status.pages} PAGE${status.pages > 1 ? 'S' : ''} · ${status.fit}` : `${selectedCount} BULLETS`}
        </span>
      </div>

      <div className="wb-builder-grid">
        <div className="wb-builder-picker">
          <fieldset className="wb-builder-group">
            <legend>SUMMARY</legend>
            <label className="wb-tick wb-tick-sub wb-tick-flush">
              <input type="checkbox" checked={draft.summary} onChange={() => setDraft((current) => ({ ...current, summary: !current.summary }))} />
              <span>{content.summary}</span>
            </label>
          </fieldset>

          {SECTIONS.map(({ type, title }) => {
            const radios = type === 'projects' && draft.inline;
            return (
              <fieldset key={type} className="wb-builder-group">
                <legend>{title}</legend>
                {type === 'projects' && (
                  <div className="wb-builder-field">
                    <Segments label="Project layout" value={draft.inline} options={[true, false]}
                      name={(inline) => (inline ? 'INLINE' : 'ENTRIES')} onPick={setInline} />
                    <span>{draft.inline ? 'ONE BULLET EACH, AS ON THE MASTER CV' : 'A HEADING AND BULLETS EACH'}</span>
                  </div>
                )}
                {(content.pools[type].entries ?? []).filter((entry) => !entry.blocked).map((entry) => {
                  const chosen = draft.picks[entry.id];
                  return (
                    <div className="wb-builder-entry" key={entry.id}>
                      <label className="wb-tick">
                        <input type="checkbox" checked={Boolean(chosen)} onChange={() => toggleEntry(entry, type)} />
                        <span className="wb-tick-title">{entry.organization}</span>
                        <span className="wb-tick-meta">{entry.dateLabel}</span>
                      </label>
                      {chosen && (entry.bullets ?? []).map((bullet) => {
                        const ref = `${entry.id}.${bullet.id}`;
                        const pin = draft.pins[ref];
                        return (
                          <label className="wb-tick wb-tick-sub" key={bullet.id}>
                            <input
                              type={radios ? 'radio' : 'checkbox'}
                              name={radios ? `rb-inline-${entry.id}` : undefined}
                              checked={chosen.includes(bullet.id)}
                              onChange={() => toggleBullet(entry, type, bullet.id)}
                            />
                            <span>
                              {content.resolve(bullet, draft, pin ?? detail, ref).text}
                              {pin && <span className="wb-tick-pin">{pin.toUpperCase()}</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </fieldset>
            );
          })}

          <fieldset className="wb-builder-group">
            <legend>{SKILLS_TITLE}</legend>
            {(content.pools.skills.lines ?? []).map((line) => (
              <label className="wb-tick" key={line.id}>
                <input type="checkbox" checked={draft.lines.includes(line.id)} onChange={() => toggleLine(line.id)} />
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
