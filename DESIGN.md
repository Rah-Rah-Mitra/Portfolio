---
name: "Rahul Mitra Engineering Portfolio"
description: "A human-centered intelligent-systems field notebook refined into an editorial engineering dossier."
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
  utility-dock:
    backgroundColor: "rgba(251, 248, 241, 0.94)"
    textColor: "{colors.ink}"
    rounded: "0"
    padding: "0.6rem 0.8rem"
    height: "3rem"
---

# Design System: Rahul Mitra Engineering Portfolio

## Overview

**Creative North Star: "The Intelligent-Systems Field Notebook"**

The system feels like a human-centered robotics and intelligent-systems field notebook refined into a professional editorial dossier. Warm laboratory paper, precise ink rules, coordinates, pose paths, observation marks, uncertainty contours, and evidence ledgers make technical thinking visible without pretending that visual metaphors are delivered robotics experience.

The default Build lens uses signal teal to foreground systems, perception, and optimization evidence. The Secure lens swaps the signal color to restrained coral and reprioritizes responsible-security evidence without hiding the rest of the portfolio. Amber remains an optimization trace and violet remains a reconstruction/spatial motif in both lenses, so the world changes emphasis rather than becoming a different brand.

Recruiter-critical content is calm, linear, and available by default. The assistant, Effects Lab, and spatial portfolio world are optional depth layers; they may add explanation or delight, but the core story, proof, résumé paths, and contact route never depend on them.

**Key Characteristics:**

- Warm tinted paper and dark green-black ink rather than pure white and black.
- Archivo for assertive editorial hierarchy; IBM Plex Mono for coordinates, methods, labels, and evidence metadata.
- Thin rules, ledgers, and diagrams instead of interchangeable rounded card walls.
- Build teal and Secure coral as explicit content-lens signals, supported by amber and violet technical motifs.
- Restrained motion, progressive enhancement, and evidence-first reading at every viewport.

## Colors

The palette combines warm paper neutrals with dark botanical ink and sparse instrument-like signals.

### Primary

- **Signal Teal** (`signal-teal` and `signal-teal-deep`): Build-lens landmarks, active states, links, focus treatments, and primary actions. The deeper tone carries text and filled controls; the brighter tone carries observations and state markers.
- **Secure Coral** (`secure-coral` and `secure-coral-deep`): Secure-lens landmarks, active states, responsible-disclosure cues, and primary actions. It replaces teal only where the content lens has semantic ownership.

### Secondary

- **Optimization Amber** (`optimization-amber` and `optimization-amber-deep`): Contours, trajectories, and optimization-specific annotations. It is supporting evidence, not a general call-to-action color.

### Tertiary

- **Reconstruction Violet** (`reconstruction-violet`): Camera frustums, sparse reconstruction marks, and spatial-computing cues. Keep it translucent or line-based so it does not compete with the active lens.

### Neutral

- **Laboratory Paper** (`paper`): The default canvas and evidence-cell surface.
- **Pressed Paper** (`paper-deep`): Recessed transcript messages, tracks, and subtle surface separation.
- **Raised Paper** (`paper-raised`): Inputs, panels, and floated sheets.
- **Field Ink** (`ink`): Headlines, trajectories, footer ground, and selected lens controls.
- **Soft Ink** (`ink-soft`): Reading copy and secondary technical statements.
- **Muted Annotation** (`muted`) and **Faint Coordinate** (`faint`): Supporting copy, metadata, dates, and decorative numbering.
- **Hairline Rule** (`rule`) and **Structural Rule** (`rule-strong`): The system's principal separators and container boundaries.

### Named Rules

**The Lens Is a Semantic Switch Rule.** Build teal and Secure coral may exchange accent ownership; amber and violet keep their technical meanings, and content priority changes without removing evidence.

**The Paper, Not White, Rule.** Use laboratory paper as the default field; reserve pure white for high-contrast text on filled actions.

## Typography

**Display Font:** Archivo (with Segoe UI and sans-serif fallback)  
**Body Font:** Archivo (with Segoe UI and sans-serif fallback)  
**Label/Mono Font:** IBM Plex Mono (with Consolas and monospace fallback)

**Character:** Archivo's variable width supports compact, high-impact engineering headlines without turning the page into a poster. IBM Plex Mono supplies the field-instrument voice for coordinates, dates, method tags, state labels, and diagram annotations.

### Hierarchy

- **Display:** Tightly tracked, condensed-feeling, heavy Archivo for the first-view positioning claim; keep it to roughly 16 characters per line on wide screens and reduce deliberately at narrow widths.
- **Headline:** Large Archivo for section openings, paired with a quieter explanatory paragraph rather than an eyebrow label.
- **Title:** Compact Archivo for projects, proof, résumé entries, and panels; keep line-height close enough to form a single editorial unit.
- **Body:** Regular Archivo with generous leading and a practical reading measure of roughly 44–60rem depending on context.
- **Label:** Small, often uppercase IBM Plex Mono for coordinates, evidence types, lenses, tags, and status. Use letter spacing to preserve clarity at small sizes.

### Named Rules

**The Two-Voice Rule.** Archivo makes claims and carries reading; IBM Plex Mono indexes the evidence. Never set long explanatory paragraphs in mono.

## Layout

The desktop shell uses a wide navigation and hero field capped at 82rem, with long-form sections capped at 76rem. Section openings are editorial two-column compositions: a large heading occupies the left while context sits on the right. Case studies alternate text and imagery, while domains, experience, proof, and résumés use ledgers, rails, cells, and hairline divisions to make dense evidence scannable.

Spacing follows the eight-step quarter-rem scale in the frontmatter, with large section padding expressed responsively from 4.5rem to 8rem. The layout changes at the observed 1100px, 860px, 640px, and 380px breakpoints. Navigation collapses below 860px; content grids progressively become single-column; at 640px the spatial diagram becomes a compact pre-heading strip, the hero actions become a deliberate grid, ledger dates move above their entries, decorative proof numbering disappears, and floating assistant/FX docks are removed in favor of the always-visible inline hero actions. At 380px the hero actions stack and optional links form a two-column list. The 320px layout remains the minimum supported width with no horizontal overflow or obstructed content.

The page background uses a quiet 32px graph-paper grid, tightening to 24px on mobile. Sticky navigation, thin scrollbars, visible focus outlines, 2.75rem coarse-pointer targets, stable panel scrollbar gutters, and semantic document order are part of the layout contract. Expensive below-the-fold sections use `content-visibility: auto`, while hash navigation can force content visible; optional effects and the Three.js world remain progressive enhancements.

### Named Rules

**The Evidence Ledger Rule.** Prefer ruled rows, rails, and grouped evidence cells over equal-weight card grids when presenting technical history or proof.

**The 320px Integrity Rule.** At the narrowest supported width, preserve the claim, lens, primary action, résumé path, assistant path, and optional-world links without overlap or horizontal scrolling.

## Elevation & Depth

The system is flat by default. Paper tone, rules, grid texture, and overlap create most hierarchy; shadows are reserved for the localization sheet, sticky header state, floating desktop docks, and modal side panels. The principal sheet shadow is soft and broad (`0 18px 54px rgba(33, 43, 39, 0.11)`), while panels use directional shadows to communicate which edge they enter from. Backdrop blur belongs only to sticky or modal chrome.

### Shadow Vocabulary

- **Field Sheet:** A broad, low-contrast shadow under the hero's spatial/localization SVG.
- **Scrolled Header:** A shallow ambient shadow that appears only once the page has moved.
- **Utility Dock:** A compact lift that separates optional desktop tools from the paper field.
- **Panel Edge:** A directional shadow on assistant and Effects Lab drawers, paired with a translucent ink backdrop.

### Named Rules

**The Flat-by-Default Rule.** Resting content uses rules and paper tones; elevation appears only for a sheet, sticky state, floating utility, or modal layer.

## Shapes

The form language is rectilinear and instrument-like. Buttons use only the small radius token, most inputs and evidence containers stay square, and borders remain one-pixel hairlines. The medium radius is available for compact supporting controls, not large content shells. Full circles are reserved for the profile portrait, observation points, uncertainty markers, timeline nodes, and the scrollbar thumb. Dashed outlines indicate uncertainty, empty state, or experimental material rather than decoration.

**The Signal Geometry Rule.** Curves and circles must describe a person, observation, trajectory, uncertainty, or state; the editorial container system stays predominantly square.

## Components

### Buttons

Buttons are compact, sturdy, and editorial rather than pill-like.

- **Shape:** A shallow corner using the small radius token, a one-pixel structural rule, and a minimum height of 2.9rem.
- **Primary:** The active lens's deep signal color with white text and strong Archivo weight.
- **Hover / Focus:** Lift by 2px over 150ms on hover; retain the global 3px mixed-signal focus outline with a 3px offset. Reduced-motion mode removes transform-based feedback.
- **Secondary:** Translucent white paper over the base field with ink text.
- **Quiet:** Transparent with an underlined label; use for assistant and other adjacent-but-important actions.

### Chips

- **Style:** Square, hairline filter controls with muted text; method and evidence tags are smaller mono labels with compact padding.
- **State:** Selected filters use the current lens wash, deep accent text, and a deep accent border. Selection is also expressed by border, fill, and `aria-pressed`, never by color alone.

### Cards / Containers

- **Corner Style:** Square by default; shallow rounding is limited to actionable controls.
- **Background:** Base paper for evidence cells and raised paper for drawers, inputs, workbenches, and inset sheets.
- **Shadow Strategy:** Follow the Flat-by-Default Rule; ordinary case studies and ledgers have no shadow.
- **Border:** One-pixel rules build tables, ledgers, and field sheets. Dense evidence groups may use a one-pixel grid gap over a rule-colored ground.
- **Internal Padding:** Compact evidence begins at 0.85rem; major workbenches and method panels use 1.25–2rem.

### Inputs / Fields

- **Style:** Raised-paper fill, square corners, structural one-pixel stroke, ink text, and a minimum height of 3rem.
- **Focus:** Use the global signal-colored focus-visible outline; do not remove it in favor of a border-only change.
- **Error / Disabled:** Errors use Secure Coral with plain-language copy; disabled action controls retain structure and reduce opacity without disappearing.

### Navigation

The header is a translucent laboratory-paper strip that becomes ruled and lightly elevated after scroll. Desktop links use compact semibold Archivo with a 2px active underline in the current lens color. Below 860px the link row becomes an accessible expanding ledger; below 640px the lockup and lens labels shorten before any primary control is removed.

### Build / Secure Lens

The two-option lens switch is the system's explicit mode control. Its selected segment uses Field Ink on Laboratory Paper text, while the surrounding lens color rebinds active links, primary actions, diagram observations, and foregrounded evidence. The switch reprioritizes content; it never creates a misleading claim or makes core evidence inaccessible.

### Editorial Ledgers

Experience, proof, résumé, and case-study content use dated rows, small mono indices, rails, evidence cells, and restrained tags. Decorative numbering may disappear on mobile, but titles, dates, proof context, and actions remain in semantic reading order.

### Spatial Field Diagram

The signature localization-inspired SVG combines a graph-paper field, landmarks, a pose path, uncertainty ellipses, camera frustums, and short annotations. It is a visual bridge between perception, uncertainty, optimization, and deployment—not a claim of professional SLAM delivery. On desktop it may respond gently to pointer position over a 480ms ease; on mobile it becomes a static, cropped pre-heading strip, and under reduced motion it never transforms.

### Assistant, Effects Lab, and Spatial World

Desktop assistant and FX docks float at opposing bottom corners and open focus-managed side panels. The assistant transcript uses ruled, lens-washed messages with role labels and references; user messages switch to Pressed Paper. Docks are hidden on mobile because the hero retains explicit assistant, Effects Lab, and spatial-world actions. The assistant must expose loading, offline/fallback, error, and disabled states, and the spatial world must remain lazy or opt-in.

### Named Rules

**The Optional Worlds Rule.** Assistant, effects, and Three.js experiences may deepen the portfolio, but no recruiter-critical fact, proof, résumé, or contact action may exist only inside them.

## Do's and Don'ts

### Do:

- **Do** lead with a concrete engineering claim, real evidence, and an appropriate action before optional spectacle.
- **Do** use Build teal and Secure coral as semantic lens signals while keeping amber tied to optimization and violet tied to spatial/reconstruction motifs.
- **Do** use rules, ledgers, coordinates, and diagrams to make technical relationships easier to scan.
- **Do** preserve visible focus, semantic headings and landmarks, 2.75rem coarse-pointer targets, readable contrast, and meaningful alt text.
- **Do** respect reduced motion, keep optional effects off the critical path, lazy-load heavy worlds, and verify layouts at 1440, 1024, 768, 390, and 320 widths.
- **Do** keep the customized thin scrollbar legible against Pressed Paper and provide a stronger hover state.

### Don't:

- **Don't** turn robotics, localization, mapping, probabilistic reasoning, or reconstruction motifs into unsupported experience claims.
- **Don't** replace the warm paper-and-ink world with generic AI gradients, neon cyber styling, game HUD chrome, stock robots, or equal-weight rounded card walls.
- **Don't** use IBM Plex Mono for long reading copy or decorative numbering where it crowds essential mobile content.
- **Don't** make the Build/Secure distinction depend on color alone or hide evidence when a lens changes.
- **Don't** let animation, pointer precision, canvas rendering, the assistant, Effects Lab, or the spatial world block the default reading and action path.
