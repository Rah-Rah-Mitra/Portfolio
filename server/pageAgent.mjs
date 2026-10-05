import { GoogleGenAI } from '@google/genai';
import { emitServerLog } from './posthogTelemetry.mjs';

export const DEFAULT_GEMINI_MODEL = 'gemma-4-26b-a4b-it';

const labModes = new Set(['intrinsics', 'extrinsics', 'optics', 'stereo']);
const canonicalProjectIds = new Set([
  'swarmline', 'on-the-spectrum', 'geometry', 'information-lab', 'arcane', 'hailo-training', 'hybrid-flow-shop-digital-twin',
  'azure-apc-web-simulator', 'changeover-data-quality-pipeline', 'project-utopia', 'volt-pulse-sg', 'smart-exam',
  'waaah-comics', 'ethos-lens', 'agewelllah-ai', 'maritime-deficiency-severity', 'churp', 'kaogenie', 'asyncddgs',
  'portfolio-repo', 'github-profile-repo', 'kalidokit-fork', 'tp-java', 'ip-java', 'crawl4ai-deepseek-example',
  'ie2110-grp-13', 'fine-tuning-llms-cybersecurity', 'references', 'eg1311-project',
]);
const canonicalExperienceIds = new Set(['career-stmicro-or', 'career-amazon-vision', 'career-abbott-contract', 'career-abbott-intern', 'abbott-internship', 'career-pa-churp', 'career-ntuc-active-ageing', 'nus-education', 'cyber-achievement-3', 'career-yeswehack-independent-researcher', 'career-singapore-navy', 'education-asrjc-stem']);
const canonicalChapterIds = new Set(['home', 'work', 'experience', 'all-work', 'technical-lab', 'domains', 'proof', 'resumes', 'contact']);
const canonicalDesktopAppIds = new Set(['home', 'selected-work', 'experience', 'project-archive', 'systems-lab', 'camera-lab', 'world-3d', 'capabilities', 'proof-vault', 'resumes-contact', 'resume-builder']);

const getGeminiModel = () => process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
const getGeminiApiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

const extractJson = (text) => {
  const cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    try { return match ? JSON.parse(match[0]) : null; } catch { return null; }
  }
};

export const sanitizeCommands = (commands, pageState = {}) => {
  if (!Array.isArray(commands)) return [];
  const projectIds = new Set(Array.isArray(pageState.projects) ? pageState.projects.map((project) => project?.id).filter((id) => canonicalProjectIds.has(id)) : []);
  const experienceIds = new Set(Array.isArray(pageState.experience) ? pageState.experience.map((record) => record?.id).filter((id) => canonicalExperienceIds.has(id)) : []);
  const chapterIds = new Set(Array.isArray(pageState.chapters) ? pageState.chapters.filter((id) => typeof id === 'string' && canonicalChapterIds.has(id)) : []);
  const desktopAppIds = new Set(Array.isArray(pageState.apps) ? pageState.apps.filter((id) => typeof id === 'string' && canonicalDesktopAppIds.has(id)) : []);
  const sanitized = [];
  for (const command of commands.slice(0, 6)) {
    if (!command || typeof command !== 'object' || typeof command.type !== 'string') continue;
    if (command.type === 'focusExperience' && (command.experienceId === undefined || experienceIds.has(command.experienceId))) sanitized.push(command.experienceId ? { type: command.type, experienceId: command.experienceId } : { type: command.type });
    if (command.type === 'focusProject' && projectIds.has(command.projectId)) sanitized.push({ type: command.type, projectId: command.projectId });
    if (command.type === 'openTechnicalLab' && (command.mode === undefined || labModes.has(command.mode))) sanitized.push(command.mode ? { type: command.type, mode: command.mode } : { type: command.type });
    if (command.type === 'focusGuideChapter' && chapterIds.has(command.chapterId)) sanitized.push({ type: command.type, chapterId: command.chapterId });
    if (command.type === 'openDesktopApp' && desktopAppIds.has(command.appId)) sanitized.push({ type: command.type, appId: command.appId });
    if (command.type === 'minimizeDesktopApp' && desktopAppIds.has(command.appId)) sanitized.push({ type: command.type, appId: command.appId });
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

/**
 * What the interactive parts of the site are, in the server's own words. The page
 * state is client-supplied and capped at PAGE_STATE_CHARS; these lines are
 * neither, so the model can describe the labs without the claim riding on what a
 * browser sent. components/AskThePage.tsx words its local fallback the same way.
 */
export const SITE_EXHIBITS = [
  'Camera Lab (#technical-lab, app camera-lab, command openTechnicalLab): one synthetic, deterministic camera scene with four models: intrinsics (the K matrix and lens distortion), extrinsics (pose and projection), thin-lens optics (depth of field), and rectified stereo depth, plus a Zhang calibration (FIG. 06b) of the configured camera from six seeded synthetic views: one homography per view by normalised DLT, K in closed form, then Levenberg–Marquardt refinement with ±1σ, on synthetic detections with no real camera or image data. A portfolio instrument backed by the CS4277 top-student record, separate from professional work.',
  'Systems Lab (#systems-lab, app systems-lab): an illustrative figure of the Abbott hybrid flow-shop schedule (operating details abstracted), the 15-stage changeover pipeline figure, the Mechanism Bench of six planar mechanisms, an interactive permutation flow-shop teaching model that compares the exact optimum with Johnson’s rule and NEH on synthetic, seeded jobs (not Abbott data), and a contained matter.js drop test.',
  'FX panel: Pause all motion, sound cues, and two desk backgrounds that stay off until switched on: an N-body gravity field computed with a fast multipole method, and a WebGL2 fluid. There is no Quick Scan switch any more: every window is plain, readable HTML, and Pause all motion halts the site’s animation. An old ?mode=scan link still opens the page without the desk backgrounds or sound cues, and without ?app= deep links.',
  'Estate (#world, app world-3d): Sample Town N5, a generated sample HDB neighbourhood (not a real town or HDB’s own plans) built as IFC4X3 by Rahul’s Bonsai-Estate pipeline with IfcOpenShell, Bonsai and Blender: 12 residential blocks with 1,206 flats, a multi-storey car park and a hawker centre. Visitors orbit it or fly to a building, and detail loads as they get closer. Desktop only; it shows a still render under Save-Data, reduced motion or ?mode=scan until the visitor asks.',
  'Surfaces: page state surface field-workbench is the desktop (881px and wider), where every window opens. field-index is the phone registry, which does not show the Camera Lab, the Systems Lab or the Estate: on field-index say they are desktop windows (881px and wider) instead of offering to open them.',
];

export const localAgent = (message, reason = 'model_unavailable') => {
  const text = String(message || '').toLowerCase();
  const commands = [];
  let reply = 'The offline index has no ready answer for that, which does not mean the record lacks it: Rahul’s roles are in Experience, and his email and profiles are in Contact. Try asking about optimization, 3D computer vision, security, a résumé, or the Camera and Systems Labs.';
  let references = [{ label: 'Read the experience timeline', href: '#experience' }, { label: 'Contact', href: '#contact' }];
  if (text.includes('camera lab') || text.includes('technical lab') || text.includes('slam') || text.includes('calibrat') || text.includes('zhang')) {
    const mode = [...labModes].find((candidate) => text.includes(candidate));
    reply = 'The Camera Lab is one synthetic, deterministic camera scene with four models: intrinsics (the K matrix and lens distortion), extrinsics (pose and projection), thin-lens optics (depth of field), and rectified stereo depth. It is a portfolio instrument backed by Rahul’s CS4277 top-student record, kept separate from professional work; the SLAM/RADIO benchmark stays unpublished until its reproducibility and evidence gates pass. It also runs a seeded Zhang calibration of that camera (homographies, closed-form K, Levenberg–Marquardt) on synthetic detections. It is a desktop window (881px and wider).';
    references = [{ label: 'Open the Camera Lab', href: '#technical-lab' }];
    commands.push(mode ? { type: 'openTechnicalLab', mode } : { type: 'openTechnicalLab' });
  } else if (text.includes('systems lab') || text.includes('mechanism bench') || text.includes('drop test') || text.includes('teaching model') || text.includes('permutation flow') || text.includes('johnson') || /\bneh\b/.test(text)) {
    reply = 'The Systems Lab holds deterministic exhibits: an illustrative figure of the Abbott hybrid flow-shop schedule (operating details abstracted), the 15-stage changeover pipeline, the Mechanism Bench of six planar mechanisms, an interactive permutation flow-shop teaching model that compares the exact optimum with Johnson’s rule and NEH on synthetic, seeded jobs (not Abbott data), and a contained matter.js drop test. It is a desktop window (881px and wider).';
    references = [{ label: 'Open the Systems Lab', href: '#systems-lab' }];
    commands.push({ type: 'openDesktopApp', appId: 'systems-lab' });
  } else if (text.includes('asyncddgs')) {
    reply = 'AsyncDDGS is Rahul’s maintained asyncio-first DuckDuckGo client, built with aiohttp and released through a tested PyPI workflow.';
    references = [{ label: 'Inspect AsyncDDGS', href: '#project-asyncddgs' }];
    commands.push({ type: 'focusProject', projectId: 'asyncddgs' });
  } else if (text.includes('swarm') || text.includes('drone') || text.includes('defence tech') || text.includes('defense tech')) {
    reply = 'Swarmline is decentralised drone-swarm coordination, demonstrated in simulation, that took the five-person team Rahul led to the finals of the Singapore Defense Tech Hackathon 2026 (1,300+ applicants). With the ground link jammed, its 30 simulated drones confirmed all 8 walking targets in every run, against 2.1 on average for an operator-in-the-loop baseline.';
    references = [{ label: 'Inspect Swarmline', href: '#project-swarmline' }];
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
    commands.push({ type: 'focusGuideChapter', chapterId: 'contact' });
  } else if (text.includes('experience') || text.includes('timeline')) {
    reply = 'The experience timeline keeps Rahul’s roles, responsibilities, and outcomes in conventional semantic HTML.';
    references = [{ label: 'Read the experience timeline', href: '#experience' }];
    commands.push({ type: 'focusExperience' });
  } else if (text.includes('guide') || text.includes('chapter')) {
    reply = 'Each chapter of the record is a window on the workbench: Selected Work, Experience, the project archive, the labs, Capabilities, Proof, and Résumés. The rail opens any of them, and on a phone they become one searchable registry.';
    references = [{ label: 'Selected work', href: '#work' }];
    commands.push({ type: 'focusGuideChapter', chapterId: 'work' });
  } else if (text.includes('abbott') || text.includes('apc') || text.includes('changeover') || text.includes('manufacturing internship')) {
    reply = 'At Abbott, Rahul built a SimPy and CP-SAT hybrid flow-shop digital twin, researched robust optimization, and engineered a 15-stage changeover-data pipeline that processed five years of unseen, unclean data with zero execution failures. He also productionized and operated an APC simulator built by another team for live internal manufacturing and engineer-training use through Docker and Azure App Service, and trained regional engineering teams across Asia and Europe on repeatable AI workflows.';
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
    reply = 'Use the role-specific résumé when the vacancy is clear; use the one-page Highlights résumé for preference forms and broad applications, or the two-page General / Master CV for full detail. Eight PDF and DOCX variants are available.';
    references = [{ label: 'Compare all eight résumés', href: '#resumes' }, { label: 'Download the General / Master CV', href: '/resume/generated/rahul-mitra-general-2026-11.pdf' }];
    commands.push({ type: 'focusGuideChapter', chapterId: 'resumes' });
  } else if (text.includes('security') || text.includes('cyber') || text.includes('bug bounty') || text.includes('adversarial')) {
    reply = 'Rahul’s security record covers responsible bug-bounty research, web-application testing, network inspection, secure architecture, and bespoke vulnerability tooling. Sensitive disclosure details are intentionally omitted.';
    references = [{ label: 'Arcane security tooling', href: '#project-arcane' }, { label: 'Security experience and proof', href: '#proof' }];
    commands.push({ type: 'focusGuideChapter', chapterId: 'proof' });
  } else if (/\bfx\b/.test(text) || text.includes('quick scan') || text.includes('pause') || text.includes('reduce motion') || text.includes('reduced motion') || text.includes('n-body') || text.includes('nbody') || text.includes('gravity field') || text.includes('fluid') || text.includes('backdrop') || text.includes('desk background') || text.includes('sound')) {
    // No command: nothing opens the FX panel by id, and there is no switch left
    // to flip. Quick Scan questions land here because the honest answer is what
    // replaced it, and what an old ?mode=scan link still does
    // (lib/experienceMode.ts keeps it on purpose).
    reply = 'The FX panel holds Pause all motion, sound cues, and two desk backgrounds that stay off until switched on: an N-body gravity field computed with a fast multipole method, and a WebGL2 fluid. There is no Quick Scan switch any more: every window is plain, readable HTML, and Pause all motion halts the site’s animation. An old ?mode=scan link still opens the page without the desk backgrounds or sound cues, and without ?app= deep links.';
  } else if (text.includes('world') || text.includes('map') || text.includes('estate') || text.includes('hdb') || text.includes('bonsai') || text.includes('hawker') || text.includes('car park') || text.includes('mscp') || /\bblk\b/.test(text)) {
    reply = 'The Estate window shows Sample Town N5, a generated sample HDB neighbourhood (not a real town or HDB’s own plans) built as IFC4X3 by Rahul’s Bonsai-Estate pipeline with IfcOpenShell, Bonsai and Blender: 12 residential blocks with 1,206 flats, a multi-storey car park and a hawker centre. Orbit it or fly to a building; detail loads as you get closer. It is a desktop window (881px and wider).';
    references = [{ label: 'Explore the estate', href: '#world' }];
    commands.push({ type: 'openDesktopApp', appId: 'world-3d' });
  } else if (text.includes('project') || text.includes('work')) {
    reply = 'The selected work is organized as evidence-led briefs covering context, contribution, engineering approach, and inspectable proof.';
    references = [{ label: 'Browse selected engineering work', href: '#work' }];
    commands.push({ type: 'focusGuideChapter', chapterId: 'work' });
  }
  return { reply, references, commands, modelUsed: false, reason };
};

// How much of the page state reaches the model. lib/askPageState.ts orders the
// state so that what matters most comes first; 28,000 holds the competency
// tools and every project with its spotlight (tests/page-agent-server.test.ts
// fails when one no longer fits). The field notes and résumés after them are cut.
export const PAGE_STATE_CHARS = 28_000;

const buildPrompt = ({ message, pageState }) => `
You are the private assistant for Rahul Mitra's professional portfolio.
Answer only from SITE EXHIBITS and CURRENT PAGE STATE. Never infer credentials, metrics, professional robotics/SLAM experience, Gaussian-splatting research, or project outcomes not explicitly present. If evidence is absent, say so plainly.
Return strict JSON only:
{"reply":"concise grounded answer","references":[{"label":"useful label","href":"exact allowlisted link"}],"commands":[]}

References must use exact values from allowedLinks. Prefer relevant section/project/resume links and return at most five.
Allowed commands:
- {"type":"focusExperience","experienceId":"optional experience id from page state"}
- {"type":"focusProject","projectId":"a project id from page state"}
- {"type":"openTechnicalLab","mode":"optional intrinsics|extrinsics|optics|stereo"}
- {"type":"focusGuideChapter","chapterId":"a chapter id from page state"}
- {"type":"openDesktopApp","appId":"a workstation app id from page state"}
- {"type":"minimizeDesktopApp","appId":"a workstation app id from page state"}
Never return JavaScript, CSS, selectors, unlisted URLs, or arbitrary commands.

SITE EXHIBITS (describe the site's interactive parts only this way):
${SITE_EXHIBITS.map((line) => `- ${line}`).join('\n')}

CURRENT PAGE STATE:
${JSON.stringify(pageState).slice(0, PAGE_STATE_CHARS)}

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
