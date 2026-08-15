---
name: "Rahul Mitra Engineering Portfolio"
description: "A calibrated multi-camera survey of an intelligent-systems engineer's work, capabilities, proof, and trajectory."
colors:
  paper: "#f4f0e6"
  paper-deep: "#e8e2d4"
  paper-raised: "#fbf8f1"
  ink: "#172624"
  ink-soft: "#31413e"
  muted: "#56635f"
  faint: "#626e6a"
  rule: "rgba(23, 38, 36, 0.18)"
  rule-strong: "rgba(23, 38, 36, 0.34)"
  signal-teal: "#167a72"
  signal-teal-deep: "#0b514c"
  optimization-amber: "#955410"
  optimization-amber-deep: "#8a5415"
  reconstruction-violet: "#745985"
  secure-coral: "#a34249"
  secure-coral-deep: "#6f2931"
  chapter-work: "#e4ece5"
  chapter-domains: "#e9e5ef"
  chapter-experience: "#eee6d7"
  chapter-proof: "#f0e3df"
  chapter-resumes: "#dfeae8"
  white: "#ffffff"
typography:
  display:
    fontFamily: "Archivo, 'Segoe UI', sans-serif"
    fontSize: "clamp(2.7rem, 4.4vw, 4.9rem)"
    fontWeight: 740
    lineHeight: 0.94
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Archivo, 'Segoe UI', sans-serif"
    fontSize: "clamp(2.35rem, 5vw, 5.2rem)"
    fontWeight: 720
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Archivo, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.35rem, 2.5vw, 2.35rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Archivo, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label:
    fontFamily: "'IBM Plex Mono', Consolas, monospace"
    fontSize: "0.67rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.06em"
rounded:
  sm: "0.2rem"
  md: "0.45rem"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.5rem"
  6: "2rem"
  7: "3rem"
  8: "4.5rem"
components:
  button-primary-build:
    backgroundColor: "{colors.signal-teal-deep}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "0.68rem 1rem"
    height: "2.9rem"
  button-primary-secure:
    backgroundColor: "{colors.secure-coral-deep}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "0.68rem 1rem"
    height: "2.9rem"
  button-secondary:
    backgroundColor: "rgba(255, 255, 255, 0.35)"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.68rem 1rem"
    height: "2.9rem"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.68rem 1rem"
    height: "2.9rem"
  lens-option-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    padding: "0.4rem 0.58rem"
    height: "2.25rem"
  filter-chip-active:
    backgroundColor: "rgba(22, 122, 114, 0.1)"
    textColor: "{colors.signal-teal-deep}"
    padding: "0.5rem 0.7rem"
    height: "2.55rem"
  camera-selector-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    padding: "0.65rem 0.75rem"
    height: "5rem"
  field-input:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "0"
    padding: "0.65rem 0.8rem"
    height: "3rem"
  evidence-cell:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-soft}"
    rounded: "0"
    padding: "0.85rem"
---

# Design System: Rahul Mitra Engineering Portfolio

## Overview

**Creative North Star: "The Calibrated Multi-Camera Survey"**

The portfolio is a code-led survey of one engineering practice from a sequence of deliberately registered viewpoints. It retains the warmth and truthfulness of a laboratory field notebook, but the governing composition is no longer one continuous ledger: Overview, Selected Work, Capabilities, Journey, Proof, Résumés, and Contact are distinct observation fields connected by a visible camera path. Each chapter controls its own paper tint, camera pose, registration label, sparse observations, and active evidence panel. Visual seed `4293f8f6` remains the reproducibility anchor for this world.

The first viewport states Rahul's positioning and explicit actions on the left, localizes that claim through the spatial field on the right, and keeps the camera journey subordinate. Real projects, contributions, distinctions, dates, résumé files, and contact paths remain the primary material. Camera frustums, sparse points, pose paths, reconstruction marks, and uncertainty contours explain how the evidence is observed; they never upgrade an interest or academic foundation into unsupported professional robotics, SLAM, localization, mapping, or Gaussian-splatting delivery.

Build and Secure are semantic lenses over the same world. Build teal or Secure coral owns active state and emphasis, while optimization amber and reconstruction violet keep stable technical meanings. The assistant, Effects Lab, and Spatial World are opt-in depth layers opened from explicit inline hero launchers. Above 860px, the assistant and Effects Lab also remain persistently available from a reserved left instrument rail; below that breakpoint, the rail disappears and the inline launchers preserve access without covering the survey.

**Key Characteristics:**

- Seven registered camera stages connected by a fixed desktop rail or sticky horizontal responsive rail.
- Warm laboratory paper, chapter-specific tinted neutrals, dark green-black ink, and sparse technical signals.
- Archivo for claims and reading; IBM Plex Mono for frames, coordinates, counts, methods, dates, and state.
- One active work, capability, proof, or résumé view at a time, with the complete factual archive still searchable.
- CameraGlyph frustums, registration geometry, ruled selectors, and bounded observation panels instead of generic cards.
- Restrained one-shot registration motion that is completely removed under reduced-motion preference.

## Colors

The palette treats each chapter as a calibrated sheet in the same laboratory-paper family, then reserves stronger hues for semantic observations and active lens state.

### Primary

- **Signal Teal** (`signal-teal` and `signal-teal-deep`): Build-lens observations, active links, selected controls, focus treatments, and primary actions. The deep tone carries legible text and fills; the brighter tone carries landmarks and state markers.
- **Secure Coral** (`secure-coral` and `secure-coral-deep`): Secure-lens observations, responsible-disclosure emphasis, focus treatments, and primary actions. It replaces teal only where lens ownership is meaningful.

### Secondary

- **Optimization Amber** (`optimization-amber` and `optimization-amber-deep`): Contours, trajectories, and optimization annotations. It is supporting geometry, not a general action color.

### Tertiary

- **Reconstruction Violet** (`reconstruction-violet`): Camera frustums, sparse reconstruction marks, and spatial-computing cues. Keep it translucent or line-based so it does not compete with selected evidence.

### Neutral

- **Laboratory Paper** (`paper`), **Pressed Paper** (`paper-deep`), and **Raised Paper** (`paper-raised`): Base field, recessed utility regions, inputs, drawers, and localized sheets.
- **Work Mist** (`chapter-work`): The selected-work capture stage.
- **Calibration Lilac** (`chapter-domains`): The capabilities observatory.
- **Trajectory Parchment** (`chapter-experience`): The compact chronological journey.
- **Verification Blush** (`chapter-proof`): The evidence and achievement viewer.
- **Targeting Glass** (`chapter-resumes`): The role-specific résumé bay.
- **Field Ink** (`ink`) and **Soft Ink** (`ink-soft`): Claims, selected dark states, reading copy, paths, and footer ground.
- **Muted Annotation** (`muted`) and **Faint Coordinate** (`faint`): Supporting copy, counts, dates, and readouts.
- **Hairline Rule** (`rule`) and **Structural Rule** (`rule-strong`): Dividers, frames, selector boundaries, and registration geometry.

### Named Rules

**The Lens Is a Semantic Switch Rule.** Build teal and Secure coral may exchange accent ownership; amber and violet keep their technical meanings, and content priority changes without removing evidence.

**The Registered Field Rule.** Chapter tints distinguish viewpoints without turning the portfolio into disconnected themes; every tint remains a restrained neutral sheet under the same ink and rule system.

**The Paper, Not White, Rule.** Laboratory paper is the default field; pure white is reserved for text on deep filled actions.

## Typography

**Display Font:** Archivo (with Segoe UI and sans-serif fallback)  
**Body Font:** Archivo (with Segoe UI and sans-serif fallback)  
**Label/Mono Font:** IBM Plex Mono (with Consolas and monospace fallback)

**Character:** Archivo makes the portfolio candid, editorial, and technically assured without mimicking a control dashboard. IBM Plex Mono gives camera frames, pose labels, methods, counts, dates, and evidence state the voice of a calibrated instrument.

### Hierarchy

- **Display:** Tightly tracked, condensed-feeling Archivo for the first-view positioning claim; keep it near a 16-character measure on wide screens and reduce deliberately at narrow widths.
- **Headline:** Large Archivo for chapter openings and the footer proposition, balanced against a quieter explanatory paragraph and camera frame.
- **Title:** Compact Archivo for the active project, capability, proof item, résumé, and panel headings.
- **Body:** Regular Archivo with generous leading and a practical reading measure of roughly 44–60rem depending on the observation panel.
- **Label:** Small, often uppercase IBM Plex Mono for coordinates, camera counts, frames, methods, dates, tags, state, and diagram annotations.

### Named Rules

**The Two-Voice Rule.** Archivo makes claims and carries reading; IBM Plex Mono registers the evidence. Never set long explanatory paragraphs in mono.

## Layout

The shell is a sequence of seven observation fields: position → selected system → capabilities → journey → proof → targeted résumé → contact. The hero is capped at 82rem and pairs a left positioning-and-actions column with a right localization/spatial visual. Chapter frames are capped at 76rem and add a third heading column for a CameraGlyph and frame label on wide screens. Each major chapter has its own tinted neutral field, sparse observation points, uncertainty ellipses, a structural top rule, and enough stage depth to read as a registered viewpoint rather than another row in one page-long ledger.

Above 1100px, the camera journey is a fixed right-side rail with seven markers, a progress path, and an active frame readout when space permits. At 1100px and below it becomes a sticky horizontal rail beneath the header. At 640px and below, inactive markers collapse to glyphs while the active marker expands to expose its label, preserving orientation without consuming the viewport. The active chapter follows scrolling through intersection state, while every marker remains a real anchor link. Above 860px, the shell reserves a 4rem left instrument rail for the persistent AI and FX docks so optional controls never overlap hero copy, navigation, or the camera journey.

Selected Work uses a filter row, horizontal camera capture strip, one registered project panel, previous/next controls, and a searchable complete-archive drawer. Capabilities uses six camera markers and one active observation panel. Proof and Résumés use bounded selector rails with one active evidence or download surface. The Journey intentionally defaults to four compact ledger items and can expand after filtering or search. The Share Bench is a collapsed details surface until explicitly opened.

At 860px and below, the instrument rail is removed, chapter headings and active views become single-column, and vertical selectors turn into horizontally scrollable camera strips. Inline hero launchers remain available for both AI and FX. At 640px, the hero actions become a deliberate grid, active views stack, the four-item ledger moves dates above content, and section camera frames become compact inline registrations. At 380px, the hero actions stack and optional links simplify further. The 320px layout remains the minimum supported width with no horizontal overflow or content obstruction.

The background uses a quiet 32px graph-paper grid, tightening to 24px on mobile. Sticky navigation, visible focus outlines, thin but legible scrollbars, stable drawer gutters, semantic document order, and 2.75rem coarse-pointer targets are part of the layout contract.

### Named Rules

**The Registered View Rule.** Work, capability, proof, and résumé chapters show one active observation at a time; adjacent evidence belongs in an explicit selector, bounded archive, or search surface.

**The Journey Is Orientation Rule.** The camera rail explains position and progress. It stays visually subordinate to the hero claim and chapter evidence, never becoming game HUD chrome.

**The 320px Integrity Rule.** At the narrowest supported width, preserve the claim, active camera label, primary action, résumé path, assistant path, and optional-world links without overlap or horizontal scrolling.

## Elevation & Depth

The system is flat by default. Chapter tint, rule density, grid texture, clipped registration, and overlap carry most hierarchy. Shadows are reserved for the hero's spatial sheet, the scrolled header, the active desktop journey marker, compact instrument docks, and modal side panels. There is no resting shadow vocabulary for ordinary observation panels, selectors, ledgers, or archives.

### Shadow Vocabulary

- **Field Sheet:** A broad, low-contrast lift under the hero spatial/localization sheet.
- **Scrolled Header:** A shallow ambient shadow that appears only after the page moves.
- **Active Journey Marker:** A compact lift that identifies the current registered camera on the desktop rail.
- **Instrument Dock:** A restrained compact lift that separates the persistent AI and FX controls from the reserved desktop rail without turning them into floating spectacle.
- **Panel Edge:** Directional depth on assistant and Effects Lab drawers, paired with a translucent ink backdrop.

### Named Rules

**The Flat-by-Default Rule.** Resting evidence uses tint, rules, clipping, and registration geometry; elevation appears only for localization, sticky state, active journey position, or a modal layer.

## Shapes

The form language is rectilinear, instrument-like, and outside-looking-in. Buttons use only the small radius token; inputs, observation panels, selector rails, evidence cells, ledgers, and archives remain square. One-pixel hairlines define most boundaries. Chapter reveals use alternating transform and clip directions, so the registered sheet appears to settle from the camera side rather than fade generically.

CameraGlyph is the reusable geometric grammar: a shallow-radius camera body, circular lens, translucent triangular frustum, and dashed optical axes rotated around a stable lens origin. Full circles and ellipses are reserved for portraits, landmarks, uncertainty fields, timeline nodes, and scrollbar thumbs. Dashed outlines indicate axes, uncertainty, or experimental material rather than decoration.

### Named Rules

**The Camera Must Observe Rule.** A camera glyph or frustum must identify a viewpoint, active selector, stage, or spatial relationship; never use it as an ornamental tech icon.

**The Signal Geometry Rule.** Curves and circles describe a person, observation, trajectory, uncertainty, or state; the editorial container system stays predominantly square.

## Components

### Buttons

Buttons are compact, sturdy, and editorial rather than pill-like.

- **Shape:** A shallow corner using the small radius token, a one-pixel structural rule, and a minimum height of 2.9rem.
- **Primary:** The active lens's deep signal color with white text and strong Archivo weight.
- **Hover / Focus:** Lift by 2px over the fast motion token on hover; retain the global 3px mixed-signal focus outline with a 3px offset. Reduced motion removes transform feedback.
- **Secondary:** Translucent raised paper with ink text and a structural border.
- **Quiet:** Transparent and underlined; used for the assistant and other adjacent but important actions.

### Chips

- **Style:** Square, hairline filter controls with muted text; method and evidence tags are smaller mono labels with compact padding.
- **State:** Selected filters use the current lens wash, deep accent text, accent border, and `aria-pressed`; selection never depends on color alone.

### Cards / Containers

- **Corner Style:** Square by default; shallow rounding is limited to actionable controls and the camera body.
- **Background:** Chapter tint is the stage surface; raised paper is reserved for inputs, drawers, localized sheets, and translucent active panels.
- **Shadow Strategy:** Follow the Flat-by-Default Rule; ordinary evidence and active-view panels have no shadow.
- **Border:** One-pixel rules build selectors, observation bays, ledgers, evidence cells, and archives.
- **Internal Padding:** Compact evidence begins at 0.85rem; active panels and workbenches use roughly 1.25–2rem.

### Inputs / Fields

- **Style:** Raised-paper fill, square corners, structural one-pixel stroke, ink text, and a minimum height of 3rem.
- **Focus:** Use the global signal-colored focus-visible outline; do not replace it with a border-only change.
- **Error / Disabled:** Errors use Secure Coral with plain-language copy; disabled controls retain structure and reduce opacity without disappearing.

### Navigation

The header is a translucent laboratory-paper strip that becomes ruled and lightly elevated after scroll. Desktop links use compact semibold Archivo with a 2px current-lens underline. Below 860px the primary link row becomes an accessible expanding ledger. The separate camera journey rail owns chapter orientation and uses `aria-current="location"` for the active stage.

### Camera Journey and CameraGlyph

The journey renders seven real anchor links over a ruled progress path. The active marker uses the deep lens signal, Raised Paper, structural border, and an exposed label. CameraGlyph carries a rotated rig, body, lens, frustum, and dashed axes; its angle changes with the registered stage. The progress path and rig rotation use restrained 460–520ms calibrated easing and become static under reduced motion.

### Camera-Registered Selectors

Project, capability, proof, and résumé selectors pair CameraGlyph with a title and compact date, count, or recommendation label. Selected items use either Field Ink on Laboratory Paper or a current-lens wash, reinforced by `aria-selected`. Horizontal strips may scroll; vertical rails are bounded. Changing selection registers one active panel over roughly 420ms with a short transform, clip, opacity, and blur transition.

### Chapter Registration

Every chapter carries a camera frame label, sparse observation points, and restrained elliptical reconstruction geometry. SectionContainer alternates left- and right-origin transform/clip reveals according to the camera sequence. The reveal fires once, never gates content, and resolves immediately to its final state when IntersectionObserver is unavailable or reduced motion is requested.

### Spatial Field Diagram

The hero's localization-inspired SVG combines a graph-paper field, landmarks, a pose path, uncertainty ellipses, camera frustums, contours, sparse violet reconstruction marks, and short mono annotations. It is a visual bridge between perception, uncertainty, optimization, and deployment—not a claim of professional SLAM delivery. Desktop pointer drift is gentle; mobile crops the diagram into a static pre-heading strip; reduced motion removes transforms.

### Journey Ledger, Archives, and Share Bench

The chronological Journey shows four compact records by default, with filters, search, and an explicit expansion control. Selected Work preserves the full searchable archive behind a clearly labeled drawer. The Share Bench is collapsed by default and lazy-loads its QR utility only when opened. These disclosures reduce page length without hiding the factual record.

### Assistant, Effects Lab, and Spatial World

Inline hero actions remain the universal launch points for the assistant, Effects Lab, and Spatial World. On desktop, compact AI and FX docks are also maintained inside the reserved left instrument rail; their labels appear on hover or keyboard focus, and the initiating dock remains mounted while its drawer is open so focus returns correctly on close. At 860px and below, those docks are hidden and the inline launchers own access to prevent viewport obstruction. Assistant and Effects Lab open focus-managed directional drawers; the Three.js world remains lazy and opt-in. Loading, fallback, error, and disabled states must remain explicit, and no recruiter-critical fact may exist only inside an optional layer.

### Motion and Reduced Motion

Normal motion registers viewpoint changes: chapter reveals alternate by camera side, active panels settle from a short clipped offset, the journey progress path advances, and CameraGlyph rigs rotate to their stored pose. Under `prefers-reduced-motion: reduce`, chapter transform/clip/blur reveals, active-panel animations, drawer/backdrop animations, journey progress transitions, camera rotation transitions, spatial drift, and decorative effects are removed; only brief color, background, border, and outline feedback remains.

### Named Rules

**The Optional Worlds Rule.** Assistant, effects, and Three.js experiences may deepen the portfolio, but no recruiter-critical fact, proof, résumé, or contact action may exist only inside them.

## Do's and Don'ts

### Do:

- **Do** lead with the positioning claim, explicit actions, and real evidence before optional spectacle.
- **Do** preserve the seven-stage story: position → selected system → capabilities → journey → proof → targeted résumé → contact.
- **Do** use chapter tints, CameraGlyph poses, sparse observations, and frame labels to distinguish registered viewpoints.
- **Do** keep one active work, capability, proof, or résumé panel visible while preserving searchable archives and clearly labeled selectors.
- **Do** keep Journey concise at four default entries and keep Share Bench collapsed until requested.
- **Do** maintain the compact desktop AI and FX docks inside their reserved instrument rail, while retaining explicit inline launchers for every viewport.
- **Do** preserve visible focus, semantic headings and landmarks, active-label exposure on mobile, 2.75rem coarse-pointer targets, readable contrast, and meaningful alt text.
- **Do** remove registration, panel, camera, progress, spatial, and decorative motion under reduced-motion preference.

### Don't:

- **Don't** collapse the chapters back into one long ledger or an equal-weight wall of cards.
- **Don't** turn the camera journey into a dominant game HUD, sticky obstruction, or unlabeled row of mystery icons.
- **Don't** use chapter tints as unrelated themes; they are calibrated neutrals inside one paper-and-ink world.
- **Don't** turn robotics, localization, mapping, probabilistic reasoning, reconstruction, or Gaussian-splatting motifs into unsupported experience claims.
- **Don't** replace the world with generic AI gradients, neon cyber styling, SaaS chrome, stock robots, or copied reference-site imagery and shapes.
- **Don't** use IBM Plex Mono for long reading copy or let decorative numbering crowd essential mobile content.
- **Don't** let animation, pointer precision, optional tools, or heavy rendering block the default reading and action path.
