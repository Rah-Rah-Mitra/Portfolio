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
the root `npm ci` installs it (`.vercelignore` drops its `node_modules`). The
tool reads the installed versions at start and refuses to run when any differs
from its pin, or a pin from what `pack.json` records in `tool`.

| Command | What it does |
|---|---|
| `npm run estate:setup` | `npm --prefix scripts/estate ci` |
| `npm run estate:pack -- …` | `npm --prefix scripts/estate run pack -- …` (Node **24.x only**; any other major is refused, because pack bytes must be reproducible) |
| `npm run estate:check [-- --pack <dir>] [-- --provenance [--zips <dir>]]` | `node scripts/estate/check.mjs`: no dependencies, runs on the root's node |
| `npm --prefix scripts/estate test` | the pipeline's IO tests (`node --test`, in-memory documents), the §6.1 gates on a temporary git history, and the command's own guards |
| `node scripts/estate/harness.mjs --pack <dir> [--inspect <dir>] [--json <file>]` | parses every GLB with three@0.186.1's `GLTFLoader` + `MeshoptDecoder` (plan §6.7); checks counts, attributes (`_meta`, `_STOREY`, `instanceMatrix`), extensions (instancing must be *required*), frames and the per-class caps on three's own numbers; sums the §7.11 scenarios (S1–S5, S4+D, S5+D, S4-min) against the tier caps. `--inspect` also writes `BLK_509`'s F and I decoded to plain, validated GLB with a per-storey box table (`--inspect-site <ID>` for another site). Install three first with `npm i --prefix artifacts/estate-smoke three@0.186.1` (never into a `package.json`); the `--inspect` export also needs `estate:setup`, and nothing is written under `public/` |
| `ESTATE_PACK_DIR=<dir> npx vitest run tests/estate-walk-realdata.test.ts` | the §6.7 real-data walk checks (doors connect, spawns and lift arrivals walkable, stair paths walkable to the next storey, the MSCP ramp climbable) on a pack built with walk grids; skipped without one |

npm 11 prints an `allow-scripts` warning for `ffmpeg-static`: its install script
downloads the FFmpeg binary and must run. If a later npm skips it, the poster
step stops with "ffmpeg-static has no binary".

Relative paths you pass are resolved from where you ran the command (npm's
`INIT_CWD`), not from `scripts/estate`.

## Inputs and gates (§6.1)

The only real input is a **Bonsai-Estate release**: a folder holding
`SampleTownN5_<tag>_model.zip`, `…_reports.zip` and `release_manifest.json`.

```powershell
# P2: the candidate, from upstream's release folder (R2a). For v1.2, <candidate>
# was v1.2-rc2 (..\Bonsai-Estate-release\v1.2-rc2), re-packed as
# artifacts\estate\v1.2-rc2b once P5's pack fixes were in.
npm run estate:pack -- --zips ..\Bonsai-Estate-release\<candidate> --out artifacts\estate\<candidate>
# The release pack: the published zips, checked against the candidate's own record.
# It carries every class: the engine reads all eight, and estate:check and
# tests/estate-pack.test.ts refuse a committed pack without them (SHIPPED_CLASSES).
Copy-Item ..\Bonsai-Estate-release\<candidate>\release_manifest.json <downloaded>\
npm run estate:pack -- --zips <downloaded> --classes poster,s0,f,d,i,w,nav,ground --out public\estate\v1.2 --release --expect-assets artifacts\estate\<candidate>\pack.<h8>.json
npm run estate:pack -- --zips <downloaded> --classes poster,s0,f,d,i,w,nav,ground --out public\estate\v1.2 --verify
npm run estate:check -- --provenance --zips <downloaded>
```

The GitHub release (R2b) carries only the two zips, so `release_manifest.json`
is **copied from the R2a candidate folder**, never taken from a download: it is
the record the zips are checked against, and one shipped beside them would vouch
for itself. `--expect-assets` names the candidate pack whose `source.assets` the
downloaded zips must equal; once a pack is committed, `--release` compares with
the one in `--out` instead.

Every run extracts the entries it reads into a **fresh**
`artifacts/estate/src/<tag>/` (the folder is deleted first), and reads only the
entries extracted in that run. It refuses to pack when:

- a zip's sha256 or size differs from `release_manifest.json`, or an extracted
  entry has no per-entry sha256 there or a different one;
- `export_info.dirty` is not `false`, or sha256(`estate_manifest.json`) ≠
  `export_info.manifest_sha256`;
- `estate_manifest.json` has no `path` + `sha256` record for a site's LOD1,
  LOD2, engine JSON or interior chunks (or SITE's LOD0), or a file differs from
  its record; any `*_walk.bin` / `*_web.json` has no record in
  `export_info.files` or differs from it (sha256 and size);
- after the build, any input it read is not one of those records (or the
  manifest, `export_info`, the views record and the poster PNG, which
  `release_manifest.json`'s entries vouch for);
- **the commit chain** (plan §2, R2a): `export_info.commit` (M, the build) or
  `release_manifest.json`'s `commit` is not 40 hex, or the two differ (upstream's
  `release` writes `export_info.commit` into it); the gitlink G in this repo's
  own index does not descend from M (`git merge-base --is-ancestor M G`); or the
  generator changed between them (`git diff --quiet M G -- estate config estate.py estate.sh estate.cmd`).
  G is R, M plus the regenerated reports; only a validated id ever reaches git,
  after `--end-of-options`;
- `--release`: the submodule's `v1.2^{commit}` ≠ G, or the zips differ from the
  candidate's `source.assets` (`--expect-assets`, or the pack being replaced);
- `ESTATE_views.json` is missing, is not `sample-town-n5/render-views/1`, or has
  no perspective `views.aerial_NE`;
- any output byte trips the leak scan, or a site is rotated (`--allow-rot` to accept).

It never opens `*_nav.json`, `*.build.json`, a building's `*_lod0.glb`, IFC or
`.blend` (they are not even extracted). `scripts/estate/lib/provenance.mjs` is the
one file allowed to touch the submodule, through `git` only
(`tests/repo-hygiene.test.ts`).

Upstream's `release` keeps the same rule (Bonsai-Estate `estate/web/release.py`,
since e385476): it runs on R, accepts an `export_info.commit` that is HEAD or an
ancestor of it with the generator unchanged, and records both in
`release_manifest.json` (`commit` = M, `head` = R).

### Where it writes, and what a failure deletes

- A `--dev-src` pack is never written under any `public/` folder (any web
  project's — a folder named `public` beside a `package.json` or `.git`, links
  resolved), and takes no `--catalogue`: its catalogue lands beside it.
- A release pack goes under `public/` only at `public/estate/v1.2`, and only with
  `--release` (or `--verify`, which writes nothing there). `--catalogue` may not
  point under `public/`, and only the committed pack's build writes
  `lib/estate/catalogue.generated.ts`.
- The tool empties `--out` only when it holds exactly one `pack.<h8>.json`, the
  files that lists and the tool's own catalogue and report — anything else, and
  it refuses. A failed run clears **only a folder it emptied and took over in that
  run**; a refused pack outside `public/` stays for inspection, one in
  `public/estate/v1.2` is cleared (`git checkout -- public/estate` restores it).
- The catalogue is written last, and only when the pack passes every check.

### Dev mode (`--dev-src`)

For pipeline work without a published release (as before v1.2 existed), it
runs on an **extracted** export:

```powershell
npm run estate:pack -- --dev-src ..\Portfolio\artifacts\estate\src-dev-v1.1 --classes poster,s0,f,d,i,w,nav,ground
npm run estate:pack -- --dev-src ..\Portfolio\artifacts\estate\src-dev-v1.1 --classes poster,s0,f,d,i,w,nav,ground --verify
npm run estate:check -- --pack artifacts\estate\v1.2-dev
$env:ESTATE_PACK_DIR='artifacts/estate/v1.2-dev'; npx vitest run tests/estate-pipeline-pure.test.ts tests/estate-walk-realdata.test.ts
```

It prints a banner, skips every provenance gate, stamps `pack.source.dev: true`
(`commit`, `buildCommit` and `exportInfoSha256` all zeros — a dev pack claims no
release; `assets` is one entry, `dev-src.unverified`, hashing the input
listing), refuses `--release` and `--catalogue`, and writes to
`artifacts/estate/v1.2-dev/` by default (the catalogue and a `report.json` land
beside the pack). Missing inputs fall back with a warning: no `*_walk.bin` drops
class `w`; no `*_web.json` leaves every door closed and the nav files without
stairs; no or an unreadable `ESTATE_views.json` leaves `views` empty. The
manifest hash checks still run, and reads no record vouches for are counted in a
warning. `estate:check` refuses a dev pack anywhere under `public/`.

## Classes and phases (§6.3)

| Class | Files | Engine phase |
|---|---|---|
| `poster` | `poster/aerial-1600.<h8>.webp`, `aerial-800.<h8>.webp`, `aerial-800.<h8>.jpg` | P4a |
| `s0` | `s0/massing.<h8>.glb.gz` (14 meshes), `s0/site.<h8>.glb.gz` | P4b |
| `f`, `d` | `f/<ID>.<h8>.glb.gz`, `d/<ID>.<h8>.glb.gz` ×14 | P4b |
| `i`, `w`, `nav`, `ground` | `i/<ID>.<h8>.glb.gz`, `w/<ID>.<h8>.walk.gz`, `nav/<ID>.<h8>.json.gz` ×14, `site/ground.<h8>.bin.gz` | P5 |

The phase is the one whose engine first reads the class. No pack file was
committed before the release pack: all eight classes landed together in
`dc21303`, and only `public/estate/LICENSE.txt` came earlier (P4a).

`pack.json` lists only the classes it emitted, and a class is present for all 14
buildings or not at all. Content is deterministic, so a later run reproduces the
earlier classes byte for byte. `ground` lives in the site layer, so it needs `s0`.
Every streamed file is gzip (the nav files too: with upstream's stairs a plain
nav file ran to 101 KB against the 48 KB cap), so plan §7.6's sniff list
(`1F8B | glTF | SN5W`) applies to the stored bytes; after gunzip a nav file is
JSON and `site/ground` is **SN5G**, both on the engine's sniff list
(`engine/loaders.ts`).

## What the files hold (the runtime's side of the contract)

All GLBs: `EXT_meshopt_compression` + `KHR_mesh_quantization` (positions 14-bit
for massing; **16-bit for F, site, D and I**), plus `EXT_mesh_gpu_instancing`
where noted — always listed in `extensionsRequired`, because a kit's
dequantisation scale lives in its instance `SCALE`. Every primitive has exactly
`POSITION` and **`_META`, u8 × 4: x = palette slot (`lib/estate/palette.json`),
z = storey index, y = w = 0**. three's GLTFLoader lower-cases a vertex
attribute's name (`_meta`) but keeps an instance attribute's as written
(`_STOREY`). No normals (flat shading), no UVs, no textures, no extras. Three
materials by name: `opaque`, `glass` (BLEND) and `edge` (lines); the runtime
ignores their factors and colours by slot. Frames: building GLBs are block-local
glTF Y-up (three: put the building root at `(at.x, 0, −at.y)`); site is estate
frame Y-up.

**Keep every node's TRS.** `KHR_mesh_quantization` puts each mesh's
dequantisation (translation + uniform scale) on its node; D, furniture and trees
carry it in their instance TRS instead. The engine instances T itself, so for T
the instance matrix is `T(0, FFL_i, 0) · M_node` with the mesh's own matrix set
to identity — keeping the loaded mesh's matrix and setting `instanceMatrix =
T(0, FFL_i, 0)` puts L5 at 63.2 × 12 m. The harness places T at every typical
FFL this way and compares the boxes.

| File | Nodes (by name) | Notes |
|---|---|---|
| `s0/massing` | one per site id, mesh `<ID>_massing` | LOD2 `ext` + `roof`, one primitive each; `sites[].massing.error` is the p90 distance of the LOD1 shell's vertices from it |
| `s0/site` | `quadrant_<qx>_<qy>` ×4 (200 m); `tree_<species>` and `crown_<species>` batches | shelter glass is drawn opaque; `crown_<species>` is the far tree, 12 triangles (`crownTris`): an octahedron over the species' foliage box on a four-sided trunk stub from the bark box's foot to its top, inside the crown (`lib/pure/trees.mjs`) |
| `f/<ID>` | `facade`: triangles (≤ 65,535 vertices per primitive) + one LINES primitive | shell + one panel per window on the glass's mid-plane spanning the whole window (the opening, not just the pane) and one per exterior door on the closed leaf's mid-plane, **every panel drawn from both sides** (4 triangles on the same 4 vertices): a window's front faces out of its flat in the façade-glass slot (11) and its back faces in, in the `glass-interior` slot (29); a door is its own slot both ways; every triangle and line carries its storey |
| `d/<ID>` | one batch per kit, named after upstream's mesh (`L1_W-1800x800`, even when the batch spans L1–L16) | window frames (glass dropped: F's panel stands in) and whole exterior doors; instance attribute **`_STOREY`, u8 × 4, x = storey**; a kit's own `_META.z` is 0 (kits, furniture and trees take their storey per instance) |
| `i/<ID>` | `typical`, `residual`, `special_<tag>`, `furniture_<kit>` / `proxy_<kit>` batches | `typical` is T **relative to its floor** (y = 0 at FFL), storey byte 255 and **no `_STOREY`** — the engine masks it per instance (its own storey list), not by `_meta.z`, and an InstancedMesh program reading `_STOREY` would get WebGL's default (L1); `residual` and specials are absolute with storey tags; glass is a separate `glass` primitive using the `glass-interior` slot; furniture carries `_STOREY` like D, and `proxy_<kit>` is the kit's stand-in beyond the tier's furniture radius (10–30 triangles, below); every mesh of the file is quantised on **one lattice** (below) |

`_STOREY` is four bytes, not one: gltf-transform 4.5.1 meshopt-encodes a 1-byte
instance attribute with a 4-byte stride and writes no `bufferView.byteStride`,
so readers (three included) unpack it as garbage. The tool decodes every batch
it writes and compares the storeys (`storeyRoundTrip`).

Counting in `pack.json` (`Geo`): `tris`, `verts`, `prims` are what the file stores
(`draws` = primitives), **except `detail.tris`, which counts every instance** —
what D draws, which is what the LOD budget adds to F's. `interior.sourceTris` is,
per storey, what upstream's chunk stores that is neither furniture nor a lift
car, counted from the chunk itself; `drawnTris` is what the pack draws for it
(T + R_s, or the special mesh). The tool also proves every `FURN_` triangle is a
kit instance and warns about any lift-car triangle it drops.

`nav/<ID>.json.gz` (gzipped `portfolio/estate-nav/1`, block-local Z-up, 0.01 m,
no GUIDs): `storeys` (tag, FFL, typical/special), `roomHeight` (the commonest; a
room carries `h` only when it differs, `z` only when its floor is off the FFL),
`rooms` (`typical`: one storey's rooms with `{S}` = `5` and `{SS}` = `05` name
templates plus the storeys they expand to; `storeys`: every other storey
explicitly — the tool refuses a file that does not expand back exactly), `lifts`
(`landings{tag: {xy, facing}}` 0.4 m out from each landing door on the lobby
side, facing out of the car), `doors` (every passable door as `[x, y, ax, ay, w]`
— the doorway's centre on its wall line, the unit wall direction and the width;
grouped like the rooms), `spawns`, and `stairs` from `<ID>_web.json` (0.001 m).

`site/ground.bin` is **SN5G** v1 (`lib/pure/sn5w.mjs`): 32-byte header
(`SN5G`, version 1, f32 cell 0.5, f32 lo x/y estate frame, u16 nx/ny, i16 nodata
0x7FFF) then int16 cm per cell, row-major from the south-west, the top height of
the SITE ground surfaces at each cell centre. The runtime reads it with
`lib/estate/ground.ts` (`decodeGround`, `groundAt`, `nearestGround`), which
`tests/estate-ground.test.ts` holds byte for byte to the `.mjs`. The
ground surfaces stop short of the building aprons, so 33 of the 45 entrance
spawns sit on nodata cells: outdoors near an entrance, Walk (P5) must take the
building's L1 walk grid, which covers them (`tests/estate-walk-realdata.test.ts`).
Walk files are upstream's SN5W bytes, gzipped unchanged; the tool only checks
their header and layer tags.

The catalogue carries only what the main bundle reads before any engine exists
(every byte ships on every page view, under the 510,000 B main-bundle cap): each
site as `{ id, name, kind, typology, heightM, levels }`, where `levels` is the
storey range written out (`'L1–L16 + RF'`, `manifest.mjs storeyRange`), the
poster with the `w`/`h` `encodePosters` measured, and `bytes: { stage0, f }`, the
two totals the consent label counts. Per-site and per-class file sizes stay in
pack.json, which the engine reads (P5's Enter labels take them from there). A
catalogue built from a dev pack says `dev: true`, which `estate:check`,
`tests/estate-pack.test.ts` (under CI) and the build's check-bundle (on Vercel)
refuse.

## Pipeline notes (§6.2)

- **Doors** open by pre-multiplying each leaf's world matrix with upstream's
  `web.json` pose converted Z-up → Y-up (`openPoseYup`); the count must equal the
  passable leaves in the engine JSON. Lift cars are dropped. Only interior leaves
  open: D is built from LOD1's whole exterior doors and F's panel sits on the
  closed leaf, so D is byte-identical with v1.2's poses. A passable exterior door
  looks closed from outside and shows open once the camera is within 6 m and the
  L1 façade mask hands over to the interior — expected (C3, §6.2 step 6b), not a bug.
- **Orientation**: every closed component (welded at 0.1 mm) with negative
  signed volume is flipped. Site ground: closed ground solids are oriented the
  same way and their downward faces below grade (slab bottoms no camera sees,
  2,235 in v1.1) are dropped; only open ground surfaces are turned to face up
  (1,435). Counts go to warnings.
- **Façade storeys** follow the façade mask (§7.5): inside a building the runtime
  draws the interior chunks of storeys S − k … S + k and hides exactly those
  storeys of F, D and the edge lines, so a surface the interior also draws must
  carry the storey of the **chunk that holds it**. The tool matches each shell
  triangle's 1 mm key, relative to the FFL, against every storey's chunk, nearest
  its z-min band first; only a triangle no chunk holds takes the band rule
  FFL_s − 0.25 ≤ z_min < FFL_{s+1} − 0.25 (none does in v1.2: every shell
  triangle is matched). This is deliberate wherever the two rules disagree:
  upstream puts an IfcStair and its railing in the storey they rise from, so the
  top riser, handrail and landing guard of each flight (BLK_509's L4→L5:
  11.775–13.0 m, L5's FFL 12.0) are the lower storey's, and NC_514's double-height
  hall keeps its roof deck and trusses (6.8–8.25 m) in L1. On rc2, 25,240 of the
  491,932 shell triangles sit outside their z-min band this way (BLK_509 3,550:
  wall and core tops under the next slab 2,022, stair risers 976, railings 444,
  column tops 108; NC_514 380; MSCP_513 1,320). Tagged by height instead, the
  mask would hide them at the bottom of a band with nothing drawing them and
  draw them twice under its ceiling: simulated over all 490 bands (every storey of
  every building at k = 1 and 2), **45,366 triangle-bands hidden and 43,726
  doubled, against 0 and 0** for the chunk rule. Panels take their z-min band
  and D instances their translation's band; both agree with the chunk that holds
  the opening in all 11,169 openings. The tool proves all of it per building
  (`maskCoverage` in `lib/pure/tag.mjs` over every storey at k = 1 and every
  tier's `bandK`; `report.json` `facade.mask`, `facade.offBand`) and stops with
  "the façade mask would misapply" on any surface drawn twice or not at all.
- **Panels** are drawn from both sides. The runtime draws F with one
  front-faces-only opaque material in one draw, from the six programs of §7.3; a
  `DoubleSide` material would add a program and a draw, and rasterise every
  closed solid's back faces, so the pack adds a back pair on the same corners
  instead. A one-sided pane was a hole from indoors wherever F stood whole around
  the camera (an interior still streaming or failed, lean mode, Fly through a
  block) or showed past a band's edge. The back of a window is the
  `glass-interior` slot: the colour the interior's own pane takes when the mask
  hands over (F is opaque, so three's `OPAQUE` define drops the slot's 0.35
  alpha, and the canvas has none). The front still faces out of the room it
  closes (enclosed vs open air, else the larger room), else away from the
  footprint, with a warning naming every window a fallback decided; a door is
  not faced (the room probe cannot tell a lift landing door from its shaft, or a
  stair discharge door from the car park). It costs two triangles and no vertex
  per window: 19,344 triangles over the 9,672 windows of the 14 façades.
- **Far trees** (`crown_<species>`, beyond the tier's tree radius) are a crown on
  a trunk stub, 12 triangles: the 8-triangle octahedron over the foliage box,
  which alone hung 2.0–4.3 m above the ground, plus a square spike from the
  bark box's foot to the centre of its top, which lies inside the crown on every
  species. The 778 trees cost 3,112 triangles more when all are far (the poster
  pose; the min tier's tree radius was 0 until the release round set it to 15 m).
- **Edge lines**: at most 6,000 per building, cut only between whole length
  classes (lengths equal to the millimetre), so identical typical storeys keep
  identical line work.
- **Interior**: keys relative to each storey's FFL; typical candidates are every
  storey but L1 and RF; the seed giving the most members wins; a member needs
  `|T| / |chunk| ≥ 0.93`. **T + R_s must equal chunk_s exactly** (multiset of
  keys) for every typical storey, checked on the geometry being written.
- **One lattice per interior file** (`lib/pure/grid.mjs`). Where upstream
  triangulates a face differently on some storeys (the wall over two flat windows
  on BLK_509's L4–L11 is a fan from the room's top corner; L2, L3 and L12–L16
  triangulate it another way), only part of the face is common to every typical storey:
  that part is T, the rest R, and the two meshes share the face's inner edges.
  Quantised the gltf-transform way — one grid fitted to each mesh's own bounds —
  T (stored relative to its floor) and R (stored where it stands) rounded every
  shared vertex to different points: on rc2b all 33,254 of them, 0.4–2.5 mm
  apart, and the shared edges opened into the dotted line the P5 review saw at
  BLK 509's L5 window heads, there whether F is drawn or not. Each I file is now
  quantised on one lattice for all its meshes, kits included: origin on the
  0.1 m pitch, step 0.1 m / n with n a multiple of 4 (the largest whose 16-bit
  range still covers the file), so every FFL — upstream writes them on that
  pitch, and the tool refuses a typical one that is not — is a whole number of
  steps and T drawn at any typical floor lands on R's points. `encodeDoc`'s
  `grid` pins quantize()'s `'scene'` volume with an unattached anchor mesh
  (disposed before prune). The tool proves it on the decoded file: every plain
  node one scale, every vertex on the lattice (T at each typical FFL), and
  every vertex T and R_s share decoding to one point (`seamGaps` in
  `lib/pure/quantcheck.mjs`, `report.json` `interior.seams`); a gap stops the
  run. The step grows 2–12 % (BLK 509 1.94 → 2.08 mm) and the I files shrink
  4–18 %. Nothing is dropped: the triangles, the T/R split and the decoded
  T + R_s = chunk_s check are the same.
- **Furniture stand-ins** (`lib/pure/proxy.mjs`). Beyond the tier's furniture
  radius a kit is drawn as a stand-in that follows its height profile: the kit
  is split at its main top surface (the height with the most upward-facing
  area) into the slab under it (down to the nearest downward face, the top's own
  underside), what rises above it, and what holds it up, one box each over its
  own triangles' bounds, coloured by the slot with the most area in that layer.
  Faces on the kit's floor and faces buried against the slab are left out. A
  hawker table is a tile top over its steel pedestal (20 triangles), a stool
  likewise (20), a stall counter a stainless top over its tile body (20), the
  car park's bench a timber seat and backrest over its steel end frames (30), a
  letterbox bank one box (10). The old stand-in — a 12-triangle box over the
  whole kit in the slot with the most triangles — made the table a dark
  full-height crate: the pedestal is 100 of its 112 triangles. `proxyTris` in
  pack.json is the stand-in's own count.
- **What a reader decodes**: every GLB is decoded again (meshopt, then each
  node's and instance's matrix) and every triangle must lie within one
  quantisation step (+0.1 mm) of a built one; T at each typical FFL plus R_s must
  so reproduce its chunk, and each special its chunk. F and the site are refused
  if quantisation made any face pair of different slots coplanar (0.25 mm) and
  overlapping by more than two steps where the built pair was not (within 1 mm
  and overlapping) — at 14 bits that was 762 slab/road-marking pairs on MSCP_513's
  roof deck and 379 asphalt/road-marking pairs on the site. Pairs upstream already
  ships coplanar are reported in `report.json`, not refused. The 2 mm panel/D
  check runs again against D as decoded, allowing F's step.
- **Leak scan**: text payloads (JSON, the GLB JSON chunk, the catalogue) against
  `[A-Za-z]:\\|/Users/|\\Users\\|rapiular`; binary spans (geometry, rasters,
  images) against the three long literals only, because three random bytes match
  `C:\` about once per 330 KB of compressed geometry and every string a GLB holds
  is in its JSON chunk; and the stored gzip bytes too, header included. A gzip
  header must be exactly the tool's (FLG 0 — no name, comment or extra field —
  mtime 0, XFL 0/2, OS 0xff). Posters must carry no EXIF/XMP/ICC chunk.
- **Names** hash the raw payload (`sha256(raw)[0:8]`); gzip is level 9, mtime 0,
  OS byte 0xff.
- **Massing error** is the p90 distance of LOD1's vertices from the massing, so an
  open building (MSCP_513 13.3 m, NC_514 9.3 m, the point blocks 4.3–5.4 m) prefers
  F early — deliberate (plan amendments, "P2 as implemented"): a box is a poor
  stand-in for an open deck. The min tier's budget order (S4-min: NC_514,
  MSCP_513, BLK_508, BLK_505 at F) follows from it.

### Why some pure code is duplicated

The tool runs on plain Node 24 with no TypeScript toolchain, and `lib/estate/*.ts`
uses extensionless imports and an un-attributed JSON import that Node's ESM loader
cannot resolve. So the few rules the tool shares with the runtime — the pack path
rule (`packPathProblem`), storey-tag normalisation, the palette slot lookup and
the SN5W header — are small import-free ports under `scripts/estate/lib/pure/`
(the palette and budgets JSON are imported directly, so data is never copied),
and `tests/estate-pipeline-pure.test.ts` imports **both** sides and proves they
agree. Change both or neither.

## Measured (the committed v1.2 release pack, 2026-10-06)

**The committed pack** is `public/estate/v1.2/pack.4a3c0883.json` and its 76
files, 2,406,539 B (78 files under `public/estate` with `LICENSE.txt`). Built
from the **published** v1.2 release: both assets downloaded anonymously from
`github.com/Rah-Rah-Mitra/Bonsai-Estate/releases/download/v1.2/` (model
105,271,442 B, sha256 `e939dc78f94568c199e95d6f5a74c8b60bcdb80d91bc8913cdba88e33ca98a95`;
reports 79,803,968 B, `8f6191bc374a3d0e92fb06e8907cbe0fd0de1d6c2203ae900d205f7a08fe5f39`),
beside the R2a candidate's `release_manifest.json` (its zip hashes equal the
downloads'), with

```powershell
npm run estate:pack -- --zips artifacts\estate\zips-v1.2 --classes poster,s0,f,d,i,w,nav,ground --out public\estate\v1.2 --release --expect-assets artifacts\estate\v1.2-rc2b\pack.82695419.json
npm run estate:pack -- --zips artifacts\estate\zips-v1.2 --classes poster,s0,f,d,i,w,nav,ground --out public\estate\v1.2 --verify   # identical
npm run estate:check -- --provenance --zips artifacts\estate\zips-v1.2                                                                  # exit 0
```

`source`: tag `v1.2`, `commit` `a6e1acf` (R, = the gitlink = `v1.2^{commit}`),
`buildCommit` `a106728` (M). It is rc2b (below) with the release pack's two
tool fixes ("Fixed in the release pack"): only the 14 I files and `pack.json`
changed — F, D, walk, nav, ground, massing, site and posters are byte for byte
rc2b's. I is 434,907 B (max 50,217, BLK_510; rc2b 495,049), 351,360 stored
triangles (+40: the five kits' stand-ins), quantisation steps 0.93–2.08 mm on
one lattice per file, and 33,246 vertices T and R share, every one decoding to
one point. `lib/estate/catalogue.generated.ts` is this run's (`dev: false`,
first frame 84,711 B). The table below is rc2b; for the release pack read the
I row and the whole pack from this paragraph.

The R2a candidate: `SampleTownN5_v1.2_{model,reports}.zip` from upstream's
`release` (M = `a106728`, R = `a6e1acf`, tag not yet created at the time — upstream tagged `v1.2` at `a6e1acf` later that day; model zip
105,271,442 B, `e939dc78…`, reports zip 79,803,968 B, `8f6191bc…`), packed with
every class into `artifacts/estate/v1.2-rc2` (`pack.fd986442.json`; `--verify`
identical). It replaces the first candidate (M = `2a533c1`, R = `d3152af`,
`artifacts/estate/v1.2-rc`, `pack.3b0c3a81.json`), from which it differs only in
NC_514's nav file (the two stair end points below, 3,216 → 3,215 B) and the
pack's own `source` (pack.json gz 15,126 → 15,136 B); every other file is byte
for byte the same.

**rc2b** is the same rc2 zips re-packed with P5's pack fixes (both panel sides,
the far tree's trunk stub, and the façade-mask proof, which changes no byte) into
`artifacts/estate/v1.2-rc2b` (`pack.82695419.json`; `--verify` identical), and
was the copy this branch ran on (uncommitted) until the release pack replaced it. Against rc2 only 13 F files (MSCP_513
has no window), `s0/site` and `pack.json` changed; D, I, walk, nav, ground,
massing and posters are byte for byte the same. Its `pack.json` also carries this
branch's palette tokens (block-accent `--color-accent-200`, play-surface
`--color-accent-500`), which `pack.fd986442.json`, built before the P4b review,
did not. The table is rc2b (the committed pack differs only in I, above). Bytes as stored (gzip for `.gz`), decimal KB/MB as the caps count.
Plan §6.5's "expected" assumed 3.2 B per stored triangle; F stores 1.76 B and I
1.41 B. Every class that landed more than 25% from it has its expected figure
re-set to the measurement (§12.2; also `expected` in `lib/estate/packBudgets.json`,
which nothing reads). **No cap moved**: every class is under its cap.

| Class | Measured | Plan §6.5 expected | Off by | Expected now | Cap |
|---|---|---|---|---|---|
| First frame (pack.json gz 15,131 + massing 8,755 + site 60,820) | 84,706 B | ~140 KB | −40% | 84 KB | 350 KB |
| F ×14 (16-bit) | 953,855 B (max 104,417, BLK_511) — 536,608 tris (rc2: 908,608 B, 517,264) | 1.65 MB | −45% | 0.91 MB | 2.8 MB / 300 KB |
| D ×14 | 260,576 B (max 28,213, BLK_510) — 30,088 stored, 1,186,672 drawn | 0.2 MB | +30% | 0.26 MB | 0.5 MB / 64 KB |
| I ×14 | 495,049 B (max 53,742, BLK_510) — 351,320 tris | 1.1 MB | −55% | 0.50 MB | 2.0 MB / 240 KB |
| w ×14 + ground | 188,493 B (max 26,817, MSCP_513) + 8,011 B | 0.6 MB | −67% | 0.20 MB | 1.3 MB / 128 KiB (ground 160 KB) |
| nav ×14 (gzip) | 133,084 B (max 14,580, BLK_509) | 0.4 MB | −67% | 0.13 MB | 0.6 MB / 48 KB |
| posters | 165,442 + 55,986 + 70,451 B | 0.3 MB | −3% | 0.3 MB (kept) | 180 / 70 / 90 KB |
| whole pack | 2,466,681 B in 77 files (rc2: 2,421,102) | ~4.4 MB | −45% | 2.4 MB | 12 MB (warning 8 MB), ≤ 100 files |

Draws per file: massing 14, site 14, F 2, D ≤ 26, I ≤ 11 (NC_514). Triangles:
F ≤ 59,244 (BLK_511, under the 60,000 cap; of the 536,608, 2,994 are the doors'
back faces and 19,344 the windows'), massing ≤ 482, T ≤ 29,620, R ≤ 2,700,
special ≤ 12,568 (NC_514 L1), site 27,067 stored (far trees 12 triangles each, 8
before). The façade mask holds on every building: 0 surfaces hidden and 0 doubled
over all 490 bands (k = 1 and 2); 25,240 shell triangles keep a chunk storey
other than their z-min band's.
Quantisation steps: F 0.9–1.9 mm, I 0.8–1.9 mm, site 3.05 mm. D is the one class
over its old expectation: about 168 KB of D's 401 KB meshopt payload is instance
data (float32 TRANSLATION, ROTATION and SCALE, where SCALE is only each kit's
dequantisation factor, plus `_STOREY`). The last dev pack (the v1.1 snapshot plus
U2's work-in-progress walk/web files) measured within 0.1% of this in every
class; the v1.1 snapshot alone had no walk grids and no stairs (nav 45,654 B,
whole pack 2,139,868 B in 63 files).

## Troubleshooting

- **A hash does not match its name after checkout**: `.gitattributes` must keep
  `public/estate/**` `-text`; with `core.autocrlf=true` a JSON or nav file would
  otherwise be rewritten.
- **"needs Node 24.x"**: the pack is pinned to one Node major (zlib, V8 float
  formatting); use nvm or Volta, never loosen the check.
- **"the toolchain is not the pinned one"**: `npm run estate:setup`.
- **`--verify` reports "same payload, different stored bytes"**: the stored file
  disagrees with its own `pack.json` (a re-gzipped or hand-copied file). It is a
  failure: another zlib would have changed `gzSha256` in the rebuilt `pack.json`
  too. `--verify` also checks the existing folder's files against its
  `pack.json` before rebuilding.
- **gltf-validator errors**: the run stops on any; fix the step that produced the
  geometry rather than filtering the report.
- **"quantisation made N face pairs … coplanar"**: a surface moved onto another
  by rounding; raise that file's bits (`BITS` in `pack.mjs`), never the tolerance.

## Upstream data the pack cannot fix (report upstream)

- **Stair paths clipping a blocked cell's corner (fixed in the v1.2 candidate
  rc2).** The work-in-progress U2 files started every L1 stair of BLK_507–512
  inside an opened fire-door leaf; upstream fixed that (6385a5b) and held paths
  to the decoded grid at build and release by sampling them every 0.05 m
  (`estate/web/walkcheck.py`, 2a533c1). In that first candidate 645 of 647 stair
  paths stayed on floor cells. NC_514's L1 shop-block east and west stairs did
  not: their last segment, (58.275, −1.22) → (59.20, −1.10) at 4.20 m (west:
  54 m west and 5.4 m north), crossed the corner of blocked cell (1248, 254)
  (west (708, 308); 0.1 m cells from (−66.05, −26.55), so x 58.75–58.85,
  y −1.15 to −1.05), between two walkable neighbours: in at (58.8146, −1.1500),
  out at (58.8500, −1.1454), a sliver **35.4 mm × 4.6 mm**, 35.7 mm of the
  segment. (This page and the pinning commit first said 3.5 mm × 0.45 mm, ten
  times too small.) `tests/estate-walk-realdata.test.ts` samples every 0.1 m
  and landed one sample there, at (58.83, −1.148); none of walkcheck's samples
  on that segment fell in the sliver, so the release passed it. Upstream now
  checks every cell a segment crosses rather than samples (`walkcheck.crossed`,
  the supercover with a 0.1 mm edge margin; a106728): every crossed cell must
  hold a floor within a step of the path, at build and at release, and
  `stairs.fit_paths` fits to the same rule, which pulled NC_514's two end points
  back along the landing to (59.10, −1.20) and (5.10, 4.20). In rc2 all 647
  paths pass, here (`tests/estate-walk-realdata.test.ts`) and upstream; the
  first candidate's pack still fails here on exactly those two.
- **Coplanar faces in LOD1.** Every façade ships pre-existing coplanar,
  overlapping faces of different materials (BLK_509: 3,164 pairs — mild steel on
  granolithic stairs, the off-white/core-accent paint split, railings on walls;
  MSCP_513: road markings through RC columns). They z-fight in any renderer.
- **Downward open ground surfaces.** 1,435 SITE ground triangles belong to open
  surfaces and face down below grade; the tool turns them up (invisible either way).

## Fixed in the release pack (the P5 review's deferred items, 2026-10-06)

Found on rc2b and fixed in the tool before the release pack was cut (each
changed only the I files, so S5 moved with it; see
`tests/estate-budget.test.ts`):
- **Furniture stand-ins took the legs' colour.** `buildInterior` coloured a
  kit's 12-triangle box by the slot with the most triangles, so a hawker table
  (a tile top of 12 triangles over a steel pedestal of 100) became a dark
  full-height crate beyond the furniture radius. Now the profile stand-in above.
- **A dotted line at some flat window heads** (BLK 509 L5, with F hidden). It
  was not a sliver to drop: L5's chunk holds no glass coplanar with an opaque
  face, and the wall's long thin triangles there are a valid fan with every
  vertex shared. It was the T/R seam: the fan's triangles are R on some
  storeys and T on others, and the two meshes' own quantisation grids put the
  shared vertices up to 2.5 mm apart. Fixed by the one lattice above; nothing
  is dropped and no geometry rule changed.

Accepted, unchanged:
- **Stair wells above the band are empty shafts**: stair flights and landings
  exist only in the interior file, so above S + k the well is open (0.04–0.29 %
  of a floor). `tests/estate-interior.test.ts` pins it at ≤ 0.3 %.
  Drawing the stair one storey beyond the band would need stair triangles
  tagged apart from their storey.

## The bench (plan §12.4, P7)

`/?app=world-3d&estate-bench=1` runs the benchmark route by itself once the
window is live (`components/workbench/estate/engine/bench.ts`, a chunk only that
URL downloads) and logs one JSON report to the console and to
`window.__estateBench`: per leg, dropped % by the governor's own rule, interval
p50/p99, CPU and GPU p95, draws, triangles, GPU MB with the drawing buffer,
`/estate/` bytes and requests, long tasks and long animation frames (Chrome),
frame gaps over 50 ms (all browsers; Firefox's only signal), programs and
governor changes, then a verdict. `estate-bench=max` runs it in the maximised
window (the bench presses Maximize itself; `meta.window` and the canvas's
`meta.cssWidth × cssHeight` say what was measured — the window's own default
bounds, not the viewport, set the canvas size, so a 1920 × 1080 viewport alone
still measures the default 722 × 531 canvas). Add `&estate-quality=high` to
start at the top tier. One run per page: a window released mid-route ends it
("engine disposed"); reload to run again.

Each leg reports two sets of figures. The raw ones count every continuous
frame. `g3` leaves out what G3 (plan §1) leaves out — frames that uploaded
geometry, compiled a shader or followed a resize, the render core's own
`excluded` — and `settled` also leaves out the first 5 s after live and after
each notch change (G3's 4× CPU row). The verdict reads those:

| Verdict field | Means | Fit when |
|---|---|---|
| `routeOk` | every leg ran as written | true |
| `governorOk` | ≤ 2 notch changes in any leg | true |
| `bytesOnMoves` | the stairs and lift legs that requested anything | empty |
| `longTasks` | legs with a task over 50 ms (Chrome) | only `s1-first-frame` (before live; G3 counts from live) |
| `gaps` | legs with a G3 frame gap over 50 ms outside upload frames (Firefox's measure) | judged with the G3 row below |
| `g3` | the worst leg's G3 dropped % and p99, raw and settled, over §12.4's route (`s1-first-frame` and `bs1-recovery` left out) | default window ≤ 2 % and p99 ≤ 2 periods; maximised ≤ 5 %; 4× CPU, settled, ≤ 10 % and p99 ≤ 50 ms |

The first three are this repo's gate and hold on any machine. `longTasks`,
`gaps` and `g3` are G3's timing figures: judge them on Rahul's hardware, in
Chrome and Firefox, at the default size, maximised (`estate-bench=max`) and
once under DevTools' 4× CPU slowdown. A software renderer fails them by
construction.

The walked legs reuse the e2e tour's step routes from named spawns (Blk 509's
Void deck entrance E, the car park's Entrance E, the hawker centre's Entrance
E 2), so a re-pack that moves a spawn, a doorway or a ramp shows up as a leg
whose notes say what it could not do; re-record the route in `bench.ts` and in
`tests/e2e/estate.spec.ts` together.

Measured headless on SwiftShader (Chrome 151, 2026-10-06; software rendering,
so only the counts and the governor's behaviour carry over to a real GPU). The
first row is the committed release pack after the release round's fixes; the
other three were measured on rc2b, whose interiors differ only in their
quantisation lattice and furniture stand-ins, and were not re-run:

| Run | Pack | Canvas | Live after engine | Notch changes | Long tasks after live | Stairs/lifts requests | G3 worst dropped % / p99 |
|---|---|---|---|---|---|---|---|
| default, 1280 × 720 | release | 722 × 531 | 1.8 s | 1 (orbit, → min × 0.75) | 0 | 0 | 19.6 % (mscp-ramp) / 50 ms |
| default, 1280 × 720 | rc2b | 722 × 531 | 1.7 s | 1 (orbit, → min × 0.75) | 0 | 0 | 19.2 % (mscp-ramp) / 50 ms |
| maximised (`=max`), 1920 × 1080 | rc2b | 1482 × 901 | 1.7 s | 1 | 0 | 0 | 74.8 % (orbit) / 117 ms |
| default, 4× CPU (two runs) | rc2b | 722 × 531 | 2.2 s | 1 | 2–3 a run, 54–72 ms (GLB decodes, a worker message) | 0 | 30.8 % (void deck) / 83 ms (plan); settled 47 % (orbit) |

From a forced high start the orbit sweep takes at most 2 notch changes in a leg
and settles at min × 0.75 by the stairs; no long task after live at normal
speed once a notch's resize waits for the GPU to drain and warm-up links every
program. One ~1 s task before live at the default start is the GPU probe's
context creation, which no browser API makes asynchronous. At min × 0.75 a
maximised canvas is 0.75 Mpx, over min's 0.7 Mpx pixel cap with no lower notch
(the 0.75 floor wins), so a slow GPU maximised has nowhere left to go. The 4×
CPU long tasks are a GLB decode's `Response.arrayBuffer` continuation and a
meshopt worker message during the Enter and Plan legs. On Fast 4G the poster
lands at 0.9 s and the first live frame at 2.9 s after navigation. Firefox and
real GPUs: not run here (Rahul's §12 sign-off).

## Moving to a new version

1. Upstream releases `vX.Y` (deterministic zips, `release_manifest.json`).
2. `git -C external/Bonsai-Estate checkout <tag commit>`.
3. Copy the candidate's `release_manifest.json` beside the downloaded zips, then
   `npm run estate:pack -- --zips <downloaded> --classes poster,s0,f,d,i,w,nav,ground --out public\estate\vX.Y --release --expect-assets <candidate pack.json>`, then `--verify` (the full set, `SHIPPED_CLASSES` in `scripts/estate/check.mjs`).
4. `git rm -r public/estate/v<old>`; exactly one version folder may exist.
5. `npm run estate:check -- --provenance --zips <downloaded>`, then
   `npm run drawings` (the desk drawing set is generated from the pack:
   docs/portfolio/desk-drawing-set.md), then commit the pack, the catalogue, the
   gitlink and `lib/drawings/**/*.generated.ts` together. tests/drawing-set.test.ts
   and the build's checkDrawingSet fail until the drawing set matches the pack.
6. Run the bench (above) and the e2e tour; re-pin S1–S5 in
   `tests/estate-budget.test.ts` with a reason.
