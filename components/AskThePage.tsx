import React, { FormEvent, useMemo, useState } from 'react';
import { SECTION_IDS } from '../constants';
import { eventHighlights, projectHighlights } from '../portfolioData';
import { EffectId, NumericEffectId, TextEffectMode, useEffects } from '../contexts/PhysicsContext';
import { useTheme } from '../contexts/ThemeContext';
import { track } from '../lib/analytics';

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
};

const numericParams: Record<NumericEffectId, Set<string>> = {
  smash: new Set(['intensity', 'radius']),
  gravity: new Set(['strength', 'radius']),
  fluid: new Set(['speed', 'intensity']),
  pretext: new Set(['intensity']),
};

const effectIds = new Set<EffectId>(['smash', 'gravity', 'fluid', 'pretext', 'world']);
const sectionIds = new Set(Object.values(SECTION_IDS));
const eventIds = new Set(eventHighlights.map((event) => event.id));

const parseAgentResponse = (value: unknown): AgentResponse | null => {
  if (!value || typeof value !== 'object') return null;
  const response = value as Partial<AgentResponse>;
  if (typeof response.reply !== 'string') return null;
  return {
    reply: response.reply,
    commands: Array.isArray(response.commands) ? response.commands : [],
  };
};

const localAgent = (message: string): AgentResponse => {
  const text = message.toLowerCase();
  const commands: PageCommand[] = [];

  if (text.includes('fluid')) {
    commands.push({ type: 'setEffectEnabled', effect: 'fluid', enabled: !text.includes('disable') && !text.includes('off') });
    if (text.includes('faster') || text.includes('speed')) commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'speed', value: 1.8 });
  }
  if (text.includes('gravity')) commands.push({ type: 'setEffectEnabled', effect: 'gravity', enabled: !text.includes('disable') && !text.includes('off') });
  if (text.includes('smash')) commands.push({ type: 'setEffectEnabled', effect: 'smash', enabled: !text.includes('disable') && !text.includes('off') });
  if (text.includes('cyber')) commands.push({ type: 'switchProfile', profile: 'cybersecurity' });
  if (text.includes('software')) commands.push({ type: 'switchProfile', profile: 'software' });
  if (text.includes('world') || text.includes('3d')) commands.push({ type: 'openWorld' });
  if (text.includes('event')) commands.push({ type: 'focusSection', sectionId: SECTION_IDS.EVENTS });
  if (text.includes('project')) commands.push({ type: 'focusSection', sectionId: SECTION_IDS.PROJECTS });
  if (text.includes('restore') || text.includes('reset')) commands.push({ type: 'restoreText' });

  return {
    reply: commands.length
      ? 'I adjusted the page with a local command fallback while the live model is unavailable.'
      : 'I can adjust effects, switch profiles, open the world, or focus project and event sections.',
    commands,
  };
};

const AskThePage: React.FC = () => {
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

  const pageState = useMemo(() => ({
    profile: theme === 'dark' ? 'cybersecurity' : 'software',
    effects: effects.settings,
    sections: Object.values(SECTION_IDS),
    projects: projectHighlights.map(({ id, title, tags }) => ({ id, title, tags })),
    events: eventHighlights.map(({ id, title, tags }) => ({ id, title, tags })),
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
      document.getElementById(`event-${command.eventId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (command.type === 'openWorld') {
      effects.openWorld();
      return;
    }

    if (command.type === 'closeWorld') {
      effects.closeWorld();
      return;
    }

    if (command.type === 'restoreText') {
      effects.restoreAll();
      return;
    }

    if (command.type === 'startNpcDialogue') {
      effects.openWorld();
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

    let response: AgentResponse | null = null;
    try {
      const apiResponse = await fetch('/api/page-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, pageState }),
      });
      if (apiResponse.ok) {
        response = parseAgentResponse(await apiResponse.json());
      }
    } catch {
      response = null;
    }

    const agent = response ?? localAgent(trimmed);
    agent.commands?.forEach(applyCommand);
    setMessages((current) => [...current, { role: 'assistant', content: agent.reply }]);
    setIsSending(false);
    track('chatbot_command_submitted', { used_model: String(Boolean(agent.modelUsed)), command_count: String(agent.commands?.length ?? 0) });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitMessage(input);
  };

  const quickActions = [
    'Increase fluid speed',
    'Enable gravity',
    'Disable smash',
    'Open 3D world',
    'Show events',
  ];

  return (
    <section className="ask-page fixed bottom-5 left-5 z-[70] w-[min(360px,calc(100vw-1.5rem))] rounded-lg border border-cyan-400/30 bg-gray-950/92 p-4 text-white shadow-2xl shadow-cyan-950/40 backdrop-blur-xl dark:border-red-500/35 dark:shadow-red-950/40">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300 dark:text-red-300">Ask the page</p>
        <h2 className="text-lg font-bold">Page Control Chat</h2>
      </div>
      <div className="mb-3 max-h-36 space-y-2 overflow-y-auto pr-1">
        {messages.slice(-4).map((message, index) => (
          <p key={`${message.role}-${index}`} className={`rounded-md px-3 py-2 text-sm ${message.role === 'assistant' ? 'bg-white/5 text-gray-300' : 'bg-cyan-400/15 text-cyan-100 dark:bg-red-500/15 dark:text-red-100'}`}>
            {message.content}
          </p>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {quickActions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => submitMessage(action)}
            className="rounded border border-white/10 px-2.5 py-1.5 text-xs text-gray-300 transition-colors hover:border-cyan-300 hover:text-cyan-200 dark:hover:border-red-300 dark:hover:text-red-200"
          >
            {action}
          </button>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask anything about this page..."
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/45 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-cyan-300 dark:focus:border-red-300"
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
