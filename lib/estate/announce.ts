import type { EstateViewMode } from './frames';
import { ESTATE_NAME, siteKindOf, type EstateSiteId, type EstateStoreyTag } from './ids';

// The location chip and the live region behind it (plan §8.6, §8.7, §12.6).
// Pure: the engine reports where the camera is, this decides what to show and
// when to speak, and the HUD only writes strings into two nodes.
//
// Two texts, because a screen reader should not hear every room a walker
// crosses, while a sighted visitor should always see where they are:
//  - chipText(), the visible chip, current on every update:
//      BLK 509 · L5 · #05-104 · LIVING / DINING · WALK
//  - the announcer's `speak`, for a separate visually hidden role="status" node:
//      "Blk 509, level 5", then "Unit 05-104, Living / Dining" once settled.
// A chip that was itself role="status" would speak every change and undo the
// rules below.
//
// When to speak:
//  - a building, storey or mode change: at once;
//  - a room (or flat) change: only after ROOM_SETTLE_MS standing still in that
//    room, so walking through five rooms says nothing and stopping in the sixth
//    names it. A new building or storey makes its room news again;
//  - automatic announcements keep ANNOUNCE_GAP_MS apart. A change inside the
//    gap waits for its end and is coalesced into the state at that time, so
//    1-2-3 pressed quickly says "Fly mode" once, and A → B → A says nothing;
//  - full() (the I key) and say() (lift arrivals, Plan room picks, refusals)
//    speak at once: the visitor asked, or an event happened.
// The engine renders only on change (§7.8), so nothing calls back on its own:
// each result carries `dueMs`, the time to call tick() for whatever is waiting.
//
// Times are milliseconds on one clock (performance.now). Building names are the
// manifest's own (model/estate_manifest.json sites[].name, v1.1), the ones
// PackBuilding.name carries; room labels are the engine data's `room` field.

/** Standing still this long in a room before it is announced. */
export const ROOM_SETTLE_MS = 1500;
/** Minimum spacing of automatic announcements. */
export const ANNOUNCE_GAP_MS = 1000;

export interface EstateLocation {
  /** The building the camera is in or framing; null on the open estate. */
  site: EstateSiteId | null;
  /** The storey under the walker, or the one Plan shows; null otherwise. */
  storey: EstateStoreyTag | null;
  /** The flat as the data spells it, '#05-104'; null outside a flat. */
  unit: string | null;
  /** The room's `room` label: 'Living / Dining', 'Hawker stall #01-14', 'Car lot L2-008 (S)'; null for none. */
  room: string | null;
  mode: EstateViewMode;
}

const SEP = ' · ';
const NBSP = ' ';
const MODE_CHIP: Readonly<Record<EstateViewMode, string>> = { overview: 'OVERVIEW', plan: 'PLAN', walk: 'WALK', fly: 'FLY' };

/** 'BLK_509' → 'BLK 509', 'MSCP_513' → 'MSCP 513', 'NC_514' → 'NC 514'. */
export const siteChipLabel = (site: EstateSiteId): string => site.replace('_', ' ');

/** 'Blk 509', 'Multi-storey car park 513', 'Sample Town N5 neighbourhood centre'. */
export const siteSpokenName = (site: EstateSiteId): string => {
  const kind = siteKindOf(site);
  if (kind === 'block') return `Blk ${site.slice('BLK_'.length)}`;
  if (kind === 'mscp') return `Multi-storey car park ${site.slice('MSCP_'.length)}`;
  return `${ESTATE_NAME} neighbourhood centre`;
};

/** 'L5' → 'level 5', 'RF' → 'roof'. */
export const storeySpoken = (tag: EstateStoreyTag): string => (tag === 'RF' ? 'roof' : `level ${tag.slice(1)}`);

// '#05-104' → 'unit 05-104': how the address is said, rather than "number 05 dash 104".
const unitSpoken = (unit: string): string => `unit ${unit.startsWith('#') ? unit.slice(1) : unit}`;
const modeSpoken = (mode: EstateViewMode): string => `${mode} mode`;
const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
// An empty label is no label.
const label = (text: string | null): string | null => (text === null || text === '' ? null : text);

/** The visible chip: every part present, in survey-annotation capitals. */
export const chipText = (loc: EstateLocation): string => {
  let text = loc.site === null ? ESTATE_NAME.toUpperCase() : siteChipLabel(loc.site);
  if (loc.storey !== null) text += SEP + loc.storey;
  const unit = label(loc.unit);
  if (unit !== null) text += SEP + unit;
  const room = label(loc.room);
  if (room !== null) text += SEP + room.toUpperCase();
  return text + SEP + MODE_CHIP[loc.mode];
};

/** The full location as a sentence, for the I key: "Blk 509, level 5, unit 05-104, Living / Dining, walk mode". */
export const spokenLocation = (loc: EstateLocation): string => {
  const parts = [loc.site === null ? ESTATE_NAME : siteSpokenName(loc.site)];
  if (loc.storey !== null) parts.push(storeySpoken(loc.storey));
  const unit = label(loc.unit);
  if (unit !== null) parts.push(unitSpoken(unit));
  const room = label(loc.room);
  if (room !== null) parts.push(room);
  parts.push(modeSpoken(loc.mode));
  return capitalise(parts.join(', '));
};

export interface AnnounceResult {
  /** Write this into the live region now, or null to leave it as it is. */
  speak: string | null;
  /** When to call tick() for an announcement still waiting (same clock), or null for none. */
  dueMs: number | null;
}

// `undefined` for unit and room means "not yet heard on this storey": a new
// building or storey makes its room news even when the label repeats (every
// storey has a "Common corridor"). `mode: null` means nothing heard at all.
interface Place {
  site: EstateSiteId | null;
  storey: EstateStoreyTag | null;
  unit: string | null | undefined;
  room: string | null | undefined;
  mode: EstateViewMode | null;
}

const blank = (): Place => ({ site: null, storey: null, unit: null, room: null, mode: null });

const assign = (to: Place, from: EstateLocation): void => {
  to.site = from.site;
  to.storey = from.storey;
  to.unit = label(from.unit);
  to.room = label(from.room);
  to.mode = from.mode;
};

/**
 * One per viewer. update() whenever the location or the moving flag changes
 * (moving: the walker or camera moved this frame), tick() at `dueMs`. The
 * returned object is reused by every call: read it before the next one. A call
 * that changes nothing allocates nothing.
 */
export class LocationAnnouncer {
  private readonly current = blank();
  private readonly heard = blank();
  private stillSince: number | null = null;
  private roomSince = 0;
  private lastSpoke = -Infinity;
  private via: string | null = null;
  private lastText: string | null = null;
  private padded = false;
  private readonly result: AnnounceResult = { speak: null, dueMs: null };

  /**
   * `via` prefixes the storey announcement this change causes, so a lift ride
   * is one utterance, "Lift 2, level 12", rather than the HUD's and then ours.
   */
  update(loc: EstateLocation, moving: boolean, nowMs: number, via?: string): AnnounceResult {
    const cur = this.current;
    if (cur.mode === null || label(loc.unit) !== cur.unit || label(loc.room) !== cur.room) this.roomSince = nowMs;
    assign(cur, loc);
    if (via !== undefined) this.via = label(via);
    if (moving) this.stillSince = null;
    else if (this.stillSince === null) this.stillSince = nowMs;
    return this.decide(nowMs);
  }

  /** The timer's call at `dueMs`: the same decision with nothing new. */
  tick(nowMs: number): AnnounceResult {
    return this.current.mode === null ? this.out(null, null) : this.decide(nowMs);
  }

  /** The I key: everything, now, past the gap; afterwards nothing is pending. */
  full(nowMs: number): AnnounceResult {
    const cur = this.current;
    if (cur.mode === null) return this.out(null, null);
    Object.assign(this.heard, cur);
    this.via = null;
    return this.out(this.emit(spokenLocation(cur as EstateLocation), nowMs), null);
  }

  /** An event message ("Lift 2, level 12" without a storey change, a Plan room, a refusal), now. */
  say(text: string, nowMs: number): AnnounceResult {
    return this.out(this.emit(text, nowMs), this.due(nowMs));
  }

  /** Forget everything. With a location, take it as already heard, so going live says nothing. */
  reset(loc: EstateLocation | null = null): void {
    Object.assign(this.current, blank());
    Object.assign(this.heard, blank());
    if (loc !== null) {
      assign(this.current, loc);
      assign(this.heard, loc);
    }
    this.stillSince = null;
    this.roomSince = 0;
    this.lastSpoke = -Infinity;
    this.via = null;
    this.lastText = null;
    this.padded = false;
  }

  private settledAt(): number {
    return this.stillSince === null ? Infinity : Math.max(this.stillSince, this.roomSince) + ROOM_SETTLE_MS;
  }

  private decide(nowMs: number): AnnounceResult {
    const cur = this.current;
    const heard = this.heard;
    // Nothing heard yet: the first announcement names the place even when it is the open estate.
    const fresh = heard.mode === null;
    const siteChanged = fresh || cur.site !== heard.site;
    const placeChanged = siteChanged || cur.storey !== heard.storey;
    const modeChanged = cur.mode !== heard.mode;
    if (!placeChanged) this.via = null;
    const unitChanged = cur.unit !== heard.unit;
    const roomReady = (unitChanged || cur.room !== heard.room) && this.settledAt() <= nowMs;
    if ((!placeChanged && !modeChanged && !roomReady) || nowMs < this.lastSpoke + ANNOUNCE_GAP_MS) {
      return this.out(null, this.due(nowMs));
    }

    const parts: string[] = [];
    if (placeChanged) {
      if (this.via !== null) parts.push(this.via);
      if (siteChanged) parts.push(cur.site === null ? ESTATE_NAME : siteSpokenName(cur.site));
      if (cur.storey !== null) parts.push(storeySpoken(cur.storey));
    }
    if (roomReady) {
      if (unitChanged && cur.unit) parts.push(unitSpoken(cur.unit));
      if (cur.room) parts.push(cur.room);
    }
    if (modeChanged && cur.mode !== null) parts.push(modeSpoken(cur.mode));

    heard.site = cur.site;
    heard.storey = cur.storey;
    heard.mode = cur.mode;
    if (roomReady) {
      heard.unit = cur.unit;
      heard.room = cur.room;
    } else if (placeChanged) {
      heard.unit = undefined;
      heard.room = undefined;
    }
    this.via = null;
    // A change with nothing to say (left a storey for the open air in the same
    // mode, settled where there is no room) is taken as heard, silently.
    const speak = parts.length === 0 ? null : this.emit(capitalise(parts.join(', ')), nowMs);
    return this.out(speak, this.due(nowMs));
  }

  private due(nowMs: number): number | null {
    const cur = this.current;
    const heard = this.heard;
    if (cur.mode === null) return null;
    const gapEnd = this.lastSpoke + ANNOUNCE_GAP_MS;
    let due = Infinity;
    if (cur.site !== heard.site || cur.storey !== heard.storey || cur.mode !== heard.mode) due = Math.max(nowMs, gapEnd);
    if (cur.unit !== heard.unit || cur.room !== heard.room) due = Math.min(due, Math.max(this.settledAt(), gapEnd));
    return due === Infinity ? null : due;
  }

  // A live region speaks only when its text changes, so the same words twice in
  // a row (I pressed again, the same room re-entered) alternate a trailing
  // no-break space, which changes the node without changing what is said.
  private emit(text: string, nowMs: number): string {
    this.padded = text === this.lastText ? !this.padded : false;
    this.lastText = text;
    this.lastSpoke = nowMs;
    return this.padded ? text + NBSP : text;
  }

  private out(speak: string | null, dueMs: number | null): AnnounceResult {
    this.result.speak = speak;
    this.result.dueMs = dueMs;
    return this.result;
  }
}
