import React from 'react';
import { Corners, Hoist, Kicker } from './bits';
import { MechanismBench } from './MechanismBench';
import {
  archiveRows,
  CONTACT,
  dispatchWorkbenchOpen,
  dossierStats,
  featuredCards,
  filterArchiveRows,
  WORKBENCH_DOMAINS,
  type WorkbenchDomain,
} from '../../lib/workbench';
import { coreCompetencies, experienceRecords, resumeProfiles, unifiedPortfolioData } from '../../portfolioData';
import { ResumeBuilder } from './ResumeBuilder';
import type { DesktopAppId } from '../../types';
import { SITE_CONFIG } from '../../siteConfig';
import { SE_PROFILE_IMAGE } from '../../assets';
import { track } from '../../lib/analytics';

export const HomeWindow: React.FC = () => (
  <div className="wb-home" id="home">
    <div className="wb-home-main">
      <Kicker>W / ORIGIN — POSITIONING</Kicker>
      <h1 className="wb-h1">Rahul Mitra</h1>
      <p className="wb-role">Systems Architect &amp; AI Engineer — ISE × CS × Mathematics</p>
      <p className="wb-thesis">Intelligent systems, made operational.</p>
      <p className="wb-degree">Graduating {SITE_CONFIG.graduation}</p>
      <p className="wb-bio">
        NUS Industrial Systems Engineering (Second Major CS, Minor Math). I build intelligent systems at the
        intersection of agentic AI, operations research, 3D perception, and open-source engineering — from a
        fine-tuned 109M-parameter transformer to async Python libraries with global PyPI adoption.
      </p>
      <div className="wb-actions">
        <button type="button" className="btn btn-primary" onClick={() => { track('cta_clicked', { label: 'open_selected_work' }); dispatchWorkbenchOpen({ appId: 'selected-work' }); }}>
          Open Selected Work
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => { track('cta_clicked', { label: 'resumes_contact' }); dispatchWorkbenchOpen({ appId: 'resumes-contact' }); }}>
          Resumes &amp; Contact
        </button>
      </div>
      <p className="wb-contactline">
        <span>{SITE_CONFIG.location}</span>
        <span aria-hidden="true">·</span>
        <a href={`mailto:${CONTACT.email}`} onClick={() => track('contact_email_clicked', {})}>{CONTACT.email}</a>
        <span aria-hidden="true">·</span>
        <a href={CONTACT.github} target="_blank" rel="noreferrer" onClick={() => track('social_link_clicked', { platform: 'github', location: 'hero' })}>github.com/Rah-Rah-Mitra</a>
      </p>
    </div>
    <div className="wb-home-side">
      <Hoist>
        <figure className="blueprint wb-portrait">
          <Corners />
          <div className="wb-portrait-frame duotone">
            <img src={SE_PROFILE_IMAGE} alt="Portrait of Rahul Mitra" width={384} height={384} loading="eager" />
          </div>
          <figcaption>FIG. 01 — FIELD ENGINEER, DUOTONE</figcaption>
        </figure>
      </Hoist>
      <Hoist>
        <div className="blueprint wb-stats">
          <Corners />
          <dl>
            {dossierStats.map((stat) => (
              <div className="wb-stat" key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Hoist>
    </div>
  </div>
);

export const WorkWindow: React.FC = () => (
  <div id="work">
    <Kicker>C1 / CAPTURE — SIX EVIDENCE-RICH SYSTEMS</Kicker>
    <div className="wb-cardgrid">
      {featuredCards.map(({ no, project, outcome }) => (
        <Hoist key={project.id}>
          <article className="blueprint wb-card" id={`selected-${project.id}`}>
            <Corners />
            <span className="wb-card-no">{no} · {project.category}</span>
            <h3 className="wb-card-title">{project.title}</h3>
            <p className="wb-card-body">{project.description}</p>
            <div className="wb-tags">
              {project.tags.slice(0, 3).map((tag) => <span className="tag tag-accent" key={tag}>{tag}</span>)}
            </div>
            <p className="wb-outcome"><strong>OUTCOME — </strong>{outcome}</p>
            {(project.repoUrl ?? project.liveUrl) && (
              <a
                className="wb-cardlink"
                href={project.repoUrl ?? project.liveUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => track('project_link_clicked', { title: project.title, destination: project.repoUrl ?? project.liveUrl ?? '' })}
              >
                {project.repoUrl ? 'OPEN REPO ↗' : 'OPEN LIVE ↗'}
              </a>
            )}
          </article>
        </Hoist>
      ))}
    </div>
  </div>
);

export const ExperienceWindow: React.FC = () => (
  <div id="experience">
    <Kicker>C2 / DELIVERY — CHRONOLOGICAL RECORD</Kicker>
    {experienceRecords.map((record) => (
      <article className="wb-exprow" id={`experience-${record.id}`} key={record.id}>
        <span className="wb-exprow-date">{record.dateLabel}</span>
        <div>
          <h3 className="wb-exprow-title">{record.organization} <span>— {record.role}</span></h3>
          <p className="wb-exprow-sum">{record.scope}</p>
          {record.outcomes[0] && <p className="wb-exprow-outcome"><strong>OUTCOME — </strong>{record.outcomes[0]}</p>}
          <div className="wb-tags">
            {record.tags.slice(0, 3).map((tag) => <span className="tag tag-neutral" key={tag}>{tag}</span>)}
          </div>
        </div>
      </article>
    ))}
  </div>
);

export const ArchiveWindow: React.FC = () => {
  const [query, setQuery] = React.useState('');
  const [domain, setDomain] = React.useState<WorkbenchDomain>('All');
  const rows = filterArchiveRows(query, domain);
  return (
    <div id="all-work">
      <div className="wb-archbar">
        <input
          className="input wb-archsearch"
          type="search"
          value={query}
          placeholder="SEARCH THE REGISTRY…"
          aria-label="Search projects"
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            track('archive_search_changed', { query_length: next.length, result_count: filterArchiveRows(next, domain).length });
          }}
        />
        <div className="wb-domainseg" role="group" aria-label="Filter by domain">
          {WORKBENCH_DOMAINS.map((item) => (
            <button
              key={item}
              type="button"
              data-active={item === domain || undefined}
              onClick={() => {
                setDomain(item);
                track('project_filter_changed', { filter: item, result_count: filterArchiveRows(query, item).length });
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="wb-archcount" role="status">{String(rows.length).padStart(2, '0')} / {archiveRows.length} SHOWN</span>
      </div>
      <div className="wb-archhead" aria-hidden="true">
        <span>DATE</span><span>PROJECT</span><span>CATEGORY</span><span>STACK</span><span>DOMAIN</span>
      </div>
      {rows.map((row) => (
        <article className="wb-archrow" id={`project-${row.id}`} key={row.id}>
          <span className="wb-archrow-date">{row.date}</span>
          <span className="wb-archrow-title">
            {row.href
              ? <a href={row.href} target="_blank" rel="noreferrer" onClick={() => track('project_link_clicked', { title: row.title, destination: row.href ?? '' })}>{row.title}</a>
              : row.title}
          </span>
          <span className="wb-archrow-cat">{row.category}</span>
          <span className="wb-archrow-stack">{row.stack}</span>
          <span className="tag tag-outline">{row.domain}</span>
        </article>
      ))}
      {rows.length === 0 && (
        <div className="blueprint wb-empty">
          <Corners />
          <p>NO ENTRIES MATCH “{query}”</p>
          <button type="button" className="btn btn-secondary" onClick={() => { setQuery(''); setDomain('All'); }}>Clear search &amp; filters</button>
        </div>
      )}
    </div>
  );
};

const PIPELINE_ACCENT_STAGES = [0, 3, 7, 11, 14];

export const SystemsWindow: React.FC = () => (
  <div id="systems-lab">
    <Kicker>C4 / CALIBRATE — DETERMINISTIC EXHIBITS</Kicker>
    <Hoist className="wb-figblock">
      <figure className="blueprint wb-figure">
        <Corners />
        <div className="wb-figure-head">
          <h3>Hybrid Flow Shop — CP-SAT Schedule</h3>
          <span>ILLUSTRATIVE SEQUENCE</span>
        </div>
        <svg viewBox="0 0 640 132" className="wb-figure-svg" role="img" aria-label="Illustrative three-machine flow shop schedule">
          <g fontFamily="Barlow, sans-serif" fontSize="9" fill="#5d5d60" letterSpacing="1">
            <text x="0" y="26">M1</text><text x="0" y="66">M2</text><text x="0" y="106">M3</text>
          </g>
          <g stroke="#d4d4d7" strokeWidth="1">
            <line x1="26" y1="0" x2="26" y2="132" />
            <line x1="180" y1="0" x2="180" y2="132" strokeDasharray="2 4" />
            <line x1="334" y1="0" x2="334" y2="132" strokeDasharray="2 4" />
            <line x1="488" y1="0" x2="488" y2="132" strokeDasharray="2 4" />
          </g>
          <g stroke="#416180" fill="none" strokeWidth="1">
            <rect x="26" y="12" width="128" height="20" fill="#b5d9fd" /><rect x="168" y="12" width="96" height="20" fill="#eef6ff" /><rect x="278" y="12" width="150" height="20" fill="#94bce3" /><rect x="442" y="12" width="88" height="20" fill="#eef6ff" />
            <rect x="60" y="52" width="110" height="20" fill="#eef6ff" /><rect x="184" y="52" width="140" height="20" fill="#b5d9fd" /><rect x="338" y="52" width="92" height="20" fill="#eef6ff" /><rect x="444" y="52" width="120" height="20" fill="#94bce3" />
            <rect x="98" y="92" width="86" height="20" fill="#94bce3" /><rect x="198" y="92" width="118" height="20" fill="#eef6ff" /><rect x="330" y="92" width="104" height="20" fill="#b5d9fd" /><rect x="448" y="92" width="140" height="20" fill="#eef6ff" />
          </g>
        </svg>
        <figcaption>FIG. 05a — SimPy discrete-event model + OR-Tools CP-SAT interval variables; robust-optimization research for uncertainty. Built at Abbott; operating details abstracted.</figcaption>
      </figure>
    </Hoist>
    <Hoist>
      <figure className="blueprint wb-figure">
        <Corners />
        <div className="wb-figure-head">
          <h3>15-Stage Changeover Pipeline</h3>
          <span>NON-DESTRUCTIVE</span>
        </div>
        <div className="wb-stages" aria-hidden="true">
          {Array.from({ length: 15 }, (_, index) => (
            <div key={index} data-accent={PIPELINE_ACCENT_STAGES.includes(index) || undefined}>{String(index + 1).padStart(2, '0')}</div>
          ))}
        </div>
        <div className="wb-stages-legend" aria-hidden="true">
          <span>STAGING</span><span>NORMALIZE</span><span>REPAIR</span><span>FROM-TO EDGES</span><span>AUDIT</span>
        </div>
        <figcaption>FIG. 05b — Five years of previously unseen, unclean changeover data processed without errors; every repair state exposed, never silently mutated.</figcaption>
      </figure>
    </Hoist>
    <Hoist>
      <MechanismBench />
    </Hoist>
  </div>
);

export const CameraWindow: React.FC = () => {
  const [fov, setFov] = React.useState(70);
  const rad = ((fov / 2) * Math.PI) / 180;
  const dy = Math.min(96, 110 * Math.tan(rad));
  const ph = Math.min(92, 98 * Math.tan(rad));
  const frustumPath = `M42 104 L${(42 + 110 * 4).toFixed(0)} ${(104 - dy * 4).toFixed(0)} M42 104 L${(42 + 110 * 4).toFixed(0)} ${(104 + dy * 4).toFixed(0)} M140 ${(104 - ph).toFixed(0)} V${(104 + ph).toFixed(0)}`;
  const fx = Math.round(1920 / (2 * Math.tan(rad)));
  return (
    <div id="technical-lab">
      <Kicker>C4 / CALIBRATE — THIN-LENS OPTICS, DETERMINISTIC</Kicker>
      <div className="wb-fovrow">
        <label htmlFor="wb-fov">HORIZONTAL FOV</label>
        <input id="wb-fov" type="range" min={30} max={110} step={1} value={fov} onChange={(event) => setFov(Number(event.target.value))} />
        <output htmlFor="wb-fov">{fov}°</output>
      </div>
      <Hoist>
        <figure className="blueprint wb-figure">
          <Corners />
          <svg viewBox="0 0 640 208" className="wb-figure-svg" role="img" aria-label="Pinhole camera frustum, top view">
            <g stroke="#d4d4d7" strokeWidth="1"><line x1="0" y1="104" x2="640" y2="104" strokeDasharray="3 5" /></g>
            <path d={frustumPath} stroke="#5980a6" strokeWidth="1.5" fill="none" />
            <rect x="22" y="94" width="20" height="20" fill="none" stroke="#1d1f20" strokeWidth="1.5" />
            <circle cx="42" cy="104" r="3" fill="#5980a6" />
            <g fontFamily="Barlow, sans-serif" fontSize="10" fill="#5d5d60" letterSpacing="1">
              <text x="20" y="86">PINHOLE C</text><text x="196" y="30">IMAGE PLANE</text><text x="520" y="98">OPTICAL AXIS Z</text>
            </g>
          </svg>
          <figcaption>FIG. 06 — Top view; plane at f. Intrinsics recompute live below.</figcaption>
        </figure>
      </Hoist>
      <div className="wb-metrics">
        <div><span>fx = fy (PX)</span><strong>{fx}</strong></div>
        <div><span>cx (PX)</span><strong>960</strong></div>
        <div><span>cy (PX)</span><strong>540</strong></div>
        <div><span>SENSOR</span><strong>1920×1080</strong></div>
      </div>
      <p className="wb-note">
        Backed by the top-student CS4277 record: projective geometry, epipolar geometry, absolute pose, SfM with
        bundle adjustment, multi-view stereo. This lab is a synthetic portfolio experiment — stated plainly.
      </p>
    </div>
  );
};

export const WorldWindow: React.FC = () => (
  <div id="world" className="wb-world">
    <div className="wb-world-main">
      <Kicker>SHARED #WORLD ANCHOR — OPTICAL TEST BENCH</Kicker>
      <h3 className="wb-world-title">Optical Test Bench</h3>
      <p className="wb-bio">
        One shared 3D surface, fed by the OnTheSpectrum pipeline — Blender-authored GLBs with metadata, previews,
        and playable-world QA. In this drawing set the bench appears as a lighter accent: it renders on demand,
        never as a page-wide background.
      </p>
      <div className="wb-tags">
        <span className="tag tag-accent">Three.js</span>
        <span className="tag tag-accent">Blender MCP</span>
        <span className="tag tag-accent">GLB</span>
        <span className="tag tag-neutral">Optical Courier</span>
      </div>
    </div>
    <Hoist className="wb-world-side">
      <figure className="blueprint wb-figure wb-cubefig">
        <Corners />
        <div className="wb-cube-stage" aria-hidden="true">
          <div className="wb-cube">
            <div /><div /><div /><div /><div /><div />
          </div>
        </div>
        <figcaption>FIG. 07 — BENCH VOLUME (LIVE ACCENT)</figcaption>
      </figure>
    </Hoist>
  </div>
);

export const CapabilitiesWindow: React.FC = () => (
  <div id="domains">
    <Kicker>C5 / CONNECT — METHODS WIRED TO PROOF</Kicker>
    <div className="wb-cardgrid">
      {coreCompetencies.map((cluster, index) => (
        <Hoist key={cluster.id}>
          <article className="blueprint wb-card">
            <Corners />
            <h3 className="wb-card-title"><span className="wb-card-no">{String(index + 1).padStart(2, '0')}</span> · {cluster.title}</h3>
            <p className="wb-card-body">{cluster.summary}</p>
            <p className="wb-proofline"><strong>TOOLS · </strong>{cluster.tools.join(' · ')}</p>
            <p className="wb-proofline wb-proofline-accent"><strong>PROOF · </strong>{cluster.proof.join(' · ')}</p>
          </article>
        </Hoist>
      ))}
    </div>
  </div>
);

export const ProofWindow: React.FC = () => (
  <div id="proof">
    <Kicker>C6 / VERIFY — DISTINCTIONS &amp; CREDENTIALS</Kicker>
    {unifiedPortfolioData.achievements.map((achievement) => (
      <article className="wb-proofrow" key={achievement.title}>
        <span className="wb-proofrow-date">{achievement.date}</span>
        <div>
          <h3>{achievement.title}</h3>
          <p>{achievement.description}</p>
        </div>
        <div className="wb-proofrow-side">
          {achievement.category && <span className="tag tag-neutral">{achievement.category}</span>}
          {achievement.proofUrl && (
            <a
              href={achievement.proofUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => track('achievement_proof_opened', { title: achievement.title })}
            >
              {achievement.proofLabel ?? 'View proof'} ↗
            </a>
          )}
        </div>
      </article>
    ))}
  </div>
);

export const ResumesWindow: React.FC = () => (
  <div id="resumes">
    <Kicker>C7 / TARGET — EIGHT EDITIONS · SEVEN ROLE-TARGETED + ONE-PAGE HIGHLIGHTS · REV {SITE_CONFIG.resumeEdition}</Kicker>
    {resumeProfiles.map((profile) => (
      <article className="wb-resumerow" key={profile.id}>
        <h3>{profile.role}</h3>
        <div>
          <p>{profile.headline}</p>
          <p className="wb-resumerow-kw">{profile.keywords.join(' · ')}</p>
        </div>
        <div className="wb-resumerow-actions">
          <a
            className="btn btn-secondary"
            href={profile.docxUrl}
            download
            aria-label={`Download résumé — ${profile.role} (DOCX)`}
            onClick={() => track('resume_download_clicked', { role: profile.role, format: 'docx' })}
          >
            DOCX
          </a>
          <a
            className="btn btn-secondary"
            href={profile.pdfUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Download résumé — ${profile.role} (PDF)`}
            onClick={() => track('resume_download_clicked', { role: profile.role, format: 'pdf' })}
          >
            PDF
          </a>
        </div>
      </article>
    ))}
    <Hoist className="wb-handoff-hoist">
      <div className="blueprint wb-handoff" id="contact">
        <Corners />
        <div className="wb-handoff-main">
          <h3>Direct Handoff — C8</h3>
          <p>{CONTACT.email} · {SITE_CONFIG.location} · linkedin.com/in/rahulmitra-dev · github.com/Rah-Rah-Mitra</p>
        </div>
        <div className="wb-actions">
          <a className="btn btn-primary" href={`mailto:${CONTACT.email}`} onClick={() => track('contact_email_clicked', { location: 'contact' })}>Email Rahul</a>
          <a className="btn btn-secondary" href={CONTACT.linkedin} target="_blank" rel="noreferrer" onClick={() => track('social_link_clicked', { platform: 'linkedin', location: 'contact' })}>LinkedIn</a>
          <a className="btn btn-secondary" href={CONTACT.github} target="_blank" rel="noreferrer" onClick={() => track('social_link_clicked', { platform: 'github', location: 'contact' })}>GitHub</a>
        </div>
      </div>
    </Hoist>
    <p className="wb-disclaimer">An interactive portfolio-site experiment — every claim above links to primary evidence.</p>
  </div>
);

export const ResumeBuilderWindow: React.FC = () => <ResumeBuilder />;

export const WINDOW_BODIES: Record<DesktopAppId, React.FC> = {
  'home': HomeWindow,
  'selected-work': WorkWindow,
  'experience': ExperienceWindow,
  'project-archive': ArchiveWindow,
  'systems-lab': SystemsWindow,
  'camera-lab': CameraWindow,
  'world-3d': WorldWindow,
  'capabilities': CapabilitiesWindow,
  'proof-vault': ProofWindow,
  'resumes-contact': ResumesWindow,
  'resume-builder': ResumeBuilderWindow,
};
