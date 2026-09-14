---
name: resume-editing
description: Use for ANY change to Rahul's resumes/CVs — adding roles, editing bullets, regenerating editions, restyling, or fixing resume links on the site. Covers the NUS-CDE-style DOCX/PDF pipeline in scripts/resume, the content JSONs, edition bumps, verification, and the site wiring (siteConfig resumeEdition, pageAgent, resume cards).
version: 1.0.0
---

# Resume editing

All resumes are generated from in-repo content in the **NUS CDE style**
(`scripts/resume/nus_style.py`, default since edition 2026-11; Harvard is still
selectable with `--style harvard`). Eight outputs: 6 one-page role resumes, the
1-page `highlights` best-of, and the 2-page `general` master CV. Every config
declares its own `bodyPt` — 8.5 to 10 in this edition — and `marginIn: 0.5`.
Read each config rather than assuming a size.

## Hard bans

- **Never hand-edit `public/resume/generated/*`** — regenerate from content.
- **Never change the font or the style of an existing résumé on your own.**
  Each style owns its own: `nus` is Arial, `harvard` is Times New Roman, both
  universally available. Adding a style, or switching which one is the default,
  needs explicit user approval — this one got it in Sep 2026, when Rahul made
  his NUS-CDE master CV the ground truth.
- **Never mutate old DOCX files with string replacement** (the pre-2026-09
  approach — its scripts were deleted). Edit the content JSONs instead.
- **Never reorder by "relevance".** Experience/education/leadership sort by
  **end date first**: entries still running come first, ordered by `start`
  descending, then ended entries by `end` descending. An entry is still running
  exactly when it carries no `end` key. Projects sort by most recent activity,
  ongoing first. (Revised 2026-09, replacing a strict `start` sort: under that
  rule People's Association, which ran to Sep 2026, fell below the Abbott
  internship, which ended in June, and that reads as a gap. `entry_order` in
  build_resumes.py and `entryOrder` in server/resumeAssemble.mjs are the same
  rule twice and must agree.)
- **Never invent facts** — new bullets only rephrase what the user supplied.

## Layout invariants

Shared by both styles: A4; one contact line (5 items, 5 live hyperlinks
including `tel:` — must stay on ONE line); 1–3 bullets per entry and 4 where the
material earns it (People's Association on the two architecture résumés — buy
the room by dropping a project, not by cutting a bullet), action verb first,
past tense except current roles; literal "• " bullets with a hanging indent
(ATS-safe, deliberate, and the one place both styles depart from their source).

`nus_style.py` (default): Arial; 0.5" sides, 0.667" top and bottom; a
right-aligned 19.5pt caps name over an 8.5pt right-aligned contact line joined
by NBSP pipes; 9.5pt caps section headers under a full-width
`thinThickSmallGap` rule; one bold line per entry with right-flush dates —
`Role, Organization` in experience and projects, `Organization, Role` in
leadership (the source document really does flip it), education taking a second
bold line for the degree; a blank body-size line between entries and before each
section header; skills lines are unlabelled prose, also as the source has them.

`harvard_style.py`: Times New Roman; 0.7" sides; a centered 16pt bold name over
a centered 9.5pt contact line; uppercase letterspaced section headers with a
full-width rule; two-line entries (bold org + right-aligned location, italic
role + right-aligned dates via a right tab at content width), projects on one.

## Pipeline

```
python scripts/resume/build_resumes.py --edition <YYYY-MM>   # DOCX
powershell -File scripts/resume/export-pdf.ps1 -Edition <YYYY-MM>  # PDF (Word COM)
python scripts/resume/verify_resumes.py --edition <YYYY-MM>  # must exit 0
```

Content: pools in `scripts/resume/content/{education,experience,projects,leadership,skills}.json`
(bullet text supports per-slug overrides via the `text` map); per-resume
selection in `content/resumes/<slug>.json` (`pages`, optional `bodyPt`,
`marginIn` side margin in inches — 0.5 on all eight in this edition).
Reference templates: `public/resume/template/{nus,harvard}-template-2026.docx`
(rebuild with `--sample`, plus `--style` for the other one). The NUS source
documents live beside them: `NUS Resume - Y3-Y4.docx`, `NUS Guidelines.pdf`,
two CDE examples and the action-verb list.

After verifying, render PDFs to PNG (pdftoppm, 130 dpi) into
`.impeccable/resume-qa/` and LOOK at every page: dates flush right at one x,
no orphaned entry headers, page counts 1 for every one-pager (incl.
`highlights`) and 2 for general.

Full edition-bump checklist (archiving, siteConfig, pageAgent): see
[CLAUDE.md](../../../CLAUDE.md).

## On-demand builds (agents and the builder window)

Custom résumés are rendered by `server/resumeRender.mjs` (pdfkit, Standard-14
Times) through `api/resume.mjs` and the `build_resume` MCP tool — the Python +
Word pipeline above still owns the eight canonical editions. The instructions
agents receive live in `server/resumeGuide.mjs`; that file is the single source,
so change it there rather than restating the rules. Its load-bearing rule:
callers select block ids and can never supply bullet text, because these
documents reach employers unsupervised.

## Checking

`npm run resume:lint` after any content-pool edit. It prints two things: what
the block pool looks like (which opening verbs it leans on, per section; which
sentence shape repeats; tense that disagrees with an entry's own dates; which
bullets have no `deep` variant), then the report an agent would get for each of
the eight canonical resumes. Exit code is 0 unless a structural error fires -
repetition is a judgement call about approved material, not a build failure.

The same engine (`server/resumeCheck.mjs`) answers the `check_resume` MCP tool
and rides along on `build_resume`. It is deterministic and rule-based: no model,
no score, no verdict, just counts and the block ids each finding sits on.

Two rules of its own, and they are the same prohibition as everywhere else here:

- **Never write or reword a bullet to improve a count.** The lint tells you
  where the pool repeats itself; the fix is still prose only Rahul can approve,
  and only ever a rephrasing of something already attested.
- **A low quantified count is never permission to add a number.** The checker
  deliberately reports which digits it rejected (`GPT-4`, `Route 53`, `3D`,
  bare years) so a thin count is understood rather than answered.

Editing bullet text changes the shipped documents, so it needs the full edition
rebuild above - Windows and Word - not just a lint that comes back quieter.

## Alternative phrasings

A bullet can carry `phrasings`: other sentences saying the same fact, so a resume
that is right on the evidence is not marked down for wording it cannot change.
They are a sibling key, never inside `text`, so Word never sees them and adding
one changes no shipped document.

`npm run resume:lint -- --phrasings` prints every alternative beside the
sentence it replaces, with the file to edit. `npm run resume:lint` and `npm test`
run the attestation guard over every committed phrasing. It checks that every proper noun and number is already in
that bullet's own approved text, that the measurements and product-numbers match
exactly, that it fits at every legal typography, that it earns its place, and
that its opening verb holds the same ownership rank as the original
(`content/ownership.json`).

What the guard does NOT catch: recombination (every word attested, arranged to
assert something no source does), modality ("targets replacing" becoming
"replaced" keeps the verb and turns a plan into a result), and implicature. A
sentence can pass every rule and still be wrong. Read them.

## Fit

Overflow trim ladder, in order: drop coursework bullet → reduce 3-bullet
entries to 2 → drop least-relevant project → then typography, which belongs to
the style. `nus` holds its 0.5" margins and steps the body 10.5/10/9.5/9/**8.5pt**
(8.5 is what the two-page master CV needs, and `software-engineer` lands there
too); `harvard` steps 10.5→10pt and then margins 0.7→0.6→0.5". Never below the
style's own floor.

Fit truth is the pypdf page count of the exported PDF, never an estimate. The JS
renderer models Word closely enough to pick the right rung — its numbers come
from the font's own hhea table and from glyph positions measured out of Word
output — but it is a model. Two one-pagers were a rung optimistic until the
section-header rule's 3.75pt band was measured and put in. **Always export and
count.**
