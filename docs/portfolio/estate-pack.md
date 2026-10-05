# Estate pack runbook

The Estate window (WIN-07) draws Sample Town N5 from a **pack**: content-hashed,
pre-gzipped files under `public/estate/<edition>/` plus `pack.<h8>.json` and the
generated `lib/estate/catalogue.generated.ts`. This page is how to build, check
and replace it. The design is §6 of the Estate window plan; the contract the
runtime reads is `lib/estate/schema.ts` (`parsePack`).

## The tool

`scripts/estate/` is its **own package** (`package.json`, exact pins, own
lockfile): `@gltf-transform/*` 4.5.1, `meshoptimizer` 1.3.0, `gltf-validator`
2.0.0-dev.3.10 and `ffmpeg-static` 5.3.0 (the root's version). It is never a root
devDependency — `@gltf-transform/functions` pulls in `sharp`, a native libvips
build, which every Vercel install would then download — and neither Vercel nor
the root `npm ci` installs it (`.vercelignore` drops its `node_modules`).

| Command | What it does |
|---|---|
| `npm run estate:setup` | `npm --prefix scripts/estate ci` |
| `npm run estate:pack -- …` | `npm --prefix scripts/estate run pack -- …` (Node **24.x only**; any other major is refused, because pack bytes must be reproducible) |
| `npm run estate:check [-- --pack <dir>] [-- --provenance]` | `node scripts/estate/check.mjs`: no dependencies, runs on the root's node |
| `npm --prefix scripts/estate test` | the pipeline's IO tests (`node --test`, in-memory documents) |
| `node scripts/estate/harness.mjs --pack <dir> [--inspect <dir>] [--json <file>]` | parses every GLB with three@0.186.1's `GLTFLoader` + `MeshoptDecoder` (plan §6.7); checks counts, attributes (`_meta`, `_STOREY`, `instanceMatrix`), extensions, frames and the per-class caps on three's own numbers; sums the §7.11 scenarios (S1–S5, S4+D, S5+D, S4-min) against the tier caps. `--inspect` also writes `BLK_509`'s F and I decoded to plain, validated GLB with a per-storey box table (`--inspect-site <ID>` for another site). Install three first with `npm i --prefix artifacts/estate-smoke three@0.186.1` (never into a `package.json`); the `--inspect` export also needs `estate:setup`, and nothing is written under `public/` |

npm 11 prints an `allow-scripts` warning for `ffmpeg-static`: its install script
downloads the FFmpeg binary and must run. If a later npm skips it, the poster
step stops with "ffmpeg-static has no binary".

Relative paths you pass are resolved from where you ran the command (npm's
`INIT_CWD`), not from `scripts/estate`.

## Inputs and gates (§6.1)

The only real input is a **Bonsai-Estate release**: a folder holding
`SampleTownN5_<tag>_model.zip`, `…_reports.zip` and `release_manifest.json`.

```powershell
npm run estate:pack -- --zips ..\Bonsai-Estate-release\v1.2 --out artifacts\estate\v1.2            # candidate (P2)
npm run estate:pack -- --zips <downloaded> --classes poster --out public\estate\v1.2 --release      # P4a
npm run estate:pack -- --zips <downloaded> --classes poster --out public\estate\v1.2 --verify       # rebuild + compare
npm run estate:check -- --provenance
```

The tool extracts only the entries it reads to `artifacts/estate/src/<tag>/` and
refuses to pack when:

- a zip's sha256 or size differs from `release_manifest.json`, or an extracted
  entry differs from the manifest's per-entry sha256;
- `export_info.dirty` is not `false`, or sha256(`estate_manifest.json`) ≠
  `export_info.manifest_sha256`;
- any GLB or engine JSON it reads differs from `estate_manifest.json`'s `files.*`,
  or any `*_walk.bin` / `*_web.json` from `export_info.files`;
- with G the Bonsai-Estate gitlink in this repo's own index, the generator changed
  between `export_info.commit` and G (`git diff --quiet … -- estate config estate.py estate.sh estate.cmd`),
  or `release_manifest.json`'s commit is not G;
- `--release`: the submodule's `v1.2^{commit}` ≠ G, or the zips differ from the
  `source.assets` of the pack being replaced;
- any output byte trips the leak scan, or a site is rotated (`--allow-rot` to accept).

It never opens `*_nav.json`, `*.build.json`, a building's `*_lod0.glb`, IFC or
`.blend` (they are not even extracted). `scripts/estate/lib/provenance.mjs` is the
one file allowed to touch the submodule, through `git` only
(`tests/repo-hygiene.test.ts`).

### Dev mode (`--dev-src`)

Before v1.2 exists, the pipeline is exercised on an **extracted** export:

```powershell
npm run estate:pack -- --dev-src ..\Portfolio\artifacts\estate\src-dev-v1.1 --classes poster,s0,f,d,i,w,nav,ground
npm run estate:pack -- --dev-src ..\Portfolio\artifacts\estate\src-dev-v1.1 --classes poster,s0,f,d,i,w,nav,ground --verify
npm run estate:check -- --pack artifacts\estate\v1.2-dev
$env:ESTATE_PACK_DIR='artifacts/estate/v1.2-dev'; npx vitest run tests/estate-pipeline-pure.test.ts
```

It prints a banner, skips every provenance gate, stamps `pack.source.dev: true`
(`buildCommit` and `exportInfoSha256` all zeros; `assets` is one entry,
`dev-src.unverified`, hashing the input listing), refuses `--release`, refuses an
`--out` under `public/`, and writes to `artifacts/estate/v1.2-dev/` by default
(the catalogue and a `report.json` land beside the pack). Missing inputs fall
back with a warning: no `*_walk.bin` drops class `w`; no `*_web.json` leaves every
door closed and the nav files without stairs; no `ESTATE_views.json` leaves
`views` empty. The manifest hash checks still run. `estate:check` refuses a dev
pack under `public/`.

## Classes and phases (§6.3)

| Class | Files | Committed in |
|---|---|---|
| `poster` | `poster/aerial-1600.<h8>.webp`, `aerial-800.<h8>.webp`, `aerial-800.<h8>.jpg` | P4a |
| `s0` | `s0/massing.<h8>.glb.gz` (14 meshes), `s0/site.<h8>.glb.gz` | P4b |
| `f`, `d` | `f/<ID>.<h8>.glb.gz`, `d/<ID>.<h8>.glb.gz` ×14 | P4b |
| `i`, `w`, `nav`, `ground` | `i/<ID>.<h8>.glb.gz`, `w/<ID>.<h8>.walk.gz`, `nav/<ID>.<h8>.json` ×14, `site/ground.<h8>.bin.gz` | P5 |

`pack.json` lists only the classes it emitted, and a class is present for all 14
buildings or not at all. Content is deterministic, so a later run reproduces the
earlier classes byte for byte. `ground` lives in the site layer, so it needs `s0`.

## What the files hold (the runtime's side of the contract)

All GLBs: `EXT_meshopt_compression` + `KHR_mesh_quantization` (positions 14-bit
for massing, F and site; 16-bit for D and I), plus `EXT_mesh_gpu_instancing`
where noted. Every primitive has exactly `POSITION` and **`_META`, u8 × 4: x =
palette slot (`lib/estate/palette.json`), z = storey index, y = w = 0** (three's
GLTFLoader lower-cases it to `_meta`). No normals (flat shading), no UVs, no
textures, no extras. Three materials by name: `opaque`, `glass` (BLEND) and
`edge` (lines); the runtime ignores their factors and colours by slot. Frames:
building GLBs are block-local glTF Y-up (three: put the building root at
`(at.x, 0, −at.y)`); site is estate frame Y-up.

| File | Nodes (by name) | Notes |
|---|---|---|
| `s0/massing` | one per site id, mesh `<ID>_massing` | LOD2 `ext` + `roof`, one primitive each; `sites[].massing.error` is the p90 distance of the LOD1 shell's vertices from it |
| `s0/site` | `quadrant_<qx>_<qy>` ×4 (200 m); `tree_<species>` and `crown_<species>` batches | shelter glass is drawn opaque; crowns are 8-triangle octahedra over each species' foliage box |
| `f/<ID>` | `facade`: triangles (≤ 65,535 vertices per primitive) + one LINES primitive | shell + one 2-triangle panel per window (glass mid-plane) and per exterior door (closed leaf's mid-plane); every triangle and line carries its storey |
| `d/<ID>` | one batch per kit, named after upstream's mesh (`L1_W-1800x800`) | window frames (glass dropped: F's panel stands in) and whole exterior doors; instance attribute **`_STOREY`, u8 × 4, x = storey**; a kit's own `_META.z` is 0 (kits, furniture and trees take their storey per instance) |
| `i/<ID>` | `typical`, `residual`, `special_<tag>`, `furniture_<kit>` / `proxy_<kit>` batches | `typical` is T **relative to its floor** (y = 0 at FFL), storey byte 255, to be instanced at each typical storey's FFL; `residual` and specials are absolute with storey tags; glass is a separate `glass` primitive using the `glass-interior` slot; furniture carries `_STOREY` like D |

`_STOREY` is four bytes, not one: gltf-transform 4.5.1 meshopt-encodes a 1-byte
instance attribute with a 4-byte stride and writes no `bufferView.byteStride`,
so readers (three included) unpack it as garbage. The tool decodes every batch
it writes and compares the storeys (`storeyRoundTrip`).

Counting in `pack.json` (`Geo`): `tris`, `verts`, `prims` are what the file stores
(`draws` = primitives), **except `detail.tris`, which counts every instance** —
what D draws, which is what the LOD budget adds to F's. `interior.sourceTris` and
`drawnTris` are per storey without furniture (kits are listed with instances)
and are equal by construction.

`nav/<ID>.json` (`portfolio/estate-nav/1`, block-local Z-up, 0.01 m, no GUIDs):
`storeys` (tag, FFL, typical/special), `roomHeight` (the commonest; a room
carries `h` only when it differs, `z` only when its floor is off the FFL),
`rooms` (`typical`: one storey's rooms with `{S}` = `5` and `{SS}` = `05` name
templates plus the storeys they expand to; `storeys`: every other storey
explicitly — the tool refuses a file that does not expand back exactly), `lifts`
(`landings{tag: {xy, facing}}` 0.4 m out from each landing door on the lobby
side, facing out of the car), `spawns`, and `stairs` from `<ID>_web.json` (0.001 m).

`site/ground.bin` is **SN5G** v1 (`lib/pure/sn5w.mjs`): 32-byte header
(`SN5G`, version 1, f32 cell 0.5, f32 lo x/y estate frame, u16 nx/ny, i16 nodata
0x7FFF) then int16 cm per cell, row-major from the south-west, the top height of
the SITE ground surfaces at each cell centre. Walk files are upstream's SN5W
bytes, gzipped unchanged; the tool only checks their header and layer tags.

## Pipeline notes (§6.2)

- **Doors** open by pre-multiplying each leaf's world matrix with upstream's
  `web.json` pose converted Z-up → Y-up (`openPoseYup`); the count must equal the
  passable leaves in the engine JSON. Lift cars are dropped.
- **Orientation**: every closed component (welded at 0.1 mm) with negative
  signed volume is flipped; site ground triangles face up. Counts go to warnings.
- **Façade storeys**: exact match of the triangle's 1 mm key, relative to the
  FFL, in that storey's chunk (z-min band, then the storeys either side), else the
  band rule FFL_s − 0.25 ≤ z_min < FFL_{s+1} − 0.25. Panels face out of the room
  they close (enclosed vs open air, else the larger room), else away from the
  footprint. A panel within 2 mm of a parallel, overlapping D face refuses the run.
- **Interior**: keys relative to each storey's FFL; typical candidates are every
  storey but L1 and RF; the seed giving the most members wins; a member needs
  `|T| / |chunk| ≥ 0.93`. **T + R_s must equal chunk_s exactly** (multiset of
  keys) for every typical storey, checked on the geometry being written.
- **Leak scan**: text payloads (JSON, the GLB JSON chunk, the catalogue) against
  `[A-Za-z]:\\|/Users/|\\Users\\|rapiular`; binary spans (geometry, rasters,
  images) against the three long literals only, because three random bytes match
  `C:\` about once per 330 KB of compressed geometry and every string a GLB holds
  is in its JSON chunk. Posters must carry no EXIF/XMP/ICC chunk.
- **Names** hash the raw payload (`sha256(raw)[0:8]`); gzip is level 9, mtime 0,
  OS byte 0xff.

### Why some pure code is duplicated

The tool runs on plain Node 24 with no TypeScript toolchain, and `lib/estate/*.ts`
uses extensionless imports and an un-attributed JSON import that Node's ESM loader
cannot resolve. So the few rules the tool shares with the runtime — the pack path
rule (`packPathProblem`), storey-tag normalisation, the palette slot lookup and
the SN5W header — are small import-free ports under `scripts/estate/lib/pure/`
(the palette and budgets JSON are imported directly, so data is never copied),
and `tests/estate-pipeline-pure.test.ts` imports **both** sides and proves they
agree. Change both or neither.

## Measured (dev run over the v1.1 export, 2026-10-05)

Doors closed and no walk grids, so `w` is absent and `i`, `nav` will move a
little with v1.2. Bytes as stored (gzip for `.gz`).

| Class | Measured | Plan "expected" | Cap |
|---|---|---|---|
| First frame (pack.json gz + massing + site) | 87,328 B | ~140 KB | 350 KB |
| F ×14 | 924,562 B (max 102,629) — 514,270 tris, 1.80 B/tri | 1.65 MB | 2.8 MB / 300 KB |
| D ×14 | 260,622 B (max 28,217) — 30,088 stored, 1,186,672 drawn, 11,169 instances | 0.2 MB | 0.5 MB / 64 KB |
| I ×14 | 492,194 B (max 53,664) — T 245,384, R 22,664, specials 82,756 | 1.1 MB | 2.0 MB / 240 KB |
| nav ×14 | 238,348 B (max 41,808, MSCP_513) | 0.4 MB | 0.6 MB / 48 KB |
| ground | 8,011 B | — | 160 KB |
| posters | 165,576 + 56,132 + 70,434 B | 0.3 MB | 180 / 70 / 90 KB |
| whole pack | 2,353,539 B in 63 files | ~4.4 MB | 12 MB |

Draws per file: massing 14, site 14, F 2, D ≤ 26, I ≤ 11 (NC_514). Triangles:
F ≤ 57,026 (BLK_511), massing ≤ 482, T ≤ 29,620, R ≤ 2,700, special ≤ 12,568
(NC_514 L1). The F, I and nav classes land more than 25% under "expected"; per
§12.2 their caps are re-set from the real v1.2 run, not from this one.

## Troubleshooting

- **A hash does not match its name after checkout**: `.gitattributes` must keep
  `public/estate/**` `-text`; with `core.autocrlf=true` a JSON or nav file would
  otherwise be rewritten.
- **"needs Node 24.x"**: the pack is pinned to one Node major (zlib, V8 float
  formatting); use nvm or Volta, never loosen the check.
- **`--verify` reports "same payload, different gzip bytes"**: harmless (another
  zlib); names and `sha256` come from the raw payload.
- **gltf-validator errors**: the run stops on any; fix the step that produced the
  geometry rather than filtering the report.

## Moving to a new version

1. Upstream releases `vX.Y` (deterministic zips, `release_manifest.json`).
2. `git -C external/Bonsai-Estate checkout <tag commit>`.
3. `npm run estate:pack -- --zips <downloaded> --classes <committed set> --out public\estate\vX.Y --release`, then `--verify`.
4. `git rm -r public/estate/v<old>`; exactly one version folder may exist.
5. `npm run estate:check -- --provenance`, then commit the pack, the catalogue and the gitlink together.
