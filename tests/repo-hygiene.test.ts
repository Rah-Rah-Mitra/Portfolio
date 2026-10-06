import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { normalizePath, resolveConfig, type UserConfig } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import {
  ENGINE_MARKERS, MAIN_BASELINE, MAIN_CHUNK_LIMIT, MAIN_LIMIT, catalogueUrls, checkBundle, checkEstateCatalogue, findEntryScript,
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
