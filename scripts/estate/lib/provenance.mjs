// Provenance (plan §6.1, decision C17): the ONLY code in this repository that
// touches external/Bonsai-Estate, and only through git, offline. The gitlink is
// read from the portfolio's own index, never from the submodule's checkout.
//
// Every commit id reaches git only after COMMIT_ID has accepted it, and after
// --end-of-options where git takes revisions: export_info.json comes out of a
// zip, so a value like "--output=<file>" must never be parsed as an option.

import { execFileSync, spawnSync } from 'node:child_process';

export const SUBMODULE = 'external/Bonsai-Estate';
/** What a generator change means upstream (U2's dirty_scope). */
export const GENERATOR_PATHS = ['estate', 'config', 'estate.py', 'estate.sh', 'estate.cmd'];
/** A full commit id, the only shape a commit from a release file may take. */
export const COMMIT_ID = /^[0-9a-f]{40}$/;

const git = (repoRoot, args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const commitId = (value, what) => {
  if (typeof value !== 'string' || !COMMIT_ID.test(value)) throw new Error(`${what} ${JSON.stringify(value)} is not a 40-hex commit id`);
  return value;
};

/** The submodule commit recorded in the portfolio's index (mode 160000), or null without .git. */
export const gitlink = (repoRoot) => {
  let line;
  try { line = git(repoRoot, ['ls-files', '--stage', '--', SUBMODULE]); } catch { return null; }
  const m = /^160000 ([0-9a-f]{40}) \d\t/.exec(line);
  return m ? m[1] : null;
};

/** Whether the generator is unchanged between two upstream commits (git diff --quiet A B -- …). */
export const generatorUnchanged = (repoRoot, from, to) => {
  commitId(from, 'generatorUnchanged: from'); commitId(to, 'generatorUnchanged: to');
  const r = spawnSync('git', ['-C', SUBMODULE, 'diff', '--quiet', '--end-of-options', from, to, '--', ...GENERATOR_PATHS], { cwd: repoRoot, stdio: 'ignore' });
  if (r.status === 0) return true;
  if (r.status === 1) return false;
  throw new Error(`git diff in ${SUBMODULE} failed (status ${r.status}); is the submodule initialised and does it hold ${from}?`);
};

/** Whether `ancestor` is `descendant` or one of its ancestors (git merge-base --is-ancestor). */
export const isAncestor = (repoRoot, ancestor, descendant) => {
  commitId(ancestor, 'isAncestor: ancestor'); commitId(descendant, 'isAncestor: descendant');
  const r = spawnSync('git', ['-C', SUBMODULE, 'merge-base', '--is-ancestor', ancestor, descendant], { cwd: repoRoot, stdio: 'ignore' });
  if (r.status === 0) return true;
  if (r.status === 1) return false;
  throw new Error(`git merge-base in ${SUBMODULE} failed (status ${r.status}); does it hold ${ancestor} and ${descendant}?`);
};

/** `git rev-parse <tag>^{commit}` in the submodule, or null when the tag is unknown. */
export const tagCommit = (repoRoot, tag) => {
  if (!/^v\d+\.\d+$/.test(tag)) throw new Error(`tagCommit: ${JSON.stringify(tag)} is not a vX.Y tag`);
  try { return git(repoRoot, ['-C', SUBMODULE, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${tag}^{commit}`]); } catch { return null; }
};
