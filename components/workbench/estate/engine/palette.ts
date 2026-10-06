import {
  Color, DataTexture, FloatType, LinearSRGBColorSpace, NearestFilter, NoColorSpace, RGBAFormat,
} from 'three';
import {
  PALETTE_SIZE, buildPaletteTable, resolveSceneColours, type PaletteSceneKey, type TokenColours,
} from '../../../../lib/estate/palette';

// The one palette on the GPU (plan §7.3, decision C8): a 32×1 RGBA float
// texture, slot i = palette.json's slot i, linear light, built once per engine
// from the design tokens the shell resolved (options.colours). The scene's own
// colours (background, fog, lights, grid) come from the same tokens. No colour
// is written in engine code; a token the shell cannot resolve is an error, not
// a fallback colour.

export interface EnginePalette {
  texture: DataTexture;
  /** The table behind the texture: 32 × RGBA, linear. */
  table: Float32Array;
  scene: Record<PaletteSceneKey, Color>;
}

export const createPalette = (colours: TokenColours): EnginePalette => {
  const table = buildPaletteTable(colours);
  const texture = new DataTexture(table, PALETTE_SIZE, 1, RGBAFormat, FloatType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
  const resolved = resolveSceneColours(colours);
  const scene = {} as Record<PaletteSceneKey, Color>;
  for (const key of Object.keys(resolved) as PaletteSceneKey[]) {
    const [r, g, b] = resolved[key];
    scene[key] = new Color().setRGB(r, g, b, LinearSRGBColorSpace);
  }
  return { texture, table, scene };
};
