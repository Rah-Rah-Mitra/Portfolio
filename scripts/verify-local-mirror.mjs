import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceDirectory = path.resolve(scriptDirectory, '..');
const defaultMirror = process.platform === 'win32'
  ? 'C:\\codex-verify\\portfolio'
  : path.resolve(sourceDirectory, '..', '.portfolio-verify');
const excludedDirectories = new Set(['.git', '.claude', 'node_modules', 'dist', '.impeccable']);

export const isSafeMirrorDestination = (source, destination) => {
  const resolvedSource = path.resolve(source).toLowerCase();
  const resolvedDestination = path.resolve(destination).toLowerCase();
  return resolvedDestination !== resolvedSource
    && !resolvedDestination.startsWith(`${resolvedSource}${path.sep}`)
    && !resolvedSource.startsWith(`${resolvedDestination}${path.sep}`);
};

const run = (command, args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)));
});

export const verifyFromLocalMirror = async ({
  destination = process.env.PORTFOLIO_VERIFY_MIRROR ?? defaultMirror,
  commands = ['test', 'typecheck', 'build'],
} = {}) => {
  if (!isSafeMirrorDestination(sourceDirectory, destination)) {
    throw new Error(`Mirror destination must be outside the source workspace: ${destination}`);
  }

  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(sourceDirectory, destination, {
    recursive: true,
    filter: (entry) => {
      const name = path.basename(entry);
      return !excludedDirectories.has(name) && !name.startsWith('.env');
    },
  });
  await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--no-audit', '--no-fund'], destination);
  for (const command of commands) await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', command], destination);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyFromLocalMirror().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
