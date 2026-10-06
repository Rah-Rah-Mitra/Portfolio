// The far tree (plan §6.2 step 6e, §7.2): what a species draws beyond the
// tier's tree radius, instanced exactly where the full tree stands. Imports
// only a sibling pure module.
//
// It was an 8-triangle octahedron over the foliage box alone, which hung 2.0 to
// 4.3 m above the ground (where each species' crown starts) with nothing under
// it, so past the tree radius the estate's 778 trees floated. Now the crown sits
// on a trunk stub: the same octahedron, plus a four-sided spike standing on the
// bark box's footprint at the ground and ending at the centre of the bark box's
// top, which on every species lies inside the crown (the octahedron is 0.6 to
// 0.96 m wide either side of its axis at that height), so the stub runs up into
// the crown through its lower tip without a gap. 12 triangles, the top of the plan's
// 8–12 range: 778 × 4 more than the bare crown, 3,112 triangles at most, and
// only when every tree is far (the poster pose, or the min tier, whose tree
// radius is 0). The spike has no base: it stands in the ground.

import { Soup } from './soup.mjs';

/** Triangles in a far tree: an 8-triangle crown and a 4-triangle trunk stub. */
export const FAR_TREE_TRIS = 12;

/**
 * A far tree in the tree mesh's own frame (glTF Y-up, y = 0 at its foot), from
 * the local [min, max] boxes of its foliage and bark: an octahedron filling the
 * foliage box, and a square spike from the bark box's bottom corners to the
 * centre of its top. Every face is wound counter-clockwise seen from outside
 * (front faces, as the runtime draws them).
 */
export const farTreeSoup = (foliage, bark, foliageSlot, barkSlot) => {
  const [lo, hi] = foliage;
  const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const px = [hi[0], c[1], c[2]], nx = [lo[0], c[1], c[2]];
  const py = [c[0], hi[1], c[2]], ny = [c[0], lo[1], c[2]];
  const pz = [c[0], c[1], hi[2]], nz = [c[0], c[1], lo[2]];
  const s = new Soup(FAR_TREE_TRIS);
  for (const [a, b, d] of [[px, py, pz], [py, nx, pz], [nx, ny, pz], [ny, px, pz], [py, px, nz], [nx, py, nz], [ny, nx, nz], [px, ny, nz]]) s.push(...a, ...b, ...d, foliageSlot, 0);
  const [blo, bhi] = bark;
  const top = [(blo[0] + bhi[0]) / 2, bhi[1], (blo[2] + bhi[2]) / 2];
  // The bark box's bottom corners, counter-clockwise seen from above (+y).
  const base = [[blo[0], blo[1], blo[2]], [blo[0], blo[1], bhi[2]], [bhi[0], blo[1], bhi[2]], [bhi[0], blo[1], blo[2]]];
  for (let i = 0; i < 4; i += 1) s.push(...base[i], ...base[(i + 1) % 4], ...top, barkSlot, 0);
  return s;
};
