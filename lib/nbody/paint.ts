import { FIELD_SCALE } from './workerProtocol';

// How the N-body field is inked on the light technical ground. Shared by the
// worker (OffscreenCanvas) and the main-thread fallback so both paths draw the
// same picture.
//
// The canvas is TRANSPARENT: the desk's own blueprint grid is the ground, so a
// trail fades toward nothing (destination-out) instead of toward a surface
// colour, and bodies are laid on with plain source-over. The old dark desktop
// filled an opaque #080b0f and added light ('lighter'); on paper that would
// have been a black slab with bodies that saturate to white.

type Ink2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface FieldInk {
  /** --color-accent: the body halo and the quadtree hairlines. */
  accent: string;
  /** --color-accent-700: the body core, so dense regions read as darker steel, not as colour. */
  accentDeep: string;
  /** 0–90: the share of last frame that survives this one. */
  trailPersistence: number;
}

/** Bodies are ink, not light: low alpha keeps a 2048-body galaxy a drawing, not a blot. */
export const BODY_ALPHA = 0.34;
export const TREE_ALPHA = 0.2;
/** The body sprite is painted once into a canvas this many pixels square. */
export const SPRITE_SIZE = 12;
/** Body radius in CSS pixels; multiplied by the backing-store ratio when drawn. */
const BODY_RADIUS = 2.25;

/**
 * Per-frame erase strength. The 0.1 floor matters: with 8-bit alpha a weaker
 * erase stalls before zero (a*(1-f) rounds back to a) and leaves a permanent
 * steel haze wherever the galaxy has ever been.
 */
export const trailFade = (trailPersistence: number) => Math.max(0.1, 1 - trailPersistence / 100);

/** Paints the 12px body sprite: accent-700 core, accent halo, transparent rim. */
export const paintSprite = (context: Ink2D, accent: string, accentDeep: string) => {
  const half = SPRITE_SIZE / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, accentDeep);
  gradient.addColorStop(0.38, accent);
  // The rim is the accent at zero alpha, not 'transparent' (zero-alpha BLACK),
  // which would grey the halo where a browser interpolates unpremultiplied.
  gradient.addColorStop(1, `${accent}00`);
  context.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  context.fillStyle = gradient;
  context.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
};

export interface FieldFrame {
  positions: ArrayLike<number>;
  count: number;
  /** Backing-store size in device pixels. */
  width: number;
  height: number;
  dpr: number;
  sprite: CanvasImageSource;
  /** Optional quadtree leaves as (cx, cy, half) triples in field units. */
  leaves?: { bounds: ArrayLike<number>; count: number };
}

export const paintField = (context: Ink2D, frame: FieldFrame, ink: FieldInk) => {
  const { width, height, dpr } = frame;
  context.globalCompositeOperation = 'destination-out';
  context.globalAlpha = trailFade(ink.trailPersistence);
  context.fillStyle = ink.accent; // any opaque paint: destination-out reads only its alpha
  context.fillRect(0, 0, width, height);

  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = BODY_ALPHA;
  const scale = Math.min(width, height) * FIELD_SCALE;
  const radius = BODY_RADIUS * dpr;
  const cx = width * 0.5;
  const cy = height * 0.5;
  for (let body = 0; body < frame.count; body += 1) {
    const x = cx + frame.positions[body * 2]! * scale;
    const y = cy - frame.positions[body * 2 + 1]! * scale;
    context.drawImage(frame.sprite, x - radius, y - radius, radius * 2, radius * 2);
  }

  if (frame.leaves && frame.leaves.count > 0) {
    // Hairlines: one device pixel, offset half a pixel so they land on the grid.
    context.globalAlpha = TREE_ALPHA;
    context.strokeStyle = ink.accent;
    context.lineWidth = 1;
    context.beginPath();
    for (let leaf = 0; leaf < frame.leaves.count; leaf += 1) {
      const offset = leaf * 3;
      const half = frame.leaves.bounds[offset + 2]! * scale;
      const left = Math.round(cx + frame.leaves.bounds[offset]! * scale - half) + 0.5;
      const top = Math.round(cy - frame.leaves.bounds[offset + 1]! * scale - half) + 0.5;
      context.rect(left, top, Math.round(half * 2), Math.round(half * 2));
    }
    context.stroke();
  }
  context.globalAlpha = 1;
};
