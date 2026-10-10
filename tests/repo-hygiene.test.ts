import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { normalizePath, resolveConfig, type UserConfig } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import {
  BENCH_MARKER, DRAWING_SET_MARKER, DRAWING_SHEET_MARKER, ENGINE_MARKERS, MAIN_BASELINE, MAIN_CHUNK_LIMIT, MAIN_LIMIT, catalogueUrls, checkBundle,
  checkDrawingChunks, checkDrawingSet, checkEstateCatalogue, findEntryScript,
  readEngineBudgets, staticImports,
} from '../scripts/check-bundle.mjs';
import viteConfig from '../vite.config';

// external/Bonsai-Estate is a gitlink that records which upstream commit the estate
// pack came from. Nothing in the build, the tests or the deploy reads it: upstream
// does not track its model/ export, and a clone without the submodule must still
// build. This file keeps it that way.
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (relative: string) => readFile(path.join(root, relative), 'utf8');

// The one script allowed to look inside the submodule (P2: `git -C … rev-parse`,
// offline). This file is skipped too: its own literals name the submodule path.
const ALLOWED = new Set(['scripts/estate/lib/provenance.mjs', 'tests/repo-hygiene.test.ts']);
// These folders recursively, plus every code file at the repository root (site data,
// the dev servers and every tool config), so a new root file is covered unasked.
const SCANNED = ['components', 'lib', 'contexts', 'server', 'api', 'scripts', 'tests', 'hooks', 'workers'];
const CODE = /\.(?:[cm]?js|tsx?)$/;
const OTHER = /\.(?:py|ps1|sh)$/;

// A path with an `external` segment followed by a separator: '../external/x',
// 'external\\x', 'git -C external/x'. Not 'some-external/' and not `externalLink`.
const EXTERNAL_PATH = /(?<![\w.-])external[\\/]/;
// Calls that take a path: a bare 'external' segment inside one of these counts too,
// so path.join(root, 'external', …) cannot slip past the slash rule above.
const PATH_CALL = /^(?:join|resolve|normalize|readFile|readFileSync|readdir|readdirSync|existsSync|stat|statSync|lstat|lstatSync|access|accessSync|open|opendir|createReadStream|cp|cpSync|copyFile|glob|execFile|execFileSync|exec|execSync|spawn|spawnSync|fork|URL|pathToFileURL|require)$/;
const isBareExternal = (value: string) => value.replace(/^(?:\.{1,2}[\\/])+/, '').replace(/[\\/]+$/, '') === 'external';

const calleeName = (node: ts.CallExpression | ts.NewExpression) => {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return '';
};

const externalReads = (fileName: string, text: string): string[] => {
  if (OTHER.test(fileName)) {
    return text.split(/\r?\n/)
      .filter((line) => !/^\s*#/.test(line) && EXTERNAL_PATH.test(line))
      .map((line) => line.trim());
  }
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : fileName.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, kind);
  const hits: string[] = [];
  const literalText = (node: ts.Node) => (
    ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
      ? node.text
      : undefined
  );
  const visit = (node: ts.Node, inPathCall: boolean) => {
    const value = literalText(node);
    if (value !== undefined && (EXTERNAL_PATH.test(value) || (inPathCall && isBareExternal(value)))) hits.push(value);
    const pathCall = (ts.isCallExpression(node) || ts.isNewExpression(node)) && PATH_CALL.test(calleeName(node));
    ts.forEachChild(node, (child) => visit(child, inPathCall || pathCall));
  };
  visit(source, false);
  return hits;
};

const walk = async (relative: string): Promise<string[]> => {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) return [];
  if (CODE.test(relative) || OTHER.test(relative)) return [relative];
  const entries = await readdir(absolute, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries
    .filter((entry) => entry.name !== 'node_modules')
    .map((entry) => (entry.isDirectory() ? walk(`${relative}/${entry.name}`) : CODE.test(entry.name) || OTHER.test(entry.name) ? [`${relative}/${entry.name}`] : [])));
  return nested.flat();
};

const scannedFiles = async () => {
  const atRoot = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && (CODE.test(entry.name) || OTHER.test(entry.name)))
    .map((entry) => entry.name);
  const nested = (await Promise.all(SCANNED.map(walk))).flat();
  return [...atRoot, ...nested].filter((file) => !ALLOWED.has(file));
};

type ServeConfig = UserConfig & {
  server: { watch: { ignored: string[] }; fs: { deny: string[] } };
  optimizeDeps: { entries: string[] };
};
const serveConfig = () => (viteConfig as unknown as (env: { command: 'serve'; mode: string }) => ServeConfig)({ command: 'serve', mode: 'development' });

// Vite's own matcher for a deny list: picomatch over absolute paths, which the dev
// server applies to every module it loads. The watcher matches its globs the same way.
const viteMatcher = async (patterns: string[]) => {
  const config = serveConfig();
  const resolved = await resolveConfig({
    ...config,
    configFile: false,
    root,
    logLevel: 'silent',
    server: { ...config.server, fs: { deny: patterns } },
  }, 'serve');
  return (resolved as unknown as { fsDenyGlob: (file: string) => boolean }).fsDenyGlob;
};

describe('Bonsai-Estate submodule', () => {
  it('is declared once, by name, at external/Bonsai-Estate over https, with no branch, shallow or update keys', async () => {
    const lines = (await read('.gitmodules')).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    expect(lines).toEqual([
      '[submodule "Bonsai-Estate"]',
      'path = external/Bonsai-Estate',
      'url = https://github.com/Rah-Rah-Mitra/Bonsai-Estate.git',
    ]);
  });

  it.skipIf(!existsSync(path.join(root, '.git')))('is a gitlink in the portfolio index', () => {
    const stage = execFileSync('git', ['ls-files', '--stage', '--', 'external/Bonsai-Estate'], { cwd: root, encoding: 'utf8' }).trim();
    expect(stage).toMatch(/^160000 [0-9a-f]{40} 0\texternal\/Bonsai-Estate$/);
  });

  it('is excluded from tsc, whose file list never reaches into it', async () => {
    const { config, error } = ts.parseConfigFileTextToJson('tsconfig.json', await read('tsconfig.json'));
    expect(error).toBeUndefined();
    expect(config.exclude).toEqual(expect.arrayContaining(['node_modules', '**/node_modules', 'dist', 'external', 'artifacts']));
    const { fileNames } = ts.parseJsonConfigFileContent(config, ts.sys, root);
    expect(fileNames.filter((name) => /^(?:external|artifacts|dist)[\\/]/.test(path.relative(root, name)))).toEqual([]);
  });

  it('is neither watched nor served by the dev server, and never crawled for entries', async () => {
    const config = serveConfig();
    expect(config.optimizeDeps.entries).toEqual(['index.html']);
    // Setting fs.deny replaces Vite's defaults, so they must still be there.
    expect(config.server.fs.deny).toEqual(expect.arrayContaining(['.env', '.env.*', '*.{crt,pem}', '**/.git/**']));
    // Anchored to this checkout. A bare '**/external/**' matches absolute paths, so a
    // checkout under any folder named external would be refused every file it has.
    for (const pattern of [...config.server.watch.ignored, ...config.server.fs.deny]) {
      expect(pattern).not.toMatch(/^\*\*\/(?:external|artifacts)\b/);
    }
    const checkout = normalizePath(path.resolve(root));
    const denied = await viteMatcher(config.server.fs.deny);
    expect(denied(`${checkout}/external/Bonsai-Estate/README.md`)).toBe(true);
    expect(denied(`${checkout}/External/Bonsai-Estate/README.md`)).toBe(true);
    expect(denied(`${checkout}/.env`)).toBe(true);
    expect(denied(`${checkout}/.git/config`)).toBe(true);
    expect(denied(`${checkout}/index.tsx`)).toBe(false);
    expect(denied(`${checkout}/components/external/a.ts`)).toBe(false);
    const ignored = await viteMatcher(config.server.watch.ignored);
    expect(ignored(`${checkout}/external/Bonsai-Estate/README.md`)).toBe(true);
    expect(ignored(`${checkout}/artifacts/estate/v1.2/pack.json`)).toBe(true);
    expect(ignored(`${checkout}/index.tsx`)).toBe(false);
    expect(ignored(`${checkout}/lib/artifacts/a.ts`)).toBe(false);
  });

  it('is left out of the Vercel upload, at the root only', async () => {
    const lines = (await read('.vercelignore')).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
    // gitignore rules: a leading slash anchors a name to the root; without one it
    // matches a folder of that name at any depth. An inner slash anchors already.
    expect(lines).toEqual(['/external/', '/artifacts/', 'scripts/estate/node_modules/']);
  });

  it('flags a read of the submodule however it is spelled', () => {
    expect(externalReads('a.ts', "import data from '../external/Bonsai-Estate/model/x.json';")).toHaveLength(1);
    expect(externalReads('a.mjs', "await readFile(path.join(root, 'external', 'Bonsai-Estate', 'README.md'));")).toEqual(['external']);
    expect(externalReads('a.mjs', "execFileSync('git', ['-C', 'external/Bonsai-Estate', 'rev-parse', 'HEAD']);")).toHaveLength(1);
    expect(externalReads('a.ts', 'const dir = `${root}/external/Bonsai-Estate`;')).toHaveLength(1);
    expect(externalReads('a.py', "ROOT = Path('external\\\\Bonsai-Estate')")).toHaveLength(1);
    // Not a path into the submodule.
    expect(externalReads('a.tsx', "const external = href.startsWith('http'); // see external/ docs")).toEqual([]);
    expect(externalReads('a.ts', "expect(excluded).toContain('external');")).toEqual([]);
    expect(externalReads('a.ts', "import x from 'some-external/lib';")).toEqual([]);
  });

  it('is never imported or read by site, server, script, config or test code', async () => {
    const files = await scannedFiles();
    expect(files.length).toBeGreaterThan(100);
    expect(files).toEqual(expect.arrayContaining([
      'App.tsx', 'index.tsx', 'semanticRender.tsx', 'portfolioData.ts', 'siteConfig.ts', 'server.mjs', 'dev.mjs',
      'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'tailwind.config.js', 'postcss.config.js',
      'hooks/useFocusTrap.ts', 'workers/nbody.worker.ts',
    ]));
    const offenders = (await Promise.all(files.map(async (file) => externalReads(file, await read(file)).map((hit) => `${file}: ${hit}`)))).flat();
    expect(offenders).toEqual([]);
  });
});

describe('build hygiene', () => {
  it('ends the build with the bundle check, after the prerender', async () => {
    const { scripts } = JSON.parse(await read('package.json')) as { scripts: Record<string, string> };
    expect(scripts.build).toMatch(/^vite build && node scripts\/prerender-semantic\.mjs && node scripts\/check-bundle\.mjs$/);
    expect(MAIN_CHUNK_LIMIT).toBe(510_000);
  });

  it('finds the entry chunk from the page, not from a file name', () => {
    const head = '<script type="application/ld+json">{}</script><link rel="modulepreload" href="/assets/module-a.js">';
    expect(findEntryScript(`${head}<script type="module" crossorigin src="/assets/index-Ca_s2bx3.js"></script>`)).toBe('assets/index-Ca_s2bx3.js');
    expect(findEntryScript("<script crossorigin src='/assets/main-x1.js' type=module></script>")).toBe('assets/main-x1.js');
    expect(() => findEntryScript(head)).toThrow(/exactly one/);
    expect(() => findEntryScript('<script type="module" src="/assets/a.js"></script><script type="module" src="/assets/b.js"></script>')).toThrow(/exactly one/);
  });

  it('reads static imports from minified chunks, never lazy ones', () => {
    expect(staticImports('import{a as b}from"./vendor-x1.js";import"./polyfill-y2.js";const c=()=>import("./lazy-z3.js");export*from\'./re-q4.js\';'))
      .toEqual(['./vendor-x1.js', './polyfill-y2.js', './re-q4.js']);
    expect(staticImports('const m=()=>__vitePreload(()=>import("./module-zz3LrXDo.js"),__vite__mapDeps([0]));')).toEqual([]);
  });

  // A fake dist: the entry, a chunk it shares statically, the estate controller
  // (lazy, loaded before the consent button), and the Load click's engine, HUD and
  // the chunk those two share. Sizes are spaces, so gzip shrinks them to nothing.
  const fakeDist = async (dist: string, chunks: Record<string, string>) => {
    await mkdir(path.join(dist, 'assets'), { recursive: true });
    await writeFile(path.join(dist, 'index.html'), '<script type="module" crossorigin src="/assets/index-a1.js"></script>');
    for (const [name, code] of Object.entries(chunks)) await writeFile(path.join(dist, 'assets', name), code);
  };
  const BUDGETS = { engineGzip: 307_200, engineMinified: 950_000 };
  const ENTRY = 'import{x}from"./shared-b2.js";const l=()=>import("./EstateController-c3.js");';
  // A shared chunk imports the entry back, as Rollup's chunks do.
  const shared = (size: number) => `import"./index-a1.js";export const x=1;${' '.repeat(size)}`;
  const engineSet = (engine: string) => ({
    'EstateController-c3.js': 'import"./index-a1.js";export const c=1;const e=()=>import("./estate-engine-d4.js");',
    'estate-engine-d4.js': `import{c}from"./EstateController-c3.js";import{s}from"./announce-e5.js";${engine}`,
    'EstateHud-f6.js': 'import"./index-a1.js";import{s}from"./announce-e5.js";export const H=1;',
    'announce-e5.js': 'import{c}from"./EstateController-c3.js";export const s=1;',
  });

  it('caps the entry together with every chunk it imports statically', async () => {
    const dist = await mkdtemp(path.join(tmpdir(), 'check-bundle-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await fakeDist(dist, { 'index-a1.js': ENTRY, 'shared-b2.js': shared(1000), ...engineSet('this.isWebGLRenderer=!0;') });
      const under = await checkBundle(dist, { budgets: BUDGETS });
      expect(under.files).toEqual(['assets/index-a1.js', 'assets/shared-b2.js']);
      expect(under.bytes).toBe(ENTRY.length + shared(1000).length);
      expect(under.failures).toEqual([]);
      // Over the cap only once the static chunk is counted; the entry alone is tiny.
      await writeFile(path.join(dist, 'assets', 'shared-b2.js'), shared(MAIN_LIMIT));
      const over = await checkBundle(dist, { budgets: BUDGETS });
      expect(over.bytes).toBeGreaterThan(MAIN_LIMIT);
      expect(over.failures).toHaveLength(1);
    } finally {
      log.mockRestore();
      await rm(dist, { recursive: true, force: true });
    }
  });

  it('holds the main bundle to B + 12,000 for the Estate shell, under the absolute cap', () => {
    expect(MAIN_BASELINE).toBe(496_834);
    expect(MAIN_LIMIT).toBe(Math.min(MAIN_BASELINE + 12_000, MAIN_CHUNK_LIMIT));
    expect(MAIN_LIMIT).toBe(508_834);
    expect(ENGINE_MARKERS).toEqual(['WebGLRenderer', 'GLTFLoader', 'MeshoptDecoder', 'camera-controls']);
  });

  it('keeps the engine out of the main bundle and in exactly one chunk, within its budgets', async () => {
    const dist = await mkdtemp(path.join(tmpdir(), 'check-bundle-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const run = async (chunks: Record<string, string>, budgets = BUDGETS) => {
      await rm(dist, { recursive: true, force: true });
      await fakeDist(dist, chunks);
      return checkBundle(dist, { budgets });
    };
    try {
      const base = { 'index-a1.js': ENTRY, 'shared-b2.js': shared(10), ...engineSet('this.isWebGLRenderer=!0;') };
      const ok = await run(base);
      expect(ok.failures).toEqual([]);
      expect(ok.engine?.file).toBe('assets/estate-engine-d4.js');
      // The click downloads the engine, the HUD and what they share; the entry and
      // the controller (already loaded at consent) are not counted again.
      expect(ok.engine?.runtimeFiles).toEqual(['assets/estate-engine-d4.js', 'assets/announce-e5.js', 'assets/EstateHud-f6.js']);

      // Any engine name in the main bundle fails, wherever it sits.
      for (const marker of ENGINE_MARKERS) {
        const leaked = await run({ ...base, 'shared-b2.js': `${shared(10)}"${marker}"` });
        expect(leaked.failures.join(' | ')).toMatch(new RegExp(`shared-b2\\.js is in the main bundle and contains ${marker}`));
      }
      // No engine chunk, or two, fails.
      expect((await run({ ...base, ...engineSet('const r=1;') })).failures.join(' | ')).toMatch(/exactly one chunk containing WebGLRenderer.*found 0/);
      expect((await run({ ...base, 'NBodyField-g7.js': 'class WebGLRenderer{}' })).failures.join(' | ')).toMatch(/found 2: assets\/NBodyField-g7\.js, assets\/estate-engine-d4\.js/);
      // Over either engine budget fails; so does a click that downloads more than the label counts.
      const engineBytes = ok.engine!.bytes;
      expect((await run(base, { ...BUDGETS, engineMinified: engineBytes - 1 })).failures.join(' | ')).toMatch(/over engineMinified/);
      const tight = await run(base, { ...BUDGETS, engineGzip: ok.engine!.gzipped });
      expect(tight.failures).toEqual([expect.stringMatching(/the Load click downloads \d+ B gzipped .* over engineGzip/)]);
      // The HUD and controller chunks are found by their source names; losing one is a failure, not a smaller sum.
      const { 'EstateHud-f6.js': _hud, ...withoutHud } = base;
      expect((await run(withoutHud)).failures.join(' | ')).toMatch(/expected one EstateHud-\*\.js chunk, found 0/);
      // The bench is its own chunk: lazy from the engine it passes; pulled into the Load click or the main bundle it fails.
      const bench = `const s="${BENCH_MARKER}";`;
      expect((await run({ ...base, 'estate-bench-h8.js': bench, 'estate-engine-d4.js': `${base['estate-engine-d4.js']}const b=()=>import("./estate-bench-h8.js");` })).failures).toEqual([]);
      expect((await run({ ...base, 'announce-e5.js': `${base['announce-e5.js']}${bench}` })).failures)
        .toEqual([expect.stringMatching(/assets\/announce-e5\.js is in the Load click and carries the bench/)]);
      expect((await run({ ...base, 'shared-b2.js': `${shared(10)}${bench}` })).failures)
        .toEqual([expect.stringMatching(/shared-b2\.js is in the main bundle and carries the bench/)]);
    } finally {
      log.mockRestore();
      await rm(dist, { recursive: true, force: true });
    }
  });

  it('fails the build on a catalogue whose pack is not in it, and on a dev catalogue on Vercel or CI', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'check-bundle-catalogue-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const catalogueFile = path.join(dir, 'catalogue.generated.ts');
      const dist = path.join(dir, 'dist');
      const text = (dev: boolean) => `export const ESTATE_CATALOGUE = {\n  packUrl: "/estate/v1.2/pack.0000aaaa.json",\n  dev: ${dev},\n  poster: { src: "/estate/v1.2/poster/a-800.0000bbbb.jpg", srcSet: "/estate/v1.2/poster/a-800.0000cccc.webp 800w, /estate/v1.2/poster/a-1600.0000dddd.webp 1600w" },\n} as const;\n`;
      await writeFile(catalogueFile, text(false));
      expect(catalogueUrls(text(false))).toEqual([
        '/estate/v1.2/pack.0000aaaa.json', '/estate/v1.2/poster/a-800.0000bbbb.jpg',
        '/estate/v1.2/poster/a-800.0000cccc.webp', '/estate/v1.2/poster/a-1600.0000dddd.webp',
      ]);
      // Nothing of the pack in the build: one failure per URL.
      expect(await checkEstateCatalogue(dist, { catalogueFile, env: {} })).toHaveLength(4);
      for (const url of catalogueUrls(text(false))) {
        await mkdir(path.dirname(path.join(dist, url)), { recursive: true });
        await writeFile(path.join(dist, url), 'x');
      }
      expect(await checkEstateCatalogue(dist, { catalogueFile, env: {} })).toEqual([]);
      // A dev catalogue builds locally (the dev pack copied in), never on Vercel or CI.
      await writeFile(catalogueFile, text(true));
      expect(await checkEstateCatalogue(dist, { catalogueFile, env: {} })).toEqual([]);
      expect(await checkEstateCatalogue(dist, { catalogueFile, env: { VERCEL: '1' } })).toEqual([expect.stringMatching(/generated from a dev pack/)]);
      expect(await checkEstateCatalogue(dist, { catalogueFile, env: { CI: 'true' } })).toHaveLength(1);
    } finally {
      log.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails the build on a stale desk drawing set: another pack, another generator, or a dev pack on Vercel or CI', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'check-bundle-drawings-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const dist = path.join(dir, 'dist');
      const catalogueFile = path.join(dir, 'catalogue.generated.ts');
      const siteFile = path.join(dir, 'site.generated.ts');
      const sha = (text: string) => createHash('sha256').update(text).digest('hex');
      // The generator and a module it imports, digested as build.ts digestGenerator does.
      const generatorRoot = path.join(dir, 'repo');
      const generatorFiles = ['scripts/build.ts', 'lib/plan.ts'];
      const generatorText: Record<string, string> = { 'scripts/build.ts': 'export const build = 1;\nexport const two = 2;\n', 'lib/plan.ts': 'export const groups = 3;\n' };
      const writeGenerator = async (texts: Record<string, string>) => {
        for (const [rel, text] of Object.entries(texts)) {
          await mkdir(path.dirname(path.join(generatorRoot, rel)), { recursive: true });
          await writeFile(path.join(generatorRoot, rel), text);
        }
      };
      await writeGenerator(generatorText);
      const generator = generatorFiles.map((rel) => `${rel}\0${generatorText[rel]}\0`).join('');
      await writeFile(catalogueFile, 'export const ESTATE_CATALOGUE = {\n  edition: "v1.2",\n  packUrl: "/estate/v1.2/pack.0000aaaa.json",\n  commit: "abc123def",\n  dev: false,\n} as const;\n');
      await mkdir(path.join(dist, 'estate', 'v1.2'), { recursive: true });
      await writeFile(path.join(dist, 'estate', 'v1.2', 'pack.0000aaaa.json'), '{"pack":1}');
      const site = (o: Partial<Record<'packName' | 'packSha256' | 'edition' | 'commit' | 'generatorDigest', string>> & { dev?: boolean } = {}) => [
        'export const DRAWING_SOURCE: DrawingSource = {',
        `  packName: "${o.packName ?? 'pack.0000aaaa.json'}",`,
        `  packSha256: "${o.packSha256 ?? sha('{"pack":1}')}",`,
        `  edition: "${o.edition ?? 'v1.2'}",`,
        `  commit: "${o.commit ?? 'abc123def'}",`,
        `  dev: ${o.dev ?? false},`,
        `  generatorDigest: "${o.generatorDigest ?? sha(generator)}",`,
        '};',
      ].join('\n');
      const check = async (text: string, env: Record<string, string> = {}) => {
        await writeFile(siteFile, text);
        return checkDrawingSet(dist, { siteFile, catalogueFile, generatorRoot, generatorFiles, env });
      };
      expect(await check(site())).toEqual([]);
      expect(await check(site({ packName: 'pack.1111bbbb.json' }))).toEqual([expect.stringMatching(/generated from pack\.1111bbbb\.json/)]);
      expect(await check(site({ packSha256: sha('another pack') }))).toEqual([expect.stringMatching(/packSha256 does not match/)]);
      expect(await check(site({ commit: 'fff' }))).toEqual([expect.stringMatching(/commit fff is not the catalogue's/)]);
      expect(await check(site({ generatorDigest: sha('an older generator') }))).toEqual([expect.stringMatching(/build\.ts or one of the 1 modules it imports\) changed/)]);
      // A module the generator imports changed and build.ts did not: the set is stale all the same.
      await writeGenerator({ 'lib/plan.ts': 'export const groups = 4;\n' });
      expect(await check(site())).toEqual([expect.stringMatching(/drawing generator .* changed since the drawing set was generated/)]);
      // The digest is of each file with LF line endings, whatever the checkout wrote.
      await writeGenerator(Object.fromEntries(Object.entries(generatorText).map(([rel, text]) => [rel, text.replace(/\n/g, '\r\n')])));
      expect(await check(site())).toEqual([]);
      // A source the list names but the checkout lacks is a failure, never a skipped check.
      expect(await checkDrawingSet(dist, { siteFile, catalogueFile, generatorRoot, generatorFiles: [...generatorFiles, 'lib/gone.ts'], env: {} }))
        .toEqual([expect.stringMatching(/a drawing generator source cannot be read/)]);
      // A dev set builds locally, never on Vercel or CI.
      expect(await check(site({ dev: true }))).toEqual([]);
      expect(await check(site({ dev: true }), { VERCEL: '1' })).toEqual([expect.stringMatching(/generated from a dev pack/)]);
      expect(await check(site({ dev: true }), { CI: 'true' })).toHaveLength(1);
    } finally {
      log.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails the build on drawing chunks that leak into the main bundle, outgrow their caps or pull in the Estate engine', async () => {
    const dist = await mkdtemp(path.join(tmpdir(), 'check-bundle-drawing-chunks-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await mkdir(path.join(dist, 'assets'));
      await writeFile(path.join(dist, 'index.html'), '<script type="module" src="/assets/index-a1.js"></script>');
      const write = (name: string, text: string) => writeFile(path.join(dist, 'assets', name), text);
      const sheets = ['BLK_501', 'BLK_502', 'BLK_503', 'BLK_504', 'BLK_505', 'BLK_506', 'BLK_507', 'BLK_508', 'BLK_509', 'BLK_510', 'BLK_511', 'BLK_512', 'MSCP_513', 'NC_514'];
      const good = async () => {
        await write('index-a1.js', 'export const app = 1;');
        await write('DeskBackdropLayer-b2.js', 'import{x}from"./index-a1.js";export default 1;');
        await write('DrawingField-c3.js', `import{y}from"./DeskBackdropLayer-b2.js";const s="${DRAWING_SET_MARKER}";`);
        await write('drawingFilm-d4.js', 'import{z}from"./DrawingField-c3.js";export const film=1;');
        for (const id of sheets) await write(`${id}.generated-e5.js`, `export const DRAWING_SHEET_SCHEMA="${DRAWING_SHEET_MARKER}";`);
      };
      const budgets = { layer: 400, layerAndField: 800, film: 400, sheet: 400 };
      await good();
      expect(await checkDrawingChunks(dist, { budgets })).toEqual([]);
      await write('index-a1.js', `export const app = "${DRAWING_SET_MARKER}";`);
      expect(await checkDrawingChunks(dist, { budgets })).toEqual([expect.stringMatching(/main bundle and carries the drawing set/)]);
      await good();
      // Hashes chained: text that gzip cannot shrink below the cap.
      const noise = Array.from({ length: 40 }, (_, i) => createHash('sha256').update(String(i)).digest('hex')).join('');
      await write('BLK_509.generated-e5.js', `export const s="${DRAWING_SHEET_MARKER}";const n="${noise}";`);
      expect(await checkDrawingChunks(dist, { budgets })).toEqual([expect.stringMatching(/BLK_509\.generated-e5\.js is \d+ B gzipped/)]);
      await good();
      await write('drawingFilm-d4.js', 'import{z}from"./DrawingField-c3.js";import{e}from"./estate-engine-f6.js";');
      await write('estate-engine-f6.js', 'export const e=1;');
      expect(await checkDrawingChunks(dist, { budgets })).toEqual([expect.stringMatching(/drawingFilm-d4\.js statically imports assets\/estate-engine-f6\.js/)]);
      // A chunk Rollup splits out of three or camera-controls keeps Vite's default name:
      // it is found by what it carries, whichever step pulls it in.
      const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const marker of [...ENGINE_MARKERS, BENCH_MARKER]) {
        await good();
        await write('DrawingField-c3.js', `import{y}from"./DeskBackdropLayer-b2.js";import{W}from"./three.core-zz.js";const s="${DRAWING_SET_MARKER}";`);
        await write('three.core-zz.js', `export class W{};const n="${marker}";`);
        expect(await checkDrawingChunks(dist, { budgets }))
          .toEqual([expect.stringMatching(new RegExp(`DrawingField-c3\\.js statically imports assets/three\\.core-zz\\.js, which carries ${escape(marker)}`))]);
        await good();
        await write('DeskBackdropLayer-b2.js', `import{x}from"./index-a1.js";const n="${marker}";export default 1;`);
        expect(await checkDrawingChunks(dist, { budgets })).toEqual([expect.stringMatching(new RegExp(`DeskBackdropLayer-b2\\.js carries ${escape(marker)}`))]);
      }
      // What a step downloads is its chunk plus every chunk it imports that the page has
      // not loaded: a helper split out for the field (shared with the smoke, say) counts
      // in the field's bytes, and in the film's when the film is what pulls it in.
      await good();
      await write('helper-qq.js', `export const h="${noise}";`);
      await write('DrawingField-c3.js', `import{y}from"./DeskBackdropLayer-b2.js";import{h}from"./helper-qq.js";const s="${DRAWING_SET_MARKER}";`);
      expect(await checkDrawingChunks(dist, { budgets }))
        .toEqual([expect.stringMatching(/the desk layer and the drawing field download \d+ B gzipped \(assets\/DeskBackdropLayer-b2\.js, assets\/DrawingField-c3\.js, assets\/helper-qq\.js\), over 800 B/)]);
      await good();
      await write('drawingFilm-d4.js', 'import{z}from"./DrawingField-c3.js";import{h}from"./helper-qq.js";export const film=1;');
      expect(await checkDrawingChunks(dist, { budgets }))
        .toEqual([expect.stringMatching(/the drawing film downloads \d+ B gzipped \(assets\/drawingFilm-d4\.js, assets\/helper-qq\.js\), over 400 B/)]);
      // A chunk the page has already loaded is not counted again: in the main bundle the
      // helper costs the film nothing, and brought by the layer it is the layer's alone.
      await write('index-a1.js', 'import{h}from"./helper-qq.js";export const app = 1;');
      expect(await checkDrawingChunks(dist, { budgets })).toEqual([]);
      await good();
      await write('DeskBackdropLayer-b2.js', 'import{x}from"./index-a1.js";import{h}from"./helper-qq.js";export default 1;');
      await write('DrawingField-c3.js', `import{y}from"./DeskBackdropLayer-b2.js";import{h}from"./helper-qq.js";const s="${DRAWING_SET_MARKER}";`);
      expect(await checkDrawingChunks(dist, { budgets: { ...budgets, layer: 2_000, layerAndField: 2_000 } })).toEqual([]);
      expect(await checkDrawingChunks(dist, { budgets: { ...budgets, layer: 2_000, layerAndField: 1_000 } }))
        .toEqual([expect.stringMatching(/the desk layer and the drawing field download \d+ B gzipped \(assets\/DeskBackdropLayer-b2\.js, assets\/helper-qq\.js, assets\/DrawingField-c3\.js\), over 1000 B/)]);
      await good();
      await write('DrawingField-c3.js', 'import{y}from"./DeskBackdropLayer-b2.js";');
      expect(await checkDrawingChunks(dist, { budgets })).toEqual([expect.stringMatching(/does not carry the drawing set/)]);
    } finally {
      log.mockRestore();
      await rm(dist, { recursive: true, force: true });
    }
  });

  it('checks the committed drawing set against the committed pack and generator', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'check-bundle-drawings-real-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      // The real files, with the pack where the build puts it.
      const catalogue = await read('lib/estate/catalogue.generated.ts');
      const packUrl = /packUrl: "([^"]+)"/.exec(catalogue)![1];
      await mkdir(path.dirname(path.join(dir, packUrl)), { recursive: true });
      await writeFile(path.join(dir, packUrl), await readFile(path.join(root, 'public', packUrl)));
      expect(await checkDrawingSet(dir, { env: { CI: 'true' } })).toEqual([]);
    } finally {
      log.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reads both engine budgets from packBudgets.json and refuses a missing one', async () => {

    const budgets = await readEngineBudgets();
    const file = JSON.parse(await read('lib/estate/packBudgets.json')) as Record<string, unknown>;
    expect(budgets).toEqual({ engineGzip: file.engineGzip, engineMinified: file.engineMinified });
    const dir = await mkdtemp(path.join(tmpdir(), 'check-bundle-budgets-'));
    try {
      for (const missing of ['engineGzip', 'engineMinified']) {
        const { [missing]: _gone, ...rest } = file;
        await writeFile(path.join(dir, 'b.json'), JSON.stringify(rest));
        await expect(readEngineBudgets(path.join(dir, 'b.json'))).rejects.toThrow(new RegExp(`${missing} must be a positive integer`));
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps estate pack bytes exact through checkout, and caches hashed files forever', async () => {
    const attributes = (await read('.gitattributes')).split(/\r?\n/).map((line) => line.trim());
    expect(attributes).toEqual(expect.arrayContaining([
      'public/estate/** -text',
      'tests/fixtures/estate/** -text',
      '*.glb binary',
      '*.gz binary',
      'lib/estate/catalogue.generated.ts text eol=lf',
      'lib/drawings/**/*.generated.ts text eol=lf',
    ]));
    const immutable = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }];
    const vercel = JSON.parse(await read('vercel.json')) as { headers: { source: string }[] };
    expect(vercel.headers).toEqual([
      { source: '/assets/(.*)', headers: immutable },
      { source: '/estate/v(\\d+\\.\\d+)/(.*)', headers: immutable },
    ]);
    // path-to-regexp reads a parenthesised group as a raw regex and the rest of this
    // source is plain text, so a RegExp reads it as Vercel does. Only the files in a
    // version folder are content-hashed; nothing beside them may be cached forever.
    const estate = new RegExp(`^${vercel.headers[1].source}$`);
    expect(estate.test('/estate/v1.2/f/BLK_509.abcd1234.glb.gz')).toBe(true);
    expect(estate.test('/estate/v1.2/pack.abcd1234.json')).toBe(true);
    for (const other of ['/estate/LICENSE.txt', '/estate/views.json', '/estate/viewer/a.js', '/estate/vendor.js', '/estate/v1.2']) {
      expect(estate.test(other)).toBe(false);
    }
  });
});
