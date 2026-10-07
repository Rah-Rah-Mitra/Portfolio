import { describe, expect, it } from 'vitest';
import { ESTATE_VFOV_DEG } from '../lib/estate/lod';
import {
  DETAIL_CHOICES, ESTATE_SETTINGS_DEFAULTS, FLY_SCALE_STOPS, FOV_RANGE, LOOK_SCALE_STOPS, SETTINGS_VERSION, WALK_SPEED_STOPS,
  horizontalFovDeg, parseStoredSettings, patchSettings, sanitizeSettingsPatch, serializeSettings, settingsFrom, stopIndex,
} from '../lib/estate/settings';
import { ESTATE_TIERS } from '../lib/estate/tiers';
import { WALK_SPEED, WALK_BOOST_SPEED } from '../components/workbench/estate/engine/controls/walk';

// The viewer's settings (lib/estate/settings.ts): the defaults are today's
// constants, so a visitor who never opens SETTINGS sees what the engine drew
// before it existed; everything stored or sent is sanitised to a known value.

describe('estate viewer settings', () => {
  it('defaults to the engine’s own constants, each on its stops, frozen', () => {
    expect(ESTATE_SETTINGS_DEFAULTS.walkSpeed).toBe(WALK_SPEED);
    // Shift stays 2.5× the walk at every speed (the engine scales both).
    expect(WALK_BOOST_SPEED / WALK_SPEED).toBe(2.5);
    expect(ESTATE_SETTINGS_DEFAULTS.fovDeg).toBe(ESTATE_VFOV_DEG.walk);
    expect(ESTATE_SETTINGS_DEFAULTS.fovDeg).toBe(ESTATE_VFOV_DEG.fly);
    expect(WALK_SPEED_STOPS).toContain(ESTATE_SETTINGS_DEFAULTS.walkSpeed);
    expect(FLY_SCALE_STOPS).toContain(ESTATE_SETTINGS_DEFAULTS.flyScale);
    expect(LOOK_SCALE_STOPS).toContain(ESTATE_SETTINGS_DEFAULTS.lookScale);
    expect(ESTATE_SETTINGS_DEFAULTS).toMatchObject({ detail: 'auto', edges: true, toon: false, reduceMotion: false, stats: false, invertLook: false });
    expect(Object.isFrozen(ESTATE_SETTINGS_DEFAULTS)).toBe(true);
    expect(DETAIL_CHOICES.slice(1)).toEqual([...ESTATE_TIERS]);
    for (const stops of [WALK_SPEED_STOPS, FLY_SCALE_STOPS, LOOK_SCALE_STOPS]) {
      // Roughly even on a log scale: every step between 8 % and 45 % of the last.
      for (let i = 1; i < stops.length; i += 1) {
        expect(stops[i] / stops[i - 1]).toBeGreaterThan(1.08);
        expect(stops[i] / stops[i - 1]).toBeLessThan(1.45);
      }
    }
  });

  it('keeps only valid values: snapped speeds, a whole-degree lens in range, booleans and known detail levels', () => {
    expect(sanitizeSettingsPatch({ walkSpeed: 1.62, flyScale: 9, lookScale: 0.01, fovDeg: 75.4, detail: 'low', toon: true })).toEqual({
      walkSpeed: 1.6, flyScale: 2, lookScale: 0.25, fovDeg: 75, detail: 'low', toon: true,
    });
    expect(sanitizeSettingsPatch({ fovDeg: 200 })).toEqual({ fovDeg: FOV_RANGE.max });
    expect(sanitizeSettingsPatch({ fovDeg: -5 })).toEqual({ fovDeg: FOV_RANGE.min });
    expect(sanitizeSettingsPatch({
      walkSpeed: Number.NaN, flyScale: Infinity, lookScale: '2', fovDeg: null, detail: 'ultra', toon: 'yes', edges: 1, stats: undefined, extra: true,
    })).toEqual({});
    expect(sanitizeSettingsPatch(null)).toEqual({});
    expect(sanitizeSettingsPatch([1, 2])).toEqual({});
    expect(sanitizeSettingsPatch('toon')).toEqual({});
    // A parsed __proto__ key is an own property; it is never read, and nothing is polluted.
    const hostile = JSON.parse('{"__proto__": {"toon": true}, "edges": false}');
    expect(sanitizeSettingsPatch(hostile)).toEqual({ edges: false });
    expect(({} as Record<string, unknown>).toon).toBeUndefined();
  });

  it('returns the same object when a patch changes nothing, and a new frozen one when it does', () => {
    expect(settingsFrom({})).toBe(ESTATE_SETTINGS_DEFAULTS);
    expect(settingsFrom({ nonsense: 1 })).toBe(ESTATE_SETTINGS_DEFAULTS);
    expect(patchSettings(ESTATE_SETTINGS_DEFAULTS, { walkSpeed: 1.6, toon: false })).toBe(ESTATE_SETTINGS_DEFAULTS);
    const next = patchSettings(ESTATE_SETTINGS_DEFAULTS, { toon: true, walkSpeed: 2.5 });
    expect(next).not.toBe(ESTATE_SETTINGS_DEFAULTS);
    expect(next).toEqual({ ...ESTATE_SETTINGS_DEFAULTS, toon: true, walkSpeed: 2.5 });
    expect(Object.isFrozen(next)).toBe(true);
    expect(patchSettings(next, { toon: true })).toBe(next);
  });

  it('stores only what differs from the defaults, versioned, and reads back exactly', () => {
    expect(serializeSettings(ESTATE_SETTINGS_DEFAULTS)).toBe(`{"v":${SETTINGS_VERSION}}`);
    const moved = settingsFrom({ walkSpeed: 2.25, fovDeg: 72, detail: 'mid', toon: true, edges: false });
    const text = serializeSettings(moved);
    expect(JSON.parse(text)).toEqual({ v: 1, walkSpeed: 2.25, fovDeg: 72, detail: 'mid', toon: true, edges: false });
    expect(settingsFrom(parseStoredSettings(text))).toEqual(moved);
  });

  it('reads anything it did not write as nothing stored', () => {
    expect(parseStoredSettings(null)).toEqual({});
    expect(parseStoredSettings('')).toEqual({});
    expect(parseStoredSettings('{not json')).toEqual({});
    expect(parseStoredSettings('[1]')).toEqual({});
    expect(parseStoredSettings('"toon"')).toEqual({});
    expect(parseStoredSettings('{"toon":true}')).toEqual({});
    expect(parseStoredSettings('{"v":2,"toon":true}')).toEqual({});
    expect(parseStoredSettings(`{"v":1,"toon":true,"pad":"${'x'.repeat(1100)}"}`)).toEqual({});
    expect(parseStoredSettings('{"v":1,"toon":true,"walkSpeed":99}')).toEqual({ toon: true, walkSpeed: 3.2 });
  });

  it('finds the nearest stop, and converts a vertical lens to the horizontal one it gives', () => {
    expect(stopIndex(WALK_SPEED_STOPS, 1.6)).toBe(WALK_SPEED_STOPS.indexOf(1.6));
    expect(stopIndex(WALK_SPEED_STOPS, 0)).toBe(0);
    expect(stopIndex(WALK_SPEED_STOPS, 100)).toBe(WALK_SPEED_STOPS.length - 1);
    expect(horizontalFovDeg(60, 16 / 9)).toBeCloseTo(91.49, 1);
    expect(horizontalFovDeg(90, 1)).toBeCloseTo(90, 6);
    expect(horizontalFovDeg(50, 722 / 531)).toBeCloseTo(64.75, 1);
  });
});
