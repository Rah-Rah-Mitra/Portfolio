// Provenance (plan §6.1, decision C17): the ONLY code in this repository that
// touches external/Bonsai-Estate, and only through git, offline. The gitlink is
// read from the portfolio's own index, never from the submodule's checkout.

import { execFileSync, spawnSync } from 'node:child_process';

export const SUBMODULE = 'external/Bonsai-Estate';
/** What a generator change means upstream (U2's dirty_scope). */
export const GENERATOR_PATHS = ['estate', 'config', 'estate.py', 'estate.sh', 'estate.cmd'];

const git = (repoRoot, args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The submodule commit recorded in the portfolio's index (mode 160000), or null without .git. */
export const gitlink = (repoRoot) => {
  let line;
  try { line = git(repoRoot, ['ls-files', '--stage', '--', SUBMODULE]); } catch { return null; }
  const m = /^160000 ([0-9a-f]{40}) \d\t/.exec(line);
  return m ? m[1] : null;
};

/** Whether the generator is unchanged between two upstream commits (git diff --quiet A B -- …). */
export const generatorUnchanged = (repoRoot, from, to) => {
  const r = spawnSync('git', ['-C', SUBMODULE, 'diff', '--quiet', from, to, '--', ...GENERATOR_PATHS], { cwd: repoRoot, stdio: 'ignore' });
  if (r.status === 0) return true;
  if (r.status === 1) return false;
  throw new Error(`git diff in ${SUBMODULE} failed (status ${r.status}); is the submodule initialised and does it hold ${from}?`);
};

/** `git rev-parse <tag>^{commit}` in the submodule, or null when the tag is unknown. */
export const tagCommit = (repoRoot, tag) => {
  try { return git(repoRoot, ['-C', SUBMODULE, 'rev-parse', '--verify', '--quiet', `${tag}^{commit}`]); } catch { return null; }
};
