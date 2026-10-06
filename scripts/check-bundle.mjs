import { realpathSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// The last step of `npm run build`, so a breach fails the Vercel build rather than
// shipping. Vite only warns at 500 kB; the main chunk was 496,834 B when this cap
// landed, and the Estate window's engine must stay in its own lazy chunk.
export const MAIN_CHUNK_LIMIT = 510_000;

// Plan §3 P4b and §4: B is the main bundle as P1 measured it (plan V7), and the
// Estate window's shell (view, registry, catalogue, bootstrap) may add at most
// 12,000 B to it. Everything else of the window — its controller, the engine and
// the HUD — is lazy, so the cap that applies is the smaller of the two.
export const MAIN_BASELINE = 496_834;
export const ESTATE_SHELL_ALLOWANCE = 12_000;
export const MAIN_LIMIT = Math.min(MAIN_BASELINE + ESTATE_SHELL_ALLOWANCE, MAIN_CHUNK_LIMIT);

// Names that survive minification in three r186 (its is<Class> flags and error
// strings), GLTFLoader, the meshopt decoder and camera-controls. None may appear in
// the main bundle; WebGLRenderer must appear in exactly one chunk, the engine's.
export const ENGINE_MARKERS = ['WebGLRenderer', 'GLTFLoader', 'MeshoptDecoder', 'camera-controls'];
export const ENGINE_MARKER = 'WebGLRenderer';
// The §12.4 bench's report schema (engine/bench.ts BENCH_SCHEMA), which survives
// minification: the bench is a chunk only ?estate-bench= downloads, so it may be
// in neither the main bundle nor the Load click (a static import of it anywhere
// in the engine would put it there; tests/estate-boundary.test.ts checks the source).
export const BENCH_MARKER = 'portfolio/estate-bench/1';

// Rollup names a chunk after its facade module, so these follow the source file
// names (components/workbench/estate/EstateController.tsx, live/EstateHud.tsx). The
// controller chunk is already loaded when the consent button shows; the HUD chunk
// downloads with the engine on the Load click (estate/loadEngine.ts).
const CONTROLLER_CHUNK = /^EstateController-[\w-]+\.js$/;
const HUD_CHUNK = /^EstateHud-[\w-]+\.js$/;

const BUDGETS_FILE = path.resolve(import.meta.dirname, '..', 'lib', 'estate', 'packBudgets.json');
const CATALOGUE_FILE = path.resolve(import.meta.dirname, '..', 'lib', 'estate', 'catalogue.generated.ts');

/** Every pack URL a catalogue's text names (packUrl, the poster's src and srcSet entries). */
export const catalogueUrls = (text) => [...new Set(text.match(/\/estate\/v\d+\.\d+\/[A-Za-z0-9._/-]+/g) ?? [])];

/**
 * The Estate catalogue's merge gate. Every /estate/ URL lib/estate/catalogue.generated.ts
 * names must be in the build (a missing poster or pack.json would ship a broken
 * poster and a Load that 404s into "the site was updated"), and a catalogue
 * generated from a DEV pack (`dev: true`) never builds on Vercel or CI: the dev
 * pack is never committed, so such a build can only be broken. Locally a dev
 * catalogue with the dev pack copied in builds, so the branch stays testable.
 */
export const checkEstateCatalogue = async (distDirectory, { catalogueFile = CATALOGUE_FILE, env = process.env } = {}) => {
  const failures = [];
  const text = await readFile(catalogueFile, 'utf8');
  const urls = catalogueUrls(text);
  if (!urls.length) failures.push(`${path.basename(catalogueFile)} names no /estate/ URL`);
  for (const url of urls) {
    try {
      await stat(path.join(distDirectory, ...url.slice(1).split('/')));
    } catch {
      failures.push(`${path.basename(catalogueFile)} names ${url}, which is not in the build: the pack it describes is not committed under public/estate`);
    }
  }
  if (/^\s*dev: true,/m.test(text) && (env.VERCEL || env.CI)) {
    failures.push(`${path.basename(catalogueFile)} was generated from a dev pack (dev: true): regenerate it from the published release pack before this deploys`);
  }
  console.log(`estate catalogue: ${urls.length} URLs in the build${/^\s*dev: true,/m.test(text) ? ' (DEV catalogue: never merge)' : ''}`);
  return failures;
};

// engineGzip is what the consent label counts for the engine (lib/estate/policy.ts
// consentBytes), so it must be an upper bound of what the click downloads;
// engineMinified caps the engine chunk itself. Missing either is a failure, never
// a skipped check.
export const readEngineBudgets = async (file = BUDGETS_FILE) => {
  const budgets = JSON.parse(await readFile(file, 'utf8'));
  for (const key of ['engineGzip', 'engineMinified']) {
    if (!Number.isInteger(budgets[key]) || budgets[key] <= 0) {
      throw new Error(`${path.basename(file)}: ${key} must be a positive integer, got ${JSON.stringify(budgets[key])}`);
    }
  }
  return { engineGzip: budgets.engineGzip, engineMinified: budgets.engineMinified };
};

const attribute = (attributes, name) => {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
};

// The entry chunk is whatever the built index.html loads as its one module script,
// read from the page itself rather than guessed from Vite's file naming.
export const findEntryScript = (html) => {
  const sources = [...html.matchAll(/<script\b([^>]*)>/gi)]
    .map(([, attributes]) => attributes)
    .filter((attributes) => attribute(attributes, 'type')?.toLowerCase() === 'module')
    .map((attributes) => attribute(attributes, 'src'))
    .filter((src) => src !== undefined);
  if (sources.length !== 1) {
    throw new Error(`Expected exactly one module script with a src in index.html, found ${sources.length}`);
  }
  const [src] = sources;
  if (!/^\/assets\/[^/?#]+\.js$/.test(src)) throw new Error(`Unexpected entry script path: ${src}`);
  return src.slice(1);
};

// Static imports in minified chunk code: `from"./x.js"` and `import"./x.js"`. A lazy
// chunk is `import("./x.js")`, which the parenthesis keeps out.
export const staticImports = (code) => [...code.matchAll(/\b(?:from|import)\s*["'](\.\/[^"'?#]+\.js)["']/g)]
  .map(([, specifier]) => specifier);

const format = (bytes) => bytes.toLocaleString('en-US');

// The main bundle is the entry plus every chunk it imports statically, transitively:
// all of it loads and runs on every page view. Today the entry imports nothing
// statically, but Rollup can move code the entry shares with a lazy chunk into a
// chunk of its own, and the cap must still see it.
//
// The engine rules (P4b): no engine code in the main bundle; exactly one chunk with
// WebGLRenderer in it, within engineMinified and engineGzip; and what the Load click
// downloads — the engine and HUD chunks plus whatever they import that the page has
// not already loaded — within engineGzip too, or the consent label would understate it.
export const checkBundle = async (distDirectory, options = {}) => {
  const budgets = options.budgets ?? await readEngineBudgets();
  const cache = new Map();
  const load = async (file) => {
    if (!cache.has(file)) cache.set(file, await readFile(path.join(distDirectory, file)));
    return cache.get(file);
  };
  const closure = async (starts) => {
    const files = [];
    const visit = async (file) => {
      if (files.includes(file)) return;
      files.push(file);
      for (const specifier of staticImports((await load(file)).toString('utf8'))) {
        await visit(path.posix.join(path.posix.dirname(file), specifier));
      }
    };
    for (const start of starts) await visit(start);
    return files;
  };
  const measure = async (files) => {
    let bytes = 0;
    let gzipped = 0;
    for (const file of files) {
      const content = await load(file);
      bytes += content.length;
      gzipped += gzipSync(content, { level: 9 }).length;
    }
    return { bytes, gzipped };
  };

  const html = await readFile(path.join(distDirectory, 'index.html'), 'utf8');
  const entry = findEntryScript(html);
  const files = await closure([entry]);
  const { bytes, gzipped } = await measure(files);
  console.log(`main bundle ${files.join(' + ')}: ${format(bytes)} B / ${format(MAIN_LIMIT)} B (gzip ${format(gzipped)} B)`);
  const failures = [];
  if (bytes > MAIN_LIMIT) {
    failures.push(`main bundle (${files.join(', ')}) is ${bytes} B, over the ${MAIN_LIMIT} B cap (min(B ${MAIN_BASELINE} + ${ESTATE_SHELL_ALLOWANCE}, ${MAIN_CHUNK_LIMIT}))`);
  }
  for (const file of files) {
    const code = (await load(file)).toString('utf8');
    const found = ENGINE_MARKERS.filter((marker) => code.includes(marker));
    if (found.length) failures.push(`${file} is in the main bundle and contains ${found.join(', ')}: the Estate engine must stay in its lazy chunk`);
    if (code.includes(BENCH_MARKER)) failures.push(`${file} is in the main bundle and carries the bench (${BENCH_MARKER}): it must stay a chunk of its own`);
  }

  const assets = (await readdir(path.join(distDirectory, 'assets'))).filter((name) => name.endsWith('.js')).sort().map((name) => `assets/${name}`);
  const engines = [];
  for (const file of assets) if ((await load(file)).toString('utf8').includes(ENGINE_MARKER)) engines.push(file);
  let engine = null;
  if (engines.length !== 1) {
    failures.push(`expected exactly one chunk containing ${ENGINE_MARKER} (the Estate engine), found ${engines.length}${engines.length ? `: ${engines.join(', ')}` : ''}`);
  } else {
    const [file] = engines;
    const own = await measure([file]);
    console.log(`estate engine ${file}: ${format(own.bytes)} B / ${format(budgets.engineMinified)} B (gzip ${format(own.gzipped)} B / ${format(budgets.engineGzip)} B)`);
    if (own.bytes > budgets.engineMinified) failures.push(`engine chunk ${file} is ${own.bytes} B, over engineMinified ${budgets.engineMinified} B`);
    if (own.gzipped > budgets.engineGzip) failures.push(`engine chunk ${file} is ${own.gzipped} B gzipped, over engineGzip ${budgets.engineGzip} B`);

    const named = (pattern) => assets.filter((asset) => pattern.test(path.posix.basename(asset)));
    const huds = named(HUD_CHUNK);
    const controllers = named(CONTROLLER_CHUNK);
    if (huds.length !== 1) failures.push(`expected one EstateHud-*.js chunk, found ${huds.length}`);
    if (controllers.length !== 1) failures.push(`expected one EstateController-*.js chunk, found ${controllers.length}`);
    const loaded = new Set([...files, ...await closure(controllers)]);
    const runtimeFiles = (await closure([file, ...huds])).filter((asset) => !loaded.has(asset));
    const runtime = await measure(runtimeFiles);
    console.log(`estate Load click ${runtimeFiles.join(' + ')}: gzip ${format(runtime.gzipped)} B / ${format(budgets.engineGzip)} B`);
    if (runtime.gzipped > budgets.engineGzip) {
      failures.push(`the Load click downloads ${runtime.gzipped} B gzipped (${runtimeFiles.join(', ')}), over engineGzip ${budgets.engineGzip} B, which the consent label counts`);
    }
    for (const asset of runtimeFiles) {
      if ((await load(asset)).toString('utf8').includes(BENCH_MARKER)) {
        failures.push(`${asset} is in the Load click and carries the bench (${BENCH_MARKER}): only ?estate-bench= may download it`);
      }
    }
    engine = { file, ...own, runtimeFiles, runtime };
  }
  return { entry, files, bytes, gzipped, engine, failures };
};

// Compared through realpath: Node resolves symlinks and junctions for import.meta
// but leaves argv[1] as typed, and a mismatch here would skip the check silently.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const distDirectory = path.resolve(import.meta.dirname, '..', 'dist');
  Promise.all([checkBundle(distDirectory), checkEstateCatalogue(distDirectory)]).then(([{ failures }, catalogue]) => {
    for (const failure of [...failures, ...catalogue]) console.error(failure);
    if (failures.length || catalogue.length) process.exitCode = 1;
  }).catch((error) => {

    console.error(error.message);
    process.exitCode = 1;
  });
}
