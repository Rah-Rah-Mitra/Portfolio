import { afterEach, describe, expect, it, vi } from 'vitest';
import * as serverAgent from '../server/pageAgent.mjs';

const trustedPageState = {
  allowedLinks: ['#technical-lab', '#experience', '#work', '#world', '#home'],
  projects: [{ id: 'churp' }, { id: 'asyncddgs' }],
  experience: [{ id: 'abbott-internship' }],
  chapters: ['home', 'work', 'experience', 'technical-lab'],
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
});
