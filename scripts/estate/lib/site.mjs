// SITE (plan §6.2 step 6e): four 200 m quadrants of ground, structures and
// furniture; five tree species, each with a 12-triangle far tree (a crown on a
// trunk stub, lib/pure/trees.mjs), instanced; and the outdoor ground heights
// (class `ground`). SITE's frame is the estate's (identity transform), so its
// glTF is estate Y-up.

import { bakeMesh, buildMesh, instanceAll, meshBox, meshNodesUnder, meshSoup, newDoc } from './gltf.mjs';
import { slotOf } from './palette.mjs';
import { components, faceUp, isClosed, orientClosedSolids, triNormal } from './pure/geom.mjs';
import { Soup } from './pure/soup.mjs';
import { rasterGround } from './pure/sn5w.mjs';
import { farTreeSoup } from './pure/trees.mjs';

export const QUADRANT = 200;
export const GROUND_CELL = 0.5;

const speciesName = (node) => (node.getExtras()?.type ?? node.getMesh().getName()).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * Plan step 5 for the ground surfaces: a closed ground solid (a kerb, a
 * slab) is oriented by its signed volume, so its bottom faces down, and every
 * downward face of one that lies wholly below grade (y ≤ 0) is dropped — it can
 * only be seen from under the estate. Open surfaces face up. Returns a new
 * soup and { flippedSolids, faceUp, droppedBottoms }.
 */
export const orientGround = (ground) => {
  const out = { flippedSolids: 0, faceUp: 0, droppedBottoms: 0 };
  const drop = new Uint8Array(ground.count);
  const n = [0, 0, 0];
  for (const comp of components(ground)) {
    if (!isClosed(ground, comp)) { out.faceUp += faceUp(ground, comp); continue; }
    out.flippedSolids += orientClosedSolids(ground, comp).flipped;
    for (const t of comp) {
      triNormal(ground.pos, t * 9, n);
      const len = Math.hypot(n[0], n[1], n[2]);
      const o = t * 9;
      if (len > 0 && n[1] / len < -0.5 && Math.max(ground.pos[o + 1], ground.pos[o + 4], ground.pos[o + 7]) <= 0) { drop[t] = 1; out.droppedBottoms += 1; }
    }
  }
  const kept = new Soup(Math.max(1, ground.count - out.droppedBottoms));
  for (let t = 0; t < ground.count; t += 1) if (!drop[t]) kept.pushFrom(ground, t);
  return { soup: kept, ...out };
};

const estateBox = (soup) => {
  const b = soup.bounds();
  // glTF (x, y, z) → estate (x, −z, y).
  return [[b[0][0], -b[1][2], b[0][1]], [b[1][0], -b[0][2], b[1][1]]].map((v) => v.map((x) => Math.round(x * 1000) / 1000));
};

/**
 * Builds the site document and the ground raster from SITE_lod0. Returns
 * { ctx, quadrants, trees, ground: { cell, lo, nx, ny, heightsCm }, warnings }.
 */
export const buildSite = async (lod0, warn) => {
  const quads = new Map();
  const groundTris = [];
  const trees = new Map();
  let flippedUp = 0; let flippedSolids = 0; let flippedGround = 0; let droppedBottoms = 0;
  for (const tile of lod0.getRoot().listScenes()[0].listChildren()[0].listChildren()) {
    const index = tile.getExtras()?.tile;
    if (!Array.isArray(index)) throw new Error(`SITE: tile ${tile.getName()} has no tile index`);
    const q = `${Math.min(1, Math.floor(index[0] / 2))}_${Math.min(1, Math.floor(index[1] / 2))}`;
    if (!quads.has(q)) quads.set(q, { ground: new Soup(4096), solids: new Soup(4096) });
    const quad = quads.get(q);
    for (const node of meshNodesUnder(tile)) {
      const name = node.getName();
      if (name.startsWith('TREE_')) {
        const species = speciesName(node);
        if (!trees.has(species)) trees.set(species, { mesh: node.getMesh(), placements: [] });
        if (trees.get(species).mesh !== node.getMesh()) throw new Error(`SITE: species ${species} uses two meshes`);
        trees.get(species).placements.push(node.getWorldMatrix());
        continue;
      }
      if (node === tile) throw new Error(`SITE: tile ${tile.getName()} carries a mesh of its own; the pack would drop it`);
      if (name.endsWith('_ground')) bakeMesh(node.getMesh(), node.getWorldMatrix(), quad.ground);
      else bakeMesh(node.getMesh(), node.getWorldMatrix(), quad.solids);
    }
  }
  for (const quad of quads.values()) {
    const g = orientGround(quad.ground);
    quad.ground = g.soup;
    flippedUp += g.faceUp; flippedGround += g.flippedSolids; droppedBottoms += g.droppedBottoms;
    flippedSolids += orientClosedSolids(quad.solids).flipped;
    const p = quad.ground.pos;
    for (let o = 0; o < quad.ground.count * 9; o += 3) groundTris.push(p[o], -p[o + 2], p[o + 1]);
  }
  if (flippedUp) warn(`SITE: turned ${flippedUp} downward-facing triangles of open ground surfaces up`);
  if (droppedBottoms) warn(`SITE: dropped ${droppedBottoms} downward faces of closed ground solids below grade (slab bottoms no camera sees)`);
  if (flippedGround) warn(`SITE: flipped ${flippedGround} inside-out closed ground solids`);
  if (flippedSolids) warn(`SITE: flipped ${flippedSolids} inside-out closed solids`);

  const ctx = newDoc();
  // Trees first: instanceAll batches every node present.
  const treeStats = [];
  for (const species of [...trees.keys()].sort()) {
    const { mesh, placements } = trees.get(species);
    const full = meshSoup(mesh, {});
    const foliage = meshBox(mesh, (m) => m === 'Foliage');
    const bark = meshBox(mesh, (m) => m === 'Bark');
    if (!foliage || !bark) throw new Error(`SITE: tree species ${species} needs a Foliage and a Bark primitive for its far tree`);
    const crown = farTreeSoup(foliage, bark, slotOf('Foliage'), slotOf('Bark'));
    const fullMesh = buildMesh(ctx, `tree_${species}`, full);
    const crownMesh = buildMesh(ctx, `crown_${species}`, crown);
    for (const m of placements) {
      ctx.scene.addChild(ctx.doc.createNode().setMesh(fullMesh).setMatrix(m));
      ctx.scene.addChild(ctx.doc.createNode().setMesh(crownMesh).setMatrix(m));
    }
    treeStats.push({ species, instances: placements.length, tris: full.count, crownTris: crown.count });
  }
  await instanceAll(ctx);

  const quadrants = []; const quadrantSoups = new Map();
  for (const q of [...quads.keys()].sort()) {
    const { ground, solids } = quads.get(q);
    const soup = new Soup(ground.count + solids.count);
    soup.append(ground); soup.append(solids);
    if (!soup.count) continue;
    const name = `quadrant_${q}`;
    ctx.scene.addChild(ctx.doc.createNode(name).setMesh(buildMesh(ctx, name, soup)));
    quadrants.push({ mesh: name, bounds: estateBox(soup), tris: soup.count });
    quadrantSoups.set(name, soup);
  }

  // Ground heights over the ground surfaces' own extent, snapped out to the cell.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let o = 0; o < groundTris.length; o += 3) {
    x0 = Math.min(x0, groundTris[o]); x1 = Math.max(x1, groundTris[o]);
    y0 = Math.min(y0, groundTris[o + 1]); y1 = Math.max(y1, groundTris[o + 1]);
  }
  const lo = [Math.floor(x0 / GROUND_CELL) * GROUND_CELL + 0, Math.floor(y0 / GROUND_CELL) * GROUND_CELL + 0]; // + 0: no −0
  const nx = Math.ceil((x1 - lo[0]) / GROUND_CELL - 1e-9); const ny = Math.ceil((y1 - lo[1]) / GROUND_CELL - 1e-9);
  const heightsCm = rasterGround(groundTris, { cell: GROUND_CELL, lo, nx, ny });
  return { ctx, quadrants, quadrantSoups, trees: treeStats, ground: { cell: GROUND_CELL, lo, nx, ny, heightsCm }, orientation: { flippedUp, flippedGround, flippedSolids, droppedBottoms } };
};
