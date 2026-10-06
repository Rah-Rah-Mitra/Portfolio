import { afterEach, describe, expect, it, vi } from 'vitest';
import * as serverAgent from '../server/pageAgent.mjs';
import { localAgent as clientAgent, validatePageCommand } from '../components/AskThePage';
import { defaultSettings } from '../contexts/PhysicsContext';
import { allowedLinks, buildPageState } from '../lib/askPageState';
import { workbenchApps } from '../lib/workbench';
import { experienceRecords } from '../portfolioData';

const trustedPageState = {
  allowedLinks: ['#technical-lab', '#systems-lab', '#experience', '#work', '#world', '#home'],
  projects: [{ id: 'churp' }, { id: 'asyncddgs' }],
  experience: [{ id: 'abbott-internship' }],
  chapters: ['home', 'work', 'experience', 'technical-lab'],
  apps: ['home', 'selected-work', 'experience', 'project-archive', 'systems-lab', 'camera-lab', 'world-3d'],
};

const completeTrustedState = {
  ...trustedPageState,
  projects: [{ id: 'asyncddgs' }, { id: 'hybrid-flow-shop-digital-twin' }, { id: 'swarmline' }],
  experience: [{ id: 'abbott-internship' }, { id: 'career-amazon-vision' }, { id: 'career-stmicro-or' }],
  chapters: ['home', 'work', 'experience', 'technical-lab', 'domains', 'proof', 'resumes', 'contact'],
};

describe('server page-agent command parity', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['open the technical lab in stereo mode', 'openTechnicalLab'],
    ['show the experience timeline', 'focusExperience'],
    ['focus the work guide chapter', 'focusGuideChapter'],
    ['show me Explore World', 'openDesktopApp'],
    ['walk me through the HDB estate', 'openDesktopApp'],
    ['open the systems lab', 'openDesktopApp'],
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

  it('drops the retired explore and Quick Scan commands even when a model sends them', () => {
    expect(serverAgent.sanitizeCommands([
      { type: 'enterExploreMode', sceneId: 'camera-laboratory' },
      { type: 'setQuickScan', enabled: true },
      { type: 'openTechnicalLab', mode: 'optics' },
    ], trustedPageState)).toEqual([{ type: 'openTechnicalLab', mode: 'optics' }]);
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
    ['open the Camera Lab stereo depth model', { type: 'openTechnicalLab', mode: 'stereo' }],
    ['show the SLAM calibration study', { type: 'openTechnicalLab' }],
    ['How does the Zhang calibration work?', { type: 'openTechnicalLab' }],
    ['what does the flow-shop teaching model compare?', { type: 'openDesktopApp', appId: 'systems-lab' }],
    ['show the drop test', { type: 'openDesktopApp', appId: 'systems-lab' }],
    ['tell me about AsyncDDGS', { type: 'focusProject', projectId: 'asyncddgs' }],
    ['what did the drone swarm at the defense tech hackathon do?', { type: 'focusProject', projectId: 'swarmline' }],
    ['What does Rahul do at Amazon?', { type: 'focusExperience', experienceId: 'career-amazon-vision' }],
    ['Tell me about STMicroelectronics', { type: 'focusExperience', experienceId: 'career-stmicro-or' }],
    ['Where can I contact Rahul?', { type: 'focusGuideChapter', chapterId: 'contact' }],
    ['show the experience timeline', { type: 'focusExperience' }],
    ['what does the guide do?', { type: 'focusGuideChapter', chapterId: 'work' }],
    ['show the Abbott internship', { type: 'focusProject', projectId: 'hybrid-flow-shop-digital-twin' }],
    ['show scheduling optimization', { type: 'focusProject', projectId: 'hybrid-flow-shop-digital-twin' }],
    ['show 3D computer vision', { type: 'focusGuideChapter', chapterId: 'domains' }],
    ['which resume should I use?', { type: 'focusGuideChapter', chapterId: 'resumes' }],
    ['show adversarial security work', { type: 'focusGuideChapter', chapterId: 'proof' }],
    ['Show Rahul’s security record.', { type: 'focusGuideChapter', chapterId: 'proof' }],
    ['show me Explore World', { type: 'openDesktopApp', appId: 'world-3d' }],
    ['walk me through the HDB estate', { type: 'openDesktopApp', appId: 'world-3d' }],
    ['is there a hawker centre in the estate?', { type: 'openDesktopApp', appId: 'world-3d' }],
    ['what is blk 509?', { type: 'openDesktopApp', appId: 'world-3d' }],
    ['show the multi-storey car park', { type: 'openDesktopApp', appId: 'world-3d' }],
    ['show generic project work', { type: 'focusGuideChapter', chapterId: 'work' }],
  ])('keeps client/server fallback parity for %s', (message, expected) => {
    const clientCommand = clientAgent(message).commands?.[0];
    const serverCommand = serverAgent.localAgent(message).commands?.[0];
    expect(clientCommand).toEqual(expected);
    expect(serverCommand).toEqual(expected);
    expect(validatePageCommand(clientCommand)).toEqual(expected);
    expect(serverAgent.sanitizeCommands([serverCommand], completeTrustedState)).toEqual([expected]);
  });

  it.each([
    'use Quick Scan',
    'show me Explore World',
    'walk me through the HDB estate',
    'what is in the systems lab?',
    'open the Camera Lab stereo depth model',
    'How does the Zhang calibration work?',
    'What does Rahul do at Amazon?',
    'Tell me about STMicroelectronics',
    'Where can I contact Rahul?',
    'what does the guide do?',
    'something the record does not cover',
  ])('words the client and server fallbacks identically for %s', (message) => {
    // The two fallbacks are separate copies (the server cannot import the TSX),
    // so a reply edited on one side only would describe a different site.
    const client = clientAgent(message);
    const server = serverAgent.localAgent(message);
    expect(client.commands).toEqual(server.commands);
    expect(client.reply).toBe(server.reply);
  });

  it('keeps the offline default pointed at Experience and Contact through the sanitizer', async () => {
    vi.stubEnv('GEMINI_API_KEY', ''); vi.stubEnv('GOOGLE_API_KEY', '');
    const pageState = buildPageState(defaultSettings);
    const result = await serverAgent.createPageAgentResponse({ message: 'something the record does not cover', pageState });
    expect(result.status).toBe(200);
    expect('reply' in result.payload).toBe(true);
    if (!('reply' in result.payload)) return;
    expect(result.payload.reply).not.toMatch(/could not find that in Rahul/i);
    expect(result.payload.references).toEqual([{ label: 'Read the experience timeline', href: '#experience' }, { label: 'Contact', href: '#contact' }]);
  });

  it('tells the model what the labs are, outside the client-supplied page state', () => {
    const exhibits = serverAgent.SITE_EXHIBITS.join('\n');
    expect(exhibits).toMatch(/intrinsics[\s\S]*extrinsics[\s\S]*thin-lens optics[\s\S]*rectified stereo/);
    expect(exhibits).toMatch(/synthetic, seeded jobs \(not Abbott data\)/);
    expect(exhibits).toMatch(/N-body gravity field[\s\S]*WebGL2 fluid/);
    expect(exhibits).toMatch(/Sample Town N5[\s\S]*not a real town[\s\S]*desktop/i);
    // The model hears what P4b does (orbit, fly to, detail on approach), and no walking in before P5.
    const estate = serverAgent.SITE_EXHIBITS.find((line: string) => line.startsWith('Estate (#world')) ?? '';
    expect(estate).toMatch(/orbit it or fly to a building, and detail loads as they get closer/);
    expect(estate).not.toMatch(/walk in/i);
    // FIG. 06b ships with the Camera Lab; the model was told only the four models.
    expect(exhibits).toMatch(/Zhang calibration[\s\S]*Levenberg–Marquardt/);
    // ?mode=scan is still honoured (lib/experienceMode.ts); the mode is not denied.
    expect(exhibits).not.toMatch(/There is no Quick Scan mode/);
    expect(exhibits).toMatch(/\?mode=scan link still opens the page without the desk backgrounds or sound cues/);
    // A phone asks from field-index, which has no labs and no Estate.
    expect(exhibits).toMatch(/field-index is the phone registry, which does not show the Camera Lab, the Systems Lab or the Estate/);
    expect(exhibits).not.toMatch(/optical test bench|Three\.js|Optical Courier|renders on demand/i);
  });

  it('cites only anchors a workbench window renders', () => {
    const anchors = [...allowedLinks].filter((link) => link.startsWith('#') && !link.startsWith('#project-'));
    const rendered = new Set([...workbenchApps.map((app) => `#${app.sectionId}`), '#contact']);
    expect(anchors.filter((anchor) => !rendered.has(anchor))).toEqual([]);
    expect(anchors).toEqual(expect.arrayContaining(['#systems-lab', '#technical-lab', '#world']));
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
    expect(wire.surface).toBe('field-workbench');
    expect(buildPageState(defaultSettings, 'field-index').surface).toBe('field-index');
    expect(wire.backdrops).toEqual({ nbody: false, fluid: false });
    expect(wire.projects.length).toBeGreaterThan(0);
    for (const record of [...wire.competencies, ...wire.projects]) {
      expect(visible.includes(JSON.stringify(record)), record.id ?? record.title).toBe(true);
    }
  });
});
