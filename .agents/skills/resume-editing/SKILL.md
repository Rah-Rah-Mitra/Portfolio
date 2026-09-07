---
name: resume-editing
description: Use for ANY change to Rahul's resumes/CVs — adding roles, editing bullets, regenerating editions, restyling, or fixing resume links on the site. Covers the Harvard-style DOCX/PDF pipeline in scripts/resume, the content JSONs, edition bumps, verification, and the site wiring (siteConfig resumeEdition, pageAgent, resume cards).
version: 1.0.0
---

# Resume editing

All resumes are generated, Harvard-style (Harvard OCS conventions), from
in-repo content. Eight outputs: 6 one-page role resumes, the 1-page
`highlights` best-of (10pt body, 0.5" side margins), and the 2-page
`general` master CV.

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

## Fit

Overflow trim ladder, in order: drop coursework bullet → reduce 3-bullet
entries to 2 → drop least-relevant project → body 10.5→10pt (general already
runs 10pt) → margins toward 0.5" (per-config `marginIn`; `highlights` is
at 0.6"). Never below 10pt. Fit truth is the pypdf page count of the
exported PDF, never an estimate.
