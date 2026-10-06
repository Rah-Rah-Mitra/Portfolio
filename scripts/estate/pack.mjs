// npm run estate:pack — builds the Estate window's asset pack from a Bonsai-Estate
// release (plan §6). Runbook: docs/portfolio/estate-pack.md.
//
//   npm run estate:pack -- --zips <dir> --out <dir> [--classes poster,s0,f,d,i,w,nav,ground] [--release [--expect-assets <candidate pack.json>]] [--verify]
//   npm run estate:pack -- --dev-src <extracted export> [--out artifacts/estate/v1.2-dev] [--classes …] [--verify]
//
// --verify rebuilds into a temporary folder and compares every file — raw
// payload and stored bytes — and pack.json with what --out already holds,
// after checking --out's own files against its pack.json; it writes nothing.
//
// Where it may write: a --dev-src pack never under any public/ folder and
// never anywhere but beside itself (no --catalogue); a release pack under
// public/ only at public/estate/<edition> and only with --release. A failed
// run deletes only a folder this run emptied and took over.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyseBuilding, buildExterior, buildInterior, buildMassing } from './lib/building.mjs';
import { buildMesh, countGlb, decodeGlb, encodeDoc, newDoc, quantStep, readGlb, storeyRoundTrip, validateGlb } from './lib/gltf.mjs';
import { gunzip, sha256, writeHashed } from './lib/files.mjs';
import { SITE_IDS, checkExport, openDevSource, openRelease, unanchoredReads } from './lib/inputs.mjs';
import { ATTRIBUTION, CLASS_ORDER, EDITION, FRAME, PACK_SCHEMA, REPO, boundsRadius, catalogueSource, mm, packFileName, serialisePack, storeyName } from './lib/manifest.mjs';
import { buildNav } from './lib/nav.mjs';
import { GLASS_INTERIOR_SLOT, GLASS_SLOT, packPalette } from './lib/palette.mjs';
import { encodePosters } from './lib/posters.mjs';
import { panelsNearSoup } from './lib/pure/panels.mjs';
import { textLeak } from './lib/pure/paths.mjs';
import { matchMap, matchWithin, quantisationZFights } from './lib/pure/quantcheck.mjs';
import { Soup, concatSoups } from './lib/pure/soup.mjs';
import { readWalkHeader, writeGround } from './lib/pure/sn5w.mjs';
import { buildSite } from './lib/site.mjs';
import { REPO_ROOT, checkBudgets, checkTokens, leakScanDir, listFiles, loadBudgets, loadPalette, packFiles, verifyFiles } from './check.mjs';

const ESTATE_DIR = dirname(fileURLToPath(import.meta.url));
const NODE_MAJOR = '24';
/** What pack.json records (schema.ts PackTool's literal types); checked against what is installed. */
const TOOL = { pipeline: 'scripts/estate/pack.mjs', gltfTransform: '4.5.1', meshoptimizer: '1.3.0', node: NODE_MAJOR };
const MIN_SHARE = 0.93;
const ZERO40 = '0'.repeat(40);
const ZERO64 = '0'.repeat(64);
const PACK_JSON = /^pack\.[0-9a-f]{8}\.json$/;
/** Position bits per file kind (§6.2 step 8; 16 where 14 flattened 5 mm road markings, see encodeDoc). */
export const BITS = { massing: 14, f: 16, site: 16, d: 16, i: 16 };
/** ESTATE_views.json as upstream's estate/blender/render.py writes it. */
export const VIEWS_SCHEMA = 'sample-town-n5/render-views/1';

const DEV_BANNER = [
  '',
  '  ************************************************************************',
  '  *  DEV PACK (--dev-src): the provenance gates are SKIPPED.              *',
  '  *  Inputs come from an extracted folder, not hashed release zips.       *',
  '  *  The pack is stamped source.dev = true and must never be committed,   *',
  '  *  published or written under public/.                                  *',
  '  ************************************************************************',
  '',
].join('\n');

const usage = () => 'usage: pack.mjs (--zips <dir> | --dev-src <dir>) [--out <dir>] [--classes a,b,…] [--release [--expect-assets <pack.json>]] [--verify] [--allow-rot] [--catalogue <file>]';

export const parseArgs = (argv) => {
  const a = { zips: null, devSrc: null, out: null, classes: [...CLASS_ORDER], release: false, verify: false, allowRot: false, catalogue: null, expectAssets: null, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${arg} needs a value\n${usage()}`); return argv[++i]; };
    if (arg === '--zips') a.zips = next();
    else if (arg === '--dev-src') a.devSrc = next();
    else if (arg === '--out') a.out = next();
    else if (arg === '--classes') a.classes = next().split(',').map((c) => c.trim()).filter(Boolean);
    else if (arg === '--release') a.release = true;
    else if (arg === '--verify') a.verify = true;
    else if (arg === '--allow-rot') a.allowRot = true;
    else if (arg === '--catalogue') a.catalogue = next();
    else if (arg === '--expect-assets') a.expectAssets = next();
    else if (arg === '--quiet') a.quiet = true;
    else throw new Error(`unknown argument ${arg}\n${usage()}`);
  }
  if (!a.zips === !a.devSrc) throw new Error(`give exactly one of --zips and --dev-src\n${usage()}`);
  for (const c of a.classes) if (!CLASS_ORDER.includes(c)) throw new Error(`unknown class ${c} (classes: ${CLASS_ORDER.join(', ')})`);
  a.classes = CLASS_ORDER.filter((c) => a.classes.includes(c));
  if (a.classes.includes('ground') && !a.classes.includes('s0')) throw new Error('class ground lives in the site layer: add s0');
  if (a.devSrc && a.release) throw new Error('--release cannot be used with --dev-src: a dev pack has no provenance');
  if (a.devSrc && a.catalogue) throw new Error('--catalogue cannot be used with --dev-src: a dev pack\'s catalogue is written beside it, never into lib/ or public/');
  if (a.expectAssets && !a.release) throw new Error('--expect-assets only means something with --release');
  if (!a.out && !a.devSrc) throw new Error(`--out is required with --zips\n${usage()}`);
  return a;
};

// ---- where the tool may write ---------------------------------------------------------

const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);

/** The real path of `p`, resolving links through its nearest existing ancestor (p itself may not exist yet). */
export const realish = (p) => {
  let cur = resolve(p); const rest = [];
  while (!existsSync(cur)) {
    const up = dirname(cur);
    if (up === cur) break;
    rest.unshift(basename(cur)); cur = up;
  }
  let real = cur;
  try { real = realpathSync.native(cur); } catch { /* keep the resolved path */ }
  return join(real, ...rest);
};

/**
 * The `public` folder `p` sits in, if any: an ancestor named public (any case)
 * whose parent holds a package.json or a .git — any web project's static
 * root, not only this checkout's. Links are resolved first.
 */
export const publicRootOf = (p) => {
  let cur = realish(p);
  for (;;) {
    const parent = dirname(cur);
    if (parent === cur) return null;
    if (basename(cur).toLowerCase() === 'public' && (existsSync(join(parent, 'package.json')) || existsSync(join(parent, '.git')))) return cur;
    cur = parent;
  }
};

const isUnder = (child, parent) => { const r = relative(parent, child); return r === '' || (!r.startsWith('..') && !/^[A-Za-z]:/.test(r)); };

/** The committed pack's folder and catalogue. */
const PUBLIC_PACK = join(REPO_ROOT, 'public', 'estate', EDITION);
const COMMITTED_CATALOGUE = join(REPO_ROOT, 'lib', 'estate', 'catalogue.generated.ts');
const isPublicPack = (dir) => samePath(realish(dir), realish(PUBLIC_PACK));

/** Why this run may not write where it was told to, or null. `opts` after path resolution. */
export const writeTargetProblem = (opts) => {
  const outPublic = publicRootOf(opts.out);
  if (opts.devSrc) {
    if (outPublic) return `a --dev-src pack may not be written under public/ (${outPublic})`;
    return null;
  }
  if (outPublic) {
    if (!isPublicPack(opts.out)) return `under public/ the pack goes to public/estate/${EDITION} and nowhere else, not ${opts.out}`;
    if (!opts.release && !opts.verify) return `writing public/estate/${EDITION} needs --release (or --verify, which writes nothing)`;
  }
  if (opts.catalogue) {
    if (publicRootOf(opts.catalogue)) return `--catalogue may not point under public/ (${opts.catalogue})`;
    if (samePath(realish(opts.catalogue), realish(COMMITTED_CATALOGUE)) && !isPublicPack(opts.out)) return 'lib/estate/catalogue.generated.ts belongs to the committed pack in public/estate; only a build of that pack writes it';
  }
  return null;
};

/** Where a build puts its catalogue: lib/estate/ for the committed pack, beside the pack otherwise. */
const defaultCatalogue = (outDir) => (isPublicPack(outDir) ? COMMITTED_CATALOGUE : join(outDir, 'catalogue.generated.ts'));

// ---- the output folder ----------------------------------------------------------------

/**
 * Empties a previous pack folder and returns, so the caller may take it over.
 * Refuses a folder that holds anything but one pack.<h8>.json, the files it
 * lists, and the tool's catalogue and report beside it: an untracked file in
 * there is not the tool's to delete.
 */
export const prepareOut = (dir) => {
  if (existsSync(dir)) {
    const top = readdirSync(dir);
    if (top.length) {
      const packs = top.filter((e) => PACK_JSON.test(e));
      if (packs.length !== 1) throw new Error(`${dir} is not a pack folder (it holds ${packs.length} pack.<h8>.json); refusing to empty it`);
      let listed;
      try { listed = packFiles(JSON.parse(readFileSync(join(dir, packs[0]), 'utf8'))).map((f) => f.ref.path); } catch (e) { throw new Error(`${dir}/${packs[0]} does not parse (${e.message}); refusing to empty the folder`); }
      const known = new Set([packs[0], 'catalogue.generated.ts', 'report.json', ...listed]);
      const strays = listFiles(dir).filter((f) => !known.has(f));
      if (strays.length) throw new Error(`${dir} holds files its pack.json does not list (${strays.slice(0, 3).join(', ')}${strays.length > 3 ? ', …' : ''}); refusing to empty it`);
      for (const e of top) rmSync(join(dir, e), { recursive: true, force: true });
    }
  }
  mkdirSync(dir, { recursive: true });
};

const unique = (list) => [...new Set(list)];

/** A ring without its closing repeat (upstream closes its polygons). */
export const openRing = (ring) => {
  const last = ring[ring.length - 1];
  return ring.length > 1 && last[0] === ring[0][0] && last[1] === ring[0][1] ? ring.slice(0, -1) : ring.slice();
};

// ---- installed tools ------------------------------------------------------------------

/** Problems with the installed toolchain: every devDependency at its pin, and the pins at what pack.json records. */
export const toolProblems = () => {
  const pins = JSON.parse(readFileSync(join(ESTATE_DIR, 'package.json'), 'utf8')).devDependencies;
  const out = [];
  for (const [name, pin] of Object.entries(pins)) {
    let version;
    try { version = JSON.parse(readFileSync(join(ESTATE_DIR, 'node_modules', ...name.split('/'), 'package.json'), 'utf8')).version; } catch { out.push(`${name} is not installed (npm run estate:setup)`); continue; }
    if (version !== pin) out.push(`${name} ${version} is installed, package.json pins ${pin} (npm run estate:setup)`);
  }
  for (const name of ['@gltf-transform/core', '@gltf-transform/extensions', '@gltf-transform/functions']) {
    if (pins[name] !== TOOL.gltfTransform) out.push(`package.json pins ${name} ${pins[name]}, pack.json records gltfTransform ${TOOL.gltfTransform}`);
  }
  if (pins.meshoptimizer !== TOOL.meshoptimizer) out.push(`package.json pins meshoptimizer ${pins.meshoptimizer}, pack.json records ${TOOL.meshoptimizer}`);
  return out;
};

// ---- ESTATE_views.json ----------------------------------------------------------------

/**
 * pack.views.aerialNE from upstream's render record
 * ({ schema, frame: 'estate, metres, Z up', views: { aerial_NE: camera_info } }).
 * Returns { view, problems }; `strict` (a release) throws instead.
 */
export const readAerialView = (doc, { strict }) => {
  const problems = [];
  if (doc?.schema !== VIEWS_SCHEMA) problems.push(`ESTATE_views.json schema is ${JSON.stringify(doc?.schema)}, expected ${VIEWS_SCHEMA}`);
  const shot = doc?.views?.aerial_NE;
  if (!shot) problems.push('ESTATE_views.json has no views.aerial_NE');
  else {
    if (shot.type !== 'PERSP') problems.push(`views.aerial_NE is a ${JSON.stringify(shot.type)} camera; the poster camera must be PERSP`);
    const m = shot.matrix_world;
    if (!Array.isArray(m) || m.length !== 4 || !m.every((row) => Array.isArray(row) && row.length === 4 && row.every(Number.isFinite))) problems.push('views.aerial_NE.matrix_world is not a 4×4 matrix');
    if (!(shot.lens > 0) || !(shot.sensor_width > 0)) problems.push('views.aerial_NE needs a positive lens and sensor_width');
    if (!['AUTO', 'HORIZONTAL', 'VERTICAL'].includes(shot.sensor_fit)) problems.push(`views.aerial_NE.sensor_fit ${JSON.stringify(shot.sensor_fit)}`);
    if (!Array.isArray(shot.res) || shot.res.length !== 2 || !shot.res.every((v) => Number.isInteger(v) && v > 0)) problems.push('views.aerial_NE.res is not [w, h]');
    if (!Number.isFinite(shot.shift_x) || !Number.isFinite(shot.shift_y)) problems.push('views.aerial_NE has no shift_x/shift_y');
  }
  if (problems.length) {
    if (strict) throw new Error(`ESTATE_views.json: ${problems.join('; ')}`);
    return { view: null, problems };
  }
  return { view: viewFromBlender(shot), problems };
};

// Blender's camera record (U2's ESTATE_views.json) → pack.views.aerialNE.
// matrix_world is row-major 4×4 in the estate frame (Z up); the camera looks
// down its local −Z with +Y up. The quaternion is the matrix's rotation,
// (x, y, z, w), still in the estate frame. Shifts are Blender's, in units of
// the larger image side.
export const viewFromBlender = (shot) => {
  const m = shot.matrix_world;
  const r = [[m[0][0], m[0][1], m[0][2]], [m[1][0], m[1][1], m[1][2]], [m[2][0], m[2][1], m[2][2]]];
  const tr = r[0][0] + r[1][1] + r[2][2];
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(r[2][1] - r[1][2]) / s, (r[0][2] - r[2][0]) / s, (r[1][0] - r[0][1]) / s, s / 4]; }
  else if (r[0][0] > r[1][1] && r[0][0] > r[2][2]) { const s = Math.sqrt(1 + r[0][0] - r[1][1] - r[2][2]) * 2; q = [s / 4, (r[0][1] + r[1][0]) / s, (r[0][2] + r[2][0]) / s, (r[2][1] - r[1][2]) / s]; }
  else if (r[1][1] > r[2][2]) { const s = Math.sqrt(1 + r[1][1] - r[0][0] - r[2][2]) * 2; q = [(r[0][1] + r[1][0]) / s, s / 4, (r[1][2] + r[2][1]) / s, (r[0][2] - r[2][0]) / s]; }
  else { const s = Math.sqrt(1 + r[2][2] - r[0][0] - r[1][1]) * 2; q = [(r[0][2] + r[2][0]) / s, (r[1][2] + r[2][1]) / s, s / 4, (r[1][0] - r[0][1]) / s]; }
  const n = Math.hypot(...q);
  const [w, h] = shot.res;
  const aspect = w / h;
  const fit = shot.sensor_fit === 'VERTICAL' || (shot.sensor_fit === 'AUTO' && h > w) ? 'v' : 'h';
  const hfov = 2 * Math.atan(shot.sensor_width / (2 * shot.lens));
  const vfov = fit === 'v' ? hfov : 2 * Math.atan(Math.tan(hfov / 2) / aspect);
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  return { eye: [m[0][3], m[1][3], m[2][3]].map(r6), quat: q.map((v) => r6(v / n)), vfovDeg: r6((vfov * 180) / Math.PI), shift: [r6(shot.shift_x), r6(shot.shift_y)], aspect: r6(aspect) };
};

// ---- checks on what a reader decodes --------------------------------------------------

/** A copy of a chunk soup with glass on the interior glass slot, as the interior file ships it. */
const asInterior = (soup) => {
  const out = new Soup(Math.max(1, soup.count));
  for (let i = 0; i < soup.count; i += 1) { const j = out.pushFrom(soup, i); if (out.slot[j] === GLASS_SLOT) out.slot[j] = GLASS_INTERIOR_SLOT; }
  return out;
};

/**
 * A decoded file against the soup it was built from: every decoded triangle
 * within one quantisation step of a built one (matchMap), and no face pair
 * that quantisation made coplanar (quantisationZFights). Overlaps narrower
 * than two steps are ignored: rounding slides the shared edge of two flush
 * neighbours (paving against a kerb top) by up to a step, a sliver rather than
 * a surface drawn twice. Throws; returns the counts for the report.
 */
const checkDecoded = (what, built, decoded, step) => {
  const { problem, map } = matchMap(built, decoded, step + 1e-4);
  if (problem) throw new Error(`${what}: ${problem}`);
  const z = quantisationZFights(built, decoded, map, { slack: Math.max(1e-3, 2 * step) });
  if (z.created.length) {
    const [g1, g2] = z.created[0]; const p = decoded.pos;
    throw new Error(`${what}: quantisation made ${z.created.length} face pairs of different slots coplanar and overlapping (they would z-fight); first: slots ${decoded.slot[g1]}/${decoded.slot[g2]} near (${[p[g1 * 9], p[g1 * 9 + 1], p[g1 * 9 + 2]].map((v) => v.toFixed(2)).join(', ')})`);
  }
  return { stepMm: mm(step * 1000), coplanarPairs: z.decoded, preExisting: z.existing };
};

// ---- the build ------------------------------------------------------------------------

/**
 * Builds a pack into `outDir`. Returns { packName, problems, warnings, report,
 * pack, cataloguePath, catalogueWritten }. `internal.catalogue` overrides where
 * the catalogue goes (--verify); `internal.state.owned` turns true once the
 * output folder has been emptied and taken over.
 */
export const build = async (opts, outDir, log, internal = {}) => {
  const t0 = Date.now();
  const warnings = [];
  const warn = (m) => { warnings.push(m); log(`  warning: ${m}`); };
  const classes = new Set(opts.classes);
  const budgets = loadBudgets();
  const state = internal.state ?? {};

  let opened;
  if (opts.devSrc) {
    opened = openDevSource(opts.devSrc);
    warnings.push('DEV PACK: built with --dev-src from an extracted export; the provenance gates were skipped; never commit or publish it');
    log(`dev source: ${opened.inputs} input files`);
  } else {
    opened = openRelease({ zipsDir: opts.zips, extractRoot: join(REPO_ROOT, 'artifacts', 'estate', 'src'), edition: EDITION });
    log(`release ${EDITION}: ${opened.assets.length} zips verified, ${opened.extracted} entries extracted`);
  }
  const { source, assets } = opened;
  let expectedAssets = null;
  if (opts.release) {
    if (opts.expectAssets) {
      const candidate = JSON.parse(readFileSync(opts.expectAssets, 'utf8'));
      if (candidate.source?.dev) throw new Error(`--expect-assets ${opts.expectAssets} is a dev pack; it records no release`);
      expectedAssets = candidate.source?.assets ?? null;
    } else if (existsSync(outDir)) {
      const prev = readdirSync(outDir).find((f) => PACK_JSON.test(f));
      if (prev) expectedAssets = JSON.parse(readFileSync(join(outDir, prev), 'utf8')).source.assets;
    }
  }
  const exp = checkExport({ source, repoRoot: REPO_ROOT, release: opts.release, releaseManifest: opened.releaseManifest, expectedAssets, assets, edition: EDITION, allowRot: opts.allowRot });
  prepareOut(outDir);
  state.owned = true;

  const manifestSites = new Map((exp.manifest.sites ?? []).map((s) => [s.id, s]));
  const sitesOut = []; const catalogueSites = []; const massingParts = [];
  const report = { classes: opts.classes, bits: BITS, sites: {}, site: null, posters: [], timings: {} };
  let flats = 0; let storeyCount = 0;

  const emitGlb = async (ctx, bits, stem, expectTris, batches = []) => {
    const glb = await encodeDoc(ctx, bits);
    const storeyProblem = await storeyRoundTrip(glb, batches);
    if (storeyProblem) throw new Error(`${stem}: ${storeyProblem}`);
    const v = await validateGlb(glb);
    if (v.errors) throw new Error(`${stem}: gltf-validator reports ${v.errors} errors: ${v.messages.slice(0, 3).join('; ')}`);
    const c = await countGlb(glb);
    if (expectTris !== undefined && c.tris !== expectTris) throw new Error(`${stem}: decodes to ${c.tris} triangles, built ${expectTris}`);
    if (c.maxPrimVerts > budgets.maxPrimVerts) throw new Error(`${stem}: a primitive holds ${c.maxPrimVerts} vertices`);
    if (!c.attributes.has('_META') || [...c.attributes].some((s) => s !== 'POSITION' && s !== '_META')) throw new Error(`${stem}: attributes ${[...c.attributes].join(', ')}; expected POSITION and _META only`);
    const ref = writeHashed(outDir, stem, 'glb.gz', glb, { gzip: true });
    return { glb, geo: { ...ref, tris: c.tris, verts: c.verts, prims: c.prims, draws: c.draws, maxPrimVerts: c.maxPrimVerts }, counts: c, validator: { warnings: v.warnings, infos: v.infos } };
  };

  // A class whose inputs are missing: refused in a release, skipped (with a warning) in a dev run.
  if (classes.has('w') && !SITE_IDS.every((id) => source.has(`model/${id}/${id}_walk.bin`))) {
    const missing = SITE_IDS.filter((id) => !source.has(`model/${id}/${id}_walk.bin`));
    if (source.mode === 'release') throw new Error(`the release has no walk grid for ${missing.join(', ')}`);
    warn(`class w skipped: no <ID>_walk.bin in the dev source for ${missing.length === SITE_IDS.length ? 'any building' : missing.join(', ')}`);
    classes.delete('w');
  }
  if (source.mode === 'release') {
    const noWeb = SITE_IDS.filter((id) => !source.has(`model/${id}/${id}_web.json`));
    if (noWeb.length) throw new Error(`the release has no web.json for ${noWeb.join(', ')}`);
  }

  for (const id of SITE_IDS) {
    const t = Date.now();
    const ms = manifestSites.get(id);
    if (!ms) throw new Error(`the manifest has no site ${id}`);
    const engine = source.json(`model/${id}/${id}_engine.json`);
    const webRel = `model/${id}/${id}_web.json`;
    const web = source.has(webRel) ? source.json(webRel) : null;
    const a = await analyseBuilding({ id, engine, read: (rel) => source.read(rel), web, minShare: MIN_SHARE, warn });
    const typical = new Set(a.split.typical);
    const storeys = a.storeys.map((s, i) => ({ tag: s.tag, name: storeyName(s.tag), ffl: s.ffl, geom: typical.has(i) ? 'typical' : 'special', walkLayer: i }));
    flats += (engine.flats ?? []).length; storeyCount += storeys.length;
    const footprintRings = engine.massing?.footprint;
    if (!Array.isArray(footprintRings) || !footprintRings.length) throw new Error(`${id}: the engine JSON has no massing.footprint`);
    if (footprintRings.length > 1) warn(`${id}: footprint has ${footprintRings.length} rings; pack.json keeps the first`);
    const transform = engine.transform;
    const at = ms.at;
    if (Math.abs(transform[0][3] - at[0]) > 1e-9 || Math.abs(transform[1][3] - at[1]) > 1e-9) throw new Error(`${id}: engine transform and manifest at disagree`);
    const toEstate = (p) => [0, 1, 2].map((r) => transform[r][0] * p[0] + transform[r][1] * p[1] + transform[r][2] * p[2] + transform[r][3]);
    const dirToEstate = (d) => [0, 1].map((r) => transform[r][0] * d[0] + transform[r][1] * d[1]);

    const site = {
      id, kind: ms.kind, name: ms.name, typology: ms.kind === 'block' ? ms.typology : null,
      at: [at[0], at[1]], bounds: ms.bounds, radius: boundsRadius(ms.bounds),
      footprint: openRing(footprintRings[0]),
      roofTop: engine.bounds_local[1][2],
      storeys,
      spawns: (engine.spawns ?? []).map((sp) => ({ name: sp.name, pos: toEstate(sp.position).map(mm), facing: dirToEstate(sp.facing).map(mm), kind: 'entrance' })),
    };
    const rep = { storeys: storeys.length, typical: a.split.typical.length, opened: a.opened, passableLeaves: a.passableLeaves };

    if (classes.has('s0') || classes.has('f') || classes.has('d')) {
      const lod1 = await readGlb(source.read(`model/${id}/${id}_lod1.glb`));
      const ext = await buildExterior(a, lod1, footprintRings, engine.rooms ?? [], budgets, warn);
      if (classes.has('s0')) {
        const lod2 = await readGlb(source.read(`model/${id}/${id}_lod2.glb`));
        const m = buildMassing(lod2, ext.facade.shell);
        massingParts.push({ id, soup: m.soup });
        site.massing = { mesh: `${id}_massing`, tris: m.soup.count, error: mm(m.error) };
        rep.massing = site.massing;
      }
      let stepF = null;
      if (classes.has('f')) {
        const out = await emitGlb(ext.facade.ctx, BITS.f, `f/${id}`, ext.facade.tris);
        if (out.counts.lines !== ext.facade.edges) throw new Error(`${id} F: decodes to ${out.counts.lines} edge lines, built ${ext.facade.edges}`);
        const dec = (await decodeGlb(out.glb)).find((n) => n.name === 'facade');
        stepF = quantStep(dec.scale, BITS.f);
        const decodedF = checkDecoded(`${id} F`, ext.facade.soup, dec.soup, stepF);
        site.facade = { ...out.geo, error: 0.06, edges: ext.facade.edges, exactMatched: ext.facade.exactMatched };
        rep.facade = { bytes: out.geo.bytes, tris: out.geo.tris, draws: out.geo.draws, panels: ext.facade.panels, facing: ext.facade.facing, exactMatched: ext.facade.exactMatched, banded: ext.facade.banded, offBand: ext.facade.offBand, mask: ext.facade.mask, decoded: decodedF };
      }
      if (classes.has('d')) {
        const out = await emitGlb(ext.detail.ctx, BITS.d, `d/${id}`, ext.detail.storedTris, ext.detail.batches);
        if (out.counts.instances !== ext.detail.instances) throw new Error(`${id} D: decodes to ${out.counts.instances} instances, built ${ext.detail.instances}`);
        if (!out.counts.instanceAttributes.has('_STOREY')) throw new Error(`${id} D: no _STOREY instance attribute`);
        const decoded = concatSoups((await decodeGlb(out.glb)).map((n) => n.soup));
        const fit = matchWithin(ext.detail.soup, decoded, 1e-3);
        if (fit) throw new Error(`${id} D: ${fit}`);
        // Step 6b's 2 mm check again on what a reader gets: D as decoded, the
        // panels allowed F's quantisation step on top.
        if (stepF !== null) {
          const tol = 0.002 + stepF;
          const near = panelsNearSoup(ext.facade.panelList, decoded, tol);
          if (near.length) throw new Error(`${id}: ${near.length}+ façade panels lie within ${(tol * 1000).toFixed(1)} mm of a decoded D face (first: panel ${near[0].panel})`);
        }
        // D's tris are what it draws (every instance), which is what the LOD budget adds to F's.
        site.detail = { ...out.geo, tris: out.counts.drawnTris, instances: ext.detail.instances };
        rep.detail = { bytes: out.geo.bytes, storedTris: out.counts.tris, drawnTris: out.counts.drawnTris, draws: out.geo.draws, kits: ext.detail.kits, instances: ext.detail.instances };
      }
    }
    if (classes.has('i')) {
      const I = await buildInterior(a, budgets);
      if (I.problems.length) throw new Error(`${id} interior: ${I.problems.join('; ')}`);
      const storedTris = I.stats.typicalTris + I.stats.residualTris + I.stats.specials.reduce((n, sp) => n + sp.tris, 0) + I.stats.furniture.reduce((n, k) => n + k.tris + k.proxyTris, 0);
      const out = await emitGlb(I.ctx, BITS.i, `i/${id}`, storedTris, I.batches);
      // T + R_s = chunk_s again, on the decoded bytes: within one quantisation step.
      const nodes = new Map((await decodeGlb(out.glb)).map((n) => [n.name, n]));
      const tDec = nodes.get('typical'); const rDec = nodes.get('residual');
      const step = quantStep(Math.max(...[...nodes.values()].filter((n) => n.copies === 1).map((n) => n.scale)), BITS.i);
      const tol = step + 1e-4;
      a.storeys.forEach(({ tag, ffl }, s) => {
        let got;
        if (typical.has(s)) {
          got = new Soup(Math.max(1, (tDec?.soup.count ?? 0) + (rDec?.soup.count ?? 0)));
          for (let k = 0; k < (tDec?.soup.count ?? 0); k += 1) got.pushFrom(tDec.soup, k, ffl, s);
          for (let k = 0; k < (rDec?.soup.count ?? 0); k += 1) if (rDec.soup.storey[k] === s) got.pushFrom(rDec.soup, k);
        } else got = nodes.get(`special_${tag}`)?.soup ?? new Soup(1);
        const problem = matchWithin(asInterior(a.chunks[s].soup), got, tol);
        if (problem) throw new Error(`${id} ${tag}: the decoded interior does not reproduce the chunk: ${problem}`);
      });
      site.interior = {
        ...out.geo,
        typicalTris: I.stats.typicalTris, residualTris: I.stats.residualTris, specials: I.stats.specials,
        ...(I.stats.furniture.length ? { furniture: I.stats.furniture } : {}),
        sourceTris: I.stats.sourceTris, drawnTris: I.stats.drawnTris,
      };
      rep.interior = { bytes: out.geo.bytes, tris: out.geo.tris, draws: out.geo.draws, stepMm: mm(step * 1000), typical: I.stats.typical, shares: I.stats.shares, typicalTris: I.stats.typicalTris, residualTris: I.stats.residualTris, specials: I.stats.specials, furniture: I.stats.furniture };
    }
    if (classes.has('w')) {
      const raw = source.read(`model/${id}/${id}_walk.bin`);
      const h = readWalkHeader(raw);
      const tags = h.layers.map((l) => l.tag);
      if (tags.join() !== storeys.map((s) => s.tag).join()) throw new Error(`${id}: walk layers ${tags.join(',')} ≠ storeys ${storeys.map((s) => s.tag).join(',')}`);
      h.layers.forEach((l, i) => { if (Math.abs(l.ffl - storeys[i].ffl) > 5e-4) throw new Error(`${id}: walk layer ${l.tag} FFL ${l.ffl} ≠ ${storeys[i].ffl}`); });
      if (h.cell !== 0.1 && h.cell !== 0.2) throw new Error(`${id}: walk cell ${h.cell}`);
      if (h.coarse !== (h.cell === 0.2)) throw new Error(`${id}: walk cell ${h.cell} disagrees with the coarse flag`);
      if (h.coarse) warn(`${id}: the walk grid is upstream's 0.2 m coarse fallback`);
      const ref = writeHashed(outDir, `w/${id}`, 'walk.gz', raw, { gzip: true });
      site.walk = { ...ref, grid: { origin: h.origin, nx: h.nx, ny: h.ny, cell: h.cell }, layers: h.layers.length };
      rep.walk = { bytes: ref.bytes, rawBytes: ref.rawBytes, nx: h.nx, ny: h.ny, cell: h.cell };
    }
    if (classes.has('nav')) {
      const { nav, warnings: navWarnings } = buildNav({ id, engine, storeys, web });
      for (const w of navWarnings) warn(w);
      // Gzipped like every other streamed class: with upstream's stairs a plain
      // nav file ran to 101 KB (BLK_509) against the 48 KB cap.
      const ref = writeHashed(outDir, `nav/${id}`, 'json.gz', Buffer.from(`${JSON.stringify(nav)}\n`, 'utf8'), { gzip: true });
      site.nav = ref;
      rep.nav = { bytes: ref.bytes, rawBytes: ref.rawBytes, lifts: nav.lifts.length, stairs: nav.stairs?.length ?? 0, typicalRooms: nav.rooms.typical?.rooms.length ?? 0 };
    }
    sitesOut.push(site);
    catalogueSites.push({ id, name: site.name, kind: site.kind, typology: site.typology, heightM: mm(ms.bounds[1][2]), storeys: storeys.map((s) => s.tag), facade: site.facade, detail: site.detail, interior: site.interior, walk: site.walk, nav: site.nav });
    report.sites[id] = rep;
    report.timings[id] = Date.now() - t;
    log(`${id}: ${Date.now() - t} ms`);
  }
  if (flats !== 1206 || storeyCount !== 245) throw new Error(`the export has ${flats} flats and ${storeyCount} storeys; the pack schema pins 1206 and 245`);

  const pack = {
    schema: PACK_SCHEMA, edition: EDITION, classes: CLASS_ORDER.filter((c) => classes.has(c)),
    // A dev pack claims no commit: it was not built from the gitlink's release.
    source: {
      repo: REPO, tag: EDITION,
      commit: opts.devSrc ? ZERO40 : exp.commit,
      buildCommit: opts.devSrc ? ZERO40 : exp.buildCommit,
      manifestSha256: exp.manifestSha256,
      exportInfoSha256: opts.devSrc ? ZERO64 : exp.exportInfoSha256,
      assets,
      ...(opts.devSrc ? { dev: true } : {}),
    },
    tool: TOOL,
    licence: { data: 'CC-BY-4.0', attribution: ATTRIBUTION, url: '/estate/LICENSE.txt' },
    frame: FRAME,
    estate: { name: exp.manifest.estate.name, code: exp.manifest.estate.code, extent: exp.manifest.estate.extent, flats, storeys: storeyCount },
    palette: packPalette(),
    views: {},
    posters: [],
    sites: sitesOut,
    totals: { stage0Bytes: 0, bytes: 0, byClass: {} },
    warnings: [],
  };

  const viewsRel = 'reports/renders/ESTATE/ESTATE_views.json';
  if (source.has(viewsRel)) {
    const { view, problems: viewProblems } = readAerialView(source.json(viewsRel), { strict: source.mode === 'release' });
    for (const p of viewProblems) warn(`${p}; pack.views stays empty (a release refuses this)`);
    if (view) pack.views.aerialNE = view;
  } else if (source.mode === 'release') throw new Error(`the release has no ${viewsRel}`);
  else warn('no ESTATE_views.json in the dev source, so pack.views is empty');

  if (classes.has('s0')) {
    const t = Date.now();
    const ctx = newDoc();
    for (const { id, soup } of massingParts) ctx.scene.addChild(ctx.doc.createNode(id).setMesh(buildMesh(ctx, `${id}_massing`, soup)));
    const massingTris = massingParts.reduce((n, p) => n + p.soup.count, 0);
    const massing = await emitGlb(ctx, BITS.massing, 's0/massing', massingTris);
    pack.massing = massing.geo;
    const lod0 = await readGlb(source.read('model/SITE_lod0.glb'));
    const s = await buildSite(lod0, warn);
    const storedTris = s.quadrants.reduce((n, q) => n + q.tris, 0) + s.trees.reduce((n, tr) => n + tr.tris + tr.crownTris, 0);
    const siteGlb = await emitGlb(s.ctx, BITS.site, 's0/site', storedTris);
    const zf = {};
    for (const n of await decodeGlb(siteGlb.glb)) {
      const built = s.quadrantSoups.get(n.name);
      if (!built) continue;
      zf[n.name] = checkDecoded(`SITE ${n.name}`, built, n.soup, quantStep(n.scale, BITS.site));
    }
    pack.site = { file: siteGlb.geo, quadrants: s.quadrants, trees: s.trees };
    if (classes.has('ground')) {
      const ref = writeHashed(outDir, 'site/ground', 'bin.gz', writeGround(s.ground), { gzip: true });
      pack.site.ground = { ...ref, cell: s.ground.cell, lo: s.ground.lo, nx: s.ground.nx, ny: s.ground.ny };
      report.ground = { bytes: ref.bytes, nx: s.ground.nx, ny: s.ground.ny };
    }
    const bus = (exp.manifest.spawn_points ?? []).filter((p) => p.site === 'SITE');
    if (bus.length) pack.site.spawns = bus.map((p) => ({ name: p.name, pos: p.position.map(mm), facing: [mm(p.facing[0]), mm(p.facing[1])], kind: 'bus' }));
    pack.stage0 = [pack.massing.path, pack.site.file.path];
    report.site = { massingBytes: massing.geo.bytes, massingTris, massingDraws: massing.geo.draws, siteBytes: siteGlb.geo.bytes, siteTris: siteGlb.geo.tris, siteDraws: siteGlb.geo.draws, quadrants: s.quadrants.map((q) => q.tris), trees: s.trees, orientation: s.orientation, decoded: zf };
    report.timings.site = Date.now() - t;
  }
  let posterSize = null;
  if (classes.has('poster')) {
    const png = source.read('reports/renders/ESTATE/ESTATE_aerial_NE.png');
    for (const p of encodePosters(png, budgets.classes.poster.files)) {
      const [stem, ext] = [`poster/${p.name.replace(/\.(webp|jpg)$/, '')}`, p.name.split('.').pop()];
      const ref = writeHashed(outDir, stem, ext, p.bytes, { gzip: false });
      pack.posters.push(ref);
      if (p.name === 'aerial-1600.webp') posterSize = { w: p.w, h: p.h };
      report.posters.push({ name: p.name, bytes: ref.bytes, w: p.w, h: p.h, quality: p.quality });
    }
  }

  // Every input the build read must be one a record hashes (release); a dev run only says so.
  const loose = unanchoredReads(source, exp.anchored);

  // totals.byClass, then pack.json solved for its own size.
  const byClass = {};
  const add = (k, ref) => { if (ref) byClass[k] = (byClass[k] ?? 0) + ref.bytes; };
  for (const p of pack.posters) add('poster', p);
  add('s0', pack.massing); add('s0', pack.site?.file); add('ground', pack.site?.ground);
  for (const s of sitesOut) { add('f', s.facade); add('d', s.detail); add('i', s.interior); add('w', s.walk); add('nav', s.nav); }
  pack.totals.byClass = Object.fromEntries(pack.classes.map((k) => [k, byClass[k] ?? 0]));
  if (source.mode !== 'release' && loose.length) warn(`dev: ${loose.length} inputs are not hashed by estate_manifest.json or export_info.json (first: ${loose[0]})`);
  pack.warnings = unique(warnings);
  const allFiles = Object.values(byClass).reduce((n, b) => n + b, 0);
  const stage0Files = (pack.stage0 ?? []).reduce((n, p) => n + ([pack.massing, pack.site?.file].find((r) => r?.path === p)?.bytes ?? 0), 0);
  const { bytes: packBytes, gzBytes } = serialisePack(pack, stage0Files, allFiles);
  const packName = packFileName(packBytes);
  writeFileSync(join(outDir, packName), packBytes);

  // The catalogue's text is checked with everything else, and written only
  // when the pack passes: a refused build never leaves one in lib/estate.
  const cataloguePath = internal.catalogue ?? opts.catalogue ?? defaultCatalogue(outDir);
  const catalogue = catalogueSource({ pack, packUrl: `/estate/${EDITION}/${packName}`, posters: pack.posters, posterSize, sites: catalogueSites });

  // Step 14 and 15: budgets, files, tokens, provenance of every read, and the
  // leak scan over every byte written.
  const problems = [];
  if (source.mode === 'release') problems.push(...loose.map((l) => `unanchored input: ${l}`));
  if (Buffer.byteLength(catalogue) > 6000) problems.push(`catalogue.generated.ts is ${Buffer.byteLength(catalogue)} B > 6,000`);
  const catHit = textLeak(Buffer.from(catalogue, 'utf8'));
  if (catHit) problems.push(`leak: catalogue @${catHit.offset}: ${JSON.stringify(catHit.match)}`);
  problems.push(...verifyFiles(outDir, JSON.parse(packBytes.toString('utf8'))));
  const budget = checkBudgets(pack, budgets, packBytes.length, gzBytes);
  problems.push(...budget.problems);
  for (const w of budget.warnings) warn(w);
  problems.push(...checkTokens(loadPalette(), readFileSync(join(REPO_ROOT, 'index.css'), 'utf8')));
  problems.push(...leakScanDir(outDir).map((h) => `leak: ${h}`));
  let catalogueWritten = false;
  if (!problems.length) {
    mkdirSync(dirname(cataloguePath), { recursive: true });
    writeFileSync(cataloguePath, catalogue);
    catalogueWritten = true;
  }
  report.measured = budget.measured;
  report.packJson = { name: packName, bytes: packBytes.length, gzBytes };
  report.catalogueBytes = Buffer.byteLength(catalogue);
  report.timings.total = Date.now() - t0;
  return { packName, problems, warnings: pack.warnings, report, pack, cataloguePath, catalogueWritten, catalogue };
};

// ---- --verify -------------------------------------------------------------------------

/**
 * Compares a pack folder with a rebuild of it: the same files, and for each
 * the same raw payload AND the same stored bytes. A stored difference under an
 * identical payload is a failure, not a note: the tool's gzip is
 * deterministic, and a different zlib would have changed gzSha256 in the
 * rebuilt pack.json — so it can only mean the stored file disagrees with its
 * own pack.json. `ignore`: names beside the pack that are not compared.
 */
export const comparePackDirs = (found, built, { ignore = ['catalogue.generated.ts', 'report.json'] } = {}) => {
  const problems = [];
  const a = listFiles(found).filter((f) => !ignore.includes(f));
  const b = listFiles(built).filter((f) => !ignore.includes(f));
  if (a.join('\n') !== b.join('\n')) problems.push(`file lists differ:\n    built: ${b.join(' ')}\n    found: ${a.join(' ')}`);
  for (const f of b) {
    if (!a.includes(f)) continue;
    const x = readFileSync(join(found, ...f.split('/'))); const y = readFileSync(join(built, ...f.split('/')));
    const rx = f.endsWith('.gz') ? gunzip(x) : x; const ry = f.endsWith('.gz') ? gunzip(y) : y;
    if (sha256(rx) !== sha256(ry)) problems.push(`${f}: raw payload differs`);
    else if (sha256(x) !== sha256(y)) problems.push(`${f}: same payload, different stored bytes (${x.length} B found, ${y.length} B built): the file does not match its pack.json`);
  }
  return problems;
};

/** --verify: check --out's own files, rebuild into a temporary folder and compare. */
const verify = async (opts, log) => {
  const outDir = resolve(opts.out);
  if (!existsSync(outDir)) throw new Error(`--verify: ${outDir} does not exist; build it first`);
  const packName = readdirSync(outDir).find((f) => PACK_JSON.test(f));
  if (!packName) throw new Error(`--verify: ${outDir} holds no pack.<h8>.json`);
  const existing = JSON.parse(readFileSync(join(outDir, packName), 'utf8'));
  const problems = verifyFiles(outDir, existing, { allowed: ['catalogue.generated.ts', 'report.json'] }).map((p) => `found: ${p}`);
  const tmp = mkdtempSync(join(tmpdir(), 'estate-verify-'));
  try {
    const result = await build({ ...opts, release: false }, join(tmp, 'pack'), log, { catalogue: join(tmp, 'catalogue.generated.ts') });
    problems.push(...result.problems.map((p) => `rebuild: ${p}`));
    problems.push(...comparePackDirs(outDir, join(tmp, 'pack')));
    const catalogue = opts.catalogue ?? defaultCatalogue(outDir);
    if (!existsSync(catalogue)) problems.push(`${relative(REPO_ROOT, catalogue)} is missing`);
    else if (readFileSync(catalogue, 'utf8') !== result.catalogue) problems.push(`${relative(REPO_ROOT, catalogue)} differs from a rebuild`);
    return { problems, result };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

// ---- the command ----------------------------------------------------------------------

// A failed build never leaves a half-written pack where it could be committed,
// and never deletes what it did not take over: only a folder prepareOut
// emptied in this run (state.owned) is cleared.
const discardOwned = (out, state) => {
  if (!state.owned || !existsSync(out)) return;
  for (const e of readdirSync(out)) rmSync(join(out, e), { recursive: true, force: true });
  const where = relative(REPO_ROOT, out).split(sep).join('/');
  console.error(`  ${where} was emptied${isPublicPack(out) ? '; "git checkout -- public/estate" restores the committed pack' : ''}.`);
};

const main = async (argv) => {
  if (process.versions.node.split('.')[0] !== NODE_MAJOR) {
    console.error(`estate:pack needs Node ${NODE_MAJOR}.x (pinned so pack bytes are reproducible); this is ${process.versions.node}`);
    return 2;
  }
  let opts;
  try { opts = parseArgs(argv); } catch (e) { console.error(e.message); return 2; }
  // `npm --prefix scripts/estate run pack` runs here, in scripts/estate; paths
  // the user typed are relative to where they typed them (npm's INIT_CWD).
  const base = process.env.INIT_CWD || process.cwd();
  for (const key of ['zips', 'devSrc', 'catalogue', 'expectAssets']) if (opts[key]) opts[key] = resolve(base, opts[key]);
  opts.out = opts.out ? resolve(base, opts.out) : join(REPO_ROOT, 'artifacts', 'estate', `${EDITION}-dev`);
  const refusal = writeTargetProblem(opts);
  if (refusal) { console.error(`refusing: ${refusal}`); return 2; }
  const tools = toolProblems();
  if (tools.length) { console.error(`estate:pack: the toolchain is not the pinned one:\n  ${tools.join('\n  ')}`); return 2; }
  const out = opts.out;
  const log = opts.quiet ? () => {} : (m) => console.log(m);
  if (opts.devSrc) console.warn(DEV_BANNER);
  const state = { owned: false };
  try {
    if (opts.verify) {
      const { problems, result } = await verify(opts, log);
      if (problems.length) { console.error(`--verify FAILED:\n  ${problems.join('\n  ')}`); return 1; }
      console.log(`--verify: identical (${result.packName}, ${Object.keys(result.report.sites).length} sites)`);
      return 0;
    }
    const result = await build(opts, out, log, { state });
    const reportPath = isPublicPack(out) ? join(REPO_ROOT, 'artifacts', 'estate', `report-${EDITION}.json`) : join(out, 'report.json');
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(result.report, null, 1)}\n`);
    console.log(`\n${result.packName}: ${result.report.measured.files} files, ${result.report.measured.total} B (first frame ${result.report.measured.stage0} B) in ${(result.report.timings.total / 1000).toFixed(1)} s`);
    for (const [k, v] of Object.entries(result.report.measured.byClass)) console.log(`  ${k.padEnd(6)} ${String(v).padStart(9)} B`);
    console.log(`  catalogue: ${result.catalogueWritten ? relative(REPO_ROOT, result.cataloguePath).split(sep).join('/') : 'not written (refused)'}`);
    console.log(`  report:    ${relative(REPO_ROOT, reportPath).split(sep).join('/')}`);
    if (result.problems.length) {
      console.error(`\nREFUSED: ${result.problems.length} problems:\n  ${result.problems.join('\n  ')}`);
      // A refused pack outside public/ stays for inspection; it holds its pack.json.
      if (isPublicPack(out)) discardOwned(out, state);
      return 1;
    }
    if (opts.devSrc) console.warn(DEV_BANNER);
    return 0;
  } catch (e) {
    console.error(`\nestate:pack failed: ${e.message}`);
    discardOwned(out, state);
    return 1;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
