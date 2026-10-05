// The §6.1 release gates against a real (temporary) git history, modelled on
// plan R2a: upstream builds on M, commits the regenerated reports as R, tags
// v1.2 on R, and the portfolio's gitlink is R. Synthetic zips; nothing here
// reads the real export or the real submodule.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { SITE_IDS, checkExport, openRelease, unanchoredReads } from '../lib/inputs.mjs';
import { SUBMODULE } from '../lib/provenance.mjs';
import { writeZip } from './zipfixture.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

let root; let up; let M; let R; let C;
const MODEL = 'SampleTownN5_v1.2_model.zip';
const REPORTS = 'SampleTownN5_v1.2_reports.zip';

before(() => {
  root = mkdtempSync(join(tmpdir(), 'estate-gates-'));
  git(root, 'init', '-q');
  up = join(root, ...SUBMODULE.split('/'));
  mkdirSync(join(up, 'estate'), { recursive: true }); mkdirSync(join(up, 'reports'));
  git(up, 'init', '-q'); git(up, 'config', 'user.email', 'test@example.invalid'); git(up, 'config', 'user.name', 'test'); git(up, 'config', 'commit.gpgsign', 'false'); git(up, 'config', 'tag.gpgsign', 'false');
  writeFileSync(join(up, 'estate', 'gen.py'), 'v1\n'); git(up, 'add', '.'); git(up, 'commit', '-qm', 'M'); M = git(up, 'rev-parse', 'HEAD');
  writeFileSync(join(up, 'reports', 'r.json'), '{}\n'); git(up, 'add', '.'); git(up, 'commit', '-qm', 'R'); R = git(up, 'rev-parse', 'HEAD');
  git(up, 'tag', '-a', 'v1.2', '-m', 'v1.2', R);
  writeFileSync(join(up, 'estate', 'gen.py'), 'v2\n'); git(up, 'add', '.'); git(up, 'commit', '-qm', 'C'); C = git(up, 'rev-parse', 'HEAD');
  git(root, 'update-index', '--add', '--cacheinfo', `160000,${R},${SUBMODULE}`);
});
after(() => rmSync(root, { recursive: true, force: true }));

const lod0 = Buffer.from('site lod0');
const files = Object.fromEntries(SITE_IDS.flatMap((id) => [[`${id}/${id}_walk.bin`, Buffer.from(`walk ${id}`)], [`${id}/${id}_web.json`, Buffer.from('{"doors":[]}')]]));
const views = Buffer.from(JSON.stringify({ schema: 'sample-town-n5/render-views/1', views: {} }));

/** A release folder; `edit` may change the manifest, export_info or release_manifest before they are written. */
const release = (name, { info = {}, manifest = {}, rm = {}, withViews = true, dropEntry = null } = {}) => {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  const man = Buffer.from(JSON.stringify({ sites: [], site: { files: { glb_lod0: { path: 'SITE_lod0.glb', sha256: sha(lod0) } } }, ...manifest }));
  const exportInfo = { commit: M, dirty: false, manifest_sha256: sha(man), files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, { sha256: sha(v), bytes: v.length }])), ...info };
  const model = [['model/estate_manifest.json', man], ['model/export_info.json', Buffer.from(JSON.stringify(exportInfo))], ['model/SITE_lod0.glb', lod0], ...Object.entries(files).map(([k, v]) => [`model/${k}`, v])];
  const reports = withViews ? [['reports/renders/ESTATE/ESTATE_views.json', views]] : [['reports/renders/ESTATE/other.json', Buffer.from('{}')]];
  writeZip(join(dir, MODEL), model); writeZip(join(dir, REPORTS), reports);
  const zips = Object.fromEntries([MODEL, REPORTS].map((n) => { const b = readFileSync(join(dir, n)); return [n, { sha256: sha(b), bytes: b.length }]; }));
  const entries = Object.fromEntries([...model, ...reports].map(([k, v]) => [k, sha(v)]));
  if (dropEntry) delete entries[dropEntry];
  writeFileSync(join(dir, 'release_manifest.json'), JSON.stringify({ tag: 'v1.2', commit: M, zips, entries, ...rm }));
  return dir;
};

const open = (dir) => openRelease({ zipsDir: dir, extractRoot: join(root, 'artifacts', 'estate', 'src'), edition: 'v1.2' });
const gate = (dir, extra = {}) => {
  const o = open(dir);
  return { o, r: checkExport({ source: o.source, repoRoot: root, release: false, releaseManifest: o.releaseManifest, assets: o.assets, edition: 'v1.2', ...extra }) };
};

describe('release gates (§6.1) on an R2a history', () => {
  it('passes plan R2a: built on M, released with M, gitlink and tag v1.2 on R, generator unchanged', () => {
    const dir = release('r2a');
    const o = open(dir);
    const r = checkExport({ source: o.source, repoRoot: root, release: true, releaseManifest: o.releaseManifest, expectedAssets: o.assets, assets: o.assets, edition: 'v1.2' });
    assert.equal(r.commit, R);
    assert.equal(r.buildCommit, M);
    assert.equal(r.anchored.get('model/BLK_509/BLK_509_walk.bin'), sha(files['BLK_509/BLK_509_walk.bin']));
  });

  it('refuses a release_manifest.json whose commit is missing or disagrees with export_info.commit', () => {
    assert.throws(() => gate(release('rm-none', { rm: { commit: undefined } })), /release_manifest\.json commit undefined is not a 40-hex/);
    assert.throws(() => gate(release('rm-r', { rm: { commit: R } })), /≠ export_info\.commit .*the two upstream records disagree/);
  });

  it('refuses a dirty export, a stale manifest and a walk grid export_info does not vouch for', () => {
    assert.throws(() => gate(release('dirty', { info: { dirty: true } })), /export_info\.dirty is true/);
    assert.throws(() => gate(release('man', { info: { manifest_sha256: 'f'.repeat(64) } })), /≠ export_info\.manifest_sha256/);
    const bad = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, { sha256: sha(v), bytes: v.length }]));
    bad['BLK_509/BLK_509_walk.bin'] = { sha256: '0'.repeat(64), bytes: 1 };
    assert.throws(() => gate(release('walk', { info: { files: bad } })), /BLK_509\/BLK_509_walk\.bin sha256 .*≠ export_info's/);
  });

  it('refuses an export whose generator changed before the gitlink, or that the gitlink does not descend from', () => {
    assert.throws(() => gate(release('at-c', { info: { commit: C }, rm: { commit: C } })), /does not descend from export_info\.commit[\s\S]*the generator changed/);
  });

  it('never hands git a crafted commit: "--output=<file>" is refused and the file survives', () => {
    const victim = join(root, 'victim.txt');
    writeFileSync(victim, 'precious bytes');
    const crafted = `--output=${victim.replace(/\\/g, '/')}`;
    assert.throws(() => gate(release('inject', { info: { commit: crafted }, rm: { commit: crafted } })), /is not a 40-hex commit id/);
    assert.equal(readFileSync(victim, 'utf8'), 'precious bytes');
  });

  it('--release: the tag must be the gitlink, and the zips must equal the candidate\'s assets', () => {
    const dir = release('rel');
    const o = open(dir);
    const run = (expectedAssets) => checkExport({ source: o.source, repoRoot: root, release: true, releaseManifest: o.releaseManifest, expectedAssets, assets: o.assets, edition: 'v1.2' });
    assert.throws(() => run(null), /no candidate assets/);
    assert.throws(() => run([{ ...o.assets[0], sha256: 'e'.repeat(64) }, o.assets[1]]), /the zips differ from the candidate's source\.assets/);
    git(up, 'tag', '-f', '-a', 'v1.2', '-m', 'moved', C);
    try { assert.throws(() => run(o.assets), /v1\.2\^\{commit\} is [0-9a-f]{40}, the gitlink is/); } finally { git(up, 'tag', '-f', '-a', 'v1.2', '-m', 'v1.2', R); }
  });

  it('refuses a rotated site unless --allow-rot', () => {
    const rec = (p) => ({ path: p, sha256: 'a'.repeat(64) });
    const site = { id: 'BLK_509', rot: 90, files: { glb_lod1: rec('BLK_509/BLK_509_lod1.glb'), glb_lod2: rec('BLK_509/BLK_509_lod2.glb'), engine: rec('BLK_509/BLK_509_engine.json'), glb_int: [{ storey: 'L1', ...rec('BLK_509/BLK_509_int_L01.glb') }] } };
    const dir = release('rot', { manifest: { sites: [site] } });
    assert.throws(() => gate(dir), /BLK_509 is rotated/);
    assert.doesNotThrow(() => gate(dir, { allowRot: true }));
  });

  it('fails closed on a missing manifest record', () => {
    const site = { id: 'BLK_509', rot: 0, files: {} };
    assert.throws(() => gate(release('norec', { manifest: { sites: [site] } })), /BLK_509 lod1: estate_manifest\.json records no path and sha256[\s\S]*lists no interior chunks/);
  });
});

describe('extraction (§6.1)', () => {
  it('starts from an empty folder, so a file from an earlier release is never read', () => {
    const a = open(release('with-views'));
    assert.ok(a.source.has('reports/renders/ESTATE/ESTATE_views.json'));
    const b = open(release('without-views', { withViews: false }));
    assert.equal(b.source.has('reports/renders/ESTATE/ESTATE_views.json'), false);
    assert.throws(() => b.source.read('reports/renders/ESTATE/ESTATE_views.json'), /not an entry of this release/);
    assert.equal(existsSync(join(root, 'artifacts', 'estate', 'src', 'v1.2', 'reports', 'renders', 'ESTATE', 'ESTATE_views.json')), false);
  });

  it('refuses an entry release_manifest.json gives no sha256', () => {
    assert.throws(() => open(release('noentry', { dropEntry: 'model/SITE_lod0.glb' })), /zip entry model\/SITE_lod0\.glb has no sha256/);
  });

  it('names every read no export record hashes', () => {
    const { o, r } = gate(release('reads'));
    o.source.read('model/SITE_lod0.glb');
    o.source.read('model/BLK_509/BLK_509_walk.bin');
    o.source.read('reports/renders/ESTATE/ESTATE_views.json');
    assert.deepEqual(unanchoredReads(o.source, r.anchored), []);
    r.anchored.delete('model/SITE_lod0.glb');
    assert.match(unanchoredReads(o.source, r.anchored)[0], /SITE_lod0\.glb: no estate_manifest\.json or export_info\.json record hashes it/);
  });
});
