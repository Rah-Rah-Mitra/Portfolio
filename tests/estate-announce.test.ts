import { describe, expect, it } from 'vitest';
import {
  ANNOUNCE_GAP_MS, LocationAnnouncer, ROOM_SETTLE_MS, chipText, siteChipLabel, siteShortName, siteSpokenName,
  spokenLocation, storeySpoken, type EstateLocation,
} from '../lib/estate/announce';
import { ESTATE_NAME, ESTATE_SITE_IDS } from '../lib/estate/ids';

// Plan §8.6 (the location chip and lib/estate/announce.ts), §10.2 and §12.6:
// NVDA hears building, storey and mode changes, and a room only once the
// walker has stood in it for 1.5 s; I speaks the whole location. Room labels
// below are the engine data's own `room` values (BLK_509, MSCP_513, NC_514).

const at = (over: Partial<EstateLocation> = {}): EstateLocation => ({
  site: 'BLK_509', storey: 'L5', unit: '#05-104', room: 'Living / Dining', mode: 'walk', ...over,
});
const CORRIDOR = at({ unit: null, room: 'Common corridor' });

// Each call returns the announcer's reused result, so copy it before the next.
const said = (r: { speak: string | null; dueMs: number | null }) => ({ speak: r.speak, dueMs: r.dueMs });
const primed = (loc: EstateLocation) => {
  const a = new LocationAnnouncer();
  a.reset(loc);
  return a;
};

describe('estate location chip', () => {
  it('reads like the plan\'s example', () => {
    expect(chipText(at({ room: 'Living room' }))).toBe('BLK 509 · L5 · #05-104 · LIVING ROOM · WALK');
    expect(chipText(at())).toBe('BLK 509 · L5 · #05-104 · LIVING / DINING · WALK');
  });

  it('drops the parts a mode or place does not have', () => {
    expect(chipText({ site: 'BLK_509', storey: null, unit: null, room: null, mode: 'overview' })).toBe('BLK 509 · OVERVIEW');
    expect(chipText({ site: null, storey: null, unit: null, room: null, mode: 'fly' })).toBe('SAMPLE TOWN N5 · FLY');
    expect(chipText({ site: 'BLK_512', storey: 'L3', unit: null, room: null, mode: 'plan' })).toBe('BLK 512 · L3 · PLAN');
    expect(chipText(at({ storey: 'RF', unit: null, room: 'Roof deck' }))).toBe('BLK 509 · RF · ROOF DECK · WALK');
    expect(chipText(at({ unit: '', room: '' }))).toBe('BLK 509 · L5 · WALK');
  });

  it('labels the car park and the hawker centre from their ids', () => {
    expect(chipText({ site: 'MSCP_513', storey: 'L3', unit: null, room: 'Car lot L3-054 (R2)', mode: 'walk' }))
      .toBe('MSCP 513 · L3 · CAR LOT L3-054 (R2) · WALK');
    expect(chipText({ site: 'NC_514', storey: 'L1', unit: null, room: 'Hawker stall #01-14', mode: 'walk' }))
      .toBe('NC 514 · L1 · HAWKER STALL #01-14 · WALK');
    for (const id of ESTATE_SITE_IDS) expect(siteChipLabel(id)).toBe(id.replace('_', ' '));
  });
});

describe('estate spoken location', () => {
  it('says the full location as a sentence', () => {
    expect(spokenLocation(at())).toBe('Blk 509, level 5, unit 05-104, Living / Dining, walk mode');
    expect(spokenLocation({ site: null, storey: null, unit: null, room: null, mode: 'overview' })).toBe('Sample Town N5, overview mode');
    expect(spokenLocation({ site: 'NC_514', storey: 'RF', unit: null, room: null, mode: 'fly' }))
      .toBe('Sample Town N5 neighbourhood centre, roof, fly mode');
  });

  it('uses the manifest\'s building names (model/estate_manifest.json sites[].name, v1.1)', () => {
    const manifest = [
      'Blk 501', 'Blk 502', 'Blk 503', 'Blk 504', 'Blk 505', 'Blk 506', 'Blk 507', 'Blk 508', 'Blk 509', 'Blk 510',
      'Blk 511', 'Blk 512', 'Multi-storey car park 513', 'Sample Town N5 neighbourhood centre',
    ];
    expect(ESTATE_SITE_IDS.map(siteSpokenName)).toEqual(manifest);
    expect(ESTATE_NAME).toBe('Sample Town N5');
  });

  it('gives buttons a short name: blocks as spoken, the car park and the hawker centre shorter (Enter / Exit labels)', () => {
    expect(siteShortName('BLK_509')).toBe('Blk 509');
    expect(siteShortName('MSCP_513')).toBe('Car park 513');
    expect(siteShortName('NC_514')).toBe('Hawker centre');
    for (const site of ESTATE_SITE_IDS) expect(siteShortName(site).length).toBeLessThanOrEqual(13);
  });

  it('says storeys as levels, and RF as the roof', () => {
    expect(storeySpoken('L1')).toBe('level 1');
    expect(storeySpoken('L25')).toBe('level 25');
    expect(storeySpoken('RF')).toBe('roof');
  });
});

describe('estate announcer: what is announced at once', () => {
  it('names the place and mode on the first location, then the room once settled', () => {
    const a = new LocationAnnouncer();
    const voidDeck = at({ storey: 'L1', unit: null, room: 'Void deck' });
    expect(said(a.update(voidDeck, false, 0))).toEqual({ speak: 'Blk 509, level 1, walk mode', dueMs: ROOM_SETTLE_MS });
    expect(said(a.tick(ROOM_SETTLE_MS))).toEqual({ speak: 'Void deck', dueMs: null });
  });

  it('announces a building change at once', () => {
    const a = primed({ site: 'BLK_509', storey: null, unit: null, room: null, mode: 'overview' });
    expect(a.update({ site: 'BLK_510', storey: null, unit: null, room: null, mode: 'overview' }, true, 0).speak).toBe('Blk 510');
    expect(a.update({ site: 'MSCP_513', storey: null, unit: null, room: null, mode: 'overview' }, true, 5_000).speak)
      .toBe('Multi-storey car park 513');
  });

  it('announces a storey change at once, whatever the walker is doing', () => {
    const a = primed(CORRIDOR);
    expect(said(a.update({ ...CORRIDOR, storey: 'L6' }, true, 0))).toEqual({ speak: 'Level 6', dueMs: null });
  });

  it('announces a mode change at once', () => {
    const a = primed(CORRIDOR);
    expect(a.update({ ...CORRIDOR, mode: 'fly' }, false, 0).speak).toBe('Fly mode');
  });

  it('says only the mode when Esc takes Walk back to Overview', () => {
    const a = primed(at({ room: 'Kitchen' }));
    expect(a.update({ site: 'BLK_509', storey: null, unit: null, room: null, mode: 'overview' }, true, 0).speak).toBe('Overview mode');
  });

  it('combines what changed together into one utterance', () => {
    // Enter from Overview: building, storey and mode at once.
    const a = primed({ site: null, storey: null, unit: null, room: null, mode: 'overview' });
    expect(a.update(at({ storey: 'L1', unit: null, room: 'Void deck' }), true, 0).speak).toBe('Blk 509, level 1, walk mode');
  });

  it('names the open estate when the walker leaves a building', () => {
    const a = primed(at({ storey: 'L1', unit: null, room: 'Void deck' }));
    expect(a.update({ site: null, storey: null, unit: null, room: null, mode: 'walk' }, true, 0).speak).toBe('Sample Town N5');
  });

  it('phrases a lift ride as one utterance', () => {
    const a = primed(at({ unit: null, room: 'Lift lobby' }));
    expect(said(a.update(at({ storey: 'L12', unit: null, room: 'Lift lobby' }), false, 0, 'Lift 2')))
      .toEqual({ speak: 'Lift 2, level 12', dueMs: ROOM_SETTLE_MS });
    // The lobby is news on a new storey, once the visitor has stood in it.
    expect(a.tick(ROOM_SETTLE_MS).speak).toBe('Lift lobby');
    // A `via` with no storey change is dropped, not saved for the next one.
    a.update(at({ storey: 'L12', unit: null, room: 'Lift lobby' }), false, 5_000, 'Lift 2');
    expect(a.update(at({ storey: 'L13', unit: null, room: 'Lift lobby' }), true, 9_000).speak).toBe('Level 13');
  });
});

describe('estate announcer: rooms wait for 1.5 s standing still', () => {
  it('says nothing while walking through rooms, then names the one stood in', () => {
    const a = primed(at({ room: 'Foyer' }));
    for (const [t, room] of [[0, 'Living / Dining'], [400, 'Kitchen'], [800, 'Service Yard']] as const) {
      expect(said(a.update(at({ room }), true, t)), room).toEqual({ speak: null, dueMs: null });
    }
    // Stops in the service yard at 1.2 s.
    expect(said(a.update(at({ room: 'Service Yard' }), false, 1_200))).toEqual({ speak: null, dueMs: 1_200 + ROOM_SETTLE_MS });
    expect(a.tick(1_200 + ROOM_SETTLE_MS - 1).speak).toBeNull();
    expect(said(a.tick(1_200 + ROOM_SETTLE_MS))).toEqual({ speak: 'Service Yard', dueMs: null });
    // Standing on: nothing more.
    expect(said(a.tick(10_000))).toEqual({ speak: null, dueMs: null });
  });

  it('counts the 1.5 s from arriving in the room, not from when the walker stopped', () => {
    const a = primed(at({ room: 'Kitchen' }));
    a.update(at({ room: 'Kitchen' }), false, 0);
    // Still the whole time, then a cut (no movement) into the next room.
    expect(said(a.update(at({ room: 'Hall' }), false, 10_000))).toEqual({ speak: null, dueMs: 11_500 });
    expect(a.tick(11_499).speak).toBeNull();
    expect(a.tick(11_500).speak).toBe('Hall');
  });

  it('restarts the wait when the walker moves again before it ends', () => {
    const a = primed(at({ room: 'Kitchen' }));
    a.update(at({ room: 'Hall' }), false, 0);
    expect(said(a.update(at({ room: 'Hall' }), true, 1_000))).toEqual({ speak: null, dueMs: null });
    expect(said(a.update(at({ room: 'Hall' }), false, 1_400))).toEqual({ speak: null, dueMs: 2_900 });
    expect(a.tick(2_900).speak).toBe('Hall');
  });

  it('says nothing for a step out and back into the room already heard', () => {
    const a = primed(at({ room: 'Kitchen' }));
    a.update(at({ room: 'Service Yard' }), true, 0);
    expect(said(a.update(at({ room: 'Kitchen' }), false, 300))).toEqual({ speak: null, dueMs: null });
    expect(a.tick(5_000).speak).toBeNull();
  });

  it('names the flat when the walker enters one, then only the room inside it', () => {
    const a = primed(CORRIDOR);
    a.update(at({ room: 'Foyer' }), false, 0);
    expect(a.tick(ROOM_SETTLE_MS).speak).toBe('Unit 05-104, Foyer');
    a.update(at({ room: 'Living / Dining' }), false, 3_000);
    expect(a.tick(3_000 + ROOM_SETTLE_MS).speak).toBe('Living / Dining');
    // Back out to the corridor: the room, never a "unit none".
    a.update(CORRIDOR, false, 6_000);
    expect(a.tick(6_000 + ROOM_SETTLE_MS).speak).toBe('Common corridor');
  });

  it('makes a same-named room news again on a new storey', () => {
    const a = primed(CORRIDOR);
    expect(a.update({ ...CORRIDOR, storey: 'L6' }, false, 0).speak).toBe('Level 6');
    expect(a.tick(ROOM_SETTLE_MS).speak).toBe('Common corridor');
  });

  it('settles silently where there is no room to name', () => {
    const a = primed(at({ room: 'Kitchen' }));
    a.update(at({ room: null }), false, 0);
    expect(said(a.tick(ROOM_SETTLE_MS))).toEqual({ speak: null, dueMs: null });
  });
});

describe('estate announcer: throttling', () => {
  it('keeps automatic announcements 1 s apart and coalesces what changed meanwhile', () => {
    expect(ANNOUNCE_GAP_MS).toBe(1_000);
    const a = primed(CORRIDOR);
    expect(a.update({ ...CORRIDOR, mode: 'fly' }, false, 0).speak).toBe('Fly mode');
    expect(said(a.update({ ...CORRIDOR, mode: 'overview' }, false, 200))).toEqual({ speak: null, dueMs: 1_000 });
    expect(said(a.update({ ...CORRIDOR, storey: 'L6', mode: 'walk' }, false, 400))).toEqual({ speak: null, dueMs: 1_000 });
    expect(a.tick(999).speak).toBeNull();
    // One utterance for the state at the end of the gap.
    expect(a.tick(1_000).speak).toBe('Level 6, walk mode');
  });

  it('says nothing when the state is back to what was heard by the end of the gap', () => {
    const a = primed(CORRIDOR);
    expect(a.update({ ...CORRIDOR, mode: 'fly' }, false, 0).speak).toBe('Fly mode');
    a.update({ ...CORRIDOR, mode: 'walk' }, false, 200);
    expect(said(a.update({ ...CORRIDOR, mode: 'fly' }, false, 400))).toEqual({ speak: null, dueMs: null });
    expect(a.tick(1_000).speak).toBeNull();
  });

  it('holds a settled room back until the gap ends', () => {
    const a = primed(CORRIDOR);
    a.update(at({ room: 'Foyer' }), false, 0);
    a.update({ ...at({ room: 'Foyer' }), mode: 'fly' }, false, 1_000);
    expect(said(a.tick(1_500))).toEqual({ speak: null, dueMs: 2_000 });
    expect(a.tick(2_000).speak).toBe('Unit 05-104, Foyer');
  });

  it('lets an event message through at once, then makes the next automatic one wait', () => {
    const a = primed(CORRIDOR);
    expect(a.say('No lift or stair reaches RF', 0).speak).toBe('No lift or stair reaches RF');
    expect(said(a.update({ ...CORRIDOR, mode: 'fly' }, false, 300))).toEqual({ speak: null, dueMs: 1_000 });
    expect(a.tick(1_000).speak).toBe('Fly mode');
  });
});

describe('estate announcer: the I key', () => {
  it('gives the full string at once, past the gap, and leaves nothing pending', () => {
    const a = primed(CORRIDOR);
    a.update({ ...CORRIDOR, mode: 'fly' }, false, 0);
    a.update(at({ room: 'Kitchen', mode: 'fly' }), true, 100);
    expect(said(a.full(200))).toEqual({ speak: 'Blk 509, level 5, unit 05-104, Kitchen, fly mode', dueMs: null });
    a.update(at({ room: 'Kitchen', mode: 'fly' }), false, 300);
    expect(a.tick(5_000).speak).toBeNull();
  });

  it('is spoken again when pressed again, by changing the live region\'s text', () => {
    const a = primed(at());
    const first = a.full(0).speak;
    const second = a.full(100).speak;
    const third = a.full(200).speak;
    expect(first).toBe(spokenLocation(at()));
    expect(second).toBe(`${first} `);
    expect(third).toBe(first);
  });

  it('says nothing before the viewer has a location', () => {
    const a = new LocationAnnouncer();
    expect(said(a.full(0))).toEqual({ speak: null, dueMs: null });
    expect(said(a.tick(0))).toEqual({ speak: null, dueMs: null });
  });
});

describe('estate announcer: lifecycle', () => {
  it('takes a primed location as heard, so going live says nothing', () => {
    const a = primed(at());
    expect(said(a.update(at(), false, 0))).toEqual({ speak: null, dueMs: null });
    a.reset();
    expect(a.update(at(), false, 0).speak).toBe('Blk 509, level 5, walk mode');
  });

  it('reuses one result object, so an unchanged update allocates nothing', () => {
    const a = primed(at());
    const r = a.update(at(), true, 0);
    expect(a.update(at(), true, 16)).toBe(r);
    expect(a.tick(32)).toBe(r);
    expect(a.full(48)).toBe(r);
  });
});
