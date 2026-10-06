# CLAUDE.md — Portfolio repo guide for AI agents

React 19 + TypeScript + Vite portfolio site for Rahul Mitra, with an in-repo
resume generation pipeline. `npm run dev:vite` (port 5173, see
`.claude/launch.json`), `npm run typecheck`, `npm test` (vitest),
`npm run test:e2e` (Playwright).

Before any resume change, read `.agents/skills/resume-editing/SKILL.md`.

## UI — Industry design system (the ONLY design system)

The mounted UI is the blueprint **"Field Workbench"** built on the Industry
design system (reference docs vendored in `design/industry/`; approved source
mockups in `design/mockups/`). All new UI work
follows it — steel-blue accent `#5980a6` on a light technical ground, Barlow
Condensed headings over Barlow body, square corners, hairline borders, `+`
registration marks (`.blueprint` + four `<i class="corner …">`), duotone
imagery (`.duotone`), Lucide-style icons at stroke 1.5. Single light look — no
dark scheme, no accent switcher. Tokens + all component classes live in
`index.css` (`--color-*`, `--font-*`, `.btn`, `.tag`, `.input`); never
hard-code a hex or font the tokens carry. Contrast rule: text on solid accent
fills uses the `--color-accent-700` step (not raw accent), and the smallest
annotation text uses `--color-neutral-700` — pinned by axe scans in
`tests/e2e/quality.spec.ts`.

- Desktop ≥881px: `components/workbench/FieldWorkbench.tsx` — a windowed
  drawing set (11 draggable windows over a blueprint desk, crane-rig physics
  from `lib/rig.ts`). App registry/data adapters: `lib/workbench.ts` (ids
  reuse `lib/workstation.ts` so the AI assistant + `server/pageAgent.mjs`
  command contract stay valid). Window sections keep their anchors (`#home
  #work #experience #all-work #systems-lab #technical-lab #world #domains #proof
  #resumes #contact #resume-builder`, `experience-<id>`, `project-<id>`) — the
  assistant cites them (`allowedLinks` in `lib/askPageState.ts`, pinned against
  the registry by `tests/page-agent-server.test.ts`) and
  `tests/semantic-render.test.ts` pins `experience-<id>`/`project-<id>`. The
  DOM ids are hardcoded in the window bodies (`WorkbenchWindows.tsx`,
  `ResumeBuilder.tsx` and `estate/EstateWindow.tsx`, whose `id="world"` the
  Estate keeps), not derived from the registry, so renaming one passes
  the tests and strands the assistant.
  `#flow-shop` and `#drop-test` are in-window targets, not citable anchors; the
  FX panel opens the latter with `dispatchWorkbenchOpen({ appId: 'systems-lab',
  targetId: 'drop-test' })`.
- Mobile ≤880px: `components/workbench/FieldIndex.tsx` — one searchable
  registry with traverse/crane rigs. SSR renders both surfaces (CSS hides
  one); after hydration `App.tsx` prunes to the active one. Keep `App`
  render-pass free of `window` access — the build prerenders it.
- **Mechanism bench** (`components/workbench/MechanismBench.tsx`, inside the
  Systems Lab window — no new app id, no new anchor). Six live mechanisms drawn
  from a planar projective geometric algebra: `lib/pga.ts` (core), `lib/pgaDraw.ts`
  (blueprint kit), `lib/pgaMechanisms.ts` (the six). Ported from the 83-asset
  library in `design/mockups/pga*.js`; `tests/pga-port.test.ts` replays each one
  against its original and compares every canvas call, so the port cannot drift.
  Three host rules the file exists to keep: canvas work happens only in an effect
  (`kit()` reads `devicePixelRatio`, and `App.tsx` is prerendered), canvases are
  found by DOM scan rather than refs (when the workbench re-rendered every window
  on open/close, that detached refs and blanked all six; window bodies are
  memoized now (`MEMO_BODIES` in FieldWorkbench), but the scan stays the rule),
  and the kit's caption
  colour is `--color-neutral-700`, not the mockup's `--color-neutral-500` — axe
  cannot see into a canvas, so that would have broken the contrast rule while
  passing CI. Mechanisms are authored in a fixed 320×230 frame and only ever
  scale **down**; upscaling goes soft because the backing store caps at 2×.
- **Systems Lab exhibits** (desktop-only, each a `<Hoist>` after the mechanism
  bench — no new app id). FIG. 05d `FlowShopBench.tsx` (`#flow-shop`): a seeded
  F3|prmu|Cmax teaching model in `lib/permutationFlowShop.ts` (pure, no imports:
  Taillard generator, Johnson/CDS, NEH, the exhaustive 720-order optimum, Taillard's
  lower bound, `explain()`). Synthetic jobs, unrelated to FIG. 05a (the Abbott
  work) — never let it borrow Abbott's words. No JS animation; its CSS transitions
  switch off under the motion rule below. FIG. 05e `DropTest.tsx` (`#drop-test`):
  the old Smash/Gravity word physics, contained — six stacks of the competency
  tools in a 640×280 cm rig. `lib/dropTest.ts` owns layout, units and both force
  models; `DropRig` (matter-js at a fixed 1/60 s) is `lib/dropRig.ts`, imported
  beside matter-js (`lib/physicsRuntime.ts`) when the rig is first needed —
  neither is in the main bundle, so never import `dropRig` statically. One rAF, stopped when every
  block sleeps, the rig is offscreen, or motion is halted; halted, a strike
  resolves straight to rest. Interactive stages stop `pointerdown` natively, or
  FieldWorkbench's hoist nudge swings the card under the visitor's drag.
- **Camera Lab** (`CameraLab.tsx` is the whole Camera window body, inside
  `#technical-lab`): one synthetic 35 mm camera and 9×6 checkerboard read through
  four modes — `intrinsics | extrinsics | optics | stereo`, ids the assistant
  targets via the `portfolio:camera-lab-mode` event — plus a seeded Zhang
  calibration. The math is pure (`lib/cameraModel.ts`, `lib/cameraCalibration.ts`,
  `lib/cameraFigure.ts`). The Zhang solver (`lib/cameraCalibration.ts`) is
  imported dynamically on the first Calibrate, out of the main bundle; the seeded
  views the prerender draws are `lib/cameraCalibrationViews.ts` (re-exported by
  the solver), so only import the solver statically from tests. Its known answers in `tests/camera-model.test.ts`
  and `tests/camera-calibration.test.ts` are pinned: a number that moves means
  the math moved, so justify it against an independent check (e.g. OpenCV
  `calibrateCamera`) before re-pinning — never just update the expectation. No
  animation loop; the prerender is the full Intrinsics view.
- **Estate (WIN-07)** — app id `world-3d`, anchor `#world`, FIG. 07, retitled
  "Estate" (label and short label); still 11 windows, no new id or anchor, and a
  building id never goes into `targetId`. It shows Sample Town N5, the generated
  HDB estate of the Bonsai-Estate submodule (a sample, "not a real town" — that
  phrase is pinned in four places). Three layers, each heavier one lazy:
  1. **View** (main bundle, prerendered): `estate/EstateWindow.tsx` (`EstateView`
     + a bootstrap) and `estate/EstateRegistry.tsx` — duotone poster
     (`<picture>`, lazy, from the catalogue), FIG. 07 caption, and a side panel
     that is its own scroller (the sheet does not scroll: DESIGN.md's
     one-scroller exception) with the facts, 14 building rows as buttons,
     `#estate-keys` in a closed `<details>`, the spatial RECORD links, the repo
     link and the CC BY credit linking `/estate/LICENSE.txt`. Every value is read
     from `lib/estate/catalogue.generated.ts` (written by the pack tool; never
     hand-edit it — it carries only what the main bundle reads: one line per
     site with its storey range written out, and the two byte totals the Load
     label counts; per-site file sizes stay in pack.json). No canvas is
     prerendered; no id starts with `experience-`, `project-` or `selected-`; no
     `Hoist` wraps the stage. The `<figure>` is FIG. 07 (corners, caption); the
     stage (`[data-estate-stage]`) is a layer inside it holding the poster,
     plate, HUD and canvas, and gets `role="application"`/`tabIndex=0` only while
     live or frozen — never on the figure (axe `aria-allowed-role`). Its
     `aria-describedby` is the HUD's short per-mode summary `#estate-keys-desc`
     (`hidden`, always in the tree): `#estate-keys` sits in a closed `<details>`,
     which Chrome keeps out of the accessibility tree. Without JavaScript the
     poster in the closed window downloads anyway (browsers ignore
     `loading="lazy"` with scripting off; ~50–70 KB per no-JS desktop visit) —
     accepted: §9.2 pins the prerendered `src`.
  2. **Controller** (`estate/EstateController.tsx`, a lazy chunk the bootstrap
     imports the first time the window is open, or when a focus request or row
     press comes first): renders nothing, reports an `EstateModel`
     (`estate/estateModel.ts`, types only) to the view. It exists because the
     main bundle may grow by at most 12,000 B for the Estate; policy, presence,
     Esc and the engine lifecycle do not fit in that and decide nothing before
     the window opens. It runs `lib/estate/policy.ts resolveEstatePhase` on what
     `estate/usePanePresence.ts` observes (a MutationObserver on the section's
     `style`/`data-focused`, an IntersectionObserver on the stage,
     visibilitychange, `onMotionChange`; **never** the `WORKBENCH_WINDOW` event,
     which belongs to the sound cues) plus `useOptionalExperienceMode()` — whose
     new `resolved` flag, not `capabilities !== null`, says the policy has
     resolved, so a deep link never flashes consent. Phases: poster, consent
     (Save-Data, reduced motion, `?mode=scan`; the Load label is generated from
     the catalogue and never understates the download; Save-Data loads lean),
     loading (automatic loads wait for `readyState` complete, then idle),
     live, frozen (closed, hidden, off screen), released (closed 30 s, or the
     rail's DESK — a close counts as DESK only when `.wb-rail-desk` was pressed
     within a second and every window is closed; closing the last window by hand
     waits the 30 s like any close), lost / unavailable (two live resets a
     minute, no restore in 5 s) / error / stale (Reload). A failed engine or
     controller **chunk** is Reload too, never Retry: a browser keeps a failed
     `import()` in its module map for the document's life, so importing again
     makes no request; Retry stays for failures after the chunk ran (pack files,
     engine errors), which fetch afresh. Esc is scope 2: one native keydown listener on the section
     peels one layer per press through `lib/estate/input.ts decideEscape` and
     stops propagation only for a press it consumes, so FieldWorkbench's handler
     minimises on exactly the rest. A press or focus in the body raises an
     unfocused window (`dispatchWorkbenchOpen`), except from the titlebar. Focus
     moves (to the stage after a clicked Load, a registry fly-to) are requests
     the view carries out after its commit, never on an automatic load or a
     focus request, and a clicked load's move is cancelled by any press or focus
     outside the window meanwhile (it must not pull a window the visitor left
     back over the one they chose). A live window that fails moves focus from
     inside it to the side panel's Retry/Reload (scrolled into sight) and back to
     the stage on restore; the HUD hands focus to the stage (or to KEYS from its
     popover) whenever the focused control vanishes or is disabled, so focus
     never falls to the body and the next Esc never skips the window's layers.
     The side panel's polite status line speaks phase changes (a row pressed
     before live says "Load the 3D estate to fly there" there); the HUD's hidden
     status speaks the camera's location. `portfolio:estate-focus` (`lib/estate/events.ts`) requests are
     held until live and delivered once; the assistant's `focusEstate` command
     that sends them is P6.
  3. **Engine + HUD** (`estate/engine/**`, `estate/live/**`: three r186,
     camera-controls; built as `assets/estate-engine-<hash>.js` plus
     `EstateHud-<hash>.js`), reached only through `estate/loadEngine.ts` (one
     shared `import()` of both, not cached on failure; a 404 means the site was
     redeployed under the page → `stale`, Reload) and known to the shell only
     through `estate/engineApi.ts` (types only). The controller finds the stage
     by DOM scan (`[data-estate-stage]`), mints a fresh token per instance and
     drops events carrying any other. The engine appends its own canvas to the
     stage, takes pointer and wheel input on that canvas only and keys only when
     the stage itself is the target (scope 1, so HUD and registry buttons keep
     native Enter/Space), and writes `data-estate-draws/-tris/-ms/-programs/-band`
     on the stage at most twice a second.
     - `engine/core.ts` draws, with `renderer`, `clip`, `loaders`, `materials`,
       `scene`, `streaming`, `loop`, `governor`, `levels`, `stats` and
       `lifecycle` beside it: one token palette (`lib/estate/palette.json`, read
       at start through `shellDom.readTokenColours`; six programs, every switch a
       uniform, no colour in engine code); massing → F → D per building by
       screen-space error within the tier's caps (`lib/estate/{lod,tiers}.ts`:
       150 draws and 1.2 M triangles at the top tier); downloads through
       `lib/estate/scheduler.ts` (≤ 4 at once, ≤ 1 geometry upload a frame,
       pre-gzipped files sniffed and inflated by `DecompressionStream`). It
       renders only on change (`lib/estate/frameLoop.ts`) — **at rest it requests
       no animation frames**; a level step held by lod's 400 ms dwell is woken by
       one timeout (`LodSelector.holdUntil`), not by rAF — and its governor
       (`lib/estate/governorCore.ts`) steps pixel ratio and tier down on dropped
       frames and probes back up. A window over half dropped closes after 1 s and
       20 frames instead of 2 s and 60 (once a calibration less than 10 s old says
       the scene, not the display, is slow); a pixel-ratio notch's buffer
       reallocation waits for the first frame without motion (2 s at most), and
       the calibration burst never runs under the visitor's hand. A boxless host
       (a closed window is `display:none`) keeps its last size, and `resume()`
       reads the size synchronously, so a reopen never draws at 1 × 1. The
       site's quadrants and trees have one material each (one may never serve a
       Mesh and an InstancedMesh: three re-resolves the program twice a frame);
       P5's interiors keep that rule. The
       starting tier is read from the renderer string in `engine/renderer.ts`
       (never in `lib/experienceMode.ts`, whose test bans GPU probes) or from
       `?estate-quality=high|mid|low|min`. On a lost context the engine reports
       `lost`/`restored` and the shell counts live resets; `dispose()` is the
       ordered teardown and emits nothing. F triangles and D instances carry
       their storey (`_meta`, `_STOREY`.x) so P5's façade mask can hide a band.
     - `engine/controls/`: Overview (camera-controls with its own wheel handler
       off; the stage's non-passive wheel dollies at the cursor, so the sheet
       never scrolls; A/D and Shift+arrows pan), Fly (WASD, E/Space up, Q/C
       down, R/F look, Home back to the aerial view, drag looks; pointer lock
       only on L or CAPTURE), the 1.2 s fly-to (a cut when `motionHalted()` or
       `instant`; the bounding sphere's silhouette fills 0.8 of the short side,
       aimed at the box's middle, so a point block keeps its roof in frame; the
       chip names the building while the camera rests where the flight landed,
       even an L-block whose box centre is in its courtyard) and footprint
       picking (12 px tap slop for touch and pen, 5 px for a mouse). The first
       live frame and Home are the poster camera with its Blender lens shift
       turned into the view direction (`engine/views.ts aerialPose`; a pack
       without views uses upstream's aerial_NE numbers). `engine/navigation.ts` and
       `engine/rig.ts` are the seam P5's Walk, Enter and interiors and P6's Plan
       extend: `features` names the live commands, and every other one returns
       false rather than throwing.
     - `live/EstateHud.tsx`: survey-annotation chips over the canvas — location
       (no live role; one visually hidden `role="status"` node speaks through
       `lib/estate/announce.ts`), selection with mirrored Fly to, OVERVIEW | FLY,
       Home, a KEYS popover (an Esc layer, next in tab order after KEYS),
       CAPTURE (which gives the stage the keys first), FULLSCREEN on `#world`,
       north arrow, KEYS ACTIVE, step buttons (every drag has one: Overview pans,
       zooms, orbits and tilts; Fly moves, strafes, climbs and looks), the
       streaming line and lean mode's "Load full detail". Nothing in the top-right
       row may change width between a press and its release — the KEYS chip
       reserves its longer label's width — or the row reflows under the pointer
       and the click is lost. The north arrow is an HTML dial the engine turns
       per frame (a composited transform; the inherited `--estate-north` is
       written only at rest, for a dial mounted later — written per frame it
       restyled the stage subtree, 3.4 ms a frame). `?estate-debug=1` adds the
       stats row. Its CSS is the `.wb-estate-hud*` block in `index.css`.
     Test seams: `?estate-quality=` and `?estate-release-ms=` (100 ms–30 s; only
     ever shortens the 30 s release hold). `?estate-bench=1` turns on the debug
     readouts only; the benchmark route is P7.
  The GPU claim (`lib/gpuClaim.ts`, event `portfolio:gpu-claim`): while live,
  focused and under no `.panel-backdrop`, the controller holds
  `claimGpu('estate')`, and a mounted desk backdrop yields — it keeps its context
  and last frame, stops animating, and reads "HELD · ESTATE"
  (`desktopBackgroundPolicy` reason `yielded`, checked last, just before
  `running`).
  The pack (`public/estate/v1.2/`, raw-content-hashed immutable names; P4b loads
  `poster`, `s0`, `f` and `d`) comes only from the pack tool (see the
  Bonsai-Estate section). Until the v1.2 release is published, the window runs on
  the v1.2 candidate rc2 pack (`pack.fd986442.json`, `dev: false`, built from the
  candidate zips) copied into `public/estate/v1.2/` and excluded in
  `.git/info/exclude` — never commit it — and the committed
  `catalogue.generated.ts` is generated from it; the pack is committed only from
  the published release (`estate:check --provenance` passes once upstream tags
  v1.2). That is gated three ways: `tests/estate-pack.test.ts` fails when any
  `/estate/` URL the catalogue names is missing under `public/` (every CI and
  Vercel checkout until the pack is committed) and on a dev catalogue under
  CI/Vercel; `npm run estate:check` fails on both everywhere; and
  `scripts/check-bundle.mjs` (the build) fails when a catalogue URL is missing
  from `dist/`, and on a dev catalogue on Vercel or CI.
  Pinned by `tests/estate-window.dom.test.tsx` (fake engine), the Estate cases in
  `tests/workbench-deeplink.dom.test.tsx` and `tests/workbench-links.test.ts`
  (exact links, no hex anywhere under `estate/`, identical double render),
  `tests/estate-boundary.test.ts` (the import rules above),
  `tests/estate-runtime.test.ts` (the loader), `tests/estate-engine-*.test.ts`
  (teardown with a fake canvas, the pure helpers, parts decoded from the pack
  when one is present), `tests/estate-budget.test.ts` (C11's caps over the
  70,560-pose grid on the pack's numbers, and §7.11's S1–S3 pinned per pack:
  a re-pack must re-pin them with a reason), `tests/estate-reader.test.ts`
  (every GLB against pack.json: required extensions, ≤ 65,535 vertices a
  primitive, `_META`/`_STOREY` u8 × 4), `tests/estate-pack.test.ts` (the merge
  gate above), `tests/estate-controls*.test.ts`, the Estate shell case
  in `tests/e2e/quality.spec.ts`, and `tests/e2e/estate.spec.ts`, which runs the
  real engine in its own Playwright project, `chromium-webgl` (SwiftShader
  flags): live within 30 s inside the caps, fly-to, Esc layers, axe, consent,
  no-WebGL, **zero animation frames at rest**, a fly-to that cuts while motion
  is paused, the Save-Data byte count against its label, stale, HUD mouse
  clicks with the stage focused, a fully clean axe scan, a reopen drawn at full
  size and detail, and Reload after a failed engine chunk. Restated constants in

  the view (`ESTATE_DISPLAY_NAME`, `ESTATE_REPO_URL`, `ESTATE_FOCUS_EVENT_NAME`,
  the shell's tier list) exist so the main bundle need not import `lib/estate`
  modules that build tables at import; the DOM test pins each to its source.
- **FX desk backdrops** (`DeskBackdrop.tsx`, first child of `.wb-desk`, desktop
  only): two FX-panel toggles, both off at boot — the N-body field (`NBodyField.tsx`,
  a 2-D fast multipole solver in `lib/nbody/fmm.ts` run by `workers/nbody.worker.ts`,
  painted by `lib/nbody/paint.ts`) and WebGL2 stable-fluids smoke (`FluidField.tsx`).
  Each engine is a lazy chunk loaded on first switch-on. `lib/desktopBackgroundPolicy.ts`
  decides: mount only once `allowHeavyAssets` (false under reduced motion and
  Save-Data), then freeze rather than tear down when the page hides or motion
  halts. Settings are `BackdropSettings` (`lib/backdropSettings.ts`) in
  `EffectsProvider` (`contexts/PhysicsContext.tsx`); DeskBackdrop reads
  `EffectsContext` directly so a bare `<FieldWorkbench/>` still mounts in tests.
  A mounted backdrop also freezes (reason `yielded`, "HELD · ESTATE") while the
  Estate window holds the GPU claim (`lib/gpuClaim.ts`, see the Estate bullet).
- **Motion rule.** `lib/motion.ts`: `motionHalted()` is prefers-reduced-motion OR
  the FX "Pause all motion" switch (`html[data-motion-paused="true"]`), and
  `onMotionChange()` re-syncs. Every animation loop stops, or draws one still
  frame, through it; no loop queries prefers-reduced-motion on its own
  (`lib/experienceMode.ts` reads it once, for the heavy-asset policy).
  Loops also sleep when idle instead of requesting a frame every vsync: the
  window rig in FieldWorkbench stops once springs settle and wakes through
  `wakeRef` (scroll, nudge, drag, focus/layout, resize, motion change, sheet
  content resizing); MechanismBench stops while no canvas is on screen. Both
  are pinned in tests/workbench-rig-idle.dom.test.tsx and
  tests/mechanism-bench.dom.test.tsx. The Estate engine renders only on change
  and, halted, turns every flight into a cut while a visitor's own drag still
  redraws; the real engine is pinned idle and cutting by
  `tests/e2e/estate.spec.ts` (cases 11 and 12), not by a fake.
- Retained layers: `AskThePage` (AI), `EffectsLabPanel` (FX) and
  `AudioSpriteController` (opt-in sound cues) plus their providers
  (`ExperienceModeProvider`, `EffectsProvider`). The panels reach the workbench via
  the `portfolio:workbench-open` CustomEvent (`dispatchWorkbenchOpen` in
  `lib/workbench.ts`). Lab and window outcomes are `PortfolioWorldEvent`s
  (`lib/worldEvents.ts`) that only the sound cues listen to (`lib/audioPolicy.ts`).
- The pre-2026-09 "continuous field test" UI — `PortfolioExperience`,
  `WorkstationShell`, the appearance system, the optical world and Courier, the
  ASCII background, the retired scene's Three.js and GSAP — was **deleted** in the
  2026-10 sweep; the parts worth adapting became the features above. Git history
  has the rest (last present at `aad91d6`). Don't resurrect it. three r186 came
  back in 2026-10 only as the Estate window's lazy engine: exact pins `three@0.186.1`,
  `camera-controls@3.1.2` and `@types/three@0.186.0`, held by
  `tests/world-retirement.test.ts`, which also bans every other WebGL scene and
  in-browser IFC library (r3f, Babylon, PlayCanvas, OGL, web-ifc, That Open,
  three-mesh-bvh). Both packages may be imported only under
  `components/workbench/estate/engine/**` and `estate/live/**`, and those two
  folders are reached only by the `import(` calls in `estate/loadEngine.ts`
  (`tests/estate-boundary.test.ts`). The shell talks to the engine through
  `estate/engineApi.ts`, which is types only.

## Resume system (NUS CDE style, edition-based)

- `public/resume/generated/*` are **build artifacts — never hand-edit them.**
  Source of truth is `scripts/resume/content/*.json` (entry/bullet pools +
  per-role configs in `content/resumes/`). Styling lives in two interchangeable
  modules exposing the same nine names: `scripts/resume/nus_style.py` (Arial,
  A4, the NUS CDE layout — **the default since 2026-11**, measured out of
  Rahul's own master CV) and `scripts/resume/harvard_style.py` (Times New Roman,
  Harvard OCS layout — still an option, `--style harvard`). `docx_base.py` holds
  the python-docx plumbing both share. All of it is deliberate; change nothing
  there without explicit approval. `server/resumeStyles.mjs` is the JS mirror
  and has to agree with it.
- Current edition: **2026-11**. `generated/` keeps the current + previous
  edition; older sets live in `public/resume/archive/`. Its eight PDFs were
  last exported through Word (`export-pdf.ps1`) on 2026-10-02, which settled the
  LibreOffice-only export of 2026-09-29.
- Eight outputs: six role-targeted one-pagers, `highlights` (one-page best-of
  across all profiles), and the two-page `general` master CV, which is the
  document `rahul-mitra-master-cv.docx` is the ground truth for. Every config
  declares its own `bodyPt` (8.5–10 in this edition) and `marginIn: 0.5` —
  do not assume a size. The pins are what the JS auto-fit landed on in `nus`;
  `--style harvard` reuses them best-effort and ships nothing.
- Edition bump checklist:
  1. Edit content JSONs, then `npm run resume:lint`.
  2. `python scripts/resume/build_resumes.py --edition <YYYY-MM>`
  3. `powershell -File scripts/resume/export-pdf.ps1 -Edition <YYYY-MM>`
     (MS Word COM; the `-UseLibreOffice` fallback shifts pagination and
     inverts the NUS section rule. No Windows: `python
     scripts/resume/export_pdf_libreoffice.py --edition <YYYY-MM>`, which
     requires the real fonts and corrects the rule; see the skill's "No
     Windows?" note, and re-verify)
  4. `python scripts/resume/verify_resumes.py --edition <YYYY-MM>` must pass
     (page counts: `general` = 2 pages, all others = 1; contact links in DOCX
     rels and PDF annotations; content assertions).
  5. Visual QA: render PDFs to PNG (pdftoppm) into `.impeccable/resume-qa/`
     and inspect.
  6. `git mv` the now-oldest edition from `generated/` to `archive/`.
  7. Bump `resumeEdition` in `siteConfig.ts` **and** the hardcoded general-PDF
     path in `server/pageAgent.mjs` (an .mjs file — it cannot import the TS
     constant).
  8. Update the edition-stamped URLs in `public/llms.txt`, then `npm run
     snapshot` and commit `server/portfolio-snapshot.json`.
- Ordering policy (user-mandated, revised 2026-09): experience/education/
  leadership sort by END date first - entries still running first by start date
  descending, then ended entries by end date descending; an entry is still
  running exactly when it has no `end` key. This replaced a strict start-date
  sort, which put People's Association (ended Sep 2026) below the Abbott
  internship (ended Jun 2026). Never "relevance-first".
- One-page fit trim ladder (in order): drop coursework bullet → reduce
  3-bullet entries to 2 → drop least-relevant project → then typography, which
  is the style's own ladder: `nus` holds 0.5" margins and steps the body
  10.5/10/9.5/9/**8.5pt**; `harvard` steps 10.5→10pt then margins 0.7→0.6→0.5".
  Never below the style's floor. Fit truth = pypdf page count — the JS model
  agrees with Word to within a line, but only Word is authoritative.

## Machine access (MCP + llms.txt)

- `api/mcp.mjs` is the public MCP endpoint — open read/build tools plus a
  bearer-gated job-search surface (`https://rahul-mitra.com/api/mcp`, stateless
  Streamable HTTP via `mcp-handler@2`, seventeen tools) and
  `api/portfolio.mjs` returns the same data as
  one JSON document. Both read `server/portfolioMcp.mjs`, which imports ONLY
  `server/portfolio-snapshot.json`, the resume content JSONs, and packages —
  never `portfolioData.ts`: Vercel compiles `api/` per file as native ESM with
  no bundling, so relative imports there must carry `.mjs`/`.json` and JSON
  imports need `with { type: 'json' }`.
- `server/portfolio-snapshot.json` is a committed build artifact of
  `lib/portfolioSnapshot.ts`. After changing data in `portfolioData.ts`,
  `lib/workbench.ts`, or `siteConfig.ts`, run `npm run snapshot` and commit —
  `tests/portfolio-mcp.test.ts` fails when it is stale. A new resume config
  also needs an import added to `resumeConfigs` in `server/resumeContent.mjs`.
- **Résumé builder.** `api/resume.mjs` renders a résumé on demand from a spec in
  the URL (`?spec=<base64url deflated JSON>&format=pdf|docx|md`, POST for long
  specs) — stateless, no storage. `server/resumeRender.mjs` is a JS port of
  `harvard_style.py` using pdfkit's Standard-14 Times fonts; its layout
  constants were calibrated from the Word output (line advance 1.152x size,
  baseline 0.93x, Word takes the MAX of adjacent paragraph spacing). It measures
  before drawing, so page counts are exact. Auto-fit walks the typography ladder
  only and never drops selected content. **The eight canonical résumés stay
  Word-built** (python-docx, then a Word or corrected-LibreOffice PDF export) —
  this renderer serves custom builds. Shared content lives in
  `server/resumeContent.mjs`; a new résumé config needs an import added there.
  MCP tools `get_resume_guide`, `list_resume_blocks` and `build_resume` expose
  it; agents may only select ids, never supply bullet text
  (`server/resumeGuide.mjs` is the single source of those instructions). Section
  `title` and `subject` are **closed enums** in `specSchema`, not free strings —
  a heading prints full width on the page and `subject` is the PDF/DOCX document
  title, `build_resume` is open and `api/resume.mjs` is unauthenticated, so both
  were a text channel onto a document served under Rahul's name. The enums are
  exactly what the eight canonical résumés use (`general` alone may say "PROJECTS
  AND COMPETITIONS"), so a spec from `get_resume` still round-trips. The
  same surface is the `resume-builder` window
  (`components/workbench/ResumeBuilder.tsx`), which loads blocks after mount and
  previews the real PDF in an iframe. Bullets carry optional `deep`/`short`
  variants beside `default` and the per-slug overrides; the Python builder
  ignores any key that is not a slug, so they cost the canonical eight nothing.
  Deep detail generally needs a 2-page budget. What the repo cannot support is
  listed in `docs/resume-detail-gaps.md` — do not claim any of it.
- **Alternative phrasings.** A bullet may carry `phrasings`, a sibling map of
  wordings Rahul has approved for the same fact (`{ text, note, basis? }`). A spec
  selects one per bullet with a flat `phrasings: { "waaah.main": "landmarks-first" }`
  map keyed on the same ref findings report against. They live OUTSIDE `text` on
  purpose: `build_resumes.py` reads only `text.get(slug, text["default"])`, so a
  sibling key is invisible to Word by construction, and adding one changes no
  shipped document (`tests/resume-documents.test.ts` pins that). A key named after
  a résumé slug silently would, which is why they are not stored in `text`.
  `attestPhrasing` in `resumeCheck.mjs` gates them at commit time: tokens must be
  attested in that bullet's own approved text, metrics and product-numbers must
  match exactly, it must fit at every point of the legal typography grid (not just
  the four-rung ladder), it must earn its place, and its lead verb must hold the
  same ownership rank from `content/ownership.json` (keyed on `leadLemma` OUTPUT,
  which produces stems like `automat` and `pursu`). The guard cannot catch
  recombination, modality or implicature: it is a filter in front of review, not a
  substitute for it. `basis: "deep"` measures a phrasing against the deep wording
  instead, which is how a bullet carries a tighter form of its own long variant.
- **Résumé checker.** `server/resumeCheck.mjs` is a deterministic, rule-based
  linter. It **imports nothing** — a test enforces that, because
  `resumeRender.mjs` pulls in pdfkit (12 MB) and `ResumeBuilder.tsx` loads résumé
  modules in the browser. Text in, findings out; callers supply line counts from
  `measureBulletLines` in the renderer. Two lanes: `checkResume` runs inside
  `build_resume` and the `check_resume` tool and reports only what an agent
  selecting block ids can act on; `checkPool` runs via `npm run resume:lint` and
  reports what only a prose edit can fix (lead-verb concentration by section,
  sentence-frame concentration, tense vs an entry's own dates, deep-variant
  coverage). No score and no verdict, only counts; the gate is structural
  (`errors === 0`). Thresholds are calibrated on the real corpus and the numbers
  each rule fires today are pinned in `tests/resume-check.test.ts` — a content
  edit that moves them fails there rather than changing the report silently.
  `R7 unused-evidence` (a note) names a bullet on a selected entry that mentions
  more of the attested skills-line technologies than the one chosen; the term list
  is passed in from `skills.json` so the checker still imports nothing, and both
  sides are reported because the thinner bullet often carries the measurement.
  R7 is a note, so `build_resume` filters it out; `build_tailored_resume` asks for
  that one rule by name (`keepNotes` on `buildResume`, `POSTING_NOTES` in
  `jobSearch.mjs`), because comparing the evidence on the page with evidence
  sitting unused on the same entries is exactly the question a posting puts.
  `list_resume_blocks` carries `lead`, `lines`, `hasMetric`, `terms` (the same
  `termsIn` computation R7 scores a bullet on, so choosing by keyword and being
  judged by keyword use one measure) and `usedBy` (which canonical résumés select
  it — **empty is a fact, not a gap**: four bullets sit on no config, and a test
  pins that set) per bullet, plus the first four on each alternative wording and
  `usedBy` on each skills line, so an agent can spread verbs and evidence while
  choosing. `blocksByTerm()` is that index inverted — which selectable ids carry a
  term — built from `resumeBlocks()`, so a `blocked` entry is never named even when
  the question is asked backwards. Where an alternative would clear a finding the remedy
  is `kind: "rephrase"` naming it; that is what makes a repeat answerable at all,
  since most entries carry a single bullet and there is nothing to swap to.
  `scripts/resume/extract_facets.py` is an optional offline LangExtract
  authoring aid: it writes to gitignored `.impeccable/resume-facets/`, nothing
  it produces is served, and it may only annotate existing bullets.
- **Job search.** `server/jobSearch.mjs` holds the whole surface: seven tools
  registered beside `registerPortfolioTools` in `api/mcp.mjs`, which needed a
  zero-line diff to `portfolioMcp.mjs`. Storage is Upstash Redis over its REST
  API driven by plain `fetch` (no npm dependency, and never send the
  `Upstash-Encoding` header — the SDK's base64 default would silently encode
  every value), reading `UPSTASH_REDIS_REST_URL/_TOKEN` with
  `KV_REST_API_URL/_TOKEN` as fallback, both through lazy getters so vitest can
  stub them. Two keys and no index: `job:prefs` (a JSON string) and
  `job:applications` (a HASH, field = id). **The id IS the dedup hash** —
  `sha256(norm(company) \0 norm(role) \0 jd_hash).slice(0,16)` — so `HSETNX`
  makes create idempotent with no lock, no lookup and no check-then-set race,
  and a repeat returns the existing row untouched rather than merging (an agent
  re-evaluating a job sends the default `Evaluated`, and merging would reset a
  live `Applied` row) — so moving a row is create-then-`update_application`, never
  a second create. `jd_hash` comes from the NORMALIZED `jd_url` when there is one
  and from the text only otherwise: posting text is edited and re-scraped between
  runs, which grew a second row for a job already tracked, while the URL is the
  identity the board itself uses. The tracker `#` is a render-time ordinal. Five stateful
  tools require `PORTFOLIO_JOB_TOKEN` (≥24 chars or they stay off), checked per
  call off `ctx.http.req` rather than with `withMcpAuth`, which would 401 the
  whole endpoint on a stale credential and advertise a `.well-known` document
  nothing here serves. `export_profile` and `build_tailored_resume` stay open:
  they return only data already published. `export_profile` reads the gated
  preferences opportunistically — an anonymous caller gets `DEFAULT_PREFERENCES`,
  never the stored ones, since `exclusions` can name an employer — and says which
  in `preferences_source`, so a sync whose Authorization header never arrived is
  distinguishable from a real one rather than silently writing the defaults over
  a good `profile.yml`. `gaps` names what the repo cannot attest and a consumer
  must preserve locally across a sync; `work_authorization` is the one gap
  `set_job_preferences` can fill, keyed as career-ops' own `location.*` keys so
  filling it removes exactly those entries. `proof_points` are the spotlight
  projects — same withholding as the digest — not `snapshot.profile.stats`, two of
  which are site counters and all four of which shared one `#proof` anchor.
- **`blocked` withholds a card, never a fact.** The flag in `projects.json` is a
  curation flag: its reasons scope to "off résumés", two of them (weakest in the
  pool; the site is already in the contact line) cannot be about secrecy, and every
  enforcement site is a résumé emitter. It withholds a Projects-section ENTRY —
  nothing anywhere blocks a string. `article_digest_md` and `proof_points` honour
  the same list because they are a selected-evidence surface too; the full
  29-project catalogue stays open on `list_projects`, `get_project` and
  `/api/portfolio`, so withholding costs prominence, not availability. **Where a
  blocked project's work is also attested as employment, that bullet ships
  deliberately** — `flowshop` was blocked precisely because the same work is
  `abbott-intern.digital-twin`, which seven of the eight canonical résumés select
  (`docs/resume-detail-gaps.md` §9: "the stronger placement"). An integration read
  the resulting cv_md/digest gap as a contradiction; it is not, and the fix is
  never to delete the bullet. That section also says: do not "helpfully" restore a
  blocked project — ask Rahul first.
  Two hard invariants — this server
  **never dereferences `jd_url`**, and job-description text never reaches a
  spec, a document or storage; only its 16-hex digest and a match against
  Rahul's own attested vocabulary travel back. That vocabulary is
  `snapshot.resumes[].keywords` plus `skillTerms` (exported from
  `portfolioMcp.mjs`, derived from `skills.json`): the keyword rows alone are 42
  entries across the six candidate résumés, which labelled a card rather than
  matching a posting. `matchSlug` scores each résumé on the terms its own
  rendered document carries, and `build_tailored_resume` returns a `coverage`
  report — `covered`/`missing`, plus `covered_in` (bullet, skills, entry: a term
  only on the skills line is listed, not demonstrated) and `missing_blocks` (the
  ids that would supply it, from `blocksByTerm`) — drawn from that same closed
  alphabet, so a term the posting used and Rahul has never claimed cannot come
  back out. Ties in `matchSlug` are broken by rule, not by array position: hits,
  then hits on that résumé's own curated keyword row, then specificity (hits as a
  share of its whole vocabulary), then the slug. `matched` reports `margin`,
  `decided_by` and the full `ranking`. This is a fixed defect, not a preference —
  `Array.sort` is stable, so a measured Govtech posting that ties
  solution-architect and civic-tech-solution-architect at 6-6 was handed to the
  GENERALIST purely because it sits earlier in `portfolio-snapshot.json`;
  `tests/job-search.test.ts` pins that posting to the civic résumé. `dry_run: true`
  returns the same analysis with no render and no URL (prefer a new optional
  PARAMETER to a new tool — the 17-tool count is pinned in two places), and
  `resume_version` (`rv_` + 16 hex of the canonicalised spec plus the résumé
  edition) is the stable id `create_application`'s field always wanted. Two
  non-obvious guards hold that honest, and both cost a real bug to find: the four
  RL algorithm names are excluded (`UNBACKED` in `jobSearch.mjs`) because
  `docs/resume-detail-gaps.md` §1 backs them with a certification alone and no
  bullet anywhere mentions RL — left in, an RL posting came back "covered: DDPG,
  A2C · missing: none"; and the two halves are deduped **case-insensitively**,
  because a card saying "Full-Stack" beside a skills line saying "full-stack"
  scored one posting word twice and tipped close races. `skillTerms` treats
  parentheses as separators, not wrappers — splitting on `[,;]` first tore every
  comma-bearing parenthetical into fragments like `DQN)` and `deep RL (PPO` that
  could never match. A new MCP tool touches three
  places: the tool, `TOOLS` in `tests/portfolio-mcp.test.ts`, and
  `public/llms.txt` — two tests pin that.
- **Never provision a scratch Upstash database for this repo.** The vendored
  `.agents/skills/upstash-redis-js/SKILL.md` tells an agent with no credentials
  that it may mint a throwaway Redis over `POST upstash.com/start-redis`. Do not:
  the job-search tools keep ALL their state in `job:prefs` and `job:applications`,
  so a scratch database would silently take the application tracker with it when
  its 3-day TTL expired, with no error at write time. The real database is a
  Vercel Marketplace resource; when the env vars are missing the tools correctly
  say so, and that is the answer rather than a reason to create one.
- `public/llms.txt` is hand-maintained and edition-stamped (checklist step 8).
- `npm run dev` 404s `/api/mcp` and `/api/portfolio` (`server.mjs` routes only
  `POST /api/page-agent`). `npm test` drives the real handlers; after deploy:
  `npx @modelcontextprotocol/inspector --cli https://rahul-mitra.com/api/mcp --transport http --method tools/list`.

## Certification register

- `lib/certifications.ts` holds 48 course certificates; the files live in
  `public/certificates/courses/` (the two award PDFs at `certificates/` root are
  separate and referenced from `portfolioData.ts`). Every field — issuer, title,
  ISO date, credential id — is read off the certificate itself. **Never take a
  date from a file's mtime**: nine of these were downloaded in the same minute,
  and two Kaggle PNGs had mtimes a day earlier than the date printed on them.
- `excluded` withholds a ROW, never a file: all 48 ship and stay reachable at
  their URLs. Five are withheld — three non-technical, one whose title reads as
  account-attack tooling out of context, and the NVIDIA DLI course, which is
  already an achievement `proofUrl` and would otherwise render twice in `#proof`.
  It is deliberately not called `blocked`; that word is load-bearing for résumé
  emitters and has a different contract.
- Desktop renders inside `ProofWindow` (`#proof`) as a closed `<details>` — no new
  app id, no new anchor — reusing `.wb-arch*` verbatim. Mobile adds a `CERTS` kind
  to `FieldIndex`, held **out of the default ALL view** (`scopeOf`) so 43 rows
  cannot double the registry's scroll depth; it arrives on the chip or on search.
  The `.fi-hits` denominator is computed from the same scope as the numerator, or
  it reads "65/108" with no filter set.
- Nothing here reaches `server/portfolio-snapshot.json`, so nothing reaches
  `ATTESTED` in `jobSearch.mjs`. The two RL certificates stay uncovered by
  `build_tailored_resume` on purpose — a completed course is not applied work.
- Apart from the estate pack's checks (`scripts/estate/check.mjs` and
  `tests/estate-pack.test.ts`, which cover `public/estate` and the catalogue's
  URLs only), `tests/certifications.test.ts` is the only place in the repo that
  checks a `/public` reference resolves on disk.

## Experience data (site)

Career history renders from `experienceRecords` in `portfolioData.ts` (shown
in the workbench Experience window and the mobile registry). Adding a role
requires THREE entries: a `kind: 'career'` FieldNote in
`careerAndEducationNotes`, a record in `experienceDetailById`, and a start
date in `experienceStartById`. `tests/portfolio-data.test.ts` asserts the
newest organization and ordering; `tests/semantic-render.test.ts` pins
`experienceRecords` length — update both, then `npm run snapshot`.

## Bonsai-Estate submodule and estate pack

- `external/Bonsai-Estate` is a git submodule (`--name Bonsai-Estate`, https URL,
  no `branch`/`shallow`/`update` keys) of the public `Rah-Rah-Mitra/Bonsai-Estate`
  repo. The gitlink **records provenance only** — which upstream commit the estate
  pack is built from — and no build, test or deploy step reads it. Why: upstream
  does not track its `model/` export (it ships as release zips), so the submodule
  holds nothing the site could use, and a clone without it must build and pass the
  tests. It is pinned at `a6e1acf`, R of the v1.2 candidate rc2, which upstream tags
  `v1.2` once the pack's checks pass (plan R2b); apart from that one step it only
  ever moves to a tagged commit. Never add it with a local path, `file://` or
  `--reference`.
- Optional locally: `git submodule update --init external/Bonsai-Estate`.
- `external/` is excluded from `tsc` (`tsconfig.json` `exclude`), from Vite's
  watcher, `server.fs` and dependency scan (`optimizeDeps.entries` is just
  `index.html`, or the scan would crawl upstream's `reports/report.html`), from
  the local mirror (`scripts/verify-local-mirror.mjs`) and from the Vercel upload
  (`.vercelignore`, with `artifacts/`). Every one of those excludes is anchored to
  the repo root: Vite matches its globs against absolute paths
  (case-insensitively), so a bare `**/external/**` would refuse every file of a
  checkout that merely sits under a folder named `external`, and an unanchored
  `.vercelignore` name drops that folder at any depth. `tests/repo-hygiene.test.ts`
  pins all of that (the Vite globs through Vite's own matcher) and fails if any
  code file at the repo root (site data, `server.mjs`, `dev.mjs`, every tool
  config) or under `components/ lib/ contexts/ hooks/ workers/ server/ api/
  scripts/ tests/` imports or reads a path into `external/`; the only exception
  it allows is `scripts/estate/lib/provenance.mjs`.
- `vercel.json` caches `/assets/*` and `/estate/v<major>.<minor>/*` for a year as
  `immutable` — only those files are content-hashed. Anything else under
  `/estate/` (the licence notice) keeps Vercel's default.
- **The pack tool** (`scripts/estate/`, runbook `docs/portfolio/estate-pack.md`)
  is its own package with exact pins and its own lockfile: `npm run estate:setup`
  (`npm --prefix scripts/estate ci`), `npm run estate:pack -- …` (Node 24.x only),
  `npm run estate:check` (`scripts/estate/check.mjs`, no dependencies — its
  functions are for `tests/estate-pack.test.ts`), `npm --prefix scripts/estate
  test` (`node --test`). Never move its dependencies into the root
  `package.json`: `@gltf-transform/functions` pulls in `sharp`, which every Vercel
  install would then download.
- The pack's only real input is a Bonsai-Estate **release** (`--zips`: the two
  zips and `release_manifest.json`, every hash and the gitlink gated). `--dev-src`
  packs an extracted folder for pipeline work only: it skips provenance, stamps
  `source.dev: true` with an all-zero commit, refuses `--release`, `--catalogue`
  and any output under any `public/` folder (links resolved), and writes to
  `artifacts/estate/v1.2-dev/` (gitignored). Never commit a dev pack. A release
  pack goes under `public/` only at `public/estate/v1.2` and only with
  `--release`; a failed run empties only a folder that run itself emptied and
  took over (never "clean up public/"). Exactly one `public/estate/v*` folder
  exists; nav, build, blend, IFC and building LOD0 files are never opened, let
  alone shipped.
- The tool decodes every GLB it writes and refuses one whose triangles moved
  more than a quantisation step or whose quantisation made two faces of
  different slots coplanar (`lib/pure/quantcheck.mjs`): that is why F and the
  site are 16-bit — at 14 bits 5 mm road markings fell onto the asphalt.
- The few rules the tool shares with `lib/estate` (`packPathProblem`, storey-tag
  normalisation, the palette slot lookup, the SN5W header) are import-free ports
  in `scripts/estate/lib/pure/` — Node cannot load `lib/estate/*.ts` (extensionless
  imports) — and `tests/estate-pipeline-pure.test.ts` proves each port agrees
  with its TypeScript twin. Change both or neither. Root tests may import
  `scripts/estate/check.mjs` and `lib/pure/*`, never a module that needs
  `scripts/estate/node_modules`; and no `.mjs` there may start with a `#!` line,
  which vitest cannot load.
- Instance attributes are 4 bytes wide on purpose: `_STOREY` is u8 × 4 (x =
  storey) because gltf-transform 4.5.1's meshopt writer pads a 1-byte instance
  attribute to a 4-byte stride without recording it, and every reader then
  decodes garbage. The tool decodes each batch it writes and compares.

## Gotchas

- vitest picks up ANY `tests/**/*.test.ts` on disk, tracked or not.
- **jsdom suites are load-sensitive, not slow.** They mount components that
  reveal content through IntersectionObserver, rAF and layout effects, so
  testing-library's 1s default async budget is a race rather than a deadline.
  Four files lost it intermittently as the suite grew (project-showcase first,
  then workstation-integration, optical-bench, workbench-deeplink) — always
  passing in isolation. The budget is now raised once for the whole `dom`
  project in `vitest.config.ts` via `tests/setup.dom.ts`; do not re-add
  per-file `configure()` calls, which is whack-a-mole that only lands after
  each new flake has already cost someone a red run. Nothing is weakened — a
  genuinely broken assertion still fails. Adding DOM test files raises load for
  every other file, so re-run the full suite a few times after you do.
- `tests/e2e/quality.spec.ts` pins the workbench boot state (Home + Selected
  Work open), the 10/29 no-JS evidence counts, and zero serious axe violations
  on both surfaces.
- All public asset paths (`/images`, `/resume`, ...) must exist on disk under
  `public/` — no speculative references.
- `.gitattributes` marks `public/estate/**` and `tests/fixtures/estate/**`
  `-text` (and `*.glb`/`*.gz` binary): estate pack files are named by a hash of
  their content, and this checkout's `core.autocrlf=true` would otherwise rewrite
  them so a fresh clone no longer matches its own names.
- `npm run build` ends with `scripts/check-bundle.mjs`, which fails the build
  (Vercel included) when the main bundle — the one module script in
  `dist/index.html` plus every chunk it imports statically, all of which loads on
  every visit — exceeds min(B + 12,000, 510,000) B, where B = 496,834 B is the
  main bundle when the cap landed (all of it the entry; Vite itself only warns at
  500 kB) and the 12,000 B are the Estate shell's whole allowance. Do not raise
  `chunkSizeWarningLimit` instead. The same check holds the Estate engine:
  none of `WebGLRenderer`, `GLTFLoader`, `MeshoptDecoder` or `camera-controls`
  in the main bundle; exactly one chunk containing `WebGLRenderer`, within
  `lib/estate/packBudgets.json` `engineMinified` and `engineGzip`; and what the
  Load click downloads (engine and HUD chunks plus what they import that the page
  has not loaded) within `engineGzip`, because the consent label counts that
  cap. Both budgets were re-pinned in P4b at the measured size + 5%; a re-pin may
  move them but never above the plan's 307,200 B / 950,000 B. The main cap is
  NOT re-pinnable: after P4b the main bundle is 505,928 B of 508,834 B, so P5
  and P6's main-bundle code (Walk rows, assistant wording, `focusEstate` checks,
  the phone row) must fit in ~2.9 KB or move into the controller chunk. The
  same step also checks the Estate catalogue's URLs are in `dist/` (and that a
  dev catalogue never builds on Vercel/CI).
- `npm run test:e2e` runs two Playwright projects: `chromium` (everything but the
  Estate engine) and `chromium-webgl` (`tests/e2e/estate.spec.ts` only, launched
  with `--use-angle=swiftshader --enable-unsafe-swiftshader` so headless Chromium
  has WebGL2). Against your own server: `npm run build`, `npx vite preview --port
  <p> --strictPort` (with `API_PORT` pointing at a `node server.mjs`), then
  `PLAYWRIGHT_BASE_URL=http://127.0.0.1:<p> npx playwright test`.
- The local mirror (`scripts/verify-local-mirror.mjs`) copies `.impeccable/`
  except its untracked `review/`, `resume-qa/` and `resume-facets/` output:
  `tests/world-retirement.test.ts` reads the tracked
  `.impeccable/surfaces/index-html.md`, and the mirror runs `npm test`.
- Keep impeccable and other repo-wide scans off `external/`; it is upstream's
  tree, not this site.
