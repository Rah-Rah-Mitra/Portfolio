import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { injectSemanticMarkup } from '../scripts/prerender-semantic.mjs';

describe('semantic build pipeline', () => {
  it('injects deterministic markup into the application root', () => {
    expect(injectSemanticMarkup('<main><div id="root"></div></main>', '<p>Rahul Mitra</p>')).toBe(
      '<main><div id="root"><p>Rahul Mitra</p></div></main>',
    );
  });

  it('runs prerender during production builds and hydrates valid markup', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
    const entry = await readFile(new URL('../index.tsx', import.meta.url), 'utf8');
    expect(packageJson.scripts.build).toContain('prerender-semantic.mjs');
    expect(entry).toContain('hydrateRoot');
    expect(entry).toContain('createRoot');
  });
});
