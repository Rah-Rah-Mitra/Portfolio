import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { isSafeMirrorDestination } from '../scripts/verify-local-mirror.mjs';

describe('local-drive mirror verifier', () => {
  it('rejects a mirror destination that would write into the source workspace', () => {
    expect(isSafeMirrorDestination('C:/repo', 'C:/repo')).toBe(false);
    expect(isSafeMirrorDestination('C:/repo', 'C:/repo/.verify')).toBe(false);
    expect(isSafeMirrorDestination('C:/repo', 'C:/verify/portfolio')).toBe(true);
  });

  it('rejects a mirror destination that contains the source workspace', () => {
    expect(isSafeMirrorDestination('C:/repo/portfolio', 'C:/repo')).toBe(false);
  });

  it('documents equal, ancestor, and descendant path rejection', async () => {
    const documentation = await readFile(new URL('../docs/portfolio/local-drive-verification.md', import.meta.url), 'utf8');
    expect(documentation).toContain('equal to, an ancestor of, or a descendant of the source workspace');
  });
});
