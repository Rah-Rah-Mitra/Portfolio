import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { allProjects, coreCompetencies, experienceRecords, resumeProfiles, unifiedPortfolioData } from '../portfolioData';
import { ProjectHighlight } from '../types';
import { resumeAssetUrl } from '../siteConfig';
import { track } from '../lib/analytics';
import TechnicalLabSection from './TechnicalLabSection';
import { useExperienceMode } from '../contexts/ExperienceModeContext';
import { DepartureIris, FlowShopExhibit, ProjectSystemInspector, SpatialSystemsExhibit } from './InteractiveExhibits';
import { useEffects } from '../contexts/PhysicsContext';
import { resolveMediaPolicy } from '../lib/mediaPolicy';
import { supportingMedia } from '../mediaManifest';
import { SupportingMedia } from './SupportingMedia';

const OpticalBenchWorld = React.lazy(() => import('./OpticalBenchWorld'));

const domainLabels: Record<ProjectHighlight['accent'], string> = {
  cyan: 'Software & systems',
  red: 'Responsible security',
  violet: 'AI & 3D perception',
  green: 'Civic & product',
  amber: 'Operations research',
  blue: 'Architecture',
};

const navItems = [
  ['work', 'Work'],
  ['experience', 'Experience'],
  ['all-work', 'Projects'],
  ['technical-lab', 'Technical Lab'],
  ['proof', 'Proof'],
  ['resumes', 'Résumés'],
] as const;

const ExternalLabel: React.FC = () => <span className="sr-only"> (opens in a new tab)</span>;

export const ExperienceModeControl: React.FC = () => {
  const { policy, chooseMode } = useExperienceMode();
  return (
    <div className="experience-mode-control" aria-label="Portfolio rendering mode">
      <button type="button" aria-pressed={policy.mode === 'guided'} disabled={policy.hardFailure} onClick={() => chooseMode('guided')}>Guided</button>
      <button type="button" aria-pressed={policy.mode === 'scan'} onClick={() => chooseMode('scan')}>Quick Scan</button>
      <span role="status">{policy.mode === 'scan' ? 'Static, evidence-first rendering' : policy.lowMotion ? 'Guided, low-motion rendering' : 'Guided rendering'}</span>
    </div>
  );
};

const ProjectLinks: React.FC<{ project: ProjectHighlight }> = ({ project }) => {
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

export const PortfolioHeader: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <header className="portfolio-header">
      <a className="portfolio-mark" href="#home" aria-label="Rahul Mitra, home">RM<span>/ systems</span></a>
      <ExperienceModeControl />
      <button className="portfolio-menu" type="button" aria-expanded={open} aria-controls="portfolio-navigation" onClick={() => setOpen((current) => !current)}>
        {open ? 'Close' : 'Menu'}
      </button>
      <nav id="portfolio-navigation" className={open ? 'is-open' : ''} aria-label="Portfolio sections">
        {navItems.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => { setOpen(false); track('nav_link_clicked', { destination: id }); }}>{label}</a>)}
        <div className="portfolio-mobile-tools" aria-label="Optional portfolio tools">
          <button type="button" data-open-assistant onClick={() => window.dispatchEvent(new CustomEvent('portfolio:openAssistant', { detail: { source: 'mobile_menu' } }))}>AI · Ask</button>
          <button type="button" data-open-effects onClick={() => window.dispatchEvent(new CustomEvent('portfolio:openEffects', { detail: { source: 'mobile_menu' } }))}>FX · Lab</button>
          <a href="#world" data-open-world>Explore World</a>
        </div>
      </nav>
      <a className="spatial-launch spatial-launch-desktop" href="#world">Explore World</a>
    </header>
  );
};

const StaticCalibrationMarker: React.FC = () => (
  <figure className="hero-calibration-static">
    <svg viewBox="0 0 520 420" role="img" aria-label="Optical rail, camera frustum, aperture, and calibration target">
      <line className="calibration-rail" x1="36" y1="320" x2="484" y2="320" />
      <circle className="calibration-aperture" cx="128" cy="210" r="58" />
      <circle className="calibration-aperture-signal" cx="128" cy="210" r="21" />
      <path className="calibration-frustum" d="M150 210 L390 98 M150 210 L390 322" />
      <rect className="calibration-plane" x="388" y="86" width="10" height="248" />
      {[0, 1, 2, 3, 4].map((index) => <circle key={index} className="calibration-station" cx={68 + index * 94} cy="320" r="7" />)}
      <text x="36" y="40">OPTICAL TEST BENCH / STATIC REGISTER</text>
      <text x="36" y="64">Evidence remains independent of rendering capability.</text>
    </svg>
    <figcaption>Static calibration register · no animation required</figcaption>
  </figure>
);

const PortfolioHero: React.FC = () => {
  const generalResume = resumeProfiles.find((resume) => resume.id === 'general');
  const { policy, capabilities } = useExperienceMode();
  const { enhancements } = useEffects();
  const [mediaViewport, setMediaViewport] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 681px)');
    const update = () => setMediaViewport(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const mediaPolicy = resolveMediaPolicy({ experience: policy, mediaEnabled: enhancements.mediaEnabled, motionPaused: enhancements.motionPaused, visible: true, saveData: capabilities?.saveData });
  return (
    <section id="home" className="portfolio-hero" aria-labelledby="portfolio-title">
      <div className="hero-positioning">
        <h1 id="portfolio-title">Intelligent systems, made operational.</h1>
        <p className="hero-introduction">I’m Rahul Mitra, an engineer working across applied AI, mathematical optimization, software architecture, 3D perception, and responsible security. I turn uncertain problems into systems that can be tested, deployed, and trusted.</p>
        <p className="hero-facts">Based in Singapore · NUS Industrial Systems Engineering · Second Major in Computer Science · Minor in Mathematics</p>
        <p className="hero-role-line"><strong>Target roles</strong> Software engineering · Applied AI · Operations research · Solution architecture <span>Open to engineering roles and collaborations.</span></p>
        <nav className="hero-current-proof" aria-label="Current proof">
          <strong>Current proof</strong>
          <a href="#experience-abbott-internship">Abbott</a>
          <a href="#selected-hybrid-flow-shop-digital-twin">Hybrid Flow Shop</a>
          <a href="#selected-churp">Churp</a>
          <a href="#selected-on-the-spectrum">OnTheSpectrum</a>
        </nav>
        <div className="hero-actions">
          <a className="action-primary" href="#work" onClick={() => track('cta_clicked', { label: 'View selected work' })}>View selected work</a>
          <a className="action-secondary" href={generalResume?.pdfUrl ?? resumeAssetUrl('general', 'pdf')} target="_blank" rel="noreferrer" onClick={() => track('resume_download_clicked', { role: 'General / Master CV', format: 'pdf' })}>Download résumé<ExternalLabel /></a>
          <a className="action-text" href="#experience">Read experience</a>
        </div>
        <div className="hero-socials" aria-label="External profiles">
          {unifiedPortfolioData.githubUrl && <a href={unifiedPortfolioData.githubUrl} target="_blank" rel="noreferrer">GitHub<ExternalLabel /></a>}
          {unifiedPortfolioData.linkedinUrl && <a href={unifiedPortfolioData.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn<ExternalLabel /></a>}
          <a href={`mailto:${unifiedPortfolioData.contactEmail}`}>Email</a>
        </div>
      </div>

      <dl className="hero-evidence" aria-label="Current evidence highlights">
        <div><dt>Operational AI</dt><dd>Digital twins, CP-SAT optimization, data quality, and cloud operation at Abbott.</dd></div>
        <div><dt>3D perception</dt><dd>Top student in NUS 3D Computer Vision, including multi-view geometry and bundle adjustment.</dd></div>
        <div><dt>Open systems</dt><dd>Maintainer of AsyncDDGS, an asyncio-first search library published on PyPI.</dd></div>
      </dl>

      <div className="hero-world-stage" aria-label="Field guide rendering layer">
        {mediaViewport && mediaPolicy.shouldAttachSources
          ? <SupportingMedia media={supportingMedia.heroCalibration} policy={{ attach: true, motionEnabled: !enhancements.motionPaused }} className="hero-calibration-media" />
          : <StaticCalibrationMarker />}
      </div>
    </section>
  );
};

const selectedWorkLeaders = ['hybrid-flow-shop-digital-twin', 'churp', 'on-the-spectrum'];

export const SelectedWork: React.FC = () => {
  const selected = useMemo(() => {
    const spotlights = allProjects
      .filter((project) => project.spotlight)
      .sort((a, b) => (a.featuredPriority ?? 99) - (b.featuredPriority ?? 99));
    const leaderSet = new Set(selectedWorkLeaders);
    return [
      ...selectedWorkLeaders.map((id) => spotlights.find((project) => project.id === id)),
      ...spotlights.filter((project) => !leaderSet.has(project.id)),
    ].filter((project): project is ProjectHighlight => Boolean(project)).slice(0, 5);
  }, []);

  return (
    <section id="work" className="evidence-section selected-work" aria-labelledby="selected-work-title">
      <header className="evidence-heading">
        <h2 id="selected-work-title">Selected systems and engineering work</h2>
        <p>Five representative systems show the range from operating constraints to implementation and evidence. Confidential manufacturing work stays appropriately abstracted.</p>
      </header>
      <div className="selected-work-list">
        {selected.map((project, index) => (
          <article key={project.id} id={`selected-${project.id}`} className="selected-project">
            <div className="project-index"><span>{String(index + 1).padStart(2, '0')}</span><span>{domainLabels[project.accent]}</span><time>{project.dateLabel}</time></div>
            <div className="project-body">
              <h3>{project.title}</h3>
              <p className="project-context">{project.spotlight?.context ?? project.description}</p>
              {project.spotlight && (
                <dl className="project-evidence">
                  <div><dt>Contribution</dt><dd>{project.spotlight.contribution}</dd></div>
                  <div><dt>Approach</dt><dd>{project.spotlight.approach}</dd></div>
                  <div><dt>Outcome</dt><dd>{project.spotlight.outcome}</dd></div>
                </dl>
              )}
              <div className="method-list" aria-label={`${project.title} technologies`}>{project.tags.slice(0, 8).map((tag) => <span key={tag}>{tag}</span>)}</div>
              <ProjectLinks project={project} />
              {project.id === 'hybrid-flow-shop-digital-twin' && <><FlowShopExhibit /><ProjectSystemInspector kind="flow-shop" /></>}
              {project.id === 'churp' && <SpatialSystemsExhibit />}
              {project.id === 'on-the-spectrum' && <ProjectSystemInspector kind="on-the-spectrum" />}
            </div>
            {project.imageUrl && (
              <figure className="selected-project-media">
                <span aria-hidden="true">{String(index + 1).padStart(2, '0')} / FIELD EVIDENCE</span>
                <img src={project.imageUrl} alt={`Project evidence for ${project.title}`} width="800" height="600" loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async" />
                <figcaption>{project.title} evidence preview</figcaption>
              </figure>
            )}
          </article>
        ))}
      </div>
    </section>
  );
};

const ExperienceSection: React.FC = () => (
  <section id="experience" className="evidence-section experience-section" aria-labelledby="experience-title">
    <header className="evidence-heading">
      <h2 id="experience-title">Experience and education</h2>
      <p>A conventional, complete timeline of professional delivery, independent security research, education, and earlier operational work.</p>
    </header>
    <div className="experience-ledger">
      {experienceRecords.map((note) => (
        <article key={note.id} id={`experience-${note.id}`}>
          <div className="experience-time"><time>{note.dateLabel}</time><span>{note.kind === 'professional' ? 'Professional' : 'Education'}</span><span>{note.location}</span></div>
          <div>
            <h3>{note.role}</h3>
            <p className="experience-organization">{note.organization}</p>
            <p>{note.scope}</p>
            <div className="experience-details">
              <div><strong>Responsibilities</strong><ul>{note.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></div>
              {note.outcomes.length > 0 && <div><strong>Outcomes</strong><ul>{note.outcomes.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            </div>
            <div className="method-list">{note.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            {note.linkedProjectIds.length ? (
              <div className="related-projects"><strong>Related work</strong>{note.linkedProjectIds.map((id) => <a key={id} href={`#project-${id}`}>{allProjects.find((project) => project.id === id)?.title ?? id}</a>)}</div>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  </section>
);

const INITIAL_PROJECT_COUNT = 8;
const PROJECT_BATCH_SIZE = 4;

export const AllProjectsSection: React.FC = () => {
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<'all' | ProjectHighlight['accent']>('all');
  const [activeProjectIndex, setActiveProjectIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [visibleCount, setVisibleCount] = useState(allProjects.length);
  const projectRefs = useRef(new Map<string, HTMLElement>());
  const normalized = query.trim().toLowerCase();
  const visible = allProjects.filter((project) => {
    const matchesDomain = domain === 'all' || project.accent === domain;
    const searchText = [project.title, project.description, project.category, ...project.tags].join(' ').toLowerCase();
    return matchesDomain && (!normalized || searchText.includes(normalized));
  });

  const isFiltering = domain !== 'all' || normalized.length > 0;
  const renderedProjects = isFiltering ? visible : visible.slice(0, visibleCount);

  useEffect(() => {
    const revealHashBatch = () => {
      const projectId = decodeURIComponent(window.location.hash).replace('#project-', '');
      const projectIndex = allProjects.findIndex((project) => project.id === projectId);
      setVisibleCount(projectIndex >= 0
        ? Math.max(INITIAL_PROJECT_COUNT, Math.ceil((projectIndex + 1) / PROJECT_BATCH_SIZE) * PROJECT_BATCH_SIZE)
        : INITIAL_PROJECT_COUNT);
    };
    setHydrated(true);
    revealHashBatch();
    window.addEventListener('hashchange', revealHashBatch);
    return () => window.removeEventListener('hashchange', revealHashBatch);
  }, []);

  useEffect(() => {
    setActiveProjectIndex((current) => Math.min(current, Math.max(0, renderedProjects.length - 1)));
  }, [renderedProjects.length]);

  const changeDomain = (next: 'all' | ProjectHighlight['accent']) => {
    setDomain(next);
    setActiveProjectIndex(0);
    track('project_filter_changed', { filter: next, result_count: next === 'all' ? allProjects.length : allProjects.filter((project) => project.accent === next).length });
  };

  const focusProjectAt = (index: number) => {
    if (renderedProjects.length === 0) return;
    const next = Math.max(0, Math.min(renderedProjects.length - 1, index));
    setActiveProjectIndex(next);
    projectRefs.current.get(renderedProjects[next].id)?.focus();
  };

  const handleProjectKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      focusProjectAt(activeProjectIndex + 1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      focusProjectAt(activeProjectIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusProjectAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusProjectAt(renderedProjects.length - 1);
    }
  };

  return (
    <section id="all-work" className="evidence-section all-projects" aria-labelledby="all-projects-title">
      <header className="evidence-heading">
        <h2 id="all-projects-title">All projects</h2>
        <p>Every project remains visible and searchable. The default view omits nothing.</p>
      </header>
      <div className="project-controls">
        <label><span>Search by project, method, or domain</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setActiveProjectIndex(0); }} placeholder="Try CP-SAT, RAG, security, geometry…" /></label>
        <div className="domain-filters" aria-label="Filter projects by domain">
          <button type="button" aria-pressed={domain === 'all'} onClick={() => changeDomain('all')}>All {allProjects.length}</button>
          {(Object.entries(domainLabels) as Array<[ProjectHighlight['accent'], string]>).map(([accent, label]) => (
            <button key={accent} type="button" aria-pressed={domain === accent} onClick={() => changeDomain(accent)}>{label}</button>
          ))}
        </div>
      </div>
      <p className="project-result-count" role="status">Showing {renderedProjects.length} of {allProjects.length} projects</p>
      <div className="project-stepper" aria-label="Project index navigation"><span>Use arrow keys when a project is focused.</span><div><button type="button" aria-label="Previous project" disabled={renderedProjects.length === 0 || activeProjectIndex <= 0} onClick={() => focusProjectAt(activeProjectIndex - 1)}>Previous</button><button type="button" aria-label="Next project" disabled={renderedProjects.length === 0 || activeProjectIndex >= renderedProjects.length - 1} onClick={() => focusProjectAt(activeProjectIndex + 1)}>Next</button></div></div>
      <div className="project-index-list" onKeyDown={handleProjectKeys}>
        {renderedProjects.map((project, index) => (
          <article key={project.id} id={`project-${project.id}`} tabIndex={index === activeProjectIndex ? 0 : -1} ref={(node) => { if (node) projectRefs.current.set(project.id, node); else projectRefs.current.delete(project.id); }} onFocus={() => setActiveProjectIndex(index)}>
            <div className="project-index-meta"><time>{project.dateLabel ?? 'Archive'}</time><span>{domainLabels[project.accent]}</span></div>
            <div><h3>{project.title}</h3><p>{project.description}</p><div className="method-list">{project.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}</div></div>
            <ProjectLinks project={project} />
          </article>
        ))}
      </div>
      {hydrated && !isFiltering && visibleCount < visible.length && (
        <button className="project-load-more" type="button" onClick={() => { setVisibleCount((current) => Math.min(visible.length, current + PROJECT_BATCH_SIZE)); window.dispatchEvent(new CustomEvent('portfolio:projects-expanded')); }}>
          Load {Math.min(PROJECT_BATCH_SIZE, visible.length - visibleCount)} more projects
        </button>
      )}
      {visible.length === 0 && <p className="empty-state">No project matches that combination. Clear the search or choose another domain.</p>}
    </section>
  );
};

const CapabilitiesSection: React.FC = () => (
  <section id="domains" className="evidence-section capabilities-section" aria-labelledby="capabilities-title">
    <header className="evidence-heading"><h2 id="capabilities-title">Capabilities, linked to proof</h2><p>Methods are useful only when they connect to work. Each capability names the systems that support it.</p></header>
    <div className="capability-list">
      {coreCompetencies.map((cluster) => (
        <article key={cluster.id}>
          <h3>{cluster.title}</h3><p>{cluster.summary}</p>
          <div className="capability-methods"><strong>Methods</strong><span>{cluster.tools.join(' · ')}</span></div>
          <div className="capability-proof"><strong>Evidence</strong>{cluster.proof.map((name) => {
            const explicitIds: Record<string, string> = {
              '15-Stage Changeover Pipeline': 'changeover-data-quality-pipeline',
              'Changeover Data Pipeline': 'changeover-data-quality-pipeline',
              'Hybrid Flow Shop Digital Twin': 'hybrid-flow-shop-digital-twin',
              'Interactive Portfolio': 'portfolio-repo',
              'Maritime BERT/DNN': 'maritime-deficiency-severity',
            };
            const project = allProjects.find((item) => item.id === explicitIds[name] || item.title === name || item.title.includes(name) || name.includes(item.title));
            return project ? <a key={name} href={`#project-${project.id}`}>{name}</a> : <span key={name}>{name}</span>;
          })}</div>
        </article>
      ))}
    </div>
  </section>
);

const ProofSection: React.FC = () => (
  <section id="proof" className="evidence-section proof-section" aria-labelledby="proof-title">
    <header className="evidence-heading"><h2 id="proof-title">Proof, distinctions, and credentials</h2><p>Awards, open-source delivery, security practice, and applied AI evidence remain independently inspectable.</p></header>
    <div className="proof-list">
      {unifiedPortfolioData.achievements.map((achievement) => (
        <article key={`${achievement.title}-${achievement.date}`}>
          <div><time>{achievement.date}</time><span>{achievement.category}</span></div>
          <h3>{achievement.title}</h3><p>{achievement.description}</p>
          <div className="method-list">{achievement.tags?.map((tag) => <span key={tag}>{tag}</span>)}</div>
          {achievement.proofUrl && <a href={achievement.proofUrl} target="_blank" rel="noreferrer" onClick={() => track('achievement_proof_opened', { title: achievement.title })}>{achievement.proofLabel ?? 'View proof'}<ExternalLabel /></a>}
        </article>
      ))}
    </div>
  </section>
);

const ResumeSection: React.FC = () => (
  <section id="resumes" className="evidence-section resume-section" aria-labelledby="resumes-title">
    <header className="evidence-heading"><h2 id="resumes-title">Role-targeted résumés</h2><p>Choose the evidence path closest to the role. The general résumé keeps the complete cross-disciplinary profile.</p></header>
    <div className="resume-list">
      {resumeProfiles.map((resume) => (
        <article key={resume.id}>
          <h3>{resume.role}</h3><p>{resume.headline}</p><span>{resume.keywords.join(' · ')}</span>
          <div><a href={resume.pdfUrl} target="_blank" rel="noreferrer" onClick={() => track('resume_download_clicked', { role: resume.role, format: 'pdf' })}>PDF<ExternalLabel /></a><a href={resume.docxUrl} onClick={() => track('resume_download_clicked', { role: resume.role, format: 'docx' })}>DOCX</a></div>
        </article>
      ))}
    </div>
  </section>
);

const ContactFooter: React.FC = () => (
  <footer id="contact" className="portfolio-contact">
    <div><h2>Let’s build an intelligent system worth trusting.</h2><p>For engineering roles, collaborations, or a deeper discussion of the work, contact Rahul directly.</p></div>
    <DepartureIris />
    <small>Rahul Mitra · Singapore · Evidence-led engineering across AI, optimization, software, perception, and security.</small>
  </footer>
);

const PortfolioExperience: React.FC = () => {
  const { policy } = useExperienceMode();
  return <div className="portfolio-field-test">
    <a className="skip-link" href="#main-content">Skip to portfolio evidence</a>
    <PortfolioHeader />
    <main id="main-content" className="portfolio-evidence">
        <PortfolioHero />
        <SelectedWork />
        <ExperienceSection />
        <AllProjectsSection />
        <TechnicalLabSection />
        <section id="world" className="portfolio-world-mount" aria-labelledby="world-title">
          <header><h2 id="world-title">Explore the shared optical test bench</h2><p>The same world supports the guided story and local inspection. Scroll stays native; Explore temporarily hands this scene’s camera to you.</p></header>
          {policy.allowHeavyAssets && policy.mode === 'guided' && !policy.lowMotion ? <Suspense fallback={<p role="status">Preparing the optional optical bench…</p>}><OpticalBenchWorld /></Suspense> : <p className="world-static-fallback">Static mode is active. Every Camera Laboratory control, equation, result, and portfolio record above remains available.</p>}
        </section>
        <CapabilitiesSection />
        <ProofSection />
        <ResumeSection />
        <ContactFooter />
    </main>
  </div>;
};

export default PortfolioExperience;
