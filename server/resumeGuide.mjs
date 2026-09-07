// resumeGuide.mjs — the instructions returned by the get_resume_guide MCP tool.
// Single source: .agents/skills/resume-editing/SKILL.md links here rather than
// restating it, so the rules an agent reads are the rules in the repo.
export const RESUME_GUIDE = `# Building a résumé for Rahul Mitra

You are composing a Harvard-style résumé from Rahul's verified work, usually
targeted at a specific job. Read this before calling \`build_resume\`.

## The one rule that matters

**Select only from \`list_resume_blocks\`. Never write your own bullet text.**

Every bullet, entry and skills line is pre-approved by Rahul. \`build_resume\`
accepts ids, not prose, so a claim he did not write cannot reach a document.
This is deliberate: these résumés go to real employers, sometimes without him
reviewing them first.

If a job asks for something the blocks do not cover, say so in your reply. Do
not stretch a nearby bullet to imply it. An accurate résumé that misses a
keyword is recoverable; an inaccurate one is not.

## How to tailor

1. \`get_resume_guide\` (this), then \`list_resume_blocks\` for the menu.
2. Pick the closest starting point from \`startingPoints\` and fetch it with
   \`get_resume(slug)\`, which returns its spec. Six are role-targeted, plus
   \`highlights\` (one-page best-of) and \`general\` (two-page master CV).
3. Swap bullets and skills lines for ones that match the posting. Prefer the
   entry whose evidence is closest to what the job asks for, not the one whose
   wording matches the keywords.
4. Choose depth. Bullets can carry \`deep\` and \`short\` variants alongside the
   default. Set \`detail: "deep"\` on the spec, or \`variant\` on a single entry.
   Deep variants are longer, so they usually need \`pages: 2\`.
5. \`build_resume(spec)\`. You get PDF, DOCX and Markdown URLs plus a fit report.

## Layout, which you do not control

A4, Times New Roman, 0.7in side margins, centred 16pt name over a 9.5pt contact
line with four live links. Uppercase letterspaced section headers with a
full-width rule. Entries are two lines: bold organisation with right-flush
location, italic role with right-flush dates. Projects render as one line.
Bullets are literal "• " with a hanging indent, which keeps them ATS-safe.

The renderer enforces all of it. You choose content, not typography.

## Ordering, which is also not yours to choose

Experience, education and leadership sort strictly reverse-chronologically by
start date. Projects sort by most recent activity. This is Rahul's explicit
instruction and the renderer applies it regardless of the order you list
entries in, so do not try to lead with a "most relevant" role.

## Fitting one page

\`autoFit\` walks the sanctioned ladder for you: body 10.5pt to 10pt, then
margins 0.7in to 0.6in to 0.5in. It never drops content you chose, and never
goes below 10pt.

If it still overflows you get an overflow report instead of a silent trim.
Remove something and rebuild. Rough costs: a project entry is about three
lines, a bullet about two, the coursework line about two.

## Section skeleton

Five sections in this order, matching every existing résumé:

EDUCATION, EXPERIENCE, PROJECTS, LEADERSHIP AND ACTIVITIES,
SKILLS AND CERTIFICATIONS.

Certifications are not a separate section: they are skills lines whose label is
"Certifications" (ids beginning \`certs-\`).

## Spec shape

\`\`\`json
{
  "subject": "Software Engineer — Acme",
  "pages": 1,
  "detail": "standard",
  "sections": [
    { "type": "education", "title": "EDUCATION",
      "entries": [{ "id": "nus", "bullets": ["majors", "award"] }] },
    { "type": "experience", "title": "EXPERIENCE",
      "entries": [
        { "id": "stmicro-or", "bullets": ["putaway"] },
        { "id": "abbott-intern", "bullets": ["pipeline", "apc"], "variant": "deep" }
      ] },
    { "type": "projects", "title": "PROJECTS",
      "entries": [{ "id": "asyncddgs", "bullets": ["main"] }] },
    { "type": "leadership", "title": "LEADERSHIP AND ACTIVITIES",
      "entries": [{ "id": "ntuc", "bullets": ["main"] }] },
    { "type": "skills", "title": "SKILLS AND CERTIFICATIONS",
      "lines": ["se-skills", "certs-core"] }
  ]
}
\`\`\`

\`bodyPt\`, \`marginIn\` and \`autoFit\` exist but you rarely want them — let
auto-fit decide.

## Applying on Rahul's behalf

Building a résumé is not the same as sending it. Submitting an application,
emailing a recruiter, or filling a form is an action with consequences for a
real person's career. Show him what you built and confirm before sending.
`;
