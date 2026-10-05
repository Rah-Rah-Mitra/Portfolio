import { isEstateSiteId, siteStoreyTag, type EstateSiteId, type EstateStoreyTag } from './ids';

// The assistant's way into the Estate window (plan §9.4). AskThePage applies a
// focusEstate command by opening world-3d through dispatchWorkbenchOpen, then,
// 80 ms later, dispatching this CustomEvent on window. Building ids never go
// into the workbench targetId; they travel only here. The viewer holds a
// request until it is live, and never moves DOM focus for one.
//
// Pure: the constant, the detail type and the validator. Dispatching and
// listening are the components' job, from effects.

export const ESTATE_FOCUS_EVENT = 'portfolio:estate-focus';

export interface EstateFocusDetail {
  site?: EstateSiteId;
  /** Canonical tag, and one that `site` actually has. */
  storey?: EstateStoreyTag;
  /** Walk in rather than fly to the building. */
  enter?: boolean;
}

/**
 * Keeps what can be acted on and drops the rest, one field at a time, so the
 * client and server/pageAgent.mjs' sanitiser agree on every input:
 *  - an unknown site (BLK_599) drops the site, and with it storey and enter —
 *    a storey tag means nothing without its building (L5 exists on 13 of the 14);
 *  - an invalid storey drops only the storey: { site: 'BLK_509', storey: 'L99' }
 *    still flies to Blk 509. 'L05' and 'l5' arrive as 'L5';
 *  - enter survives only as a real boolean ('true' is dropped);
 *  - unknown keys never pass through.
 * Always returns an object, possibly empty, so a listener needs one check: `site`.
 */
export const validateEstateFocus = (detail: unknown): EstateFocusDetail => {
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) return {};
  const input = detail as Record<string, unknown>;
  if (!isEstateSiteId(input.site)) return {};
  const out: EstateFocusDetail = { site: input.site };
  const storey = siteStoreyTag(input.site, input.storey);
  if (storey !== null) out.storey = storey;
  if (typeof input.enter === 'boolean') out.enter = input.enter;
  return out;
};
