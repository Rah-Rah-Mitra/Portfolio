// One quantisation grid for a building's whole interior file (plan §6.2 steps
// 6d and 8). Imports nothing.
//
// T is stored relative to its floor and drawn once per typical storey at
// T(0, FFL, 0); R and the specials are stored where they stand. Where a face
// of upstream's chunk is split between T and R (its triangulation differs on
// some storeys, so part of it is not common to all), the two meshes share the
// face's inner edges. Quantised on two grids — one per mesh, each fitted to
// its own bounds, gltf-transform's default — the copies of a shared vertex
// landed up to 2.5 mm apart (rc2b: every one of the 33,254 shared vertices of
// the 13 buildings with a T, 0.4–2.5 mm), and the edges opened into the dotted
// line seen at BLK 509's L5 window heads.
//
// The fix puts every mesh of the file on one lattice: one origin, one step,
// with the step s = pitch / n for an integer n, so that every FFL (upstream
// writes them on a 0.1 m pitch) is a whole number of steps. T placed at any
// typical floor then lands on R's lattice, and a vertex quantises to the same
// point in both. n is a multiple of 4: with coordinates on whole millimetres
// and the origin on the pitch, (x − origin) / s = k·n / 100 for an integer k,
// whose fraction is then a multiple of 0.04 and never within 0.02 of a half —
// so float32 noise in the encoder (~0.002 of a step) cannot round T's copy
// and R's copy of one vertex to different points.

/** Every FFL upstream writes is a multiple of this, m (checked per building: offPitch). */
export const GRID_PITCH = 0.1;
/** n ≡ 0 (mod 4): see the header. */
export const GRID_MULTIPLE = 4;

/**
 * The lattice for a box [lo, hi] (every vertex of every mesh of the file, in
 * the frames they are stored in) at `bits` signed-normalised bits: origin on
 * the pitch nearest the box's centre, step = pitch / n with n the largest
 * multiple of GRID_MULTIPLE whose range (step × (2^(bits−1) − 1) either side)
 * still covers the box plus `margin`. `scale` is that range, the node scale
 * KHR_mesh_quantization gives the mesh.
 * Returns { origin: [x, y, z], step, scale, n }.
 */
export const interiorGrid = (lo, hi, { bits = 16, pitch = GRID_PITCH, multiple = GRID_MULTIPLE, margin = 1e-3 } = {}) => {
  const levels = 2 ** (bits - 1) - 1;
  const origin = [0, 1, 2].map((k) => Math.round((lo[k] + hi[k]) / 2 / pitch) * pitch);
  const half = Math.max(...[0, 1, 2].map((k) => Math.max(hi[k] - origin[k], origin[k] - lo[k]))) + margin;
  const n = Math.floor((pitch * levels) / (half * multiple)) * multiple;
  if (!(n >= multiple)) throw new Error(`a ${(2 * half).toFixed(1)} m interior does not fit a ${bits}-bit lattice on a ${pitch} m pitch`);
  const step = pitch / n;
  return { origin, step, scale: step * levels, n };
};

/** The heights not on the pitch (within 1 µm): a typical storey there could not put T on R's lattice. */
export const offPitch = (heights, pitch = GRID_PITCH) => heights.filter((h) => Math.abs(h / pitch - Math.round(h / pitch)) * pitch > 1e-6);

/**
 * How far a decoded point lies off the lattice, in steps (the largest axis),
 * after `dy` is added to its y (a typical storey's FFL, for T).
 */
export const offLattice = (grid, x, y, z, dy = 0) => {
  let worst = 0;
  const c = [x, y + dy, z];
  for (let k = 0; k < 3; k += 1) {
    const q = (c[k] - grid.origin[k]) / grid.step;
    worst = Math.max(worst, Math.abs(q - Math.round(q)));
  }
  return worst;
};
