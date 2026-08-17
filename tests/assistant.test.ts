import { describe, expect, it } from 'vitest';
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
});
