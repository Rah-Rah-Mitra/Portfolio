import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { SECTION_IDS } from '../constants';
import { ASSISTANT_STARTERS } from '../siteConfig';
import { fieldNoteByIdOrAlias, fieldNotes, projectArchive, projectHighlights, resumeProfiles } from '../portfolioData';
import { EffectId, NumericEffectId, useEffects } from '../contexts/PhysicsContext';
import { useTheme } from '../contexts/ThemeContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { captureAnalyticsException, track, triggerSessionReplay } from '../lib/analytics';

type Reference = { label: string; href: string };
type ChatMessage = { role: 'assistant' | 'user'; content: string; references?: Reference[] };
type PageCommand =
  | { type: 'setEffectEnabled'; effect: EffectId; enabled: boolean }
  | { type: 'setEffectParam'; effect: NumericEffectId; param: string; value: number }
  | { type: 'switchProfile'; profile: 'software' | 'cybersecurity' }
  | { type: 'focusSection'; sectionId: string }
  | { type: 'focusEvent'; eventId: string }
  | { type: 'openWorld' }
  | { type: 'closeWorld' }
  | { type: 'startNpcDialogue'; npcId: string }
  | { type: 'restoreText' };
type AgentResponse = { reply: string; references?: Reference[]; commands?: PageCommand[]; modelUsed?: boolean; model?: string; reason?: string };

const numericParams: Record<NumericEffectId, Set<string>> = {
  smash: new Set(['intensity', 'radius']), gravity: new Set(['strength', 'radius']),
  fluid: new Set(['speed', 'intensity', 'opacity', 'splatRadius', 'curl']), pretext: new Set(['intensity']),
};
const effectIds = new Set<EffectId>(['smash', 'gravity', 'fluid', 'pretext', 'world']);
const sectionIds = new Set<string>(Object.values(SECTION_IDS));
const eventIds = new Set(fieldNoteByIdOrAlias.keys());
const allProjects = [...projectHighlights, ...projectArchive];
const allowedLinks = new Set([
  ...Object.values(SECTION_IDS).map((id) => `#${id}`),
  ...allProjects.flatMap((project) => [`#project-${project.id}`, project.repoUrl, project.liveUrl, ...(project.links ?? []).map((link) => link.url)]).filter((link): link is string => Boolean(link)),
  ...resumeProfiles.flatMap((resume) => [resume.pdfUrl, resume.docxUrl]),
  ...fieldNotes.flatMap((note) => (note.links ?? []).map((link) => link.url)),
]);

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
    commands: Array.isArray(response.commands) ? response.commands : [], modelUsed: response.modelUsed === true,
    model: typeof response.model === 'string' ? response.model : undefined,
    reason: typeof response.reason === 'string' ? response.reason : undefined,
  };
};

const projectRef = (id: string, label: string): Reference => ({ label, href: `#project-${id}` });
const localAgent = (message: string): AgentResponse => {
  const text = message.toLowerCase();
  const commands: PageCommand[] = [];
  let reply = 'I could not find that in Rahul’s portfolio record. Try asking about optimization, 3D computer vision, security, a résumé, or the spatial map.';
  let references: Reference[] = [];

  if (text.includes('optim') || text.includes('scheduling') || text.includes('operations research')) {
    reply = 'Rahul’s operations-research evidence connects constraint programming and hybrid flow-shop scheduling to a digital-twin simulator, with graph optimization, network flow, simulation, objective functions, and constraints surfaced across the portfolio.';
    references = [projectRef('hybrid-flow-shop-digital-twin', 'Hybrid Flow Shop Digital Twin Optimizer'), { label: 'Operations research capability map', href: '#domains' }];
    commands.push({ type: 'focusSection', sectionId: SECTION_IDS.PROJECTS });
  } else if (text.includes('3d computer vision') || text.includes('3d cv') || text.includes('epipolar') || text.includes('spatial')) {
    reply = 'Rahul received the NUS School of Computing Certificate of Outstanding Performance as the top student in CS4277. The recorded foundations include projective geometry, camera models, epipolar geometry, absolute pose, structure from motion, bundle adjustment, and two-view and multi-view stereo.';
    references = [{ label: '3D perception capability map', href: '#domains' }, { label: 'NUS distinction and proof', href: '#proof' }];
    commands.push({ type: 'focusSection', sectionId: SECTION_IDS.DOMAINS });
  } else if (text.includes('resume') || text.includes('résumé') || text.includes('cv')) {
    reply = 'Choose the role-specific résumé when the vacancy is clear: Software, Solution Architecture, AI, Operations Research, Cyber Security, or Civic Tech. Use the two-page General / Master CV for broad or multidisciplinary applications.';
    references = [{ label: 'Compare all seven résumés', href: '#resumes' }, { label: 'Download the General / Master CV', href: resumeProfiles.find((resume) => resume.id === 'general')!.pdfUrl }];
    commands.push({ type: 'focusSection', sectionId: SECTION_IDS.RESUMES });
  } else if (text.includes('security') || text.includes('cyber') || text.includes('bug bounty') || text.includes('adversarial')) {
    reply = 'Rahul’s security record includes responsible bug-bounty research for government and transport programs, web-application testing, network inspection, secure architecture, and bespoke vulnerability tooling. Sensitive disclosure details are intentionally omitted.';
    references = [projectRef('arcane', 'Arcane security tooling'), { label: 'Security experience and proof', href: '#proof' }];
    commands.push({ type: 'switchProfile', profile: 'cybersecurity' }, { type: 'focusSection', sectionId: SECTION_IDS.ACHIEVEMENTS });
  } else if (text.includes('world') || text.includes('map')) {
    reply = 'Opening the optional spatial portfolio map. It uses the existing Three.js and GLB environment as an exploratory layer; the main portfolio remains available without it.';
    references = [{ label: 'Return to selected work', href: '#work' }];
    commands.push({ type: 'openWorld' });
  } else if (text.includes('project') || text.includes('work')) {
    reply = 'The selected work is organized as evidence-led briefs covering operating context, Rahul’s contribution, technical approach, and current result or proof.';
    references = [{ label: 'Browse selected engineering work', href: '#work' }];
    commands.push({ type: 'focusSection', sectionId: SECTION_IDS.PROJECTS });
  }

  const enabled = !(text.includes('disable') || text.includes('off'));
  if (text.includes('fluid')) commands.push({ type: 'setEffectEnabled', effect: 'fluid', enabled });
  if (text.includes('gravity')) commands.push({ type: 'setEffectEnabled', effect: 'gravity', enabled });
  if (text.includes('smash')) commands.push({ type: 'setEffectEnabled', effect: 'smash', enabled });
  if (text.includes('restore') || text.includes('reset')) commands.push({ type: 'restoreText' });

  return { reply, references, commands, modelUsed: false, reason: 'client_local_fallback' };
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
  const { theme, toggleTheme } = useTheme();
  useFocusTrap(open, panelRef, '[data-open-assistant], .ask-dock');

  const pageState = useMemo(() => ({
    profile: theme === 'dark' ? 'cybersecurity' : 'software', effects: effects.settings,
    sections: Object.values(SECTION_IDS), allowedLinks: Array.from(allowedLinks),
    projects: allProjects.map(({ id, title, category, description, tags, spotlight, repoUrl, liveUrl, links }) => ({ id, title, category, description, tags, spotlight, repoUrl, liveUrl, links })),
    events: fieldNotes.map(({ id, aliases, title, kind, kinds, dateLabel, summary, tags, links }) => ({ id, aliases, title, kind, kinds, dateLabel, summary, tags, links })),
    resumes: resumeProfiles.map(({ id, role, headline, keywords, pdfUrl, docxUrl }) => ({ id, role, headline, keywords, pdfUrl, docxUrl })),
  }), [effects.settings, theme]);

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

  const applyCommand = (command: PageCommand) => {
    if (command.type === 'setEffectEnabled' && effectIds.has(command.effect)) effects.setEffectEnabled(command.effect, command.enabled);
    else if (command.type === 'setEffectParam' && numericParams[command.effect]?.has(command.param) && Number.isFinite(command.value)) effects.setEffectParam(command.effect, command.param, command.value);
    else if (command.type === 'switchProfile') {
      if (command.profile === 'cybersecurity' && theme !== 'dark') toggleTheme();
      if (command.profile === 'software' && theme !== 'light') toggleTheme();
    } else if (command.type === 'focusSection' && sectionIds.has(command.sectionId)) document.getElementById(command.sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (command.type === 'focusEvent' && eventIds.has(command.eventId)) {
      const note = fieldNoteByIdOrAlias.get(command.eventId);
      if (note) document.getElementById(`event-${note.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (command.type === 'openWorld') effects.openWorld('ask_this_portfolio');
    else if (command.type === 'closeWorld') effects.closeWorld('ask_this_portfolio');
    else if (command.type === 'restoreText') effects.restoreAll();
    else if (command.type === 'startNpcDialogue') {
      effects.openWorld('ask_this_portfolio');
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('portfolio:npcDialogue', { detail: { npcId: command.npcId } })), 150);
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
          {ASSISTANT_STARTERS.map((starter) => <button key={starter} type="button" onClick={() => void submitMessage(starter)} aria-disabled={isSending}>{starter}</button>)}
        </div>
        <div ref={transcriptRef} className="assistant-transcript" data-private="true" aria-live="polite" aria-busy={isSending}>
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} data-role={message.role}>
              <span>{message.role === 'assistant' ? 'Portfolio' : 'You'}</span>
              <p>{message.content}</p>
              {message.references?.length ? <div className="assistant-references">{message.references.map((reference) => {
                const external = reference.href.startsWith('http');
                return <a key={`${reference.href}-${reference.label}`} href={reference.href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} onClick={() => { if (reference.href.startsWith('#')) close('reference'); }}>{reference.label}{external && <span className="sr-only"> (opens in a new tab)</span>}</a>;
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
