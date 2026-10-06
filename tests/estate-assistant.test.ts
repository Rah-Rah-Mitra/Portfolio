import { describe, expect, it } from 'vitest';
import * as serverAgent from '../server/pageAgent.mjs';
import { validatePageCommand } from '../components/AskThePage';
import { ESTATE_CATALOGUE } from '../lib/estate/catalogue.generated';
import { validateEstateFocus } from '../lib/estate/events';
import { ESTATE_SITE_IDS, ESTATE_SITE_STOREYS, normaliseStoreyTag } from '../lib/estate/ids';

// The assistant's focusEstate (plan §9.4, P6) is checked in three places that
// cannot share code: server/pageAgent.mjs (an .mjs file, which cannot import
// the TS tables), AskThePage.tsx (main bundle, which reads the catalogue rather
// than carry lib/estate/ids.ts) and lib/estate/events.ts (the viewer's own
// check, in the controller chunk). This file holds their lists to one truth:
// the catalogue generated from the pack, and ids.ts' storey tables.

describe('focusEstate: the server’s, the client’s and the viewer’s lists are the catalogue’s', () => {
  it('names the fourteen buildings the catalogue does, in its order', () => {
    expect([...serverAgent.canonicalEstateSiteIds]).toEqual(ESTATE_CATALOGUE.sites.map((site) => site.id));
    expect(Object.keys(serverAgent.ESTATE_SITE_STOREYS)).toEqual([...ESTATE_SITE_IDS]);
    expect(ESTATE_CATALOGUE.sites.map((site) => site.id)).toEqual([...ESTATE_SITE_IDS]);
  });

  it('gives each building the storeys ids.ts and the catalogue’s storey range give it', () => {
    let storeys = 0;
    for (const site of ESTATE_CATALOGUE.sites) {
      const server = serverAgent.ESTATE_SITE_STOREYS[site.id];
      expect(server, site.id).toEqual(ESTATE_SITE_STOREYS[site.id]);
      expect(Object.isFrozen(server), site.id).toBe(true);
      // 'L1–L16 + RF': the range the client validator reads.
      expect(site.levels, site.id).toBe(`L1–${server[server.length - 2]} + RF`);
      storeys += server.length;
    }
    // The window's facts quote this total (245).
    expect(storeys).toBe(ESTATE_CATALOGUE.storeys);
  });

  it('normalises storey tags on the server exactly as ids.ts does', () => {
    const inputs: unknown[] = [
      'L5', 'L05', 'l5', ' L5 ', 'L005', 'L0005', 'L0', 'L99', 'L100', 'rf', 'RF', ' Rf ', 'R F', 'roof', '5', 'L5a', 'B1', '', null, 5, {},
    ];
    for (const input of inputs) expect(serverAgent.normaliseStoreyTag(input), JSON.stringify(input)).toBe(normaliseStoreyTag(input));
  });

  it('keeps or drops a storey the same way on the client, the server and the viewer, for every storey any building has', () => {
    const spellings = (tag: string) => (tag === 'RF' ? ['RF', 'rf'] : [tag, `L0${tag.slice(1)}`, tag.toLowerCase()]);
    for (const site of ESTATE_SITE_IDS) {
      for (const tag of new Set(Object.values(ESTATE_SITE_STOREYS).flat())) {
        for (const storey of spellings(tag)) {
          const command = { type: 'focusEstate', site, storey, enter: true };
          const [server] = serverAgent.sanitizeCommands([command], {});
          expect(validatePageCommand(command), `${site} ${storey}`).toEqual(server);
          expect(validateEstateFocus({ site, storey, enter: true }), `${site} ${storey}`).toEqual({ site, ...('storey' in server ? { storey: server.storey } : {}), enter: true });
          expect('storey' in server, `${site} ${storey}`).toBe(ESTATE_SITE_STOREYS[site].includes(tag as never));
        }
      }
    }
  });
});
