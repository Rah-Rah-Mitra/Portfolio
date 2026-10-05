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
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { sha256 } from './files.mjs';
import { generatorUnchanged, gitlink, tagCommit } from './provenance.mjs';
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

class Source {
  constructor(root, mode) { this.root = root; this.mode = mode; this.read_ = new Map(); }
  path(rel) { return join(this.root, ...rel.split('/')); }
  has(rel) { return existsSync(this.path(rel)); }
  read(rel) {
    if (NEVER.test(rel)) throw new Error(`the pack never opens ${rel}`);
    const bytes = readFileSync(this.path(rel));
    this.read_.set(rel, sha256(bytes));
    return bytes;
  }
  json(rel) { return JSON.parse(this.read(rel).toString('utf8')); }
}

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
  let extracted = 0;
  for (const { name } of assets) {
    const zip = openZip(join(zipsDir, name));
    try {
      for (const entry of zip.entries) {
        if (entry.name.endsWith('/') || !isPackInput(entry.name)) continue;
        if (NEVER.test(entry.name)) throw new Error(`isPackInput admitted ${entry.name}`);
        const data = zip.read(entry);
        const want = rm.entries?.[entry.name];
        if (want !== undefined && sha256(data) !== want) throw new Error(`zip entry ${entry.name} differs from release_manifest.json`);
        const out = join(root, ...entry.name.split('/'));
        if (relative(root, out).startsWith('..')) throw new Error(`zip entry ${entry.name} escapes the extraction folder`);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, data);
        extracted += 1;
      }
    } finally { zip.close(); }
  }
  return { source: new Source(root, 'release'), assets, releaseManifest: rm, extracted };
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
 * commit (gitlink), buildCommit }.
 */
export const checkExport = ({ source, repoRoot, release, releaseManifest, previousAssets, assets, edition, allowRot = false }) => {
  const manifestBytes = source.read('model/estate_manifest.json');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const manifestSha256 = sha256(manifestBytes);
  const problems = [];
  // Every GLB the pack reads must be the one the manifest names.
  const checkFile = (entry, where) => {
    if (!entry) return;
    const rel = `model/${entry.path}`;
    if (!source.has(rel)) return;
    const hash = sha256(readFileSync(source.path(rel)));
    if (hash !== entry.sha256) problems.push(`${where}: ${entry.path} sha256 ${hash} ≠ the manifest's ${entry.sha256}`);
  };
  for (const site of manifest.sites ?? []) {
    checkFile(site.files?.glb_lod1, `${site.id} lod1`);
    checkFile(site.files?.glb_lod2, `${site.id} lod2`);
    checkFile(site.files?.engine, `${site.id} engine`);
    for (const chunk of site.files?.glb_int ?? []) checkFile(chunk, `${site.id} ${chunk.storey}`);
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
  if (source.mode === 'release') {
    if (!exportInfo) problems.push('model/export_info.json is missing');
    else {
      if (exportInfo.dirty !== false) problems.push(`export_info.dirty is ${exportInfo.dirty}: the export was built from a modified tree`);
      if (exportInfo.manifest_sha256 !== manifestSha256) problems.push(`sha256(estate_manifest.json) ${manifestSha256} ≠ export_info.manifest_sha256 ${exportInfo.manifest_sha256}`);
      for (const id of SITE_IDS) {
        for (const kind of ['walk.bin', 'web.json']) {
          const key = `${id}/${id}_${kind}`;
          const want = exportInfo.files?.[key];
          if (!want) { problems.push(`export_info.files has no ${key}`); continue; }
          if (!source.has(`model/${key}`)) { problems.push(`${key} is not in the release`); continue; }
          const hash = sha256(readFileSync(source.path(`model/${key}`)));
          if (hash !== want.sha256) problems.push(`${key} sha256 ${hash} ≠ export_info's ${want.sha256}`);
        }
      }
      if (!/^[0-9a-f]{40}$/.test(buildCommit ?? '')) problems.push(`export_info.commit ${buildCommit} is not a commit id`);
    }
    if (!commit) problems.push('no Bonsai-Estate gitlink in the portfolio index (is this a git checkout?)');
    else {
      if (buildCommit && !generatorUnchanged(repoRoot, buildCommit, commit)) {
        problems.push(`the generator changed between export_info.commit ${buildCommit} and the gitlink ${commit}`);
      }
      if (releaseManifest?.commit && releaseManifest.commit !== commit) problems.push(`release_manifest.json commit ${releaseManifest.commit} ≠ the gitlink ${commit}`);
    }
    if (release) {
      const tagged = tagCommit(repoRoot, edition);
      if (tagged !== commit) problems.push(`--release: ${edition}^{commit} is ${tagged ?? 'unknown'}, the gitlink is ${commit}`);
      if (previousAssets) {
        const a = JSON.stringify(assets); const b = JSON.stringify(previousAssets);
        if (a !== b) problems.push('--release: the downloaded zips differ from the committed pack.json source.assets');
      }
    }
  }
  if (problems.length) throw new Error(`refusing to pack:\n  - ${problems.join('\n  - ')}`);
  return { manifest, manifestSha256, exportInfo, exportInfoSha256, commit, buildCommit };
};
