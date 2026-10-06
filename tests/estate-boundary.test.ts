import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// The Estate window's lazy-chunk boundary (plan §7.1). three r186 and
// camera-controls weigh several hundred kB; the main bundle is prerendered and
// capped (scripts/check-bundle.mjs), and the window must cost nothing until it
// is opened. So:
//  - three and camera-controls are imported only under estate/engine/** and
//    estate/live/** (the engine and its HUD);
//  - those two folders are reached from outside only by the import() calls in
//    estate/loadEngine.ts — no static import, not even a type-only one: the
//    shared types live in estate/engineApi.ts, which is itself types only;
//  - lib/estate stays pure: neither package, nothing outside lib/estate;
//  - no React.lazy in the estate tree (loadEngine is the one loader, with its
//    retry and stale rules), and no custom workers (the meshopt decoder's own
//    workers are three's, started by the engine through MeshoptDecoder).
// Read with the TypeScript parser, so a type-only import, an export-from and a
// `typeof import(…)` are each told apart from a value import.

const root = fileURLToPath(new URL('..', import.meta.url));
const ESTATE = 'components/workbench/estate';
const LAZY = [`${ESTATE}/engine/`, `${ESTATE}/live/`];
const LOADER = `${ESTATE}/loadEngine.ts`;
const API = `${ESTATE}/engineApi.ts`;
const ENGINE_PACKAGES = /^(?:three|camera-controls)(?:\/|$)/;
// App code: every code file at the repository root and these folders. Tests are
// left out on purpose: they may load the engine in node (estate-reader, P4b).
const SCANNED = ['components', 'lib', 'contexts', 'hooks', 'workers', 'server', 'api', 'scripts'];
const CODE = /\.(?:[cm]?js|tsx?)$/;

type RefKind = 'static' | 'type' | 'dynamic' | 'require';
interface ModuleRef { specifier: string; kind: RefKind }

const scriptKind = (fileName: string) => (
  fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : fileName.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
);
const parse = (fileName: string, text: string) => ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(fileName));

/** Every module a file names, and how: import/export-from, type-only, import(), require(). */
const moduleRefs = (fileName: string, text: string): ModuleRef[] => {
  const refs: ModuleRef[] = [];
  const add = (node: ts.Expression | undefined, kind: RefKind) => {
    if (node && ts.isStringLiteralLike(node)) refs.push({ specifier: node.text, kind });
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const allTypes = clause !== undefined && (clause.isTypeOnly || (
        clause.name === undefined && named !== undefined && ts.isNamedImports(named)
        && named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly)
      ));
      add(node.moduleSpecifier, allTypes ? 'type' : 'static');
    } else if (ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier, node.isTypeOnly ? 'type' : 'static');
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, node.isTypeOnly ? 'type' : 'require');
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal as ts.Expression, 'type');
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0], 'dynamic');
      else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') add(node.arguments[0], 'require');
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(fileName, text));
  return refs;
};

/** A specifier as a repo-relative path ('@/' is the Vite alias for the root), or null for a package. */
const resolveRef = (from: string, specifier: string): string | null => {
  if (specifier.startsWith('@/')) return path.posix.normalize(specifier.slice(2));
  if (!specifier.startsWith('.')) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
};

const inside = (file: string, folder: string) => `${file}/`.startsWith(folder.endsWith('/') ? folder : `${folder}/`);
const inLazy = (file: string) => LAZY.some((folder) => inside(file, folder));

/** React.lazy or a bare lazy() — and `lazy` imported from react. */
const lazyCalls = (fileName: string, text: string): string[] => {
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if ((ts.isIdentifier(callee) && callee.text === 'lazy') || (ts.isPropertyAccessExpression(callee) && callee.name.text === 'lazy')) {
        hits.push(callee.getText());
      }
    }
    if (ts.isImportSpecifier(node) && (node.propertyName ?? node.name).text === 'lazy') hits.push('import { lazy }');
    ts.forEachChild(node, visit);
  };
  visit(parse(fileName, text));
  return hits;
};

/** new Worker / new SharedWorker, navigator.serviceWorker, and Vite's ?worker imports. */
const workerUses = (fileName: string, text: string): string[] => {
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && /^(?:Worker|SharedWorker)$/.test(node.expression.text)) {
      hits.push(`new ${node.expression.text}`);
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'serviceWorker') hits.push(node.getText());
    ts.forEachChild(node, visit);
  };
  visit(parse(fileName, text));
  for (const { specifier } of moduleRefs(fileName, text)) {
    if (/[?&](?:shared)?worker\b/.test(specifier)) hits.push(specifier);
    const resolved = resolveRef(fileName, specifier);
    if (resolved !== null && inside(resolved, 'workers')) hits.push(specifier);
  }
  return hits;
};

const walk = async (relative: string): Promise<string[]> => {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) return [];
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(entries
    .filter((entry) => entry.name !== 'node_modules')
    .map((entry) => (entry.isDirectory()
      ? walk(`${relative}/${entry.name}`)
      : Promise.resolve(CODE.test(entry.name) ? [`${relative}/${entry.name}`] : []))));
  return nested.flat();
};

const appFiles = async (): Promise<string[]> => {
  const atRoot = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && CODE.test(entry.name))
    .map((entry) => entry.name);
  return [...atRoot, ...(await Promise.all(SCANNED.map(walk))).flat()].sort();
};

const sources = new Map<string, Promise<string>>();
const read = (relative: string) => {
  if (!sources.has(relative)) sources.set(relative, readFile(path.join(root, relative), 'utf8'));
  return sources.get(relative)!;
};

describe('the scanner', () => {
  it('tells value, type-only, dynamic and require references apart', () => {
    const refs = moduleRefs('a.ts', [
      "import * as THREE from 'three';",
      "import type { Mesh } from 'three';",
      "import { type Camera, type Scene } from 'three';",
      "import { type Box3, Vector3 } from 'three';",
      "export { Clock } from 'three';",
      "export type { Ray } from 'three';",
      "const m = () => import('./engine');",
      'type M = typeof import("./live/EstateHud");',
      "const c = require('camera-controls');",
    ].join('\n'));
    expect(refs).toEqual([
      { specifier: 'three', kind: 'static' },
      { specifier: 'three', kind: 'type' },
      { specifier: 'three', kind: 'type' },
      { specifier: 'three', kind: 'static' },
      { specifier: 'three', kind: 'static' },
      { specifier: 'three', kind: 'type' },
      { specifier: './engine', kind: 'dynamic' },
      { specifier: './live/EstateHud', kind: 'type' },
      { specifier: 'camera-controls', kind: 'require' },
    ]);
  });

  it('resolves relative and aliased specifiers into the lazy folders', () => {
    expect(inLazy(resolveRef(LOADER, './engine')!)).toBe(true);
    expect(inLazy(resolveRef(LOADER, './live/EstateHud')!)).toBe(true);
    expect(inLazy(resolveRef('components/workbench/FieldWorkbench.tsx', './estate/engine/renderer')!)).toBe(true);
    expect(inLazy(resolveRef('App.tsx', '@/components/workbench/estate/live/EstateHud')!)).toBe(true);
    expect(inLazy(resolveRef(LOADER, './engineApi')!)).toBe(false);
    expect(inLazy(resolveRef(LOADER, './engineering')!)).toBe(false);
    expect(resolveRef(LOADER, 'three')).toBeNull();
  });

  it('finds React.lazy, workers and ?worker imports', () => {
    expect(lazyCalls('a.tsx', "const H = React.lazy(() => import('./h'));")).toEqual(['React.lazy']);
    expect(lazyCalls('a.tsx', "import { lazy } from 'react'; const H = lazy(() => import('./h'));")).toEqual(['import { lazy }', 'lazy']);
    expect(lazyCalls('a.ts', 'MeshoptDecoder.useWorkers(2); const lazyLoad = () => 1;')).toEqual([]);
    expect(workerUses('lib/estate/a.ts', "const w = new Worker(new URL('./x.ts', import.meta.url));")).toEqual(['new Worker']);
    expect(workerUses('lib/estate/a.ts', "import W from './x?worker';")).toEqual(['./x?worker']);
    expect(workerUses('lib/estate/a.ts', "import '../../workers/nbody.worker';")).toEqual(['../../workers/nbody.worker']);
    expect(workerUses('lib/estate/a.ts', 'navigator.serviceWorker.register("/sw.js");')).toEqual(['navigator.serviceWorker']);
    expect(workerUses('a.ts', 'MeshoptDecoder.useWorkers(2);')).toEqual([]);
  });
});

describe('the Estate lazy-chunk boundary (§7.1)', () => {
  it('scans the app, the estate tree included', async () => {
    const files = await appFiles();
    expect(files.length).toBeGreaterThan(100);
    expect(files).toEqual(expect.arrayContaining([
      'App.tsx', 'index.tsx', 'semanticRender.tsx', LOADER, API,
      `${ESTATE}/engine/index.ts`, `${ESTATE}/live/EstateHud.tsx`, 'lib/estate/schema.ts',
    ]));
  });

  it('imports three and camera-controls only under estate/engine and estate/live', async () => {
    const files = await appFiles();
    const offenders = (await Promise.all(files.map(async (file) => moduleRefs(file, await read(file))
      .filter((ref) => ENGINE_PACKAGES.test(ref.specifier) && !inLazy(file))
      .map((ref) => `${file}: ${ref.kind} '${ref.specifier}'`)))).flat();
    expect(offenders).toEqual([]);
  });

  it('reaches the engine and its HUD only through the import() calls in loadEngine.ts', async () => {
    const files = (await appFiles()).filter((file) => !inLazy(file));
    const crossings = (await Promise.all(files.map(async (file) => moduleRefs(file, await read(file))
      .filter((ref) => {
        const resolved = resolveRef(file, ref.specifier);
        return resolved !== null && inLazy(resolved);
      })
      .map((ref) => ({ file, ...ref }))))).flat();
    expect(crossings.filter((ref) => !(ref.file === LOADER && ref.kind === 'dynamic'))).toEqual([]);
    expect(crossings.map((ref) => ref.specifier)).toEqual(['./engine', './live/EstateHud']);
  });

  it('reaches the bench (engine/bench.ts) only through engine/index.ts’s import(), from no other file in the app', async () => {
    // Its own chunk, which only ?estate-bench= downloads: a static import anywhere
    // (an engine file included) would put it in the Load click. scripts/check-bundle.mjs
    // also fails a build whose main bundle or Load click carries its schema string.
    const BENCH = `${ESTATE}/engine/bench`;
    const refs = (await Promise.all((await appFiles()).map(async (file) => moduleRefs(file, await read(file))
      .filter((ref) => ref.kind !== 'type' && resolveRef(file, ref.specifier)?.replace(/\.[cm]?[jt]sx?$/, '') === BENCH)
      .map((ref) => `${file}: ${ref.kind} '${ref.specifier}'`)))).flat();
    expect(refs).toEqual([`${ESTATE}/engine/index.ts: dynamic './bench'`]);
    // The scanner sees every spelling of the path.
    for (const [from, specifier] of [[`${ESTATE}/engine/streaming.ts`, './bench'], [`${ESTATE}/live/EstateHud.tsx`, '../engine/bench'], [`${ESTATE}/loadEngine.ts`, './engine/bench.ts'], ['App.tsx', '@/components/workbench/estate/engine/bench']]) {
      expect(resolveRef(from, specifier)?.replace(/\.[cm]?[jt]sx?$/, ''), `${from} → ${specifier}`).toBe(BENCH);
    }
  });

  it('keeps engineApi.ts types only, so importing it costs the main bundle nothing', async () => {
    const source = parse(API, await read(API));
    const valueStatements = source.statements.filter((statement) => !(
      ts.isInterfaceDeclaration(statement)
      || ts.isTypeAliasDeclaration(statement)
      || (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly === true)
      || (ts.isExportDeclaration(statement) && statement.isTypeOnly)
    )).map((statement) => statement.getText().split('\n')[0]);
    expect(valueStatements).toEqual([]);
    expect(moduleRefs(API, await read(API)).filter((ref) => ref.kind !== 'type')).toEqual([]);
  });

  it('keeps lib/estate pure: neither engine package, nothing outside lib/estate', async () => {
    const files = (await appFiles()).filter((file) => inside(file, 'lib/estate'));
    expect(files.length).toBeGreaterThan(10);
    const offenders = (await Promise.all(files.map(async (file) => moduleRefs(file, await read(file))
      .filter((ref) => {
        const resolved = resolveRef(file, ref.specifier);
        return resolved === null ? true : !inside(resolved, 'lib/estate');
      })
      .map((ref) => `${file}: '${ref.specifier}'`)))).flat();
    expect(offenders).toEqual([]);
  });

  it('has no React.lazy and no custom workers in the estate tree', async () => {
    const files = (await appFiles()).filter((file) => inside(file, ESTATE) || inside(file, 'lib/estate'));
    expect(files).toEqual(expect.arrayContaining([LOADER, `${ESTATE}/engine/index.ts`]));
    const offenders = (await Promise.all(files.map(async (file) => {
      const text = await read(file);
      return [...lazyCalls(file, text), ...workerUses(file, text)].map((hit) => `${file}: ${hit}`);
    }))).flat();
    expect(offenders).toEqual([]);
  });
});
