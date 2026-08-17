import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const projectRoot = path.resolve(import.meta.dirname, '..');
const temporaryOutput = path.join(projectRoot, '.semantic-prerender');

export const injectSemanticMarkup = (html, markup) => {
  const target = '<div id="root"></div>';
  if (!html.includes(target)) throw new Error('Unable to find the empty application root in built index.html');
  return html.replace(target, `<div id="root">${markup}</div>`);
};

export const prerenderSemanticPortfolio = async () => {
  try {
    await build({
      root: projectRoot,
      configFile: false,
      logLevel: 'warn',
      build: {
        ssr: path.join(projectRoot, 'semanticRender.tsx'),
        outDir: temporaryOutput,
        emptyOutDir: true,
        rollupOptions: { output: { entryFileNames: 'semantic-render.mjs' } },
      },
    });
    const moduleUrl = `${pathToFileURL(path.join(temporaryOutput, 'semantic-render.mjs')).href}?build=${Date.now()}`;
    const { renderSemanticPortfolio } = await import(moduleUrl);
    const builtIndexPath = path.join(projectRoot, 'dist', 'index.html');
    const builtIndex = await readFile(builtIndexPath, 'utf8');
    await writeFile(builtIndexPath, injectSemanticMarkup(builtIndex, renderSemanticPortfolio()), 'utf8');
  } finally {
    await rm(temporaryOutput, { recursive: true, force: true });
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  prerenderSemanticPortfolio().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
