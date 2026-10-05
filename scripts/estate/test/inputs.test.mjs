// Inputs, gates and the command line (plan §6.1, §6.6).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import { describe, it } from 'node:test';
import { checkExport, isPackInput, openDevSource, openRelease } from '../lib/inputs.mjs';
import { openZip } from '../lib/zip.mjs';
import { parseArgs } from '../pack.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const sha = (b) => createHash('sha256').update(b).digest('hex');

// A deflate zip writer, just enough for the reader (no zip64, no extras).
const writeZip = (path, entries) => {
  const locals = []; const centrals = []; let offset = 0;
  for (const [name, data] of entries) {
    const n = Buffer.from(name); const comp = deflateRawSync(data); const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, comp); centrals.push(central, n);
    offset += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  writeFileSync(path, Buffer.concat([...locals, cd, end]));
};

describe('zip reader', () => {
  it('reads deflate entries and refuses a corrupt one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'estate-zip-'));
    try {
      const file = join(dir, 'a.zip');
      writeZip(file, [['model/estate_manifest.json', Buffer.from('{"a":1}')], ['model/x/x_lod0.glb', Buffer.from('lod0')]]);
      const zip = openZip(file);
      assert.deepEqual(zip.entries.map((e) => e.name), ['model/estate_manifest.json', 'model/x/x_lod0.glb']);
      assert.equal(zip.read(zip.entries[0]).toString(), '{"a":1}');
      zip.close();
      const bytes = readFileSync(file); bytes[30 + 'model/estate_manifest.json'.length + 1] ^= 0xff; writeFileSync(file, bytes);
      const bad = openZip(file);
      assert.throws(() => bad.read(bad.entries[0]));
      bad.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('what the pack opens (§6.1)', () => {
  it('reads the listed inputs and never nav, build, LOD0 (but SITE’s), IFC or .blend', () => {
    for (const ok of ['model/estate_manifest.json', 'model/export_info.json', 'model/SITE_lod0.glb', 'model/BLK_509/BLK_509_lod1.glb', 'model/BLK_509/BLK_509_int_L05.glb',
      'model/BLK_509/BLK_509_int_RF.glb', 'model/NC_514/NC_514_web.json', 'model/BLK_509/BLK_509_walk.bin', 'reports/renders/ESTATE/ESTATE_aerial_NE.png', 'reports/renders/ESTATE/ESTATE_views.json']) {
      assert.ok(isPackInput(ok), ok);
    }
    for (const no of ['model/BLK_509/BLK_509_nav.json', 'model/BLK_509/BLK_509.build.json', 'model/BLK_509/BLK_509_lod0.glb', 'model/BLK_509/BLK_509.ifc',
      'model/BLK_509/BLK_509.blend', 'model/SITE.ifc', 'model/BLK_509/BLK_509_lod1.glb.bak', 'model/BLK_509/BLK_510_lod1.glb']) {
      assert.ok(!isPackInput(no), no);
    }
  });
});

describe('release gates', () => {
  it('refuses a zip whose sha256 differs from release_manifest.json, and checks every extracted entry', () => {
    const dir = mkdtempSync(join(tmpdir(), 'estate-rel-'));
    try {
      const zips = join(dir, 'zips'); mkdirSync(zips);
      const manifest = Buffer.from('{"sites":[]}');
      writeZip(join(zips, 'SampleTownN5_v1.2_model.zip'), [['model/estate_manifest.json', manifest], ['model/BLK_509/BLK_509.ifc', Buffer.from('ifc')]]);
      const good = { sha256: sha(readFileSync(join(zips, 'SampleTownN5_v1.2_model.zip'))), bytes: readFileSync(join(zips, 'SampleTownN5_v1.2_model.zip')).length };
      const rm = (zipsRecord, entries) => writeFileSync(join(zips, 'release_manifest.json'), JSON.stringify({ tag: 'v1.2', commit: 'a'.repeat(40), zips: zipsRecord, entries }));

      rm({ 'SampleTownN5_v1.2_model.zip': { ...good, sha256: 'b'.repeat(64) } }, {});
      assert.throws(() => openRelease({ zipsDir: zips, extractRoot: join(dir, 'src'), edition: 'v1.2' }), /differs from release_manifest\.json/);

      rm({ 'SampleTownN5_v1.2_model.zip': good }, { 'model/estate_manifest.json': 'c'.repeat(64) });
      assert.throws(() => openRelease({ zipsDir: zips, extractRoot: join(dir, 'src'), edition: 'v1.2' }), /entry model\/estate_manifest\.json differs/);

      rm({ 'SampleTownN5_v1.2_model.zip': good }, { 'model/estate_manifest.json': sha(manifest) });
      const opened = openRelease({ zipsDir: zips, extractRoot: join(dir, 'src'), edition: 'v1.2' });
      assert.equal(opened.extracted, 1); // the IFC is never extracted
      assert.equal(opened.source.mode, 'release');
      assert.throws(() => opened.source.read('model/BLK_509/BLK_509.ifc'), /never opens/);

      // No export_info, no gitlink here: the gates refuse and say why.
      assert.throws(() => checkExport({ source: opened.source, repoRoot: dir, release: false, releaseManifest: null, assets: opened.assets, edition: 'v1.2' }),
        /export_info\.json is missing[\s\S]*no Bonsai-Estate gitlink/);

      rm({ 'SampleTownN5_v1.1_model.zip': good }, {});
      assert.throws(() => openRelease({ zipsDir: zips, extractRoot: join(dir, 'src'), edition: 'v1.1-not-this' }), /is for v1\.2/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('a dev source skips the provenance gates but still checks the manifest hashes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'estate-dev-'));
    try {
      mkdirSync(join(dir, 'model', 'BLK_509'), { recursive: true });
      writeFileSync(join(dir, 'model', 'BLK_509', 'BLK_509_lod1.glb'), 'not the manifest one');
      writeFileSync(join(dir, 'model', 'estate_manifest.json'), JSON.stringify({ sites: [{ id: 'BLK_509', rot: 0, files: { glb_lod1: { path: 'BLK_509/BLK_509_lod1.glb', sha256: 'd'.repeat(64) } } }] }));
      const opened = openDevSource(dir);
      assert.equal(opened.assets[0].name, 'dev-src.unverified');
      assert.throws(() => checkExport({ source: opened.source, repoRoot: dir, release: false, releaseManifest: null, assets: opened.assets, edition: 'v1.2' }), /BLK_509 lod1/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('command line', () => {
  it('needs exactly one source, refuses --release on a dev pack, and keeps ground with s0', () => {
    assert.throws(() => parseArgs([]), /exactly one of --zips and --dev-src/);
    assert.throws(() => parseArgs(['--zips', 'a', '--dev-src', 'b', '--out', 'x']), /exactly one/);
    assert.throws(() => parseArgs(['--dev-src', 'b', '--release']), /--release cannot be used with --dev-src/);
    assert.throws(() => parseArgs(['--zips', 'a']), /--out is required/);
    assert.throws(() => parseArgs(['--dev-src', 'b', '--classes', 'ground']), /add s0/);
    assert.throws(() => parseArgs(['--dev-src', 'b', '--classes', 'mesh']), /unknown class mesh/);
    assert.deepEqual(parseArgs(['--dev-src', 'b', '--classes', 'nav,poster']).classes, ['poster', 'nav']);
  });

  it('refuses to write a dev pack under public/', () => {
    const r = spawnSync(process.execPath, [join(HERE, '..', 'pack.mjs'), '--dev-src', 'nowhere', '--out', join(HERE, '..', '..', '..', 'public', 'estate', 'v1.2')], { encoding: 'utf8', env: { ...process.env, INIT_CWD: '' } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /may not be written under public/);
  });
});
