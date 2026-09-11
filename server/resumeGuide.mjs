// resumeGuide.mjs: the instructions returned by the get_resume_guide MCP tool.
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

1. \`get_resume_guide\` (this), then \`list_resume_blocks\` for the menu. Each
   bullet there carries its opening verb, its rendered line cost and whether it
   holds a measurement, so you can spread the verbs and the evidence as you pick
   rather than being told afterwards that you did not.

   **The menu is larger than any ready-made résumé.** Some of the strongest
   material sits on only one of them, or on none: the People's Association AWS
   deployment bullet (\`pa.infra\`: Terraform, Fargate, Route 53, Redis, Kafka,
   cloud security) is one such. Read the menu; never treat a ready-made résumé
   as the full inventory. It is also not everything he has built: material he
   has asked to keep off résumés is withheld from the menu and refused by the
   builder, so if you know of a project and cannot find it, that is deliberate.
2. Pick the closest starting point from \`startingPoints\` and fetch it with
   \`get_resume(slug)\`, which returns its spec. Six are role-targeted, plus
   \`highlights\` (one-page best-of) and \`general\` (two-page master CV).
3. Swap bullets and skills lines for ones that match the posting. Prefer the
   entry whose evidence is closest to what the job asks for, not the one whose
   wording matches the keywords.

   One standing preference: **Volt Pulse SG** is on all eight ready-made
   résumés at Rahul's instruction. It was a Top 8 finalist of 50+ teams and he
   rates it among his strongest work, so keep it unless the posting makes it
   genuinely irrelevant.
4. Three bullets per entry is typical and four is the practical ceiling. When
   an entry genuinely earns a fourth (People's Association carries platform,
   Singpass, Sparks fund and AWS deployment on the architecture résumés), pay
   for it by dropping a weaker project rather than by cutting one of the four.
5. Choose depth. Bullets can carry a \`deep\` variant alongside the default; set
   \`detail: "deep"\` on the spec, or \`variant\` on a single entry. Deep variants
   are longer, so they usually need \`pages: 2\`. Only 16 of the 42 selectable
   bullets have one, and the rest fall back to their default silently, so do not
   treat depth as a way to change every bullet at once.
6. Check whether the entry offers more than one job title. An entry with
   \`roleOptions\` was held under several hats, and you pick one with
   \`roleVariant\` on that entry. People's Association is the current example:
   \`default\` is "Platform & Solutions Engineer (Sparks Citizen Developer)",
   his formal title, and \`software\` is "Software Engineer (Citizen
   Developer)". Both are true, so choose the one the posting is hiring for.
7. Check whether a bullet offers more than one wording. Some carry
   \`phrasings\`: alternative sentences Rahul has approved for the same fact, one
   opening on the outcome, another on the technology. Each shows its opening
   verb, its line cost and whether it holds a measurement. Pick one with a
   spec-level map keyed on the same \`entryId.bulletId\` the check report uses:

   \`"phrasings": { "waaah.main": "landmarks-first" }\`

   You are choosing between Rahul's sentences, never editing one. The builder
   accepts a phrasing id and rejects text, and an id that does not exist is an
   error rather than a quiet fallback to something else.
8. \`build_resume(spec)\`. You get PDF, DOCX and Markdown URLs plus a fit report.

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
  "subject": "Software Engineer, Acme",
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
      "entries": [{ "id": "voltpulse", "bullets": ["main"] }] },
    { "type": "leadership", "title": "LEADERSHIP AND ACTIVITIES",
      "entries": [{ "id": "ntuc", "bullets": ["main"] }] },
    { "type": "skills", "title": "SKILLS AND CERTIFICATIONS",
      "lines": ["se-skills", "certs-core"] }
  ]
}
\`\`\`

\`bodyPt\`, \`marginIn\` and \`autoFit\` exist but you rarely want them; let
auto-fit decide.

## Checking what you built

\`build_resume\` returns a check report beside the fit report, and \`check_resume\`
runs the same check on a slug or on the \`spec\` value out of a build URL without
re-rendering. It reports counts, never a score: which opening verbs repeat, which
bullets share a sentence frame, which carry no measurable outcome, and any bullet
over the line budget. Every finding names block ids.

Read \`summary\` first. It names the biggest finding, the alternative wordings
that would clear findings at no cost, and the rule below.

One finding is worth acting on before the style ones: \`unused-evidence\` names a
bullet on an entry you already selected that mentions more of Rahul's attested
technologies than the one you picked. It is a trade, not a verdict, and the report
gives both sides: the thinner bullet often carries the measured outcome. Pick
whichever the posting is hiring for.

**Evidence outranks wording.** Never drop a bullet, a role, or a measurement to
clear a style finding. Experience is the strongest thing on the page, and a
repeated opening verb there is worth accepting: the report will say so rather
than suggest removing anything.

It is advisory and it cannot fix anything itself. There are three responses:
take an alternative wording it offers, swap a block id, or accept the finding.
Never write a bullet to improve a count, and never drop good evidence to satisfy
a lint.

Prefer a rephrase over a swap. A \`remedy.kind\` of \`"rephrase"\` names a wording
that keeps the evidence and changes only the sentence; a swap trades one piece of
evidence for another, which is a bigger decision and usually the wrong one when
the block you have is the block that fits the posting. Take the rephrase, rebuild,
and the finding is gone.

Two things still deserve a warning. Not every bullet has an alternative wording
yet: where none exists the report says so plainly, and accepting the repeat is
the right answer rather than dropping evidence for it. And a low quantified count
is never permission to add a number. Alternative wordings carry exactly the same
measurements as the sentence they replace, by design, so no rephrase will ever
raise that count. If a measurement is not already in the blocks, it does not
exist.

Whether a bullet fits the posting is your judgement, and it outranks every
finding here.

## Applying on Rahul's behalf

Building a résumé is not the same as sending it. Submitting an application,
emailing a recruiter, or filling a form is an action with consequences for a
real person's career. Show him what you built and confirm before sending.
`;
