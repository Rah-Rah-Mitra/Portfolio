# Handoff: finish the résumé work on a machine with MS Word

Paste this whole file as the first message of a new chat, run from a local clone
of `Rah-Rah-Mitra/Portfolio` on Windows with Microsoft Word installed. It lives in
the repo so it can be pulled there; delete it once the rebuild is done, the way
`resume-detail-gaps.md` entries are deleted once answered.

---

## Why this needs a local machine

Everything that can be done without Word is already done and merged to `main`
(HEAD `7e5e55a`, working tree clean, 398 tests green, `npm run typecheck` clean,
`npm run resume:lint` exit 0).

What remains needs `scripts/resume/export-pdf.ps1`, which drives Word over COM.
The `-UseLibreOffice` fallback shifts pagination and CLAUDE.md says to re-verify
if you use it. Prefer real Word.

**Read first:** `CLAUDE.md`, `.agents/skills/resume-editing/SKILL.md`,
`docs/resume-detail-gaps.md` (especially §1, §11, §12).

---

## What already exists, so you do not rebuild it

- `server/resumeCheck.mjs` — deterministic résumé checker. Imports nothing (a
  test enforces it). Two lanes: `checkResume` behind the `check_resume` MCP tool
  and folded into `build_resume`; `checkPool` behind `npm run resume:lint`.
  Reports counts and a `summary` string, never a score.
- **Alternative phrasings.** A bullet may carry a sibling `phrasings` map of
  wordings approved for the same fact. A spec picks one with
  `"phrasings": { "waaah.main": "landmarks-first" }`. Eleven exist.
- `attestPhrasing` — the commit-time guard over every phrasing (attested tokens,
  identical metrics and product numbers, fits at all 30 legal typography
  settings, earns its place, same ownership rank from
  `scripts/resume/content/ownership.json`).
- `tests/resume-documents.test.ts` — pins the shipped documents to the pool.
- `scripts/resume/extract_facets.py` — optional offline LangExtract authoring
  aid. Gitignored output, nothing it produces is served.

**Nothing added so far changes the eight shipped documents.** That is deliberate
and pinned by a test.

---

## The pending work

### 0. Decide whether you want a rebuild at all

The new blocks are already usable **right now** through the MCP builder and
`/api/resume` with no rebuild. A rebuild is only needed to put them into the
eight canonical PDFs at `public/resume/generated/`. If you do not want that yet,
stop after step 1 and nothing else is required.

### 1. Review the eleven phrasings (Rahul only, no code)

```
npm run resume:lint -- --phrasings
```

Prints each alternative beside the sentence it replaces, with the file to edit.
Edit the `text` string in place in the content JSON. `npm test` re-runs the full
guard over whatever you write.

Three to look at first, because they are judgement calls a guard cannot make:

- `arcane.main@tooling-first` opens **"Shipped"**. Chosen because the tools are
  named and released; it carries a release claim nobody verified.
- `abbott-contract.platform@stack-first` opens **"Assembled"**. "Architect" was
  avoided as overclaiming against the role title "Operational AI Systems & Data
  Engineer"; "Assembled" may undersell it.
- `ethoslens.main@evidence-first` opens **"Designed"** where the default says
  "Built". Check that is the right ownership word.

### 2. Answer three open questions

- **`voltpulse.main` says "Built" in its default and "Co-built" in its `deep`.**
  `leadLemma` strips a leading `co-`, so the checker has never reported the
  disagreement and cannot. One is wrong. Recorded in
  `docs/resume-detail-gaps.md` §11.
- **Reinforcement learning.** `ai-skills-rl` now carries
  "deep RL (PPO, A2C, DDPG, DQN)" under a **Technical** label. That is the claim
  `gen-ai` has always made, but §1 of the gaps doc still stands: the only
  evidence in this repo is a Packt certification, and a Technical line sits
  beside applied skills so it reads as applied experience. If there is real RL
  work, add it as a bullet with the facts; if not, consider leaving it on the
  certifications line only.
- **Volt Pulse's "Top 8 of 50+ teams"** is attested on the entry title but not in
  the bullet, so no phrasing may add it (the guard's G2 requires identical
  metrics, correctly — adding a fact is a new bullet, not a rewording). If you
  want that metric on the page, it needs a new bullet.

### 3. Choose which résumés adopt the new blocks

Five bullets and two skills lines exist that **no canonical résumé selects**:

| block | what it is |
|---|---|
| `cv-skills` (Technical) | the CS4277 3D-vision syllabus, moved out of the education section |
| `ai-skills-rl` (Technical) | `ai-skills` plus deep RL (PPO, A2C, DDPG, DQN) |
| `nus.coursework-full` | Simulation, Stochastic Processes, Statistics for Engineering Applications, Operations Research, AI, Computer Graphics, 3D CV, Software Engineering, DSA |
| `abbott-contract.datalayer`, `abbott-contract.harness`, `abbott-contract.hardening`, `ywh.network` | pre-existing, never selected |

Suggested starting point, yours to change: `cv-skills` on `ai-engineer`;
`ai-skills-rl` replacing `ai-skills` on `ai-engineer`; `nus.coursework-full`
replacing `coursework` on `general` and `operations-research-engineer`.

**`coursework` and `coursework-full` must never both be selected on one entry** —
they are alternative lists under the same heading and would print two "Relevant
coursework:" rows. `R6 duplicate-label-line` errors if you try, so
`npm run resume:lint` will catch it.

Edit `scripts/resume/content/resumes/<slug>.json` to make the swap.

### 3b. Abbott: the digital twin is under-selected

`npm run resume:lint` now reports this under `R7 unused-evidence`, and it is the
one selection problem Rahul spotted by eye:

- `abbott-intern.pipeline` is on **five** of the eight; `abbott-intern.digital-twin`
  on **four**. `software-engineer`, `cyber-security` and `highlights` take the
  pipeline and never the twin.
- The twin names four attested technologies (SimPy, OR-Tools, CP-SAT, hybrid
  flow-shop scheduling); the pipeline names none, though it does carry the
  measured outcome (15 stages, five years, zero execution failures). That is a
  real trade, not a strict improvement.
- The optimisation depth (heuristic, MIP and genetic-algorithm comparison, robust
  optimization) sits only in the `operations-research-engineer` slug override and
  the `deep` variant, so the other résumés never show it. A new phrasing,
  `abbott-intern.digital-twin@methods-first`, now carries it and is selectable
  from any custom build.

Decide per résumé whether to add `digital-twin` alongside `pipeline`, swap them,
or promote the `methods-first` wording into `text.default` so every résumé that
selects the twin gets the optimisation methods. All three are config or content
edits and all three need the rebuild.

**`Gurobi` may not be added.** `docs/resume-detail-gaps.md` §5 lists it under
"still absent from every content source, and therefore still unusable". MIP,
genetic algorithms and CP-SAT are all attested; Gurobi is not. If Rahul used it,
add the fact to the pools first.

The same rule flags `pa.infra` (Terraform, Redis, Kafka) as unused on five
résumés, which matches what `resumeGuide.mjs` has always said about that bullet.

### 4. Optionally promote a phrasing into `text.default`

A canonical config **must not** select a phrasing — a test forbids it, because a
config selecting one changes `word/document.xml` and reopens the rebuild anyway.
The right way to adopt a winning phrasing into the eight is to promote its text
into `text.default` and delete the phrasing entry.

### 5. The rebuild

Bumping the edition (recommended) rather than rebuilding `2026-09` in place:
the 2026-09 PDFs are already published at those URLs, and rebuilding in place
changes what anyone holding a link receives, silently.

```powershell
npm run resume:lint                                              # 1. expect exit 0
python scripts/resume/build_resumes.py --edition 2026-10         # 2. DOCX
powershell -File scripts/resume/export-pdf.ps1 -Edition 2026-10  # 3. PDF, Word COM
python scripts/resume/verify_resumes.py --edition 2026-10        # 4. must exit 0
```

Then:

5. **Visual QA.** Render each PDF to PNG (`pdftoppm`, 130 dpi) into
   `.impeccable/resume-qa/` and *look at every page*: dates flush right at one x,
   no orphaned entry headers, page counts 1 for every one-pager including
   `highlights`, 2 for `general`.
6. `git mv` the now-oldest edition (`2026-08`) from `generated/` to `archive/`.
7. Bump `resumeEdition` in `siteConfig.ts` **and** the hardcoded general-PDF path
   in `server/pageAgent.mjs` (an `.mjs` file; it cannot import the TS constant).
8. Update the edition-stamped URLs in `public/llms.txt`.
9. `npm run snapshot` and commit `server/portfolio-snapshot.json`.

**On step 9:** the snapshot is built from `siteConfig`, `portfolioData.ts` and
`lib/workbench.ts`, never from the résumé pools — so it is needed here only
because step 7 changes `siteConfig`. A résumé-pool edit on its own does not need
it.

### 6. Update the pinned digests, deliberately

`tests/resume-documents.test.ts` pins a digest per résumé of the exact words Word
would render. Any content change in step 3 or 4 moves them, and that is correct —
but only update them **in the same commit as the rebuild**. A moved digest with
unchanged files in `public/resume/generated/` means those files no longer say
what the repo says.

`tests/resume-check.test.ts` also pins the per-résumé finding digest and the pool
counts (currently 42 selectable bullets). Those move too; update them the same
way, and read the new numbers rather than pasting whatever the failure prints.

---

## Invariants that must not break

- `server/resumeCheck.mjs` imports nothing. It is reachable from the browser and
  from a Vercel function, and `resumeRender.mjs` pulls in 12 MB of pdfkit.
- Agents select ids and may never supply bullet text. `specSchema` takes phrasing
  **ids**, never prose.
- Every claim must already be attested in the repo. New facts go in the content
  JSONs first and get recorded in `docs/resume-detail-gaps.md`.
- Never invent a number to raise the quantified count.
- No em dashes in anything reaching a document or an API response.
- Experience outranks wording: never drop a bullet, a role, or a measurement to
  clear a style finding.

## Verification baseline before you start

`npm test` → 398 passing. `npm run typecheck` → clean.
`npm run resume:lint` → exit 0, corpus warning total **34** (notes are separate;
`unused-evidence` fires on six of the eight):

```
software-engineer              0e 5w 1n   15 bullets, "Build/Built" x7,  27% measured, 10pt/0.7in
solution-architect             0e 4w 1n   15 bullets, "Build/Built" x6,  14% measured, 10pt/0.7in
ai-engineer                    0e 2w 2n   14 bullets, "Build/Built" x6,  15% measured, 10.5pt/0.7in
operations-research-engineer   0e 2w 2n   14 bullets, "Build/Built" x5,  38% measured, 10pt/0.7in
cyber-security                 0e 2w 1n   14 bullets, "Build/Built" x4,  36% measured, 10pt/0.7in
civic-tech-solution-architect  0e 4w 2n   15 bullets, "Build/Built" x6,  14% measured, 10.5pt/0.7in
highlights                     0e 3w 1n   13 bullets, "Build/Built" x5,  31% measured, 10pt/0.5in
general                        0e 8w 1n   31 bullets, "Build/Built" x11, 31% measured, 10pt/0.7in
```

Those warnings are the repeated openers in the *shipped* text. They fall only
when a phrasing is promoted into `text.default`, not when one is merely
available — the lint reports what is actually in the PDFs, on purpose.

## Not built, if you want it

`scripts/resume/propose_phrasings.mjs` — an offline drafting aid that would
propose candidate phrasings, run the guard, and write a worksheet with
`approve: false` per entry plus a `--promote` step. Designed but never built,
because eleven phrasings were drafted by hand instead. Worth building only if you
want a second wave of a dozen or more.
