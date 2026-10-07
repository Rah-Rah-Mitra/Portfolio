---
name: "Rahul Mitra Engineering Portfolio"
description: "A blueprint Field Workbench: recruiter evidence drawn as a windowed drawing set, with optional labs that run real models."
colors:
  ground: "#f2f2f3"
  surface: "#e9e9ea"
  ink: "#1d1f20"
  accent: "#5980a6"
  accent-100: "#eef6ff"
  accent-200: "#d6ebff"
  accent-300: "#b5d9fd"
  accent-700: "#416180"
  accent-800: "#2c455d"
  accent-900: "#1d2d3d"
  neutral-200: "#e7e7ea"
  neutral-500: "#98989b"
  neutral-700: "#5d5d60"
  neutral-800: "#424244"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "52px"
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: "0.01em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "0.02em"
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.13em"
rounded:
  none: "0px"
spacing:
  "1": "3.4px"
  "2": "6.8px"
  "3": "10.2px"
  "4": "13.6px"
  "6": "20.4px"
  "8": "27.2px"
components:
  button-primary:
    backgroundColor: "{colors.accent-700}"
    textColor: "#ffffff"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
  button-primary-hover:
    backgroundColor: "{colors.accent-800}"
    textColor: "#ffffff"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  tag-accent:
    backgroundColor: "{colors.accent-100}"
    textColor: "{colors.accent-800}"
    rounded: "{rounded.none}"
    padding: "3px 10px"
  tag-neutral:
    backgroundColor: "{colors.neutral-200}"
    textColor: "{colors.neutral-800}"
    rounded: "{rounded.none}"
    padding: "3px 10px"
  input:
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "6px 10px"
    height: "36px"
---

# Design System: Rahul Mitra Engineering Portfolio

The tokens above are copied from `:root` in `index.css`, which is the source of
truth; `design/industry/` is the vendored Industry reference. When they
disagree, `index.css` wins and this file is stale.

## Overview

**Creative North Star: "Field Workbench".** The portfolio is a drawing set on a
light technical ground. Rahul's positioning, experience, selected work, full
project archive, capabilities, proof, résumés and contact are drawn as
blueprint objects — square, hairline-framed, marked at the corners with `+`
registration marks — and real work dominates every surface.

Desktop (881px and wider) is a windowed workbench: eleven draggable windows
over a gridded desk, a tool rail on the left, and cards that hang from crane
rigs and swing a little when moved (`lib/rig.ts`). Mobile (880px and narrower)
is one searchable registry, the Field Index, with the same evidence. The server
renders both surfaces; CSS hides one, and after hydration only the active one
stays mounted.

The labs are working models, not decoration: the Camera Lab (pinhole K with
lens distortion, pose and homography, thin-lens depth of field, rectified stereo
and a Zhang calibration), and inside the Systems Lab a mechanism bench, a
flow-shop sequencing model and a contained drop test. The Estate window shows
Sample Town N5, a generated sample HDB neighbourhood, as a duotone still render
with a text registry of its fourteen buildings, and a 3D viewer to orbit it,
fly to a building, open one storey of it as a cut plan, and walk in through its
void decks, stairs and lifts or straight into a room picked on the plan. The FX panel can switch on two desk backdrops, an N-body
gravity field and a fluid; both are off at boot.

**Key characteristics:**

- One light look. No dark scheme, no accent switcher, no appearance preferences
  for the site. The Estate viewer's toon shading is a render mode of the
  drawing, not a theme: the same tokens in three flat tones with its line work
  in ink (`--color-accent-900`), off by default, inside the 3D canvas only — no
  new colour and no change to any chrome.
- One accent, steel blue, used for state, links, kickers and the single solid
  object on a board: the primary button.
- Barlow Condensed headings in uppercase over Barlow body text.
- Square corners everywhere; hairline borders; `+` marks on every frame.
- Duotone imagery: photographs are washed into the accent.
- Evidence first. Every optional layer (labs, FX, the assistant) sits beside
  the record and can fail without hiding any of it.

## Colors

A mono scheme on a near-white ground.

- **Ground** (`--color-bg`, `#f2f2f3`): the page and the desk.
- **Ink** (`--color-text`, `#1d1f20`): headings and body text.
- **Divider** (`--color-divider`): ink at 16%, every hairline border.
- **Accent** (`--color-accent`, `#5980a6`): focus rings, lamps, status dots, rules
  that carry state. Its 100–900 ramp supplies tints (100–300), the base (500),
  and text-on-fill and pressed steps (700–900).
- **Paper tints** (`--paper-45/55/60/75`): ground mixed toward white, for window
  bodies, cards and figures.

### Named Rules

**The Accent-700 Rule.** Text on a solid accent fill uses `--color-accent-700`
as the fill, never the raw accent, so white labels clear 4.5:1.

**The Annotation Rule.** The smallest annotation text uses
`--color-neutral-700`. Both rules are pinned by the axe scans in
`tests/e2e/quality.spec.ts`; a canvas is invisible to axe, so canvas captions
follow the same token by hand.

**The Token Rule.** Never hard-code a hex or a font the tokens carry. The only
literal colours left are white (labels on solid fills, the résumé preview's
paper) and the faint desk and portrait grids.

## Typography

**Heading:** Barlow Condensed 600 (`--font-heading`), usually uppercase with
slight positive tracking. **Body:** Barlow (`--font-body`), 15px at 1.55.
**Labels:** small Barlow in uppercase with wide tracking (0.08–0.14em) for
kickers, window ids, readouts and dates; tabular figures (`'tnum'`) wherever
numbers line up.

**The Two-Voice Rule.** Condensed headings name things; Barlow explains them.
Never set a paragraph in the condensed face.

## Layout

The desktop frame is a 46px header, a 96px tool rail and the desk. Windows open
at fixed cascade positions, move by their titlebar, and each owns one internal
scroller. **The one exception is the Estate:** its sheet does not scroll (the
viewer fills it), and its side panel is its own scroller with
`overscroll-behavior: contain`; inside it, in Plan, the room list is a 260px
scroller of its own that chains to the panel at either end (no
`overscroll-behavior`), so a wheel over it still reaches BUILDINGS. Below 620px
of window width the panel stacks under the stage. A window's body may carry a hoist rig across its top; hoisted cards
(`[data-hoist]`) hang from it. The desk carries a 24px minor and 120px major
grid, the desk shortcuts and the title-block plate.

The mobile Field Index is a single column: status bar, search, kind chips, the
grouped registry rows (each expands in place), and a contact tab bar fixed to
the bottom edge. Certificates stay out of the default ALL view.

Window anchors are a contract the assistant and tests depend on: `#home #work
#experience #all-work #systems-lab #technical-lab #world #domains #proof #resumes
#contact #resume-builder`, plus `experience-<id>` and `project-<id>`. `#flow-shop`
and `#drop-test` are targets inside the Systems Lab window, not citable anchors.

**The Prerender Rule.** The render pass never touches `window` or `document`:
`App.tsx` is prerendered. Canvas, measurement and pointer work happen in effects.

## Elevation & Depth

Depth comes from hairlines, paper tints and position, not shadow. Windows carry
`--shadow-sm` at rest and `--shadow-lg` when focused; the open AI and FX panels
carry `--shadow-lg` and their docks `--shadow-sm`; a flow-shop job tile lifts to
`--shadow-md` while it is dragged. Nothing else casts a shadow.

## Shapes

Square corners throughout (`border-radius: 0`). Frames are `.blueprint` with
four `<i class="corner tl|tr|bl|br">` children (the `Corners` helper in
`components/workbench/bits.tsx`). Icons are Lucide-style single paths at stroke
1.5.

**The Geometry Must Measure Rule.** Lines, ticks, dimension marks and hatching
must measure or label something: a time axis, a blast radius, a field of view.

## Components

### Buttons, tags, inputs

`.btn` is square, hairline-bordered, condensed and uppercase. `.btn-primary` is
the one solid object (accent-700 fill, white label); `.btn-secondary` is the
outline; `.btn-ghost` is text-weight. `.tag` comes in accent, neutral and outline
variants. `.input` is square with a paper fill and an accent focus border.
Focus is always `outline: 2px solid var(--color-accent)` on `:focus-visible`.

### Windows and figures

A window is titlebar (controls, kind, title, id) + optional hoist rig + body +
footer. Content sections open with a `Kicker` (accent-700 small caps) and a
rule. Figures are `.blueprint.wb-figure` with a `FIG. nn` caption in
neutral-700.

### Labs

Every lab follows the same host rules (the header comment of
`components/workbench/MechanismBench.tsx`): canvases and nodes found by DOM
scan, not one-shot refs, because the workbench re-renders every window on
open/close; one animation loop at most, stopped offscreen; every canvas or SVG
stage is `role="img"` or `aria-hidden` with the same facts in real text beside
it; every pointer action has a button. Every loop stops, or draws one still
frame, when `motionHalted()` from `lib/motion.ts` is true (reduced motion or
the FX "Pause all motion").

- **Camera Lab** (FIG. 06, 06b): one synthetic camera and checkerboard read
  through four models, plus a seeded Zhang calibration.
- **Systems Lab**: FIG. 05c mechanism bench, FIG. 05d flow-shop sequencing
  bench (seeded synthetic data, not Abbott's), FIG. 05e drop test.
- **Estate** (FIG. 07): the poster and registry are prerendered text; the 3D
  viewer is a lazy chunk. Rules a 3D viewport adds to the ones above:
  - SETTINGS (a disclosure in the HUD, after KEYS) holds the viewer's
    preferences: walking and flying speed, look sensitivity and inversion, the
    first-person field of view (shown in degrees vertical and horizontal), the
    detail level, edge lines, toon shading, Reduce camera motion and a frame
    readout. Each applies at once, with no Apply button; each says where it
    applies; one Restore defaults; saved in this browser. Native controls only:
    range inputs with their value and units spoken, on/off switches as pressed
    buttons whose label never changes, the detail level as a row of pressed
    buttons (never a select, whose popup would take Esc). A fixed detail level
    is the visitor's and holds; only Auto lets the viewer lower detail when
    frames drop;
  - a keyboard viewport is `role="application"` with an `aria-label` and an
    `aria-describedby` pointing at a short per-mode key summary
    (`#estate-keys-desc`, the full list prerendered as `#estate-keys`), and only
    while there is a viewer to drive; the same facts (buildings, storeys,
    heights) are text beside it, and every pointer action is a button — Walk's
    0.5 m steps and 15° turns included; the touch stick is the one pointer-only
    control, and the step buttons beside it do everything it does;
  - halted motion turns every flight into a cut and nothing moves by itself, but
    a visitor-driven viewer still redraws on input (drag, keys);
  - text over a scene sits on opaque chips (`--paper-55`, a hairline border,
    square corners): the caption, the state plate and the HUD;
  - the focus ring is drawn inset, above the canvas: 2px `--color-accent-700`
    at −3px with a 4px `--paper-75` inner band, so it shows on any frame and
    stays inside the sheet's clip;
  - **HUD language is survey annotation** — location chips, storey strips,
    north arrow, plain prompts. No crosshair, minimap, score or game chrome;
  - **Walk offers what is where the walker stands**, as chips: a stair chip
    with ▲ / ▼ buttons, a lift chip that opens a level panel (the storey
    underfoot listed and disabled), the storey strip down the right edge
    ('RF +45.60 … L1 ±0.00', from the data, 24px rows) whose unreachable storeys
    stay focusable with a dashed border, dimmed words and their reason, and
    "Preparing walkway…" and "Streaming interior…" while files arrive. A lift
    ride is a 250 ms fade to the paper ground with its caption over it. Enter
    and Exit appear twice — on the HUD and under the building's registry row —
    and Enter's label says what it downloads. The touch stick is a 96px square
    pad, square-cornered like every control, shown only once the stage has seen
    a finger (or the pointer is coarse);
  - **inside a building, its own exterior is held at the façade level**, so
    its window frames and outline lines drop out while you are in it (or
    peeking through a notch at its other wing), and the opened storeys read as
    an unlined strip; looking straight up a stair well above the walk band
    shows an empty shaft. Both are accepted (the band, not the lines, is what
    the interior is about). A dotted line once seen along some flat window
    heads was a seam between the typical-storey and per-storey meshes, closed
    in the v1.2 release pack by quantising each interior file on one lattice;
  - **Plan is a drawing's plan cut** (P6): one storey seen from 55° above the
    horizon, cut at its floor + 1.2 m (the architectural convention; `[` and `]`
    move it 0.3 m between 0.3 and 2.4 m). Everything above the cut is gone —
    the storeys over it and the top of every wall — and where the cut opens a
    wall, slab edge or cabinet its section is filled flat
    `--color-accent-900`, unlit, as poché, so the walls read as solid black-blue
    lines and the rooms as the light floor between them. The storeys below show
    their façade. A picked room is marked where the section is, just under
    the cut (its floor is hidden by the cut walls from 55°): a lid of
    `--color-accent-700` at 22 % over the room and a solid band of it inside
    its outline, about 3 px wide where it is seen from; picked from the list or
    with ↑/↓ the view also slides to it and closes in (never out) until it
    fills a fifth of the short side, because a room of a 60 m slab is a few
    pixels at the opening view; a click on the floor leaves the view alone. It
    is named on a "ROOM" chip with Walk in, which lands mid-room facing its
    outside wall (its windows) where it has one, else down its longest run of
    floor; the cut has its own chip ("CUT +1.20 M", ▼ ▲). The
    storey strip down the right edge, the same one Walk uses, opens Plan from
    Overview on the storey pressed and marks the storey shown. The room list in
    the side panel groups rooms by flat ("#05-104"), then by what they are when
    there are six or more of a kind ("Hawker stalls", "Shop units", "Car lots",
    "Motorcycle lots"), then "Common areas", as square toggle buttons, the
    picked one with the selected row's accent-100 fill and inset accent-700
    border. It is one Tab stop (arrows move through it and pick, as on the
    stage), "Walk into …" sits under it in a slot that is always there (so a
    first pick never moves a row under the pointer), it scrolls inside its own
    260px box, and the side panel brings it into view when a plan opens;
  - **quality changes are silent and do not freeze the page** (P7): when the
    governor lowers detail or resolution nothing announces it, and a
    resolution step holds the last frame while the GPU catches up rather than
    blocking input (measured: no task over 50 ms after live on the bench's
    route at normal speed; under a 4× CPU slowdown a decode or worker message
    still takes 54–72 ms now and then); a GPU reset shows the "lost" plate and
    comes back on its own, and a context lost while the window was closed is
    rebuilt when it reopens, the camera where it was (Fly and Walk resume; a
    Plan comes back as Overview from its camera). The lowest tier, min (what
    software GL starts on), draws the far blocks as their grey storey-lined
    massing and only the nearer ones as façades, because its 0.3 M-triangle
    cap cannot hold all fourteen; so its first live frame is plainer than the
    poster it fades from. That is accepted rather than holding the poster,
    which at min would never give way; trees within 15 m of the camera are
    drawn whole there too, crowns on stubs beyond. While the Estate is in use (live, focused, no panel open) the desk
    backdrops hold still and their caption says so ("HELD · ESTATE").
    `?estate-bench=1` (`=max` maximised) is a debug mode that drives the
    camera by itself and shows the stats row; nothing in the UI links to it;
  - **one palette:** every 3D material role maps onto the design tokens
    (walls `--color-neutral-100`, slabs and paving `--color-neutral-300`, doors
    `--color-neutral-500`, asphalt `--color-neutral-700`, grass and foliage
    `--color-accent-300/400`, exterior glass and edges `--color-accent-700`,
    Plan's cut sections `--color-accent-900`;
    `lib/estate/palette.json`), read from CSS at mount. There is no second
    "model" palette and no colour in engine code.

### FX panel and assistant

FX and AI are docks at the bottom corners that open labelled dialogs with a
focus trap. FX holds Pause all motion, sound cues (muted until opted in) and
the two desk backdrops; the backdrops are desktop-only and paint behind every
window with `pointer-events: none`. The assistant answers from the page state
and opens windows through `dispatchWorkbenchOpen`.

### Motion

Motion explains state: windows swing on their rigs, lab results transition.
Reading copy never animates. Under reduced motion or Pause all motion every
loop halts and the labs resolve straight to their end state.

## Do's and Don'ts

### Do:

- **Do** lead with Rahul's positioning, current work, résumé and contact.
- **Do** take every colour, font and spacing from the `index.css` tokens.
- **Do** frame cards and figures as `.blueprint` objects with corner marks.
- **Do** keep every lab result available as real text, and every pointer
  action available as a button.
- **Do** keep optional layers optional: the site must read completely with
  JavaScript off, with motion halted, and with the labs closed.

### Don't:

- **Don't** add a dark scheme, a second accent, rounded corners, glows or
  gradients.
- **Don't** reintroduce Build/Secure lenses or lens-dependent evidence.
- **Don't** let a lab, backdrop or panel gate a fact, a résumé or contact.
- **Don't** present a synthetic lab as professional delivery, or imply
  robotics, SLAM, localization, mapping or Gaussian-splatting work.
- **Don't** access `window` or `document` during render.
