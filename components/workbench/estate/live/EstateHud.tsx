import type { EstateHudProps } from '../engineApi';

// The Estate viewer's HUD (plan §8.6): location chip, mode switch, storey strip,
// prompts, progress line and the mirrored Fly-to / Enter, drawn over the stage
// while an engine instance exists. It lives in the lazy chunk beside the engine
// (estate/live/), reached only through estate/loadEngine.ts, so none of it
// weighs on the main bundle. engineApi.ts EstateHudProps is its whole input.
//
// SKELETON: renders nothing until the HUD lands. Rules it will keep: chips are
// opaque --paper-55 tags with a 1 px divider border and square corners, in
// survey-annotation language (no crosshair, minimap or score chrome); the
// smallest text uses --color-neutral-700 and text on solid fills
// --color-accent-700; every pointer action is a button with an accessible name;
// one visually hidden role="status" node takes LocationAnnouncer's text.

export function EstateHud(props: EstateHudProps): null {
  void props;
  return null;
}

export default EstateHud;
