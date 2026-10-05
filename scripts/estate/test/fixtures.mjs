// In-memory upstream exports for the pipeline tests: a three-storey block
// (L1, L2, L3, RF) with one flat door per storey, one façade window and one
// front door, written with gltf-transform exactly as upstream lays its files
// out (block-local glTF Y-up; DOOR_ nodes with a _leaf child; L1WIN_/L1DOOR_
// under <stem>_openings). Nothing here reads the real export.

import { Document, NodeIO } from '@gltf-transform/core';

export const FFLS = { L1: 0, L2: 3.6, L3: 6.4, RF: 9.2 };
const TAGS = Object.keys(FFLS);
const PAD = { L1: 'L01', L2: 'L02', L3: 'L03', RF: 'RF' };

const io = new NodeIO();

// An axis-aligned box mesh (12 triangles, outward) per [material, lo, hi] part.
const boxMesh = (doc, buffer, name, parts) => {
  const mesh = doc.createMesh(name);
  for (const [material, lo, hi] of parts) {
    const pos = []; const idx = [];
    const v = (i) => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
    for (const [a, b, c, d] of [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]) {
      const base = pos.length / 3;
      for (const k of [a, b, c, d]) pos.push(...v(k));
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const mat = doc.getRoot().listMaterials().find((m) => m.getName() === material) ?? doc.createMaterial(material);
    mesh.addPrimitive(doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buffer))
      .setMaterial(mat));
  }
  return mesh;
};

const glb = async (doc) => Buffer.from(await io.writeBinary(doc));

/**
 * Builds the files of block TST. `leafThickness` sets the front door's leaf
 * (a thin one puts its panel within 2 mm of the leaf faces). Returns
 * { files: Map(rel → Buffer), engine, web }.
 */
export const syntheticBlock = async ({ leafThickness = 0.04, oddL3 = false } = {}) => {
  const files = new Map();
  const id = 'TST';
  // Interior chunks: a slab and two walls per storey, a flat door with a leaf.
  for (const tag of TAGS) {
    const y = FFLS[tag];
    const doc = new Document(); const buffer = doc.createBuffer(); const scene = doc.createScene();
    const root = doc.createNode(`${id}_int_${PAD[tag]}`).setExtras({ storey: tag, elevation: y });
    scene.addChild(root);
    const parts = [['RC slab', [0, y - 0.2, -8], [10, y, 0]], ['Painted RC - HDB off-white', [0, y, -8], [0.2, y + 2.6, 0]]];
    if (oddL3 && tag === 'L3') parts.push(['RC stair - granolithic', [4, y, -4], [5, y + 1, -3]]);
    const statics = doc.createNode(`${tag}_static`).setMesh(boxMesh(doc, buffer, `${tag}_static`, parts)).setExtras({ storey: tag });
    root.addChild(statics);
    if (tag !== 'RF') {
      const frame = boxMesh(doc, buffer, 'D-internal-900x2100', [['Timber door', [0, 0, -0.1], [0.05, 2.1, 0]]]);
      const leafMesh = boxMesh(doc, buffer, 'D-internal-900x2100_leaf', [['Timber door', [0, 0, -0.04], [0.85, 2.05, 0]]]);
      const door = doc.createNode(`DOOR__${tag}_flat_door_GUIDFLAT${tag}`).setMesh(frame).setTranslation([5, y, -2]).setExtras({ guid: `GUIDFLAT${tag}`, storey: tag });
      door.addChild(doc.createNode(`DOOR__${tag}_flat_door_GUIDFLAT${tag}_leaf`).setMesh(leafMesh).setTranslation([0.025, 0, -0.03]).setExtras({ leaf: 0, motion: 'swing' }));
      statics.addChild(door);
    }
    if (tag === 'L2') {
      // The front door: its leaf is what F's door panel is measured on.
      const frame = boxMesh(doc, buffer, 'D-main-1000x2100', [['Timber door', [0, 0, -0.1], [0.05, 2.1, 0]]]);
      const leafMesh = boxMesh(doc, buffer, 'D-main-1000x2100_leaf', [['Timber door', [0, 0, -leafThickness], [0.95, 2.05, 0]]]);
      const door = doc.createNode('DOOR__02-101_Main_door_GUIDMAIN').setMesh(frame).setTranslation([2, y, 0]).setExtras({ guid: 'GUIDMAIN', storey: tag });
      door.addChild(doc.createNode('DOOR__02-101_Main_door_GUIDMAIN_leaf').setMesh(leafMesh).setTranslation([0.025, 0, 0]).setExtras({ leaf: 0, motion: 'swing' }));
      statics.addChild(door);
    }
    files.set(`model/${id}/${id}_int_${PAD[tag]}.glb`, await glb(doc));
  }
  // LOD1: the shell (one exterior wall), a window (frame + glass) and the front door whole.
  {
    const doc = new Document(); const buffer = doc.createBuffer(); const scene = doc.createScene();
    const root = doc.createNode(id); scene.addChild(root);
    root.addChild(doc.createNode(`${id}_shell`).setMesh(boxMesh(doc, buffer, `${id}_shell`, [
      ['RC slab', [0, 3.4, -8], [10, 3.6, 0]],
      ['Painted RC - HDB off-white', [0, 0, -8], [0.2, 9.2, 0]],
    ])));
    const openings = doc.createNode(`${id}_openings`); root.addChild(openings);
    const win = boxMesh(doc, buffer, 'L1_W-1200x1300', [
      ['Aluminium frame', [0, 0, -0.08], [0.05, 1.3, 0]],
      ['Aluminium frame', [1.15, 0, -0.08], [1.2, 1.3, 0]],
      ['Glass', [0.05, 0.05, -0.043], [1.15, 1.25, -0.037]],
    ]);
    openings.addChild(doc.createNode('L1WIN__02-101_Bedroom_window_GUIDWIN').setMesh(win).setTranslation([6, 4.5, 0]).setExtras({ guid: 'GUIDWIN', ifc_class: 'IfcWindow' }));
    const door = boxMesh(doc, buffer, 'L1_D-main-1000x2100', [['Timber door', [0, 0, -0.1], [1, 2.1, 0]]]);
    openings.addChild(doc.createNode('L1DOOR__02-101_Main_door_GUIDMAIN').setMesh(door).setTranslation([2, 3.6, 0]).setExtras({ guid: 'GUIDMAIN', ifc_class: 'IfcDoor' }));
    files.set(`model/${id}/${id}_lod1.glb`, await glb(doc));
  }
  // LOD2: the massing box.
  {
    const doc = new Document(); const buffer = doc.createBuffer(); const scene = doc.createScene();
    const root = doc.createNode(id); scene.addChild(root);
    root.addChild(doc.createNode(`${id}_massing`).setMesh(boxMesh(doc, buffer, `${id}_massing`, [['Painted RC - HDB off-white', [0, -0.2, -8], [10, 9.2, 0]]])));
    files.set(`model/${id}/${id}_lod2.glb`, await glb(doc));
  }
  const doors = [];
  for (const tag of ['L1', 'L2', 'L3']) {
    doors.push({ guid: `GUIDFLAT${tag}`, node: `DOOR__${tag}_flat_door_GUIDFLAT${tag}`, storey: tag, passable: true, kind: 'internal',
      leaves: [{ node: `DOOR__${tag}_flat_door_GUIDFLAT${tag}_leaf`, motion: 'swing' }] });
  }
  doors.push({ guid: 'GUIDMAIN', node: 'DOOR__02-101_Main_door_GUIDMAIN', storey: 'L2', passable: true, kind: 'main', leaves: [{ node: 'DOOR__02-101_Main_door_GUIDMAIN_leaf', motion: 'swing' }] });
  const engine = {
    transform: [[1, 0, 0, 100], [0, 1, 0, 50], [0, 0, 1, 0], [0, 0, 0, 1]],
    storeys: { ...FFLS },
    interior_chunks: Object.fromEntries(TAGS.map((t) => [t, { file: `${id}_int_${PAD[t]}.glb` }])),
    doors,
    rooms: [
      // Inside the flat (enclosed) north of the façade (block-local y > 0 is glTF z < 0).
      ...['L2', 'L3'].map((s) => ({ name: `#0${s.slice(1)}-101 B`, room: 'Bedroom', flat: `#0${s.slice(1)}-101`, storey: s, floor_z: FFLS[s], height: 2.6, external: false, polygon: [[0.2, 0.1], [10, 0.1], [10, 8], [0.2, 8], [0.2, 0.1]] })),
    ],
    massing: { footprint: [[[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]]] },
    bounds_local: [[0, 0, -0.2], [10, 8, 9.2]],
  };
  // web.json: open every passable leaf by 90° about its hinge (Z up), row-major 3×4.
  const web = { doors: doors.flatMap((d) => d.leaves.map((l) => ({ leaf_node: l.node, storey: d.storey, motion: 'swing', open: [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0] }))) };
  return { id, files, engine, web };
};

export const reader = (files) => (rel) => {
  const bytes = files.get(rel);
  if (!bytes) throw new Error(`fixture has no ${rel}`);
  return bytes;
};
