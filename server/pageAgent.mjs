import { GoogleGenAI } from '@google/genai';
import { emitServerLog } from './posthogTelemetry.mjs';

export const DEFAULT_GEMINI_MODEL = 'gemma-4-26b-a4b-it';

const effectIds = new Set(['smash', 'gravity', 'fluid', 'pretext']);
const numericParams = {
  smash: new Set(['intensity', 'radius']), gravity: new Set(['strength', 'radius']),
  fluid: new Set(['speed', 'intensity', 'opacity', 'splatRadius', 'curl']), pretext: new Set(['intensity']),
};
const numericRanges = {
  smash: { intensity: [0, 100], radius: [20, 70] }, gravity: { strength: [0, 100], radius: [20, 75] },
  fluid: { speed: [0.2, 2.4], intensity: [0, 100], opacity: [0, 80], splatRadius: [10, 85], curl: [0, 90] },
  pretext: { intensity: [0, 100] },
};
const sectionIds = new Set(['home', 'work', 'domains', 'experience', 'proof', 'methods', 'resumes', 'share', 'contact']);

const getGeminiModel = () => process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
const getGeminiApiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

const extractJson = (text) => {
  const cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    try { return match ? JSON.parse(match[0]) : null; } catch { return null; }
  }
};

const sanitizeCommands = (commands, eventIds = new Set()) => {
  if (!Array.isArray(commands)) return [];
  const sanitized = [];
  for (const command of commands.slice(0, 6)) {
    if (!command || typeof command !== 'object' || typeof command.type !== 'string') continue;
    if (command.type === 'setEffectEnabled' && effectIds.has(command.effect) && typeof command.enabled === 'boolean') sanitized.push({ type: command.type, effect: command.effect, enabled: command.enabled });
    if (command.type === 'setEffectParam' && numericParams[command.effect]?.has(command.param) && Number.isFinite(command.value)) {
      const [min, max] = numericRanges[command.effect]?.[command.param] || [-Infinity, Infinity];
      sanitized.push({ type: command.type, effect: command.effect, param: command.param, value: Math.min(max, Math.max(min, Number(command.value))) });
    }
    if (command.type === 'focusSection' && sectionIds.has(command.sectionId)) sanitized.push({ type: command.type, sectionId: command.sectionId });
    if (command.type === 'focusEvent' && eventIds.has(command.eventId)) sanitized.push({ type: command.type, eventId: command.eventId });
    if (['openWorld', 'restoreText'].includes(command.type)) sanitized.push({ type: command.type });
  }
  return sanitized;
};

const sanitizeReferences = (references, allowedLinks) => {
  if (!Array.isArray(references)) return [];
  return references.slice(0, 5).flatMap((reference) => {
    if (!reference || typeof reference !== 'object' || typeof reference.label !== 'string' || typeof reference.href !== 'string') return [];
    if (!allowedLinks.has(reference.href)) return [];
    return [{ label: reference.label.slice(0, 80), href: reference.href }];
  });
};

const localAgent = (message, reason = 'model_unavailable') => {
  const text = String(message || '').toLowerCase();
  const commands = [];
  let reply = 'I could not find that in Rahul’s portfolio record. Ask about optimization, 3D computer vision, security, a résumé, or Explore World.';
  let references = [];
  if (text.includes('abbott') || text.includes('apc') || text.includes('changeover') || text.includes('manufacturing internship')) {
    reply = 'At Abbott, Rahul built a SimPy and CP-SAT hybrid flow-shop digital twin, researched robust optimization, and engineered a 15-stage changeover-data pipeline that processed five years of unseen, unclean data without errors. He also productionized and operated an APC simulator built by another team for live internal manufacturing and engineer-training use through Docker and Azure App Service, and delivered practical AI upskilling to the regional engineering workforce.';
    references = [{ label: 'Hybrid Flow Shop Digital Twin Optimizer', href: '#project-hybrid-flow-shop-digital-twin' }, { label: 'Manufacturing Changeover Data Pipeline', href: '#project-changeover-data-quality-pipeline' }, { label: 'APC Simulator Cloud Operations', href: '#project-azure-apc-web-simulator' }];
    commands.push({ type: 'focusSection', sectionId: 'work' });
  } else if (text.includes('optim') || text.includes('scheduling') || text.includes('operations research')) {
    reply = 'Rahul’s operations-research work connects CP-SAT and hybrid flow-shop scheduling to a SimPy digital twin, robust-optimization research, graph optimization, network flow, simulation, objectives, and constraints.';
    references = [{ label: 'Hybrid Flow Shop Digital Twin Optimizer', href: '#project-hybrid-flow-shop-digital-twin' }, { label: 'Operations research capability map', href: '#domains' }];
    commands.push({ type: 'focusSection', sectionId: 'work' });
  } else if (text.includes('3d computer vision') || text.includes('3d cv') || text.includes('epipolar') || text.includes('spatial')) {
    reply = 'Rahul was the top student in NUS CS4277 3D Computer Vision. The portfolio records projective geometry, camera models, epipolar geometry, absolute pose, structure from motion, bundle adjustment, and two-view and multi-view stereo.';
    references = [{ label: '3D perception capability map', href: '#domains' }, { label: 'NUS distinction and proof', href: '#proof' }];
    commands.push({ type: 'focusSection', sectionId: 'domains' });
  } else if (text.includes('resume') || text.includes('résumé') || text.includes('cv')) {
    reply = 'Use the role-specific résumé when the vacancy is clear; use the two-page General / Master CV for broad or multidisciplinary applications. Seven PDF and DOCX variants are available.';
    references = [{ label: 'Compare all seven résumés', href: '#resumes' }, { label: 'Download the General / Master CV', href: '/resume/generated/rahul-mitra-general-2026-08.pdf' }];
    commands.push({ type: 'focusSection', sectionId: 'resumes' });
  } else if (text.includes('security') || text.includes('cyber') || text.includes('bug bounty')) {
    reply = 'Rahul’s security record covers responsible bug-bounty research, web-application testing, network inspection, secure architecture, and bespoke vulnerability tooling. Sensitive disclosure details are intentionally omitted.';
    references = [{ label: 'Arcane security tooling', href: '#project-arcane' }, { label: 'Security experience and proof', href: '#proof' }];
    commands.push({ type: 'focusSection', sectionId: 'proof' });
  } else if (text.includes('world') || text.includes('map')) {
    reply = 'Explore World marks the shared optical test bench as this site’s enhancement target. Its semantic anchor is available now; the evidence document remains the shipped experience.';
    references = [{ label: 'Explore World', href: '#world' }];
    commands.push({ type: 'openWorld' });
  }
  const enabled = !(text.includes('disable') || text.includes('off'));
  if (text.includes('fluid')) commands.push({ type: 'setEffectEnabled', effect: 'fluid', enabled });
  if (text.includes('gravity')) commands.push({ type: 'setEffectEnabled', effect: 'gravity', enabled });
  if (text.includes('smash')) commands.push({ type: 'setEffectEnabled', effect: 'smash', enabled });
  if (text.includes('restore') || text.includes('reset')) commands.push({ type: 'restoreText' });
  return { reply, references, commands, modelUsed: false, reason };
};

const buildPrompt = ({ message, pageState }) => `
You are the private assistant for Rahul Mitra's professional portfolio.
Answer only from CURRENT PAGE STATE. Never infer credentials, metrics, professional robotics/SLAM experience, Gaussian-splatting research, or project outcomes not explicitly present. If evidence is absent, say so plainly.
Return strict JSON only:
{"reply":"concise grounded answer","references":[{"label":"useful label","href":"exact allowlisted link"}],"commands":[]}

References must use exact values from allowedLinks. Prefer relevant section/project/resume links and return at most five.
Allowed commands:
- {"type":"setEffectEnabled","effect":"smash|gravity|fluid|pretext","enabled":true|false}
- {"type":"setEffectParam","effect":"smash|gravity|fluid|pretext","param":"intensity|radius|strength|speed|opacity|splatRadius|curl","value":number}
- {"type":"focusSection","sectionId":"home|work|domains|experience|proof|methods|resumes|share|contact"}
- {"type":"focusEvent","eventId":"an event id from page state"}
- {"type":"openWorld"} (navigate to the #world optical-test-bench anchor) or {"type":"restoreText"}
Never return JavaScript, CSS, selectors, unlisted URLs, or arbitrary commands.

CURRENT PAGE STATE:
${JSON.stringify(pageState).slice(0, 20000)}

USER MESSAGE:
${message}
`;

const logResult = (startedAt, status, payload, attributes = {}) => emitServerLog(status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', 'page_agent_request_completed', {
  route: '/api/page-agent', status, duration_ms: Date.now() - startedAt,
  command_count: Array.isArray(payload?.commands) ? payload.commands.length : 0,
  model_used: payload?.modelUsed === true, fallback_reason: payload?.reason, model: payload?.model, ...attributes,
});

export const createPageAgentResponse = async (body) => {
  const startedAt = Date.now();
  const message = typeof body?.message === 'string' ? body.message.slice(0, 1000) : '';
  const pageState = body?.pageState && typeof body.pageState === 'object' ? body.pageState : {};
  const allowedLinks = new Set(Array.isArray(pageState.allowedLinks) ? pageState.allowedLinks.filter((link) => typeof link === 'string').slice(0, 500) : []);
  const eventIds = new Set(Array.isArray(pageState.events) ? pageState.events.flatMap((event) => [event?.id, ...(Array.isArray(event?.aliases) ? event.aliases : [])]).filter(Boolean) : []);
  if (!message.trim()) {
    const result = { status: 400, payload: { error: 'message is required' } };
    logResult(startedAt, result.status, result.payload, { error_type: 'validation_error' });
    return result;
  }
  try {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      const payload = localAgent(message, 'missing_api_key');
      payload.references = sanitizeReferences(payload.references, allowedLinks);
      payload.commands = sanitizeCommands(payload.commands, eventIds);
      logResult(startedAt, 200, payload);
      return { status: 200, payload };
    }
    const model = getGeminiModel();
    const ai = new GoogleGenAI({ apiKey });
    let timeoutId;
    const generation = await Promise.race([
      ai.models.generateContent({
        model, contents: buildPrompt({ message, pageState }),
        config: { temperature: 0.15, responseMimeType: 'application/json' },
      }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('model_timeout')), 11_000);
      }),
    ]).finally(() => clearTimeout(timeoutId));
    const parsed = extractJson(generation.text);
    const payload = {
      reply: typeof parsed?.reply === 'string' ? parsed.reply.slice(0, 700) : 'I could not find a grounded answer in the portfolio record.',
      references: sanitizeReferences(parsed?.references, allowedLinks),
      commands: sanitizeCommands(parsed?.commands, eventIds), modelUsed: true, model,
    };
    logResult(startedAt, 200, payload);
    return { status: 200, payload };
  } catch {
    const payload = localAgent(message, 'model_error');
    payload.references = sanitizeReferences(payload.references, allowedLinks);
    payload.commands = sanitizeCommands(payload.commands, eventIds);
    logResult(startedAt, 200, payload, { error_type: 'model_error' });
    return { status: 200, payload };
  }
};
