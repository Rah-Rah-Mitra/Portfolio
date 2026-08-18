# Dark Optical Desktop Progress

Last updated: 2026-08-18 21:01 SGT

## Handoff state

- Repository: `Rah-Rah-Mitra/Portfolio`
- Base: `main` at `e2e23d162e0d28665c5b6238845daccbc2cb5fb4`
- Branch: `codex/dark-optical-desktop`
- Worktree: `C:\codex-worktrees\portfolio-dark-optical`
- Current checkpoint: 1 — specification and progress ledger
- Last completed commit: none on feature branch
- Next action: commit checkpoint 1, then start appearance-state tests in RED.

## Accepted decisions

- Dark is the first-visit, Quick Scan, and no-JavaScript default; Light and System persist.
- Default capable background is the N-body Field; Fluid is the second background.
- N-body is a TypeScript Worker port of the referenced 2D logarithmic FMM.
- Desktop right-click is custom only over the actual wallpaper field.
- Window chrome uses rounded Mac-inspired controls with focused-titlebar glass.
- Preferences exposes appearance, desktop, window, accessibility, and Engineer controls.
- Production promotion requires a separate user approval.

## Checkpoints

- [ ] 1. Specification, plan, progress ledger, attribution
- [ ] 2. Appearance state and dark-first tokens
- [ ] 3. Preferences and Mac-style workstation chrome
- [ ] 4. FMM mathematics and Worker contract
- [ ] 5. N-body background and controls
- [ ] 6. Fluid migration and GPU arbitration
- [ ] 7. Responsive/accessibility/performance hardening
- [ ] 8. Impeccable finish review and Vercel preview

## Verification ledger

| Commit | Command | Result |
| --- | --- | --- |
| baseline `e2e23d1` | `npm test` | 39 files, 223 tests passed |

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

## Continuation prompt

Continue the Dark Optical Desktop implementation in `C:\codex-worktrees\portfolio-dark-optical` on `codex/dark-optical-desktop`. Read `docs/superpowers/specs/2026-08-18-dark-optical-desktop-design.md`, `docs/superpowers/plans/2026-08-18-dark-optical-desktop.md`, and this progress file. Confirm `git status`, then resume the exact Next action above with test-first development. Preserve `.claude/` and the separate Courier experiment. Update this file after every verified checkpoint and commit regularly.
