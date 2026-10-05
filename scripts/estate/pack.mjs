// npm run estate:pack — builds the Estate window's asset pack from a Bonsai-Estate
// release (plan §6). Runbook: docs/portfolio/estate-pack.md.
//
//   npm run estate:pack -- --zips <dir> --out <dir> [--classes poster,s0,f,d,i,w,nav,ground] [--release] [--verify]
//   npm run estate:pack -- --dev-src <extracted export> [--out artifacts/estate/v1.2-dev] [--classes …] [--verify]
//
// --verify rebuilds into a temporary folder and compares every raw payload and
// pack.json with what --out already holds; it writes nothing to --out.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyseBuilding, buildExterior, buildInterior, buildMassing } from './lib/building.mjs';
import { buildMesh, countGlb, encodeDoc, newDoc, readGlb, storeyRoundTrip, validateGlb } from './lib/gltf.mjs';
import { gunzip, sha256, writeHashed } from './lib/files.mjs';
import { SITE_IDS, checkExport, openDevSource, openRelease } from './lib/inputs.mjs';
import { ATTRIBUTION, CLASS_ORDER, EDITION, FRAME, PACK_SCHEMA, REPO, boundsRadius, catalogueSource, mm, packFileName, serialisePack, storeyName } from './lib/manifest.mjs';
import { buildNav } from './lib/nav.mjs';
import { packPalette } from './lib/palette.mjs';
import { encodePosters } from './lib/posters.mjs';
import { textLeak } from './lib/pure/paths.mjs';
import { readWalkHeader, writeGround } from './lib/pure/sn5w.mjs';
import { buildSite } from './lib/site.mjs';
import { REPO_ROOT, checkBudgets, checkTokens, leakScanDir, listFiles, loadBudgets, loadPalette, verifyFiles } from './check.mjs';

const NODE_MAJOR = '24';
const TOOL = { pipeline: 'scripts/estate/pack.mjs', gltfTransform: '4.5.1', meshoptimizer: '1.3.0', node: NODE_MAJOR };
const MIN_SHARE = 0.93;

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

const usage = () => 'usage: pack.mjs (--zips <dir> | --dev-src <dir>) [--out <dir>] [--classes a,b,…] [--release] [--verify] [--allow-rot] [--catalogue <file>]';

export const parseArgs = (argv) => {
  const a = { zips: null, devSrc: null, out: null, classes: [...CLASS_ORDER], release: false, verify: false, allowRot: false, catalogue: null, quiet: false };
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
    else if (arg === '--quiet') a.quiet = true;
    else throw new Error(`unknown argument ${arg}\n${usage()}`);
  }
  if (!a.zips === !a.devSrc) throw new Error(`give exactly one of --zips and --dev-src\n${usage()}`);
  for (const c of a.classes) if (!CLASS_ORDER.includes(c)) throw new Error(`unknown class ${c} (classes: ${CLASS_ORDER.join(', ')})`);
  a.classes = CLASS_ORDER.filter((c) => a.classes.includes(c));
  if (a.classes.includes('ground') && !a.classes.includes('s0')) throw new Error('class ground lives in the site layer: add s0');
  if (a.devSrc && a.release) throw new Error('--release cannot be used with --dev-src: a dev pack has no provenance');
  if (!a.out && !a.devSrc) throw new Error(`--out is required with --zips\n${usage()}`);
  return a;
};

const isUnder = (child, parent) => { const r = relative(parent, child); return r === '' || (!r.startsWith('..') && !/^[A-Za-z]:/.test(r)); };

// Empties a previous pack folder; refuses a folder that holds anything else.
const prepareOut = (dir) => {
  if (existsSync(dir)) {
    const entries = readdirSync(dir);
    const isPack = entries.length === 0 || entries.some((e) => /^pack\.[0-9a-f]{8}\.json$/.test(e));
    if (!isPack) throw new Error(`${dir} exists and is not a pack folder; refusing to empty it`);
    for (const e of entries) rmSync(join(dir, e), { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
};

const unique = (list) => [...new Set(list)];

/** A ring without its closing repeat (upstream closes its polygons). */
export const openRing = (ring) => {
  const last = ring[ring.length - 1];
  return ring.length > 1 && last[0] === ring[0][0] && last[1] === ring[0][1] ? ring.slice(0, -1) : ring.slice();
};

/** Builds a pack into `outDir`. Returns { packName, problems, warnings, report }. */
export const build = async (opts, outDir, log) => {
  const t0 = Date.now();
  const warnings = [];
  const warn = (m) => { warnings.push(m); log(`  warning: ${m}`); };
  const classes = new Set(opts.classes);
  const budgets = loadBudgets();

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
  let previousAssets = null;
  if (opts.release && existsSync(outDir)) {
    const prev = readdirSync(outDir).find((f) => /^pack\.[0-9a-f]{8}\.json$/.test(f));
    if (prev) previousAssets = JSON.parse(readFileSync(join(outDir, prev), 'utf8')).source.assets;
  }
  const exp = checkExport({ source, repoRoot: REPO_ROOT, release: opts.release, releaseManifest: opened.releaseManifest, previousAssets, assets, edition: EDITION, allowRot: opts.allowRot });
  prepareOut(outDir);

  const manifestSites = new Map((exp.manifest.sites ?? []).map((s) => [s.id, s]));
  const sitesOut = []; const catalogueSites = []; const massingParts = [];
  const report = { classes: opts.classes, sites: {}, site: null, posters: [], timings: {} };
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
    return { geo: { ...ref, tris: c.tris, verts: c.verts, prims: c.prims, draws: c.draws, maxPrimVerts: c.maxPrimVerts }, counts: c, validator: { warnings: v.warnings, infos: v.infos } };
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
      if (classes.has('f')) {
        const out = await emitGlb(ext.facade.ctx, 14, `f/${id}`, ext.facade.tris);
        if (out.counts.lines !== ext.facade.edges) throw new Error(`${id} F: decodes to ${out.counts.lines} edge lines, built ${ext.facade.edges}`);
        site.facade = { ...out.geo, error: 0.06, edges: ext.facade.edges, exactMatched: ext.facade.exactMatched };
        rep.facade = { bytes: out.geo.bytes, tris: out.geo.tris, draws: out.geo.draws, panels: ext.facade.panels, facing: ext.facade.facing, banded: ext.facade.banded };
      }
      if (classes.has('d')) {
        const out = await emitGlb(ext.detail.ctx, 16, `d/${id}`, ext.detail.storedTris, ext.detail.batches);
        if (out.counts.instances !== ext.detail.instances) throw new Error(`${id} D: decodes to ${out.counts.instances} instances, built ${ext.detail.instances}`);
        if (!out.counts.instanceAttributes.has('_STOREY')) throw new Error(`${id} D: no _STOREY instance attribute`);
        // D's tris are what it draws (every instance), which is what the LOD budget adds to F's.
        site.detail = { ...out.geo, tris: out.counts.drawnTris, instances: ext.detail.instances };
        rep.detail = { bytes: out.geo.bytes, storedTris: out.counts.tris, drawnTris: out.counts.drawnTris, draws: out.geo.draws, kits: ext.detail.kits, instances: ext.detail.instances };
      }
    }
    if (classes.has('i')) {
      const I = await buildInterior(a, budgets);
      if (I.problems.length) throw new Error(`${id} interior: ${I.problems.join('; ')}`);
      const storedTris = I.stats.typicalTris + I.stats.residualTris + I.stats.specials.reduce((n, sp) => n + sp.tris, 0) + I.stats.furniture.reduce((n, k) => n + k.tris + k.proxyTris, 0);
      const out = await emitGlb(I.ctx, 16, `i/${id}`, storedTris, I.batches);
      site.interior = {
        ...out.geo,
        typicalTris: I.stats.typicalTris, residualTris: I.stats.residualTris, specials: I.stats.specials,
        ...(I.stats.furniture.length ? { furniture: I.stats.furniture } : {}),
        sourceTris: I.stats.sourceTris, drawnTris: I.stats.drawnTris,
      };
      rep.interior = { bytes: out.geo.bytes, tris: out.geo.tris, draws: out.geo.draws, typical: I.stats.typical, shares: I.stats.shares, typicalTris: I.stats.typicalTris, residualTris: I.stats.residualTris, specials: I.stats.specials, furniture: I.stats.furniture };
    }
    if (classes.has('w')) {
      const rel = `model/${id}/${id}_walk.bin`;
      {
        const raw = source.read(rel);
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
    }
    if (classes.has('nav')) {
      const { nav, warnings: navWarnings } = buildNav({ id, engine, storeys, web });
      for (const w of navWarnings) warn(w);
      const ref = writeHashed(outDir, `nav/${id}`, 'json', Buffer.from(`${JSON.stringify(nav)}\n`, 'utf8'), { gzip: false });
      site.nav = ref;
      rep.nav = { bytes: ref.bytes, lifts: nav.lifts.length, typicalRooms: nav.rooms.typical?.rooms.length ?? 0 };
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
    source: {
      repo: REPO, tag: EDITION,
      commit: exp.commit ?? '0'.repeat(40),
      buildCommit: exp.buildCommit ?? '0'.repeat(40),
      manifestSha256: exp.manifestSha256,
      exportInfoSha256: exp.exportInfoSha256 ?? '0'.repeat(64),
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
    const views = source.json(viewsRel);
    const shot = views.aerial_NE ?? views.ESTATE_aerial_NE ?? views.shots?.aerial_NE;
    if (!shot) warn('ESTATE_views.json has no aerial_NE shot; pack.views stays empty');
    else pack.views.aerialNE = viewFromBlender(shot);
  } else if (source.mode === 'release') throw new Error(`the release has no ${viewsRel}`);
  else warn('no ESTATE_views.json in the dev source, so pack.views is empty');

  if (classes.has('s0')) {
    const t = Date.now();
    const ctx = newDoc();
    for (const { id, soup } of massingParts) ctx.scene.addChild(ctx.doc.createNode(id).setMesh(buildMesh(ctx, `${id}_massing`, soup)));
    const massingTris = massingParts.reduce((n, p) => n + p.soup.count, 0);
    const massing = await emitGlb(ctx, 14, 's0/massing', massingTris);
    pack.massing = massing.geo;
    const lod0 = await readGlb(source.read('model/SITE_lod0.glb'));
    const s = await buildSite(lod0, warn);
    const storedTris = s.quadrants.reduce((n, q) => n + q.tris, 0) + s.trees.reduce((n, tr) => n + tr.tris + tr.crownTris, 0);
    const siteGlb = await emitGlb(s.ctx, 14, 's0/site', storedTris);
    pack.site = { file: siteGlb.geo, quadrants: s.quadrants, trees: s.trees };
    if (classes.has('ground')) {
      const ref = writeHashed(outDir, 'site/ground', 'bin.gz', writeGround(s.ground), { gzip: true });
      pack.site.ground = { ...ref, cell: s.ground.cell, lo: s.ground.lo, nx: s.ground.nx, ny: s.ground.ny };
      report.ground = { bytes: ref.bytes, nx: s.ground.nx, ny: s.ground.ny };
    }
    const bus = (exp.manifest.spawn_points ?? []).filter((p) => p.site === 'SITE');
    if (bus.length) pack.site.spawns = bus.map((p) => ({ name: p.name, pos: p.position.map(mm), facing: [mm(p.facing[0]), mm(p.facing[1])], kind: 'bus' }));
    pack.stage0 = [pack.massing.path, pack.site.file.path];
    report.site = { massingBytes: massing.geo.bytes, massingTris, massingDraws: massing.geo.draws, siteBytes: siteGlb.geo.bytes, siteTris: siteGlb.geo.tris, siteDraws: siteGlb.geo.draws, quadrants: s.quadrants.map((q) => q.tris), trees: s.trees };
    report.timings.site = Date.now() - t;
  }
  if (classes.has('poster')) {
    const png = source.read('reports/renders/ESTATE/ESTATE_aerial_NE.png');
    for (const p of encodePosters(png, budgets.classes.poster.files)) {
      const [stem, ext] = [`poster/${p.name.replace(/\.(webp|jpg)$/, '')}`, p.name.split('.').pop()];
      const ref = writeHashed(outDir, stem, ext, p.bytes, { gzip: false });
      pack.posters.push(ref);
      report.posters.push({ name: p.name, bytes: ref.bytes, quality: p.quality });
    }
  }

  // totals.byClass, then pack.json solved for its own size.
  const byClass = {};
  const add = (k, ref) => { if (ref) byClass[k] = (byClass[k] ?? 0) + ref.bytes; };
  for (const p of pack.posters) add('poster', p);
  add('s0', pack.massing); add('s0', pack.site?.file); add('ground', pack.site?.ground);
  for (const s of sitesOut) { add('f', s.facade); add('d', s.detail); add('i', s.interior); add('w', s.walk); add('nav', s.nav); }
  pack.totals.byClass = Object.fromEntries(pack.classes.map((k) => [k, byClass[k] ?? 0]));
  pack.warnings = unique(warnings);
  const allFiles = Object.values(byClass).reduce((n, b) => n + b, 0);
  const stage0Files = (pack.stage0 ?? []).reduce((n, p) => n + ([pack.massing, pack.site?.file].find((r) => r?.path === p)?.bytes ?? 0), 0);
  const { bytes: packBytes, gzBytes } = serialisePack(pack, stage0Files, allFiles);
  const packName = packFileName(packBytes);
  writeFileSync(join(outDir, packName), packBytes);

  // The catalogue: lib/estate/ for the committed pack, beside the pack otherwise.
  const publicEstate = join(REPO_ROOT, 'public', 'estate', EDITION);
  const cataloguePath = opts.catalogue ? resolve(opts.catalogue)
    : resolve(outDir) === resolve(publicEstate) ? join(REPO_ROOT, 'lib', 'estate', 'catalogue.generated.ts') : join(outDir, 'catalogue.generated.ts');
  const catalogue = catalogueSource({ pack, packUrl: `/estate/${EDITION}/${packName}`, posters: pack.posters, sites: catalogueSites });
  if (Buffer.byteLength(catalogue) > 6000) throw new Error(`catalogue.generated.ts is ${Buffer.byteLength(catalogue)} B > 6,000`);
  writeFileSync(cataloguePath, catalogue);

  // Step 14 and 15: budgets, files, tokens and the leak scan over every byte written.
  const problems = [];
  const allowed = isUnder(cataloguePath, outDir) ? [relative(outDir, cataloguePath).split(sep).join('/')] : [];
  problems.push(...verifyFiles(outDir, JSON.parse(packBytes.toString('utf8')), { allowed }));
  const budget = checkBudgets(pack, budgets, packBytes.length, gzBytes);
  problems.push(...budget.problems);
  for (const w of budget.warnings) warn(w);
  problems.push(...checkTokens(loadPalette(), readFileSync(join(REPO_ROOT, 'index.css'), 'utf8')));
  problems.push(...leakScanDir(outDir).map((h) => `leak: ${h}`));
  if (!allowed.length) {
    const hit = textLeak(readFileSync(cataloguePath));
    if (hit) problems.push(`leak: catalogue @${hit.offset}: ${JSON.stringify(hit.match)}`);
  }
  report.measured = budget.measured;
  report.packJson = { name: packName, bytes: packBytes.length, gzBytes };
  report.timings.total = Date.now() - t0;
  return { packName, problems, warnings: pack.warnings, report, pack, cataloguePath };
};

// Blender's camera record (U2's ESTATE_views.json) → pack.views.aerialNE.
// matrix_world is row-major 4×4 in the estate frame (Z up); the camera looks
// down its local −Z. The quaternion is the matrix's rotation, (x, y, z, w).
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

/** --verify: rebuild into a temporary folder and compare raw payloads and pack.json. */
const verify = async (opts, log) => {
  const outDir = resolve(opts.out);
  if (!existsSync(outDir)) throw new Error(`--verify: ${outDir} does not exist; build it first`);
  const tmp = mkdtempSync(join(tmpdir(), 'estate-verify-'));
  try {
    const result = await build({ ...opts, catalogue: join(tmp, 'catalogue.generated.ts'), release: false }, join(tmp, 'pack'), log);
    const a = listFiles(outDir).filter((f) => f !== 'catalogue.generated.ts' && f !== 'report.json');
    const b = listFiles(join(tmp, 'pack')).filter((f) => f !== 'catalogue.generated.ts');
    const problems = result.problems.map((p) => `rebuild: ${p}`);
    if (a.join('\n') !== b.join('\n')) problems.push(`file lists differ:\n    built: ${b.join(' ')}\n    found: ${a.join(' ')}`);
    // The catalogue where the original build put it (lib/estate/ for the committed pack).
    const publicEstate = join(REPO_ROOT, 'public', 'estate', EDITION);
    const catalogue = opts.catalogue ?? (resolve(outDir) === resolve(publicEstate) ? join(REPO_ROOT, 'lib', 'estate', 'catalogue.generated.ts') : join(outDir, 'catalogue.generated.ts'));
    if (!existsSync(catalogue)) problems.push(`${relative(REPO_ROOT, catalogue)} is missing`);
    else if (readFileSync(catalogue, 'utf8') !== readFileSync(join(tmp, 'catalogue.generated.ts'), 'utf8')) problems.push(`${relative(REPO_ROOT, catalogue)} differs from a rebuild`);
    for (const f of b) {
      if (!a.includes(f)) continue;
      const x = readFileSync(join(outDir, ...f.split('/'))); const y = readFileSync(join(tmp, 'pack', ...f.split('/')));
      const rx = f.endsWith('.gz') ? gunzip(x) : x; const ry = f.endsWith('.gz') ? gunzip(y) : y;
      if (sha256(rx) !== sha256(ry)) problems.push(`${f}: raw payload differs`);
      else if (sha256(x) !== sha256(y)) log(`  note: ${f}: same payload, different gzip bytes`);
    }
    return { problems, result };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
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
  const base = process.env.INIT_CWD ?? process.cwd();
  for (const key of ['zips', 'devSrc', 'catalogue']) if (opts[key]) opts[key] = resolve(base, opts[key]);
  const out = opts.out ? resolve(base, opts.out) : join(REPO_ROOT, 'artifacts', 'estate', `${EDITION}-dev`);
  opts.out = out;
  if (opts.devSrc && isUnder(out, join(REPO_ROOT, 'public'))) { console.error('refusing: a --dev-src pack may not be written under public/'); return 2; }
  const log = opts.quiet ? () => {} : (m) => console.log(m);
  if (opts.devSrc) console.warn(DEV_BANNER);
  try {
    if (opts.verify) {
      const { problems, result } = await verify(opts, log);
      if (problems.length) { console.error(`--verify FAILED:\n  ${problems.join('\n  ')}`); return 1; }
      console.log(`--verify: identical (${result.packName}, ${Object.keys(result.report.sites).length} sites)`);
      return 0;
    }
    const result = await build(opts, out, log);
    const reportPath = isUnder(out, join(REPO_ROOT, 'public')) ? join(REPO_ROOT, 'artifacts', 'estate', `report-${EDITION}.json`) : join(out, 'report.json');
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(result.report, null, 1)}\n`);
    console.log(`\n${result.packName}: ${result.report.measured.files} files, ${result.report.measured.total} B (first frame ${result.report.measured.stage0} B) in ${(result.report.timings.total / 1000).toFixed(1)} s`);
    for (const [k, v] of Object.entries(result.report.measured.byClass)) console.log(`  ${k.padEnd(6)} ${String(v).padStart(9)} B`);
    console.log(`  catalogue: ${relative(REPO_ROOT, result.cataloguePath).split(sep).join('/')}`);
    console.log(`  report:    ${relative(REPO_ROOT, reportPath).split(sep).join('/')}`);
    if (result.problems.length) {
      console.error(`\nREFUSED: ${result.problems.length} problems:\n  ${result.problems.join('\n  ')}`);
      discardPublic(out);
      return 1;
    }
    if (opts.devSrc) console.warn(DEV_BANNER);
    return 0;
  } catch (e) {
    console.error(`\nestate:pack failed: ${e.message}`);
    discardPublic(out);
    return 1;
  }
};

// A refused or failed build never leaves a half-written pack where it could be
// committed: under public/ the folder is emptied (git restores the last good one).
const discardPublic = (out) => {
  if (!isUnder(out, join(REPO_ROOT, 'public')) || !existsSync(out)) return;
  for (const e of readdirSync(out)) rmSync(join(out, e), { recursive: true, force: true });
  console.error(`  ${relative(REPO_ROOT, out).split(sep).join('/')} was emptied; "git checkout -- public/estate" restores the committed pack.`);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
