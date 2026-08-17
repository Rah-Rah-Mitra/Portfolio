import { afterEach, describe, expect, it, vi } from 'vitest';
import * as serverAgent from '../server/pageAgent.mjs';
import { localAgent as clientAgent, validatePageCommand } from '../components/AskThePage';

const trustedPageState = {
  allowedLinks: ['#technical-lab', '#experience', '#work', '#world', '#home'],
  projects: [{ id: 'churp' }, { id: 'asyncddgs' }],
  experience: [{ id: 'abbott-internship' }],
  chapters: ['home', 'work', 'experience', 'technical-lab'],
};

const completeTrustedState = {
  ...trustedPageState,
  projects: [{ id: 'asyncddgs' }, { id: 'hybrid-flow-shop-digital-twin' }],
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
      { type: 'focusProject', projectId: 'attacker-project' },
      { type: 'focusExperience', experienceId: 'attacker-role' },
      { type: 'focusGuideChapter', chapterId: 'attacker-chapter' },
      { type: 'openTechnicalLab', mode: 'root-shell' },
      { type: 'enterExploreMode', sceneId: 'attacker-scene' },
      { type: 'setQuickScan', enabled: 'yes' },
    ], {
      projects: [{ id: 'attacker-project' }, { id: 'churp' }],
      experience: [{ id: 'attacker-role' }], chapters: ['attacker-chapter'],
    });
    expect(commands).toEqual([{ type: 'focusProject', projectId: 'churp' }]);
  });

  it.each([
    ['open the technical lab in stereo mode', { type: 'openTechnicalLab', mode: 'stereo' }],
    ['show the SLAM calibration study', { type: 'openTechnicalLab' }],
    ['tell me about AsyncDDGS', { type: 'focusProject', projectId: 'asyncddgs' }],
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
});
