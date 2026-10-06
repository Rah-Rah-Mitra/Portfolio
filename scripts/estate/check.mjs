// npm run estate:check — verifies an estate pack with no dependencies (plan
// §6.6). Runs under the root's node with nothing installed, and its functions
// are what tests/estate-pack.test.ts reuses.
//
//   node scripts/estate/check.mjs                      the committed pack: public/estate/v*/
//   node scripts/estate/check.mjs --pack <dir>         one pack folder (a dev or candidate pack)
//   node scripts/estate/check.mjs --provenance         also: source.commit = gitlink = v1.2^{commit}
//   node scripts/estate/check.mjs --provenance --zips <downloaded release folder>
//                                                      also: the zips hash to source.assets
//
// Checks: every referenced file exists, its stored bytes hash to gzSha256 and
// its raw payload (gunzipped for .gz) to sha256, whose first 8 hex name it;
// sizes match; no stray files; caps from lib/estate/packBudgets.json; palette
// tokens exist in index.css; a leak scan of every byte (gz decompressed, and
// the stored bytes too, header included); gzip headers carry no optional field;
// public/estate holds LICENSE.txt and exactly one vX.Y folder, nothing else;
// a dev pack nowhere under public/.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzip, gzipDeterministic, sha256 } from './lib/files.mjs';
import { binaryLeak, leakInPayload, packPathProblem, payloadKind } from './lib/pure/paths.mjs';
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
    if (ref.path.endsWith('.gz')) {
      const header = gzipHeaderProblem(stored);
      if (header) problems.push(`${ref.path}: ${header}`);
    }
  }
  const packName = findPackJson(dir).split(/[\\/]/).pop();
  for (const file of listFiles(dir)) {
    if (file === packName || referenced.has(file) || allowed.includes(file)) continue;
    problems.push(`${file}: stray file (not in pack.json)`);
  }
  return problems;
};

/**
 * The tool's gzip header exactly: magic, deflate, FLG 0 (no name, comment,
 * extra field or header CRC — nothing a reader skips), mtime 0, XFL 0 or 2,
 * OS 0xff. Returns why not, or null.
 */
export const gzipHeaderProblem = (stored) => {
  if (stored.length < 18 || stored[0] !== 0x1f || stored[1] !== 0x8b || stored[2] !== 8) return 'not a deflate gzip stream';
  if (stored[3] !== 0) return `gzip FLG is 0x${stored[3].toString(16)}: optional header fields (name, comment, extra) are not allowed`;
  if (stored.readUInt32LE(4) !== 0 || stored[9] !== 0xff) return 'gzip header is not mtime 0, OS 0xff';
  if (stored[8] !== 0 && stored[8] !== 2) return `gzip XFL is ${stored[8]}`;
  return null;
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
    // The stored bytes too: a gzip header can carry a file name or a comment.
    if (file.endsWith('.gz')) {
      const raw = binaryLeak(stored);
      if (raw) hits.push(`${file} (stored) @${raw.offset}: ${JSON.stringify(raw.match)}`);
      const header = gzipHeaderProblem(stored);
      if (header) hits.push(`${file}: ${header}`);
    }
    const pathProblem = packPathProblem(file);
    if (pathProblem) hits.push(`${file}: ${pathProblem}`);
  }
  return hits;
};

const isUnder = (child, parent) => { const r = relative(parent, child); return r === '' || (!r.startsWith('..') && !r.includes(':')); };

const sha256File = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/**
 * Plan §6.6's public/estate rule: LICENSE.txt and exactly one vX.Y folder,
 * nothing else; and no dev pack anywhere under public/. Returns { problems,
 * versions }.
 */
export const checkPublicEstate = (repoRoot = REPO_ROOT) => {
  const problems = [];
  const base = join(repoRoot, 'public', 'estate');
  const versions = [];
  if (existsSync(base)) {
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory() && /^v\d+\.\d+$/.test(entry.name)) versions.push(entry.name);
      else if (!(entry.isFile() && entry.name === 'LICENSE.txt')) problems.push(`public/estate/${entry.name}: only LICENSE.txt and one vX.Y folder may live here`);
    }
    if (versions.length > 1) problems.push(`public/estate holds ${versions.length} version folders (${versions.join(', ')}); exactly one may exist`);
  }
  const pub = join(repoRoot, 'public');
  if (existsSync(pub)) {
    for (const file of listFiles(pub)) {
      if (!/(^|\/)pack\.[0-9a-f]{8}\.json$/.test(file)) continue;
      try {
        if (JSON.parse(readFileSync(join(pub, ...file.split('/')), 'utf8')).source?.dev === true) problems.push(`public/${file} is a dev pack (source.dev): dev packs are never committed`);
      } catch { problems.push(`public/${file} does not parse`); }
    }
  }
  return { problems, versions };
};

/**
 * The committed catalogue's merge gate (plan §10.2 estate-pack, the P4b review):
 * lib/estate/catalogue.generated.ts must describe a committed release pack, so
 * a catalogue generated from a dev pack (`dev: true`) fails, and so does any
 * /estate/ URL it names that is not on disk under public/. Runs on every
 * estate:check, with or without a pack, because a branch that carries the
 * catalogue but not its pack (the dev pack is never committed) is exactly the
 * one to stop. Returns problems.
 */
export const checkCommittedCatalogue = (repoRoot = REPO_ROOT) => {
  const file = join(repoRoot, 'lib', 'estate', 'catalogue.generated.ts');
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8');
  const problems = [];
  if (/^\s*dev: true,/m.test(text)) problems.push('lib/estate/catalogue.generated.ts was generated from a dev pack (dev: true): regenerate it from the published release pack before merging');
  for (const url of new Set(text.match(/\/estate\/v\d+\.\d+\/[A-Za-z0-9._/-]+/g) ?? [])) {
    if (!existsSync(join(repoRoot, 'public', ...url.slice(1).split('/')))) problems.push(`lib/estate/catalogue.generated.ts names ${url}, which is not under public/`);
  }
  return problems;
};

/**
 * --provenance --zips: the downloaded release zips hash to the pack's
 * source.assets (plan §6.6), name for name.
 */
export const checkAssets = (pack, zipsDir) => {
  const problems = [];
  for (const asset of pack.source?.assets ?? []) {
    const file = join(zipsDir, asset.name);
    if (!existsSync(file)) { problems.push(`--zips: ${asset.name} is not in ${zipsDir}`); continue; }
    const hash = sha256File(file); const bytes = statSync(file).size;
    if (hash !== asset.sha256 || bytes !== asset.bytes) problems.push(`--zips: ${asset.name} is ${hash} (${bytes} B), source.assets records ${asset.sha256} (${asset.bytes} B)`);
  }
  if (!(pack.source?.assets ?? []).length) problems.push('--zips: the pack records no source.assets');
  return problems;
};

/**
 * Checks one pack folder. Returns { problems, warnings, measured, pack }.
 * @param {string} dir
 * @param {{ allowed?: string[], provenance?: boolean, zips?: string | null }} [options]
 */
export const checkPackDir = (dir, { allowed = [], provenance = false, zips = null } = {}) => {
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
    if (zips) problems.push(...checkAssets(pack, zips));
  }
  return { problems, warnings, measured: budget.measured, pack };
};

const main = (argv) => {
  const args = { pack: null, provenance: false, zips: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--pack') args.pack = argv[++i];
    else if (argv[i] === '--provenance') args.provenance = true;
    else if (argv[i] === '--zips') args.zips = argv[++i];
    else { console.error(`unknown argument ${argv[i]}`); return 2; }
  }
  if (args.zips && !args.provenance) { console.error('--zips belongs with --provenance'); return 2; }
  const base = process.env.INIT_CWD || process.cwd();
  if (args.zips) args.zips = resolve(base, args.zips);
  let failed = false;
  let dirs;
  if (args.pack) dirs = [resolve(base, args.pack)];
  else {
    const catalogue = checkCommittedCatalogue();
    for (const p of catalogue) console.error(`  FAIL: ${p}`);
    if (catalogue.length) failed = true;
    const { problems, versions } = checkPublicEstate();

    for (const p of problems) console.error(`  FAIL: ${p}`);
    if (problems.length) failed = true;
    if (!versions.length) { console.log('estate:check: no committed pack under public/estate (nothing to check).'); return failed ? 1 : 0; }
    dirs = versions.length === 1 ? [join(REPO_ROOT, 'public', 'estate', versions[0])] : [];
  }
  for (const dir of dirs) {
    const allowed = existsSync(join(dir, 'catalogue.generated.ts')) && !isUnder(dir, join(REPO_ROOT, 'public')) ? ['catalogue.generated.ts', 'report.json'] : [];
    const { problems, warnings, measured } = checkPackDir(dir, { allowed, provenance: args.provenance, zips: args.zips });
    console.log(`estate:check ${relative(REPO_ROOT, dir).split(sep).join('/')}: ${measured.files} files, ${measured.total} B, first frame ${measured.stage0} B`);
    for (const [klass, bytes] of Object.entries(measured.byClass)) console.log(`  ${klass.padEnd(6)} ${String(bytes).padStart(9)} B`);
    for (const w of warnings) console.log(`  warning: ${w}`);
    for (const p of problems) console.error(`  FAIL: ${p}`);
    if (problems.length) failed = true;
  }
  return failed ? 1 : 0;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
