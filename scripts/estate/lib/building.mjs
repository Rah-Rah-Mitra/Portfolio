// One building through plan §6.2 steps 2–6f: read its chunks and LODs, open
// the doors, then build massing, F (façade), D (detail) and I (interior).

import { bakeMesh, buildMesh, buildPrimitives, classify, instanceAll, meshBox, meshNodes, meshSoup, newDoc, readGlb } from './gltf.mjs';
import { EDGE_SLOT, GLASS_INTERIOR_SLOT, GLASS_SLOT, slotOf } from './palette.mjs';
import { featureEdges } from './pure/edges.mjs';
import { det3, multiply, openPoseYup, orientClosedSolids, surfaceErrorP90 } from './pure/geom.mjs';
import { facePanelFromRooms, facePanelOut, mergePanels, midPlanePanel, panelCorners, panelsNearSoup, pushPanel } from './pure/panels.mjs';
import { Soup, concatSoups } from './pure/soup.mjs';
import { bandIndex, canonicalTag, storeyList } from './pure/storeys.mjs';
import { instanceStorey, tagByChunks } from './pure/tag.mjs';
import { countKeys, exactSplitProblem, soupKeys, splitTypical } from './pure/trikeys.mjs';

/** T's storey byte: T is drawn once per typical storey, so it belongs to none. */
export const T_STOREY = 255;

const MIRROR = 'a mirroring placement';

// The kit name of a furniture mesh: upstream's mesh name without FURN_ and
// without a trailing 22-character IFC GUID (BLK_507's letterbox banks carry one).
export const kitName = (meshName) => meshName.replace(/^FURN_/, '').replace(/_[0-9A-Za-z_$]{22}$/, '').replace(/[^A-Za-z0-9_-]/g, '_');

const dominantSlot = (mesh) => {
  let best = null; let most = -1;
  for (const prim of mesh.listPrimitives()) {
    const n = (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3;
    if (n > most) { most = n; best = prim.getMaterial()?.getName() ?? ''; }
  }
  return slotOf(best);
};

// A 12-triangle box over a local [min, max], outward-wound.
const boxSoup = ([lo, hi], slot) => {
  const s = new Soup(12);
  const v = (i) => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  for (const [a, b, c, d] of quads) {
    s.push(...v(a), ...v(b), ...v(c), slot, 0);
    s.push(...v(a), ...v(c), ...v(d), slot, 0);
  }
  return s;
};

const splitGlass = (soup) => {
  const opaque = new Soup(Math.max(1, soup.count)); const glass = new Soup(16);
  for (let i = 0; i < soup.count; i += 1) {
    if (soup.slot[i] === GLASS_SLOT) { const j = glass.pushFrom(soup, i); glass.slot[j] = GLASS_INTERIOR_SLOT; } else opaque.pushFrom(soup, i);
  }
  return { opaque, glass };
};

/**
 * Reads a building and analyses its interior chunks. `files` maps upstream
 * names to bytes; `web` is the parsed <ID>_web.json or null (doors stay closed).
 */
export const analyseBuilding = async ({ id, engine, read, web, minShare, warn }) => {
  const storeys = storeyList(engine.storeys);
  const ffls = storeys.map((s) => s.ffl);
  const opens = new Map();
  if (web) {
    for (const door of web.doors ?? []) {
      if (opens.has(door.leaf_node)) throw new Error(`${id}: web.json opens ${door.leaf_node} twice`);
      opens.set(door.leaf_node, openPoseYup(door.open));
    }
  }
  const passableLeaves = (engine.doors ?? []).filter((d) => d.passable).reduce((n, d) => n + (d.leaves?.length ?? 0), 0);

  const chunks = [];
  const furniture = [];
  const leafBoxes = new Map();
  let opened = 0;
  const orientation = { closed: 0, open: 0, flipped: 0, flippedTris: 0 };
  for (let s = 0; s < storeys.length; s += 1) {
    const { tag, ffl } = storeys[s];
    const chunkName = engine.interior_chunks?.[tag]?.file;
    if (!chunkName) throw new Error(`${id}: storey ${tag} has no interior chunk in the engine JSON`);
    const doc = await readGlb(read(`model/${id}/${chunkName}`));
    const rootNode = doc.getRoot().listScenes()[0].listChildren()[0];
    const extras = rootNode?.getExtras() ?? {};
    if (canonicalTag(extras.storey) !== tag) throw new Error(`${id}: ${chunkName} says storey ${extras.storey}, expected ${tag}`);
    const soup = new Soup(4096);
    for (const node of meshNodes(doc)) {
      const cls = classify(node.getName());
      if (cls === 'lift') continue; // upstream keeps cars out of chunks; never ship one
      let matrix = node.getWorldMatrix();
      if (det3(matrix) < 0 && cls === 'furn') throw new Error(`${id} ${tag}: furniture ${node.getName()} has ${MIRROR}`);
      if (cls === 'furn') {
        furniture.push({ mesh: node.getMesh(), kit: kitName(node.getMesh().getName()), matrix, storey: s });
        continue;
      }
      if (cls === 'door') {
        const guid = node.getExtras()?.guid;
        const leaves = node.listChildren().filter((c) => c.getMesh() && classify(c.getName()) === 'leaf');
        if (guid && leaves.length) {
          leafBoxes.set(guid, leaves.map((leaf) => ({ box: meshBox(leaf.getMesh()), matrix: leaf.getWorldMatrix() })).filter((l) => l.box));
        }
      }
      if (cls === 'leaf' && opens.has(node.getName())) {
        matrix = multiply(opens.get(node.getName()), matrix);
        opened += 1;
      }
      bakeMesh(node.getMesh(), matrix, soup, { storey: s });
    }
    const o = orientClosedSolids(soup);
    for (const k of Object.keys(orientation)) orientation[k] += o[k];
    const keys = soupKeys(soup, ffl);
    chunks.push({ tag, ffl, soup, keys, counts: countKeys(keys) });
  }
  if (web && opened !== passableLeaves) {
    throw new Error(`${id}: opened ${opened} leaves, but the engine JSON has ${passableLeaves} passable leaves`);
  }
  if (!web) warn(`${id}: no ${id}_web.json, so every door stays closed`);
  if (orientation.flipped) warn(`${id}: interior: flipped ${orientation.flipped} inside-out closed solids (${orientation.flippedTris} triangles)`);

  // Typical storeys: every storey but the lowest and RF is a candidate.
  const candidates = chunks.map((c, s) => ({ index: s, keys: c.keys })).filter((c) => c.index > 0 && storeys[c.index].tag !== 'RF');
  const split = splitTypical(candidates, minShare);
  return { id, storeys, ffls, chunks, furniture, leafBoxes, split, opened, passableLeaves, orientation };
};

/** Step 6d: the interior GLB document and its statistics. */
export const buildInterior = async (a, budgets) => {
  const { id, storeys, chunks, split, furniture } = a;
  const typicalSet = new Set(split.typical);
  // T relative to its floor, from the lowest typical storey; R with storey tags.
  const tSoup = split.tFrom >= 0 ? chunks[split.tFrom].soup.pick(split.tPick, -chunks[split.tFrom].ffl) : new Soup(1);
  for (let i = 0; i < tSoup.count; i += 1) tSoup.storey[i] = T_STOREY;
  const rParts = [];
  const sourceTris = {}; const drawnTris = {};
  const tKeys = soupKeys(tSoup, 0);
  for (const s of split.typical) {
    const c = chunks[s];
    const rIdx = split.residual.get(s);
    const r = c.soup.pick(rIdx);
    rParts.push(r);
    // The hard check, on the geometry being shipped: T (at this floor) + R_s = chunk_s.
    const problem = exactSplitProblem(tKeys, soupKeys(r, c.ffl), c.keys);
    if (problem) throw new Error(`${id} ${c.tag}: T + R does not reproduce the chunk exactly: ${problem}`);
  }
  const rSoup = concatSoups(rParts);
  // Per storey, the chunk's triangles (furniture kits are counted in
  // `furniture`, by instance) and what the pack draws for that storey: T + R_s
  // on a typical storey, the special mesh otherwise. They are equal by the
  // hard check; pack.json carries both so estate-pack.test.ts can say so.
  storeys.forEach(({ tag }, s) => {
    sourceTris[tag] = chunks[s].soup.count;
    drawnTris[tag] = typicalSet.has(s) ? tSoup.count + split.residual.get(s).length : chunks[s].soup.count;
  });

  const ctx = newDoc();
  // Furniture first: instanceAll batches every mesh node present.
  const kits = new Map();
  for (const f of furniture) {
    if (!kits.has(f.kit)) {
      const soup = meshSoup(f.mesh, {});
      const { opaque, glass } = splitGlass(soup);
      const box = meshBox(f.mesh);
      kits.set(f.kit, {
        mesh: buildMesh(ctx, `furniture_${f.kit}`, opaque, glass),
        proxy: buildMesh(ctx, `proxy_${f.kit}`, boxSoup(box, dominantSlot(f.mesh))),
        tris: soup.count, instances: 0, source: f.mesh,
      });
    } else if (kits.get(f.kit).source !== f.mesh) {
      throw new Error(`${id}: two different furniture meshes share the kit name ${f.kit}`);
    }
    const kit = kits.get(f.kit);
    kit.instances += 1;
    ctx.scene.addChild(ctx.doc.createNode().setMesh(kit.mesh).setMatrix(f.matrix));
    ctx.scene.addChild(ctx.doc.createNode().setMesh(kit.proxy).setMatrix(f.matrix));
  }
  const batches = kits.size ? await instanceAll(ctx, (y) => instanceStorey(a.ffls, y)) : [];

  const add = (name, soup) => {
    if (!soup.count) return 0;
    const { opaque, glass } = splitGlass(soup);
    ctx.scene.addChild(ctx.doc.createNode(name).setMesh(buildMesh(ctx, name, opaque, glass)));
    return soup.count;
  };
  add('typical', tSoup);
  add('residual', rSoup);
  const specials = [];
  storeys.forEach(({ tag }, s) => {
    if (typicalSet.has(s)) return;
    const tris = add(`special_${tag}`, chunks[s].soup);
    specials.push({ tag, tris });
  });

  // Caps that are about content, not bytes (§6.5 "Other caps").
  const caps = budgets.triangles;
  const problems = [];
  if (tSoup.count > caps.typicalPerBuilding) problems.push(`T ${tSoup.count} > ${caps.typicalPerBuilding}`);
  if (rSoup.count > caps.residualPerBuilding) problems.push(`R ${rSoup.count} > ${caps.residualPerBuilding}`);
  for (const sp of specials) if (sp.tris > caps.specialStorey) problems.push(`special ${sp.tag} ${sp.tris} > ${caps.specialStorey}`);
  for (const [name, kit] of kits) if (kit.tris > caps.repeatedMesh) problems.push(`furniture kit ${name} ${kit.tris} > ${caps.repeatedMesh}`);
  for (const s of split.typical) {
    const share = split.shares.get(s);
    if (share < budgets.minTypicalShare) problems.push(`${storeys[s].tag} typical share ${share.toFixed(4)} < ${budgets.minTypicalShare}`);
  }

  return {
    ctx,
    batches,
    stats: {
      typicalTris: tSoup.count,
      residualTris: rSoup.count,
      specials,
      furniture: [...kits].map(([kit, k]) => ({ kit, instances: k.instances, tris: k.tris, proxyTris: 12 })),
      sourceTris, drawnTris,
      typical: split.typical.map((s) => storeys[s].tag),
      shares: Object.fromEntries(split.typical.map((s) => [storeys[s].tag, Number(split.shares.get(s).toFixed(4))])),
    },
    problems,
  };
};

/** Steps 6b, 6c and 6f: F (façade) and D (detail) documents. */
export const buildExterior = async (a, lod1, footprintRings, engineRooms, budgets, warn) => {
  const { id, ffls, chunks, leafBoxes } = a;
  const chunkCounts = chunks.map((c) => c.counts);
  const shell = new Soup(65536);
  const openings = [];
  for (const node of meshNodes(lod1)) {
    const cls = classify(node.getName());
    if (cls === 'l1win' || cls === 'l1door') { openings.push({ node, cls }); continue; }
    if (cls !== 'static') throw new Error(`${id}: LOD1 node ${node.getName()} is ${cls}; expected the shell or openings`);
    bakeMesh(node.getMesh(), node.getWorldMatrix(), shell);
  }
  const orient = orientClosedSolids(shell);
  if (orient.flipped) warn(`${id}: façade: flipped ${orient.flipped} inside-out closed solids (${orient.flippedTris} triangles)`);
  const tagged = tagByChunks(shell, ffls, chunkCounts);

  // Panels and the D soup they are checked against.
  const panels = []; const panelSlots = []; const dSoup = new Soup(65536);
  let undecided = 0; let byRooms = 0; let byFootprint = 0; let doorFallback = 0; let mismatch = 0;
  const roomsByStorey = new Map();
  for (const room of engineRooms) {
    const s = a.storeys.findIndex((st) => st.tag === room.storey);
    if (s < 0) continue;
    if (!roomsByStorey.has(s)) roomsByStorey.set(s, []);
    roomsByStorey.get(s).push({ polygon: room.polygon, external: !!room.external });
  }
  const placements = [];
  for (const { node, cls } of openings) {
    const matrix = node.getWorldMatrix();
    if (det3(matrix) < 0) throw new Error(`${id}: ${node.getName()} has ${MIRROR}; D cannot instance it without inverting its faces`);
    const mesh = node.getMesh();
    let panel; let slot;
    if (cls === 'l1win') {
      const box = meshBox(mesh, (m) => m === 'Glass');
      if (!box) throw new Error(`${id}: window ${node.getName()} has no Glass primitive`);
      panel = midPlanePanel(box[0], box[1], matrix);
      slot = GLASS_SLOT;
      bakeMesh(mesh, matrix, dSoup, { skip: (m) => m === 'Glass' });
    } else {
      const leaves = leafBoxes.get(node.getExtras()?.guid);
      if (leaves && leaves.length) {
        panel = mergePanels(leaves.map((l) => midPlanePanel(l.box[0], l.box[1], l.matrix)));
      } else {
        const box = meshBox(mesh);
        panel = midPlanePanel(box[0], box[1], matrix);
        doorFallback += 1;
      }
      slot = dominantSlot(mesh);
      bakeMesh(mesh, matrix, dSoup);
    }
    const roomsHere = roomsByStorey.get(bandIndex(ffls, Math.min(...panelCorners(panel).map((c) => c[1])))) ?? [];
    let out = facePanelFromRooms(panel, roomsHere);
    if (out.decided) byRooms += 1;
    else {
      out = facePanelOut(panel, footprintRings);
      if (out.decided) byFootprint += 1; else undecided += 1;
    }
    panels.push(out.panel); panelSlots.push(slot);
    const storey = instanceStorey(ffls, matrix[13]);
    placements.push({ node, cls, matrix, storey });
  }
  const near = panelsNearSoup(panels, dSoup);
  if (near.length) throw new Error(`${id}: ${near.length}+ façade panels lie within 2 mm of a D face (first: panel ${near[0].panel})`);
  if (undecided) warn(`${id}: ${undecided} of ${panels.length} façade panels faced away from the footprint centroid (no room or footprint probe decided)`);
  if (doorFallback) warn(`${id}: ${doorFallback} exterior doors had no leaf in any chunk; their panel sits on the door's own mid-plane`);

  const fSoup = new Soup(shell.count + panels.length * 2);
  fSoup.append(shell);
  panels.forEach((p, i) => {
    const first = fSoup.count;
    pushPanel(fSoup, p, panelSlots[i], 0);
    // F's rule for a panel: the band of its lowest point. It must agree with its D instance's.
    const s = bandIndex(ffls, Math.min(fSoup.minY(first), fSoup.minY(first + 1)));
    fSoup.storey[first] = s; fSoup.storey[first + 1] = s;
    if (s !== placements[i].storey) mismatch += 1;
  });
  if (mismatch) warn(`${id}: ${mismatch} panels' z-min band differs from their D instance's translation band`);

  const edges = featureEdges(shell, { max: 6000 });
  const lines = { count: edges.length, pos: new Float64Array(edges.length * 6), slot: new Uint8Array(edges.length), storey: new Uint8Array(edges.length) };
  edges.forEach((e, i) => { lines.pos.set([...e.a, ...e.b], i * 6); lines.slot[i] = EDGE_SLOT; lines.storey[i] = e.storey; });

  const f = newDoc();
  const fMesh = f.doc.createMesh('facade');
  for (const prim of buildPrimitives(f, fSoup, f.materials.opaque)) fMesh.addPrimitive(prim);
  for (const prim of buildPrimitives(f, lines, f.materials.edge, 'lines')) fMesh.addPrimitive(prim);
  f.scene.addChild(f.doc.createNode('facade').setMesh(fMesh));

  // D: kits from LOD1's own meshes (windows without their glass), one node per
  // opening, batched by instance(), _STOREY from each translation's band.
  const d = newDoc();
  const kits = new Map();
  for (const p of placements) {
    const src = p.node.getMesh();
    if (!kits.has(src)) {
      const soup = meshSoup(src, p.cls === 'l1win' ? { skip: (m) => m === 'Glass' } : {});
      if (soup.count > budgets.triangles.repeatedMesh) throw new Error(`${id}: D kit ${src.getName()} has ${soup.count} triangles > ${budgets.triangles.repeatedMesh}`);
      kits.set(src, { mesh: buildMesh(d, src.getName(), soup), tris: soup.count, instances: 0 });
    }
    const kit = kits.get(src);
    kit.instances += 1;
    d.scene.addChild(d.doc.createNode().setMesh(kit.mesh).setMatrix(p.matrix));
  }
  const dBatches = await instanceAll(d, (y) => instanceStorey(ffls, y));
  const dDrawn = [...kits.values()].reduce((n, k) => n + k.tris * k.instances, 0);

  return {
    facade: { ctx: f, soup: fSoup, tris: fSoup.count, shellTris: shell.count, panels: panels.length, facing: { byRooms, byFootprint, undecided }, edges: edges.length, exactMatched: tagged.exactMatched, banded: tagged.banded, shell },
    detail: { ctx: d, batches: dBatches, kits: kits.size, instances: placements.length, drawnTris: dDrawn, storedTris: [...kits.values()].reduce((n, k) => n + k.tris, 0) },
  };
};

/** Step 6a: the massing soup (LOD2) and its error against the LOD1 shell. */
export const buildMassing = (lod2, shell) => {
  const soup = new Soup(512);
  for (const node of meshNodes(lod2)) bakeMesh(node.getMesh(), node.getWorldMatrix(), soup);
  // Unique shell vertices at 1 cm.
  const seen = new Set(); const pts = [];
  for (let o = 0; o < shell.count * 9; o += 3) {
    const key = `${Math.round(shell.pos[o] * 100)},${Math.round(shell.pos[o + 1] * 100)},${Math.round(shell.pos[o + 2] * 100)}`;
    if (seen.has(key)) continue;
    seen.add(key); pts.push(shell.pos[o], shell.pos[o + 1], shell.pos[o + 2]);
  }
  const error = surfaceErrorP90(Float64Array.from(pts), soup.pos.subarray(0, soup.count * 9));
  return { soup, error };
};
