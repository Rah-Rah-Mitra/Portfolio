// npm run estate:check — verifies an estate pack with no dependencies (plan
// §6.6). Runs under the root's node with nothing installed, and its functions
// are what tests/estate-pack.test.ts reuses.
//
//   node scripts/estate/check.mjs                      the committed pack: public/estate/v*/
//   node scripts/estate/check.mjs --pack <dir>         one pack folder (a dev or candidate pack)
//   node scripts/estate/check.mjs --provenance         also: source.commit = gitlink = v1.2^{commit}
//
// Checks: every referenced file exists, its stored bytes hash to gzSha256 and
// its raw payload (gunzipped for .gz) to sha256, whose first 8 hex name it;
// sizes match; no stray files; caps from lib/estate/packBudgets.json; palette
// tokens exist in index.css; a leak scan of every byte (gz decompressed); a
// dev pack never under public/.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzip, gzipDeterministic, sha256 } from './lib/files.mjs';
import { leakInPayload, packPathProblem, payloadKind } from './lib/pure/paths.mjs';
import { gitlink, tagCommit } from './lib/provenance.mjs';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUDGETS_PATH = join(REPO_ROOT, 'lib', 'estate', 'packBudgets.json');
const PALETTE_PATH = join(REPO_ROOT, 'lib', 'estate', 'palette.json');

export const loadBudgets = () => JSON.parse(readFileSync(BUDGETS_PATH, 'utf8'));
export const loadPalette = () => JSON.parse(readFileSync(PALETTE_PATH, 'utf8'));

/** Every file under a folder, as forward-slashed relative paths, sorted. */
export const listFiles = (dir) => {
  const out = [];
  const walk = (rel) => {
    for (const entry of readdirSync(join(dir, ...rel.split('/').filter(Boolean)), { withFileTypes: true })) {
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(r); else out.push(r);
    }
  };
  walk('');
  return out.sort();
};

/** The pack.<h8>.json in a version folder; throws unless there is exactly one. */
export const findPackJson = (dir) => {
  const found = readdirSync(dir).filter((f) => /^pack\.[0-9a-f]{8}\.json$/.test(f));
  if (found.length !== 1) throw new Error(`${dir}: expected exactly one pack.<h8>.json, found ${found.length}`);
  return join(dir, found[0]);
};

/** Every FileRef in a pack with its class, in a stable order. */
export const packFiles = (pack) => {
  const out = [];
  const add = (klass, ref, extra = {}) => { if (ref) out.push({ klass, ref, ...extra }); };
  for (const p of pack.posters ?? []) add('poster', p);
  if (pack.massing) add('s0', pack.massing, { geo: 'massing' });
  if (pack.site) { add('s0', pack.site.file, { geo: 'site' }); add('ground', pack.site.ground); }
  for (const s of pack.sites ?? []) {
    add('f', s.facade, { geo: 'f', site: s.id });
    add('d', s.detail, { geo: 'd', site: s.id });
    add('i', s.interior, { geo: 'i', site: s.id });
    add('w', s.walk, { site: s.id });
    add('nav', s.nav, { site: s.id });
  }
  return out;
};

/**
 * Files: existence, sizes, both hashes, the name's h8, the path rule, no strays.
 * @param {string} dir
 * @param {any} pack
 * @param {{ allowed?: string[] }} [options] files that may sit beside the pack
 */
export const verifyFiles = (dir, pack, { allowed = [] } = {}) => {
  const problems = [];
  const referenced = new Set();
  for (const { ref } of packFiles(pack)) {
    const pathProblem = packPathProblem(ref.path);
    if (pathProblem) { problems.push(`${ref.path}: ${pathProblem}`); continue; }
    referenced.add(ref.path);
    const full = join(dir, ...ref.path.split('/'));
    if (!existsSync(full)) { problems.push(`${ref.path}: missing`); continue; }
    const stored = readFileSync(full);
    if (stored.length !== ref.bytes) problems.push(`${ref.path}: ${stored.length} B on disk, pack.json says ${ref.bytes}`);
    if (sha256(stored) !== ref.gzSha256) problems.push(`${ref.path}: stored bytes do not hash to gzSha256 (a CRLF rewrite? see .gitattributes)`);
    const raw = ref.path.endsWith('.gz') ? gunzip(stored) : stored;
    if (raw.length !== ref.rawBytes) problems.push(`${ref.path}: ${raw.length} B raw, pack.json says ${ref.rawBytes}`);
    const hash = sha256(raw);
    if (hash !== ref.sha256) problems.push(`${ref.path}: raw payload does not hash to sha256`);
    if (!ref.path.split('/').pop().includes(`.${hash.slice(0, 8)}.`)) problems.push(`${ref.path}: name does not carry .${hash.slice(0, 8)}.`);
    if (ref.path.endsWith('.gz') && (stored[9] !== 0xff || stored.readUInt32LE(4) !== 0)) problems.push(`${ref.path}: gzip header is not mtime 0, OS 0xff`);
  }
  const packName = findPackJson(dir).split(/[\\/]/).pop();
  for (const file of listFiles(dir)) {
    if (file === packName || referenced.has(file) || allowed.includes(file)) continue;
    problems.push(`${file}: stray file (not in pack.json)`);
  }
  return problems;
};

/** Caps (plan §6.5). Returns { problems, warnings, measured }. */
export const checkBudgets = (pack, budgets, packJsonBytes, packJsonGzBytes) => {
  const problems = []; const warnings = [];
  const files = packFiles(pack);
  const classes = budgets.classes;
  const byClass = {};
  for (const { klass, ref } of files) byClass[klass] = (byClass[klass] ?? 0) + ref.bytes;
  for (const { klass, ref } of files) {
    const cap = classes[klass];
    if (!cap) continue;
    if (cap.perFile !== undefined && ref.bytes > cap.perFile) problems.push(`${ref.path}: ${ref.bytes} B > ${klass} per-file cap ${cap.perFile}`);
    if (klass === 'poster') {
      const name = ref.path.split('/').pop().replace(/\.[0-9a-f]{8}\./, '.');
      if (cap.files?.[name] !== undefined && ref.bytes > cap.files[name]) problems.push(`${ref.path}: ${ref.bytes} B > its cap ${cap.files[name]}`);
    }
  }
  for (const [klass, cap] of Object.entries(classes)) {
    if (cap.total !== undefined && (byClass[klass] ?? 0) > cap.total) problems.push(`class ${klass}: ${byClass[klass]} B > total cap ${cap.total}`);
  }
  for (const [name, group] of Object.entries(budgets.groups ?? {})) {
    const sum = group.classes.reduce((n, k) => n + (byClass[k] ?? 0), 0);
    if (sum > group.total) problems.push(`group ${name}: ${sum} B > ${group.total}`);
  }
  const stage0 = (pack.stage0 ?? []).reduce((n, p) => n + (files.find((f) => f.ref.path === p)?.ref.bytes ?? 0), 0) + packJsonGzBytes;
  if (pack.stage0 && stage0 > budgets.pack.firstFrame.bytes) problems.push(`first frame: ${stage0} B > ${budgets.pack.firstFrame.bytes}`);
  const total = files.reduce((n, f) => n + f.ref.bytes, 0) + packJsonBytes;
  if (total > budgets.pack.hardBytes) problems.push(`whole pack: ${total} B > hard cap ${budgets.pack.hardBytes}`);
  else if (total > budgets.pack.warnBytes) warnings.push(`whole pack: ${total} B > warning level ${budgets.pack.warnBytes}`);
  if (files.length + 1 > budgets.pack.maxFiles) problems.push(`${files.length + 1} files > ${budgets.pack.maxFiles}`);

  const t = budgets.triangles;
  const draws = budgets.drawsPerFile;
  for (const { ref, geo, site } of files) {
    if (!geo) continue;
    if (ref.maxPrimVerts > budgets.maxPrimVerts) problems.push(`${ref.path}: a primitive holds ${ref.maxPrimVerts} vertices > ${budgets.maxPrimVerts}`);
    const cap = draws[geo];
    if (cap !== undefined && ref.draws > cap) problems.push(`${ref.path}: ${ref.draws} draws > ${cap}`);
    if (geo === 'f' && ref.tris > t.facadePerBuilding) problems.push(`${site} F: ${ref.tris} triangles > ${t.facadePerBuilding}`);
  }
  for (const s of pack.sites ?? []) {
    if (s.massing && s.massing.tris > t.massingPerBuilding) problems.push(`${s.id} massing: ${s.massing.tris} triangles > ${t.massingPerBuilding}`);
    const i = s.interior;
    if (!i) continue;
    if (i.typicalTris > t.typicalPerBuilding) problems.push(`${s.id} T: ${i.typicalTris} > ${t.typicalPerBuilding}`);
    if (i.residualTris > t.residualPerBuilding) problems.push(`${s.id} R: ${i.residualTris} > ${t.residualPerBuilding}`);
    for (const sp of i.specials) if (sp.tris > t.specialStorey) problems.push(`${s.id} ${sp.tag}: ${sp.tris} > ${t.specialStorey}`);
    for (const k of i.furniture ?? []) if (k.tris > t.repeatedMesh) problems.push(`${s.id} furniture ${k.kit}: ${k.tris} > ${t.repeatedMesh}`);
    for (const st of s.storeys) {
      if (i.drawnTris[st.tag] !== i.sourceTris[st.tag]) problems.push(`${s.id} ${st.tag}: draws ${i.drawnTris[st.tag]} triangles of its chunk's ${i.sourceTris[st.tag]}`);
      if (st.geom === 'typical') {
        const share = i.typicalTris / i.sourceTris[st.tag];
        if (!(share >= budgets.minTypicalShare)) problems.push(`${s.id} ${st.tag}: typical share ${share.toFixed(4)} < ${budgets.minTypicalShare}`);
      }
    }
  }
  return { problems, warnings, measured: { byClass, stage0, total, files: files.length + 1 } };
};

/** Every palette token appears as a custom property in index.css. */
export const checkTokens = (palette, css) => {
  const tokens = new Set([...palette.materials.map((m) => m.token), ...palette.extras.map((e) => e.token), ...Object.values(palette.scene)]);
  return [...tokens].filter((t) => !new RegExp(`${t.replace(/[-]/g, '\\-')}\\s*:`).test(css)).map((t) => `palette token ${t} is not defined in index.css`);
};

/** The leak scan of every byte in a folder (gz decompressed). Returns the hits. */
export const leakScanDir = (dir) => {
  const hits = [];
  for (const file of listFiles(dir)) {
    const stored = readFileSync(join(dir, ...file.split('/')));
    const payload = file.endsWith('.gz') ? gunzip(stored) : stored;
    const hit = leakInPayload(payload, payloadKind(file.replace(/\.gz$/, '')));
    if (hit) hits.push(`${file} @${hit.offset}: ${JSON.stringify(hit.match)}`);
    const pathProblem = packPathProblem(file);
    if (pathProblem) hits.push(`${file}: ${pathProblem}`);
  }
  return hits;
};

const isUnder = (child, parent) => { const r = relative(parent, child); return r === '' || (!r.startsWith('..') && !r.includes(':')); };

/**
 * Checks one pack folder. Returns { problems, warnings, measured, pack }.
 * @param {string} dir
 * @param {{ allowed?: string[], provenance?: boolean }} [options]
 */
export const checkPackDir = (dir, { allowed = [], provenance = false } = {}) => {
  const problems = []; const warnings = [];
  const packPath = findPackJson(dir);
  const packBytes = readFileSync(packPath);
  const pack = JSON.parse(packBytes.toString('utf8'));
  const h8 = sha256(packBytes).slice(0, 8);
  if (!packPath.endsWith(`pack.${h8}.json`)) problems.push(`${packPath}: name does not carry its own hash ${h8}`);
  if (pack.source?.dev === true) {
    if (isUnder(resolve(dir), join(REPO_ROOT, 'public'))) problems.push('a dev pack (source.dev) is under public/: dev packs are never committed');
    warnings.push('DEV PACK: built from an extracted directory with the provenance gates skipped');
  }
  problems.push(...verifyFiles(dir, pack, { allowed }));
  const budget = checkBudgets(pack, loadBudgets(), packBytes.length, gzipDeterministic(packBytes).length);
  problems.push(...budget.problems); warnings.push(...budget.warnings);
  const cssPath = join(REPO_ROOT, 'index.css');
  if (existsSync(cssPath)) problems.push(...checkTokens(loadPalette(), readFileSync(cssPath, 'utf8')));
  problems.push(...leakScanDir(dir).map((h) => `leak: ${h}`));
  if (provenance) {
    const link = gitlink(REPO_ROOT);
    if (!link) problems.push('--provenance: no gitlink in the index');
    else {
      if (pack.source.commit !== link) problems.push(`--provenance: source.commit ${pack.source.commit} ≠ gitlink ${link}`);
      const tagged = tagCommit(REPO_ROOT, pack.edition);
      if (tagged !== link) problems.push(`--provenance: ${pack.edition}^{commit} ${tagged ?? 'unknown'} ≠ gitlink ${link}`);
    }
    if (pack.source.dev) problems.push('--provenance: a dev pack has no provenance');
  }
  return { problems, warnings, measured: budget.measured, pack };
};

const main = (argv) => {
  const args = { pack: null, provenance: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--pack') args.pack = argv[++i];
    else if (argv[i] === '--provenance') args.provenance = true;
    else { console.error(`unknown argument ${argv[i]}`); return 2; }
  }
  let dirs;
  if (args.pack) dirs = [resolve(args.pack)];
  else {
    const base = join(REPO_ROOT, 'public', 'estate');
    const versions = existsSync(base) ? readdirSync(base).filter((d) => /^v\d+\.\d+$/.test(d) && statSync(join(base, d)).isDirectory()) : [];
    if (!versions.length) { console.log('estate:check: no committed pack under public/estate (nothing to check).'); return 0; }
    if (versions.length > 1) { console.error(`estate:check: ${versions.length} version folders under public/estate; exactly one may exist`); return 1; }
    dirs = [join(base, versions[0])];
  }
  let failed = false;
  for (const dir of dirs) {
    const allowed = existsSync(join(dir, 'catalogue.generated.ts')) && !isUnder(dir, join(REPO_ROOT, 'public')) ? ['catalogue.generated.ts', 'report.json'] : [];
    const { problems, warnings, measured } = checkPackDir(dir, { allowed, provenance: args.provenance });
    console.log(`estate:check ${relative(REPO_ROOT, dir).split(sep).join('/')}: ${measured.files} files, ${measured.total} B, first frame ${measured.stage0} B`);
    for (const [klass, bytes] of Object.entries(measured.byClass)) console.log(`  ${klass.padEnd(6)} ${String(bytes).padStart(9)} B`);
    for (const w of warnings) console.log(`  warning: ${w}`);
    for (const p of problems) console.error(`  FAIL: ${p}`);
    if (problems.length) failed = true;
  }
  return failed ? 1 : 0;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
