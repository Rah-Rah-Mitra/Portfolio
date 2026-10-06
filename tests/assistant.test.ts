import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { localAgent, validatePageCommand } from '../components/AskThePage';
import { ASSISTANT_STARTERS, NARROW_ASSISTANT_STARTERS } from '../siteConfig';

describe('portfolio AI commands', () => {
  it.each([
    ['show the experience timeline', 'focusExperience'],
    ['open the technical lab SLAM study', 'openTechnicalLab'],
    ['tell me about AsyncDDGS', 'focusProject'],
    ['what does the guide do?', 'focusGuideChapter'],
    ['what is in the systems lab?', 'openDesktopApp'],
  ])('maps %s to %s', (prompt, commandType) => {
    expect(localAgent(prompt).commands?.some((command) => command.type === commandType)).toBe(true);
  });

  it('never emits the removed profile switch command', () => {
    const serialized = JSON.stringify(localAgent('show security and software work'));
    expect(serialized).not.toContain('switchProfile');
  });

  it('opens the Estate window and describes it as the generated sample it is', () => {
    for (const prompt of ['show me Explore World', 'walk me through the HDB estate']) {
      const response = localAgent(prompt);
      expect(response.reply, prompt).toMatch(/generated sample HDB neighbourhood/);
      expect(response.reply, prompt).toMatch(/not a real town/);
      // The capability sentence (plan §9.4: P4b's orbit and fly-to, P5's walking in), and the desktop-only line both replies carry.
      expect(response.reply, prompt).toMatch(/Orbit it or fly to a building, and walk in through void decks, stairs and lifts; detail loads as you get closer\./);
      expect(response.reply, prompt).toMatch(/desktop window \(881px and wider\)/);
      // Not the P4a still-render sentence.
      expect(response.reply, prompt).not.toMatch(/still render with a registry/i);
      expect(response.reply, prompt).not.toMatch(/CSS drawing|optical test bench|enhancement target|Three\.js|GLB|renders on demand/i);
      expect(response.references, prompt).toContainEqual({ label: 'Explore the estate', href: '#world' });
      expect(response.commands, prompt).toEqual([{ type: 'openDesktopApp', appId: 'world-3d' }]);
    }
  });

  it('answers Quick Scan with the FX panel that replaced it, and switches nothing', () => {
    for (const prompt of ['use Quick Scan', 'how do I pause all motion?', 'turn on the fluid backdrop', 'Turn on sound']) {
      const response = localAgent(prompt);
      expect(response.reply, prompt).toMatch(/Pause all motion/);
      expect(response.reply, prompt).toMatch(/N-body gravity field/);
      expect(response.commands, prompt).toEqual([]);
    }
    // lib/experienceMode.ts still honours ?mode=scan (links to it exist), and the
    // FX panel names it as the reason sound is held, so the assistant must not
    // say the mode does not exist.
    const scan = localAgent('what is Quick Scan?').reply;
    expect(scan).not.toMatch(/no (separate )?Quick Scan mode/i);
    expect(scan).toMatch(/\?mode=scan link still opens the page without the desk backgrounds or sound cues/);
  });

  it('answers calibration questions from the Camera Lab, not the generic work brief', () => {
    for (const prompt of ['How does the Zhang calibration work?', 'Can I calibrate a camera here?']) {
      const response = localAgent(prompt);
      expect(response.reply, prompt).toMatch(/Zhang calibration[\s\S]*Levenberg–Marquardt[\s\S]*synthetic detections/);
      expect(response.commands, prompt).toEqual([{ type: 'openTechnicalLab' }]);
      expect(response.references, prompt).toContainEqual({ label: 'Open the Camera Lab', href: '#technical-lab' });
    }
  });

  it('opens the current roles and the contact handoff the record holds', () => {
    expect(localAgent('What does Rahul do at Amazon?').commands).toEqual([{ type: 'focusExperience', experienceId: 'career-amazon-vision' }]);
    expect(localAgent('Tell me about STMicroelectronics').commands).toEqual([{ type: 'focusExperience', experienceId: 'career-stmicro-or' }]);
    const contact = localAgent('Where can I contact Rahul?');
    expect(contact.commands).toEqual([{ type: 'focusGuideChapter', chapterId: 'contact' }]);
    expect(contact.references).toEqual([{ label: 'Contact', href: '#contact' }]);
  });

  it('does not claim the record lacks what the offline index has no keyword for', () => {
    const response = localAgent('What is his favourite programming paradigm?');
    expect(response.reply).not.toMatch(/could not find that in Rahul/i);
    expect(response.reply).toMatch(/offline index has no ready answer/);
    expect(response.references).toEqual([{ label: 'Read the experience timeline', href: '#experience' }, { label: 'Contact', href: '#contact' }]);
    expect(response.commands).toEqual([]);
  });

  it('says the labs and the Estate are desktop windows', () => {
    for (const prompt of ['open the Camera Lab', 'what is in the systems lab?', 'show me Explore World', 'walk me through the HDB estate']) {
      expect(localAgent(prompt).reply, prompt).toMatch(/desktop window \(881px and wider\)/);
    }
  });

  it('describes the Systems Lab teaching model as synthetic, not Abbott data', () => {
    const response = localAgent('how does the NEH teaching model compare with Johnson?');
    expect(response.reply).toMatch(/synthetic, seeded jobs \(not Abbott data\)/);
    expect(response.reply).toMatch(/matter\.js drop test/);
    expect(response.references).toContainEqual({ label: 'Open the Systems Lab', href: '#systems-lab' });
  });

  it('validates focusEstate: a known building, its storey normalised, a storey it lacks dropped alone, enter only as a boolean', () => {
    expect(validatePageCommand({ type: 'focusEstate', site: 'BLK_509', storey: 'L5', enter: true })).toEqual({ type: 'focusEstate', site: 'BLK_509', storey: 'L5', enter: true });
    expect(validatePageCommand({ type: 'focusEstate', site: 'BLK_509', storey: 'L05' })).toEqual({ type: 'focusEstate', site: 'BLK_509', storey: 'L5' });
    expect(validatePageCommand({ type: 'focusEstate', site: 'BLK_509', storey: ' l5 ' })).toEqual({ type: 'focusEstate', site: 'BLK_509', storey: 'L5' });
    expect(validatePageCommand({ type: 'focusEstate', site: 'MSCP_513', storey: 'rf' })).toEqual({ type: 'focusEstate', site: 'MSCP_513', storey: 'RF' });
    expect(validatePageCommand({ type: 'focusEstate', site: 'BLK_509', storey: 'L99' })).toEqual({ type: 'focusEstate', site: 'BLK_509' });
    expect(validatePageCommand({ type: 'focusEstate', site: 'BLK_509', storey: 'L17' })).toEqual({ type: 'focusEstate', site: 'BLK_509' });
    expect(validatePageCommand({ type: 'focusEstate', site: 'BLK_509', storey: 'L0' })).toEqual({ type: 'focusEstate', site: 'BLK_509' });
    expect(validatePageCommand({ type: 'focusEstate', site: 'BLK_509', storey: 5, enter: 'yes' })).toEqual({ type: 'focusEstate', site: 'BLK_509' });
    expect(validatePageCommand({ type: 'focusEstate', site: 'BLK_509', enter: false })).toEqual({ type: 'focusEstate', site: 'BLK_509', enter: false });
    expect(validatePageCommand({ type: 'focusEstate', site: 'BLK_599', storey: 'L5' })).toBeNull();
    expect(validatePageCommand({ type: 'focusEstate', site: 'SITE' })).toBeNull();
    expect(validatePageCommand({ type: 'focusEstate' })).toBeNull();
  });

  it('routes a named building to focusEstate locally: Blk 501–512, the car park, the hawker centre; into, enter, walk or inside walks in', () => {
    expect(localAgent('take me into the hawker centre').commands).toEqual([{ type: 'focusEstate', site: 'NC_514', enter: true }]);
    expect(localAgent('show me Blk 509').commands).toEqual([{ type: 'focusEstate', site: 'BLK_509' }]);
    expect(localAgent('go inside blk 512').commands).toEqual([{ type: 'focusEstate', site: 'BLK_512', enter: true }]);
    expect(localAgent('where is the car park?').commands).toEqual([{ type: 'focusEstate', site: 'MSCP_513' }]);
    expect(localAgent('enter the mscp').commands).toEqual([{ type: 'focusEstate', site: 'MSCP_513', enter: true }]);
    expect(localAgent('the neighbourhood centre').commands).toEqual([{ type: 'focusEstate', site: 'NC_514' }]);
    for (const prompt of ['blk 500', 'blk 513', 'blk 5099', 'show me the estate']) {
      expect(localAgent(prompt).commands, prompt).toEqual([{ type: 'openDesktopApp', appId: 'world-3d' }]);
    }
    // The reply is the same Estate description either way.
    expect(localAgent('take me into the hawker centre').reply).toBe(localAgent('show me the estate').reply);
  });

  it('exposes only validated evidence, workstation, lab, and chapter commands', () => {
    expect(validatePageCommand({ type: 'focusExperience' })).toEqual({ type: 'focusExperience' });
    expect(validatePageCommand({ type: 'focusProject', projectId: 'churp' })).toEqual({ type: 'focusProject', projectId: 'churp' });
    expect(validatePageCommand({ type: 'openTechnicalLab', mode: 'stereo' })).toEqual({ type: 'openTechnicalLab', mode: 'stereo' });
    expect(validatePageCommand({ type: 'focusGuideChapter', chapterId: 'work' })).toEqual({ type: 'focusGuideChapter', chapterId: 'work' });
    expect(validatePageCommand({ type: 'openDesktopApp', appId: 'camera-lab' })).toEqual({ type: 'openDesktopApp', appId: 'camera-lab' });
    expect(validatePageCommand({ type: 'minimizeDesktopApp', appId: 'camera-lab' })).toEqual({ type: 'minimizeDesktopApp', appId: 'camera-lab' });
    expect(validatePageCommand({ type: 'openTechnicalLab', mode: 'slam' })).toBeNull();
    expect(validatePageCommand({ type: 'focusProject', projectId: 'made-up' })).toBeNull();
    expect(validatePageCommand({ type: 'openDesktopApp', appId: 'made-up' })).toBeNull();
    expect(validatePageCommand({ type: 'openWorld' })).toBeNull();
    // Retired with the field-test UI: there is no explore scene and no mode switch.
    expect(validatePageCommand({ type: 'enterExploreMode', sceneId: 'camera-laboratory' })).toBeNull();
    expect(validatePageCommand({ type: 'setQuickScan', enabled: true })).toBeNull();
  });

  it('describes the shipped camera laboratory without publishing deferred SLAM results', () => {
    const response = localAgent('open the technical lab SLAM study');
    expect(response.reply).toMatch(/intrinsics|extrinsics|optics|stereo/i);
    expect(response.reply).toMatch(/synthetic/i);
    expect(response.reply).toMatch(/unpublished/i);
    expect(response.reply).not.toMatch(/dense flow|ORB matches|trajectory comparison/i);
  });

  it('offers only starters that reach something the site has', () => {
    expect(ASSISTANT_STARTERS.join('\n')).not.toMatch(/optical test bench|Explore World|Quick Scan/i);
    // Each starter lands on its own topic, not on a generic answer: "Show
    // security experience." once fell into the experience-timeline branch.
    const expected: Record<string, { command: unknown; reply: RegExp; reference?: string }> = {
      'Show me Rahul’s optimization work.': { command: { type: 'focusProject', projectId: 'hybrid-flow-shop-digital-twin' }, reply: /operations-research/ },
      'What did Rahul study in 3D computer vision?': { command: { type: 'focusGuideChapter', chapterId: 'domains' }, reply: /CS4277/ },
      'Which résumé should I download?': { command: { type: 'focusGuideChapter', chapterId: 'resumes' }, reply: /Highlights résumé/ },
      'Show Rahul’s security record.': { command: { type: 'focusGuideChapter', chapterId: 'proof' }, reply: /bug-bounty/, reference: '#project-arcane' },
      'Open the Camera Lab stereo depth model.': { command: { type: 'openTechnicalLab', mode: 'stereo' }, reply: /rectified stereo depth/ },
      'Tell me about Swarmline.': { command: { type: 'focusProject', projectId: 'swarmline' }, reply: /Swarmline/ },
    };
    for (const starter of new Set([...ASSISTANT_STARTERS, ...NARROW_ASSISTANT_STARTERS])) {
      const want = expected[starter];
      expect(want, `no expectation pinned for starter "${starter}"`).toBeDefined();
      const response = localAgent(starter);
      expect(response.commands, starter).toEqual([want.command]);
      expect(response.reply, starter).toMatch(want.reply);
      if (want.reference) expect(response.references?.map((reference) => reference.href), starter).toContain(want.reference);
    }
  });

  it('offers a phone no starter that opens a window the registry does not have', () => {
    // ≤880px the site is the Field Index, where the labs and the Estate only
    // switch the PROJECTS chip. A starter that says "Open…" must not land there.
    expect(NARROW_ASSISTANT_STARTERS).toHaveLength(ASSISTANT_STARTERS.length);
    for (const starter of NARROW_ASSISTANT_STARTERS) {
      for (const command of localAgent(starter).commands ?? []) {
        expect(command.type, starter).not.toBe('openTechnicalLab');
        // focusEstate opens the Estate (a desktop window) and flies its camera: never from a phone starter.
        expect(command.type, starter).not.toBe('focusEstate');
        if (command.type === 'openDesktopApp') expect(['camera-lab', 'systems-lab', 'world-3d'], starter).not.toContain(command.appId);
      }
    }
  });

  it('removes profile switching from server commands and analytics', async () => {
    const serverAgent = await readFile(new URL('../server/pageAgent.mjs', import.meta.url), 'utf8');
    const analytics = await readFile(new URL('../lib/analytics.ts', import.meta.url), 'utf8');
    expect(serverAgent).not.toContain('switchProfile');
    expect(analytics).not.toContain('profile_switched');
    expect(analytics).not.toContain('themeToProfile');
  });

  it('removes legacy-world claims and controls from the server agent contract', async () => {
    const serverAgent = await readFile(new URL('../server/pageAgent.mjs', import.meta.url), 'utf8');

    expect(serverAgent).not.toMatch(/optional spatial portfolio map|Three\.js layer|effect":"smash\|gravity\|fluid\|pretext\|world/i);
    expect(serverAgent).not.toMatch(/enterExploreMode|setQuickScan|optical test bench/);
    expect(serverAgent).toContain("{ label: 'Explore the estate', href: '#world' }");
  });

  it('labels analytics with the surface that is mounted', async () => {
    const analytics = await readFile(new URL('../lib/analytics.ts', import.meta.url), 'utf8');
    expect(analytics).not.toContain('continuous_field_test');
    expect(analytics).not.toMatch(/physics_mode_toggled|achievement_hovered|scroll_depth_reached|project_showcase_opened/);
  });
});
