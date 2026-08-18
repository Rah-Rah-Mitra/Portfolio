# Dark Optical Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a dark-first Mac-inspired workstation with persistent Preferences and two optimized desktop backgrounds, led by a real 2D FMM N-body simulation.

**Architecture:** A validated appearance provider owns color and desktop preferences. A lazy background controller selects a Worker-backed Canvas2D FMM renderer or the existing WebGL fluid renderer and applies one shared activity policy. Existing workstation state remains authoritative for windows and gains close and clean titlebar behavior.

**Tech Stack:** React 19, TypeScript, Vite, Web Workers, typed arrays, Canvas2D/OffscreenCanvas, WebGL2, Vitest, Playwright, axe.

**Spec:** `docs/superpowers/specs/2026-08-18-dark-optical-desktop-design.md`

## Global constraints

- Work from `main` on `codex/dark-optical-desktop`.
- Preserve semantic evidence, Quick Scan, no-JavaScript output, and current public project facts.
- Never commit `.claude/` or the separate Courier-production experiment.
- Use test-first implementation for every behavior change.
- Dark is the no-JavaScript and first-visit default.
- Describe the solver as a 2D logarithmic gravitational FMM.
- Keep the existing initial and lazy bundle budgets and publish preview only.

---

### Task 1: Durable specification and progress handoff

- [x] Write the approved design and execution plan.
- [x] Create the progress ledger and third-party notice.
- [ ] Commit the documentation checkpoint.

### Task 2: Appearance state and dark-first tokens

- [ ] Write failing tests for validation, defaults, System resolution, persistence, and pre-paint attributes.
- [ ] Implement appearance types, reducer/provider, boot script, meta synchronization, and tokenized dark/light/accent palettes.
- [ ] Verify focused tests, full unit tests, typecheck, and semantic build; update progress and commit.

### Task 3: Preferences and Mac-style workstation chrome

- [ ] Write failing reducer/DOM tests for close, maximize restore, Preferences, menus, context-menu boundaries, focus restoration, and mobile sheets.
- [ ] Implement the utility window, View/titlebar menus, desktop menu, rounded dock/windows, traffic-light controls, and keyboard behavior.
- [ ] Verify focused tests and browser interaction; update progress and commit.

### Task 4: FMM mathematics and Worker contract

- [ ] Write failing numerical fixtures for direct force, far-field error, deterministic initialization, stability, operation scaling, and Worker messages.
- [ ] Implement the typed-array quadtree, series passes, softened near field, leapfrog stepper, presets, metrics, and Worker protocol.
- [ ] Verify numerical gates and Worker lifecycle; update progress and commit.

### Task 5: N-body background and Preferences controls

- [ ] Write failing component/policy tests for lazy loading, pause/reset, custom ranges, effective tier, pointer input, and fallback rendering.
- [ ] Implement the background controller, Worker/Canvas bridge, trails, presets, Engineer View, dynamic downgrade, and activity policy.
- [ ] Verify focused tests and a ten-second performance trace; update progress and commit.

### Task 6: Fluid migration and GPU arbitration

- [ ] Write failing tests for Fluid preference ownership, FX handoff, exclusive GPU lease, frozen frames, and teardown.
- [ ] Move Fluid controls into Preferences, route FX to the Desktop tab, and enforce background/world ownership.
- [ ] Verify renderer teardown, Quick Scan import exclusion, and media policy; update progress and commit.

### Task 7: Responsive, accessibility, and performance hardening

- [ ] Add Playwright/axe coverage for dark/light, mobile, forced colors, reduced motion/transparency, Save-Data, no-JavaScript, context menus, and recruiter evidence.
- [ ] Fix all detected responsive, contrast, focus, overflow, lifecycle, and budget defects in one bounded pass.
- [ ] Run the complete unit/type/build/browser/provenance matrix; update progress and commit.

### Task 8: Finish review and preview

- [ ] Run one Impeccable visual defect pass at 1440, 1024, 768, 390, and 320px in Guided and Quick Scan.
- [ ] Apply the blocking fixes in one batch and run one confirmation pass.
- [ ] Record final budgets and recruiter-scan evidence, commit, push, and verify the Vercel preview without promoting production.
