import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { SECTION_IDS } from '../constants';
import { fieldNoteByIdOrAlias, fieldNotes, projectHighlights } from '../portfolioData';
import { EffectId, NumericEffectId, useEffects } from '../contexts/PhysicsContext';
import { useTheme } from '../contexts/ThemeContext';
import { captureAnalyticsException, track, triggerSessionReplay } from '../lib/analytics';

type ChatMessage = {
  role: 'assistant' | 'user';
  content: string;
};

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

type AgentResponse = {
  reply: string;
  commands?: PageCommand[];
  modelUsed?: boolean;
  model?: string;
  reason?: string;
};

const numericParams: Record<NumericEffectId, Set<string>> = {
  smash: new Set(['intensity', 'radius']),
  gravity: new Set(['strength', 'radius']),
  fluid: new Set(['speed', 'intensity', 'opacity', 'splatRadius', 'curl']),
  pretext: new Set(['intensity']),
};

const effectIds = new Set<EffectId>(['smash', 'gravity', 'fluid', 'pretext', 'world']);
const sectionIds = new Set(Object.values(SECTION_IDS));
const eventIds = new Set(fieldNoteByIdOrAlias.keys());

const getInitialCollapsed = () => {
  if (typeof window === 'undefined') return true;
  const stored = window.localStorage.getItem('ask-page-collapsed');
  if (stored) return stored === 'true';
  return true;
};

const parseAgentResponse = (value: unknown): AgentResponse | null => {
  if (!value || typeof value !== 'object') return null;
  const response = value as Partial<AgentResponse>;
  if (typeof response.reply !== 'string') return null;
  return {
    reply: response.reply,
    commands: Array.isArray(response.commands) ? response.commands : [],
    modelUsed: response.modelUsed === true,
    model: typeof response.model === 'string' ? response.model : undefined,
    reason: typeof response.reason === 'string' ? response.reason : undefined,
  };
};

const localAgent = (message: string): AgentResponse => {
  const text = message.toLowerCase();
  const commands: PageCommand[] = [];

  const wantsFluid = text.includes('fluid') || text.includes('cfd') || (text.includes('background') && (text.includes('ripple') || text.includes('translucent') || text.includes('cursor')));
  if (wantsFluid) {
    commands.push({ type: 'setEffectEnabled', effect: 'fluid', enabled: !text.includes('disable') && !text.includes('off') });
    if (text.includes('faster') || text.includes('speed')) commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'speed', value: 1.8 });
    if (text.includes('slower') || text.includes('calm')) commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'speed', value: 0.72 });
    if (text.includes('translucent') || text.includes('transparent') || text.includes('subtle')) commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'opacity', value: 34 });
    if (text.includes('opaque') || text.includes('brighter')) commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'opacity', value: 68 });
    if (text.includes('colorful') || text.includes('vivid') || text.includes('intense')) commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'intensity', value: 82 });
    if (text.includes('ripple') || text.includes('curl') || text.includes('swirl')) commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'curl', value: 58 });
    if (text.includes('wide') || text.includes('larger') || text.includes('bigger')) commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'splatRadius', value: 64 });
    if (text.includes('tight') || text.includes('smaller')) commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'splatRadius', value: 28 });
  }
  if (text.includes('gravity')) commands.push({ type: 'setEffectEnabled', effect: 'gravity', enabled: !text.includes('disable') && !text.includes('off') });
  if (text.includes('smash')) commands.push({ type: 'setEffectEnabled', effect: 'smash', enabled: !text.includes('disable') && !text.includes('off') });
  if (text.includes('cyber')) commands.push({ type: 'switchProfile', profile: 'cybersecurity' });
  if (text.includes('software')) commands.push({ type: 'switchProfile', profile: 'software' });
  if (text.includes('world') || text.includes('3d')) commands.push({ type: 'openWorld' });
  if (text.includes('event') || text.includes('career') || text.includes('education') || text.includes('achievement') || text.includes('certification')) commands.push({ type: 'focusSection', sectionId: SECTION_IDS.EVENTS });
  if (text.includes('project')) commands.push({ type: 'focusSection', sectionId: SECTION_IDS.PROJECTS });
  if (text.includes('restore') || text.includes('reset')) commands.push({ type: 'restoreText' });

  return {
    reply: commands.length
      ? 'I adjusted the page with a local command fallback while the live model is unavailable.'
      : 'I can adjust effects, switch profiles, open the world, or focus project and event sections.',
    commands,
    reason: 'client_local_fallback',
  };
};

const AskThePage: React.FC = () => {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const openedAtRef = useRef<number | null>(collapsed ? null : performance.now());
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hi Rahul. I can tune effects, switch profiles, focus events, and open the 3D world.',
    },
  ]);
  const effects = useEffects();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    window.localStorage.setItem('ask-page-collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePanel('escape_key');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openPanel = (source: string) => {
    openedAtRef.current = performance.now();
    setCollapsed(false);
    track('panel_opened', { panel: 'ask_the_page', source });
  };

  const closePanel = (reason: string) => {
    const duration = openedAtRef.current ? Math.round(performance.now() - openedAtRef.current) : 0;
    openedAtRef.current = null;
    setCollapsed(true);
    track('panel_closed', { panel: 'ask_the_page', reason, duration_ms: duration });
  };

  const pageState = useMemo(() => ({
    profile: theme === 'dark' ? 'cybersecurity' : 'software',
    effects: effects.settings,
    sections: Object.values(SECTION_IDS),
    projects: projectHighlights.map(({ id, title, tags }) => ({ id, title, tags })),
    events: fieldNotes.map(({ id, aliases, title, kind, kinds, tags }) => ({ id, aliases, title, kind, kinds, tags })),
  }), [theme, effects.settings]);

  const applyCommand = (command: PageCommand) => {
    if (command.type === 'setEffectEnabled' && effectIds.has(command.effect)) {
      effects.setEffectEnabled(command.effect, command.enabled);
      return;
    }

    if (command.type === 'setEffectParam' && numericParams[command.effect]?.has(command.param) && Number.isFinite(command.value)) {
      effects.setEffectParam(command.effect, command.param, command.value);
      return;
    }

    if (command.type === 'switchProfile') {
      if (command.profile === 'cybersecurity' && theme !== 'dark') toggleTheme();
      if (command.profile === 'software' && theme !== 'light') toggleTheme();
      return;
    }

    if (command.type === 'focusSection' && sectionIds.has(command.sectionId)) {
      document.getElementById(command.sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (command.type === 'focusEvent' && eventIds.has(command.eventId)) {
      const canonicalNote = fieldNoteByIdOrAlias.get(command.eventId);
      if (canonicalNote) {
        document.getElementById(`event-${canonicalNote.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    if (command.type === 'openWorld') {
      effects.openWorld('ask_the_page');
      return;
    }

    if (command.type === 'closeWorld') {
      effects.closeWorld('ask_the_page');
      return;
    }

    if (command.type === 'restoreText') {
      effects.restoreAll();
      return;
    }

    if (command.type === 'startNpcDialogue') {
      effects.openWorld('ask_the_page');
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('portfolio:npcDialogue', { detail: { npcId: command.npcId } }));
      }, 100);
    }
  };

  const submitMessage = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;

    setInput('');
    setIsSending(true);
    setMessages((current) => [...current, { role: 'user', content: trimmed }]);
    triggerSessionReplay('ask_page_command', { source: 'ask_the_page' });

    let response: AgentResponse | null = null;
    let requestStatus: number | 'network_error' = 'network_error';
    let responseSource = 'client_local_fallback';
    const startedAt = performance.now();
    try {
      const apiResponse = await fetch('/api/page-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, pageState }),
      });
      requestStatus = apiResponse.status;
      if (apiResponse.ok) {
        response = parseAgentResponse(await apiResponse.json());
        responseSource = response?.modelUsed ? 'model' : response?.reason ? 'server_fallback' : 'server_response';
      } else {
        captureAnalyticsException(new Error(`Page agent returned ${apiResponse.status}`), {
          area: 'ask_page_api',
          status: apiResponse.status,
        });
      }
    } catch (error) {
      captureAnalyticsException(error, { area: 'ask_page_network' });
      response = null;
    }

    const agent = response ?? localAgent(trimmed);
    const durationMs = Math.round(performance.now() - startedAt);
    agent.commands?.forEach(applyCommand);
    setMessages((current) => [...current, { role: 'assistant', content: agent.reply }]);
    setIsSending(false);
    track('api_request_completed', {
      route: '/api/page-agent',
      status: requestStatus,
      ok: response !== null,
      duration_ms: durationMs,
      response_source: responseSource,
    });
    track('chatbot_command_submitted', {
      used_model: String(Boolean(agent.modelUsed)),
      command_count: String(agent.commands?.length ?? 0),
      status: responseSource,
      fallback_reason: agent.reason,
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitMessage(input);
  };

  const quickActions: Array<{ label: string; reply: string; commands: PageCommand[] }> = [
    {
      label: 'Increase fluid speed',
      reply: 'Fluid motion is faster now.',
      commands: [
        { type: 'setEffectEnabled', effect: 'fluid', enabled: true },
        { type: 'setEffectParam', effect: 'fluid', param: 'speed', value: 1.8 },
      ],
    },
    {
      label: 'Enable gravity',
      reply: 'Gravity text interaction is active.',
      commands: [{ type: 'setEffectEnabled', effect: 'gravity', enabled: true }],
    },
    {
      label: 'Disable smash',
      reply: 'Smash interaction is disabled.',
      commands: [{ type: 'setEffectEnabled', effect: 'smash', enabled: false }],
    },
    {
      label: 'Open 3D world',
      reply: 'Opening the 3D portfolio world.',
      commands: [{ type: 'openWorld' }],
    },
    {
      label: 'Show events',
      reply: 'Jumping to Field Notes.',
      commands: [{ type: 'focusSection', sectionId: SECTION_IDS.EVENTS }],
    },
  ];

  const runQuickAction = (action: { label: string; reply: string; commands: PageCommand[] }) => {
    if (isSending) return;
    setMessages((current) => [...current, { role: 'user', content: action.label }]);
    action.commands.forEach(applyCommand);
    setMessages((current) => [...current, { role: 'assistant', content: action.reply }]);
    track('chatbot_quick_action_clicked', { action: action.label, command_count: String(action.commands.length) });
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => openPanel('dock')}
        data-analytics-id="ask-page-open"
        className="ask-dock fixed bottom-5 left-5 z-[70] inline-flex h-12 w-12 items-center justify-center rounded-lg border border-cyan-300/40 bg-gray-950/90 text-cyan-200 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl transition-transform hover:-translate-y-0.5 hover:border-cyan-200 dark:border-red-400/40 dark:text-red-200 dark:shadow-red-950/40"
        aria-label="Open Ask The Page"
        title="Open Ask The Page"
      >
        <span className="text-sm font-black tracking-widest">AI</span>
      </button>
    );
  }

  return (
    <section className="ask-page fixed bottom-5 left-5 z-[70] w-[min(360px,calc(100vw-1.5rem))] rounded-lg border border-cyan-400/30 bg-gray-950/92 p-4 text-white shadow-2xl shadow-cyan-950/40 backdrop-blur-xl dark:border-red-500/35 dark:shadow-red-950/40">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300 dark:text-red-300">Ask the page</p>
          <h2 className="text-lg font-bold">Page Control Chat</h2>
        </div>
        <button
          type="button"
          onClick={() => closePanel('hide_button')}
          data-analytics-id="ask-page-close"
          className="rounded-md border border-white/10 px-2 py-1 text-xs font-semibold text-gray-300 transition-colors hover:border-cyan-300 hover:text-cyan-200 dark:hover:border-red-300 dark:hover:text-red-200"
          aria-label="Hide Ask The Page"
        >
          Hide
        </button>
      </div>
      <div className="mb-3 max-h-36 space-y-2 overflow-y-auto pr-1" data-private="true">
        {messages.slice(-4).map((message, index) => (
          <p key={`${message.role}-${index}`} className={`rounded-md px-3 py-2 text-sm ${message.role === 'assistant' ? 'bg-white/5 text-gray-300' : 'bg-cyan-400/15 text-cyan-100 dark:bg-red-500/15 dark:text-red-100'}`}>
            {message.content}
          </p>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {quickActions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => runQuickAction(action)}
            className="rounded border border-white/10 px-2.5 py-1.5 text-xs text-gray-300 transition-colors hover:border-cyan-300 hover:text-cyan-200 dark:hover:border-red-300 dark:hover:text-red-200"
          >
            {action.label}
          </button>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask anything about this page..."
          data-private="true"
          data-block-replay="true"
          className="ph-no-capture min-w-0 flex-1 rounded-md border border-white/10 bg-black/45 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-cyan-300 dark:focus:border-red-300"
        />
        <button
          type="submit"
          disabled={isSending}
          className="rounded-md bg-cyan-400 px-3 py-2 text-sm font-bold text-black transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400 dark:bg-red-500 dark:text-white dark:hover:bg-red-400"
        >
          Send
        </button>
      </form>
    </section>
  );
};

export default AskThePage;
