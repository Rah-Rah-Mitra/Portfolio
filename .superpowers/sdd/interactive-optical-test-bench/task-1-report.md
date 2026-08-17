# Task 1 foundation checkpoint report

## Outcome

Foundation checkpoint implemented on `codex/continuous-field-test`.

Foundation commit: `704af2f51dc982ed0d951f020bd8e54163d0ab5b` (`feat: establish optical test bench foundation`).

## Files changed

- `types.ts` — public experience-path, scene-control, interaction, world-anchor, camera-shot, quality-tier, and world-event types; added project-media provenance linkage.
- `interactionData.ts` — six-scene interaction contract, validation, and capability-derived semantic response mode.
- `vitest.config.ts` — separate Node pure-test and jsdom component-test projects.
- `tests/interaction-contract.test.ts` — contract, constrained fallback, and malformed fallback validation coverage.
- `tests/vitest-environment.dom.test.tsx` — jsdom component-test smoke coverage.
- `scripts/verify-local-mirror.mjs` and `tests/local-mirror-script.test.ts` — safe local-drive mirror verification workflow and destination guard coverage.
- `docs/portfolio/interaction-matrix.md` — all six scenes, controls, reset/replay, semantic fallback, targets, and planned coverage.
- `docs/portfolio/comfyui-local-setup.md` — local Claude/Codex `comfyui-local` configuration and read-only smoke verification.
- `docs/portfolio/local-drive-verification.md` — repeatable mirror verification instructions.
- `workflows/optical-courier/`, `workflows/mixamo/`, and `workflows/media/` — pending-state concept, prompt/seed/model/license, clip, and media provenance manifests.

## Strict TDD evidence

### Interaction contract

- RED: `npm test -- tests/interaction-contract.test.ts` in `C:\codex-verify\portfolio-foundation` failed with `Cannot find module '../interactionData'`.
- GREEN: the same command passed: 1 file, 3 tests.

### Component jsdom environment

- RED: `npm test -- tests/vitest-environment.dom.test.tsx` initially reported no matching test because `.tsx` was outside the Vitest include list. After the include was added, it reported `document is not defined` under the Node environment.
- GREEN: after configuring separate pure and jsdom Vitest projects, `npx vitest run tests/vitest-environment.dom.test.tsx --reporter=dot --pool=forks --maxWorkers=1` passed: 1 file, 1 test.

### Local mirror guard

- RED: `npm test -- tests/local-mirror-script.test.ts` failed with `Cannot find module '../scripts/verify-local-mirror.mjs'`.
- GREEN: the same command passed: 1 file, 1 test.

## Final verification

All commands ran from the local-drive mirror `C:\codex-verify\portfolio-foundation`:

```text
npm test -- --pool=forks --maxWorkers=1
Test Files  6 passed (6)
Tests  15 passed (15)

npm run typecheck
tsc --noEmit
exit 0

npm run build
vite build
✓ built in 2.81s
```

## Self-review

- `.claude/` remains untracked and untouched.
- No credentials, cookies, MCP configuration files, or model weights were added.
- New Optical Courier and Mixamo records explicitly use pending/not-generated state; they do not claim completed generation or downloads.
- Every interaction contract fallback points to a semantic in-page anchor; the constrained capability derivation selects semantic mode.
- Pure tests remain Node-based while `*.dom.test.tsx` component tests receive jsdom.
- Mirror safety rejects the source directory and its descendants before deleting/copying a destination.

## Concern

Vite completed successfully but emitted its existing chunk-size warning for a 625.64 kB minified `GLTFLoader` chunk. Resolving that belongs to later performance/lazy-loading work and was intentionally not expanded into this foundation checkpoint.
