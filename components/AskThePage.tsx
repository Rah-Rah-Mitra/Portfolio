import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { SECTION_IDS } from '../constants';
import { ASSISTANT_STARTERS, NARROW_ASSISTANT_STARTERS } from '../siteConfig';
import { allProjects, experienceRecords, resumeProfiles } from '../portfolioData';
import { useEffects } from '../contexts/PhysicsContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { captureAnalyticsException, track, triggerSessionReplay } from '../lib/analytics';
import { JOURNEY_STAGES } from '../constants';
import type { DesktopAppId } from '../types';
import { workstationApps } from '../lib/workstation';
import { appForAnchor, dispatchWorkbenchOpen } from '../lib/workbench';
import { allowedLinks, buildPageState } from '../lib/askPageState';
import { ESTATE_CATALOGUE } from '../lib/estate/catalogue.generated';
import type { EstateSiteId, EstateStoreyTag } from '../lib/estate/ids';
import { ESTATE_FOCUS_EVENT_NAME } from './workbench/estate/EstateWindow';

type Reference = { label: string; href: string };
type ChatMessage = { role: 'assistant' | 'user'; content: string; references?: Reference[] };
type LabMode = 'intrinsics' | 'extrinsics' | 'optics' | 'stereo';
export type PageCommand =
  | { type: 'focusExperience'; experienceId?: string }
  | { type: 'focusProject'; projectId: string }
  | { type: 'openTechnicalLab'; mode?: LabMode }
  | { type: 'focusGuideChapter'; chapterId: string }
  | { type: 'openDesktopApp'; appId: DesktopAppId }
  | { type: 'minimizeDesktopApp'; appId: DesktopAppId }
  | { type: 'focusEstate'; site: EstateSiteId; storey?: EstateStoreyTag; enter?: boolean };
type AgentResponse = { reply: string; references?: Reference[]; commands?: PageCommand[]; modelUsed?: boolean; model?: string; reason?: string };

const experienceIds = new Set(experienceRecords.map((record) => record.id));
const projectIds = new Set(allProjects.map((project) => project.id));
const chapterIds: Set<string> = new Set(JOURNEY_STAGES.map((stage) => stage.id));
// The rebuilt Camera Lab keeps exactly these four models and listens for
// 'portfolio:camera-lab-mode' to switch between them.
const labModes = new Set<LabMode>(['intrinsics', 'extrinsics', 'optics', 'stereo']);
const desktopAppIds = new Set<DesktopAppId>(workstationApps.map((app) => app.id));

export const validatePageCommand = (value: unknown): PageCommand | null => {
  if (!value || typeof value !== 'object') return null;
  const command = value as Record<string, unknown>;
  if (command.type === 'focusExperience' && (command.experienceId === undefined || (typeof command.experienceId === 'string' && experienceIds.has(command.experienceId)))) return { type: 'focusExperience', ...(command.experienceId ? { experienceId: command.experienceId as string } : {}) };
  if (command.type === 'focusProject' && typeof command.projectId === 'string' && projectIds.has(command.projectId)) return { type: 'focusProject', projectId: command.projectId };
  if (command.type === 'openTechnicalLab' && (command.mode === undefined || (typeof command.mode === 'string' && labModes.has(command.mode as LabMode)))) return { type: 'openTechnicalLab', ...(command.mode ? { mode: command.mode as LabMode } : {}) };
  if (command.type === 'focusGuideChapter' && typeof command.chapterId === 'string' && chapterIds.has(command.chapterId)) return { type: 'focusGuideChapter', chapterId: command.chapterId };
  if (command.type === 'openDesktopApp' && typeof command.appId === 'string' && desktopAppIds.has(command.appId as DesktopAppId)) return { type: 'openDesktopApp', appId: command.appId as DesktopAppId };
  if (command.type === 'minimizeDesktopApp' && typeof command.appId === 'string' && desktopAppIds.has(command.appId as DesktopAppId)) return { type: 'minimizeDesktopApp', appId: command.appId as DesktopAppId };
  // The Estate's buildings and storeys, read off the catalogue the window draws
  // ('L1–L16 + RF'), so this bundle need not carry lib/estate/ids.ts' tables:
  // 'L05' and 'l5' are L5, 'rf' is RF, and a storey the building lacks is
  // dropped while the building is kept, as server/pageAgent.mjs and
  // lib/estate/events.ts do (tests/estate-assistant.test.ts holds all three).
  const levels = command.type === 'focusEstate' && ESTATE_CATALOGUE.sites.find((site) => site.id === command.site)?.levels;
  if (!levels) return null;
  const raw = typeof command.storey === 'string' ? command.storey.trim().toUpperCase() : '';
  const level = +(/^L(\d{1,3})$/.exec(raw)?.[1] ?? 0);
  const storey = raw === 'RF' ? raw : level >= 1 && level <= +(/(\d+) \+/.exec(levels)?.[1] ?? 0) ? `L${level}` : 0;
  return { type: 'focusEstate', site: command.site as EstateSiteId, ...(storey && { storey: storey as EstateStoreyTag }), ...(typeof command.enter === 'boolean' && { enter: command.enter }) };
};
const cleanReferences = (value: unknown): Reference[] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<Reference>;
    if (typeof candidate.label !== 'string' || typeof candidate.href !== 'string' || !allowedLinks.has(candidate.href)) return [];
    return [{ label: candidate.label.slice(0, 80), href: candidate.href }];
  });
};

const parseAgentResponse = (value: unknown): AgentResponse | null => {
  if (!value || typeof value !== 'object') return null;
  const response = value as Partial<AgentResponse>;
  if (typeof response.reply !== 'string') return null;
  return {
    reply: response.reply.slice(0, 700), references: cleanReferences(response.references),
    commands: Array.isArray(response.commands) ? response.commands.flatMap((command) => { const valid = validatePageCommand(command); return valid ? [valid] : []; }) : [], modelUsed: response.modelUsed === true,
    model: typeof response.model === 'string' ? response.model : undefined,
    reason: typeof response.reason === 'string' ? response.reason : undefined,
  };
};

const projectRef = (id: string, label: string): Reference => ({ label, href: `#project-${id}` });
export const localAgent = (message: string): AgentResponse => {
  const text = message.toLowerCase();
  const commands: PageCommand[] = [];
  let reply = 'The offline index has no ready answer for that, which does not mean the record lacks it: Rahul’s roles are in Experience, and his email and profiles are in Contact. Try asking about optimization, 3D computer vision, security, a résumé, or the Camera and Systems Labs.';
  let references: Reference[] = [{ label: 'Read the experience timeline', href: '#experience' }, { label: 'Contact', href: '#contact' }];

  // Same branches, order and wording as localAgent in server/pageAgent.mjs, whose
  // SITE_EXHIBITS is the model's description of the labs and the FX panel.
  if (text.includes('camera lab') || text.includes('technical lab') || text.includes('slam') || text.includes('calibrat') || text.includes('zhang')) {
    reply = 'The Camera Lab is one synthetic, deterministic camera scene with four models: intrinsics (the K matrix and lens distortion), extrinsics (pose and projection), thin-lens optics (depth of field), and rectified stereo depth. It is a portfolio instrument backed by Rahul’s CS4277 top-student record, kept separate from professional work; the SLAM/RADIO benchmark stays unpublished until its reproducibility and evidence gates pass. It also runs a seeded Zhang calibration of that camera (homographies, closed-form K, Levenberg–Marquardt) on synthetic detections. It is a desktop window (881px and wider).';
    references = [{ label: 'Open the Camera Lab', href: '#technical-lab' }];
    const mode = [...labModes].find((candidate) => text.includes(candidate));
    commands.push({ type: 'openTechnicalLab', ...(mode ? { mode } : {}) });
  } else if (text.includes('systems lab') || text.includes('mechanism bench') || text.includes('drop test') || text.includes('teaching model') || text.includes('permutation flow') || text.includes('johnson') || /\bneh\b/.test(text)) {
    reply = 'The Systems Lab holds deterministic exhibits: an illustrative figure of the Abbott hybrid flow-shop schedule (operating details abstracted), the 15-stage changeover pipeline, the Mechanism Bench of six planar mechanisms, an interactive permutation flow-shop teaching model that compares the exact optimum with Johnson’s rule and NEH on synthetic, seeded jobs (not Abbott data), and a contained matter.js drop test. It is a desktop window (881px and wider).';
    references = [{ label: 'Open the Systems Lab', href: '#systems-lab' }];
    commands.push({ type: 'openDesktopApp', appId: 'systems-lab' });
  } else if (text.includes('asyncddgs')) {
    reply = 'AsyncDDGS is Rahul’s maintained asyncio-first DuckDuckGo client, built with aiohttp and released through a tested PyPI workflow.';
    references = [projectRef('asyncddgs', 'Inspect AsyncDDGS')];
    commands.push({ type: 'focusProject', projectId: 'asyncddgs' });
  } else if (text.includes('swarm') || text.includes('drone') || text.includes('defence tech') || text.includes('defense tech')) {
    reply = 'Swarmline is decentralised drone-swarm coordination, demonstrated in simulation, that took the five-person team Rahul led to the finals of the Singapore Defense Tech Hackathon 2026 (1,300+ applicants). With the ground link jammed, its 30 simulated drones confirmed all 8 walking targets in every run, against 2.1 on average for an operator-in-the-loop baseline.';
    references = [projectRef('swarmline', 'Inspect Swarmline')];
    commands.push({ type: 'focusProject', projectId: 'swarmline' });
  } else if (text.includes('amazon')) {
    reply = 'Since Jul 2026 Rahul has been a Robotics Vision Engineer with Amazon (BlendED AI+X), building vision systems across three imaging workstreams: camera ISP enhancement, super-resolution, and image restoration under motion and low light.';
    references = [{ label: 'Read the experience timeline', href: '#experience' }];
    commands.push({ type: 'focusExperience', experienceId: 'career-amazon-vision' });
  } else if (text.includes('stmicro') || text.includes('st micro')) {
    reply = 'Since Aug 2026 Rahul has been designing an AI-driven put-away recommendation system for STMicroelectronics’ Singapore warehouse, an NUS System Design Project in operations research, with capacity-aware decisions drawn from picking history, demand forecasts, and available capacity.';
    references = [{ label: 'Read the experience timeline', href: '#experience' }];
    commands.push({ type: 'focusExperience', experienceId: 'career-stmicro-or' });
  } else if (text.includes('contact') || text.includes('email') || text.includes('get in touch')) {
    reply = 'Rahul’s email, LinkedIn, and GitHub are in the Résumés & Contact window, beside the eight résumés.';
    references = [{ label: 'Contact', href: '#contact' }];
    commands.push({ type: 'focusGuideChapter', chapterId: SECTION_IDS.CONTACT });
  } else if (text.includes('experience') || text.includes('timeline')) {
    reply = 'The experience timeline presents Rahul’s role, organization, location, dates, scope, responsibilities, outcomes, and related work in ordinary HTML.';
    references = [{ label: 'Read the experience timeline', href: '#experience' }];
    commands.push({ type: 'focusExperience' });
  } else if (text.includes('guide') || text.includes('chapter')) {
    reply = 'Each chapter of the record is a window on the workbench: Selected Work, Experience, the project archive, the labs, Capabilities, Proof, and Résumés. The rail opens any of them, and on a phone they become one searchable registry.';
    references = [{ label: 'Return to selected work', href: '#work' }];
    commands.push({ type: 'focusGuideChapter', chapterId: SECTION_IDS.PROJECTS });
  } else if (text.includes('abbott') || text.includes('apc') || text.includes('changeover') || text.includes('manufacturing internship')) {
    reply = 'At Abbott, Rahul built a SimPy and CP-SAT hybrid flow-shop digital twin, researched robust optimization, and engineered a 15-stage changeover-data pipeline that processed five years of unseen, unclean data with zero execution failures. He also productionized and operated an APC simulator built by another team for live internal manufacturing and engineer-training use through Docker and Azure App Service, and trained regional engineering teams across Asia and Europe on repeatable AI workflows.';
    references = [projectRef('hybrid-flow-shop-digital-twin', 'Hybrid Flow Shop Digital Twin Optimizer'), projectRef('changeover-data-quality-pipeline', 'Manufacturing Changeover Data Pipeline'), projectRef('azure-apc-web-simulator', 'APC Simulator Cloud Operations')];
    commands.push({ type: 'focusProject', projectId: 'hybrid-flow-shop-digital-twin' });
  } else if (text.includes('optim') || text.includes('scheduling') || text.includes('operations research')) {
    reply = 'Rahul’s operations-research evidence connects CP-SAT and hybrid flow-shop scheduling to a SimPy digital twin, robust-optimization research, graph optimization, network flow, simulation, objective functions, and operational constraints.';
    references = [projectRef('hybrid-flow-shop-digital-twin', 'Hybrid Flow Shop Digital Twin Optimizer'), { label: 'Operations research capability map', href: '#domains' }];
    commands.push({ type: 'focusProject', projectId: 'hybrid-flow-shop-digital-twin' });
  } else if (text.includes('3d computer vision') || text.includes('3d cv') || text.includes('epipolar') || text.includes('spatial')) {
    reply = 'Rahul received the NUS School of Computing Certificate of Outstanding Performance as the top student in CS4277. The recorded foundations include projective geometry, camera models, epipolar geometry, absolute pose, structure from motion, bundle adjustment, and two-view and multi-view stereo.';
    references = [{ label: '3D perception capability map', href: '#domains' }, { label: 'NUS distinction and proof', href: '#proof' }];
    commands.push({ type: 'focusGuideChapter', chapterId: SECTION_IDS.DOMAINS });
  } else if (text.includes('resume') || text.includes('résumé') || text.includes('cv')) {
    reply = 'Choose the role-specific résumé when the vacancy is clear: Software, Solution Architecture, AI, Operations Research, Cyber Security, or Civic Tech. Use the one-page Highlights résumé for preference forms and broad applications, or the two-page General / Master CV for full multidisciplinary detail.';
    references = [{ label: 'Compare all eight résumés', href: '#resumes' }, { label: 'Download the General / Master CV', href: resumeProfiles.find((resume) => resume.id === 'general')!.pdfUrl }];
    commands.push({ type: 'focusGuideChapter', chapterId: SECTION_IDS.RESUMES });
  } else if (text.includes('security') || text.includes('cyber') || text.includes('bug bounty') || text.includes('adversarial')) {
    reply = 'Rahul’s security record includes responsible bug-bounty research for government and transport programs, web-application testing, network inspection, secure architecture, and bespoke vulnerability tooling. Sensitive disclosure details are intentionally omitted.';
    references = [projectRef('arcane', 'Arcane security tooling'), { label: 'Security experience and proof', href: '#proof' }];
    commands.push({ type: 'focusGuideChapter', chapterId: SECTION_IDS.ACHIEVEMENTS });
  } else if (/\bfx\b/.test(text) || text.includes('quick scan') || text.includes('pause') || text.includes('reduce motion') || text.includes('reduced motion') || text.includes('n-body') || text.includes('nbody') || text.includes('gravity field') || text.includes('fluid') || text.includes('backdrop') || text.includes('desk background') || text.includes('sound')) {
    // No command: nothing opens the FX panel by id, and there is no switch left
    // to flip. Quick Scan questions land here because the honest answer is what
    // replaced it, and what an old ?mode=scan link still does
    // (lib/experienceMode.ts keeps it on purpose).
    reply = 'The FX panel holds Pause all motion, sound cues, and two desk backgrounds that stay off until switched on: an N-body gravity field computed with a fast multipole method, and a WebGL2 fluid. There is no Quick Scan switch any more: every window is plain, readable HTML, and Pause all motion halts the site’s animation. An old ?mode=scan link still opens the page without the desk backgrounds or sound cues, and without ?app= deep links.';
  } else if (/world|map|estate|hdb|bonsai|hawker|neighbourhood centre|car park|mscp|\bblk(?![a-z])/.test(text)) {
    reply = 'The Estate window shows Sample Town N5, a generated sample HDB neighbourhood (not a real town or HDB’s own plans) built as IFC4X3 by Rahul’s Bonsai-Estate pipeline with IfcOpenShell, Bonsai and Blender: 12 residential blocks with 1,206 flats, a multi-storey car park and a hawker centre. Orbit it or fly to a building, and walk in through void decks, stairs and lifts; detail loads as you get closer. It is a desktop window (881px and wider).';
    references = [{ label: 'Explore the estate', href: '#world' }];
    // A named building flies there (or walks in), plan §9.4; otherwise the window opens.
    const blk = /\bblk\s*(50[1-9]|51[0-2])\b/.exec(text)?.[1];
    const site = blk ? `BLK_${blk}` : /car park|mscp/.test(text) ? 'MSCP_513' : /hawker|neighbourhood centre/.test(text) ? 'NC_514' : null;
    commands.push(site ? { type: 'focusEstate', site: site as EstateSiteId, ...(/\b(into|enter|walk|inside)\b/.test(text) ? { enter: true } : {}) } : { type: 'openDesktopApp', appId: 'world-3d' });
  } else if (text.includes('project') || text.includes('work')) {
    reply = 'The selected work is organized as evidence-led briefs covering operating context, Rahul’s contribution, technical approach, and current result or proof.';
    references = [{ label: 'Browse selected engineering work', href: '#work' }];
    commands.push({ type: 'focusGuideChapter', chapterId: SECTION_IDS.PROJECTS });
  }

  return { reply, references, commands, modelUsed: false, reason: 'client_local_fallback' };
};

// The Camera Lab, the Systems Lab and the Estate are desktop windows; ≤880px
// the site is the Field Index registry, which has none of them. Same breakpoint
// as App.tsx. Read after mount (App is prerendered), and the panel is never open
// in the prerendered HTML, so the first paint of the starters already knows.
const NARROW_QUERY = '(max-width: 880px)';
const useNarrowSurface = () => {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(NARROW_QUERY);
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  return narrow;
};

const AskThePage: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [serviceNote, setServiceNote] = useState('Grounded in the visible portfolio record.');
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: 'Ask about Rahul’s work, technical foundations, security record, or which résumé fits a role. I only answer from this portfolio’s data.' }]);
  const panelRef = useRef<HTMLElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const openedAt = useRef<number | null>(null);
  const effects = useEffects();
  const narrow = useNarrowSurface();
  useFocusTrap(open, panelRef, '[data-open-assistant], .ask-dock');

  // The model is told which surface asked, so on a phone it says the labs are
  // desktop windows instead of offering to open them (SITE_EXHIBITS).
  const pageState = useMemo(() => buildPageState(effects.settings, narrow ? 'field-index' : 'field-workbench'), [effects.settings, narrow]);
  const starters = narrow ? NARROW_ASSISTANT_STARTERS : ASSISTANT_STARTERS;

  const close = (reason: string) => {
    setOpen(false);
    track('panel_closed', { panel: 'ask_this_portfolio', reason, duration_ms: openedAt.current ? Math.round(performance.now() - openedAt.current) : 0 });
    openedAt.current = null;
  };
  const openPanel = (source: string, prompt?: string) => {
    openedAt.current = performance.now();
    setOpen(true);
    if (prompt) setInput(prompt);
    track('panel_opened', { panel: 'ask_this_portfolio', source });
  };

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt;
      openPanel('page_cta', prompt);
    };
    window.addEventListener('portfolio:openAssistant', handleOpen);
    return () => window.removeEventListener('portfolio:openAssistant', handleOpen);
  }, []);
  useEffect(() => { transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight }); }, [messages, isSending]);
  useEffect(() => {
    if (!open) return undefined;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close('escape_key'); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);

  // Every command opens a window through the one bridge both surfaces listen on:
  // Field Workbench opens the window and scrolls targetId into view once the
  // window has a layout box; Field Index switches its filter and expands the
  // matching registry row (its DOM has no anchor ids, so it maps targetId).
  const applyCommand = (command: PageCommand) => {
    const valid = validatePageCommand(command);
    if (!valid) return;
    if (valid.type === 'focusExperience') dispatchWorkbenchOpen({ appId: 'experience', targetId: valid.experienceId ? `experience-${valid.experienceId}` : 'experience' });
    else if (valid.type === 'focusProject') dispatchWorkbenchOpen({ appId: 'project-archive', targetId: `project-${valid.projectId}` });
    else if (valid.type === 'openTechnicalLab') {
      dispatchWorkbenchOpen({ appId: 'camera-lab', targetId: 'technical-lab' });
      // A beat later, so the lab has committed its open window before it switches.
      if (valid.mode) window.setTimeout(() => window.dispatchEvent(new CustomEvent('portfolio:camera-lab-mode', { detail: { mode: valid.mode } })), 80);
    } else if (valid.type === 'focusGuideChapter') {
      const appId = appForAnchor(`#${valid.chapterId}`);
      if (appId) dispatchWorkbenchOpen({ appId, targetId: valid.chapterId });
      else document.getElementById(valid.chapterId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (valid.type === 'openDesktopApp') dispatchWorkbenchOpen({ appId: valid.appId });
    else if (valid.type === 'minimizeDesktopApp') dispatchWorkbenchOpen({ appId: valid.appId, action: 'minimize' });
    else if (valid.type === 'focusEstate') {
      // The building travels only in the event, never in targetId; the viewer holds it until live.
      dispatchWorkbenchOpen({ appId: 'world-3d', targetId: 'world' });
      const { type: _type, ...detail } = valid;
      window.setTimeout(() => window.dispatchEvent(new CustomEvent(ESTATE_FOCUS_EVENT_NAME, { detail })), 80);
    }
  };

  const submitMessage = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;
    setInput('');
    setIsSending(true);
    setServiceNote(navigator.onLine ? 'Checking the portfolio record…' : 'Offline: using the safe local portfolio index.');
    setMessages((current) => [...current, { role: 'user', content: trimmed }]);
    triggerSessionReplay('ask_page_command', { source: 'ask_this_portfolio' });
    let response: AgentResponse | null = null;
    let requestStatus: number | 'network_error' = 'network_error';
    let source = 'client_local_fallback';
    const startedAt = performance.now();

    if (navigator.onLine) {
      try {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 12_500);
        const apiResponse = await fetch('/api/page-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: trimmed, pageState }), signal: controller.signal });
        window.clearTimeout(timeoutId);
        requestStatus = apiResponse.status;
        if (apiResponse.ok) {
          response = parseAgentResponse(await apiResponse.json());
          source = response?.modelUsed ? 'model' : response?.reason ? 'server_fallback' : 'server_response';
        } else captureAnalyticsException(new Error(`Page agent returned ${apiResponse.status}`), { area: 'ask_page_api', status: apiResponse.status });
      } catch (error) { captureAnalyticsException(error, { area: 'ask_page_network' }); }
    }

    const agent = response ?? localAgent(trimmed);
    agent.commands?.forEach(applyCommand);
    setMessages((current) => [...current, { role: 'assistant', content: agent.reply, references: cleanReferences(agent.references) }]);
    setServiceNote(agent.modelUsed ? 'Answered by the private page agent.' : 'Answered by the safe local portfolio index.');
    setIsSending(false);
    track('api_request_completed', { route: '/api/page-agent', status: requestStatus, ok: response !== null, duration_ms: Math.round(performance.now() - startedAt), response_source: source });
    track('chatbot_command_submitted', { used_model: String(Boolean(agent.modelUsed)), command_count: String(agent.commands?.length ?? 0), status: source, fallback_reason: agent.reason });
  };

  const dockTrigger = <button type="button" className="ask-dock" data-open-assistant onClick={() => openPanel('dock')} aria-label="AI, open Ask this portfolio"><span aria-hidden="true">AI</span><span>Ask portfolio</span></button>;

  if (!open) return dockTrigger;

  return (
    <>
      {dockTrigger}
      <div className="panel-backdrop assistant-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close('backdrop'); }}>
        <section ref={panelRef} className="ask-page" role="dialog" aria-modal="true" aria-labelledby="assistant-title" tabIndex={-1}>
        <header className="panel-header"><div><h2 id="assistant-title">Ask this portfolio</h2><p className="panel-context">Private · data grounded</p></div><button type="button" onClick={() => close('close_button')}>Close</button></header>
        <p className="panel-intro">Ask a recruiter-style question or navigate the page. Keys remain server-side; if the service is unavailable, the assistant falls back to a small factual local index.</p>
        <div className="assistant-starters" aria-label="Starter questions">
          {starters.map((starter) => <button key={starter} type="button" onClick={() => void submitMessage(starter)} aria-disabled={isSending}>{starter}</button>)}
        </div>
        <div ref={transcriptRef} className="assistant-transcript" data-private="true" aria-live="polite" aria-busy={isSending}>
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} data-role={message.role}>
              <span>{message.role === 'assistant' ? 'Portfolio' : 'You'}</span>
              <p>{message.content}</p>
              {message.references?.length ? <div className="assistant-references">{message.references.map((reference) => {
                const external = reference.href.startsWith('http');
                return <a key={`${reference.href}-${reference.label}`} href={reference.href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} onClick={(event) => {
                  if (!reference.href.startsWith('#')) return;
                  const appId = appForAnchor(reference.href);
                  if (appId) {
                    // Anchors live inside closed windows; hashchange alone won't
                    // fire when the hash already matches — always dispatch.
                    event.preventDefault();
                    dispatchWorkbenchOpen({ appId, targetId: reference.href.slice(1) });
                  }
                  close('reference');
                }}>{reference.label}{external && <span className="sr-only"> (opens in a new tab)</span>}</a>;
              })}</div> : null}
            </article>
          ))}
          {isSending && <p className="assistant-loading" role="status">Tracing relevant portfolio evidence…</p>}
        </div>
        <form onSubmit={(event: FormEvent) => { event.preventDefault(); void submitMessage(input); }} className="assistant-form">
          <label htmlFor="portfolio-question">Question or page command</label>
          <div><input id="portfolio-question" className="ph-no-capture" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about optimization, 3D vision, security…" data-private="true" data-block-replay="true" autoComplete="off" /><button type="submit" disabled={isSending || !input.trim()}>Send</button></div>
        </form>
        <p className="assistant-status" role="status">{serviceNote}</p>
        </section>
      </div>
    </>
  );
};

export default AskThePage;
