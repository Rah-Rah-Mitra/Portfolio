// Palette slots for the pack, read straight from lib/estate/palette.json, the
// one palette (decision C8). The lookup mirrors lib/estate/palette.ts
// paletteSlot/extraSlot; tests/estate-pipeline-pure.test.ts checks every
// material in both contexts against the TypeScript module.

import palette from '../../../lib/estate/palette.json' with { type: 'json' };

export const PALETTE = palette;

const BY_NAME = new Map(palette.materials.map((m) => [m.material, m]));

/** The slot for an upstream material; 'interior' swaps in an extra standing in for it (Glass → glass-interior). Throws on an unknown name. */
export const slotOf = (material, context = 'exterior') => {
  const entry = BY_NAME.get(material);
  if (!entry) throw new Error(`Unknown estate material "${material}": map it in lib/estate/palette.json`);
  if (context === 'interior') {
    const swap = palette.extras.find((e) => e.interiorOf === material);
    if (swap) return swap.slot;
  }
  return entry.slot;
};

export const extraSlot = (key) => {
  const extra = palette.extras.find((e) => e.key === key);
  if (!extra) throw new Error(`No palette extra "${key}"`);
  return extra.slot;
};

/** Whether a slot draws as glass (transparent) inside a building. */
export const GLASS_SLOT = slotOf('Glass');
export const GLASS_INTERIOR_SLOT = slotOf('Glass', 'interior');
export const EDGE_SLOT = extraSlot('edge');

/** pack.json `palette`: every material with its slot, role, token and source colour. */
export const packPalette = () => palette.materials.map((m) => ({ slot: m.slot, material: m.material, role: m.role, token: m.token, source: m.sourceRGBA }));
