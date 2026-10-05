import { localToEstate, pointBoxDistance, type Vec2, type Vec3 } from './frames';
import {
  ESTATE_NAME, ESTATE_SITE_IDS, ESTATE_SITE_STOREYS, ESTATE_STOREY_FFL, isEstateSiteId, siteKindOf,
  type EstateSiteId, type EstateSiteKind, type EstateStoreyTag,
} from './ids';
import { ESTATE_PALETTE, isPaletteToken, type PaletteToken } from './palette';

// pack.<h8>.json: the manifest of the estate pack under public/estate/<edition>/
// (plan §6.4), written by scripts/estate/pack.mjs and read once per engine
// start. The types are the contract between that tool and the runtime, and
// parsePack is the gate: it rebuilds the value from known keys only, so what it
// returns is exactly what the type says, and it throws on the first problem
// with the JSON path that holds it.
//
// Beyond types it holds the invariants the loader relies on:
//  - every FileRef path is relative, forward-slashed, inside the pack
//    (^[A-Za-z0-9._/-]+$, no leading '/', no '.' or '..' segment), under its
//    class's folder, unique, and named by its raw payload's sha256 (C9);
//  - a class is listed in `classes` exactly when its files are present for all
//    14 buildings (the pack lists only what it emitted), and totals.byClass
//    adds those files' bytes up exactly;
//  - every site's storeys are the canonical list in lib/estate/ids.ts, with
//    the same FFLs, and one walk layer each (layer i is storey i); the pack's
//    palette maps each slot to lib/estate/palette.json's material: a pack built
//    against other code fails here rather than drawing wrong colours. Tokens and
//    roles are the runtime's (palette.json), so a token edit needs no re-pack;
//  - pack.sites comes back in ESTATE_SITE_IDS order whatever order the file
//    lists them in, so a site's index is the same in the pack, LodSelector and
//    the scheduler's views.
//
// Every coordinate field names its frame (frames.ts). Estate frame (Z up, m):
// a site's `at`, `bounds`, the `radius` sphere about the bounds' centre, and
// every spawn. Block-local (Z up, m, the building's IfcBuilding origin):
// `footprint`, `roofTop`, storey `ffl` and walk.grid.origin, which is where the
// walk grids, nav files and storeys.ts work. parsePack checks the two agree
// (the footprint, moved by `at`, inside `bounds`), so a writer that emits
// block-local bounds fails here instead of culling every building wrongly.
//
// Three places differ from the plan's sketch. A file without a FileRef cannot
// be hash-checked, so the massing GLB (one file, 14 meshes, named by each
// site's `massing.mesh`) is the top-level `massing`, and `stage0` lists paths
// that must each be one of the pack's files. The bus-stop spawns belong to no
// building (upstream's SITE), so they are `site.spawns`. A walk grid may be the
// 0.2 m coarse fallback (plan §5.2, SN5W flag bit1) for any one building.

export const ESTATE_PACK_SCHEMA = 'portfolio/estate-pack/1';
export const ESTATE_PACK_EDITION = 'v1.2';
export const ESTATE_PACK_CLASSES = ['poster', 's0', 'f', 'd', 'i', 'w', 'nav', 'ground'] as const;
export type Klass = (typeof ESTATE_PACK_CLASSES)[number];
export const ESTATE_PACK_FRAME =
  'three world = estate (x, z, -y); building root = (at.x, 0, -at.y); glTF block-local Y-up; walk/nav block-local Z-up';
export const ESTATE_REPO = 'https://github.com/Rah-Rah-Mitra/Bonsai-Estate';
export const PACK_PATH = /^[A-Za-z0-9._/-]+$/;

/** The folder each class's files live in, relative to the pack root. */
export const CLASS_DIR: Readonly<Record<Klass, string>> = {
  poster: 'poster', s0: 's0', f: 'f', d: 'd', i: 'i', w: 'w', nav: 'nav', ground: 'site',
};

type Vec4 = [number, number, number, number];

/** One pack file. `bytes` travel (gzip for .gz); sha256 is of the raw payload and names the file. */
export interface FileRef { path: string; bytes: number; rawBytes: number; sha256: string; gzSha256: string }
export interface Geo extends FileRef { tris: number; verts: number; prims: number; draws: number; maxPrimVerts: number }

export interface PackSource {
  repo: typeof ESTATE_REPO;
  tag: typeof ESTATE_PACK_EDITION;
  /** The submodule gitlink, 40 hex. */
  commit: string;
  buildCommit: string;
  manifestSha256: string;
  exportInfoSha256: string;
  assets: { name: string; sha256: string; bytes: number }[];
  /**
   * Present (and true) only on a pack built with `--dev-src` from an extracted
   * export: the provenance gates were skipped and the hashes above describe
   * whatever was on disk. The pack tool never writes one under public/, and
   * scripts/estate/check.mjs refuses one there.
   */
  dev?: true;
}
export interface PackTool { pipeline: 'scripts/estate/pack.mjs'; gltfTransform: '4.5.1'; meshoptimizer: '1.3.0'; node: '24' }
export interface PackLicence { data: 'CC-BY-4.0'; attribution: string; url: '/estate/LICENSE.txt' }
export interface PackEstate { name: typeof ESTATE_NAME; code: 'SN5'; extent: [0, 0, 400, 400]; flats: 1206; storeys: 245 }
/** The pack tool's record of the palette it baked. Only slot ↔ material is binding; role and token are informative. */
export interface PackPaletteEntry { slot: number; material: string; role: string; token: PaletteToken; source: Vec4 }
/**
 * The poster's camera, from upstream's ESTATE_views.json (render.py camera_info)
 * — still in Blender's terms. `eye` is in the estate frame (Z up, m) and `quat`
 * (x, y, z, w) is the camera's rotation in that frame for a camera that looks
 * down its local −Z with +Y up, so the engine pre-multiplies by the estate →
 * three rotation (frames.ts) before using either. `vfovDeg` is the vertical
 * field of view at `aspect` (render width / height). `shift` is Blender's lens
 * shift, in units of the larger image side (sensor_fit AUTO).
 */
export interface AerialView { eye: Vec3; quat: Vec4; vfovDeg: number; shift: Vec2; aspect: number }
export interface PackViews { aerialNE?: AerialView }

export interface SiteQuadrant { mesh: string; bounds: [Vec3, Vec3]; tris: number }
export interface SiteTrees { species: string; instances: number; tris: number; crownTris: number }
export interface GroundRef extends FileRef { cell: 0.5; lo: Vec2; nx: number; ny: number }
/** A spawn point, estate frame: `pos` m, `facing` a plan direction. */
export interface PackSpawn { name: string; pos: Vec3; facing: Vec2; kind: 'entrance' | 'bus' }
/** SITE: ground, structures and trees. Not a building and not an EstateSiteId. Quadrant bounds are estate frame. */
export interface PackSiteLayer {
  file: Geo;
  quadrants: SiteQuadrant[];
  trees: SiteTrees[];
  ground?: GroundRef;
  /** The bus-stop spawns (kind 'bus'): BS1, where Walk can start (§8.1). */
  spawns?: PackSpawn[];
}

export interface PackStorey { tag: EstateStoreyTag; name: string; ffl: number; geom: 'typical' | 'special'; walkLayer: number }
export interface PackFurniture { kit: string; instances: number; tris: number; proxyTris: number }
/**
 * One building's interior file. Its nodes keep their TRS (KHR_mesh_quantization
 * puts each mesh's dequantisation there): `typical` is T, stored relative to its
 * storey floor with storey byte 255 and no `_STOREY`, so the engine instances it
 * itself with instance matrix T(0, FFL_i, 0) · M_node (mesh matrix identity) and
 * masks it per instance, not by `_meta.z`; `residual` and `special_<tag>` are
 * absolute with storey tags; furniture batches carry `_STOREY` like D.
 */
export interface PackInterior extends Geo {
  typicalTris: number;
  residualTris: number;
  specials: { tag: EstateStoreyTag; tris: number }[];
  furniture?: PackFurniture[];
  /**
   * Per storey: the triangles its upstream chunk stores that are neither
   * furniture (counted by instance in `furniture`) nor lift cars (dropped),
   * counted from the chunk itself; and what the pack draws for that storey
   * (T + R_s on a typical storey, its special mesh otherwise). Equal, or the
   * pack lost geometry.
   */
  sourceTris: Record<string, number>;
  drawnTris: Record<string, number>;
}
/**
 * One building's SN5W walk grid. `origin` is block-local; `cell` is 0.1 m, or
 * 0.2 m where upstream fell back to the coarse grid (the file's header says
 * the same through flag bit1). One layer per storey, in storey order.
 */
export interface PackWalk extends FileRef { grid: { origin: Vec2; nx: number; ny: number; cell: 0.1 | 0.2 }; layers: number }
export type Typology = 'PT4' | 'SL' | 'LB' | 'SL (EA)';

export interface PackBuilding {
  id: EstateSiteId;
  kind: EstateSiteKind;
  /** The manifest's own name: 'Blk 509', 'Multi-storey car park 513'. */
  name: string;
  typology: Typology | null;
  /** Estate frame: where the block-local origin sits (three: (at.x, 0, −at.y)). */
  at: Vec2;
  /** Estate frame, [min, max]: the culling and distance box (frames.pointBoxDistance). */
  bounds: [Vec3, Vec3];
  /** Bounding sphere about the bounds' centre, m; at least half the box's diagonal. */
  radius: number;
  /** Block-local plan outline, one ring (storeys.ts' inside/peeking tests). */
  footprint: Vec2[];
  /** Block-local Z of the roof top, m. */
  roofTop: number;
  /** Bottom-up, the canonical list in ids.ts; `walkLayer` is the storey's own index. */
  storeys: PackStorey[];
  massing?: { mesh: string; tris: number; error: number };
  /** Shell plus one panel per window (one-sided) and per exterior door (both sides); `tris` is what the file stores. */
  facade?: Geo & { error: 0.06; edges: number; exactMatched: number };
  /** `tris` counts every instance drawn (what the LOD budget adds to F's); every other `tris` counts what a file stores. */
  detail?: Geo & { instances: number };
  interior?: PackInterior;
  walk?: PackWalk;
  /**
   * nav/<ID>.<h8>.json.gz: gzipped JSON (portfolio/estate-nav/1, block-local Z
   * up): storeys, rooms, lift landings, passable doors, stairs, spawns.
   */
  nav?: FileRef;
  /** Entrance spawns (kind 'entrance'), estate frame. */
  spawns: PackSpawn[];
}

export interface PackTotals {
  /** stage0 files' bytes; may include pack.json's own gzip, so ≥ their sum. */
  stage0Bytes: number;
  /** The whole pack; ≥ the sum of byClass for the same reason. */
  bytes: number;
  /** Exactly the summed `bytes` of each listed class's files. */
  byClass: Partial<Record<Klass, number>>;
}

export interface EstatePack {
  schema: typeof ESTATE_PACK_SCHEMA;
  edition: typeof ESTATE_PACK_EDITION;
  classes: Klass[];
  source: PackSource;
  tool: PackTool;
  licence: PackLicence;
  frame: typeof ESTATE_PACK_FRAME;
  estate: PackEstate;
  palette: PackPaletteEntry[];
  views: PackViews;
  posters: FileRef[];
  stage0?: string[];
  massing?: Geo;
  site?: PackSiteLayer;
  /** All 14, in ESTATE_SITE_IDS order: sites[i].id === ESTATE_SITE_IDS[i]. */
  sites: PackBuilding[];
  totals: PackTotals;
  warnings: string[];
}

// ---- validation primitives ----------------------------------------------------------

export class EstatePackError extends Error {
  readonly path: string;
  constructor(path: string, problem: string) {
    super(`${path}: ${problem}`);
    this.name = 'EstatePackError';
    this.path = path;
  }
}

const show = (v: unknown): string => {
  if (v === undefined) return 'nothing';
  if (typeof v === 'number') return String(v);
  const text = JSON.stringify(v) ?? typeof v;
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
};

const fail = (path: string, problem: string): never => { throw new EstatePackError(path, problem); };

type Obj = Record<string, unknown>;

// An object with exactly these keys (optional ones may be absent). Required
// keys are checked in the order given, so a fixture missing `sha256` says so.
const object = (v: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Obj => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail(path, `expected an object, got ${show(v)}`);
  const o = v as Obj;
  for (const key of required) if (o[key] === undefined) fail(`${path}.${key}`, 'missing');
  for (const key of Object.keys(o)) if (!required.includes(key) && !optional.includes(key)) fail(`${path}.${key}`, 'unknown key');
  return o;
};

const array = (v: unknown, path: string, minLength = 0): unknown[] => {
  if (!Array.isArray(v)) return fail(path, `expected an array, got ${show(v)}`);
  if (v.length < minLength) fail(path, `expected at least ${minLength} entries, got ${v.length}`);
  return v;
};

const string = (v: unknown, path: string, allowEmpty = false): string => {
  if (typeof v !== 'string') return fail(path, `expected a string, got ${show(v)}`);
  if (!allowEmpty && !v.trim()) fail(path, 'expected a non-empty string');
  return v;
};

const finite = (v: unknown, path: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fail(path, `expected a finite number, got ${show(v)}`);
  return v;
};

const integer = (v: unknown, path: string, min: number): number => {
  const n = finite(v, path);
  if (!Number.isInteger(n) || n < min) fail(path, `expected an integer ≥ ${min}, got ${show(v)}`);
  return n;
};

const positive = (v: unknown, path: string): number => {
  const n = finite(v, path);
  if (!(n > 0)) fail(path, `expected a positive number, got ${show(v)}`);
  return n;
};

const literal = <T extends string | number>(v: unknown, path: string, expected: T, what = 'value'): T => {
  if (v !== expected) fail(path, `unknown ${what} ${show(v)} (this build reads ${show(expected)})`);
  return expected;
};

const oneOf = <T extends string>(v: unknown, path: string, options: readonly T[]): T => {
  if (!options.includes(v as T)) fail(path, `expected one of ${options.map((o) => show(o)).join(', ')}, got ${show(v)}`);
  return v as T;
};

const vec = <N extends 2 | 3 | 4>(v: unknown, path: string, n: N): N extends 2 ? Vec2 : N extends 3 ? Vec3 : Vec4 => {
  const a = array(v, path);
  if (a.length !== n) fail(path, `expected ${n} numbers, got ${show(v)}`);
  return a.map((c, i) => finite(c, `${path}[${i}]`)) as N extends 2 ? Vec2 : N extends 3 ? Vec3 : Vec4;
};

const box = (v: unknown, path: string): [Vec3, Vec3] => {
  const a = array(v, path);
  if (a.length !== 2) fail(path, `expected [min, max], got ${show(v)}`);
  const lo = vec(a[0], `${path}[0]`, 3);
  const hi = vec(a[1], `${path}[1]`, 3);
  if (lo.some((c, i) => c > hi[i])) fail(path, 'min exceeds max');
  return [lo, hi];
};

const hex = (v: unknown, path: string, digits: 40 | 64): string => {
  if (v === undefined) return fail(path, 'missing');
  if (typeof v !== 'string' || !new RegExp(`^[0-9a-f]{${digits}}$`).test(v)) fail(path, `expected ${digits} lowercase hex digits, got ${show(v)}`);
  return v as string;
};

/** Why `path` is not a safe pack-relative path, or null when it is. Shared with the pack tool's leak scan. */
export const packPathProblem = (path: string): string | null => {
  if (!path) return 'empty path';
  if (path.includes('\\')) return 'backslash in path';
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return 'absolute path';
  const segments = path.split('/');
  if (segments.includes('..')) return "'..' segment";
  if (!PACK_PATH.test(path)) return 'characters outside [A-Za-z0-9._/-]';
  if (segments.some((s) => s === '' || s === '.')) return "empty or '.' segment";
  return null;
};

// ---- the pack ----------------------------------------------------------------------

const FILE_KEYS = ['path', 'bytes', 'rawBytes', 'sha256', 'gzSha256'] as const;
const GEO_KEYS = [...FILE_KEYS, 'tris', 'verts', 'prims', 'draws', 'maxPrimVerts'] as const;

interface Ledger { paths: Map<string, Klass>; sizes: Map<string, number>; bytes: Record<Klass, number>; files: Record<Klass, number> }

const readFile = (o: Obj, path: string, klass: Klass, ledger: Ledger): FileRef => {
  const where = `${path}.path`;
  const file = string(o.path, where);
  const problem = packPathProblem(file);
  if (problem) fail(where, `${problem}: ${show(file)}`);
  const ref: FileRef = {
    path: file,
    bytes: integer(o.bytes, `${path}.bytes`, 1),
    rawBytes: integer(o.rawBytes, `${path}.rawBytes`, 1),
    sha256: hex(o.sha256, `${path}.sha256`, 64),
    gzSha256: hex(o.gzSha256, `${path}.gzSha256`, 64),
  };
  if (!file.startsWith(`${CLASS_DIR[klass]}/`)) fail(where, `class ${klass} files live under ${CLASS_DIR[klass]}/, got ${show(file)}`);
  const h8 = ref.sha256.slice(0, 8);
  if (!file.slice(file.lastIndexOf('/') + 1).includes(`.${h8}.`)) fail(where, `name must carry .${h8}. (its sha256), got ${show(file)}`);
  if (ledger.paths.has(file)) fail(where, `${show(file)} is listed twice`);
  ledger.paths.set(file, klass);
  ledger.sizes.set(file, ref.bytes);
  ledger.bytes[klass] += ref.bytes;
  ledger.files[klass] += 1;
  return ref;
};

const readGeo = (o: Obj, path: string, klass: Klass, ledger: Ledger): Geo => ({
  ...readFile(o, path, klass, ledger),
  tris: integer(o.tris, `${path}.tris`, 0),
  verts: integer(o.verts, `${path}.verts`, 0),
  prims: integer(o.prims, `${path}.prims`, 0),
  draws: integer(o.draws, `${path}.draws`, 0),
  maxPrimVerts: integer(o.maxPrimVerts, `${path}.maxPrimVerts`, 0),
});

const fileRef = (v: unknown, path: string, klass: Klass, ledger: Ledger) =>
  readFile(object(v, path, FILE_KEYS), path, klass, ledger);

const source = (v: unknown, path: string): PackSource => {
  const o = object(v, path, ['repo', 'tag', 'commit', 'buildCommit', 'manifestSha256', 'exportInfoSha256', 'assets'], ['dev']);
  if (o.dev !== undefined && o.dev !== true) fail(`${path}.dev`, `expected true or nothing, got ${show(o.dev)}`);
  return {
    ...(o.dev === true ? { dev: true as const } : {}),
    repo: literal(o.repo, `${path}.repo`, ESTATE_REPO),
    tag: literal(o.tag, `${path}.tag`, ESTATE_PACK_EDITION, 'tag'),
    commit: hex(o.commit, `${path}.commit`, 40),
    buildCommit: hex(o.buildCommit, `${path}.buildCommit`, 40),
    manifestSha256: hex(o.manifestSha256, `${path}.manifestSha256`, 64),
    exportInfoSha256: hex(o.exportInfoSha256, `${path}.exportInfoSha256`, 64),
    assets: array(o.assets, `${path}.assets`, 1).map((a, i) => {
      const at = `${path}.assets[${i}]`;
      const asset = object(a, at, ['name', 'sha256', 'bytes']);
      const name = string(asset.name, `${at}.name`);
      if (!/^[A-Za-z0-9._-]+$/.test(name)) fail(`${at}.name`, `expected a bare file name, got ${show(name)}`);
      return { name, sha256: hex(asset.sha256, `${at}.sha256`, 64), bytes: integer(asset.bytes, `${at}.bytes`, 1) };
    }),
  };
};

const tool = (v: unknown, path: string): PackTool => {
  const o = object(v, path, ['pipeline', 'gltfTransform', 'meshoptimizer', 'node']);
  return {
    pipeline: literal(o.pipeline, `${path}.pipeline`, 'scripts/estate/pack.mjs'),
    gltfTransform: literal(o.gltfTransform, `${path}.gltfTransform`, '4.5.1'),
    meshoptimizer: literal(o.meshoptimizer, `${path}.meshoptimizer`, '1.3.0'),
    node: literal(o.node, `${path}.node`, '24'),
  };
};

const licence = (v: unknown, path: string): PackLicence => {
  const o = object(v, path, ['data', 'attribution', 'url']);
  return {
    data: literal(o.data, `${path}.data`, 'CC-BY-4.0'),
    attribution: string(o.attribution, `${path}.attribution`),
    url: literal(o.url, `${path}.url`, '/estate/LICENSE.txt'),
  };
};

const estate = (v: unknown, path: string): PackEstate => {
  const o = object(v, path, ['name', 'code', 'extent', 'flats', 'storeys']);
  const extent = vec(o.extent, `${path}.extent`, 4);
  if (extent.join() !== '0,0,400,400') fail(`${path}.extent`, `expected [0, 0, 400, 400], got ${show(extent)}`);
  return {
    name: literal(o.name, `${path}.name`, ESTATE_NAME),
    code: literal(o.code, `${path}.code`, 'SN5'),
    extent: [0, 0, 400, 400],
    flats: literal(o.flats, `${path}.flats`, 1206),
    storeys: literal(o.storeys, `${path}.storeys`, 245),
  };
};

const palette = (v: unknown, path: string): PackPaletteEntry[] => {
  const entries = array(v, path).map((e, i): PackPaletteEntry => {
    const at = `${path}[${i}]`;
    const o = object(e, at, ['slot', 'material', 'role', 'token', 'source']);
    const token = string(o.token, `${at}.token`);
    if (!isPaletteToken(token)) fail(`${at}.token`, `expected a --color-*/--paper-* token, got ${show(token)}`);
    const src = vec(o.source, `${at}.source`, 4);
    if (src.some((c) => c < 0 || c > 1)) fail(`${at}.source`, 'components must lie in 0–1');
    return {
      slot: integer(o.slot, `${at}.slot`, 0),
      material: string(o.material, `${at}.material`),
      role: string(o.role, `${at}.role`),
      token: token as PaletteToken,
      source: src,
    };
  });
  // The slots are baked into every vertex, so the pack's slot → material map
  // has to be this build's, entry for entry. Role and token are not baked: the
  // engine colours a slot from palette.json at mount, so a token edit there
  // needs no re-pack and the pack's own record of them is informative only.
  const expected = ESTATE_PALETTE.materials;
  if (entries.length !== expected.length) fail(path, `has ${entries.length} materials; lib/estate/palette.json has ${expected.length}: rebuild the pack`);
  entries.forEach((entry, i) => {
    const want = expected.find((m) => m.slot === entry.slot);
    if (!want || want.material !== entry.material) {
      fail(`${path}[${i}]`, `slot ${entry.slot} is ${show(entry.material)} here but ${want ? show(want.material) : 'unused'} in lib/estate/palette.json: rebuild the pack`);
    }
  });
  if (new Set(entries.map((e) => e.slot)).size !== entries.length) fail(path, 'a slot is listed twice');
  return entries;
};

const views = (v: unknown, path: string): PackViews => {
  const o = object(v, path, [], ['aerialNE']);
  if (o.aerialNE === undefined) return {};
  const at = `${path}.aerialNE`;
  const a = object(o.aerialNE, at, ['eye', 'quat', 'vfovDeg', 'shift', 'aspect']);
  const quat = vec(a.quat, `${at}.quat`, 4);
  // A non-unit quaternion would scale the camera, not just turn it.
  if (Math.abs(Math.hypot(...quat) - 1) > 1e-3) fail(`${at}.quat`, `expected a unit quaternion, got length ${Math.hypot(...quat)}`);
  const vfovDeg = positive(a.vfovDeg, `${at}.vfovDeg`);
  if (vfovDeg >= 180) fail(`${at}.vfovDeg`, `expected under 180, got ${vfovDeg}`);
  return { aerialNE: { eye: vec(a.eye, `${at}.eye`, 3), quat, vfovDeg, shift: vec(a.shift, `${at}.shift`, 2), aspect: positive(a.aspect, `${at}.aspect`) } };
};

const spawnList = (v: unknown, path: string, kind: PackSpawn['kind']): PackSpawn[] =>
  array(v, path).map((s, i): PackSpawn => {
    const at = `${path}[${i}]`;
    const spawn = object(s, at, ['name', 'pos', 'facing', 'kind']);
    const facing = vec(spawn.facing, `${at}.facing`, 2);
    if (facing[0] === 0 && facing[1] === 0) fail(`${at}.facing`, 'expected a direction, got [0, 0]');
    return {
      name: string(spawn.name, `${at}.name`),
      pos: vec(spawn.pos, `${at}.pos`, 3),
      facing,
      kind: literal(spawn.kind, `${at}.kind`, kind, 'spawn kind'),
    };
  });

const siteLayer = (v: unknown, path: string, ledger: Ledger): PackSiteLayer => {
  const o = object(v, path, ['file', 'quadrants', 'trees'], ['ground', 'spawns']);
  const file = readGeo(object(o.file, `${path}.file`, GEO_KEYS), `${path}.file`, 's0', ledger);
  const quadrants = array(o.quadrants, `${path}.quadrants`).map((q, i) => {
    const at = `${path}.quadrants[${i}]`;
    const quad = object(q, at, ['mesh', 'bounds', 'tris']);
    return { mesh: string(quad.mesh, `${at}.mesh`), bounds: box(quad.bounds, `${at}.bounds`), tris: integer(quad.tris, `${at}.tris`, 0) };
  });
  const trees = array(o.trees, `${path}.trees`).map((t, i) => {
    const at = `${path}.trees[${i}]`;
    const tree = object(t, at, ['species', 'instances', 'tris', 'crownTris']);
    return {
      species: string(tree.species, `${at}.species`),
      instances: integer(tree.instances, `${at}.instances`, 0),
      tris: integer(tree.tris, `${at}.tris`, 0),
      crownTris: integer(tree.crownTris, `${at}.crownTris`, 0),
    };
  });
  const layer: PackSiteLayer = { file, quadrants, trees };
  if (o.ground !== undefined) {
    const at = `${path}.ground`;
    const g = object(o.ground, at, [...FILE_KEYS, 'cell', 'lo', 'nx', 'ny']);
    layer.ground = {
      ...readFile(g, at, 'ground', ledger),
      cell: literal(g.cell, `${at}.cell`, 0.5, 'cell size'),
      lo: vec(g.lo, `${at}.lo`, 2),
      nx: integer(g.nx, `${at}.nx`, 1),
      ny: integer(g.ny, `${at}.ny`, 1),
    };
  }
  if (o.spawns !== undefined) layer.spawns = spawnList(o.spawns, `${path}.spawns`, 'bus');
  return layer;
};

const TYPOLOGIES: readonly Typology[] = ['PT4', 'SL', 'LB', 'SL (EA)'];
const BUILDING_KEYS = ['id', 'kind', 'name', 'typology', 'at', 'bounds', 'radius', 'footprint', 'roofTop', 'storeys', 'spawns'] as const;
const BUILDING_OPTIONAL = ['massing', 'facade', 'detail', 'interior', 'walk', 'nav'] as const;

// A record keyed by this site's storey tags.
const storeyCounts = (v: unknown, path: string, tags: readonly string[]): Record<string, number> => {
  const o = object(v, path, [], tags);
  return Object.fromEntries(Object.entries(o).map(([tag, n]) => [tag, integer(n, `${path}.${tag}`, 0)]));
};

const building = (v: unknown, path: string, ledger: Ledger): PackBuilding => {
  const o = object(v, path, BUILDING_KEYS, BUILDING_OPTIONAL);
  if (!isEstateSiteId(o.id)) return fail(`${path}.id`, `unknown site id ${show(o.id)}`);
  const id = o.id;
  const kind = literal(o.kind, `${path}.kind`, siteKindOf(id), 'kind');
  const typology = kind === 'block'
    ? oneOf(o.typology, `${path}.typology`, TYPOLOGIES)
    : (o.typology === null ? null : fail(`${path}.typology`, `expected null for a ${kind}, got ${show(o.typology)}`));

  const tags = ESTATE_SITE_STOREYS[id];
  const ffls = ESTATE_STOREY_FFL[id];
  const storeyList = array(o.storeys, `${path}.storeys`);
  if (storeyList.length !== tags.length) fail(`${path}.storeys`, `expected ${tags.length} storeys (${tags[0]}…${tags[tags.length - 1]}), got ${storeyList.length}`);
  const storeys = storeyList.map((s, i): PackStorey => {
    const at = `${path}.storeys[${i}]`;
    const storey = object(s, at, ['tag', 'name', 'ffl', 'geom', 'walkLayer']);
    const tag = literal(storey.tag, `${at}.tag`, tags[i], 'storey tag');
    const ffl = finite(storey.ffl, `${at}.ffl`);
    if (Math.abs(ffl - ffls[i]) > 5e-4) fail(`${at}.ffl`, `${tag} sits at ${ffls[i]} m in lib/estate/ids.ts, got ${ffl}`);
    return {
      tag,
      name: string(storey.name, `${at}.name`),
      ffl,
      geom: oneOf(storey.geom, `${at}.geom`, ['typical', 'special'] as const),
      walkLayer: literal(storey.walkLayer, `${at}.walkLayer`, i, 'walk layer'),
    };
  });

  const footprint = array(o.footprint, `${path}.footprint`, 3).map((p, i) => vec(p, `${path}.footprint[${i}]`, 2));
  const spawns = spawnList(o.spawns, `${path}.spawns`, 'entrance');

  const out: PackBuilding = {
    id, kind, name: string(o.name, `${path}.name`), typology,
    at: vec(o.at, `${path}.at`, 2),
    bounds: box(o.bounds, `${path}.bounds`),
    radius: positive(o.radius, `${path}.radius`),
    footprint,
    roofTop: finite(o.roofTop, `${path}.roofTop`),
    storeys,
    spawns,
  };
  checkFrames(out, path);

  if (o.massing !== undefined) {
    const at = `${path}.massing`;
    const m = object(o.massing, at, ['mesh', 'tris', 'error']);
    out.massing = { mesh: string(m.mesh, `${at}.mesh`), tris: integer(m.tris, `${at}.tris`, 0), error: finite(m.error, `${at}.error`) };
    if (out.massing.error < 0) fail(`${at}.error`, 'expected ≥ 0');
  }
  if (o.facade !== undefined) {
    const at = `${path}.facade`;
    const f = object(o.facade, at, [...GEO_KEYS, 'error', 'edges', 'exactMatched']);
    out.facade = {
      ...readGeo(f, at, 'f', ledger),
      error: literal(f.error, `${at}.error`, 0.06, 'façade error'),
      edges: integer(f.edges, `${at}.edges`, 0),
      exactMatched: integer(f.exactMatched, `${at}.exactMatched`, 0),
    };
  }
  if (o.detail !== undefined) {
    const at = `${path}.detail`;
    const d = object(o.detail, at, [...GEO_KEYS, 'instances']);
    out.detail = { ...readGeo(d, at, 'd', ledger), instances: integer(d.instances, `${at}.instances`, 0) };
  }
  if (o.interior !== undefined) {
    const at = `${path}.interior`;
    const n = object(o.interior, at, [...GEO_KEYS, 'typicalTris', 'residualTris', 'specials', 'sourceTris', 'drawnTris'], ['furniture']);
    const interior: PackInterior = {
      ...readGeo(n, at, 'i', ledger),
      typicalTris: integer(n.typicalTris, `${at}.typicalTris`, 0),
      residualTris: integer(n.residualTris, `${at}.residualTris`, 0),
      specials: array(n.specials, `${at}.specials`).map((s, i) => {
        const sp = object(s, `${at}.specials[${i}]`, ['tag', 'tris']);
        return { tag: oneOf(sp.tag, `${at}.specials[${i}].tag`, tags), tris: integer(sp.tris, `${at}.specials[${i}].tris`, 0) };
      }),
      sourceTris: storeyCounts(n.sourceTris, `${at}.sourceTris`, tags),
      drawnTris: storeyCounts(n.drawnTris, `${at}.drawnTris`, tags),
    };
    if (n.furniture !== undefined) {
      interior.furniture = array(n.furniture, `${at}.furniture`).map((k, i) => {
        const kit = object(k, `${at}.furniture[${i}]`, ['kit', 'instances', 'tris', 'proxyTris']);
        const where = `${at}.furniture[${i}]`;
        return {
          kit: string(kit.kit, `${where}.kit`),
          instances: integer(kit.instances, `${where}.instances`, 0),
          tris: integer(kit.tris, `${where}.tris`, 0),
          proxyTris: integer(kit.proxyTris, `${where}.proxyTris`, 0),
        };
      });
    }
    out.interior = interior;
  }
  if (o.walk !== undefined) {
    const at = `${path}.walk`;
    const w = object(o.walk, at, [...FILE_KEYS, 'grid', 'layers']);
    const grid = object(w.grid, `${at}.grid`, ['origin', 'nx', 'ny', 'cell']);
    out.walk = {
      ...readFile(w, at, 'w', ledger),
      grid: {
        origin: vec(grid.origin, `${at}.grid.origin`, 2),
        nx: integer(grid.nx, `${at}.grid.nx`, 1),
        ny: integer(grid.ny, `${at}.grid.ny`, 1),
        cell: grid.cell === 0.1 || grid.cell === 0.2 ? grid.cell
          : fail(`${at}.grid.cell`, `expected 0.1, or 0.2 for the coarse fallback, got ${show(grid.cell)}`),
      },
      layers: integer(w.layers, `${at}.layers`, 1),
    };
    // One layer per storey (walk.ts reads layer i as storey i).
    if (out.walk.layers !== tags.length) fail(`${at}.layers`, `expected ${tags.length}, one per storey, got ${out.walk.layers}`);
  }
  if (o.nav !== undefined) out.nav = fileRef(o.nav, `${path}.nav`, 'nav', ledger);
  return out;
};

// How far a block-local footprint may stray past the estate-frame bounds once
// moved by `at`, m (both are written to the mm); and how far from its own box
// an entrance spawn may stand (void decks put them 1.5 m out, the NC's in its
// forecourt).
const FRAME_SLACK = 0.05;
const SPAWN_REACH = 25;

// The frame contract in the header: bounds are estate frame, the footprint is
// block-local. A writer that put either in the other frame lands far outside.
const checkFrames = (b: PackBuilding, path: string) => {
  const [lo, hi] = b.bounds;
  const p: Vec3 = [0, 0, 0];
  b.footprint.forEach((point, i) => {
    localToEstate([point[0], point[1], 0], b, p);
    if (p[0] < lo[0] - FRAME_SLACK || p[0] > hi[0] + FRAME_SLACK || p[1] < lo[1] - FRAME_SLACK || p[1] > hi[1] + FRAME_SLACK) {
      fail(`${path}.footprint[${i}]`, `block-local ${show(point)} lands at estate (${p[0]}, ${p[1]}), outside bounds ${show(b.bounds)}: bounds are estate frame, the footprint block-local`);
    }
  });
  const half = 0.5 * Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  if (b.radius < half - 1e-3) fail(`${path}.radius`, `${b.radius} m does not enclose bounds about their centre (needs ${half})`);
  b.spawns.forEach((spawn, i) => {
    const gap = pointBoxDistance([spawn.pos[0], spawn.pos[1], lo[2]], lo, hi);
    if (gap > SPAWN_REACH) fail(`${path}.spawns[${i}].pos`, `${show(spawn.pos)} is ${gap.toFixed(1)} m from the building's bounds: spawns are estate frame`);
  });
};

const BUILDING_CLASS: ReadonlyArray<readonly [Klass, keyof PackBuilding]> = [
  ['s0', 'massing'], ['f', 'facade'], ['d', 'detail'], ['i', 'interior'], ['w', 'walk'], ['nav', 'nav'],
];

/**
 * Validates an unknown value (JSON.parse of pack.json) as an EstatePack and
 * returns a fresh copy holding only the known keys. Throws EstatePackError,
 * whose message starts with the JSON path at fault: `pack.sites[3].facade.sha256: missing`.
 */
export const parsePack = (input: unknown): EstatePack => {
  const root = 'pack';
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail(root, `expected an object, got ${show(input)}`);
  const raw = input as Obj;
  // Schema and edition first: a newer pack read by older code should say so,
  // not trip over the first key it has never heard of.
  const schema = literal(raw.schema, `${root}.schema`, ESTATE_PACK_SCHEMA, 'schema');
  const edition = literal(raw.edition, `${root}.edition`, ESTATE_PACK_EDITION, 'edition');
  const o = object(input, root, [
    'schema', 'edition', 'classes', 'source', 'tool', 'licence', 'frame', 'estate', 'palette', 'views', 'posters', 'sites', 'totals', 'warnings',
  ], ['stage0', 'massing', 'site']);

  const classes = array(o.classes, `${root}.classes`, 1).map((c, i) => oneOf(c, `${root}.classes[${i}]`, ESTATE_PACK_CLASSES));
  if (new Set(classes).size !== classes.length) fail(`${root}.classes`, 'a class is listed twice');
  const listed = new Set<Klass>(classes);

  const zero = () => Object.fromEntries(ESTATE_PACK_CLASSES.map((k) => [k, 0])) as Record<Klass, number>;
  const ledger: Ledger = { paths: new Map(), sizes: new Map(), bytes: zero(), files: zero() };

  const pack: EstatePack = {
    schema,
    edition,
    classes,
    source: source(o.source, `${root}.source`),
    tool: tool(o.tool, `${root}.tool`),
    licence: licence(o.licence, `${root}.licence`),
    frame: literal(o.frame, `${root}.frame`, ESTATE_PACK_FRAME, 'frame'),
    estate: estate(o.estate, `${root}.estate`),
    palette: palette(o.palette, `${root}.palette`),
    views: views(o.views, `${root}.views`),
    posters: array(o.posters, `${root}.posters`).map((p, i) => fileRef(p, `${root}.posters[${i}]`, 'poster', ledger)),
    sites: [],
    totals: { stage0Bytes: 0, bytes: 0, byClass: {} },
    warnings: array(o.warnings, `${root}.warnings`).map((w, i) => string(w, `${root}.warnings[${i}]`, true)),
  };
  if (o.massing !== undefined) pack.massing = readGeo(object(o.massing, `${root}.massing`, GEO_KEYS), `${root}.massing`, 's0', ledger);
  if (o.site !== undefined) pack.site = siteLayer(o.site, `${root}.site`, ledger);

  const seen = new Set<EstateSiteId>();
  pack.sites = array(o.sites, `${root}.sites`).map((s, i) => {
    const b = building(s, `${root}.sites[${i}]`, ledger);
    if (seen.has(b.id)) fail(`${root}.sites[${i}].id`, `${b.id} is listed twice`);
    seen.add(b.id);
    return b;
  });
  const absent = ESTATE_SITE_IDS.filter((id) => !seen.has(id));
  if (absent.length) fail(`${root}.sites`, `missing ${absent.join(', ')}`);

  // A class is listed exactly when its files are there, for every building.
  const presence = (klass: Klass, has: boolean, where: string, what: string) => {
    if (listed.has(klass) && !has) fail(where, `missing (class ${klass} is listed)`);
    if (!listed.has(klass) && has) fail(where, `${what} present but class ${klass} is not listed`);
  };
  presence('poster', pack.posters.length > 0, `${root}.posters`, 'posters');
  presence('s0', pack.massing !== undefined, `${root}.massing`, 'massing file');
  presence('s0', pack.site !== undefined, `${root}.site`, 'site layer');
  presence('s0', o.stage0 !== undefined, `${root}.stage0`, 'stage0');
  presence('ground', pack.site?.ground !== undefined, `${root}.site.ground`, 'ground heights');
  pack.sites.forEach((b, i) => {
    for (const [klass, key] of BUILDING_CLASS) presence(klass, b[key] !== undefined, `${root}.sites[${i}].${key}`, key);
  });

  if (o.stage0 !== undefined) {
    const stage0 = array(o.stage0, `${root}.stage0`, 1).map((p, i) => string(p, `${root}.stage0[${i}]`));
    stage0.forEach((p, i) => {
      if (ledger.paths.get(p) !== 's0') fail(`${root}.stage0[${i}]`, `${show(p)} is not one of the pack's s0 files`);
    });
    if (new Set(stage0).size !== stage0.length) fail(`${root}.stage0`, 'a path is listed twice');
    pack.stage0 = stage0;
  }

  const t = object(o.totals, `${root}.totals`, ['stage0Bytes', 'bytes', 'byClass']);
  const byClassRaw = object(t.byClass, `${root}.totals.byClass`, [], ESTATE_PACK_CLASSES);
  const byClass: Partial<Record<Klass, number>> = {};
  for (const klass of ESTATE_PACK_CLASSES) {
    const at = `${root}.totals.byClass.${klass}`;
    if (byClassRaw[klass] === undefined) {
      if (listed.has(klass)) fail(at, `missing (class ${klass} is listed)`);
      continue;
    }
    if (!listed.has(klass)) fail(at, `class ${klass} is not listed`);
    const n = integer(byClassRaw[klass], at, 0);
    if (n !== ledger.bytes[klass]) fail(at, `${n} B, but its ${ledger.files[klass]} files add up to ${ledger.bytes[klass]} B`);
    byClass[klass] = n;
  }
  const stage0Files = (pack.stage0 ?? []).reduce((sum, p) => sum + (ledger.sizes.get(p) ?? 0), 0);
  const stage0Bytes = integer(t.stage0Bytes, `${root}.totals.stage0Bytes`, 0);
  if (stage0Bytes < stage0Files) fail(`${root}.totals.stage0Bytes`, `${stage0Bytes} B is less than its files' ${stage0Files} B`);
  const allFiles = Object.values(byClass).reduce((sum, n) => sum + (n ?? 0), 0);
  const bytes = integer(t.bytes, `${root}.totals.bytes`, 0);
  if (bytes < allFiles) fail(`${root}.totals.bytes`, `${bytes} B is less than the classes' ${allFiles} B`);
  pack.totals = { stage0Bytes, bytes, byClass };
  // By position from here on (error paths above used the file's own order):
  // index i is ESTATE_SITE_IDS[i], as in LodSelector and the scheduler's views.
  const byId = new Map(pack.sites.map((b) => [b.id, b]));
  pack.sites = ESTATE_SITE_IDS.map((id) => byId.get(id) as PackBuilding);

  return pack;
};
