# Résumé detail gaps

Deep bullet variants are written **only** from facts already attested somewhere in
this repository — project spotlights, achievement descriptions, experience records,
skills lines. That rule exists because agents build résumés from these blocks and
send them to employers, sometimes without Rahul reading them first.

This file lists what an agent would plausibly want to claim and the repo does
**not** support. Nothing here may appear on a résumé until Rahul confirms it and
the fact is written into the content pools.

Answer a question by adding the fact to `scripts/resume/content/*.json` (or to
`portfolioData.ts` if it belongs on the site too), then delete the entry here.

**Answered 2026-09-04** (Rahul, in conversation) and now in the data:

- The **Churp deployment at People's Association ran on AWS**: Terraform-provisioned
  infrastructure across eight services — ECS Fargate, Multi-AZ RDS Postgres with
  PostGIS, an ALB fronted by WAFv2, Route 53, ACM, KMS and Secrets Manager — and
  the cloud security work that went with it. **Corrected 2026-11:** this record
  originally said "Redis caching, Kafka messaging". Neither was used. Rahul caught
  it in the master CV pass, and it had by then reached two shipped résumés, three
  skills lines, `resumeGuide.mjs`, the Churp card on the site and the snapshot. Added as the selectable `pa.infra` bullet,
  to the `sa-skills` / `civic-skills` / `gen-cloud` / `hl-web-cloud` skills lines, and to
  the Churp project's tags and spotlight on the site.
- **Waaah Comics** is now a selectable résumé project (`waaah`) and has a spotlight on
  the site, naming MediaPipe 3D landmarks, Gemini 2.0 Flash, Veo 3, and Konva.js.
- **Computer-vision provenance**: the CV terms in the skills lines come from the CS4277
  3D Computer Vision course (top of a class of 24) and the Amazon robotics-vision role.
  That settles where they came from — it does not add new ones (see §5).

---

## 1. Reinforcement learning — the largest gap

Rahul has asked for résumés that dive into RL specifics. Right now the repo
attests almost nothing.

**What exists:** `PPO, A2C, DDPG, DQN` appears in exactly two authored places, and
both are skills labels — `skills.json` (`gen-ai`, as "deep RL (PPO, A2C, DDPG,
DQN)") and `portfolioData.ts` (a skill chip). The only backing evidence is two Packt
certifications — "Reinforcement Learning and Deep RL Python (Theory and Projects)"
and "Practical Reinforcement Learning - Agents and Environments", both completed in
March 2023 and both now listed in the site's certification register
(`lib/certifications.ts`). Neither reaches the `ATTESTED` vocabulary in
`server/jobSearch.mjs`, so `build_tailored_resume` still reports RL as uncovered.
That is deliberate: a completed course is not applied work.

**What does not exist anywhere:**

- **DPO** — zero occurrences in the repository. Rahul named it in conversation but
  it is unattested, so it is not yet usable.
- **RLHF** — zero occurrences.
- Any **project, employer, or outcome** connected to RL. No bullet in any of the
  eight résumés mentions reinforcement learning at all.
- Any **network architecture** detail: no actor-critic, policy gradient, replay
  buffer, target network, reward shaping, or named environment anywhere.

**Questions for Rahul:**

1. Where did the RL work actually happen — coursework, the Packt certification's
   projects, a personal repo, or something at work?
2. What did you build with PPO/A2C/DDPG/DQN, and what was the result?
3. Is DPO something you have used? On what, and for what task?
4. Which network architectures did you implement yourself?

Until these are answered, an RL bullet can honestly say the certification was
completed and name the algorithms it covered. It cannot claim applied RL work.

## 2. Amazon — answered 2026-09-14

**Answered (Rahul, VMock alignment pass).** The work covers **three imaging
workstreams**, and the measured outcome is **4x upscaling evaluated on PSNR and
SSIM**, which lets a **low-cost camera reach frame quality on par with premium
sensors**. Rahul confirmed this is publishable. Now in `amazon-vision.isp` and
`amazon-vision.frame-quality` (both with deep variants) and in the site's
experience record.

**Extended 2026-11** (Rahul, master CV pass): the architectures are **UNet and
other CNN architectures**, trained for **single-image super-resolution**. Now in
`amazon-vision.frame-quality` and its deep variant.

**Superseded 2026-10-16** (Rahul's Oct 2026 master CV, edition 2026-12): the
role ended in Oct 2026 and is titled *Robotics Vision Engineer (AI+X Global
Challenge), Amazon*. `amazon-vision.frame-quality` and the 4x / premium-sensor
claim are retired; the entry now carries Rahul's own five bullets: `isp`
(rewritten), `sr-reproduction` (a published UNet super-resolution model
reproduced in PyTorch, 12 models across 3 scales, 2 datasets and 2 losses,
matching reported results at 8x and within 0.78 dB at 2x and 4x), `robustness`
(randomised-blur training and fine-tuning, up to 0.7 dB across 3 blur types),
`sr-review` (a literature review he authored and presented, comparing 4 model
families) and `deployment` (3 trained models as a public web app: Flask on a
Colab T4 GPU, weights from a GitHub release, a tunnel on a reserved domain).
None has a `deep` variant. Still absent: the dataset names, the paper's
citation (Rahul's wording calls it "a published UNet super-resolution model"),
and PSNR as the metric behind the 0.78 dB (only the robustness bullet says
PSNR).

**Superseded 2026-11** (the Nov 2026 master CV): the entry is research, not
employment. It moved to `research.json` as *Computer Vision Researcher, BlendED x
Amazon Robotics (AI+X Global Challenge)*, and "Amazon" never stands alone as the
organisation. General opens it with `brief` (the Amazon Robotics brief, mentored
by Dan Shao) in place of `isp`; the role résumés keep `isp`. Rahul cleared
naming Dan Shao on any document (2026-11-01); `brief`'s phrasing `no-mentor` stays
as the same sentence a line shorter.

## 3. STMicroelectronics — ongoing, so no outcome yet

The put-away recommendation bullet describes intent ("replacing experience-based
slotting"). There is no measured result yet. The bullet now names **3 live
inputs** — a count of the three the sentence already lists, not a new claim.
Worth revisiting once the System Design Project produces a measured result.

**Superseded 2026-11** (the Nov 2026 master CV): *Warehouse AI & Operations
Research Engineer (Part-Time), STMicroelectronics (NUS Capstone)*. `putaway` and
its "Singapore warehouse" scope are retired; the engine is layout-agnostic and
must run in any STMicroelectronics warehouse. Three bullets replace it
(`layout-agnostic`, `ranking-pipeline`, `replay-eval`): a 4-stage shelf-ranking
pipeline designed and a historical-replay evaluation defined, piloting on two AMK
warehouses. Still no measured result; revisit when the replay produces numbers.
The title is self-chosen (the contract gives none) and awaits the supervisor.

## 4. Abbott contract role — answered in full

Rahul supplied the detail on 2026-09-04. Six bullets now exist (`platform`,
`setpoint`, `datalayer`, `guardrails`, `harness`, `hardening`), the site's
experience record carries the work, and the role went from the thinnest entry in
the corpus to the strongest. Newly attested through it: PyTorch, CUDA, ONNX,
Chroma, LangChain over llama.cpp/GGUF, quantized Gemma, marker, chonkie,
fastembed, bge-small, Seeq/SPy, HiGHS, `scipy.optimize.linprog`, SciPy, pandas,
ruptures, STUMPY, Kalman smoothing, Welch PSD, and matrix-profile motifs.

The generic `ai-systems` and `supply-chain` bullets are kept in the pool — they
still suit a non-technical reader — but no résumé leads with them any more.

## 5. ML tooling that is absent everywhere

*Partly answered.*

- Terraform and the eight AWS services in `pa.infra` are attested through the
  Churp deployment. Redis and Kafka are **not** — see the correction in the
  2026-09-04 record above, and do not reintroduce them.
- **PyTorch, ONNX, Chroma, SciPy, pandas and quantization** are attested through
  the Abbott contract work (§4), along with HiGHS, Seeq, STUMPY and ruptures.
- **3D computer vision: settled, and widened once.** Rahul confirmed
  (2026-09-04) that the CV entries already in the skills lines are correct as
  written — epipolar geometry, absolute pose, SfM, bundle adjustment, multi-view
  stereo, from CS4277, alongside camera ISP, super-resolution and image
  restoration from the Amazon role. **PnP is now claimed**: his own master CV
  (2026-09-14) writes the 3D Vision line as "absolute pose estimation (PnP)",
  along with camera calibration, homography estimation, single-view metrology,
  three-view geometry and generalised camera models. **RANSAC, SIFT and ORB are
  still not claimed** and appear nowhere in the recorded syllabus, so they stay
  on the list below — do not add them.

Still absent from every content source, and therefore still unusable:

TensorFlow (except a passing reference to TensorFlow.js in a fork), Hugging Face,
scikit-learn, Keras, NumPy, RANSAC, SIFT, ORB, Gurobi, Pyomo, Kubernetes,
PostgreSQL, MongoDB, Pinecone, FAISS, pgvector, Weights & Biases, MLflow,
TensorRT, distillation, Optuna.

**Question (still open):** which of the remaining names have you actually used,
and on what?

## 6. Attested but unconnected to any work

- `cloud security` — **answered**: the deployment work on Churp is the backing
  experience. **Still open:** the narrower `AWS IMDSv2, metadata APIs` phrasing in
  `gen-security` reads as bug-bounty research rather than deployment. Confirm which
  context it should sit in, since the two tell a reader different stories.
- `Edge AI / Hailo model deployment` — **answered in full** (Rahul, 2026-09-07,
  extended 2026-09-14): the Hailo repository trains **YOLO26 through transfer
  learning**, reshapes its architecture with the **Hailo Dataflow Compiler**, and
  runs document detection on a **Hailo-8L rated 13 TOPS at 1.5 W** to speed up
  large-batch scanning. All of that is now in `hailo.main` and on the site card;
  the entry used to name no model, no toolchain, no part and no figure.
  `autonomous robotics (sensor integration)` is still a skills-line entry with no
  project or outcome behind it.

## 7. Work on the site with no résumé entry at all

`waaah-comics` — **answered**: now the `waaah` résumé project.

Still unused by any résumé: `kalidokit-fork` (MediaPipe/TensorFlow.js kinematics),
`crawl4ai-deepseek-example`, `geometry`, `information-lab`, `kaogenie`.

**Question:** should any of these become selectable résumé project entries too?

## 9. Projects Rahul has blocked from résumés — 2026-09-07, extended 2026-09-14 and 2026-11

`asyncddgs`, `portfolio`, `utopia`, `flowshop`, `ie2110`, and as of the VMock
alignment pass `arcane` and `ethoslens`, carry a `blocked`
reason in `projects.json`. Blocking `arcane` and `ethoslens` cost two project
entries on `cyber-security` and `general`; both configs were edited in the same
change, because `build_resumes.py` raises rather than skipping a blocked
selection. Their site cards are untouched — `blocked` withholds a résumé entry,
never a fact. They are withheld from `list_resume_blocks` and refused
by both renderers, so neither an agent nor a canonical config can put them on a
document. Do not "helpfully" restore one; ask Rahul first.

Blocking `flowshop` cost nothing: the same SimPy digital twin and CP-SAT
optimizer is already an Abbott internship bullet (`abbott-intern.digital-twin`), so
the operations-research résumé had been carrying that work twice. It now appears
once, as experience, which is the stronger placement.

**2026-11 master CV pass.** Rahul blocked `onthespectrum`, `agewelllah` and
`smartexam` on the same reasoning as `flowshop`: work experience now carries the
evidence they were there to supply. MCP servers ship as `abbott-contract.harness`;
the RAG and vector-search work as `abbott-contract.platform`. That took the usable
pool from eight projects to five — `hailo`, `voltpulse`, `waaah`, `maritime`,
`brinhack` (six since `swarmline` joined on 2026-09-29, §14) — and cost a project
entry on five configs, all edited in the same
change for the reason above. `solution-architect` and
`civic-tech-solution-architect` were each left with one project, and Rahul chose to
spend the freed room on People's Association rather than backfill a project:
"experience outweighs projects in résumé screenings". They swap rather than add,
because a one-page spec still caps an entry at four bullets.

Of the three, only `on-the-spectrum` is a spotlight project, so it is the only one
that also leaves `article_digest_md` and `proof_points`. All three keep their site
cards and stay open on `list_projects`, `get_project` and `/api/portfolio`.

`ethoslens`'s block reason originally turned on AgeWellLah also being on the page.
It was reworded, not lifted, when AgeWellLah was blocked.

### Why `pa.infra` says "8 services" and lists seven items

The sentence reads "across 8 services: ECS Fargate, Multi-AZ RDS Postgres with
PostGIS, ALB fronted by WAFv2, Route 53, ACM, KMS, and Secrets Manager." Counting
the commas gives seven. The count is of AWS **service names**, and there are eight:
WAFv2 is the eighth, inside "ALB fronted by WAFv2". PostGIS is a Postgres
extension, not an AWS service, so it does not count. Rahul confirmed the wording on
2026-11 and it ships verbatim. **Do not "fix" it to seven.** Every other counted
bullet in the pool does match its own list length, so this one looks like a typo
and is not.

## 8. Where the `pa.infra` bullet goes — answered

Rahul: a project may be dropped to make room. On `solution-architect` the AWS
deployment bullet replaced OnTheSpectrum, the only one of its three projects not
listed as solution-architecture proof in `coreCompetencies`. On
`civic-tech-solution-architect` it replaced EthosLens, the least civic-service of
its three beside HDB energy and elderly care. All three People's Association
bullets were kept, and both résumés fit at the default 10.5pt again.

The bullet stays selectable everywhere else, and `tests/resume-render.test.ts`
now asserts that every pool bullet and skills line is offered through
`list_resume_blocks`, so nothing can be hidden from a model building a résumé.

---

## 12. Coursework and the RL line - 2026-09-08

**Answered (Rahul, in conversation):** Simulation, **Stochastic Processes**,
**Statistics for Engineering Applications** and **Computer Graphics** are courses
he has taken. Stochastic Processes and Computer Graphics were attested nowhere in
the repo before this; they are now in the `nus.coursework-full` block, which no
canonical résumé selects yet.

**Also on his instruction:** the CS4277 syllabus no longer appears in the
education section at all. The award block covers the award; the topics moved to
the `cv-skills` line under Technical, where a course syllabus reads as a skill
rather than as a description of a certificate.

**Still a gap, and worth saying plainly.** He asked for the reinforcement-learning
algorithms under Technical, and `ai-skills-rl` now carries "deep RL (PPO, A2C,
DDPG, DQN)". That is the same claim `gen-ai` has always made, so it is not new
here, but §1 still stands: the only evidence in this repo is the Packt
certification. A Technical line sits beside applied skills and will read as
applied experience. If there is real RL work behind it, it belongs in §1 as a
bullet; if there is not, the certification line is the honest place for it.

**Decided (Rahul, 2026-09-08, edition 2026-10):** `ai-engineer` now selects
`ai-skills-rl`, so the RL algorithms ship on that résumé under Technical. §1 is
unchanged by that decision and is still the open gap: the claim rests on the Packt
certification alone. Recorded here so the decision is written down rather than
inferred from a config diff.

The CS4277 syllabus reaches `ai-engineer` through the Technical line rather than
a row of its own: `ai-skills-rl` now carries projective geometry, camera models,
fundamental and essential matrices, epipolar geometry, absolute pose estimation,
three-view geometry, structure-from-motion (SfM) with bundle adjustment, two- and
multi-view stereo and generalized cameras. Every term came from `cv-skills`;
PyTorch, ONNX and CUDA were not repeated because the line already held them.

A separate row was tried first and rejected on sight: it would have printed two
lines both labelled "Technical", a first for these documents, and nothing would
have caught it (`checkResume` never sees skills items, `checkPool` never reads
`skills.json`, R6 `duplicate-label-line` inspects bullets only). `cv-skills`
stays in the pool for custom builds, keeping the "3D Vision" label so that a
build selecting it beside a Technical line does not hit the same collision. No
canonical résumé selects it.

## 11. Volt Pulse: both settled - 2026-09-08

**Answered (Rahul, in conversation):** the **scheduler-agent planning shipped**; it
was not a roadmap. `projects.json` says "scheduler-agent planning", the event
record in `portfolioData.ts` says "a scheduler-agent roadmap", and the npcDialogue
says "a plan for scheduler agents". The bullet is right and the other two should
be brought into line the next time that record is touched.

**Settled (Rahul, 2026-09-08, edition 2026-10):** "Built" is correct. The `deep`
variant's "Co-built" was the error and now reads "Built", so the two agree. No
shipped document moved on this alone: `build_resumes.py` resolves
`text.get(slug, text["default"])` and never reads `deep`, and `checkPool` filters
to `variant === 'default'`, so neither the digests nor the pool metrics could see
it. `leadLemma` strips a leading `co-`, so the checker never reported the
disagreement and still cannot; this one was found by reading, not by a rule.

## 10. What the checker cannot judge

`npm run resume:lint` and the `check_resume` MCP tool are rule-based. They can
see that a bullet carries no measurement; they cannot see whether one exists.

So an `unquantified` finding is a question for this file, not a licence to
answer it. If the lint says a bullet has no measurable outcome and no number for
it is written down anywhere in the repo, that is a gap to record here and ask
Rahul about - exactly like every other entry above. It is never a reason to
estimate, round, or infer one from context.

The same holds for the repetition findings. The checker knows that seven of ten
project bullets open with "Built"; it does not know which of them could honestly
open another way. Only Rahul does.

## Standing prohibitions

`PRODUCT.md` is binding regardless of anything above:

> Do not fabricate experience, metrics, employers, qualifications, project
> outcomes, or robotics/SLAM/Gaussian-splatting work.

No evidence supports claiming professional SLAM, localization, Gaussian splatting,
or probabilistic robotics delivery. The unpublished OpenCV/SLAM study mentioned in
the README stays out of résumés.

## 13. Answered by the VMock alignment pass — 2026-09-14

Three more facts Rahul supplied while working the SMART Editor, now recorded in
the pools and on the site rather than living only in that conversation:

- **OnTheSpectrum** is a **game of AI-driven infinite levels**, built in **7 hours**
  at **AI Engineer Hackathon 2026**. The entry used to describe only the
  Blender-to-Three.js toolchain, which is the least interesting sentence about it.
- **Churp** kept garden-plot balloting fair for **150 residents signed up at
  release**. Worth flagging honestly: that is a launch-traction number doing duty
  as a fairness metric. If the platform runs a real cycle, the applicant or plot
  count is the better figure and should replace it.
- **SmartExam** turns a student's **own notes** into **adaptive-difficulty** papers,
  replacing **hundreds of dollars of past-year paper purchases**.

Also recorded: `+65 8515 5413` is now the first item of the résumé contact line,
replacing `Singapore`. It is deliberately **not** on the site, in the snapshot, or
in `/api/portfolio` — `server/jobSearch.mjs` still names `candidate.phone` as a
gap, which stays correct for every consumer except the résumé header itself.

## 14. Swarmline, Singapore Defense Tech Hackathon 2026 — answered 2026-09-29, corrected 2026-10-02

**Supplied by Rahul:** his LinkedIn post (finalist; "out of 1,000+ applicants, we
made it to the finals as one of just 17 teams in our track"; presented to the
Chief Defence Scientist; teammates Zulfaqar Hafez, Kevan Soon, Jeric Toh and Guo
Anxiang; demo at `https://lnkd.in/g9SNkSVS`) and the OPFORGE repository, which is
the Swarmline codebase. Now the selectable `swarmline` project block (placement
below), a project card, an event note and a Proof row on the site.

**Corrected by Rahul, 2026-10-02**, in his master CV (the ground truth for
`general`). He was **team lead**: the header reads `Team Lead & Finalist,
Swarmline: SG Defense Tech Hackathon (1,300+ applicants)`. The entry carries two
bullets in his words, replacing the single bullet written on 2026-09-29:

- `swarmline.coordination`: "Directed a 5-person team to architect decentralised
  drone-swarm coordination on correlated random-walk search, gradient-flow
  dispersion, delay-tolerant gossip, cross-inhibition consensus, and
  response-threshold task allocation."
- `swarmline.main`: "Implemented a deterministic Unreal Engine 5.8 C++ simulation
  with Claude Code; under a ground-link jam, 30 drones confirmed all 8 walking
  targets in 10 of 10 seeded runs, against 2.1 for an operator-run fleet."

Both ship verbatim. The semicolon in `swarmline.main` is what VMock's
one-sentence rule flags (`docs/vmock-house-style.md`). The repo checker has no
such rule, and his wording stands. **1,300+ applicants** supersedes the post's
"1,000+" everywhere. The site's "one member of a five-person team" now says team
lead, and its rule names follow his: "gradient-flow dispersion",
"response-threshold task allocation".

Every simulation figure comes from OPFORGE `docs/SDTH-2026/evidence/opf0067_comparison_metrics.md`:
Swarm Field A, 30 simulated drones, 8 walking targets, ground link jammed at 15 s,
10 seeds. Swarmline confirmed 8 of 8 in 10 of 10 runs (105.0 s on average); the
operator-in-the-loop baseline confirmed 2.1 and had 29 of its 30 drones landed by
41.2 s. The ownership wording follows OPFORGE's own record: Rahul opened SWARMLINE,
chose the algorithms and the in-engine design, and the core (OPF-0049..0059) was
written by Claude Code agents in his sessions, one authoring and a second reviewing
and gating (`IMPLEMENTATION_PLAN.md`); he designed the moving-target capture rule and
built the jammed-link comparison (OPF-0067) that produced those numbers.

**Deliberately not claimed**, each for a reason recorded in OPFORGE:

- "Faster" than anything. With the link up, a 5 s operator finishes in 60.8 s and
  a perfect-link planner in 28.7 s; the claim is survival under a jam, not speed.
- Intercepting, engaging or firing. No swarm drone carries an effector: the swarm
  finds and confirms. "Interceptor" names the challenge and the platform only.
- Real aircraft. It is a simulation (`README.md`: "a proof of concept for the
  algorithm, not a claim about real aircraft").
- A 48-hour build. The core was committed on 2026-09-19..20, before the 25-27 Sep
  event.
- Teammates' work: the Marina Barrage, Legoland and courtyard fields are
  Zulfaqar's (OPF-0039); Marina Bay Sands (OPF-0068/0069), the nest demo, the
  walking-target puppet, the capture ring and the strike handoff are Kevan's
  (OPF-0061..0071). Kevan also implemented the capture rule Rahul designed.
- A prize. The post claims finalist only.

**Still open:**

- **"One of just 17 teams in our track."** Either 17 finalist teams, or 17 teams in
  the track overall; and "track" may mean the 2-day format or Challenge 03. The
  organisers' deck counts 34 two-day teams and plans 20 finalists from 40, which
  fits the first reading, but nothing here says "17" until Rahul confirms it: not
  the résumé, and not the site, whose event note stops at "out of 1,300+
  applicants".
- Whether Rahul spoke in the final pitch. The post says "we", so everything says
  the team presented.

**Spelling — decided by Rahul, 2026-09-30:** the organisers' "Defense". The event
is "Singapore Defense Tech Hackathon" everywhere, the résumé header included, and
the category and tags say "Defense Tech", as do the organisers' own names
(European Defense Tech Hub, NUS Defense Tech Venture Lab). MINDEF's title keeps
MINDEF's spelling: Chief Defence Scientist. The VMock screener leans British on
every pair tested (`docs/vmock-house-style.md`), but this is a proper noun, which
that record says costs nothing, and it sits in an entry header, which the P5
house-style pass does not read. **Reaffirmed 2026-10-02:** his master CV wrote
"SG Defence Tech Hackathon"; asked, he kept "Defense" everywhere, so the résumé
header reads "SG Defense Tech Hackathon".

**Reversed 2026-11:** the Nov 2026 master CV and its sync spec spell it "SG
Defence Tech Hackathon", British throughout, so the résumé header, the site's
event, achievement and project text, and the assistant's fallback say "Defence"
now. The organisers' own names keep their spelling (European Defense Tech Hub,
NUS Defense Tech Venture Lab), as do the stable event id
`singapore-defense-tech-hackathon-2026` and the highlights résumé's matching
keyword "Defense Tech", which a posting written in US English still has to hit.

**Fit (2026-10-02).** `general` follows the master CV again. The coursework line
and `ywh.network`, which came off on 2026-09-29 (rungs 1 and 2), are back, and with
Swarmline's second bullet it fits two pages at 9pt (down from 9.5). The Harvard
deep build still fits two pages, because its first rung is the spec's own
typography and `general` now declares 9pt. Swarmline also went onto six
one-pagers, each paid for down the trim ladder. Volt Pulse stays on all eight
(Rahul's standing instruction in `server/resumeGuide.mjs`):

| résumé | Swarmline | room made by | body |
|---|---|---|---|
| general | both | nothing (master CV) | 9pt |
| highlights | `main` | `abbott-intern.apc` | 9pt |
| software-engineer | both | Waaah Comics | 9pt |
| operations-research-engineer | both | nothing; it fitted | 9pt |
| solution-architect | both | `nus.coursework` | 9.5pt |
| ai-engineer | `coordination` | `nus.coursework` | 9.5pt |
| cyber-security | `main` | `abbott-intern.digital-twin` | 9pt (from 9.5) |
| civic-tech-solution-architect | none: the work is defense, not civic | — | 10pt |

`nus.coursework` carries an `ai-engineer` override that no longer ships. It stays
in the pool for builds that put the line back. Neither Swarmline bullet has a
`deep` variant: the two bullets are the whole of what Rahul supplied.

**PDFs.** Re-exported through Word (`export-pdf.ps1`) on 2026-10-02, which settled
the LibreOffice-only export of 2026-09-29. Page 1 of `general` ends on
`swarmline.coordination` and page 2 opens with `swarmline.main`, the same break
Rahul's own PDF makes.

## 15. AI tools on the skills lines — answered 2026-09-29

**Rahul's instruction:** add Claude, ChatGPT, Gemini, ComfyUI "etc." to the skill
sets, because résumé filters look for experience with these tools. What backs each
one in this repo or OPFORGE:

- **Claude Code**: both repositories are built with it (this `CLAUDE.md`;
  OPFORGE's integrator sessions and commit trailers), and it names the Swarmline
  bullet's method. Written "Claude Code" rather than "Claude" because that is the
  tool; an ATS token search for "Claude" matches it, and "Claude" is on
  ai-engineer's keyword row so that `build_tailored_resume`, which matches whole
  terms, attests it too.
- **Codex**: OnTheSpectrum (blocked, but a fact), OPFORGE's cross-vendor reviews
  and authoring, and already on the `gen-cloud` line.
- **Gemini**: Waaah Comics (Gemini 2.0 Flash). This site's assistant calls the
  Gemini API through the Google GenAI SDK (`server/pageAgent.mjs`), but its
  default model is Gemma, so it is not evidence of Gemini the model.
- **ComfyUI**: this repository's own media pipeline (`scripts/comfyui/`,
  `workflows/comfyui/`, `npm run comfy:*`). OPFORGE records that it was
  deliberately NOT used for Swarmline, so nothing ties the two.
- **ChatGPT**: Rahul's own statement; OPFORGE also records Codex run on a ChatGPT
  account.

All five went onto every canonical résumé's technical line except
`cyber-security`, which takes Claude Code, ChatGPT, Gemini and ComfyUI on its last
line with no reflow and leaves out only Codex: that one would wrap into a line the
page cannot take, since it ends about 5pt above its margin. `gen-ai` omits Codex
because `gen-cloud` already carries it. Four lines group the tools as "AI tools
(...)", since a colon sub-label would glue its first item into a junk term, and
`skillTerms` leaves the label itself out (`GROUP_LABELS` in
`server/portfolioMcp.mjs`): it is printed on four of the six role résumés and not
on ai-engineer's, and as a term it routed AI-engineer postings elsewhere.

**Listed and demonstrated.** Two tools appear twice on one page, once as a skill
and once as evidence. "Claude Code" appears on every résumé that carries
`swarmline.main` (general, highlights, software-engineer,
operations-research-engineer, solution-architect, cyber-security), on the skills
line and in that bullet. "Gemini" appears on `general`, the one résumé still
carrying the Waaah Comics bullet ("Gemini 2.0 Flash"). ai-engineer carries
`swarmline.coordination`, which names no tool. That is the one kind of repeat kept
on purpose. On 2026-10-02 Rahul kept the AI tools on the skills lines, though his
own master CV leaves them out.

**Not added:** GitHub Copilot (OPFORGE shows it only in Zulfaqar's lane) and
ElevenLabs (attested in OPFORGE's Swarmline pitch video, but not asked for; add it
if Rahul wants it). Unreal Engine is named only in the Swarmline bullet; putting it
on a skills line or a keyword row is Rahul's call.

## 16. The Nov 2026 master CV sync, 2026-11-01

Rahul's VMock master CV became the source of wording, synced block by block from
`portfolio-mcp-update-spec.md`, with the CV winning on wording and dates. What it
settled, and what it left open:

- **Structure.** General now prints SUMMARY (profile.json's paragraph, CV-only),
  EDUCATION, WORK EXPERIENCE, RESEARCH EXPERIENCE (A*STAR ARTC, BlendED x Amazon
  Robotics), PROJECTS (one bullet each, `render: "cv-inline"`), CO-CURRICULAR
  ACTIVITIES AND VOLUNTEER EXPERIENCES (YesWeHack's condensed bullet, NTUC),
  NATIONAL SERVICE and SKILLS AND CERTIFICATIONS. The role résumés carry the
  research and national-service sections too.
- **Abbott.** The contract reads *Global Operational AI Systems & Data Engineer
  (Part-Time), Abbott Laboratories (Contract)*, as the CV prints it, and opens on
  two impact bullets (`fault-detection`, `decision-metrics`). The internship is
  *Abbott Laboratories (Converted to Contract)* and sits under the contract on
  general (`after`). NDA: "5+ plants worldwide", nothing more. *(Superseded
  2026-11-08, §18: the title, the bullets and the plant count all changed.)*
- **People's Association.** Seven bullets became five on the CV: `infra` now
  carries the CI/CD that was `cicd`, and `survey` the balloting rules that were
  `rules`; both retired ids are gone from the pool.
- **A*STAR ARTC.** Incoming, Jan 2027 to May 2027. The CV leaves the date field
  empty (VMock cannot hold 2027) and general prints its heading undated
  (`date: false`), since the bullet says when; the entry keeps its dates.
- **Facts corrected in deep variants** to agree with the new defaults: churp's
  status (live in Tengah, national rollout planned), infra's service count (10,
  with the Rust auth gateway), BrainHack (top 25% of 400+ teams), the Navy's
  food-waste figure (a month-long manual analysis of 6 months of data) and
  setpoint's "global plants'".
- **Settled the same day:** Dan Shao may be named on any document, so `brief`
  needs no phrasing outside the CV; and the Packt (RL) and Intellezy (Excel)
  courses come off `certs-core` and `certs-or` as they came off the CV, leaving
  NVIDIA alone on every certification line but `certs-cyber`. The site's
  certificate register still lists them; withholding a line is not withholding a
  certificate. Volt Pulse's deep variant keeps its whole closing clause ("placing
  top 8 of 50+ teams at SMU Hack For Cities 2026"): Rahul wants the event named.
- **Still open** (spec §9 and §10, not pre-empted): the STMicro title and
  "Global", the ARTC designation, Abbott's detail clearance, the unbacked skills,
  the counted-list bullets and a fault-type count for `fault-detection`.

## 17. The master CV update, 2026-11-02

Rahul updated the master CV a day after §16. Its text, diffed against the
shipped general, changed in one entry; the rest of the update is layout and a
standing rule.

- **Same-company entries sit together, whatever their dates** (Rahul's rule).
  The date sort runs first and each company's entries are then pulled up under
  its first-sorted one, so the Abbott internship prints under the Abbott
  contract it became, above People's Association, on every résumé. Six role
  résumés had printed PA between the two Abbott roles; general got it right
  only through a per-selection `after` key, now retired. A company is the
  organization without trailing parentheticals; over today's pools that merges
  only the two Abbott entries. `verify_resumes.py` fails a DOCX that splits one.
- **A*STAR.** The heading is now *Research Intern, Digital Supply Chain Group
  (Incoming), A\*STAR* with its dates (Jan 2027 – May 2027), and the bullet
  drops "(Jan to May 2027, 2 days/week)". That settles §16's open "ARTC
  designation": A\*STAR in the heading, ARTC named in the bullet. Rahul chose to
  carry it onto the site and the MCP too, so the experience record, its
  responsibilities and the snapshot say the same. "2 days/week" is no longer
  stated anywhere; it was a fact, so restoring it is a rephrasing, not a new
  claim.
- **Margins.** The CV is 0.5" on all four sides (it had 0.667" top and bottom),
  and Rahul had nus_style adopt it; the page stays A4. The extra 0.33" moved one
  pin: operations-research-engineer 8.5 → 9pt. ai-engineer and cyber-security
  would fit 9.5 but STMicro's heading then runs into its date (the fit model
  does not measure headings; verify now does), and civic and solution-architect
  are still held at 9 by `pa.infra`'s four lines. General stays at 8.5, the
  CV's own size, though 9 would fit two pages.

## 18. The master CV update, 2026-11-08

Rahul updated the master CV again (VMock copy, US Letter, 8.5pt). Diffed against
the shipped general, it rewrote two entries, the summary and two skills lines;
education, BlendED, the projects, the bug bounty, national service and the other
skills lines are word for word what shipped. Rebuilt in place as edition 2026-12,
through LibreOffice again (no Word on this machine).

- **Abbott contract.** The title is *Global Data Engineer (Operational AI
  Systems), Part-Time*, and five present-tense bullets became the CV's seven, in
  the past tense: ADAM (an offline tool-calling assistant on Gemma 4 E4B, 6
  dryers across 4 global sites), the APC conversion (7 steady-state gain models
  as HiGHS LPs and SLSQP tracking QPs, 5 modes), lexicographic constraint
  relaxation, validation against live APC setpoints (83% move direction, 0.12 °C
  over 24 readings), Seeq qualification with schema-constrained tool calls, the
  Seeq toolkit with the handbook RAG pipeline, and parity tests. Each landed on
  the id it descends from, so selections and builder links still resolve:
  `fault-detection` is ADAM, `setpoint`, `guardrails`, `platform` and `harness`
  carry their successors, and `relaxation` and `validation` are new.
- **Retired everywhere, at Rahul's choice:** the fault-detection framing and its
  "within an hour" diagnosis, "5+ plants worldwide", NPI and planned-stoppage
  metrics, the response surface model and "24/7". `decision-metrics` is gone from
  the pool (a builder link naming it now fails, as `cicd` and `rules` did), and
  the site's contract record says the CV's numbers instead. The CV now names the
  site and dryer counts itself, so they replace §16's NDA line.
- **Off the CV, kept:** `ai-systems`, `supply-chain`, `datalayer` and
  `hardening` are still true, so they stay selectable, now in the past tense so
  the entry reads in one. `setpoint`'s and `platform`'s deep variants were edited
  to the new structure using only facts already attested in the old deep
  variants (scipy linprog, the PLC predictor, trust-region warnings, marker,
  chonkie, bge-small, fastembed, ruptures, STUMPY); `platform`'s `build-first`
  phrasing went with the sentence it restated.
- **People's Association.** The title, *Software Engineer (Full Stack & Cloud),
  People's Association (Pro bono)*, one title everywhere, landed on 2026-11-05
  with the ids this sync keeps (`churp`, the new `stack`, and `sparks` holding the
  coordination sentence). The CV words two of them afresh, and the pool now takes
  them: `churp` is "Recruited into PA's Sparks Citizens Developer network as a
  community innovator in recognition of prior public-good initiatives, then
  designed, built, and deployed Churp, … seeded by a S$20K Sparks Community
  Innovation Fund award" (it read "Volunteered through PA's Sparks Citizen
  Developer programme … Project funded by a S$20K …"), and `stack` opens
  "Owned most" for "Led most". The site's PA summary keeps the 5 Nov wording,
  which the CV does not contradict. "Citizens Developer" is the CV's spelling.
- **NTUC** reads "check on residents' wellbeing" for "check health"; its
  `activities-first` phrasing said "healthcare", which the CV stepped back from,
  so it was dropped.
- **Skills.** The AI/ML line adds schema-constrained tool calling, local LLM
  serving (llama.cpp, Gemma) and Seeq time-series analysis; the Sim/OR line says
  HiGHS linear programming and SLSQP quadratic programming (HiGHS never solved
  the QPs), plus constraint relaxation and shadow prices. `or-skills` and
  `gen-or` carried the same HiGHS claim and were corrected with it.
- **A\*STAR** stays *Jan 2027 – May 2027* with no parenthetical. The CV now dates
  it "Jan 2026 – May 2026" and puts "(Jan to May 2027, 2 days/week)" back in the
  bullet; that is the VMock workaround (it cannot hold a 2027 date), not a fact.
- **Expected start date** (Rahul, the same day): every résumé prints a bold
  *Expected Start Date: July 2027* at the top. In nus it closes the contact line,
  which has the room because the portfolio and GitHub links now print as
  "Portfolio" and "GitHub" (488pt of the 523pt line at 8.5pt; the URLs are
  unchanged and still live). Harvard's 9.5pt Times line has no room, so there it
  is a centered line of its own. Custom builds and `get_resume`'s Markdown carry
  it too, and `get_profile` reports it as `availability`.
- **Fit.** Every résumé keeps its size; operations-research-engineer stays at
  9pt without the coursework line the 5 Nov change trimmed. Under LibreOffice it
  ends 3.7pt above its margin and software-engineer 7.9pt, both within a line, so
  re-export both through Word before an employer sees them. General still holds
  two pages at 8.5pt, but its deep build now runs to three in nus, which the
  renderer reports rather than hides.

## 19. Length tiers, and the master CV of 8 Nov 18:31

Rahul sent three files that evening: `portfolio-mcp-upgrades.md` (eight upgrades
and five acceptance checks), `master-cv-improvements.md` (standard and short
drafts, bullet order, dependencies) and a master CV that applies most of those
drafts. Decided with him:

- **The CV's sentences are `full`**, the tier `general` prints, because general
  has to print the master CV. The old long wording is **retired** everywhere
  (pool, site, MCP), not kept as `deep`, despite the improvements doc's "nothing
  is thrown away": the 5 APC modes, the tag-mapping bug, the two QP defects
  named, "rollout to Abbott servers scheduled", "Recruited into PA's Sparks
  Citizens Developer network...", the SR model's 3 scales / 2 datasets / 2
  losses, and the Theory skills line. Existing `deep` texts stay. Three phrasings
  stopped attesting against the shorter sentences and went:
  `pa.singpass@fairness-first`, `voltpulse.main@loop-first`,
  `hailo.main@target-first` (the last two are the CV's own wording now).
- **Budgets at nus 10pt, 0.5in**: `short` 1 line, `standard` 2. At 10pt, 15 of
  the CV's 37 sentences run past 2 lines; the doc's drafts cover 9 of them as
  `standard`, and 7 bullets get a `short`. Each draft opens with the CV's newer
  lead verb where the CV changed one (Rahul's choice), except `platform`'s
  standard, which keeps the doc's "Built": with "Implemented" it measures 3
  lines. The ADAM standard says "APC specialists" where the CV's full sentence
  says "process-control specialists"; the entry's APC bullet attests it.
- **Still missing a 2-line wording**: `swarmline.main`, `swarmline.coordination`
  and `ntuc.main`. `tierFallbacks` names them on every résumé that selects one,
  and a test pins that list. (The plan named five; `voltpulse.main` and
  `maritime.main` had been measured with their project labels attached and fit
  on their own.)
- **Ranks** follow the doc's bullet order on Abbott (both roles), PA, STMicro and
  Amazon; **requires** follow Upgrade 5.
- **`amazon-vision.isp` is retired** from the pool (Rahul's choice: vaguer than the
  CV's research bullets and claiming more than they support); its résumés take
  `sr-reproduction`. ai-engineer, software-engineer and highlights trade the Seeq
  toolkit for the APC rebuild and its verification; cyber-security adds ADAM so
  `guardrails` is not orphaned. `swarmline.main` gains a `no-ai-tool` phrasing.
- **A*STAR** keeps its sentence and 2027 dates; the CV's "Jan to May 2027 (2
  days/week)" sentence is the VMock workaround again.
- **The Abbott role** stays "Global Operational AI Systems & Data Engineer
  (Part-Time)" at Rahul's request; the CV prints "Global Data Engineer
  (Operational AI Systems), Part-Time".

**Acceptance checks.** (1) Holds: renaming `default` to `full` left all eight
DOCX files' `word/document.xml` byte-identical. (2) Not met, for a reason outside
the tiers: entry headings cap every one-pager at 9pt (STMicro's runs into its date
at 9.5pt, both Abbott headings at 10pt), so all seven print `standard` at 9pt,
software-engineer and highlights up from 8.5. Reaching 10pt needs shorter titles
or a style change. (3) Holds: no `tier-over-budget` or `orphaned-bullet` on any
slug. (4) Holds where it can: highlights carries an outcome on every experience
and research entry that has one to give (STMicro, at design stage, has none
anywhere); `sr-reproduction` is pinned at standard there because its short drops
the 0.78 dB. (5) Not met until Rahul supplies the three standard wordings above.
R11 `no-outcome-entry` still warns on six one-pagers (the Abbott contract without
its 83% verification, or the internship without its zero-failure pipeline):
advisory, and a selection choice for Rahul.

## 20. Word on the build machine, and the builder laid out as Word lays out, 2026-11-13

Microsoft Word was installed on the build machine. Two things followed.

**The canonical PDFs.** Edition 2026-12's eight PDFs, exported through
LibreOffice on 11-08 (that machine had no Word), were re-exported in place
through Word (`export-pdf.ps1`). The DOCX files, content and URLs are unchanged.
Word gives the same page counts (seven at 1, general at 2), draws the section
rule natively, and `verify_resumes.py` passes. `export-pdf.ps1` now prints each
document's page count, and its `-UseLibreOffice` switch runs
`export_pdf_libreoffice.py` instead of a bare `soffice`, which drew the rule
upside down. `verify_resumes.py` gained `SPLIT_DATE`: a heading date broken
across two lines, Word's other failure beside the glued date `GLUED_DATE`
catches.

**The builder.** A tailored link Rahul shared showed the custom builder
(`api/resume`) printing STMicro's and both Abbott headings over their dates. The
cause: its fit counted pages only and landed at 10.5pt. Of the eight canonical
configs, auto-fitted, seven collided the same way: civic at 10.5pt; ai-engineer,
solution-architect and OR at 10pt; software-engineer, cyber-security and
highlights at 9.5pt. In Word, that link's DOCX ran to 2 pages, because Word split
each long heading's date across lines. What changed:

- **Headings.** `headingLayout` wraps a heading before its date when the date plus
  a space would not fit beside it; the DOCX carries the same split. The fit ladder
  skips any rung where a heading wraps, so every auto-fit lands at 9pt, like the
  canonical one-pagers, with no short-wording swaps needed. A wrap prints only
  when even the floor cannot hold a heading or autoFit is off, and
  `fit.wrappedHeadings` names it. A spec's own `bodyPt` starts the ladder and the
  ladder only steps down.
- **Measuring.** Compared line by line with Word's export of the eight canonical
  résumés, the builder's line ends differed in 18 places. pdfkit kerns its widths
  and Word does not, and Word breaks after a hyphen where the builder never did.
  With unkerned widths and hyphen breaks, all 467 lines matched.
- **Pagination.** Neither builder sets widow control, so Word breaks a paragraph
  between any two lines; the builder had moved whole paragraphs. Blank lines are
  no longer kept with the next paragraph (Word leaves one at a page foot).
- **Smaller fixes.** The nus rule drops the 1pt gap harvard's border needs and
  runs 1.44pt past each margin, as Word draws it. The DOCX date uses a real
  `<w:tab/>`. Markdown no longer prints ",  ·" for projects, which have no
  location.

`npm run resume:word-parity` (Windows with Word) is the end-to-end check. It
renders 19 specs: the eight configs as shipped and auto-fitted, the tailored link,
ai-engineer at a fixed 10.5pt, and general at deep detail on 3 pages. It opens
each DOCX in Word and compares every paragraph's line count and starting page:
1,460 lines, identical. Harvard is left out: an ai-engineer build matched, but its
overflowing general build drifts by part of a line over a page. Harvard ships
nothing.

**Tier budgets.** Measured as Word measures, three texts gain a line at the 10pt
reference: `stmicro-or.layout-agnostic`'s short, and the full wordings of
`abbott-contract.hardening` and `amazon-vision.brief`. Word confirms all three.
The STMicro short would break its 1-line budget, but no auto-fitted build can
print STMicro above 9pt, because its heading forces the step down. Rahul's call:
"Ensure the sizing does not cause the overflow." So an entry's bullets are
budgeted at the largest rung its heading holds its dates at (`referenceBodyPt`):
STMicro 9pt, both Abbott entries 9.5pt, everything else 10pt. The wording stands,
and no pinned count moved. The one-pagers' foot-of-page whitespace at 9pt stays
for now (Rahul, same day); 9.5pt needs a shorter STMicro heading.

## 21. The BlendED evaluation and recommendation, 2026-11-14

BlendED issued a Demonstrated Capability Report for the Amazon Robotics computer
vision project (Image Enhancement track), with project lead Dan Shao's
recommendation letter of 13 Nov 2026. It records 100/100 at the top tier (Level 4,
System-Level Insight), credits Rahul with leading "much of the team's research into
state-of-the-art super-resolution methods", and calls him "one of the biggest
contributors to the project". It ships at
`public/certificates/blended-amazon-robotics-pbl-evaluation-2026.pdf` and is linked
from the Proof window.

- **Mentor title.** The letter gives her title as VP of Computer Vision, Machine
  Learning and AI at ZELIG. `amazon-vision.brief` now reads "mentored by Dan Shao,
  VP of Computer Vision, ML and AI at Zelig" (it was "Zelig CTO Dan Shao
  (ex-iRobot)"), so the CV and the letter agree when they are read side by side.
- **Recognition bullet.** `amazon-vision.recognition` (rank 6, requires
  `sr-reproduction`). Every tier is worded from the letter only. Rahul asked for it
  to stay modest: no score and no "top tier" on a résumé; the score belongs to the
  portfolio. The seven one-pagers print its 1-line `short` and general prints
  `full`. Following résumé convention, the recommendation itself is never quoted
  and never offered on the page.
- **Not changed (Rahul's call).** The letter describes an 8-week online program of
  48 research hours, with tracks in stereo vision, image enhancement and human
  posture detection. The entry keeps Jul 2026 – Oct 2026 and its "3 workstreams
  (camera ISP, super-resolution, image restoration)": the extra months were the
  deployment work, and the workstreams were the sub-areas of his track.
