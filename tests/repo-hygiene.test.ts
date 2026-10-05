import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { MAIN_CHUNK_LIMIT, findEntryScript } from '../scripts/check-bundle.mjs';
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
const SCANNED = ['components', 'lib', 'contexts', 'server', 'api', 'scripts', 'tests', 'hooks', 'workers', 'semanticRender.tsx', 'App.tsx', 'index.tsx'];
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

  it('is neither watched nor served by the dev server, and never crawled for entries', () => {
    const config = (viteConfig as unknown as (env: { command: 'serve'; mode: string }) => {
      server: { watch: { ignored: string[] }; fs: { deny: string[] } };
      optimizeDeps: { entries: string[] };
    })({ command: 'serve', mode: 'development' });
    expect(config.server.watch.ignored).toEqual(expect.arrayContaining(['**/external/**', '**/artifacts/**']));
    // Setting fs.deny replaces Vite's defaults, so they must still be there.
    expect(config.server.fs.deny).toEqual(expect.arrayContaining(['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/external/**']));
    expect(config.optimizeDeps.entries).toEqual(['index.html']);
  });

  it('is left out of the Vercel upload', async () => {
    const lines = (await read('.vercelignore')).split(/\r?\n/).map((line) => line.trim());
    expect(lines).toEqual(expect.arrayContaining(['external/', 'artifacts/']));
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

  it('is never imported or read by site, server, script or test code', async () => {
    const files = (await Promise.all(SCANNED.map(walk))).flat().filter((file) => !ALLOWED.has(file));
    expect(files.length).toBeGreaterThan(100);
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
    const vercel = JSON.parse(await read('vercel.json')) as { headers: unknown[] };
    expect(vercel.headers).toEqual([
      { source: '/assets/(.*)', headers: immutable },
      { source: '/estate/v(.*)', headers: immutable },
    ]);
  });
});
