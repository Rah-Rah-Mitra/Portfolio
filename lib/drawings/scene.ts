import { decodePolylines, massingOf, type Massing, type Pts, type Rect } from './decode';
import type { Inks } from './ink';
import type { Box } from './occupancy';
import { paintMassing, paintSite, ringPath, viewOf, type Ctx, type View } from './paint';
import { posterInRegion } from './compose';
import { basis, posterPose, project, type Frame, type Pose } from './project';
import type { DrawingPoster, DrawingSite, PolylineData } from './types';

// The estate as one scene (docs/portfolio/desk-drawing-set.md §1): every
// building's massing, the kerbs, the extent, the poster camera — and the aerial
// sheet drawn through that camera, which the cover still (Save-Data, reduced
// motion), the welcome and the film's last act all share. Pure.

export interface Scene {
  sites: readonly DrawingSite[];
  buildings: Massing[];
  kerbs: Pts[];
  extent: Rect;
  poster: DrawingPoster;
  posterPose: Pose;
}

export const sceneOf = (sites: readonly DrawingSite[], kerbs: PolylineData, extent: readonly number[], poster: DrawingPoster): Scene => ({
  sites,
  buildings: sites.map(massingOf),
  kerbs: decodePolylines(kerbs),
  extent: { x0: extent[0] / 100, y0: extent[1] / 100, x1: extent[2] / 100, y1: extent[3] / 100 },
  poster,
  posterPose: posterPose(poster),
});

export interface AerialLayout {
  view: View;
  /** The poster's crop in poster px, or null for the full frame. */
  crop: Box | null;
}

/** A building's box as the poster shows it, poster px. */
export const posterBox = (scene: Scene, id: string): Box => {
  const b = scene.buildings.find((m) => m.id === id) ?? scene.buildings[0];
  const frame: Frame = { x: 0, y: 0, w: scene.poster.w, h: scene.poster.h };
  const bs = basis(scene.posterPose);
  const p = [0, 0];
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  const top = b.ffl[b.ffl.length - 1];
  for (let i = 0; i < b.fp.length; i += 2) {
    for (const z of [0, top]) {
      if (!project(scene.posterPose, bs, frame, b.fp[i], b.fp[i + 1], z, p)) continue;
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/** The aerial sheet in `area`: the whole poster if it fits at 0.4 of its size, else a crop on the hero. */
export const aerialLayout = (scene: Scene, area: Box, hero: string, frame?: Frame): AerialLayout => {
  if (frame) return { view: viewOf(scene.posterPose, frame), crop: null };
  const placed = posterInRegion(area, scene.poster.w, scene.poster.h, posterBox(scene, hero));
  return { view: viewOf(scene.posterPose, placed.frame), crop: placed.crop };
};

export interface AerialOptions {
  hero: string | null;
  context?: number;
  storeys?: boolean;
  zScale?: number;
  cut?: number | null;
  faces?: number;
}

/** The aerial: the ground's lines under the estate's massing, far to near, the hero with its storeys. */
export const paintAerial = (ctx: Ctx, v: View, scene: Scene, inks: Inks, opts: AerialOptions) => {
  const context = opts.context ?? 1;
  paintSite(ctx, v, { extent: scene.extent, kerbs: scene.kerbs, buildings: [] }, inks, { hero: null, context });
  paintMassing(ctx, v, scene.buildings, inks, {
    hero: opts.hero, context, storeys: opts.storeys ?? true, zScale: opts.zScale, cut: opts.cut, faces: opts.faces,
  });
};

/** The site plan's own footprint for one building (estate frame), for its lid and label. */
export const heroFootprint = (scene: Scene, id: string): Pts | null => scene.buildings.find((b) => b.id === id)?.fp ?? null;

/** Strokes a building's footprint ring alone (the welcome's storey rings use paintMassing; this is for marks). */
export const strokeFootprint = (ctx: Ctx, v: View, fp: Pts, z: number) => {
  ctx.beginPath();
  ringPath(ctx, v, fp, z);
  ctx.stroke();
};
