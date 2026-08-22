# Dark Optical Desktop Progress

Last updated: 2026-08-18 21:57 SGT

## Handoff state

- Repository: `Rah-Rah-Mitra/Portfolio`
- Base: `main` at `e2e23d162e0d28665c5b6238845daccbc2cb5fb4`
- Branch: `codex/dark-optical-desktop`
- Worktree: `C:\codex-worktrees\portfolio-dark-optical`
- Current checkpoint: 8 complete — Impeccable confirmation and preview delivery
- Current pushed commit: `b8422a9` — implementation plus design-review documentation (this ledger closeout follows as a documentation-only commit)
- Preview: `https://portfolio-git-codex-dark-0dd29b-rahul-mitras-projects-21145dc9.vercel.app/`
- Next action: user review of the preview. Production promotion remains a separate, explicit approval.

## Accepted decisions

- Dark is the first-visit, Quick Scan, and no-JavaScript default; Light and System persist.
- Default capable background is the N-body Field; Fluid is the second background.
- N-body is a TypeScript Worker port of the referenced 2D logarithmic FMM.
- Desktop right-click is custom only over the actual wallpaper field.
- Window chrome uses rounded Mac-inspired controls with focused-titlebar glass.
- Preferences exposes appearance, desktop, window, accessibility, and Engineer controls.
- Production promotion requires a separate user approval.

## Checkpoints

- [x] 1. Specification, plan, progress ledger, attribution
- [x] 2. Appearance state and dark-first tokens
- [x] 3. Preferences and Mac-style workstation chrome
- [x] 4. FMM mathematics and Worker contract
- [x] 5. N-body background and controls
- [x] 6. Fluid migration and GPU arbitration
- [x] 7. Responsive/accessibility/performance hardening
- [x] 8. Impeccable finish review and Vercel preview

## Verification ledger

| Commit | Command | Result |
| --- | --- | --- |
| baseline `e2e23d1` | `npm test` | 39 files, 223 tests passed |
| checkpoint 1 `0610e5a` | `git diff --cached --check` | passed; four documentation/notice files committed |
| checkpoint 2 pending commit | `npm test` | 41 files, 228 tests passed |
| checkpoint 2 pending commit | `npm run typecheck` | passed |
| checkpoint 2 pending commit | `npm run build` | passed; semantic prerender completed |
| checkpoint 3 pending commit | `npm test` | 42 files, 233 tests passed |
| checkpoint 3 pending commit | `npm run typecheck` | passed |
| checkpoint 3 pending commit | `npm run build` | passed; semantic prerender completed |
| checkpoint 4 pending commit | `npm test` | 44 files, 241 tests passed |
| checkpoint 4 pending commit | `npm run typecheck` | passed |
| checkpoint 4 pending commit | `npm run build` | passed; FMM remains unreferenced until the lazy background checkpoint |
| checkpoint 5 pending commit | `npm test` | 46 files, 251 tests passed |
| checkpoint 5 pending commit | `npm run typecheck` | passed |
| checkpoint 5 pending commit | `npm run build` | passed; Worker 13.85KB minified, controller + N-body 2.69KB gzip |
| checkpoint 6 pending commit | `npm test` | 47 files, 254 tests passed |
| checkpoint 6 pending commit | `npm run typecheck` | passed |
| checkpoint 6 pending commit | `npm run build` | passed; Fluid remains a separate 4.00KB gzip selected-theme chunk |
| checkpoint 7 `28665e9` | `npm test` | 47 files, 256 tests passed |
| checkpoint 7 `28665e9` | `npm run typecheck` | passed |
| checkpoint 7 `28665e9` | `npm run build` | passed; semantic prerender completed |
| checkpoint 7 `28665e9` | `npm run test:e2e` | 46 browser/axe tests passed after focused RED/GREEN fixes |
| checkpoint 7 `28665e9` | `npm run media:check && npm run media:provenance && npm run courier:validate` | passed; 1.56MB shipped media, truthful Courier provenance |
| checkpoint 7 `28665e9` | 10-second Chromium N-body diagnostic | zero main-thread long tasks; LCP 308ms; CLS 0.0148; 2,048-body effective tier retained |
| checkpoint 7 `28665e9` | Dark/Light Guided + Quick Scan visual matrix | 20 captures inspected at 1440, 1024, 768, 390, and 320px |
| checkpoint 8 `b8422a9` | Impeccable confirmation | no blocking design, responsive, contrast, motion, or information-hierarchy findings remain |
| Vercel preview for `b8422a9` | signed-in live verification | Dark default and 2,048-body N-body enhancement passed; Light applied/restored; Quick Scan showed 28 projects and 5 experience records with zero background canvas/controller |

## Performance budgets

- Initial JavaScript/CSS: ≤250KB gzip
- Lazy workstation/world: ≤350KB gzip
- Lazy background + Worker: ≤80KB gzip
- Balanced N-body main-thread long task: none >50ms over 10 seconds
- LCP ≤2.5s, CLS ≤0.1, INP ≤200ms

## Known blockers and exclusions

- No current blocker.
- Never stage `.claude/`.
- Never stage the separate Courier-production files from the original checkout.
- The source FMM uses a 2D logarithmic kernel; public copy must not call it a 3D inverse-square solver.
- Main-thread Canvas2D fallback intentionally caps the automatic effective tier at 768 bodies; Preferences reports that tier and offers a manual retry.
- The generic Vite warning for the pre-existing raw Three.js chunk remains; its gzip size is within the separate lazy-world budget and Quick Scan never requests it.

## Continuation prompt

Review the Vercel preview at `https://portfolio-git-codex-dark-0dd29b-rahul-mitras-projects-21145dc9.vercel.app/`. If changes are requested, continue in `C:\codex-worktrees\portfolio-dark-optical` on `codex/dark-optical-desktop`; read the specification, implementation plan, and this ledger, then confirm `git status` before editing. Preserve `.claude/` and the separate Courier experiment. Do not promote production without explicit approval.
