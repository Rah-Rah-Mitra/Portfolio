import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { localAgent, validatePageCommand } from '../components/AskThePage';

describe('portfolio AI commands', () => {
  it.each([
    ['show the experience timeline', 'focusExperience'],
    ['open the technical lab SLAM study', 'openTechnicalLab'],
    ['tell me about AsyncDDGS', 'focusProject'],
    ['what does the guide do?', 'focusGuideChapter'],
  ])('maps %s to %s', (prompt, commandType) => {
    expect(localAgent(prompt).commands?.some((command) => command.type === commandType)).toBe(true);
  });

  it('never emits the removed profile switch command', () => {
    const serialized = JSON.stringify(localAgent('show security and software work'));
    expect(serialized).not.toContain('switchProfile');
  });

  it('routes Explore World to the honest optical-test-bench anchor', () => {
    const response = localAgent('show me Explore World');

    expect(response.reply).toContain('shared optical test bench');
    expect(response.reply).not.toMatch(/spatial portfolio map|Three\.js|GLB environment/i);
    expect(response.references).toContainEqual({ label: 'Explore World', href: '#world' });
    expect(response.commands).toContainEqual({ type: 'enterExploreMode', sceneId: 'camera-laboratory' });
  });

  it('exposes only validated evidence, workstation, lab, chapter, explore, and mode commands', () => {
    expect(validatePageCommand({ type: 'focusExperience' })).toEqual({ type: 'focusExperience' });
    expect(validatePageCommand({ type: 'focusProject', projectId: 'churp' })).toEqual({ type: 'focusProject', projectId: 'churp' });
    expect(validatePageCommand({ type: 'openTechnicalLab', mode: 'stereo' })).toEqual({ type: 'openTechnicalLab', mode: 'stereo' });
    expect(validatePageCommand({ type: 'focusGuideChapter', chapterId: 'work' })).toEqual({ type: 'focusGuideChapter', chapterId: 'work' });
    expect(validatePageCommand({ type: 'enterExploreMode', sceneId: 'camera-laboratory' })).toEqual({ type: 'enterExploreMode', sceneId: 'camera-laboratory' });
    expect(validatePageCommand({ type: 'setQuickScan', enabled: true })).toEqual({ type: 'setQuickScan', enabled: true });
    expect(validatePageCommand({ type: 'openDesktopApp', appId: 'camera-lab' })).toEqual({ type: 'openDesktopApp', appId: 'camera-lab' });
    expect(validatePageCommand({ type: 'minimizeDesktopApp', appId: 'camera-lab' })).toEqual({ type: 'minimizeDesktopApp', appId: 'camera-lab' });
    expect(validatePageCommand({ type: 'openTechnicalLab', mode: 'slam' })).toBeNull();
    expect(validatePageCommand({ type: 'focusProject', projectId: 'made-up' })).toBeNull();
    expect(validatePageCommand({ type: 'openDesktopApp', appId: 'made-up' })).toBeNull();
    expect(validatePageCommand({ type: 'openWorld' })).toBeNull();
  });

  it('describes the shipped camera laboratory without publishing deferred SLAM results', () => {
    const response = localAgent('open the technical lab SLAM study');
    expect(response.reply).toMatch(/intrinsics|extrinsics|optics|stereo/i);
    expect(response.reply).toMatch(/unpublished/i);
    expect(response.reply).not.toMatch(/dense flow|ORB matches|trajectory comparison/i);
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
    expect(serverAgent).toContain("{ label: 'Explore World', href: '#world' }");
  });
});
