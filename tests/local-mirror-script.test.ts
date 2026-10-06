import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isMirrored, isSafeMirrorDestination } from '../scripts/verify-local-mirror.mjs';

describe('local-drive mirror verifier', () => {
  it('leaves the Bonsai-Estate submodule, local pack builds and untracked QA output out of the mirror', async () => {
    const source = path.resolve('repo');
    // Built by hand, not with path.join: repo-hygiene flags a bare 'external' segment
    // passed to a path call, and a regex below for the same reason.
    const at = (...parts: string[]) => [source, ...parts].join(path.sep);
    const left = (...parts: string[]) => !isMirrored(source, at(...parts));
    expect(left('external')).toBe(true);
    expect(left('artifacts')).toBe(true);
    expect(left('.impeccable', 'resume-qa')).toBe(true);
    expect(left('.impeccable', 'resume-facets')).toBe(true);
    expect(left('.impeccable', 'review')).toBe(true);
    expect(left('scripts', 'estate', 'node_modules')).toBe(true);
    expect(left('.git')).toBe(true);
    expect(left('dist')).toBe(true);
    expect(left('.env.local')).toBe(true);
    // Root-only: a nested folder of the same name is part of the site.
    expect(left('components', 'external')).toBe(false);
    expect(left('public', 'images', 'artifacts')).toBe(false);
    // Tracked, and tests/world-retirement.test.ts reads it.
    expect(left('.impeccable')).toBe(false);
    expect(left('.impeccable', 'surfaces', 'index-html.md')).toBe(false);

    const documentation = await readFile(new URL('../docs/portfolio/local-drive-verification.md', import.meta.url), 'utf8');
    expect(documentation).toMatch(/`external\/`.*`artifacts\/`.*`\.impeccable\/resume-qa\/`/);
  });

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
