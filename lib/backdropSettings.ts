import type { FluidPreferences, NBodyPreferences } from '../types';

// The desk backgrounds are FX toggles. N-body's and smoke's engine parameters
// used to live in the (retired) appearance system; they live here now, beside the
// effects settings that own them. Both are OFF at boot: the e2e boot state is
// pinned. The third, the Estate drawing set (docs/portfolio/desk-drawing-set.md),
// has no parameters, only its switch.

export const defaultNBodyPreferences: NBodyPreferences = {
  preset: 'galaxy',
  particleCount: 2048,
  timeScale: 1,
  gravity: 1,
  softening: 0.012,
  trailPersistence: 38,
  expansionOrder: 8,
  leafCapacity: 48,
  pointerAttraction: true,
  seed: 41,
  showTree: false,
};

export const defaultFluidPreferences: FluidPreferences = {
  speed: 0.7,
  intensity: 38,
  opacity: 28,
  splatRadius: 28,
  curl: 18,
  quality: 'balanced',
  pointerInteraction: true,
};

export type NBodyEffect = { enabled: boolean } & NBodyPreferences;
export type FluidEffect = { enabled: boolean } & FluidPreferences;

export type DrawingEffect = { enabled: boolean };

export type BackdropSettings = {
  nbody: NBodyEffect;
  fluid: FluidEffect;
  drawing: DrawingEffect;
};

export const defaultBackdropSettings: BackdropSettings = {
  nbody: { enabled: false, ...defaultNBodyPreferences },
  fluid: { enabled: false, ...defaultFluidPreferences },
  drawing: { enabled: false },
};
