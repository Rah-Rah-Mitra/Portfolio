---
name: "Rahul Mitra Engineering Portfolio"
description: "A continuous field test where real engineering evidence leads and spatial guidance stays supportive."
colors:
  field-paper: "#ffffff"
  field-soft: "#f5f8f7"
  field-ink: "#111816"
  field-muted: "#53605d"
  field-rule: "#d9e0de"
  field-rule-strong: "#aebbb8"
  field-teal: "#0b7169"
  field-teal-dark: "#07544f"
  field-amber: "#95590e"
  field-violet: "#6650a4"
  focus-amber: "#df9f2f"
typography:
  display:
    fontFamily: "Archivo, Arial, sans-serif"
    fontSize: "clamp(3.7rem, 7vw, 6rem)"
    fontWeight: 760
    lineHeight: 0.9
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Archivo, Arial, sans-serif"
    fontSize: "clamp(2.35rem, 4.6vw, 4.7rem)"
    fontWeight: 720
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Archivo, Arial, sans-serif"
    fontSize: "clamp(1.25rem, 2vw, 1.72rem)"
    fontWeight: 690
    lineHeight: 1.18
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Archivo, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label:
    fontFamily: "'IBM Plex Mono', monospace"
    fontSize: "0.68rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.065em"
rounded:
  square: "0"
components:
  action-primary:
    backgroundColor: "{colors.field-ink}"
    textColor: "{colors.field-paper}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "0.8rem 1.05rem"
    height: "3rem"
  action-primary-hover:
    backgroundColor: "{colors.field-teal-dark}"
    textColor: "{colors.field-paper}"
    rounded: "{rounded.square}"
  action-secondary:
    backgroundColor: "{colors.field-paper}"
    textColor: "{colors.field-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "0.8rem 1.05rem"
    height: "3rem"
  action-text:
    backgroundColor: "transparent"
    textColor: "{colors.field-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "0.8rem 0.25rem"
    height: "2.5rem"
  filter-chip:
    backgroundColor: "{colors.field-paper}"
    textColor: "{colors.field-muted}"
    rounded: "{rounded.square}"
    padding: "0.55rem 0.72rem"
    height: "2.5rem"
  filter-chip-active:
    backgroundColor: "{colors.field-teal-dark}"
    textColor: "{colors.field-paper}"
    rounded: "{rounded.square}"
    padding: "0.55rem 0.72rem"
    height: "2.5rem"
  search-field:
    backgroundColor: "{colors.field-paper}"
    textColor: "{colors.field-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "0.65rem 0.8rem"
    height: "2.8rem"
  lab-tab-active:
    backgroundColor: "{colors.field-teal-dark}"
    textColor: "{colors.field-paper}"
    rounded: "{rounded.square}"
    padding: "0.55rem 0.72rem"
    height: "4rem"
  desktop-tool-dock:
    backgroundColor: "{colors.field-paper}"
    textColor: "{colors.field-ink}"
    rounded: "{rounded.square}"
    height: "3.25rem"
    width: "3.25rem"
---

# Design System: Rahul Mitra Engineering Portfolio

## Overview

**Creative North Star: "Continuous Field Test"**

The portfolio is a clean white laboratory record of an engineer making intelligent systems operational. It reads as one continuous field test under visual seed `4d83e73b`: Rahul's positioning, experience, selected systems, complete project archive, technical study, capabilities, proof, résumés, and contact path remain stationary, explicit, and easy to inspect. Near-black type and fine rules establish authority; restrained teal marks navigation, methods, state, and verification.

The graphite-and-teal field engineer is a supporting guide, not the subject. On wide screens it occupies a sticky calibration stage beside the evidence and advances gently with the reader's scroll. On constrained devices it becomes a static poster after the first-view facts, so mobile always presents Rahul's claim and actions first. Sparse amber and violet belong to focus, survey stations, reconstruction, and other technical annotations; they do not become decorative themes or unsupported experience claims.

The interface has one evidence model and no Build/Secure lenses. The assistant and Effects Lab are optional shipped depth layers: fixed AI and FX controls are desktop-only, while mobile exposes AI, FX, and Explore World inside the header menu. Explore World is ordinary navigation to the shared optical-test-bench anchor; that combined enhancement is pending and no separate world modal ships today. Motion or heavy rendering may frame the reading path, but never owns it, gates it, or carries recruiter-critical information.

Quick Scan is the canonical light, static-first route. It renders the same recruiter evidence in ordinary semantic HTML, omits heavy guide and video layers, and keeps Explore World as navigation to the shared future anchor rather than implying a second experience.

**Key Characteristics:**

- White laboratory field with near-black editorial typography and hairline ledger rules.
- Real experience, projects, outcomes, proof, and résumé links dominate every section.
- A persistent desktop evidence-and-guide split that collapses to an evidence-first mobile column.
- Archivo for claims and reading; IBM Plex Mono for methods, dates, counts, readouts, and state.
- Square controls and ruled rows instead of floating cards, pills, or dashboard chrome.
- Optional AI and FX tools remain clearly labeled, accessible, and subordinate; the pending optical test bench remains an honest semantic anchor.

## Colors

The palette is almost entirely paper, graphite, and cool rules; teal communicates useful signal, while amber and violet appear only as sparse technical annotations.

### Primary

- **Signal Teal** (`field-teal`): Marks the portfolio signature, project indices, progress, paths, and technical landmarks.
- **Deep Signal Teal** (`field-teal-dark`): Carries selected filters and tabs, link emphasis, method text, hover states, and high-contrast status copy.

### Secondary

- **Survey Amber** (`field-amber`): Reserved for calibration stations and technical callouts rather than general actions.
- **Focus Amber** (`focus-amber`): The universal three-pixel keyboard focus outline; its distinct hue keeps focus visible against both white and teal.

### Tertiary

- **Reconstruction Violet** (`field-violet`): Reserved for sparse reconstruction, pose, and perception annotations. It stays line-based or localized.

### Neutral

- **Laboratory White** (`field-paper`): The page, controls, reading surfaces, and resting panels.
- **Calibration Wash** (`field-soft`): Technical-lab consoles and faint measurement fields.
- **Graphite Ink** (`field-ink`): Headlines, primary actions, structural top rules, and the strongest evidence text.
- **Muted Graphite** (`field-muted`): Supporting copy, dates, metadata, readouts, and explanatory labels.
- **Hairline Rule** (`field-rule`): Row boundaries, interior divisions, and low-priority frames.
- **Structural Rule** (`field-rule-strong`): Sticky boundaries, section openings, inputs, active work frames, and modal edges.

### Named Rules

**The Evidence Owns the Page Rule.** White and graphite carry the page; color supports navigation, state, technical meaning, and focus.

**The Sparse Signal Rule.** Teal is restrained and amber or violet is rarer still. Never use any signal color as a large atmospheric wash or decorative gradient.

**The One Evidence Model Rule.** Do not reintroduce Build/Secure palettes, switches, or content lenses. Security evidence lives in the same hierarchy as every other discipline.

## Typography

**Display Font:** Archivo (with Arial and sans-serif fallback)

**Body Font:** Archivo (with Arial and sans-serif fallback)
**Label/Mono Font:** IBM Plex Mono (with monospace fallback)

**Character:** Archivo is dense, candid, and editorial enough to lead with direct claims while remaining highly readable through a long evidence archive. IBM Plex Mono gives methods, dates, metrics, filters, and field readouts the precision of an instrument without turning the interface into a HUD.

### Hierarchy

- **Display** (760, `clamp(3.7rem, 7vw, 6rem)`, 0.9): The first-view positioning claim, held to roughly 13 characters per line on wide screens.
- **Headline** (720, `clamp(2.35rem, 4.6vw, 4.7rem)`, 0.98): Major section openings and the contact proposition.
- **Title** (690, `clamp(1.25rem, 2vw, 1.72rem)`, 1.18): Project, experience, capability, proof, and résumé titles.
- **Body** (400, `1rem`, 1.65): Explanations and evidence copy, usually constrained by the 48rem reading target or a narrower ledger column.
- **Label** (500, `0.68rem`, 0.065em tracking): Uppercase or compact metadata for domains, dates, methods, counts, states, and lab readouts.

### Named Rules

**The Two-Voice Rule.** Archivo makes claims and carries the evidence; IBM Plex Mono measures and labels it. Never set long narrative paragraphs in mono.

**The Claim Before Metadata Rule.** Large Archivo establishes what matters before small mono explains when, how, or where it was measured.

## Layout

The desktop shell is capped at 92rem and divides into a maximum 59rem evidence column plus a 19–27rem guide stage, separated by a responsive 2–5rem gap. The header remains sticky at 4.75rem high. The first evidence view fills the available viewport beneath it and gives at least sixty percent of the composition to positioning, current proof, and explicit actions. The continuous document order is position → selected work → experience → all projects → technical lab → capabilities → proof → résumés → contact.

Sections are separated by structural top rules and generous vertical intervals of roughly 5–9rem. Headings use a wide claim/narrow context split. Selected systems use index, evidence, and optional media columns; experience and the complete project archive use conventional ledgers; proof uses a two-column ruled matrix; résumés use a four-column row. The All Projects controls become sticky below the header on wide screens, while the full archive remains visible, searchable, keyboard-steppable, and filterable.

At 1180px the evidence layouts tighten. At 920px the right guide disappears, the shell becomes a single column capped at 50rem, navigation moves into an expanding header menu, and a static field-engineer image follows the mobile hero evidence. At 680px actions stack, headings and ledgers become one column, lab tabs become a horizontally scrolling strip, metrics stack, project controls stop sticking, and proof collapses to one column. The 320px layout remains the minimum supported width without horizontal overflow. Fixed AI and FX docks disappear at 860px; mobile and tablet access remains in the header menu.

### Named Rules

**The Continuous Evidence Rule.** Preserve the complete reading order and visible project archive; progressive interaction may filter or navigate evidence but must not hide the factual baseline.

**The Guide Yields Rule.** The guide may own a dedicated desktop column, but it disappears before it can compress evidence below a comfortable reading width.

**The 320px Integrity Rule.** At the narrowest supported width, preserve the positioning claim, selected-work action, résumé path, optional-tool access, and every evidence record without overlap or horizontal scrolling.

## Elevation & Depth

The core portfolio has no resting shadows. Depth comes from white-on-white spacing, one-pixel rules, sticky positioning, the guide's grayscale/multiply treatment, and the contrast between the main paper and the soft technical-lab field. The sticky header separates itself with a structural rule and a translucent white backdrop blur rather than a drop shadow. Fixed AI and FX docks are explicitly shadowless.

### Shadow Vocabulary

- **Modal Drawer** (`0 2rem 6rem rgb(20 35 31 / 18%)`): Directional separation for the assistant and Effects Lab panels above their backdrop.
- **Tool Label** (`0 8px 24px rgba(23, 38, 36, 0.10)`): A small desktop-only lift for the label revealed above an AI or FX dock.

### Named Rules

**The Flat Evidence Rule.** Project, experience, capability, proof, résumé, filter, and laboratory surfaces stay flat at rest; use rules and spacing before elevation.

**The Modal Exception Rule.** Shadow is reserved for temporary layers that must separate from the reading surface, never for making ordinary content look clickable.

## Shapes

The form language is rectilinear and instrument-like. Buttons, inputs, chips, tab strips, evidence media, lab consoles, guide stages, docks, and drawers use square corners. One-pixel rules establish structure; repeated horizontal lines create the archive rhythm. The only prominent non-rectilinear shapes come from the field engineer, camera trajectories, pose paths, survey markers, and the small rotated square checkpoint in the guide stage.

**The Ruled Ledger Rule.** Group evidence with shared top and bottom rules instead of rounding each record into an isolated card.

**The Geometry Must Measure Rule.** Lines, diamonds, trajectories, points, and reconstruction marks must communicate a guide position, technical layer, measurement, or state—not generic technological decoration.

## Components

### Buttons

- **Shape:** Square, one-pixel bordered, and at least 3rem high for hero actions; compact utility controls remain at least 2.4–2.9rem high.
- **Primary:** Graphite fill with Laboratory White text and `0.8rem 1.05rem` padding. Hover changes the fill to Deep Signal Teal without lifting the reading surface.
- **Secondary:** White fill with Graphite Ink and the same structural weight as the primary action.
- **Text:** Transparent, underlined, and lightly padded for the tertiary reading route.
- **Hover / Focus:** Links and light actions move to Deep Signal Teal. Every keyboard-focusable control receives the three-pixel Focus Amber outline with a three-pixel offset.

### Chips

- **Style:** Small square filters with white fill, a one-pixel hairline border, compact Archivo text, and `0.55rem 0.72rem` padding.
- **State:** The selected chip uses Deep Signal Teal with white text and `aria-pressed`; selection never depends on color alone.

### Cards / Containers

- **Corner Style:** Square throughout.
- **Background:** Laboratory White for reading and Calibration Wash only for technical measurement fields.
- **Shadow Strategy:** Follow the Flat Evidence Rule.
- **Border:** Shared one-pixel rules create continuous ledgers, matrices, and consoles.
- **Internal Padding:** Dense archive rows begin around 1.6rem vertically; primary evidence records expand to roughly 2–3.6rem.

### Inputs / Fields

- **Style:** White, square, and 2.8rem high with a Structural Rule border and Archivo input text; the label is compact uppercase mono.
- **Focus:** The global three-pixel Focus Amber outline appears outside the control.
- **Disabled:** Retain the frame, reduce opacity, and keep the state legible in text and cursor treatment.

### Navigation

The sticky header uses a translucent white strip, a Structural Rule bottom edge, a compact RM mark, centered desktop links, and a square Explore World anchor. Link hover and focus reveal a two-pixel teal underline over 160ms. At 920px the links move into a full-width expanding menu; AI · Ask, FX · Lab, and Explore World remain three explicit routes, with Explore World linking to the pending shared test-bench boundary.

### Selected Work and Evidence Ledgers

Selected systems lead with a teal number and mono domain/date column, then a title, context, Contribution/Approach/Outcome definition list, method trail, and proof links. Optional imagery occupies a framed field-evidence column with a low-saturation treatment and technical caption. Experience, All Projects, capabilities, proof, and résumés reuse the same ruled-ledger logic at different densities rather than becoming interchangeable cards.

### Technical Lab

The synthetic calibration study is a bounded console with a four-column tab strip, one 16:9 visual layer, a method/provenance caption, four ruled metrics, and two-column explanatory provenance. The active tab uses Deep Signal Teal and white; inactive tabs remain white. Its warm amber disclaimer explicitly identifies the study as an interactive portfolio experiment, not professional project delivery.

### Field Engineer Guide

On wide screens, the guide is sticky within a ruled, faintly gridded stage. A compact mono readout names the active chapter, a progress line advances in teal, and the graphite-and-teal Three.js guide follows a damped course through survey stations. Reduced motion, constrained hardware, data-saving mode, or viewport width at or below 860px switches the WebGL scene to a static poster. At 920px the entire side stage yields to the single evidence column.

### Optional Tool Docks and Panels

AI and FX are square 3.25rem fixed controls in the lower-right desktop corner. They are shadowless at rest and reveal a small label on hover or focus. At mobile sizes the fixed pair is hidden and the header menu owns AI, FX, and Explore World access. Explore World is a normal link to `#world`, not a modal control. Assistant and Effects Lab drawers are white, square, left-entering modal panels with a translucent graphite backdrop and directional shadow. No essential evidence or action may exist only inside these tools.

### Motion and Reduced Motion

Motion is limited to the 160ms navigation underline, the 280ms guide progress response, damped guide travel, and temporary panel/backdrop entry. Reading surfaces do not animate while the visitor scans them. Under `prefers-reduced-motion: reduce`, transitions and animations collapse to 0.01ms, iteration is limited to one, scrolling becomes immediate, the field guide uses its static poster, and optional visual effects are removed.

### Named Rules

**The Optional Tools Rule.** Assistant, effects, and spatial experiences may deepen the portfolio, but no recruiter-critical fact, proof, résumé, or contact action may exist only inside them.

**The Motion Never Competes Rule.** Motion may explain progress or temporary state; it must never loop around, move, blur, or delay reading content.

## Do's and Don'ts

### Do:

- **Do** lead with Rahul's positioning, explicit actions, current evidence, and real work.
- **Do** preserve the continuous story: position → selected work → experience → all projects → technical lab → capabilities → proof → résumés → contact.
- **Do** use white space, one-pixel rules, and typographic hierarchy to organize dense evidence.
- **Do** keep teal restrained and reserve amber and violet for focus or technical annotation.
- **Do** keep the field engineer in a supporting desktop guide role and use the static evidence-first fallback on constrained devices.
- **Do** expose AI, FX, and the Explore World anchor in the mobile header menu while keeping fixed AI and FX controls desktop-only.
- **Do** preserve visible focus, semantic landmarks, keyboard-operable filters and tabs, truthful disclaimers, and the complete project archive.
- **Do** make reduced motion a static, fully readable version of the same experience.

### Don't:

- **Don't** reintroduce Build/Secure lenses, lens-specific palettes, or lens-dependent evidence.
- **Don't** convert the portfolio into warm notebook paper, tinted chapter themes, a camera-rail journey, or a wall of rounded cards.
- **Don't** let the guide, generated media, optional tools, or Three.js occupy the evidence hierarchy.
- **Don't** imply professional robotics, SLAM, localization, mapping, or Gaussian-splatting delivery from the technical motifs or synthetic study.
- **Don't** use generic AI gradients, neon or glitch styling, game HUD chrome, stock robots, or meaningless equations.
- **Don't** set long reading copy in IBM Plex Mono or use low-contrast microtype for essential information.
- **Don't** let motion, pointer precision, WebGL, or optional panels gate reading, résumé access, proof, or contact.
