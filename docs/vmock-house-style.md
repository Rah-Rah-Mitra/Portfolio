# VMock house style

The rules `P5 house-style` and `R8 verb-family-cap` in `server/resumeCheck.mjs`
model one ATS-style screener: the **VMock SMART Editor**, NUS instance,
reverse-engineered by Rahul in September 2026 while taking his résumé from 63 to
79 of 100. This file is where the evidence lives, so the word lists in the
checker can stay short.

**Everything below marked ✅ was observed directly** — the wording was typed into
the editor and the per-bullet indicator watched. Rules marked ⚠️ are extrapolated
from a verified case and have not been tested individually. Do not treat the
inferred ones as facts.

## What is actually scored

Each bullet gets four indicators: **Action Oriented** (opens with a verb on an
unpublished whitelist), **Specifics** (contains a measurable), **Overused &
Avoided** (repeated verbs, filler words), and **Bullet Length** (≤ 3 rendered
lines, one sentence).

The document-level score is gated on two essential checks that have nothing to do
with bullet quality: **a phone number** and **spell check**, together worth 15 of
the 17 points that were available. No amount of rewriting reaches them. That is
why `scripts/resume/content/profile.json` leads with a phone number.

## The rules worth knowing

**Notation beats content for Specifics.** ✅ Verified by changing nothing but the
notation on one bullet:

| Wording | Specifics |
|---|---|
| …stages with **4x** super-resolution, lifting PSNR and SSIM… | ❗ "You have not added any specifics" |
| …stages to upscale frames **4 times**, lifting PSNR and SSIM… | ✅ "You have quantified the impact and scope" |

The parser wants a digit followed by whitespace or a hyphen. Write `1.5 W`, not
`1.5W`; `13 TOPS`, not `13TOPS`; `4 times`, not `4x`. A bullet can be fully
quantified and score zero purely on notation. `R8`'s sibling rule
`P5 glued-digit` exists for this, and the checker's own metric classifier was
extended to read `4 times` and `13 TOPS` so the two never contradict each other.

**`the` is a filler word.** ✅ Verified on the BRINHACK bullet: the red highlight
looked like a spell-check false positive and is really *"This bullet includes
filler words which should be avoided"*. Fires at roughly two `the`s in one bullet.

**One sentence per bullet.** ✅ A semicolon followed by an independent clause was
flagged (`…across operations; the platform won the S$20,000 fund.`); a participial
tail cleared it (`…, winning the S$20,000 fund.`). Relative pronouns opening a
subordinate clause (`that`, `which`) also drew highlights; participles are safer.

**Verb families are counted across the whole document, inflections together.**
✅ The panel named `Automate / Automated / Automating` at 5 and `Develop /
Developed` at 4. Cutting them to 2 and 3 flipped Overuse from *On Track* to *Good
Job!*. The practical ceiling is 3, and `automating` mid-sentence counts the same
as `Automated` at the start — which is exactly what `R1` cannot see, because it
counts openers per section. Hence `R8`.

**Job Position is scored as a set.** ✅ The single token `BlendED` marked **all
six** work titles as inconsistently styled; removing just that parenthetical
dropped the count from 6 to zero. Explicitly fine, all verified green afterwards:
parentheses, ampersands, ALL-CAPS acronyms (`AI`, `NUS`), trailing comma clauses,
and plain CamelCase brands. Converting a title to ALL CAPS *adds* a failure.
The narrow rule is an internal run of capitals inside one token. The Company field
applies no such rule, which is why the fix was to move the programme name there.

**Reverse-chronological means end date first.** ✅ Verified against VMock's own
numbering: current roles group at the top by start date descending, then ended
roles by end date descending. This is now the repo's ordering policy — see
CLAUDE.md.

## The dictionary

**❌ Red, deducts marks — ✅ all verified:**
`air-gapped` · `quantized` · `optimizer` · `normalizing` · `authorization` ·
`passwordless` · `human-centered` · `aiohttp` · `asyncio` · `benchmarked` ·
`quartile` · `waitlisted` · `projective` · `generalized` · `queueing`

**🟡 Yellow, flagged but free — ✅ verified:**
`ONNX` · `Chroma` · `LangChain` · `SimPy` · `Singpass` · `Myinfo` · `OIDC` ·
`FastAPI` · `Automated` · `Hailo` · `MediaPipe` · `Konva.js` · `Three.js` ·
`SmartExam` · `AgeWellLah.AI` · `Waaah` · `Executables`

It leans British and non-technical: `-ize`/`-ization` forms and hyphenated
technical compounds are the casualties. Proper nouns and library names cost
nothing, so there is no reason to strip `ONNX`, `LangChain` or `Chroma`.

**The British hypothesis is now confirmed, by pairs.** ✅ `generalised` passes
where `generalized` is red; `queuing` passes where `queueing` is red;
`modelling` passes. So the fix for most of this list is the `-ise`/`-ll-`
spelling, not a rewrite. Two exceptions worth knowing:

- `projective` has **no** British variant. The 3D Vision skills line names the
  things instead — camera models, epipolar geometry, absolute pose — which is
  more specific anyway.
- `queueing` is the standard spelling in queueing theory, and `queuing` is the
  one that passes. The skills line says `queuing systems`.

**The site keeps plain English.** `portfolioData.ts` and the workbench windows
say "projective geometry" and "generalized cameras" on purpose: a human reads
those, no screener does, and bending them would make the prose worse for the
only audience it has. The split is deliberate — résumé British-for-ATS, site
plain English — and `P5 house-style` only ever reads the résumé pools.

⚠️ **Inferred, untested, same shape as the verified reds:** `optimization` ·
`canonicalization` · `hyperparameter` · `modeling`/`Modeled` · `standardization`.
`optimization` and `hyperparameter optimization` are still in the pool on
purpose — they are correct terms and the risk is unverified.

**❌ Verbs verified rejected** (each triggered *"Include action words"*):
`Engineer` → cleared by `Automate`. `Reverse-engineer` → cleared by `Convert`.
`Advance` → cleared by `Build`. The pattern is that it rejects verbs that are
also common nouns. `P5 non-action-verb` is a deny-list of exactly these three
rather than a whitelist, because a whitelist would flag every verb nobody tested.

## The caveat

VMock is a screener, not a hiring manager. Some of what it wants is
straightforwardly good writing: digits over words, one sentence per bullet, real
action verbs, no minimisers like *"in a first CTF"*. Some of it is simply wrong —
`air-gapped`, `quantized` and `optimizer` are the correct technical terms, and
"offline process-intelligence platform" is a less precise description of what the
Abbott system is than "air-gapped" was.

Every rule here is therefore a **warn** or a **note**. None may fail a build;
`R6` keeps sole ownership of `error`. If one of these résumés is going to an
engineering audience rather than through a screener, the precise words are worth
putting back.
