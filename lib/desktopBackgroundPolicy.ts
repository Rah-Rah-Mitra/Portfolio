// Policy for the two desk backdrops (N-body gravity field, fluid smoke) that
// the FX panel switches on behind the desktop workbench. Everything here but
// readBackdropPalette() is pure, so the rules are unit-tested without a DOM.
//
// Two separate questions per engine:
//  - mount:   does the engine exist at all? Only while its FX toggle is on, and
//             only once the device has been allowed heavy assets. After that it
//             keeps its lease (worker / WebGL context) until the toggle goes
//             off, so a policy flip freezes the field instead of tearing it down.
//  - running: is it animating? Never while the page is hidden, the device is on
//             the light policy, or motion is halted (prefers-reduced-motion or
//             "Pause all motion" — lib/motion). A mounted engine that is not
//             running keeps its last frame; one that has never run paints a
//             single still frame, so a visitor who has paused all motion and
//             then switches a backdrop on still sees what they switched on.
//
// Reduced motion and Save-Data already arrive as allowHeavyAssets === false
// (lib/experienceMode), so on those devices a backdrop never mounts at all.
//
// A third hold: the Estate window claims the GPU while it is live and focused
// (lib/gpuClaim.ts), and a mounted backdrop yields — still mounted, not
// running. It is checked last, so every existing reason keeps its precedence.

import type { ExperiencePolicy } from './experienceMode';

export interface BackdropActivityInput {
  enabled: boolean;
  allowHeavyAssets: boolean;
  motionHalted: boolean;
  documentHidden: boolean;
  /** The Estate window holds the GPU (lib/gpuClaim.ts). Optional: absent reads as false. */
  yielded?: boolean;
}

export type BackdropActivityReason = 'off' | 'capability' | 'hidden' | 'motion-halted' | 'yielded' | 'running';

export interface BackdropActivity {
  mount: boolean;
  running: boolean;
  reason: BackdropActivityReason;
}

/** `leased` is whether this engine was mounted on the previous render. */
export const resolveBackdropActivity = (input: BackdropActivityInput, leased: boolean): BackdropActivity => {
  const mount = input.enabled && (input.allowHeavyAssets || leased);
  if (!input.enabled) return { mount: false, running: false, reason: 'off' };
  if (!input.allowHeavyAssets) return { mount, running: false, reason: 'capability' };
  if (input.documentHidden) return { mount, running: false, reason: 'hidden' };
  if (input.motionHalted) return { mount, running: false, reason: 'motion-halted' };
  if (input.yielded === true) return { mount, running: false, reason: 'yielded' };
  return { mount, running: true, reason: 'running' };
};

/**
 * The FX panel's answer to "why is the desk still plain?". On the light policy a
 * backdrop never takes a lease (above), so its toggle would read as on, with live
 * settings, over a desk that draws nothing. Worded like describeAudioPolicy.
 * null when the backdrops may mount, and for the pre-hydration static policy
 * (reason 'default'), which is never what an opened drawer sees.
 */
export const describeBackdropHold = (policy: Pick<ExperiencePolicy, 'allowHeavyAssets' | 'reason'>): string | null => {
  if (policy.allowHeavyAssets) return null;
  switch (policy.reason) {
    case 'query': return 'held: this page was opened with ?mode=scan';
    case 'save-data': return 'held: Data Saver is on';
    case 'reduced-motion': return 'held: your system asks for reduced motion';
    default: return null;
  }
};

/** The FX toggle's line while an enabled backdrop yields to the Estate window. */
export const BACKDROP_YIELD_HOLD = 'held: the Estate window is using the GPU';

// Fluid grid sizes live here rather than in FluidField so the caption in the
// (eagerly loaded) DeskBackdrop can name them without pulling the lazy engine
// chunk into the main bundle.
export const FLUID_GRID = { balanced: 128, high: 192 } as const;
export const FLUID_DYE = { balanced: 768, high: 1024 } as const;
export const FLUID_PRESSURE_ITERATIONS = { balanced: 12, high: 18 } as const;

// ---- palette -------------------------------------------------------------

/** Both engines ink in the accent ramp: --color-accent for thin/halo, --color-accent-700 for dense/core. */
export interface BackdropPalette {
  accent: string;
  accentDeep: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

export const isHexColor = (value: string) => HEX.test(value);

/** '#5980a6' → [0.349, 0.502, 0.651]. Throws on anything but #rrggbb. */
export const hexToRgb = (hex: string): [number, number, number] => {
  if (!HEX.test(hex)) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
};

/**
 * Reads the accent tokens off :root and normalises them to #rrggbb (the N-body
 * worker only accepts that form, and the fluid shader needs numbers). A token
 * written in any other CSS colour syntax is resolved by letting a 2D context
 * parse it — no colour is hard-coded here. Returns null if either token is
 * missing; the backdrop then simply does not paint.
 *
 * Browser-only: call from an effect, never during render (App is prerendered).
 */
export const readBackdropPalette = (): BackdropPalette | null => {
  const styles = getComputedStyle(document.documentElement);
  let probe: CanvasRenderingContext2D | null | undefined;
  const resolve = (token: string): string | null => {
    const raw = styles.getPropertyValue(token).trim();
    if (!raw) return null;
    if (HEX.test(raw)) return raw.toLowerCase();
    if (probe === undefined) probe = document.createElement('canvas').getContext('2d');
    if (!probe) return null;
    // An unparseable value leaves fillStyle unchanged, so reset it to a value
    // that can never pass as #rrggbb first, or a bad token would read as black.
    probe.fillStyle = 'transparent';
    probe.fillStyle = raw;
    const parsed = String(probe.fillStyle);
    return HEX.test(parsed) ? parsed.toLowerCase() : null;
  };
  const accent = resolve('--color-accent');
  const accentDeep = resolve('--color-accent-700');
  return accent && accentDeep ? { accent, accentDeep } : null;
};
