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
  drawing set (10 draggable windows over a blueprint desk, crane-rig physics
  from `lib/rig.ts`). App registry/data adapters: `lib/workbench.ts` (ids
  reuse `lib/workstation.ts` so the AI assistant + `server/pageAgent.mjs`
  command contract stay valid). Window sections keep the legacy anchors
  (`#home #work #experience #all-work #technical-lab #world #domains #proof
  #resumes #contact`, `experience-<id>`, `project-<id>`) — the assistant and
  `tests/semantic-render.test.ts` depend on them.
- Mobile ≤880px: `components/workbench/FieldIndex.tsx` — one searchable
  registry with traverse/crane rigs. SSR renders both surfaces (CSS hides
  one); after hydration `App.tsx` prunes to the active one. Keep `App`
  render-pass free of `window` access — the build prerenders it.
- Retained layers: `AskThePage` (AI) and `EffectsLabPanel` (FX) plus their
  providers (`ExperienceModeProvider`, `EffectsProvider`). They reach the
  workbench via the `portfolio:workbench-open` CustomEvent
  (`dispatchWorkbenchOpen` in `lib/workbench.ts`).
- The pre-2026-09 "continuous field test" UI (`PortfolioExperience`,
  `WorkstationShell`, appearance system, nbody/fluid/ascii backgrounds) is
  **unmounted but still on disk** with its unit tests passing — pending
  deletion sweep. Don't remount it and don't build on it.

## Resume system (Harvard style, edition-based)

- `public/resume/generated/*` are **build artifacts — never hand-edit them.**
  Source of truth is `scripts/resume/content/*.json` (entry/bullet pools +
  per-role configs in `content/resumes/`). Styling lives in
  `scripts/resume/harvard_style.py` (Times New Roman, A4, Harvard OCS layout —
  all deliberate; change nothing there without explicit approval).
- Current edition: **2026-09**. `generated/` keeps the current + previous
  edition; older sets live in `public/resume/archive/`.
- Edition bump checklist:
  1. Edit content JSONs.
  2. `python scripts/resume/build_resumes.py --edition <YYYY-MM>`
  3. `powershell -File scripts/resume/export-pdf.ps1 -Edition <YYYY-MM>`
     (MS Word COM; `-UseLibreOffice` fallback shifts pagination — re-verify)
  4. `python scripts/resume/verify_resumes.py --edition <YYYY-MM>` must pass
     (page counts: `general` = 2 pages, all others = 1; contact links in DOCX
     rels and PDF annotations; content assertions).
  5. Visual QA: render PDFs to PNG (pdftoppm) into `.impeccable/resume-qa/`
     and inspect.
  6. `git mv` the now-oldest edition from `generated/` to `archive/`.
  7. Bump `resumeEdition` in `siteConfig.ts` **and** the hardcoded general-PDF
     path in `server/pageAgent.mjs` (an .mjs file — it cannot import the TS
     constant).
- Ordering policy (user-mandated): experience/education/leadership sort
  strictly reverse-chronologically by start date — never "relevance-first".
  Projects sort by most recent activity; ongoing entries first; the general
  CV's "Additional Projects" is pinned last (`sort: "0000-00"`).
- One-page fit trim ladder (in order): drop coursework bullet → reduce
  3-bullet entries to 2 → drop least-relevant project → body 10.5→10pt →
  margins toward 0.5". Never below 10pt. Fit truth = pypdf page count.

## Experience data (site)

Career history renders from `experienceRecords` in `portfolioData.ts` (shown
in the workbench Experience window and the mobile registry). Adding a role
requires THREE entries: a `kind: 'career'` FieldNote in
`careerAndEducationNotes`, a record in `experienceDetailById`, and a start
date in `experienceStartById`. `tests/portfolio-data.test.ts` asserts the
newest organization and ordering; `tests/semantic-render.test.ts` pins
`experienceRecords` length — update both.

## Gotchas

- vitest picks up ANY `tests/**/*.test.ts` on disk, tracked or not.
- `tests/project-showcase.dom.test.tsx` can flake under full-suite load
  (waitFor timeout); passes in isolation.
- `tests/e2e/quality.spec.ts` pins the workbench boot state (Home + Selected
  Work open), the 7/28 no-JS evidence counts, and zero serious axe violations
  on both surfaces.
- All public asset paths (`/images`, `/resume`, ...) must exist on disk under
  `public/` — no speculative references.
