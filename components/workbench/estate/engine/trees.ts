// Near and far trees (plan §7.2: per species a full-detail InstancedMesh near
// the camera and an 8-triangle crown InstancedMesh beyond; §7.4's tree radius
// per tier). Pure: the scene hands in each species' instance centres and the
// camera, and copies the partition into its two instance buffers. Nothing here
// allocates per call.

/** Re-partition once the camera has moved this far in plan since the last one, m. */
export const TREE_REPARTITION_M = 2;

export interface TreePartition {
  /** Instance indices drawn full, then those drawn as crowns. */
  readonly near: Uint32Array;
  readonly far: Uint32Array;
  nearCount: number;
  farCount: number;
}

export const createTreePartition = (count: number): TreePartition => ({
  near: new Uint32Array(count),
  far: new Uint32Array(count),
  nearCount: 0,
  farCount: 0,
});

/**
 * Splits instances by plan distance from (cx, cz) (three world x and z; trees
 * stand on the ground, so height does not choose detail). `centres` holds x, z
 * pairs. A radius of 0 (the min tier, or full trees not resident) puts every
 * tree in the far set. Order within each set is the instance order, so the
 * buffers change only when the membership does. Returns whether it changed.
 */
export const partitionTrees = (
  centres: Float32Array, count: number, cx: number, cz: number, radius: number, out: TreePartition,
): boolean => {
  const r2 = radius > 0 ? radius * radius : -1;
  let near = 0;
  let far = 0;
  let changed = false;
  for (let i = 0; i < count; i += 1) {
    const dx = centres[2 * i] - cx;
    const dz = centres[2 * i + 1] - cz;
    if (dx * dx + dz * dz <= r2) {
      if (out.near[near] !== i || near >= out.nearCount) changed = true;
      out.near[near] = i;
      near += 1;
    } else {
      if (out.far[far] !== i || far >= out.farCount) changed = true;
      out.far[far] = i;
      far += 1;
    }
  }
  if (near !== out.nearCount || far !== out.farCount) changed = true;
  out.nearCount = near;
  out.farCount = far;
  return changed;
};

/**
 * Copies the chosen 16-float instance matrices from `source` into the front of
 * `target`, in `indices` order. Returns the number written.
 */
export const gatherMatrices = (source: Float32Array, indices: Uint32Array, count: number, target: Float32Array): number => {
  for (let k = 0; k < count; k += 1) {
    const from = indices[k] * 16;
    const to = k * 16;
    for (let e = 0; e < 16; e += 1) target[to + e] = source[from + e];
  }
  return count;
};
