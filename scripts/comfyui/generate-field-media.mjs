import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runFile = path.join(root, 'workflows', 'comfyui', 'field-calibration-run.json');
const run = JSON.parse(await readFile(runFile, 'utf8'));
const client = path.join(root, 'scripts', 'comfyui', 'mcp-client.mjs');

const child = spawn(process.execPath, [client, 'run-saved', run.workflow, JSON.stringify({ overrides: run.overrides })], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});

child.on('exit', (code) => process.exit(code ?? 1));
