import { afterEach, describe, expect, it, vi } from 'vitest';
import * as serverAgent from '../server/pageAgent.mjs';
import { localAgent as clientAgent, validatePageCommand } from '../components/AskThePage';
import { defaultSettings } from '../contexts/PhysicsContext';
import { buildPageState } from '../lib/askPageState';
import { experienceRecords } from '../portfolioData';

const trustedPageState = {
  allowedLinks: ['#technical-lab', '#experience', '#work', '#world', '#home'],
  projects: [{ id: 'churp' }, { id: 'asyncddgs' }],
  experience: [{ id: 'abbott-internship' }],
  chapters: ['home', 'work', 'experience', 'technical-lab'],
  apps: ['home', 'selected-work', 'experience', 'project-archive', 'camera-lab', 'world-3d'],
};

const completeTrustedState = {
  ...trustedPageState,
  projects: [{ id: 'asyncddgs' }, { id: 'hybrid-flow-shop-digital-twin' }, { id: 'swarmline' }],
  chapters: ['home', 'work', 'experience', 'technical-lab', 'domains', 'proof', 'resumes'],
};

describe('server page-agent command parity', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['open the technical lab in stereo mode', 'openTechnicalLab'],
    ['show the experience timeline', 'focusExperience'],
    ['focus the work guide chapter', 'focusGuideChapter'],
    ['show me Explore World', 'enterExploreMode'],
    ['use Quick Scan', 'setQuickScan'],
  ])('returns the %s fallback through the same validated command surface', async (message, type) => {
    vi.stubEnv('GEMINI_API_KEY', ''); vi.stubEnv('GOOGLE_API_KEY', '');
    const result = await serverAgent.createPageAgentResponse({ message, pageState: trustedPageState });
    expect(result.status).toBe(200);
    expect('commands' in result.payload).toBe(true);
    if (!('commands' in result.payload)) return;
    expect(result.payload.commands).toContainEqual(expect.objectContaining({ type }));
  });

  it('intersects caller page state with canonical portfolio IDs and modes', () => {
    expect(serverAgent.sanitizeCommands).toBeTypeOf('function');
    const commands = serverAgent.sanitizeCommands?.([
      { type: 'focusProject', projectId: 'churp' },
      { type: 'openDesktopApp', appId: 'camera-lab' },
      { type: 'minimizeDesktopApp', appId: 'world-3d' },
      { type: 'focusProject', projectId: 'attacker-project' },
      { type: 'openDesktopApp', appId: 'attacker-app' },
      { type: 'focusExperience', experienceId: 'attacker-role' },
    ], {
      projects: [{ id: 'attacker-project' }, { id: 'churp' }],
      experience: [{ id: 'attacker-role' }], chapters: ['attacker-chapter'], apps: ['camera-lab', 'world-3d', 'attacker-app'],
    });
    expect(commands).toEqual([
      { type: 'focusProject', projectId: 'churp' },
      { type: 'openDesktopApp', appId: 'camera-lab' },
      { type: 'minimizeDesktopApp', appId: 'world-3d' },
    ]);
  });

  it('lets the assistant open every experience record the site renders', () => {
    // The canonical list is written out by hand, and it drifted: both Abbott
    // records, People's Association and YesWeHack (merged under its achievement's
    // id) could not be opened. This fails the moment a role is added without it.
    // One command per call: the sanitizer keeps at most six.
    const experience = experienceRecords.map((record) => ({ id: record.id }));
    for (const { id } of experience) {
      const command = { type: 'focusExperience', experienceId: id };
      expect(serverAgent.sanitizeCommands([command], { experience }), id).toEqual([command]);
    }
  });

  it.each([
    ['open the technical lab in stereo mode', { type: 'openTechnicalLab', mode: 'stereo' }],
    ['show the SLAM calibration study', { type: 'openTechnicalLab' }],
    ['tell me about AsyncDDGS', { type: 'focusProject', projectId: 'asyncddgs' }],
    ['what did the drone swarm at the defense tech hackathon do?', { type: 'focusProject', projectId: 'swarmline' }],
    ['show the experience timeline', { type: 'focusExperience' }],
    ['what does the guide do?', { type: 'focusGuideChapter', chapterId: 'work' }],
    ['show the Abbott internship', { type: 'focusProject', projectId: 'hybrid-flow-shop-digital-twin' }],
    ['show scheduling optimization', { type: 'focusProject', projectId: 'hybrid-flow-shop-digital-twin' }],
    ['show 3D computer vision', { type: 'focusGuideChapter', chapterId: 'domains' }],
    ['which resume should I use?', { type: 'focusGuideChapter', chapterId: 'resumes' }],
    ['show adversarial security work', { type: 'focusGuideChapter', chapterId: 'proof' }],
    ['show me Explore World', { type: 'enterExploreMode', sceneId: 'camera-laboratory' }],
    ['use Quick Scan', { type: 'setQuickScan', enabled: true }],
    ['show generic project work', { type: 'focusGuideChapter', chapterId: 'work' }],
  ])('keeps client/server fallback parity for %s', (message, expected) => {
    const clientCommand = clientAgent(message).commands?.[0];
    const serverCommand = serverAgent.localAgent(message).commands?.[0];
    expect(clientCommand).toEqual(expected);
    expect(serverCommand).toEqual(expected);
    expect(validatePageCommand(clientCommand)).toEqual(expected);
    expect(serverAgent.sanitizeCommands([serverCommand], completeTrustedState)).toEqual([expected]);
  });

  it('keeps the competency tools and every project inside the prompt window', () => {
    // The model sees only the first PAGE_STATE_CHARS characters of the page state,
    // and is told to say evidence is absent rather than guess. At 20,000,
    // Swarmline's record pushed seven projects past the cut, so the assistant
    // would have denied work the site shows. When this fails, raise the cap or
    // trim what comes before the projects; do not let a record fall off silently.
    const state = JSON.stringify(buildPageState(defaultSettings));
    const visible = state.slice(0, serverAgent.PAGE_STATE_CHARS);
    const wire = JSON.parse(state);
    expect(wire.projects.length).toBeGreaterThan(0);
    for (const record of [...wire.competencies, ...wire.projects]) {
      expect(visible.includes(JSON.stringify(record)), record.id ?? record.title).toBe(true);
    }
  });
});
