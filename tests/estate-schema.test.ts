import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import budgets from '../lib/estate/packBudgets.json';
import { ESTATE_SITE_IDS, ESTATE_SITE_STOREYS, ESTATE_STOREY_FFL, siteKindOf, type EstateSiteId } from '../lib/estate/ids';
import { ESTATE_PALETTE } from '../lib/estate/palette';
import {
  ESTATE_PACK_FRAME, EstatePackError, PACK_PATH, packPathProblem, parsePack, type EstatePack, type FileRef, type Klass,
} from '../lib/estate/schema';

// parsePack is the gate between the committed pack and the engine (plan §6.4,
// §10.2). A minimal pack and a full one are built here from the real ids,
// storeys and palette; every rejection names the JSON path at fault.

// Fixtures are edited freely to break them, so they are loosely typed.
type Json = Record<string, any>;

const sha = (seed: string) => createHash('sha256').update(seed).digest('hex');
const ref = (dir: string, stem: string, ext: string, bytes: number): FileRef => {
  const sha256 = sha(`${dir}/${stem}.${ext}`);
  return { path: `${dir}/${stem}.${sha256.slice(0, 8)}.${ext}`, bytes, rawBytes: bytes * 3, sha256, gzSha256: sha(`gz:${dir}/${stem}.${ext}`) };
};
const geo = (dir: string, stem: string, bytes: number) => ({ ...ref(dir, stem, 'glb.gz', bytes), tris: 1000, verts: 600, prims: 2, draws: 2, maxPrimVerts: 400 });

const TYPOLOGY: Record<string, string | null> = {
  BLK_501: 'PT4', BLK_502: 'PT4', BLK_503: 'PT4', BLK_504: 'PT4', BLK_505: 'PT4', BLK_506: 'PT4',
  BLK_507: 'SL', BLK_508: 'SL', BLK_509: 'SL', BLK_510: 'LB', BLK_511: 'LB', BLK_512: 'SL (EA)', MSCP_513: null, NC_514: null,
};

const building = (id: EstateSiteId, full: boolean): Json => {
  const tags = ESTATE_SITE_STOREYS[id];
  const site: Json = {
    id,
    kind: siteKindOf(id),
    name: id.replace(/^BLK_/, 'Blk '),
    typology: TYPOLOGY[id],
    // Estate frame: at, bounds (the footprint moved by at), radius and spawns.
    // Block-local: footprint, roofTop, FFLs and the walk grid's origin.
    at: [105, 50],
    bounds: [[45, 46, -0.2], [169, 62, 49]],
    radius: 68,
    footprint: [[-60, -4], [64, -4], [64, 12], [-60, 12]],
    roofTop: 49,
    storeys: tags.map((tag, i) => ({
      tag, name: tag, ffl: ESTATE_STOREY_FFL[id][i], geom: i === 0 || tag === 'RF' ? 'special' : 'typical', walkLayer: i,
    })),
    spawns: [{ name: 'Void deck entrance N', pos: [105, 63.5, 0], facing: [0, -1], kind: 'entrance' }],
  };
  if (full) {
    site.massing = { mesh: `${id}_massing`, tris: 120, error: 2.3 };
    site.facade = { ...geo('f', id, 100_000), error: 0.06, edges: 4000, exactMatched: 900 };
    site.detail = { ...geo('d', id, 20_000), instances: 800 };
    site.interior = {
      ...geo('i', id, 80_000),
      typicalTris: 20_000, residualTris: 2000,
      specials: [{ tag: 'L1', tris: 3000 }, { tag: 'RF', tris: 1000 }],
      sourceTris: { L1: 3000, L2: 21_000 }, drawnTris: { L1: 3000, L2: 21_000 },
    };
    site.walk = { ...ref('w', id, 'walk.gz', 40_000), grid: { origin: [-61, -5], nx: 1260, ny: 180, cell: 0.1 }, layers: tags.length };
    site.nav = ref('nav', id, 'json', 20_000);
  }
  return site;
};

const sum = (refs: FileRef[]) => refs.reduce((n, r) => n + r.bytes, 0);

const makePack = (full: boolean): Json => {
  const posters = [ref('poster', 'aerial-1600', 'webp', 150_000), ref('poster', 'aerial-800', 'webp', 60_000), ref('poster', 'aerial-800', 'jpg', 80_000)];
  const sites = ESTATE_SITE_IDS.map((id) => building(id, full));
  const pack: Json = {
    schema: 'portfolio/estate-pack/1',
    edition: 'v1.2',
    classes: full ? ['poster', 's0', 'f', 'd', 'i', 'w', 'nav', 'ground'] : ['poster'],
    source: {
      repo: 'https://github.com/Rah-Rah-Mitra/Bonsai-Estate', tag: 'v1.2',
      commit: sha('commit').slice(0, 40), buildCommit: sha('build').slice(0, 40),
      manifestSha256: sha('manifest'), exportInfoSha256: sha('export_info'),
      assets: [{ name: 'SampleTownN5_v1.2_model.zip', sha256: sha('zip'), bytes: 184_024_821 }],
    },
    tool: { pipeline: 'scripts/estate/pack.mjs', gltfTransform: '4.5.1', meshoptimizer: '1.3.0', node: '24' },
    licence: { data: 'CC-BY-4.0', attribution: 'Model data © Rahul Mitra · CC BY 4.0 · Bonsai-Estate v1.2', url: '/estate/LICENSE.txt' },
    frame: ESTATE_PACK_FRAME,
    estate: { name: 'Sample Town N5', code: 'SN5', extent: [0, 0, 400, 400], flats: 1206, storeys: 245 },
    palette: ESTATE_PALETTE.materials.map((m) => ({ slot: m.slot, material: m.material, role: m.role, token: m.token, source: m.sourceRGBA })),
    views: { aerialNE: { eye: [520, 560, 300], quat: [0.1, 0.2, 0.3, Math.sqrt(1 - 0.14)], vfovDeg: 30, shift: [0, 0.05], aspect: 4 / 3 } },
    posters,
    sites,
    totals: { stage0Bytes: 0, bytes: sum(posters), byClass: { poster: sum(posters) } },
    warnings: [],
  };
  if (full) {
    pack.massing = geo('s0', 'massing', 9_000);
    pack.site = {
      file: geo('s0', 'site', 110_000),
      quadrants: [{ mesh: 'SITE_q00', bounds: [[0, 0, -0.45], [200, 200, 9.25]], tris: 7000 }],
      trees: [{ species: 'Angsana', instances: 124, tris: 108, crownTris: 8 }],
      ground: { ...ref('site', 'ground', 'bin.gz', 120_000), cell: 0.5, lo: [0, 0], nx: 800, ny: 800 },
      spawns: [{ name: 'Bus stop BS1', pos: [100, 375.3, 0], facing: [0, 1], kind: 'bus' }],
    };
    pack.stage0 = [pack.massing.path, pack.site.file.path];
    const byClass: Record<string, number> = {
      poster: sum(posters),
      s0: pack.massing.bytes + pack.site.file.bytes,
      f: sum(sites.map((s) => s.facade)), d: sum(sites.map((s) => s.detail)), i: sum(sites.map((s) => s.interior)),
      w: sum(sites.map((s) => s.walk)), nav: sum(sites.map((s) => s.nav)), ground: pack.site.ground.bytes,
    };
    pack.totals = {
      stage0Bytes: byClass.s0 + 4_000, // the stage0 files plus pack.json's own gzip
      bytes: Object.values(byClass).reduce((a, b) => a + b, 0),
      byClass,
    };
  }
  return pack;
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const broken = (full: boolean, edit: (p: Json) => void) => {
  const pack = clone(makePack(full));
  edit(pack);
  return () => parsePack(pack);
};
const fileRefs = (pack: EstatePack): FileRef[] => [
  ...pack.posters,
  ...(pack.massing ? [pack.massing] : []),
  ...(pack.site ? [pack.site.file, ...(pack.site.ground ? [pack.site.ground] : [])] : []),
  ...pack.sites.flatMap((s) => [s.facade, s.detail, s.interior, s.walk, s.nav].filter((f): f is NonNullable<typeof f> => f !== undefined)),
];

describe('parsePack accepts', () => {
  it('a minimal, poster-only pack (P4a), returning a fresh copy', () => {
    const input = makePack(false);
    const pack = parsePack(input);
    expect(pack).toEqual(input);
    expect(pack).not.toBe(input);
    expect(pack.sites).toHaveLength(14);
    expect(pack.massing).toBeUndefined();
  });

  it('a full pack (P5) straight from JSON', () => {
    const input = makePack(true);
    const pack = parsePack(JSON.parse(JSON.stringify(input)));
    expect(pack).toEqual(input);
    expect(fileRefs(pack)).toHaveLength(3 + 2 + 1 + 14 * 5);
  });

  it('only paths that match ^[A-Za-z0-9._/-]+$, relative, without dot segments', () => {
    for (const file of fileRefs(parsePack(makePack(true)))) {
      expect(file.path).toMatch(PACK_PATH);
      expect(file.path.startsWith('/')).toBe(false);
      expect(file.path.split('/')).not.toContain('..');
      expect(file.path).toContain(`.${file.sha256.slice(0, 8)}.`);
    }
  });

  it('an empty views object and an unrotated aerial-free pack', () => {
    expect(parsePack({ ...makePack(false), views: {} }).views).toEqual({});
  });

  it('sites in any order, returned in ESTATE_SITE_IDS order (index i is the same site everywhere)', () => {
    const input = makePack(true);
    input.sites.reverse();
    expect(parsePack(input).sites.map((s) => s.id)).toEqual([...ESTATE_SITE_IDS]);
  });

  it('a coarse 0.2 m walk grid for one building (plan §5.2 fallback), without failing the pack', () => {
    const input = makePack(true);
    input.sites[3].walk.grid.cell = 0.2;
    expect(parsePack(input).sites[3].walk?.grid.cell).toBe(0.2);
  });

  it('a palette whose tokens or roles moved on: only slot ↔ material is baked into the pack', () => {
    const input = makePack(false);
    input.palette[4].token = '--color-neutral-400';
    input.palette[4].role = 'stair';
    expect(parsePack(input).palette[4]).toMatchObject({ slot: 4, material: 'RC slab' });
  });

  it('a dev pack stamped source.dev = true (scripts/estate --dev-src), keeping the stamp', () => {
    const input = makePack(false);
    input.source.dev = true;
    expect(parsePack(input).source.dev).toBe(true);
    expect('dev' in parsePack(makePack(false)).source).toBe(false);
  });

  it('the bus-stop spawns on the site layer, not on any building', () => {
    const pack = parsePack(makePack(true));
    expect(pack.site?.spawns).toEqual([{ name: 'Bus stop BS1', pos: [100, 375.3, 0], facing: [0, 1], kind: 'bus' }]);
    expect(pack.sites.every((s) => s.spawns.every((spawn) => spawn.kind === 'entrance'))).toBe(true);
  });
});

describe('parsePack rejects', () => {
  const rejects = (fn: () => unknown, message: RegExp) => {
    expect(fn).toThrow(EstatePackError);
    expect(fn).toThrow(message);
  };

  it('a missing hash', () => {
    rejects(broken(false, (p) => { delete p.posters[0].sha256; }), /^pack\.posters\[0\]\.sha256: missing$/);
    rejects(broken(true, (p) => { delete p.sites[8].facade.gzSha256; }), /^pack\.sites\[8\]\.facade\.gzSha256: missing$/);
    rejects(broken(true, (p) => { delete p.site.ground.sha256; }), /^pack\.site\.ground\.sha256: missing$/);
  });

  it('a dev stamp that is anything but true', () => {
    rejects(broken(false, (p) => { p.source.dev = false; }), /source\.dev: expected true or nothing/);
    rejects(broken(false, (p) => { p.source.dev = 'yes'; }), /source\.dev: expected true or nothing/);
  });

  it('a malformed hash or commit', () => {
    rejects(broken(false, (p) => { p.posters[1].sha256 = p.posters[1].sha256.toUpperCase(); }), /posters\[1\]\.sha256: expected 64 lowercase hex/);
    rejects(broken(false, (p) => { p.posters[1].gzSha256 = 'abc'; }), /posters\[1\]\.gzSha256: expected 64 lowercase hex/);
    rejects(broken(false, (p) => { p.source.commit = 'HEAD'; }), /source\.commit: expected 40 lowercase hex/);
  });

  it('an absolute path', () => {
    rejects(broken(false, (p) => { p.posters[0].path = `/${p.posters[0].path}`; }), /posters\[0\]\.path: absolute path/);
    rejects(broken(false, (p) => { p.posters[0].path = `C:/estate/${p.posters[0].path}`; }), /posters\[0\]\.path: absolute path/);
  });

  it('a backslash path', () => {
    rejects(broken(false, (p) => { p.posters[0].path = p.posters[0].path.replace('/', '\\'); }), /posters\[0\]\.path: backslash in path/);
  });

  it("a '..' segment, a stray character or an empty segment", () => {
    rejects(broken(true, (p) => { p.sites[0].facade.path = `f/../${p.sites[0].facade.path}`; }), /sites\[0\]\.facade\.path: '\.\.' segment/);
    rejects(broken(false, (p) => { p.posters[0].path = p.posters[0].path.replace('aerial-1600', 'aerial 1600'); }), /characters outside/);
    rejects(broken(false, (p) => { p.posters[0].path = p.posters[0].path.replace('poster/', 'poster//'); }), /empty or '\.' segment/);
    rejects(broken(false, (p) => { p.posters[0].path = p.posters[0].path.replace('poster/', 'poster/./'); }), /empty or '\.' segment/);
  });

  it('a file outside its class folder, misnamed, or listed twice', () => {
    rejects(broken(true, (p) => { p.sites[3].facade.path = p.sites[3].facade.path.replace(/^f\//, 'd/'); }), /sites\[3\]\.facade\.path: class f files live under f\//);
    rejects(broken(false, (p) => { p.posters[0].sha256 = sha('other'); }), /posters\[0\]\.path: name must carry \./);
    rejects(broken(false, (p) => { p.posters[1] = clone(p.posters[0]); }), /posters\[1\]\.path: .* is listed twice/);
  });

  it('an unknown schema or edition, before anything else', () => {
    rejects(broken(false, (p) => { p.schema = 'portfolio/estate-pack/2'; p.newKey = 1; }), /^pack\.schema: unknown schema "portfolio\/estate-pack\/2"/);
    rejects(broken(false, (p) => { p.edition = 'v1.3'; }), /^pack\.edition: unknown edition "v1\.3"/);
    rejects(() => parsePack(null), /^pack: expected an object/);
    rejects(() => parsePack([]), /^pack: expected an object/);
  });

  it('an unknown key anywhere, rather than dropping it silently', () => {
    rejects(broken(false, (p) => { p.extra = true; }), /^pack\.extra: unknown key$/);
    rejects(broken(false, (p) => { p.sites[2].colour = '#fff'; }), /^pack\.sites\[2\]\.colour: unknown key$/);
    rejects(broken(false, (p) => { p.posters[0].url = 'https://example.com'; }), /^pack\.posters\[0\]\.url: unknown key$/);
  });

  it('bad numbers', () => {
    rejects(broken(false, (p) => { p.posters[0].bytes = 0; }), /posters\[0\]\.bytes: expected an integer ≥ 1, got 0/);
    rejects(broken(false, (p) => { p.posters[0].bytes = -5; }), /posters\[0\]\.bytes: expected an integer ≥ 1/);
    rejects(broken(false, (p) => { p.posters[0].bytes = 1.5; }), /posters\[0\]\.bytes: expected an integer/);
    rejects(broken(false, (p) => { p.posters[0].bytes = '120000'; }), /posters\[0\]\.bytes: expected a finite number, got "120000"/);
    rejects(() => { const p = makePack(false); p.posters[0].rawBytes = Number.NaN; return parsePack(p); }, /rawBytes: expected a finite number, got NaN/);
    rejects(() => { const p = makePack(false); p.sites[0].radius = Infinity; return parsePack(p); }, /sites\[0\]\.radius: expected a finite number, got Infinity/);
    rejects(broken(true, (p) => { p.sites[1].facade.tris = -1; }), /sites\[1\]\.facade\.tris: expected an integer ≥ 0/);
    rejects(broken(false, (p) => { p.sites[1].radius = 0; }), /sites\[1\]\.radius: expected a positive number/);
    rejects(broken(false, (p) => { p.sites[1].bounds = [[0, 0, 10], [5, 5, 0]]; }), /sites\[1\]\.bounds: min exceeds max/);
    rejects(broken(false, (p) => { p.sites[1].at = [1, 2, 3]; }), /sites\[1\]\.at: expected 2 numbers/);
    rejects(broken(false, (p) => { p.views.aerialNE.quat = [0, 0, 0, 2]; }), /aerialNE\.quat: expected a unit quaternion/);
    rejects(broken(false, (p) => { p.views.aerialNE.vfovDeg = 180; }), /aerialNE\.vfovDeg: expected under 180/);
    rejects(broken(true, (p) => { p.sites[0].walk.grid.cell = 0.3; }), /walk\.grid\.cell: expected 0\.1, or 0\.2 for the coarse fallback, got 0\.3/);
    rejects(broken(true, (p) => { p.sites[0].facade.error = 0.1; }), /facade\.error: unknown façade error 0\.1/);
    rejects(broken(false, (p) => { p.estate.flats = 1205; }), /estate\.flats: unknown value 1205/);
  });

  it('storeys that are not the canonical list, or sit at the wrong height', () => {
    rejects(broken(false, (p) => { p.sites[8].storeys[4].tag = 'L05'; }), /sites\[8\]\.storeys\[4\]\.tag: unknown storey tag "L05" \(this build reads "L5"\)/);
    rejects(broken(false, (p) => { p.sites[8].storeys.pop(); }), /sites\[8\]\.storeys: expected 17 storeys \(L1…RF\), got 16/);
    rejects(broken(false, (p) => { p.sites[8].storeys[4].ffl = 12.5; }), /sites\[8\]\.storeys\[4\]\.ffl: L5 sits at 12 m/);
    rejects(broken(true, (p) => { p.sites[8].interior.sourceTris.L99 = 5; }), /interior\.sourceTris\.L99: unknown key/);
    rejects(broken(true, (p) => { p.sites[13].interior.specials[0].tag = 'L5'; }), /sites\[13\]\.interior\.specials\[0\]\.tag: expected one of/);
  });

  it('a missing, repeated or unknown site, or one of the wrong kind', () => {
    rejects(broken(false, (p) => { p.sites.splice(12, 1); }), /^pack\.sites: missing MSCP_513$/);
    rejects(broken(false, (p) => { p.sites[1] = clone(p.sites[0]); }), /sites\[1\]\.id: BLK_501 is listed twice/);
    rejects(broken(false, (p) => { p.sites[0].id = 'BLK_599'; }), /sites\[0\]\.id: unknown site id "BLK_599"/);
    rejects(broken(false, (p) => { p.sites[0].id = 'SITE'; }), /sites\[0\]\.id: unknown site id "SITE"/);
    rejects(broken(false, (p) => { p.sites[12].kind = 'block'; }), /sites\[12\]\.kind: unknown kind "block" \(this build reads "mscp"\)/);
    rejects(broken(false, (p) => { p.sites[12].typology = 'MSCP'; }), /sites\[12\]\.typology: expected null for a mscp/);
    rejects(broken(false, (p) => { p.sites[0].typology = null; }), /sites\[0\]\.typology: expected one of "PT4"/);
  });

  it('a class listed without its files, or files whose class is not listed', () => {
    rejects(broken(true, (p) => { delete p.sites[5].facade; }), /^pack\.sites\[5\]\.facade: missing \(class f is listed\)$/);
    rejects(broken(true, (p) => { delete p.site.ground; }), /^pack\.site\.ground: missing \(class ground is listed\)$/);
    rejects(broken(false, (p) => {
      p.sites[0].nav = ref('nav', 'BLK_501', 'json', 1000);
    }), /^pack\.sites\[0\]\.nav: nav present but class nav is not listed$/);
    rejects(broken(false, (p) => { p.classes = ['poster', 'poster']; }), /classes: a class is listed twice/);
    rejects(broken(false, (p) => { p.classes = ['poster', 'lod0']; }), /classes\[1\]: expected one of/);
    rejects(broken(false, (p) => { p.classes = []; }), /classes: expected at least 1 entries/);
  });

  it('totals that do not add up', () => {
    rejects(broken(true, (p) => { p.totals.byClass.f += 1; }), /totals\.byClass\.f: \d+ B, but its 14 files add up to \d+ B/);
    rejects(broken(false, (p) => { p.totals.byClass.f = 0; }), /totals\.byClass\.f: class f is not listed/);
    rejects(broken(true, (p) => { delete p.totals.byClass.nav; }), /totals\.byClass\.nav: missing \(class nav is listed\)/);
    rejects(broken(true, (p) => { p.totals.bytes = 10; }), /totals\.bytes: 10 B is less than/);
    rejects(broken(true, (p) => { p.totals.stage0Bytes = 10; }), /totals\.stage0Bytes: 10 B is less than its files'/);
  });

  it('a stage0 entry that is not one of the stage-0 files', () => {
    rejects(broken(true, (p) => { p.stage0.push(p.sites[0].facade.path); }), /stage0\[2\]: .* is not one of the pack's s0 files/);
    rejects(broken(true, (p) => { p.stage0.push(p.stage0[0]); }), /stage0: a path is listed twice/);
  });

  it('a palette built against a different palette.json', () => {
    rejects(broken(false, (p) => { p.palette[4].material = 'Concrete'; }), /palette\[4\]: slot 4 is "Concrete" here but "RC slab" in lib\/estate\/palette\.json: rebuild the pack/);
    rejects(broken(false, (p) => { p.palette.pop(); }), /palette: has 28 materials; lib\/estate\/palette\.json has 29/);
    rejects(broken(false, (p) => { p.palette[0].token = '#ffffff'; }), /palette\[0\]\.token: expected a --color-\*\/--paper-\* token/);
  });

  it('coordinates in the wrong frame: bounds and spawns are estate frame, the footprint block-local', () => {
    // A writer that left bounds block-local (the fixture's earlier mistake).
    rejects(broken(false, (p) => { p.sites[8].bounds = [[-60, -4, -0.2], [64, 12, 49]]; }),
      /sites\[8\]\.footprint\[0\]: block-local \[-60,-4\] lands at estate \(45, 46\), outside bounds .*: bounds are estate frame/);
    // …or moved the footprint into the estate frame.
    rejects(broken(false, (p) => { p.sites[8].footprint = p.sites[8].footprint.map(([x, y]: number[]) => [x + 105, y + 50]); }),
      /sites\[8\]\.footprint\[0\]: block-local/);
    rejects(broken(false, (p) => { p.sites[8].spawns[0].pos = [0, 13.5, 0]; }), /sites\[8\]\.spawns\[0\]\.pos: \[0,13\.5,0\] is .* m from the building's bounds: spawns are estate frame/);
    rejects(broken(false, (p) => { p.sites[8].radius = 60; }), /sites\[8\]\.radius: 60 m does not enclose bounds about their centre/);
    rejects(broken(false, (p) => { p.sites[8].spawns[0].facing = [0, 0]; }), /spawns\[0\]\.facing: expected a direction/);
  });

  it('spawns of the wrong kind for where they are listed', () => {
    rejects(broken(false, (p) => { p.sites[8].spawns[0].kind = 'bus'; }), /sites\[8\]\.spawns\[0\]\.kind: unknown spawn kind "bus" \(this build reads "entrance"\)/);
    rejects(broken(true, (p) => { p.site.spawns[0].kind = 'entrance'; }), /site\.spawns\[0\]\.kind: unknown spawn kind "entrance"/);
  });

  it('walk grids that are not one layer per storey', () => {
    rejects(broken(true, (p) => { p.sites[8].walk.layers = 16; }), /sites\[8\]\.walk\.layers: expected 17, one per storey, got 16/);
    rejects(broken(false, (p) => { p.sites[8].storeys[4].walkLayer = 3; }), /sites\[8\]\.storeys\[4\]\.walkLayer: unknown walk layer 3 \(this build reads 4\)/);
  });

  it('literal fields the runtime depends on', () => {
    rejects(broken(false, (p) => { p.frame = 'three world = estate'; }), /^pack\.frame: unknown frame/);
    rejects(broken(false, (p) => { p.source.repo = 'https://github.com/someone/fork'; }), /source\.repo: unknown value/);
    rejects(broken(false, (p) => { p.licence.url = 'https://example.com/LICENSE'; }), /licence\.url: unknown value/);
    rejects(broken(false, (p) => { p.estate.extent = [0, 0, 500, 500]; }), /estate\.extent: expected \[0, 0, 400, 400\]/);
    rejects(broken(false, (p) => { p.source.assets[0].name = '../model.zip'; }), /assets\[0\]\.name: expected a bare file name/);
  });
});

describe('packPathProblem', () => {
  it.each([
    ['f/BLK_509.0a1b2c3d.glb.gz', null],
    ['poster/aerial-1600.0a1b2c3d.webp', null],
    ['', 'empty path'],
    ['/f/x.glb.gz', 'absolute path'],
    ['C:/f/x.glb.gz', 'absolute path'],
    ['c:x', 'absolute path'],
    ['f\\x.glb.gz', 'backslash in path'],
    ['f/../x.glb.gz', "'..' segment"],
    ['..', "'..' segment"],
    ['f/x y.glb.gz', 'characters outside [A-Za-z0-9._/-]'],
    ['f/x.glb.gz?v=1', 'characters outside [A-Za-z0-9._/-]'],
    ['f/%2e%2e/x', 'characters outside [A-Za-z0-9._/-]'],
    ['f/Users/rapiular', null],
    ['f//x', "empty or '.' segment"],
    ['f/', "empty or '.' segment"],
    ['./f/x', "empty or '.' segment"],
  ])('%j → %j', (path, problem) => {
    expect(packPathProblem(path)).toBe(problem);
  });
});

describe('pack budgets (plan §6.5, §7.4)', () => {
  it('pins the size caps', () => {
    // Top-level keys, named as plan §4 and §6.5 name them: a dependency-free
    // check-bundle.mjs written to the plan reads exactly these, and an undefined
    // cap would compare false and never fail the build.
    // Re-pinned in P4b and P5 at the measured size + 5%, and engineGzip again in P7 (the
    // units note says from what); a re-pin may move them, but never above the plan caps.
    expect(budgets.engineGzip).toBe(278_000);
    expect(budgets.engineMinified).toBe(942_000);
    expect(budgets.engineGzip).toBeLessThanOrEqual(307_200);
    expect(budgets.engineMinified).toBeLessThanOrEqual(950_000);
    expect('engine' in budgets).toBe(false);
    expect(budgets.pack).toMatchObject({ hardBytes: 12_000_000, warnBytes: 8_000_000, maxFiles: 100, firstFrame: { bytes: 350_000 } });
    expect(budgets.classes).toMatchObject({
      f: { total: 2_800_000, perFile: 300_000 }, d: { total: 500_000, perFile: 64_000 }, i: { total: 2_000_000, perFile: 240_000 },
      w: { perFile: 131_072 }, ground: { perFile: 160_000 }, nav: { total: 600_000, perFile: 48_000 }, poster: { perFile: 200_000 },
    });
    expect(budgets.groups.walkAndGround).toEqual({ classes: ['w', 'ground'], total: 1_300_000 });
    expect(budgets.drawsPerFile).toEqual({ massing: 14, f: 3, d: 60, i: 12, site: 16 });
    expect(budgets.maxPrimVerts).toBe(65_535);
  });

  it("caps a walk file at upstream's own max_walk_gz, 128 KiB, so U2's gate and P2's budget agree", () => {
    expect(budgets.classes.w.perFile).toBe(128 * 1024);
  });

  it('keeps every per-file cap under its class total, every poster under the poster cap, and the classes under the hard cap', () => {
    for (const [klass, cap] of Object.entries(budgets.classes) as Array<[string, { total?: number; perFile: number }]>) {
      if (cap.total !== undefined) expect(cap.perFile, klass).toBeLessThan(cap.total);
    }
    for (const bytes of Object.values(budgets.classes.poster.files)) expect(bytes).toBeLessThanOrEqual(budgets.classes.poster.perFile);
    const totals = budgets.pack.firstFrame.bytes + budgets.classes.f.total + budgets.classes.d.total + budgets.classes.i.total
      + budgets.groups.walkAndGround.total + budgets.classes.nav.total + 3 * budgets.classes.poster.perFile;
    expect(totals).toBeLessThanOrEqual(budgets.pack.hardBytes);
    expect(budgets.pack.warnBytes).toBeLessThan(budgets.pack.hardBytes);
    const classKeys: Klass[] = ['poster', 'f', 'd', 'i', 'w', 'ground', 'nav'];
    expect(Object.keys(budgets.classes).sort()).toEqual([...classKeys].sort());
  });

  it('pins the tier table', () => {
    expect(budgets.tiers.map((t) => [t.id, t.tauPx, t.maxTris, t.maxDraws, t.bandK, t.treeRadiusM, t.furnitureRadiusM, t.edges, t.pixelCap, t.gpuBytes])).toEqual([
      ['high', 2.0, 1_200_000, 150, 2, 80, 25, true, 2_000_000, 128_000_000],
      ['mid', 3.0, 800_000, 120, 1, 60, 15, true, 1_400_000, 80_000_000],
      ['low', 4.5, 450_000, 90, 1, 30, 8, false, 1_000_000, 48_000_000],
      ['min', 6.0, 300_000, 60, 1, 15, 5, false, 700_000, 32_000_000],
    ]);
  });

  it('steps every tier down from the last, with a band of at least one storey each side', () => {
    budgets.tiers.forEach((tier, i) => {
      expect(tier.bandK, tier.id).toBeGreaterThanOrEqual(1);
      if (i === 0) return;
      const prev = budgets.tiers[i - 1];
      expect(tier.tauPx).toBeGreaterThan(prev.tauPx);
      expect(tier.maxTris).toBeLessThan(prev.maxTris);
      expect(tier.maxDraws).toBeLessThan(prev.maxDraws);
      expect(tier.pixelCap).toBeLessThan(prev.pixelCap);
      expect(tier.gpuBytes).toBeLessThan(prev.gpuBytes);
      expect(tier.treeRadiusM).toBeLessThanOrEqual(prev.treeRadiusM);
      expect(tier.furnitureRadiusM).toBeLessThanOrEqual(prev.furnitureRadiusM);
    });
    // The top tier is the plan's C11 cap, proved over the pose grid in tests/estate-budget.test.ts.
    expect(budgets.tiers[0]).toMatchObject({ maxDraws: 150, maxTris: 1_200_000 });
  });

  it('lists pixel ratios from 2 down to 0.75', () => {
    expect(budgets.pixelRatioSteps).toEqual([2, 1.75, 1.5, 1.25, 1, 0.75]);
  });
});
