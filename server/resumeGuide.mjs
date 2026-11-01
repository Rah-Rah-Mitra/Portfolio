// resumeGuide.mjs: the instructions returned by the get_resume_guide MCP tool.
// Single source: .agents/skills/resume-editing/SKILL.md links here rather than
// restating it, so the rules an agent reads are the rules in the repo.
export const RESUME_GUIDE = `# Building a résumé for Rahul Mitra

You are composing a résumé from Rahul's verified work, usually
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
   bullet there carries its opening verb, its rendered line cost, whether it
   holds a measurement, the technologies it actually names (\`terms\`) and which
   ready-made résumés select it (\`usedBy\`, empty where none do), so you can
   aim the selection and spread the verbs and the evidence as you pick rather
   than being told afterwards that you did not.

   **The menu is larger than any ready-made résumé.** Some of the strongest
   material sits on only one of them, or on none: the People's Association AWS
   deployment bullet (\`pa.infra\`: Terraform over ECS Fargate, Multi-AZ RDS
   Postgres with PostGIS, ALB and WAFv2, Route 53, ACM, KMS and Secrets Manager)
   is one such. Read the menu; never treat a ready-made résumé
   as the full inventory. It is also not everything he has built: material he
   has asked to keep off résumés is withheld from the menu and refused by the
   builder, so if you know of a project and cannot find it, that is deliberate.
2. Pick the closest starting point from \`startingPoints\` and fetch it with
   \`get_resume(slug)\`, which returns its spec. Six are role-targeted, plus
   \`highlights\` (one-page best-of) and \`general\` (two-page master CV).
3. Swap bullets and skills lines for ones that match the posting. Prefer the
   entry whose evidence is closest to what the job asks for, not the one whose
   wording matches the keywords.

   Two standing preferences, both finalist projects Rahul rates among his
   strongest work. **Volt Pulse SG** (Top 8 of 50+ teams) is on all eight
   ready-made résumés at his instruction: keep it unless the posting makes it
   genuinely irrelevant. **Swarmline** (team lead and finalist, SG Defence Tech
   Hackathon, 1,300+ applicants) is on seven, every one but civic-tech: keep it
   wherever the posting values autonomy, simulation, C++, distributed systems or
   defence work. \`swarmline.coordination\` carries the team lead and the
   algorithms, \`swarmline.main\` the simulation and the jammed-link result, and
   \`swarmline.combined\` is both in one sentence, the master CV's own line.
4. Three bullets per entry is typical, and on a one-page spec four is the
   ceiling — the checker reports a fifth as a structural error. When an entry
   genuinely earns a fourth (People's Association carries platform, Singpass,
   AWS deployment with its CI/CD, and the site survey with the balloting rules
   on the civic résumé), pay for it by dropping a weaker project rather than
   by cutting one of the four. A two-page spec has room for more and the
   ceiling rises to eight: the master CV carries six on the Abbott internship
   and five on the Abbott contract and People's Association, because Rahul's
   own CV does.
5. Choose depth. Bullets can carry a \`deep\` variant alongside the default; set
   \`detail: "deep"\` on the spec, or \`variant\` on a single entry. Deep variants
   are longer, so they usually need \`pages: 2\`. Only 15 of the 52 selectable
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

   \`"phrasings": { "waaah.main": "build-first" }\`

   You are choosing between Rahul's sentences, never editing one. The builder
   accepts a phrasing id and rejects text, and an id that does not exist is an
   error rather than a quiet fallback to something else.

   \`amazon-vision.brief\` names Rahul's mentor on the Amazon Robotics brief,
   and may on any document. Its \`no-mentor\` phrasing is the same brief without
   that clause, a line shorter, for a page that needs the room.
8. \`build_resume(spec)\`. You get PDF, DOCX and Markdown URLs plus a fit report.

## Layout, which you do not control

Two styles, and \`style\` is the only part of it you may set.

\`nus\` (the default, and what the eight ready-made résumés ship in) is the NUS
Centre for Future-ready Graduates format: A4, Arial, 0.5in side margins, a
right-aligned 19.5pt name over an 8.5pt contact line. Caps section headers under
a full-width double rule. One bold line per entry with right-flush dates:
\`Role, Organisation\` in every section but national service, which leads with
the service (\`Organisation, Role\`), and education takes a second line for the
degree, with the GPA after it unless the entry sets \`"gpa": false\`. A blank
line between entries. A projects section may set \`"render": "cv-inline"\`, the
master CV's format: each project becomes one bullet, "Role, Organisation (Date):
sentence", so every entry in it selects exactly one bullet.

\`harvard\` is the older option: Times New Roman, 0.7in margins, a centred 16pt
name, and two-line entries (bold organisation with right-flush location, italic
role with right-flush dates) with projects on one line.

Both use literal "• " bullets with a hanging indent, which keeps them ATS-safe,
and both carry five live contact links. The renderer enforces the rest. You
choose content, not typography.

## Ordering, which is also not yours to choose

Every dated section sorts by END date: entries still running come first,
ordered by start date descending, then ended entries by end date descending.
Projects sort by most recent activity. This is Rahul's explicit instruction and
the renderer applies it regardless of the order you list entries in, so do not
try to lead with a "most relevant" role. The one exception is grouping by
employer: an entry may set \`"after": "<id>"\` to sit directly below another
entry of the same section (general keeps the Abbott internship under the Abbott
contract it was converted into).

## Fitting one page

\`autoFit\` walks that style's sanctioned ladder for you. \`nus\` holds its 0.5in
margins and steps the body 10.5 / 10 / 9.5 / 9 / 8.5pt; \`harvard\` steps 10.5 to
10pt and then margins 0.7 / 0.6 / 0.5in. Neither ever drops content you chose,
and neither goes below its own floor — 8.5pt is the size the two-page master CV
needs, and 10pt is as low as \`harvard\` goes.

If it still overflows you get an overflow report instead of a silent trim.
Remove something and rebuild. Rough costs: a project entry is about three
lines, a bullet about two, the coursework line about two.

## Section skeleton

The sections, in this order, each optional:

SUMMARY (the master CV only: Rahul's own paragraph, selected with
\`{ "type": "summary", "title": "SUMMARY" }\` and never on a role résumé),
EDUCATION, WORK EXPERIENCE, RESEARCH EXPERIENCE (type \`research\`), PROJECTS,
CO-CURRICULAR ACTIVITIES AND VOLUNTEER EXPERIENCES (type \`leadership\`),
NATIONAL SERVICE (type \`national-service\`), SKILLS AND CERTIFICATIONS. These
are the master CV's headings and every ready-made résumé uses them.

Certifications are not a separate section: they are skills lines whose label is
"Certifications" (ids beginning \`certs-\`).

Those headings are the exact strings, and the only ones: a section's \`title\` is
chosen from that list (the experience section may also say plain "EXPERIENCE";
"PROJECTS AND COMPETITIONS" and "LEADERSHIP AND ACTIVITIES" are retired headings
still accepted so older links work), not written. \`subject\` is chosen too — any of the eight
ready-made subjects, or "Resume", "Custom Resume", "Tailored résumé" — because it
becomes the document's title in the PDF and DOCX metadata. Both print on a file
served under Rahul's name, so neither is a place to put your own words, not even
the company you are aiming at.

## Spec shape

\`\`\`json
{
  "subject": "Software Engineer Resume",
  "pages": 1,
  "detail": "standard",
  "sections": [
    { "type": "education", "title": "EDUCATION",
      "entries": [{ "id": "nus", "bullets": ["majors", "award"] }] },
    { "type": "experience", "title": "WORK EXPERIENCE",
      "entries": [
        { "id": "stmicro-or", "bullets": ["layout-agnostic"] },
        { "id": "abbott-intern", "bullets": ["pipeline", "apc"], "variant": "deep" }
      ] },
    { "type": "projects", "title": "PROJECTS",
      "entries": [{ "id": "voltpulse", "bullets": ["main"] }] },
    { "type": "leadership", "title": "CO-CURRICULAR ACTIVITIES AND VOLUNTEER EXPERIENCES",
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
