import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const { PORT, ...env } = process.env;
const apiPort = env.API_PORT ?? '5174';
const vitePort = PORT ?? '5173';

const children = [
  spawn(process.execPath, ['server.mjs'], { cwd: root, stdio: 'inherit', env: { ...env, API_PORT: apiPort } }),
  spawn(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', vitePort, '--strictPort'], { cwd: root, stdio: 'inherit', env }),
];

const shutdown = () => {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
};

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown();
      process.exit(code);
    }
  });
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
