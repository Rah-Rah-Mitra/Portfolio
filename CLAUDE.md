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
  drawing set (11 draggable windows over a blueprint desk, crane-rig physics
  from `lib/rig.ts`). App registry/data adapters: `lib/workbench.ts` (ids
  reuse `lib/workstation.ts` so the AI assistant + `server/pageAgent.mjs`
  command contract stay valid). Window sections keep the legacy anchors
  (`#home #work #experience #all-work #technical-lab #world #domains #proof
  #resumes #contact #resume-builder`, `experience-<id>`, `project-<id>`) — the assistant and
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
- Current edition: **2026-10**. `generated/` keeps the current + previous
  edition; older sets live in `public/resume/archive/`.
- Eight outputs: six role-targeted one-pagers, `highlights` (one-page best-of
  across all profiles; `bodyPt: 10` + `marginIn: 0.5`), and the two-page
  `general` master CV. Several one-pagers now carry `bodyPt: 10` to hold the
  denser Abbott bullets — each config declares its own; do not assume 10.5.
- Edition bump checklist:
  1. Edit content JSONs, then `npm run resume:lint`.
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
  8. Update the edition-stamped URLs in `public/llms.txt`, then `npm run
     snapshot` and commit `server/portfolio-snapshot.json`.
- Ordering policy (user-mandated): experience/education/leadership sort
  strictly reverse-chronologically by start date — never "relevance-first".
  Projects sort by most recent activity; ongoing entries first; the general
  CV's "Additional Projects" is pinned last (`sort: "0000-00"`).
- One-page fit trim ladder (in order): drop coursework bullet → reduce
  3-bullet entries to 2 → drop least-relevant project → body 10.5→10pt →
  margins toward 0.5" (per-config `marginIn`, inches). Never below 10pt. Fit
  truth = pypdf page count.

## Machine access (MCP + llms.txt)

- `api/mcp.mjs` is the public read-only MCP endpoint
  (`https://rahul-mitra.com/api/mcp`, stateless Streamable HTTP via
  `mcp-handler@2`, ten tools) and `api/portfolio.mjs` returns the same data as
  one JSON document. Both read `server/portfolioMcp.mjs`, which imports ONLY
  `server/portfolio-snapshot.json`, the resume content JSONs, and packages —
  never `portfolioData.ts`: Vercel compiles `api/` per file as native ESM with
  no bundling, so relative imports there must carry `.mjs`/`.json` and JSON
  imports need `with { type: 'json' }`.
- `server/portfolio-snapshot.json` is a committed build artifact of
  `lib/portfolioSnapshot.ts`. After changing data in `portfolioData.ts`,
  `lib/workbench.ts`, or `siteConfig.ts`, run `npm run snapshot` and commit —
  `tests/portfolio-mcp.test.ts` fails when it is stale. A new resume config
  also needs an import added to `resumeConfigs` in `server/resumeContent.mjs`.
- **Résumé builder.** `api/resume.mjs` renders a résumé on demand from a spec in
  the URL (`?spec=<base64url deflated JSON>&format=pdf|docx|md`, POST for long
  specs) — stateless, no storage. `server/resumeRender.mjs` is a JS port of
  `harvard_style.py` using pdfkit's Standard-14 Times fonts; its layout
  constants were calibrated from the Word output (line advance 1.152x size,
  baseline 0.93x, Word takes the MAX of adjacent paragraph spacing). It measures
  before drawing, so page counts are exact. Auto-fit walks the typography ladder
  only and never drops selected content. **The eight canonical résumés stay
  Word-built** — this renderer serves custom builds. Shared content lives in
  `server/resumeContent.mjs`; a new résumé config needs an import added there.
  MCP tools `get_resume_guide`, `list_resume_blocks` and `build_resume` expose
  it; agents may only select ids, never supply bullet text
  (`server/resumeGuide.mjs` is the single source of those instructions). The
  same surface is the `resume-builder` window
  (`components/workbench/ResumeBuilder.tsx`), which loads blocks after mount and
  previews the real PDF in an iframe. Bullets carry optional `deep`/`short`
  variants beside `default` and the per-slug overrides; the Python builder
  ignores any key that is not a slug, so they cost the canonical eight nothing.
  Deep detail generally needs a 2-page budget. What the repo cannot support is
  listed in `docs/resume-detail-gaps.md` — do not claim any of it.
- **Alternative phrasings.** A bullet may carry `phrasings`, a sibling map of
  wordings Rahul has approved for the same fact (`{ text, note, basis? }`). A spec
  selects one per bullet with a flat `phrasings: { "waaah.main": "landmarks-first" }`
  map keyed on the same ref findings report against. They live OUTSIDE `text` on
  purpose: `build_resumes.py` reads only `text.get(slug, text["default"])`, so a
  sibling key is invisible to Word by construction, and adding one changes no
  shipped document (`tests/resume-documents.test.ts` pins that). A key named after
  a résumé slug silently would, which is why they are not stored in `text`.
  `attestPhrasing` in `resumeCheck.mjs` gates them at commit time: tokens must be
  attested in that bullet's own approved text, metrics and product-numbers must
  match exactly, it must fit at every point of the legal typography grid (not just
  the four-rung ladder), it must earn its place, and its lead verb must hold the
  same ownership rank from `content/ownership.json` (keyed on `leadLemma` OUTPUT,
  which produces stems like `automat` and `pursu`). The guard cannot catch
  recombination, modality or implicature: it is a filter in front of review, not a
  substitute for it. `basis: "deep"` measures a phrasing against the deep wording
  instead, which is how a bullet carries a tighter form of its own long variant.
- **Résumé checker.** `server/resumeCheck.mjs` is a deterministic, rule-based
  linter. It **imports nothing** — a test enforces that, because
  `resumeRender.mjs` pulls in pdfkit (12 MB) and `ResumeBuilder.tsx` loads résumé
  modules in the browser. Text in, findings out; callers supply line counts from
  `measureBulletLines` in the renderer. Two lanes: `checkResume` runs inside
  `build_resume` and the `check_resume` tool and reports only what an agent
  selecting block ids can act on; `checkPool` runs via `npm run resume:lint` and
  reports what only a prose edit can fix (lead-verb concentration by section,
  sentence-frame concentration, tense vs an entry's own dates, deep-variant
  coverage). No score and no verdict, only counts; the gate is structural
  (`errors === 0`). Thresholds are calibrated on the real corpus and the numbers
  each rule fires today are pinned in `tests/resume-check.test.ts` — a content
  edit that moves them fails there rather than changing the report silently.
  `R7 unused-evidence` (a note) names a bullet on a selected entry that mentions
  more of the attested skills-line technologies than the one chosen; the term list
  is passed in from `skills.json` so the checker still imports nothing, and both
  sides are reported because the thinner bullet often carries the measurement.
  `list_resume_blocks` carries `lead`, `lines` and `hasMetric` per bullet, and the
  same three on each alternative wording, so an agent can spread verbs and
  evidence while choosing. Where an alternative would clear a finding the remedy
  is `kind: "rephrase"` naming it; that is what makes a repeat answerable at all,
  since most entries carry a single bullet and there is nothing to swap to.
  `scripts/resume/extract_facets.py` is an optional offline LangExtract
  authoring aid: it writes to gitignored `.impeccable/resume-facets/`, nothing
  it produces is served, and it may only annotate existing bullets.
- `public/llms.txt` is hand-maintained and edition-stamped (checklist step 8).
- `npm run dev` 404s `/api/mcp` and `/api/portfolio` (`server.mjs` routes only
  `POST /api/page-agent`). `npm test` drives the real handlers; after deploy:
  `npx @modelcontextprotocol/inspector --cli https://rahul-mitra.com/api/mcp --transport http --method tools/list`.

## Experience data (site)

Career history renders from `experienceRecords` in `portfolioData.ts` (shown
in the workbench Experience window and the mobile registry). Adding a role
requires THREE entries: a `kind: 'career'` FieldNote in
`careerAndEducationNotes`, a record in `experienceDetailById`, and a start
date in `experienceStartById`. `tests/portfolio-data.test.ts` asserts the
newest organization and ordering; `tests/semantic-render.test.ts` pins
`experienceRecords` length — update both, then `npm run snapshot`.

## Gotchas

- vitest picks up ANY `tests/**/*.test.ts` on disk, tracked or not.
- `tests/project-showcase.dom.test.tsx` can flake under full-suite load
  (waitFor timeout); passes in isolation.
- `tests/e2e/quality.spec.ts` pins the workbench boot state (Home + Selected
  Work open), the 7/28 no-JS evidence counts, and zero serious axe violations
  on both surfaces.
- All public asset paths (`/images`, `/resume`, ...) must exist on disk under
  `public/` — no speculative references.
