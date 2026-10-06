// The command around the build (plan §6.1, §6.6): where it may write, what a
// failed run may delete, --verify's comparison, the views record, the checker's
// gzip and public/estate rules, the installed toolchain.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { after, describe, it } from 'node:test';
import { REPO_ROOT, checkAssets, checkPublicEstate, gzipHeaderProblem, leakScanDir, listFiles, verifyFiles } from '../check.mjs';
import { gzipDeterministic, writeHashed } from '../lib/files.mjs';
import { Soup } from '../lib/pure/soup.mjs';
import { orientGround } from '../lib/site.mjs';
import { comparePackDirs, parseArgs, prepareOut, publicRootOf, readAerialView, toolProblems, writeTargetProblem } from '../pack.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK = join(HERE, '..', 'pack.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'estate-pack-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

/** A small pack folder: one gz file and one plain file, and its pack.json. */
const miniPack = (dir, payload = 'glTF payload') => {
  mkdirSync(dir, { recursive: true });
  const f = writeHashed(dir, 'f/BLK_509', 'glb.gz', Buffer.from(payload.repeat(50)), { gzip: true });
  const p = writeHashed(dir, 'poster/aerial-800', 'jpg', Buffer.from('jpeg bytes'), { gzip: false });
  const pack = { posters: [p], sites: [{ id: 'BLK_509', storeys: [], facade: { ...f, tris: 1, verts: 3, prims: 1, draws: 1, maxPrimVerts: 3 } }] };
  writeFileSync(join(dir, 'pack.0000beef.json'), JSON.stringify(pack));
  return { pack, f };
};

// A web project of its own, so nothing here touches this checkout's public/.
const proj = join(tmp, 'proj');
mkdirSync(join(proj, 'public', 'estate', 'v1.2'), { recursive: true });
writeFileSync(join(proj, 'package.json'), '{}');
writeFileSync(join(proj, 'public', 'estate', 'v1.2', 'keep.txt'), 'untracked and precious');
writeFileSync(join(proj, 'public', 'photo.txt'), 'untracked and precious');

describe('where a run may write', () => {
  it('finds any web project\'s public/ folder, not only this checkout\'s', () => {
    assert.equal(publicRootOf(join(proj, 'public', 'estate', 'v1.2', 'x')), join(proj, 'public'));
    assert.equal(publicRootOf(join(REPO_ROOT, 'public', 'estate', 'v1.2')), join(REPO_ROOT, 'public'));
    assert.equal(publicRootOf(join(tmp, 'elsewhere', 'public-ish')), null);
  });

  it('refuses a dev pack under any public/, a release pack anywhere under public/ but public/estate/<edition>, and that only with --release', () => {
    const base = { classes: ['poster'], release: false, verify: false, catalogue: null };
    assert.match(writeTargetProblem({ ...base, devSrc: 'x', out: join(proj, 'public', 'estate', 'v1.2') }), /--dev-src pack may not be written under public/);
    assert.equal(writeTargetProblem({ ...base, devSrc: 'x', out: join(tmp, 'dev') }), null);
    assert.match(writeTargetProblem({ ...base, zips: 'z', out: join(proj, 'public', 'estate', 'v1.2'), release: true }), /goes to public\/estate\/v1\.2 and nowhere else/);
    assert.match(writeTargetProblem({ ...base, zips: 'z', out: join(REPO_ROOT, 'public') , release: true }), /nowhere else/);
    assert.match(writeTargetProblem({ ...base, zips: 'z', out: join(REPO_ROOT, 'public', 'estate', 'v1.2') }), /needs --release/);
    assert.equal(writeTargetProblem({ ...base, zips: 'z', out: join(REPO_ROOT, 'public', 'estate', 'v1.2'), release: true }), null);
    assert.equal(writeTargetProblem({ ...base, zips: 'z', out: join(REPO_ROOT, 'public', 'estate', 'v1.2'), verify: true }), null);
    assert.match(writeTargetProblem({ ...base, zips: 'z', out: join(tmp, 'cand'), catalogue: join(proj, 'public', 'c.ts') }), /--catalogue may not point under public/);
    assert.match(writeTargetProblem({ ...base, zips: 'z', out: join(tmp, 'cand'), catalogue: join(REPO_ROOT, 'lib', 'estate', 'catalogue.generated.ts') }), /belongs to the committed pack/);
  });

  it('refuses --catalogue on a dev pack and --expect-assets without --release', () => {
    assert.throws(() => parseArgs(['--dev-src', 'b', '--catalogue', 'lib/estate/catalogue.generated.ts']), /--catalogue cannot be used with --dev-src/);
    assert.throws(() => parseArgs(['--zips', 'a', '--out', 'x', '--expect-assets', 'p.json']), /--expect-assets only means something with --release/);
  });

  it('a failed run deletes nothing it did not take over', () => {
    const env = { ...process.env, INIT_CWD: '' };
    const run = (...args) => spawnSync(process.execPath, [PACK, ...args], { encoding: 'utf8', env });
    // Under someone else's public/: refused before anything is opened.
    let r = run('--zips', join(tmp, 'nowhere'), '--out', join(proj, 'public', 'estate', 'v1.2'), '--release');
    assert.equal(r.status, 2, r.stderr);
    r = run('--zips', join(tmp, 'nowhere'), '--out', join(proj, 'public'), '--release');
    assert.equal(r.status, 2, r.stderr);
    // This checkout's own pack folder: the run fails on the missing zips, before it takes the folder over.
    const pub = join(REPO_ROOT, 'public', 'estate', 'v1.2');
    const before = existsSync(pub) ? listFiles(pub) : null;
    r = run('--zips', join(tmp, 'nowhere'), '--out', pub, '--release');
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /has no release_manifest\.json/);
    assert.doesNotMatch(r.stderr, /was emptied/);
    assert.deepEqual(existsSync(pub) ? listFiles(pub) : null, before);
    // A non-pack folder outside public/: never emptied either.
    const odd = join(tmp, 'odd'); mkdirSync(odd); writeFileSync(join(odd, 'notes.txt'), 'mine');
    r = run('--zips', join(tmp, 'nowhere'), '--out', odd);
    assert.equal(r.status, 1);
    assert.equal(readFileSync(join(odd, 'notes.txt'), 'utf8'), 'mine');
    assert.equal(readFileSync(join(proj, 'public', 'estate', 'v1.2', 'keep.txt'), 'utf8'), 'untracked and precious');
    assert.equal(readFileSync(join(proj, 'public', 'photo.txt'), 'utf8'), 'untracked and precious');
  });

  it('empties a pack folder it takes over, and refuses one holding a file its pack.json does not list', () => {
    const dir = join(tmp, 'prev');
    miniPack(dir);
    writeFileSync(join(dir, 'report.json'), '{}');
    prepareOut(dir);
    assert.deepEqual(listFiles(dir), []);
    miniPack(dir);
    writeFileSync(join(dir, 'f', 'stray.bin'), 'x');
    assert.throws(() => prepareOut(dir), /holds files its pack\.json does not list \(f\/stray\.bin\)/);
    const odd = join(tmp, 'odd2'); mkdirSync(odd); writeFileSync(join(odd, 'a.txt'), 'a');
    assert.throws(() => prepareOut(odd), /is not a pack folder/);
  });
});

describe('--verify (§6.6)', () => {
  it('passes an identical rebuild and fails a changed payload or a re-gzipped file', () => {
    const a = join(tmp, 'va'); const b = join(tmp, 'vb');
    miniPack(a); miniPack(b);
    assert.deepEqual(comparePackDirs(a, b), []);
    const c = join(tmp, 'vc'); miniPack(c, 'other payload');
    assert.match(comparePackDirs(a, c).join('\n'), /file lists differ/);
    // Same payload, gzipped at level 1 with another mtime and OS byte: the
    // stored file no longer matches its own pack.json, and --verify says so.
    const d = join(tmp, 'vd'); const { pack, f } = miniPack(d);
    const raw = gzipSync(Buffer.from('glTF payload'.repeat(50)), { level: 1 });
    raw.writeUInt32LE(1700000000, 4); raw[9] = 3;
    writeFileSync(join(d, ...f.path.split('/')), raw);
    assert.match(comparePackDirs(a, d).join('\n'), /same payload, different stored bytes/);
    const found = verifyFiles(d, pack).join('\n');
    assert.match(found, /B on disk, pack\.json says/);
    assert.match(found, /stored bytes do not hash to gzSha256/);
    assert.match(found, /mtime 0, OS 0xff/);
  });
});

describe('gzip headers and the leak scan (§6.2 step 15)', () => {
  it('refuses optional gzip header fields and scans the stored bytes for a leak hidden in one', () => {
    const good = gzipDeterministic(Buffer.from('{"ok":true}'));
    assert.equal(gzipHeaderProblem(good), null);
    // FLG = FCOMMENT with a home-folder path in the comment.
    const comment = Buffer.from('C:\\Users\\someone\\secret\0', 'latin1');
    const bad = Buffer.concat([good.subarray(0, 10), comment, good.subarray(10)]);
    bad[3] = 0x10;
    assert.match(gzipHeaderProblem(bad), /FLG is 0x10/);
    const dir = join(tmp, 'leak'); mkdirSync(join(dir, 'nav'), { recursive: true });
    writeFileSync(join(dir, 'nav', 'x.12345678.json.gz'), bad);
    const hits = leakScanDir(dir).join('\n');
    assert.match(hits, /\(stored\) @\d+: "\\\\Users\\\\"/);
    assert.match(hits, /FLG is 0x10/);
  });
});

describe('estate:check (§6.6)', () => {
  it('public/estate holds LICENSE.txt and one version folder, and no dev pack lives anywhere under public/', () => {
    const repo = join(tmp, 'repo');
    mkdirSync(join(repo, 'public', 'estate', 'v1.2'), { recursive: true });
    writeFileSync(join(repo, 'public', 'estate', 'LICENSE.txt'), 'CC BY 4.0');
    assert.deepEqual(checkPublicEstate(repo), { problems: [], versions: ['v1.2'] });
    mkdirSync(join(repo, 'public', 'estate', 'v1.2-dev'));
    writeFileSync(join(repo, 'public', 'estate', 'v1.2-dev', 'pack.12345678.json'), JSON.stringify({ source: { dev: true } }));
    mkdirSync(join(repo, 'public', 'estate', 'v1.1'));
    writeFileSync(join(repo, 'public', 'estate', 'notes.md'), 'x');
    const problems = checkPublicEstate(repo).problems.join('\n');
    assert.match(problems, /public\/estate\/v1\.2-dev: only LICENSE\.txt and one vX\.Y folder/);
    assert.match(problems, /public\/estate\/notes\.md/);
    assert.match(problems, /2 version folders/);
    assert.match(problems, /estate\/v1\.2-dev\/pack\.12345678\.json is a dev pack/);
  });

  it('--provenance --zips: the downloaded zips must hash to source.assets', () => {
    const dir = join(tmp, 'zips'); mkdirSync(dir);
    writeFileSync(join(dir, 'a.zip'), 'zip bytes');
    const asset = { name: 'a.zip', sha256: '6f2b8a4a25df7c3c7a3a1d3a4f0e5d3b8c6f7d9e1a2b3c4d5e6f708192a3b4c5', bytes: 9 };
    assert.match(checkAssets({ source: { assets: [asset] } }, dir).join('\n'), /a\.zip is [0-9a-f]{64} \(9 B\), source\.assets records/);
    assert.match(checkAssets({ source: { assets: [{ ...asset, name: 'b.zip' }] } }, dir)[0], /b\.zip is not in/);
  });
});

describe('ESTATE_views.json (U2, estate/blender/render.py)', () => {
  // camera_info's shape: a perspective camera, 50 mm lens on a 36 mm sensor, 1600 × 1200, AUTO fit.
  const doc = {
    schema: 'sample-town-n5/render-views/1', frame: 'estate, metres, Z up', blend: 'estate.blend',
    views: { aerial_NE: { type: 'PERSP', matrix_world: [[1, 0, 0, 450], [0, 1, 0, 460], [0, 0, 1, 300], [0, 0, 0, 1]], lens: 50, sensor_width: 36, sensor_fit: 'AUTO', shift_x: 0.02, shift_y: -0.01, res: [1600, 1200], clip: [0.1, 2000] } },
  };
  it('reads views.aerial_NE into pack.views.aerialNE', () => {
    const { view, problems } = readAerialView(doc, { strict: true });
    assert.deepEqual(problems, []);
    assert.deepEqual(view.eye, [450, 460, 300]);
    assert.deepEqual(view.quat, [0, 0, 0, 1]);
    assert.deepEqual(view.shift, [0.02, -0.01]);
    assert.equal(view.aspect, 1.333333);
    assert.ok(Math.abs(view.vfovDeg - 30.219) < 0.001, `vfov ${view.vfovDeg}`); // 2·atan(tan(atan(36/100)) / (4/3))
  });
  it('refuses a record a release cannot use, and only warns in a dev run', () => {
    assert.throws(() => readAerialView({ ...doc, schema: 'other' }, { strict: true }), /schema is "other"/);
    assert.throws(() => readAerialView({ schema: doc.schema, views: {} }, { strict: true }), /no views\.aerial_NE/);
    assert.throws(() => readAerialView({ schema: doc.schema, views: { aerial_NE: { ...doc.views.aerial_NE, type: 'ORTHO' } } }, { strict: true }), /must be PERSP/);
    // The keys the first reader guessed (top-level aerial_NE) are not upstream's.
    const guessed = { aerial_NE: doc.views.aerial_NE };
    assert.throws(() => readAerialView(guessed, { strict: true }), /schema is undefined; no views\.aerial_NE|schema is undefined/);
    const dev = readAerialView(guessed, { strict: false });
    assert.equal(dev.view, null);
    assert.ok(dev.problems.length >= 1);
  });
});

describe('the toolchain', () => {
  it('is installed at the pins pack.json records', () => {
    assert.deepEqual(toolProblems(), []);
  });
});

describe('site ground orientation (§6.2 step 5)', () => {
  it('orients closed ground solids by volume and drops their bottoms below grade; open surfaces face up', () => {
    const g = new Soup(16);
    // A closed slab, y −0.45 … −0.15, outward-wound (12 triangles).
    const lo = [0, -0.45, -2], hi = [2, -0.15, 0];
    const v = (i) => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
    for (const [a, b, c, d] of [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]) {
      g.push(...v(a), ...v(b), ...v(c), 1, 0); g.push(...v(a), ...v(c), ...v(d), 1, 0);
    }
    // An open, downward-wound patch at grade, away from the slab.
    g.push(10, 0, 0, 10, 0, -1, 11, 0, 0, 2, 0);
    const out = orientGround(g);
    assert.equal(out.droppedBottoms, 2);
    assert.equal(out.faceUp, 1);
    assert.equal(out.flippedSolids, 0);
    assert.equal(out.soup.count, 11);
  });
});
