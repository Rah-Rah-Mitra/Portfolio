import { createHash } from 'node:crypto';
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

const DRAWING_SITE_FILE = path.resolve(import.meta.dirname, '..', 'lib', 'drawings', 'site.generated.ts');
const REPO_ROOT = path.resolve(import.meta.dirname, '..');

// scripts/drawings/build.ts GENERATOR_SOURCES, restated because this file cannot
// import TypeScript: the generator, then every module it reaches through a relative
// value import, sorted. The drawing set is their output, so a change to any of them
// (lib/estate/plan.ts's room groups, say) leaves the committed set stale.
// tests/drawing-set.test.ts pins the two lists to each other and to build.ts's imports.
export const DRAWING_GENERATOR_FILES = [
  'scripts/drawings/build.ts',
  'lib/estate/catalogue.generated.ts',
  'lib/estate/frames.ts',
  'lib/estate/ground.ts',
  'lib/estate/ids.ts',
  'lib/estate/nav.ts',
  'lib/estate/packBudgets.json',
  'lib/estate/palette.json',
  'lib/estate/palette.ts',
  'lib/estate/plan.ts',
  'lib/estate/schema.ts',
  'lib/estate/storeys.ts',
  'lib/estate/tiers.ts',
  'lib/estate/walk.ts',
];

/** build.ts digestGenerator: sha256 over each file's path and LF text, NUL-separated, in list order. */
export const drawingGeneratorDigest = async (root = REPO_ROOT, files = DRAWING_GENERATOR_FILES) => {
  const hash = createHash('sha256');
  for (const rel of files) hash.update(`${rel}\0${(await readFile(path.join(root, ...rel.split('/')), 'utf8')).replace(/\r\n/g, '\n')}\0`);
  return hash.digest('hex');
};

const quoted = (text, key) => text.match(new RegExp(`\\b${key}: "([^"]*)"`))?.[1];

/**
 * The desk drawing set's deploy gate (docs/portfolio/desk-drawing-set.md §4).
 * lib/drawings/*.generated.ts are generated from the committed estate pack by
 * scripts/drawings/build.ts (npm run drawings), and Vercel runs only this build:
 * tests/drawing-set.test.ts never runs on a deploy. So the build itself refuses a
 * drawing set that was not generated from the pack it ships (its name, edition,
 * commit and sha256), by the generator it ships (the digest of the generator and
 * the modules it imports, with LF line endings), or from a dev pack on Vercel or CI.
 */
export const checkDrawingSet = async (distDirectory, {
  siteFile = DRAWING_SITE_FILE, catalogueFile = CATALOGUE_FILE, generatorRoot = REPO_ROOT, generatorFiles = DRAWING_GENERATOR_FILES, env = process.env,
} = {}) => {
  const failures = [];
  const stale = 'run `npm run drawings` and commit lib/drawings with the pack';
  const site = await readFile(siteFile, 'utf8');
  const catalogue = await readFile(catalogueFile, 'utf8');
  const packUrl = quoted(catalogue, 'packUrl');
  const source = {
    packName: quoted(site, 'packName'), packSha256: quoted(site, 'packSha256'), edition: quoted(site, 'edition'),
    commit: quoted(site, 'commit'), generatorDigest: quoted(site, 'generatorDigest'),
  };
  const dev = /\bdev: true,/.test(site);
  if (!packUrl || Object.values(source).some((value) => !value)) {
    failures.push(`${path.basename(siteFile)} or the catalogue is missing its source fields`);
    return failures;
  }
  if (source.packName !== path.posix.basename(packUrl)) failures.push(`the drawing set was generated from ${source.packName}, but the catalogue's pack is ${path.posix.basename(packUrl)}: ${stale}`);
  if (source.edition !== quoted(catalogue, 'edition')) failures.push(`the drawing set's edition ${source.edition} is not the catalogue's: ${stale}`);
  if (source.commit !== quoted(catalogue, 'commit')) failures.push(`the drawing set's commit ${source.commit} is not the catalogue's: ${stale}`);
  try {
    const pack = await readFile(path.join(distDirectory, ...packUrl.slice(1).split('/')));
    if (createHash('sha256').update(pack).digest('hex') !== source.packSha256) failures.push(`the drawing set's packSha256 does not match ${packUrl} in the build: ${stale}`);
  } catch {
    failures.push(`${packUrl} is not in the build, so the drawing set cannot be checked against it`);
  }
  try {
    if (await drawingGeneratorDigest(generatorRoot, generatorFiles) !== source.generatorDigest) {
      failures.push(`the drawing generator (scripts/drawings/build.ts or one of the ${generatorFiles.length - 1} modules it imports) changed since the drawing set was generated: ${stale}`);
    }
  } catch (error) {
    failures.push(`a drawing generator source cannot be read (${error.message}): DRAWING_GENERATOR_FILES must name build.ts and the modules it imports`);
  }
  if (dev && (env.VERCEL || env.CI)) failures.push(`${path.basename(siteFile)} was generated from a dev pack (dev: true): regenerate it from the published release pack before this deploys`);
  console.log(`drawing set: ${source.packName}, ${source.edition} @ ${source.commit.slice(0, 7)}${dev ? ' (DEV: never merge)' : ''}`);
  return failures;
};

// The desk drawing set's chunks (docs/portfolio/desk-drawing-set.md §5). Gzipped
// caps at the measured size plus about 10 % (2026-10: layer 3,917 B, field
// 15,653 B, film 10,364 B, the largest building 4,321 B): the layer loads on every
// desktop visit with a backdrop on (the drawing's default), the field once the desk
// has room for a sheet, the film when the drawing may move, one building at a time.
export const DRAWING_BUDGETS = { layer: 4_400, layerAndField: 21_500, film: 11_500, sheet: 4_800 };
export const DRAWING_SET_MARKER = 'portfolio/drawing-set/1';
export const DRAWING_SHEET_MARKER = 'portfolio/drawing-sheet/1';
const DRAWING_CHUNKS = {
  layer: /^DeskBackdropLayer-[\w-]+\.js$/,
  field: /^DrawingField-[\w-]+\.js$/,
  film: /^drawingFilm-[\w-]+\.js$/,
  sheet: /^[A-Z]+_\d+\.generated-[\w-]+\.js$/,
};
const ESTATE_CHUNK = /(?:^|\/)(?:estate-(?:engine|shared|bench)|EstateHud)-[\w-]+\.js$/;

/**
 * The drawing's chunks: none of its markers in the main bundle; what each step
 * downloads within its cap; and nothing of the Estate engine in it. Each step (the
 * layer, then the field, which the layer imports lazily, then the film, which the
 * field does) downloads its chunk's static closure less what the page has already
 * loaded (the main bundle and the steps before it), measured as checkBundle
 * measures the Load click: Rollup can split a module the field shares with the
 * smoke or N-body field into a chunk of its own, and the caps must still see it.
 * The engine is found by what a file carries as well as by its name, because a
 * chunk split out of three or camera-controls keeps Vite's default name (the
 * drawing draws without three, and a value import of lib/estate would have put an
 * estate-shared chunk there, which the Estate's own boot pins forbid).
 */
export const checkDrawingChunks = async (distDirectory, { budgets = DRAWING_BUDGETS } = {}) => {
  const failures = [];
  const cache = new Map();
  const read = async (file) => {
    if (!cache.has(file)) cache.set(file, await readFile(path.join(distDirectory, file)));
    return cache.get(file);
  };
  const html = await readFile(path.join(distDirectory, 'index.html'), 'utf8');
  const entry = findEntryScript(html);
  const assets = (await readdir(path.join(distDirectory, 'assets'))).filter((name) => name.endsWith('.js')).sort();
  const named = (pattern) => assets.filter((name) => pattern.test(name)).map((name) => `assets/${name}`);
  const closure = async (start) => {
    const files = [];
    const visit = async (file) => {
      if (files.includes(file)) return;
      files.push(file);
      for (const specifier of staticImports((await read(file)).toString('utf8'))) await visit(path.posix.join(path.posix.dirname(file), specifier));
    };
    await visit(start);
    return files;
  };
  const main = await closure(entry);
  for (const file of main) {
    const code = (await read(file)).toString('utf8');
    for (const marker of [DRAWING_SET_MARKER, DRAWING_SHEET_MARKER]) if (code.includes(marker)) failures.push(`${file} is in the main bundle and carries the drawing set (${marker}): it must stay lazy`);
  }
  const gz = async (files) => {
    let bytes = 0;
    for (const file of files) bytes += gzipSync(await read(file), { level: 9 }).length;
    return bytes;
  };
  const one = (kind) => {
    const files = named(DRAWING_CHUNKS[kind]);
    if (files.length !== 1) failures.push(`expected one ${kind} chunk of the drawing set, found ${files.length}`);
    return files[0] ?? null;
  };
  const layer = one('layer');
  const field = one('field');
  const film = one('film');
  const sheets = named(DRAWING_CHUNKS.sheet);
  if (sheets.length !== 14) failures.push(`expected 14 building chunks of the drawing set, found ${sheets.length}`);
  if (field && !(await read(field)).toString('utf8').includes(DRAWING_SET_MARKER)) failures.push(`${field} does not carry the drawing set (${DRAWING_SET_MARKER})`);
  const loaded = new Set(main);
  const steps = { layer: { files: [], gzipped: 0 }, field: { files: [], gzipped: 0 }, film: { files: [], gzipped: 0 } };
  for (const [kind, start] of [['layer', layer], ['field', field], ['film', film]]) {
    if (!start) continue;
    const files = (await closure(start)).filter((file) => !loaded.has(file));
    for (const file of files) {
      loaded.add(file);
      const code = (await read(file)).toString('utf8');
      const found = [...ENGINE_MARKERS, BENCH_MARKER].filter((marker) => code.includes(marker));
      if (!found.length && !ESTATE_CHUNK.test(file)) continue;
      const carries = found.length ? ` carries ${found.join(', ')}` : '';
      const what = file === start ? `${start}${carries}` : `${start} statically imports ${file}${carries && `, which${carries}`}`;
      failures.push(`${what}: the drawing set must not pull in the Estate engine`);
    }
    steps[kind] = { files, gzipped: await gz(files) };
  }
  let largest = 0;
  for (const sheet of sheets) {
    const size = await gz([sheet]);
    largest = Math.max(largest, size);
    if (size > budgets.sheet) failures.push(`${sheet} is ${size} B gzipped, over the drawing set's ${budgets.sheet} B per building`);
  }
  const { layer: first, field: second, film: third } = steps;
  if (first.gzipped > budgets.layer) failures.push(`the desk layer downloads ${first.gzipped} B gzipped (${first.files.join(', ')}), over ${budgets.layer} B`);
  if (first.gzipped + second.gzipped > budgets.layerAndField) {
    failures.push(`the desk layer and the drawing field download ${first.gzipped + second.gzipped} B gzipped (${[...first.files, ...second.files].join(', ')}), over ${budgets.layerAndField} B`);
  }
  if (third.gzipped > budgets.film) failures.push(`the drawing film downloads ${third.gzipped} B gzipped (${third.files.join(', ')}), over ${budgets.film} B`);
  const step = ({ files, gzipped }) => `${format(gzipped)} B${files.length > 1 ? ` (${files.length} files)` : ''}`;
  console.log(`drawing chunks: layer ${step(first)}, field ${step(second)}, film ${step(third)}, largest building ${format(largest)} B (gzip)`);
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
  Promise.all([checkBundle(distDirectory), checkEstateCatalogue(distDirectory), checkDrawingSet(distDirectory), checkDrawingChunks(distDirectory)]).then(([{ failures }, catalogue, drawings, chunks]) => {
    for (const failure of [...failures, ...catalogue, ...drawings, ...chunks]) console.error(failure);
    if (failures.length || catalogue.length || drawings.length || chunks.length) process.exitCode = 1;
  }).catch((error) => {

    console.error(error.message);
    process.exitCode = 1;
  });
}
