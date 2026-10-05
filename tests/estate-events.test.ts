import { describe, expect, it } from 'vitest';
import { ESTATE_FOCUS_EVENT, validateEstateFocus } from '../lib/estate/events';
import { ESTATE_SITE_IDS, ESTATE_SITE_STOREYS } from '../lib/estate/ids';

// The focus event is the assistant's only way to name a building (plan §9.4).
// server/pageAgent.mjs mirrors this validator, so these rows are the contract
// both sides keep: an invalid storey drops only the storey.

describe('estate focus event', () => {
  it('uses the portfolio: event namespace the other window events use', () => {
    expect(ESTATE_FOCUS_EVENT).toBe('portfolio:estate-focus');
  });

  it('passes a valid request through', () => {
    expect(validateEstateFocus({ site: 'BLK_509', storey: 'L5', enter: true })).toEqual({ site: 'BLK_509', storey: 'L5', enter: true });
    expect(validateEstateFocus({ site: 'MSCP_513' })).toEqual({ site: 'MSCP_513' });
    expect(validateEstateFocus({ site: 'NC_514', enter: false })).toEqual({ site: 'NC_514', enter: false });
  });

  it('normalises the storey spelling', () => {
    expect(validateEstateFocus({ site: 'BLK_509', storey: 'L05' })).toEqual({ site: 'BLK_509', storey: 'L5' });
    expect(validateEstateFocus({ site: 'BLK_509', storey: 'l5' })).toEqual({ site: 'BLK_509', storey: 'L5' });
    expect(validateEstateFocus({ site: 'MSCP_513', storey: 'rf' })).toEqual({ site: 'MSCP_513', storey: 'RF' });
  });

  it('drops an invalid storey and keeps the site', () => {
    expect(validateEstateFocus({ site: 'BLK_509', storey: 'L99', enter: true })).toEqual({ site: 'BLK_509', enter: true });
    // L17 is a real tag, just not on Blk 509 (L1–L16, RF).
    expect(validateEstateFocus({ site: 'BLK_509', storey: 'L17' })).toEqual({ site: 'BLK_509' });
    expect(validateEstateFocus({ site: 'NC_514', storey: 'L5' })).toEqual({ site: 'NC_514' });
    expect(validateEstateFocus({ site: 'BLK_501', storey: 'basement' })).toEqual({ site: 'BLK_501' });
    expect(validateEstateFocus({ site: 'BLK_501', storey: 5 })).toEqual({ site: 'BLK_501' });
  });

  it('drops everything an unknown site would anchor', () => {
    expect(validateEstateFocus({ site: 'BLK_599', storey: 'L5', enter: true })).toEqual({});
    expect(validateEstateFocus({ site: 'SITE' })).toEqual({});
    expect(validateEstateFocus({ site: 'blk_509', storey: 'L5' })).toEqual({});
    expect(validateEstateFocus({ storey: 'L5', enter: true })).toEqual({});
  });

  it('keeps enter only as a real boolean, and strips unknown keys', () => {
    expect(validateEstateFocus({ site: 'BLK_509', enter: 'true' })).toEqual({ site: 'BLK_509' });
    expect(validateEstateFocus({ site: 'BLK_509', enter: 1 })).toEqual({ site: 'BLK_509' });
    const out = validateEstateFocus({ site: 'BLK_509', targetId: 'experience-x', href: 'javascript:alert(1)' });
    expect(out).toEqual({ site: 'BLK_509' });
    expect(Object.keys(out)).toEqual(['site']);
  });

  it('returns an empty object for anything that is not a plain object', () => {
    for (const junk of [null, undefined, 'BLK_509', 509, true, ['BLK_509'], () => 'BLK_509']) {
      expect(validateEstateFocus(junk)).toEqual({});
    }
  });

  it('accepts every storey of every site, top and bottom', () => {
    for (const site of ESTATE_SITE_IDS) {
      for (const storey of ESTATE_SITE_STOREYS[site]) {
        expect(validateEstateFocus({ site, storey })).toEqual({ site, storey });
      }
    }
  });
});
