// SITE (plan §6.2 step 6e): four 200 m quadrants of ground, structures and
// furniture; five tree species, each with an 8-triangle crown stand-in,
// instanced; and the outdoor ground heights (class `ground`). SITE's frame is
// the estate's (identity transform), so its glTF is estate Y-up.

import { bakeMesh, buildMesh, instanceAll, meshBox, meshNodesUnder, meshSoup, newDoc } from './gltf.mjs';
import { slotOf } from './palette.mjs';
import { faceUp, orientClosedSolids } from './pure/geom.mjs';
import { Soup } from './pure/soup.mjs';
import { rasterGround } from './pure/sn5w.mjs';

export const QUADRANT = 200;
export const GROUND_CELL = 0.5;

const speciesName = (node) => (node.getExtras()?.type ?? node.getMesh().getName()).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

// An octahedron (8 triangles) filling a local box: the far-tree crown.
const crownSoup = ([lo, hi], slot) => {
  const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const px = [hi[0], c[1], c[2]], nx = [lo[0], c[1], c[2]];
  const py = [c[0], hi[1], c[2]], ny = [c[0], lo[1], c[2]];
  const pz = [c[0], c[1], hi[2]], nz = [c[0], c[1], lo[2]];
  const s = new Soup(8);
  for (const [a, b, d] of [[px, py, pz], [py, nx, pz], [nx, ny, pz], [ny, px, pz], [py, px, nz], [nx, py, nz], [ny, nx, nz], [px, ny, nz]]) s.push(...a, ...b, ...d, slot, 0);
  return s;
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
  let flippedUp = 0; let flippedSolids = 0;
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
      if (node === tile) continue;
      if (name.endsWith('_ground')) bakeMesh(node.getMesh(), node.getWorldMatrix(), quad.ground);
      else bakeMesh(node.getMesh(), node.getWorldMatrix(), quad.solids);
    }
  }
  for (const quad of quads.values()) {
    flippedUp += faceUp(quad.ground);
    flippedSolids += orientClosedSolids(quad.solids).flipped;
    const p = quad.ground.pos;
    for (let o = 0; o < quad.ground.count * 9; o += 3) groundTris.push(p[o], -p[o + 2], p[o + 1]);
  }
  if (flippedUp) warn(`SITE: turned ${flippedUp} downward-facing ground triangles up`);
  if (flippedSolids) warn(`SITE: flipped ${flippedSolids} inside-out closed solids`);

  const ctx = newDoc();
  // Trees first: instanceAll batches every node present.
  const treeStats = [];
  for (const species of [...trees.keys()].sort()) {
    const { mesh, placements } = trees.get(species);
    const full = meshSoup(mesh, {});
    const foliage = meshBox(mesh, (m) => m === 'Foliage') ?? meshBox(mesh);
    const crown = crownSoup(foliage, slotOf('Foliage'));
    const fullMesh = buildMesh(ctx, `tree_${species}`, full);
    const crownMesh = buildMesh(ctx, `crown_${species}`, crown);
    for (const m of placements) {
      ctx.scene.addChild(ctx.doc.createNode().setMesh(fullMesh).setMatrix(m));
      ctx.scene.addChild(ctx.doc.createNode().setMesh(crownMesh).setMatrix(m));
    }
    treeStats.push({ species, instances: placements.length, tris: full.count, crownTris: crown.count });
  }
  await instanceAll(ctx);

  const quadrants = [];
  for (const q of [...quads.keys()].sort()) {
    const { ground, solids } = quads.get(q);
    const soup = new Soup(ground.count + solids.count);
    soup.append(ground); soup.append(solids);
    if (!soup.count) continue;
    const name = `quadrant_${q}`;
    ctx.scene.addChild(ctx.doc.createNode(name).setMesh(buildMesh(ctx, name, soup)));
    quadrants.push({ mesh: name, bounds: estateBox(soup), tris: soup.count });
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
  return { ctx, quadrants, trees: treeStats, ground: { cell: GROUND_CELL, lo, nx, ny, heightsCm } };
};
