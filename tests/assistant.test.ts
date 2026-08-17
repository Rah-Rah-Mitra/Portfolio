import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { localAgent } from '../components/AskThePage';

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
    expect(response.commands).toContainEqual({ type: 'openWorld' });
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
