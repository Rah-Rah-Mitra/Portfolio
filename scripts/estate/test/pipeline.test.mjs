// npm --prefix scripts/estate test — the pipeline's gltf-transform IO on
// in-memory documents (plan §10.2, P2 row "scripts/estate/test/*.test.mjs").

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { analyseBuilding, buildExterior, buildInterior, buildMassing } from '../lib/building.mjs';
import { bakeMesh, buildPrimitives, classify, countGlb, encodeDoc, instanceAll, newDoc, readGlb, storeyRoundTrip, validateGlb, buildMesh } from '../lib/gltf.mjs';
import { gzipDeterministic } from '../lib/files.mjs';
import { Soup } from '../lib/pure/soup.mjs';
import { leakScanDir } from '../check.mjs';
import { FFLS, reader, syntheticBlock } from './fixtures.mjs';

const budgets = { triangles: { typicalPerBuilding: 32000, residualPerBuilding: 4000, specialStorey: 13000, repeatedMesh: 600 }, minTypicalShare: 0.5 };
const quiet = () => {};

const analyse = async (opts = {}, web = 'default') => {
  const b = await syntheticBlock(opts);
  const a = await analyseBuilding({ id: b.id, engine: b.engine, read: reader(b.files), web: web === 'default' ? b.web : web, minShare: 0.5, warn: quiet });
  return { b, a };
};

describe('step 2: classify', () => {
  it('names leaves before doors, and every prefix the plan lists', () => {
    assert.equal(classify('DOOR__05-109_x_GUID_leaf'), 'leaf');
    assert.equal(classify('DOOR_L14_lift_4_landing_door_GUID_leaf_L'), 'leaf');
    assert.equal(classify('DOOR__05-109_x_GUID_leaf_2'), 'leaf');
    assert.equal(classify('DOOR__05-109_x_GUID'), 'door');
    assert.equal(classify('WIN__05-101_x'), 'win');
    assert.equal(classify('FURN_Hawker_table'), 'furn');
    assert.equal(classify('TREE_Tree_0001'), 'tree');
    assert.equal(classify('LIFT_Lift_1_car'), 'lift');
    assert.equal(classify('L1WIN__x'), 'l1win');
    assert.equal(classify('L1DOOR__x'), 'l1door');
    assert.equal(classify('L5_static'), 'static');
  });
});

describe('step 3: doors open with the exported poses', () => {
  it('applies every pose, and the count equals the passable leaves in the engine JSON', async () => {
    const { a } = await analyse();
    assert.equal(a.opened, 4);
    assert.equal(a.passableLeaves, 4);
    const closed = (await analyse({}, null)).a;
    assert.equal(closed.opened, 0);
    // L2's chunk differs only where its leaves were turned.
    const keys = (x) => new Set(x.chunks[1].keys);
    const moved = [...keys(a)].filter((k) => !keys(closed).has(k));
    assert.equal(moved.length, 24); // two leaves × 12 triangles
  });

  it('refuses a web.json that misses a passable leaf', async () => {
    const b = await syntheticBlock();
    const web = { doors: b.web.doors.slice(1) };
    await assert.rejects(analyseBuilding({ id: b.id, engine: b.engine, read: reader(b.files), web, minShare: 0.5, warn: quiet }), /opened 3 leaves, but the engine JSON has 4/);
  });
});

describe('step 4: palette slots', () => {
  it('fails the run on a material palette.json does not map', () => {
    const ctx = newDoc();
    const mesh = buildMesh(ctx, 'x', (() => { const s = new Soup(1); s.push(0, 0, 0, 1, 0, 0, 0, 1, 0, 0); return s; })());
    mesh.listPrimitives()[0].getMaterial().setName('Unobtainium');
    assert.throws(() => bakeMesh(mesh, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], new Soup(1)), /Unknown estate material "Unobtainium"/);
  });
});

describe('steps 6b and 6c: F and D', () => {
  it('puts the window panel on the glass mid-plane, facing out of the flat', async () => {
    const { b, a } = await analyse();
    const lod1 = await readGlb(b.files.get('model/TST/TST_lod1.glb'));
    const ext = await buildExterior(a, lod1, b.engine.massing.footprint, b.engine.rooms, budgets, quiet);
    const f = ext.facade;
    assert.equal(f.panels, 2);
    assert.deepEqual(f.facing, { byRooms: 2, byFootprint: 0, undecided: 0 });
    // The panels follow the shell in the F soup: the window's two triangles first.
    const p = f.soup.pos; const o = f.shellTris * 9;
    for (let k = 0; k < 3; k += 1) assert.ok(Math.abs(p[o + k * 3 + 2] - -0.04) < 1e-9, 'window panel off the glass mid-plane');
    // Facing +z (glTF), which is block-local -y: out of the flat, whose room lies at y > 0.
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1];
    assert.ok(ux * vy - uy * vx > 0, 'the window panel faces into the flat, not out of it');
    // The front door's panel sits inside its 40 mm leaf, 20 mm from each face.
    for (let k = 0; k < 3; k += 1) assert.ok(Math.abs(p[o + 18 + k * 3 + 2] - -0.02) < 1e-9, 'door panel off the leaf mid-plane');
    assert.equal(f.soup.storey[f.shellTris], 1);
    const counts = await countGlb(await encodeDoc(f.ctx, 14));
    assert.equal(counts.tris, f.shellTris + 4);
    // L2's slab is in L2's chunk (12); the façade wall's bottom and top faces coincide
    // with L1's and RF's chunk walls (2 + 2). Its sides match nothing and take the band rule.
    assert.equal(f.exactMatched, 16);
  });

  it('builds D as instances with a _STOREY per instance from its height', async () => {
    const { b, a } = await analyse();
    const lod1 = await readGlb(b.files.get('model/TST/TST_lod1.glb'));
    const ext = await buildExterior(a, lod1, b.engine.massing.footprint, b.engine.rooms, budgets, quiet);
    const glb = await encodeDoc(ext.detail.ctx, 16);
    const v = await validateGlb(glb);
    assert.equal(v.errors, 0, v.messages.join('\n'));
    const doc = await readGlb(glb);
    const storeys = [];
    for (const node of doc.getRoot().listNodes()) {
      const batch = node.getExtension('EXT_mesh_gpu_instancing');
      assert.ok(batch, `${node.getName()} is not instanced`);
      const s = batch.getAttribute('_STOREY');
      assert.ok(s, '_STOREY missing');
      assert.equal(s.getComponentType(), 5121); // UNSIGNED_BYTE
      assert.equal(s.getType(), 'VEC4');
      storeys.push([node.getName(), s.getElement(0, [])[0]]);
    }
    // The window at y 4.5 and the front door at y 3.6 both belong to L2 (index 1).
    assert.deepEqual(storeys.sort(), [['L1_D-main-1000x2100', 1], ['L1_W-1200x1300', 1]]);
    // Window frames ship without their glass: the F panel stands in for it.
    const counts = await countGlb(glb);
    assert.equal(counts.tris, 24 + 12);
  });

  it('refuses a door panel within 2 mm of a D face', async () => {
    const { b, a } = await analyse({ leafThickness: 0.003 });
    const lod1 = await readGlb(b.files.get('model/TST/TST_lod1.glb'));
    await assert.rejects(buildExterior(a, lod1, b.engine.massing.footprint, b.engine.rooms, budgets, quiet), /within 2 mm of a D face/);
  });

  it('measures the massing error against the LOD1 shell', async () => {
    const { b, a } = await analyse();
    const lod1 = await readGlb(b.files.get('model/TST/TST_lod1.glb'));
    const lod2 = await readGlb(b.files.get('model/TST/TST_lod2.glb'));
    const ext = await buildExterior(a, lod1, b.engine.massing.footprint, b.engine.rooms, budgets, quiet);
    const m = buildMassing(lod2, ext.facade.shell);
    assert.equal(m.soup.count, 12);
    assert.ok(m.error >= 0 && m.error < 4, `error ${m.error}`);
  });
});

describe('step 6d: the interior', () => {
  it('splits T and R so that T + R equals every typical chunk, and ships specials', async () => {
    const { a } = await analyse({ oddL3: true });
    assert.deepEqual(a.split.typical, [1, 2]);
    const I = await buildInterior(a, budgets);
    assert.deepEqual(I.problems, []);
    assert.equal(I.stats.typicalTris, 48);
    assert.equal(I.stats.residualTris, 24 + 12); // L2's front door, L3's stair block
    assert.deepEqual(I.stats.specials.map((s) => s.tag), ['L1', 'RF']);
    for (const tag of ['L1', 'L2', 'L3', 'RF']) assert.equal(I.stats.drawnTris[tag], I.stats.sourceTris[tag]);
    const glb = await encodeDoc(I.ctx, 16);
    assert.equal((await validateGlb(glb)).errors, 0);
    const names = (await countGlb(glb)).nodes.map((n) => n.name).sort();
    assert.deepEqual(names, ['residual', 'special_L1', 'special_RF', 'typical']);
  });
});

describe('steps 7–9: split, encode, validate', () => {
  it('splits a primitive before it passes 65,535 vertices', () => {
    const ctx = newDoc();
    const soup = new Soup(30000);
    for (let i = 0; i < 30000; i += 1) soup.push(i, 0, 0, i, 1, 0, i + 0.5, 0, 1, 4, 0); // 90,000 distinct vertices
    const prims = buildPrimitives(ctx, soup, ctx.materials.opaque);
    assert.equal(prims.length, 2);
    for (const p of prims) assert.ok(p.getAttribute('POSITION').getCount() <= 65535);
  });

  it('writes only POSITION and _META (u8 × 4: slot, 0, storey, 0), meshopt + quantisation, 0 validator errors, deterministically', async () => {
    const make = () => {
      const ctx = newDoc();
      const s = new Soup(2);
      s.push(0, 0, 0, 1, 0, 0, 0, 1, 0, 11, 3);
      s.push(1, 0, 0, 1, 1, 0, 0, 1, 0, 11, 3);
      ctx.scene.addChild(ctx.doc.createNode('n').setMesh(buildMesh(ctx, 'n', s)));
      return ctx;
    };
    const a = await encodeDoc(make(), 14);
    const b = await encodeDoc(make(), 14);
    assert.deepEqual(Buffer.from(a), Buffer.from(b));
    assert.equal((await validateGlb(a)).errors, 0);
    const c = await countGlb(a);
    assert.deepEqual([...c.attributes].sort(), ['POSITION', '_META']);
    assert.deepEqual(c.extensionsRequired, ['EXT_meshopt_compression', 'KHR_mesh_quantization']);
    const meta = (await readGlb(a)).getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('_META');
    assert.equal(meta.getComponentType(), 5121);
    assert.deepEqual(meta.getElement(0, []), [11, 0, 3, 0]);
  });

  it('batches shared meshes with instance() and tags each instance', async () => {
    const ctx = newDoc();
    const s = new Soup(1); s.push(0, 0, 0, 1, 0, 0, 0, 1, 0, 12, 0);
    const mesh = buildMesh(ctx, 'kit', s);
    for (const y of [0.1, 3.5, 7]) ctx.scene.addChild(ctx.doc.createNode().setMesh(mesh).setTranslation([1, y, 2]));
    const ffls = Object.values(FFLS);
    const batches = await instanceAll(ctx, (y) => { let i = 0; while (i + 1 < ffls.length && y >= ffls[i + 1] - 0.25) i += 1; return i; });
    assert.equal(batches.length, 1);
    const glb = await encodeDoc(ctx, 16);
    const node = (await readGlb(glb)).getRoot().listNodes().find((n) => n.getExtension('EXT_mesh_gpu_instancing'));
    const st = node.getExtension('EXT_mesh_gpu_instancing').getAttribute('_STOREY');
    // u8 x 4, storey in x: a u8 scalar would come back garbled (see instanceAll).
    assert.deepEqual([0, 1, 2].map((i) => st.getElement(i, [])), [[0, 0, 0, 0], [1, 0, 0, 0], [2, 0, 0, 0]]);
    assert.equal(await storeyRoundTrip(glb, batches), null);
    assert.equal(node.getName(), 'kit');
  });
});

describe('step 15: the leak scan', () => {
  it('refuses a planted path in a GLB JSON chunk and in a gzipped JSON file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'estate-leak-'));
    try {
      const ctx = newDoc();
      const s = new Soup(1); s.push(0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0);
      ctx.scene.addChild(ctx.doc.createNode('C:\\Users\\x\\model.blend').setMesh(buildMesh(ctx, 'm', s)));
      mkdirSync(join(dir, 'f'));
      writeFileSync(join(dir, 'f', 'A.00000000.glb.gz'), gzipDeterministic(Buffer.from(await encodeDoc(ctx, 14))));
      writeFileSync(join(dir, 'clean.json'), '{"ok":true}');
      const hits = leakScanDir(dir);
      assert.equal(hits.length, 1);
      assert.match(hits[0], /^f\/A\.00000000\.glb\.gz/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
