// The Estate's light and its toon bands (materials.ts). Pure: numbers in, numbers out.
//
// The engine lights every surface with a hemisphere light (sky to ground) and
// one sun, both physical (three r155+): a Lambert face of albedo a under
// irradiance E shows a·E/π, so intensities carry a π that BRDF_Lambert's 1/π
// cancels. With flat shading and no other light, the lit colour is constant over
// each face: albedo × lightRatio(normal). The intensities are set so an
// up-facing face reads at about its token's own value.
//
// Toon shading replaces that ratio with three flat bands. The cuts sit halfway
// between reference faces of an axis-aligned block: the roof, the wall facing
// the sun's azimuth, a wall 45° off it (what most lit walls are close to) and
// the wall facing away. The top band is 1.0, so a roof shows exactly its token;
// the two lower bands keep the lit faces' ratios to the roof.

export type Rgb = readonly [number, number, number];
export type Normal = readonly [number, number, number];

/** The light rig (three world, Y up): hemisphere and sun intensities without their π, and where the sun comes from. */
export const ESTATE_LIGHT = Object.freeze({
  hemisphere: 0.62,
  sun: 0.48,
  sunDirection: Object.freeze([-0.4, 0.8, 0.45] as const),
});
export type EstateLight = typeof ESTATE_LIGHT;

/** Rec. 709 luminance of a linear colour (what the shader divides by). */
export const luma = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const unit = (v: readonly number[]): [number, number, number] => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

/**
 * The lit colour's luminance over an albedo's, for a face with this unit
 * normal: hemisphere · mix(ground, sky, ½·n_y + ½) + sun · max(0, n·l) · sky
 * (the sun is the sky's colour, materials.ts), as three's Lambert computes it.
 */
export const lightRatio = (normal: Normal, sky: Rgb, ground: Rgb, light: EstateLight = ESTATE_LIGHT): number => {
  const l = unit(light.sunDirection);
  const t = 0.5 * normal[1] + 0.5;
  const sun = Math.max(0, normal[0] * l[0] + normal[1] * l[1] + normal[2] * l[2]);
  const e: Rgb = [0, 1, 2].map((i) => light.hemisphere * (ground[i] + (sky[i] - ground[i]) * t) + light.sun * sun * sky[i]) as unknown as Rgb;
  return luma(e);
};

export interface ToonBands {
  /** A face at or above cuts[0] is lit (×1), at or above cuts[1] mid (×levels[0]), else shade (×levels[1]). */
  readonly cuts: readonly [number, number];
  readonly levels: readonly [number, number];
}

/** The reference faces' normals: roof, sun wall, a wall 45° off the sun, the wall away from it. */
export const referenceNormals = (light: EstateLight = ESTATE_LIGHT): Readonly<Record<'roof' | 'sun' | 'oblique' | 'shade', Normal>> => {
  const [x, , z] = light.sunDirection;
  const a = Math.atan2(z, x);
  const wall = (angle: number): Normal => [Math.cos(angle), 0, Math.sin(angle)];
  return { roof: [0, 1, 0], sun: wall(a), oblique: wall(a + Math.PI / 4), shade: wall(a + Math.PI) };
};

/** The two cuts and two lower levels for this sky and ground (linear colours). */
export const toonBands = (sky: Rgb, ground: Rgb, light: EstateLight = ESTATE_LIGHT): ToonBands => {
  const n = referenceNormals(light);
  const roof = lightRatio(n.roof, sky, ground, light);
  const sun = lightRatio(n.sun, sky, ground, light);
  const oblique = lightRatio(n.oblique, sky, ground, light);
  const shade = lightRatio(n.shade, sky, ground, light);
  return {
    cuts: [(roof + sun) / 2, (oblique + shade) / 2],
    levels: [oblique / roof, shade / roof],
  };
};
