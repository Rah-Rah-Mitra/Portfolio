import { GoogleGenAI } from '@google/genai';
import { emitServerLog } from './posthogTelemetry.mjs';

export const DEFAULT_GEMINI_MODEL = 'gemma-4-26b-a4b-it';

const labModes = new Set(['intrinsics', 'extrinsics', 'optics', 'stereo']);
const sceneIds = new Set(['calibration', 'systems-in-motion', 'spatial-systems', 'selected-work', 'camera-laboratory', 'departure']);

const getGeminiModel = () => process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
const getGeminiApiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

const extractJson = (text) => {
  const cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    try { return match ? JSON.parse(match[0]) : null; } catch { return null; }
  }
};

const sanitizeCommands = (commands, pageState = {}) => {
  if (!Array.isArray(commands)) return [];
  const projectIds = new Set(Array.isArray(pageState.projects) ? pageState.projects.map((project) => project?.id).filter(Boolean) : []);
  const experienceIds = new Set(Array.isArray(pageState.experience) ? pageState.experience.map((record) => record?.id).filter(Boolean) : []);
  const chapterIds = new Set(Array.isArray(pageState.chapters) ? pageState.chapters.filter((id) => typeof id === 'string') : []);
  const sanitized = [];
  for (const command of commands.slice(0, 6)) {
    if (!command || typeof command !== 'object' || typeof command.type !== 'string') continue;
    if (command.type === 'focusExperience' && (command.experienceId === undefined || experienceIds.has(command.experienceId))) sanitized.push(command.experienceId ? { type: command.type, experienceId: command.experienceId } : { type: command.type });
    if (command.type === 'focusProject' && projectIds.has(command.projectId)) sanitized.push({ type: command.type, projectId: command.projectId });
    if (command.type === 'openTechnicalLab' && (command.mode === undefined || labModes.has(command.mode))) sanitized.push(command.mode ? { type: command.type, mode: command.mode } : { type: command.type });
    if (command.type === 'focusGuideChapter' && chapterIds.has(command.chapterId)) sanitized.push({ type: command.type, chapterId: command.chapterId });
    if (command.type === 'enterExploreMode' && sceneIds.has(command.sceneId)) sanitized.push({ type: command.type, sceneId: command.sceneId });
    if (command.type === 'setQuickScan' && typeof command.enabled === 'boolean') sanitized.push({ type: command.type, enabled: command.enabled });
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
    commands.push({ type: 'focusProject', projectId: 'hybrid-flow-shop-digital-twin' });
  } else if (text.includes('optim') || text.includes('scheduling') || text.includes('operations research')) {
    reply = 'Rahul’s operations-research work connects CP-SAT and hybrid flow-shop scheduling to a SimPy digital twin, robust-optimization research, graph optimization, network flow, simulation, objectives, and constraints.';
    references = [{ label: 'Hybrid Flow Shop Digital Twin Optimizer', href: '#project-hybrid-flow-shop-digital-twin' }, { label: 'Operations research capability map', href: '#domains' }];
    commands.push({ type: 'focusProject', projectId: 'hybrid-flow-shop-digital-twin' });
  } else if (text.includes('3d computer vision') || text.includes('3d cv') || text.includes('epipolar') || text.includes('spatial')) {
    reply = 'Rahul was the top student in NUS CS4277 3D Computer Vision. The portfolio records projective geometry, camera models, epipolar geometry, absolute pose, structure from motion, bundle adjustment, and two-view and multi-view stereo.';
    references = [{ label: '3D perception capability map', href: '#domains' }, { label: 'NUS distinction and proof', href: '#proof' }];
    commands.push({ type: 'focusGuideChapter', chapterId: 'domains' });
  } else if (text.includes('resume') || text.includes('résumé') || text.includes('cv')) {
    reply = 'Use the role-specific résumé when the vacancy is clear; use the two-page General / Master CV for broad or multidisciplinary applications. Seven PDF and DOCX variants are available.';
    references = [{ label: 'Compare all seven résumés', href: '#resumes' }, { label: 'Download the General / Master CV', href: '/resume/generated/rahul-mitra-general-2026-08.pdf' }];
    commands.push({ type: 'focusGuideChapter', chapterId: 'resumes' });
  } else if (text.includes('security') || text.includes('cyber') || text.includes('bug bounty')) {
    reply = 'Rahul’s security record covers responsible bug-bounty research, web-application testing, network inspection, secure architecture, and bespoke vulnerability tooling. Sensitive disclosure details are intentionally omitted.';
    references = [{ label: 'Arcane security tooling', href: '#project-arcane' }, { label: 'Security experience and proof', href: '#proof' }];
    commands.push({ type: 'focusGuideChapter', chapterId: 'proof' });
  } else if (text.includes('world') || text.includes('map')) {
    reply = 'Explore World marks the shared optical test bench as this site’s enhancement target. Its semantic anchor is available now; the evidence document remains the shipped experience.';
    references = [{ label: 'Explore World', href: '#world' }];
    commands.push({ type: 'enterExploreMode', sceneId: 'camera-laboratory' });
  }
  return { reply, references, commands, modelUsed: false, reason };
};

const buildPrompt = ({ message, pageState }) => `
You are the private assistant for Rahul Mitra's professional portfolio.
Answer only from CURRENT PAGE STATE. Never infer credentials, metrics, professional robotics/SLAM experience, Gaussian-splatting research, or project outcomes not explicitly present. If evidence is absent, say so plainly.
Return strict JSON only:
{"reply":"concise grounded answer","references":[{"label":"useful label","href":"exact allowlisted link"}],"commands":[]}

References must use exact values from allowedLinks. Prefer relevant section/project/resume links and return at most five.
Allowed commands:
- {"type":"focusExperience","experienceId":"optional experience id from page state"}
- {"type":"focusProject","projectId":"a project id from page state"}
- {"type":"openTechnicalLab","mode":"optional intrinsics|extrinsics|optics|stereo"}
- {"type":"focusGuideChapter","chapterId":"a chapter id from page state"}
- {"type":"enterExploreMode","sceneId":"camera-laboratory"}
- {"type":"setQuickScan","enabled":true|false}
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
      payload.commands = sanitizeCommands(payload.commands, pageState);
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
      commands: sanitizeCommands(parsed?.commands, pageState), modelUsed: true, model,
    };
    logResult(startedAt, 200, payload);
    return { status: 200, payload };
  } catch {
    const payload = localAgent(message, 'model_error');
    payload.references = sanitizeReferences(payload.references, allowedLinks);
    payload.commands = sanitizeCommands(payload.commands, pageState);
    logResult(startedAt, 200, payload, { error_type: 'model_error' });
    return { status: 200, payload };
  }
};
