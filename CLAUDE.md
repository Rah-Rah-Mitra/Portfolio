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
- **Mechanism bench** (`components/workbench/MechanismBench.tsx`, inside the
  Systems Lab window — no new app id, no new anchor). Six live mechanisms drawn
  from a planar projective geometric algebra: `lib/pga.ts` (core), `lib/pgaDraw.ts`
  (blueprint kit), `lib/pgaMechanisms.ts` (the six). Ported from the 83-asset
  library in `design/mockups/pga*.js`; `tests/pga-port.test.ts` replays each one
  against its original and compares every canvas call, so the port cannot drift.
  Three host rules the file exists to keep: canvas work happens only in an effect
  (`kit()` reads `devicePixelRatio`, and `App.tsx` is prerendered), canvases are
  found by DOM scan rather than refs (the workbench re-renders every window on
  open/close, which detaches refs and blanked all six), and the kit's caption
  colour is `--color-neutral-700`, not the mockup's `--color-neutral-500` — axe
  cannot see into a canvas, so that would have broken the contrast rule while
  passing CI. Mechanisms are authored in a fixed 320×230 frame and only ever
  scale **down**; upscaling goes soft because the backing store caps at 2×.
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

- `api/mcp.mjs` is the public MCP endpoint — open read/build tools plus a
  bearer-gated job-search surface (`https://rahul-mitra.com/api/mcp`, stateless
  Streamable HTTP via `mcp-handler@2`, seventeen tools) and
  `api/portfolio.mjs` returns the same data as
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
  (`server/resumeGuide.mjs` is the single source of those instructions). Section
  `title` and `subject` are **closed enums** in `specSchema`, not free strings —
  a heading prints full width on the page and `subject` is the PDF/DOCX document
  title, `build_resume` is open and `api/resume.mjs` is unauthenticated, so both
  were a text channel onto a document served under Rahul's name. The enums are
  exactly what the eight canonical résumés use (`general` alone may say "PROJECTS
  AND COMPETITIONS"), so a spec from `get_resume` still round-trips. The
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
- **Job search.** `server/jobSearch.mjs` holds the whole surface: seven tools
  registered beside `registerPortfolioTools` in `api/mcp.mjs`, which needed a
  zero-line diff to `portfolioMcp.mjs`. Storage is Upstash Redis over its REST
  API driven by plain `fetch` (no npm dependency, and never send the
  `Upstash-Encoding` header — the SDK's base64 default would silently encode
  every value), reading `UPSTASH_REDIS_REST_URL/_TOKEN` with
  `KV_REST_API_URL/_TOKEN` as fallback, both through lazy getters so vitest can
  stub them. Two keys and no index: `job:prefs` (a JSON string) and
  `job:applications` (a HASH, field = id). **The id IS the dedup hash** —
  `sha256(norm(company) \0 norm(role) \0 jd_hash).slice(0,16)` — so `HSETNX`
  makes create idempotent with no lock, no lookup and no check-then-set race,
  and a repeat returns the existing row untouched rather than merging (an agent
  re-evaluating a job sends the default `Evaluated`, and merging would reset a
  live `Applied` row) — so moving a row is create-then-`update_application`, never
  a second create. `jd_hash` comes from the NORMALIZED `jd_url` when there is one
  and from the text only otherwise: posting text is edited and re-scraped between
  runs, which grew a second row for a job already tracked, while the URL is the
  identity the board itself uses. The tracker `#` is a render-time ordinal. Five stateful
  tools require `PORTFOLIO_JOB_TOKEN` (≥24 chars or they stay off), checked per
  call off `ctx.http.req` rather than with `withMcpAuth`, which would 401 the
  whole endpoint on a stale credential and advertise a `.well-known` document
  nothing here serves. `export_profile` and `build_tailored_resume` stay open:
  they return only data already published. `export_profile` reads the gated
  preferences opportunistically — an anonymous caller gets `DEFAULT_PREFERENCES`,
  never the stored ones, since `exclusions` can name an employer — and says which
  in `preferences_source`, so a sync whose Authorization header never arrived is
  distinguishable from a real one rather than silently writing the defaults over
  a good `profile.yml`. `gaps` names what the repo cannot attest and a consumer
  must preserve locally across a sync; `work_authorization` is the one gap
  `set_job_preferences` can fill, keyed as career-ops' own `location.*` keys so
  filling it removes exactly those entries. `proof_points` are the spotlight
  projects — same withholding as the digest — not `snapshot.profile.stats`, two of
  which are site counters and all four of which shared one `#proof` anchor.
- **`blocked` withholds a card, never a fact.** The flag in `projects.json` is a
  curation flag: its reasons scope to "off résumés", two of them (weakest in the
  pool; the site is already in the contact line) cannot be about secrecy, and every
  enforcement site is a résumé emitter. It withholds a Projects-section ENTRY —
  nothing anywhere blocks a string. `article_digest_md` and `proof_points` honour
  the same list because they are a selected-evidence surface too; the full
  28-project catalogue stays open on `list_projects`, `get_project` and
  `/api/portfolio`, so withholding costs prominence, not availability. **Where a
  blocked project's work is also attested as employment, that bullet ships
  deliberately** — `flowshop` was blocked precisely because the same work is
  `abbott-intern.digital-twin`, which seven of the eight canonical résumés select
  (`docs/resume-detail-gaps.md` §9: "the stronger placement"). An integration read
  the resulting cv_md/digest gap as a contradiction; it is not, and the fix is
  never to delete the bullet. That section also says: do not "helpfully" restore a
  blocked project — ask Rahul first.
  Two hard invariants — this server
  **never dereferences `jd_url`**, and job-description text never reaches a
  spec, a document or storage; only its 16-hex digest and a match against
  Rahul's own attested vocabulary travel back. That vocabulary is
  `snapshot.resumes[].keywords` plus `skillTerms` (exported from
  `portfolioMcp.mjs`, derived from `skills.json`): the keyword rows alone are 41
  entries across the six candidate résumés, which labelled a card rather than
  matching a posting. `matchSlug` scores each résumé on the terms its own
  rendered document carries, and `build_tailored_resume` returns a `coverage`
  report — `covered`/`missing` — drawn from that same closed alphabet, so a term
  the posting used and Rahul has never claimed cannot come back out. Two
  non-obvious guards hold that honest, and both cost a real bug to find: the four
  RL algorithm names are excluded (`UNBACKED` in `jobSearch.mjs`) because
  `docs/resume-detail-gaps.md` §1 backs them with a certification alone and no
  bullet anywhere mentions RL — left in, an RL posting came back "covered: DDPG,
  A2C · missing: none"; and the two halves are deduped **case-insensitively**,
  because a card saying "Full-Stack" beside a skills line saying "full-stack"
  scored one posting word twice and tipped close races. `skillTerms` treats
  parentheses as separators, not wrappers — splitting on `[,;]` first tore every
  comma-bearing parenthetical into fragments like `DQN)` and `deep RL (PPO` that
  could never match. A new MCP tool touches three
  places: the tool, `TOOLS` in `tests/portfolio-mcp.test.ts`, and
  `public/llms.txt` — two tests pin that.
- **Never provision a scratch Upstash database for this repo.** The vendored
  `.agents/skills/upstash-redis-js/SKILL.md` tells an agent with no credentials
  that it may mint a throwaway Redis over `POST upstash.com/start-redis`. Do not:
  the job-search tools keep ALL their state in `job:prefs` and `job:applications`,
  so a scratch database would silently take the application tracker with it when
  its 3-day TTL expired, with no error at write time. The real database is a
  Vercel Marketplace resource; when the env vars are missing the tools correctly
  say so, and that is the answer rather than a reason to create one.
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
- `tests/project-showcase.dom.test.tsx` used to flake under full-suite load
  (waitFor timeout) while passing in isolation. Fixed by raising that file's
  async budget (`configure({ asyncUtilTimeout })`), not by weakening an
  assertion — the carousel reveals cards via IntersectionObserver + rAF, so the
  default 1s was a race. If you add DOM test files, re-run the full suite a few
  times: load is what tips this class of test over.
- `tests/e2e/quality.spec.ts` pins the workbench boot state (Home + Selected
  Work open), the 7/28 no-JS evidence counts, and zero serious axe violations
  on both surfaces.
- All public asset paths (`/images`, `/resume`, ...) must exist on disk under
  `public/` — no speculative references.
