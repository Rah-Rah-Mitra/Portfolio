// Regenerates server/portfolio-snapshot.json from lib/portfolioSnapshot.ts via
// Vite SSR (same trick as prerender-semantic.mjs). Run: npm run snapshot
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const projectRoot = path.resolve(import.meta.dirname, '..');
// ponytail: noDiscovery stops Vite's background dep-scan, which otherwise errors when we close the server right after loading one module.
const server = await createServer({ root: projectRoot, configFile: false, logLevel: 'warn', appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { buildPortfolioSnapshot } = await server.ssrLoadModule('/lib/portfolioSnapshot.ts');
  const target = path.join(projectRoot, 'server', 'portfolio-snapshot.json');
  await writeFile(target, `${JSON.stringify(buildPortfolioSnapshot(), null, 2)}\n`, 'utf8');
  console.log(`wrote ${path.relative(projectRoot, target)}`);
} finally {
  await server.close();
}
