import { GoogleGenAI } from '@google/genai';

export const DEFAULT_GEMINI_MODEL = 'gemma-4-26b-a4b-it';

const effectIds = new Set(['smash', 'gravity', 'fluid', 'pretext', 'world']);
const numericParams = {
  smash: new Set(['intensity', 'radius']),
  gravity: new Set(['strength', 'radius']),
  fluid: new Set(['speed', 'intensity', 'opacity', 'splatRadius', 'curl']),
  pretext: new Set(['intensity']),
};
const numericRanges = {
  smash: { intensity: [0, 100], radius: [20, 240] },
  gravity: { strength: [0, 100], radius: [20, 180] },
  fluid: { speed: [0.2, 2.5], intensity: [0, 100], opacity: [10, 85], splatRadius: [12, 90], curl: [0, 80] },
  pretext: { intensity: [0, 100] },
};
const sectionIds = new Set(['home', 'projects', 'events', 'skills', 'contact']);
const eventIds = new Set([
  'smu-hack-for-cities-2026',
  'january-gauntlet-2026',
  'waaah-comics',
  'abbott-internship',
  'sparks-by-pa-churp',
  'nvidia-disaster-risk',
  'certification-trail',
  'software-achievement-6',
  'software-achievement-5',
  'software-achievement-4',
  'software-achievement-3',
  'software-achievement-2',
  'software-achievement-1',
  'cyber-achievement-3',
  'cyber-achievement-2',
  'cyber-achievement-1',
  'nus-education',
  'career-yeswehack-independent-researcher',
  'career-singapore-navy',
  'education-asrjc-stem',
  'cert-docker-absolute-beginner',
  'cert-reverse-engineering-windows',
  'cert-cnn-python',
  'cert-rnn-python',
  'cert-unity-csharp-games',
  'cert-excel-advanced',
  'cert-reinforcement-learning',
  'project-on-the-spectrum',
  'project-geometry',
  'project-information-lab',
  'project-arcane',
  'project-hailo-training',
  'project-project-utopia',
  'project-volt-pulse-sg',
  'project-waaah-comics',
  'project-smart-exam',
  'project-ethos-lens',
  'project-agewelllah-ai',
  'project-maritime-deficiency-severity',
  'project-churp',
  'project-kaogenie',
  'project-asyncddgs',
]);
const npcIds = new Set([
  'volt-pulse-guide',
  'waaah-comics-guide',
  'spectrum-guide',
  'arcane-guide',
  'utopia-guide',
  'churp-guide',
  'asyncddgs-guide',
  'geometry-guide',
  'agewell-guide',
]);

const getGeminiModel = () => process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

const getGeminiApiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

const extractJson = (text) => {
  const cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
};

const sanitizeCommands = (commands) => {
  if (!Array.isArray(commands)) return [];
  const sanitized = [];

  for (const command of commands.slice(0, 6)) {
    if (!command || typeof command !== 'object' || typeof command.type !== 'string') continue;

    if (command.type === 'setEffectEnabled' && effectIds.has(command.effect) && typeof command.enabled === 'boolean') {
      sanitized.push({ type: command.type, effect: command.effect, enabled: command.enabled });
    }

    if (
      command.type === 'setEffectParam' &&
      numericParams[command.effect]?.has(command.param) &&
      Number.isFinite(command.value)
    ) {
      const [min, max] = numericRanges[command.effect]?.[command.param] || [-Infinity, Infinity];
      const rawValue = command.effect === 'fluid' && command.param === 'opacity' && Number(command.value) > 0 && Number(command.value) <= 1
        ? Number(command.value) * 100
        : Number(command.value);
      sanitized.push({ type: command.type, effect: command.effect, param: command.param, value: Math.min(max, Math.max(min, rawValue)) });
    }

    if (command.type === 'switchProfile' && ['software', 'cybersecurity'].includes(command.profile)) {
      sanitized.push({ type: command.type, profile: command.profile });
    }

    if (command.type === 'focusSection' && sectionIds.has(command.sectionId)) {
      sanitized.push({ type: command.type, sectionId: command.sectionId });
    }

    if (command.type === 'focusEvent' && eventIds.has(command.eventId)) {
      sanitized.push({ type: command.type, eventId: command.eventId });
    }

    if (command.type === 'startNpcDialogue' && npcIds.has(command.npcId)) {
      sanitized.push({ type: command.type, npcId: command.npcId });
    }

    if (['openWorld', 'closeWorld', 'restoreText'].includes(command.type)) {
      sanitized.push({ type: command.type });
    }
  }

  return sanitized;
};

const localAgent = (message, reason = 'model_unavailable') => {
  const text = String(message || '').toLowerCase();
  const commands = [];
  const enabled = !(text.includes('disable') || text.includes('off'));

  const wantsFluid = text.includes('fluid') || text.includes('cfd') || (text.includes('background') && (text.includes('ripple') || text.includes('translucent') || text.includes('cursor')));
  if (wantsFluid) {
    commands.push({ type: 'setEffectEnabled', effect: 'fluid', enabled });
    if (text.includes('faster') || text.includes('speed')) {
      commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'speed', value: 1.8 });
    }
    if (text.includes('slower') || text.includes('calm')) {
      commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'speed', value: 0.72 });
    }
    if (text.includes('translucent') || text.includes('transparent') || text.includes('subtle')) {
      commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'opacity', value: 34 });
    }
    if (text.includes('opaque') || text.includes('brighter')) {
      commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'opacity', value: 68 });
    }
    if (text.includes('colorful') || text.includes('vivid') || text.includes('intense')) {
      commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'intensity', value: 82 });
    }
    if (text.includes('ripple') || text.includes('curl') || text.includes('swirl')) {
      commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'curl', value: 58 });
    }
    if (text.includes('wide') || text.includes('larger') || text.includes('bigger')) {
      commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'splatRadius', value: 64 });
    }
    if (text.includes('tight') || text.includes('smaller')) {
      commands.push({ type: 'setEffectParam', effect: 'fluid', param: 'splatRadius', value: 28 });
    }
  }
  if (text.includes('gravity')) commands.push({ type: 'setEffectEnabled', effect: 'gravity', enabled });
  if (text.includes('smash')) commands.push({ type: 'setEffectEnabled', effect: 'smash', enabled });
  if (text.includes('cyber')) commands.push({ type: 'switchProfile', profile: 'cybersecurity' });
  if (text.includes('software')) commands.push({ type: 'switchProfile', profile: 'software' });
  if (text.includes('world') || text.includes('3d')) commands.push({ type: 'openWorld' });
  if (text.includes('event') || text.includes('career') || text.includes('education') || text.includes('achievement') || text.includes('certification')) {
    commands.push({ type: 'focusSection', sectionId: 'events' });
  }
  if (text.includes('project')) commands.push({ type: 'focusSection', sectionId: 'projects' });
  if (text.includes('restore') || text.includes('reset')) commands.push({ type: 'restoreText' });

  return {
    reply: commands.length
      ? 'I adjusted the page with a local command fallback while the live model is unavailable.'
      : 'I can adjust effects, switch profiles, open the world, or focus project and event sections.',
    commands: sanitizeCommands(commands),
    modelUsed: false,
    reason,
  };
};

const buildPrompt = ({ message, pageState }) => `
You control Rahul Mitra's interactive portfolio page.
Return strict JSON only, with this shape:
{"reply":"short user-facing sentence","commands":[...]}

Allowed command types:
- {"type":"setEffectEnabled","effect":"smash|gravity|fluid|pretext|world","enabled":true|false}
- {"type":"setEffectParam","effect":"smash|gravity|fluid|pretext","param":"intensity|radius|strength|speed|opacity|splatRadius|curl","value":number}
- Numeric ranges: smash intensity 0-100 radius 20-240; gravity strength 0-100 radius 20-180; fluid speed 0.2-2.5 intensity 0-100 opacity 10-85 splatRadius 12-90 curl 0-80; pretext intensity 0-100.
- For fluid opacity, return a percentage value between 10 and 85, not a 0-1 decimal.
- {"type":"switchProfile","profile":"software|cybersecurity"}
- {"type":"focusSection","sectionId":"home|projects|events|skills|contact"}
- {"type":"focusEvent","eventId":"any visible Field Notes id, such as smu-hack-for-cities-2026, abbott-internship, nus-education, software-achievement-6, cyber-achievement-3, cert-docker-absolute-beginner"}
- {"type":"openWorld"}
- {"type":"closeWorld"}
- {"type":"startNpcDialogue","npcId":"volt-pulse-guide|waaah-comics-guide|spectrum-guide|arcane-guide|utopia-guide|churp-guide|asyncddgs-guide|geometry-guide|agewell-guide"}
- {"type":"restoreText"}

Never produce JavaScript, CSS, selectors, arbitrary URLs, or commands outside the allowlist.
If the user asks a portfolio question, answer briefly and optionally focus the relevant section, event, or NPC.

Current page state:
${JSON.stringify(pageState).slice(0, 9000)}

User message:
${message}
`;

export const createPageAgentResponse = async (body) => {
  let userMessage = '';

  try {
    const message = typeof body?.message === 'string' ? body.message.slice(0, 1000) : '';
    userMessage = message;
    if (!message.trim()) {
      return { status: 400, payload: { error: 'message is required' } };
    }

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return { status: 200, payload: localAgent(message, 'missing_api_key') };
    }

    const model = getGeminiModel();
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model,
      contents: buildPrompt({ message, pageState: body?.pageState ?? {} }),
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });

    const parsed = extractJson(result.text);
    const reply = typeof parsed?.reply === 'string'
      ? parsed.reply.slice(0, 360)
      : 'I can help tune this portfolio page.';

    return {
      status: 200,
      payload: {
        reply,
        commands: sanitizeCommands(parsed?.commands),
        modelUsed: true,
        model,
      },
    };
  } catch {
    return { status: 200, payload: localAgent(userMessage, 'model_error') };
  }
};
