# CLAUDE.md — Portfolio repo guide for AI agents

React 19 + TypeScript + Vite portfolio site for Rahul Mitra, with an in-repo
resume generation pipeline. `npm run dev:vite` (port 5173, see
`.claude/launch.json`), `npm run typecheck`, `npm test` (vitest),
`npm run test:e2e` (Playwright).

Before any resume change, read `.agents/skills/resume-editing/SKILL.md`.

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

Career history renders from `experienceRecords` in `portfolioData.ts`. Adding
a role requires THREE entries: a `kind: 'career'` FieldNote in
`careerAndEducationNotes`, a record in `experienceDetailById`, and a start
date in `experienceStartById`. `tests/portfolio-data.test.ts` asserts the
newest organization and ordering; `tests/semantic-render.test.ts` pins
`experienceRecords` length — update both.

## Gotchas

- vitest picks up ANY `tests/**/*.test.ts` on disk, tracked or not.
- `tests/project-showcase.dom.test.tsx` can flake under full-suite load
  (waitFor timeout); passes in isolation.
- The hero "Current proof" strip in `components/PortfolioExperience.tsx` is
  hardcoded and pinned by `tests/e2e/quality.spec.ts`.
- All public asset paths (`/images`, `/resume`, ...) must exist on disk under
  `public/` — no speculative references.
