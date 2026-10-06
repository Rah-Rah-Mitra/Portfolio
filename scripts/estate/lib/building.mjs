// One building through plan §6.2 steps 2–6f: read its chunks and LODs, open
// the doors, then build massing, F (façade), D (detail) and I (interior).

import { bakeMesh, buildMesh, buildPrimitives, classify, instanceAll, meshBox, meshNodes, meshSoup, newDoc, readGlb } from './gltf.mjs';
import { EDGE_SLOT, GLASS_INTERIOR_SLOT, GLASS_SLOT, slotOf } from './palette.mjs';
import { featureEdges } from './pure/edges.mjs';
import { det3, multiply, openPoseYup, orientClosedSolids, surfaceErrorP90 } from './pure/geom.mjs';
import { facePanelFromRooms, facePanelOut, mergePanels, midPlanePanel, openingPanel, panelCorners, panelsNearSoup, pushPanel } from './pure/panels.mjs';
import { standInSoup } from './pure/proxy.mjs';
import { Soup, concatSoups } from './pure/soup.mjs';
import { bandIndex, canonicalTag, storeyList } from './pure/storeys.mjs';
import { instanceStorey, majorityOwner, maskCoverage, tagByChunks } from './pure/tag.mjs';
import { countKeys, exactSplitProblem, soupKeys, splitTypical } from './pure/trikeys.mjs';

/** T's storey byte: T is drawn once per typical storey, so it belongs to none. */
export const T_STOREY = 255;

const MIRROR = 'a mirroring placement';

/** Triangles a mesh stores (every primitive, indexed or not). */
const meshTris = (mesh) => mesh.listPrimitives().reduce((n, prim) => n + Math.floor((prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3), 0);

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
    // What the chunk stores, counted from the GLB itself rather than from what
    // was baked, so pack.json's sourceTris can disagree with drawnTris.
    const raw = { total: 0, furniture: 0, lift: 0 };
    for (const node of meshNodes(doc)) {
      const cls = classify(node.getName());
      const n = meshTris(node.getMesh());
      raw.total += n;
      if (cls === 'lift') { raw.lift += n; continue; } // upstream keeps cars out of chunks; never ship one
      if (cls === 'furn') raw.furniture += n;
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
    const statics = raw.total - raw.furniture - raw.lift;
    if (soup.count !== statics) throw new Error(`${id} ${tag}: baked ${soup.count} of the chunk's ${statics} triangles that are neither furniture nor lift cars`);
    if (raw.lift) warn(`${id} ${tag}: dropped ${raw.lift} lift-car triangles from the interior chunk`);
    chunks.push({ tag, ffl, soup, keys, counts: countKeys(keys), raw });
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
    const raw = chunks[s].raw;
    sourceTris[tag] = raw.total - raw.furniture - raw.lift;
    drawnTris[tag] = typicalSet.has(s) ? tSoup.count + split.residual.get(s).length : chunks[s].soup.count;
  });

  const ctx = newDoc();
  // Furniture first: instanceAll batches every mesh node present.
  const kits = new Map();
  for (const f of furniture) {
    if (!kits.has(f.kit)) {
      const soup = meshSoup(f.mesh, {});
      const { opaque, glass } = splitGlass(soup);
      // The stand-in beyond the furniture radius follows the kit's height
      // profile (pure/proxy.mjs): a tile top over a steel pedestal, not a crate.
      const standIn = standInSoup(soup, { skip: (slot) => slot === GLASS_SLOT });
      kits.set(f.kit, {
        mesh: buildMesh(ctx, `furniture_${f.kit}`, opaque, glass),
        proxy: buildMesh(ctx, `proxy_${f.kit}`, standIn),
        tris: soup.count, proxyTris: standIn.count, instances: 0, source: f.mesh,
      });
    } else if (kits.get(f.kit).source !== f.mesh) {
      throw new Error(`${id}: two different furniture meshes share the kit name ${f.kit}`);
    }
    const kit = kits.get(f.kit);
    kit.instances += 1;
    ctx.scene.addChild(ctx.doc.createNode().setMesh(kit.mesh).setMatrix(f.matrix));
    ctx.scene.addChild(ctx.doc.createNode().setMesh(kit.proxy).setMatrix(f.matrix));
  }
  // Every FURN_ triangle of every chunk is drawn by a kit instance: none is dropped.
  const furnDrawn = new Map();
  for (const f of furniture) furnDrawn.set(f.storey, (furnDrawn.get(f.storey) ?? 0) + kits.get(f.kit).tris);
  storeys.forEach(({ tag }, s) => {
    if ((furnDrawn.get(s) ?? 0) !== chunks[s].raw.furniture) throw new Error(`${id} ${tag}: furniture kits draw ${furnDrawn.get(s) ?? 0} triangles of the chunk's ${chunks[s].raw.furniture}`);
  });
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
    // The built T (relative to its floor) and R, for the seam audit on the decoded file (quantcheck.mjs seamGaps).
    built: { t: tSoup, r: rSoup },
    stats: {
      typicalTris: tSoup.count,
      residualTris: rSoup.count,
      specials,
      furniture: [...kits].map(([kit, k]) => ({ kit, instances: k.instances, tris: k.tris, proxyTris: k.proxyTris })),
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
  const panels = []; const panelSlots = []; const panelBacks = []; const dSoup = new Soup(65536);
  let undecided = 0; let byRooms = 0; let byFootprint = 0; let doors = 0; let doorFallback = 0; let mismatch = 0;
  const fallbackNames = [];
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
    let panel; let slot; let backSlot;
    // The opening's D kit where it stands: checked against the panels, and
    // voted on by the chunks, whose storey its panel and instance must carry.
    const kitSoup = new Soup(64);
    if (cls === 'l1win') {
      const glass = meshBox(mesh, (m) => m === 'Glass');
      if (!glass) throw new Error(`${id}: window ${node.getName()} has no Glass primitive`);
      panel = openingPanel(glass, meshBox(mesh), matrix);
      slot = GLASS_SLOT; backSlot = GLASS_INTERIOR_SLOT;
      bakeMesh(mesh, matrix, kitSoup, { skip: (m) => m === 'Glass' });
    } else {
      const leaves = leafBoxes.get(node.getExtras()?.guid);
      if (leaves && leaves.length) {
        panel = mergePanels(leaves.map((l) => midPlanePanel(l.box[0], l.box[1], l.matrix)));
      } else {
        const box = meshBox(mesh);
        panel = midPlanePanel(box[0], box[1], matrix);
        doorFallback += 1;
      }
      slot = dominantSlot(mesh); backSlot = slot;
      bakeMesh(mesh, matrix, kitSoup);
    }
    dSoup.append(kitSoup);
    // Every panel is drawn from both sides (pushPanel's back pair): the runtime
    // draws F with one front-faces-only material, so a one-sided pane was a hole
    // from indoors whenever F stood whole around the camera (an interior still
    // streaming, lean mode, Fly through a block) or showed past the band's edge.
    // Which side is the front still matters for the colour: a window's front
    // faces out of its flat and is façade glass, its back is the interior glass
    // slot, the colour the interior's own pane takes when the mask hands over.
    // A door is its own slot both ways: the room probe cannot tell a lift
    // landing door from the shaft behind it (the shaft is no room), nor a stair
    // discharge door from the car park it opens on, so a door is not faced.
    let out = { panel };
    if (cls === 'l1door') doors += 1;
    else {
      const roomsHere = roomsByStorey.get(bandIndex(ffls, Math.min(...panelCorners(panel).map((c) => c[1])))) ?? [];
      out = facePanelFromRooms(panel, roomsHere);
      if (out.decided) byRooms += 1;
      else {
        out = facePanelOut(panel, footprintRings);
        if (out.decided) byFootprint += 1; else undecided += 1;
        fallbackNames.push(node.getName().replace(/_[0-9A-Za-z_$]{22}$/, ''));
      }
    }
    panels.push(out.panel); panelSlots.push(slot); panelBacks.push(backSlot);
    const storey = instanceStorey(ffls, matrix[13]);
    placements.push({ node, cls, matrix, storey, owner: majorityOwner(kitSoup, ffls, chunkCounts) });
  }
  const near = panelsNearSoup(panels, dSoup);
  if (near.length) throw new Error(`${id}: ${near.length}+ façade panels lie within 2 mm of a D face (first: panel ${near[0].panel})`);
  if (byFootprint || undecided) {
    const named = `${fallbackNames.slice(0, 6).join(', ')}${fallbackNames.length > 6 ? ', …' : ''}`;
    warn(`${id}: ${byFootprint + undecided} of ${panels.length - doors} window panels were faced by a fallback, not by the rooms either side (${byFootprint} by the footprint probe, ${undecided} away from the footprint centroid): ${named}`);
  }
  if (doorFallback) warn(`${id}: ${doorFallback} exterior doors had no leaf in any chunk; their panel sits on the door's own mid-plane`);

  const fSoup = new Soup(shell.count + panels.length * 4);
  fSoup.append(shell);
  const panelStoreys = panels.map((p, i) => {
    const first = fSoup.count;
    const added = pushPanel(fSoup, p, panelSlots[i], 0, { doubleSided: true, backSlot: panelBacks[i] });
    // F's rule for a panel: the band of its lowest point. The mask check below
    // holds it to the storey of the chunk that holds its opening.
    let low = Infinity;
    for (let t = first; t < first + added; t += 1) low = Math.min(low, fSoup.minY(t));
    const s = bandIndex(ffls, low);
    for (let t = first; t < first + added; t += 1) fSoup.storey[t] = s;
    if (placements[i].owner < 0 && s !== placements[i].storey) mismatch += 1;
    return s;
  });
  if (mismatch) warn(`${id}: ${mismatch} panels of openings no chunk holds have a z-min band other than their D instance's translation band`);

  // The façade mask (§7.5) over every band the runtime can show: a surface the
  // interior also draws — a shell triangle, a panel's opening, a D instance —
  // must be drawn by exactly one of the interior and F/D at every storey and
  // every band half-width (the tiers' bandK, and peeking's 1). The shell takes
  // its chunk's storey by construction (tagByChunks); a panel's z-min band and
  // an instance's translation band are rules that merely agree with the chunk
  // today, so this is where a disagreement would stop the run.
  const n = ffls.length;
  const owners = new Int16Array(shell.count + 2 * placements.length);
  const tags = new Int16Array(owners.length);
  owners.set(tagged.owner); tags.set(shell.storey.subarray(0, shell.count));
  placements.forEach((p, i) => {
    owners[shell.count + 2 * i] = p.owner; tags[shell.count + 2 * i] = panelStoreys[i];
    owners[shell.count + 2 * i + 1] = p.owner; tags[shell.count + 2 * i + 1] = p.storey;
  });
  const ks = [...new Set([1, ...(budgets.tiers ?? [{ bandK: 2 }]).map((t) => t.bandK)])].sort((x, y) => x - y);
  const mask = maskCoverage(owners, tags, n, ks);
  if (mask.holes || mask.doubles) {
    const { surface, storey, k, lo, hi } = mask.first;
    const what = surface < shell.count ? `shell triangle ${surface}` : `${(surface - shell.count) % 2 ? 'D instance' : 'panel'} of ${placements[Math.floor((surface - shell.count) / 2)].node.getName()}`;
    throw new Error(`${id}: the façade mask would misapply: ${mask.holes} surfaces hidden by F and not drawn by the interior, ${mask.doubles} drawn by both, over ${mask.bands} bands (first: ${what}, tagged ${a.storeys[tags[surface]].tag}, held by ${a.storeys[owners[surface]].tag}'s chunk, at ${a.storeys[storey].tag} k = ${k}, band ${a.storeys[lo].tag}–${a.storeys[hi].tag})`);
  }

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
    facade: { ctx: f, soup: fSoup, tris: fSoup.count, shellTris: shell.count, panels: panels.length, panelList: panels, facing: { byRooms, byFootprint, undecided, doors }, edges: edges.length, exactMatched: tagged.exactMatched, banded: tagged.banded, offBand: tagged.offBand, mask: { bands: mask.bands, ks, holes: mask.holes, doubles: mask.doubles, opened: mask.opened }, shell },
    detail: { ctx: d, batches: dBatches, kits: kits.size, instances: placements.length, drawnTris: dDrawn, storedTris: [...kits.values()].reduce((n, k) => n + k.tris, 0), soup: dSoup },
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
