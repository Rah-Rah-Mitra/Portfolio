// Pack inputs and their gates (plan §6.1). Two modes:
//
//  - release (the real one): --zips <dir> holding the two release zips and
//    release_manifest.json. Every zip's sha256 must match the manifest; the
//    entries the pack reads are extracted to artifacts/estate/src/<tag>/ and
//    each checked against the manifest's per-entry sha256; then the export's own
//    hashes and the provenance gates run.
//  - dev (--dev-src <dir>): an already-extracted export, for validating the
//    pipeline before a release exists (P2 runs it over a v1.1 snapshot). No
//    provenance gate runs, the pack is stamped `source.dev: true`, and pack.mjs
//    refuses --release and any output under public/. Missing inputs (walk,
//    web, views) make their classes or features fall back with a warning.
//
// The pack never opens *_nav.json, *.build.json, *_lod0.glb (but SITE's), IFC
// or .blend: they are neither extracted nor read.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { sha256 } from './files.mjs';
import { COMMIT_ID, generatorUnchanged, gitlink, isAncestor, tagCommit } from './provenance.mjs';
import { openZip } from './zip.mjs';

export const SITE_IDS = ['BLK_501', 'BLK_502', 'BLK_503', 'BLK_504', 'BLK_505', 'BLK_506', 'BLK_507', 'BLK_508', 'BLK_509', 'BLK_510', 'BLK_511', 'BLK_512', 'MSCP_513', 'NC_514'];

const sha256File = (path) => {
  const h = createHash('sha256');
  h.update(readFileSync(path));
  return h.digest('hex');
};

// Entries the pack reads (and so extracts), as zip-relative paths.
export const isPackInput = (name) => (
  /^model\/(estate_manifest|export_info|masterplan)\.json$/.test(name)
  || /^model\/SITE_lod0\.glb$/.test(name)
  || /^model\/(BLK_\d+|MSCP_\d+|NC_\d+)\/\1_(lod1\.glb|lod2\.glb|int_(L\d+|RF)\.glb|engine\.json|walk\.bin|web\.json)$/.test(name)
  || /^reports\/renders\/ESTATE\/ESTATE_(aerial_NE\.png|views\.json)$/.test(name)
);

// Never opened (plan §6.1): checked so a loosened isPackInput cannot let them in.
const NEVER = /(_nav\.json|\.build\.json|\.ifc|\.blend)$|^model\/(?!SITE_)[^/]+\/[^/]+_lod0\.glb$/;

// Inputs whose hash no export record anchors: the two records themselves, and
// the two report entries (anchored only by release_manifest.json's per-entry
// sha256, which openRelease checks).
const SELF_ANCHORED = new Set([
  'model/estate_manifest.json', 'model/export_info.json',
  'reports/renders/ESTATE/ESTATE_views.json', 'reports/renders/ESTATE/ESTATE_aerial_NE.png',
]);

class Source {
  /** `entries`: the zip paths this run extracted (release); null reads whatever is on disk (dev). */
  constructor(root, mode, entries = null) { this.root = root; this.mode = mode; this.entries = entries; this.read_ = new Map(); }
  path(rel) { return join(this.root, ...rel.split('/')); }
  has(rel) { return (this.entries === null || this.entries.has(rel)) && existsSync(this.path(rel)); }
  read(rel) {
    if (NEVER.test(rel)) throw new Error(`the pack never opens ${rel}`);
    if (this.entries !== null && !this.entries.has(rel)) throw new Error(`${rel} is not an entry of this release`);
    const bytes = readFileSync(this.path(rel));
    this.read_.set(rel, sha256(bytes));
    return bytes;
  }
  json(rel) { return JSON.parse(this.read(rel).toString('utf8')); }
}

/**
 * Every input the build read, against the hashes the export records anchored
 * (`anchored`: Map rel → sha256 from estate_manifest.json files.* and
 * export_info.json files). Returns the reads no record vouches for.
 */
export const unanchoredReads = (source, anchored) => {
  const out = [];
  for (const [rel, hash] of source.read_) {
    if (SELF_ANCHORED.has(rel)) continue;
    const want = anchored.get(rel);
    if (want === undefined) out.push(`${rel}: no estate_manifest.json or export_info.json record hashes it`);
    else if (want !== hash) out.push(`${rel}: read as ${hash}, recorded as ${want}`);
  }
  return out;
};

/**
 * Opens a release: verifies the zips, extracts the pack's inputs to
 * `extractRoot/<tag>`, and returns a Source plus what pack.json's `source`
 * records. Throws on any gate.
 */
export const openRelease = ({ zipsDir, extractRoot, edition }) => {
  const rmPath = join(zipsDir, 'release_manifest.json');
  if (!existsSync(rmPath)) throw new Error(`${zipsDir} has no release_manifest.json`);
  const rm = JSON.parse(readFileSync(rmPath, 'utf8'));
  if (rm.tag !== edition) throw new Error(`release_manifest.json is for ${rm.tag}; this pack is ${edition}`);
  if (!rm.zips || !Object.keys(rm.zips).length) throw new Error('release_manifest.json lists no zips');
  const assets = [];
  for (const name of Object.keys(rm.zips).sort()) {
    const file = join(zipsDir, name);
    if (!existsSync(file)) throw new Error(`release zip ${name} is missing from ${zipsDir}`);
    const hash = sha256File(file);
    const bytes = statSync(file).size;
    if (hash !== rm.zips[name].sha256 || bytes !== rm.zips[name].bytes) {
      throw new Error(`release zip ${name}: sha256 ${hash} (${bytes} B) differs from release_manifest.json's ${rm.zips[name].sha256} (${rm.zips[name].bytes} B)`);
    }
    assets.push({ name, sha256: hash, bytes });
  }
  const root = resolve(extractRoot, edition);
  if (relative(resolve(extractRoot), root).startsWith('..') || resolve(extractRoot) === root) throw new Error(`extraction folder ${root} is not inside ${extractRoot}`);
  // A fresh folder every run: a file left by an earlier release must never be
  // packed under this release's hashes.
  rmSync(root, { recursive: true, force: true });
  if (!rm.entries || typeof rm.entries !== 'object') throw new Error('release_manifest.json has no per-entry sha256 (entries)');
  const names = new Set();
  let extracted = 0;
  for (const { name } of assets) {
    const zip = openZip(join(zipsDir, name));
    try {
      for (const entry of zip.entries) {
        if (entry.name.endsWith('/') || !isPackInput(entry.name)) continue;
        if (NEVER.test(entry.name)) throw new Error(`isPackInput admitted ${entry.name}`);
        const data = zip.read(entry);
        const want = rm.entries[entry.name];
        if (want === undefined) throw new Error(`zip entry ${entry.name} has no sha256 in release_manifest.json`);
        if (sha256(data) !== want) throw new Error(`zip entry ${entry.name} differs from release_manifest.json`);
        if (names.has(entry.name)) throw new Error(`zip entry ${entry.name} appears twice in the release`);
        names.add(entry.name);
        const out = join(root, ...entry.name.split('/'));
        if (relative(root, out).startsWith('..')) throw new Error(`zip entry ${entry.name} escapes the extraction folder`);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, data);
        extracted += 1;
      }
    } finally { zip.close(); }
  }
  return { source: new Source(root, 'release', names), assets, releaseManifest: rm, extracted };
};

/** Opens an extracted export for a dev run. The asset record hashes the file list, so two dev packs say whether they saw the same inputs. */
export const openDevSource = (dir) => {
  const root = resolve(dir);
  if (!existsSync(join(root, 'model', 'estate_manifest.json'))) throw new Error(`${dir} has no model/estate_manifest.json`);
  const listing = [];
  let bytes = 0;
  const walk = (rel) => {
    for (const entry of readdirSync(join(root, ...rel.split('/').filter(Boolean)), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(r);
      else if (isPackInput(r)) { const p = join(root, ...r.split('/')); listing.push(`${r}\t${sha256File(p)}`); bytes += statSync(p).size; }
    }
  };
  walk('');
  const hash = createHash('sha256').update(listing.join('\n')).digest('hex');
  return { source: new Source(root, 'dev'), assets: [{ name: 'dev-src.unverified', sha256: hash, bytes }], releaseManifest: null, inputs: listing.length };
};

/**
 * The export's own hashes (both modes) and, in release mode, the provenance
 * gates. Returns { manifest, manifestSha256, exportInfo, exportInfoSha256,
 * commit (gitlink), buildCommit, anchored }. `anchored` maps every input path a
 * record hashes to that hash, for unanchoredReads() after the build.
 *
 * The commit chain (plan §2, R2a): upstream builds on M (export_info.commit),
 * commits the regenerated reports as R and releases; release_manifest.json
 * repeats export_info.commit, so the two upstream records must agree. The
 * portfolio's gitlink G is R: G must descend from M and the generator must be
 * unchanged between them. `expectedAssets` (--release) is the candidate pack's
 * source.assets the downloaded zips must equal.
 */
export const checkExport = ({ source, repoRoot, release, releaseManifest, expectedAssets = null, assets, edition, allowRot = false }) => {
  const strict = source.mode === 'release';
  const manifestBytes = source.read('model/estate_manifest.json');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const manifestSha256 = sha256(manifestBytes);
  const problems = [];
  const anchored = new Map();
  // Every GLB and engine JSON the pack reads must be the one the manifest
  // names; in a release a missing record is a refusal, not a skipped check.
  const checkFile = (entry, where) => {
    if (!entry || typeof entry.path !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')) {
      if (strict) problems.push(`${where}: estate_manifest.json records no path and sha256`);
      return;
    }
    const rel = `model/${entry.path}`;
    anchored.set(rel, entry.sha256);
    if (!source.has(rel)) return; // not read, or reading it fails later
    const hash = sha256(readFileSync(source.path(rel)));
    if (hash !== entry.sha256) problems.push(`${where}: ${entry.path} sha256 ${hash} ≠ the manifest's ${entry.sha256}`);
  };
  for (const site of manifest.sites ?? []) {
    checkFile(site.files?.glb_lod1, `${site.id} lod1`);
    checkFile(site.files?.glb_lod2, `${site.id} lod2`);
    checkFile(site.files?.engine, `${site.id} engine`);
    const chunks = site.files?.glb_int ?? [];
    if (strict && !chunks.length) problems.push(`${site.id}: estate_manifest.json lists no interior chunks`);
    for (const chunk of chunks) checkFile(chunk, `${site.id} ${chunk.storey}`);
    if (site.rot && !allowRot) problems.push(`${site.id} is rotated (rot ${site.rot}); the pack refuses rotated sites without --allow-rot`);
  }
  checkFile(manifest.site?.files?.glb_lod0, 'SITE lod0');

  const commit = gitlink(repoRoot);
  let exportInfo = null; let exportInfoSha256 = null; let buildCommit = null;
  if (source.has('model/export_info.json')) {
    const bytes = source.read('model/export_info.json');
    exportInfo = JSON.parse(bytes.toString('utf8'));
    exportInfoSha256 = sha256(bytes);
    buildCommit = exportInfo.commit;
  }
  if (strict) {
    if (!exportInfo) problems.push('model/export_info.json is missing');
    else {
      if (exportInfo.dirty !== false) problems.push(`export_info.dirty is ${exportInfo.dirty}: the export was built from a modified tree`);
      if (exportInfo.manifest_sha256 !== manifestSha256) problems.push(`sha256(estate_manifest.json) ${manifestSha256} ≠ export_info.manifest_sha256 ${exportInfo.manifest_sha256}`);
      for (const id of SITE_IDS) {
        for (const kind of ['walk.bin', 'web.json']) {
          const key = `${id}/${id}_${kind}`;
          const want = exportInfo.files?.[key];
          if (!want || !/^[0-9a-f]{64}$/.test(want.sha256 ?? '')) { problems.push(`export_info.files has no sha256 for ${key}`); continue; }
          anchored.set(`model/${key}`, want.sha256);
          if (!source.has(`model/${key}`)) { problems.push(`${key} is not in the release`); continue; }
          const data = readFileSync(source.path(`model/${key}`));
          const hash = sha256(data);
          if (hash !== want.sha256 || (want.bytes !== undefined && data.length !== want.bytes)) problems.push(`${key} sha256 ${hash} (${data.length} B) ≠ export_info's ${want.sha256} (${want.bytes} B)`);
        }
      }
      if (!COMMIT_ID.test(buildCommit ?? '')) problems.push(`export_info.commit ${JSON.stringify(buildCommit)} is not a 40-hex commit id`);
    }
    const releaseCommit = releaseManifest?.commit;
    if (!COMMIT_ID.test(releaseCommit ?? '')) problems.push(`release_manifest.json commit ${JSON.stringify(releaseCommit)} is not a 40-hex commit id`);
    else if (COMMIT_ID.test(buildCommit ?? '') && releaseCommit !== buildCommit) {
      problems.push(`release_manifest.json commit ${releaseCommit} ≠ export_info.commit ${buildCommit}: the two upstream records disagree`);
    }
    if (!commit) problems.push('no Bonsai-Estate gitlink in the portfolio index (is this a git checkout?)');
    else if (COMMIT_ID.test(buildCommit ?? '')) {
      // Only validated ids reach git (provenance.mjs checks again).
      const gate = (fn) => { try { fn(); } catch (e) { problems.push(e.message); } };
      gate(() => { if (!isAncestor(repoRoot, buildCommit, commit)) problems.push(`the gitlink ${commit} does not descend from export_info.commit ${buildCommit}`); });
      gate(() => { if (!generatorUnchanged(repoRoot, buildCommit, commit)) problems.push(`the generator changed between export_info.commit ${buildCommit} and the gitlink ${commit}`); });
    }
    if (release) {
      const tagged = commit ? tagCommit(repoRoot, edition) : null;
      if (tagged !== commit) problems.push(`--release: ${edition}^{commit} is ${tagged ?? 'unknown'}, the gitlink is ${commit}`);
      if (!expectedAssets) problems.push('--release: no candidate assets to compare the zips with (pass --expect-assets <candidate pack.json>, or replace a pack already in --out)');
      else {
        const canon = (list) => JSON.stringify([...list].map(({ name, sha256: h, bytes }) => ({ name, sha256: h, bytes })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)));
        if (canon(assets) !== canon(expectedAssets)) problems.push(`--release: the zips differ from the candidate's source.assets:\n      got  ${canon(assets)}\n      want ${canon(expectedAssets)}`);
      }
    }
  }
  if (problems.length) throw new Error(`refusing to pack:\n  - ${problems.join('\n  - ')}`);
  return { manifest, manifestSha256, exportInfo, exportInfoSha256, commit, buildCommit, anchored };
};
