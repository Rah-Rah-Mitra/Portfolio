---
name: resume-editing
description: Use for ANY change to Rahul's resumes/CVs — adding roles, editing bullets, regenerating editions, restyling, or fixing resume links on the site. Covers the Harvard-style DOCX/PDF pipeline in scripts/resume, the content JSONs, edition bumps, verification, and the site wiring (siteConfig resumeEdition, pageAgent, resume cards).
version: 1.0.0
---

# Resume editing

All resumes are generated, Harvard-style (Harvard OCS conventions), from
in-repo content. Eight outputs: 6 one-page role resumes, the 1-page
`highlights` best-of (10pt body, 0.5" side margins), and the 2-page
`general` master CV. Most one-pagers now declare `bodyPt: 10` to carry the
denser Abbott contract bullets — read each config rather than assuming 10.5.

## Hard bans

- **Never hand-edit `public/resume/generated/*`** — regenerate from content.
- **Never change the font.** Times New Roman only (Harvard convention,
  universally available). Any font change needs explicit user approval.
- **Never mutate old DOCX files with string replacement** (the pre-2026-09
  approach — its scripts were deleted). Edit the content JSONs instead.
- **Never reorder by "relevance".** Experience/education/leadership are
  strictly reverse-chronological by start date; projects by most recent
  activity, ongoing first, "Additional Projects" pinned last.
- **Never invent facts** — new bullets only rephrase what the user supplied.

## Layout invariants (scripts/resume/harvard_style.py)

A4, 0.7" side margins; centered 16pt bold name; one centered 9.5pt contact
line (5 items, 4 live hyperlinks — must stay on ONE line); uppercase
letterspaced section headers with full-width bottom rule; entries are two
lines (bold org + right-aligned location, italic role + right-aligned dates
via a right tab at content width); 1–3 bullets per entry and 4 where the
material earns it (People's Association on the two architecture résumés — buy
the room by dropping a project, not by cutting a bullet), action verb first,
past tense except current roles; literal "• " bullets with hanging indent
(ATS-safe, deliberate).

## Pipeline

```
python scripts/resume/build_resumes.py --edition <YYYY-MM>   # DOCX
powershell -File scripts/resume/export-pdf.ps1 -Edition <YYYY-MM>  # PDF (Word COM)
python scripts/resume/verify_resumes.py --edition <YYYY-MM>  # must exit 0
```

Content: pools in `scripts/resume/content/{education,experience,projects,leadership,skills}.json`
(bullet text supports per-slug overrides via the `text` map); per-resume
selection in `content/resumes/<slug>.json` (`pages`, optional `bodyPt`,
optional `marginIn` side margin in inches — only `highlights` uses it).
Reference template: `public/resume/template/harvard-template-2026.docx`
(rebuild with `--sample`).

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
entries to 2 → drop least-relevant project → body 10.5→10pt (general already
runs 10pt) → margins toward 0.5" (per-config `marginIn`; `highlights` is at
0.5" and `general` at 0.6", the rest at the 0.7" default). Never below 10pt.
Fit truth is the pypdf page count of the exported PDF, never an estimate.
