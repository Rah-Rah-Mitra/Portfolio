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
  infrastructure, Fargate services, Route 53 DNS, Redis caching, Kafka messaging, and
  the cloud security work that went with it. Added as the selectable `pa.infra` bullet,
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
DQN)") and `portfolioData.ts` (a skill chip). The only backing evidence is a Packt
certification, described as covering "reinforcement learning theory and Python
implementation projects".

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

## 2. Amazon — no detail exists beyond the two current bullets

The site's experience record for the Amazon role is **word-for-word identical** to
the résumé bullets. Every other employer has richer prose somewhere; this one has
none, so no deep variant could be written for it.

**Questions:** what did the ISP enhancement, super-resolution and image restoration
work actually involve — architectures, datasets, evaluation metrics, deployment
target? What can be said publicly without breaching confidentiality?

## 3. STMicroelectronics — ongoing, so no outcome yet

The put-away recommendation bullet describes intent ("targets replacing
experience-based slotting"). There is no measured result yet. Worth revisiting once
the System Design Project produces one.

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

- Terraform, Redis and Kafka are attested through the Churp deployment.
- **PyTorch, ONNX, Chroma, SciPy, pandas and quantization** are attested through
  the Abbott contract work (§4), along with HiGHS, Seeq, STUMPY and ruptures.
- **3D computer vision: settled.** Rahul confirmed (2026-09-04) that the CV
  entries already in the skills lines are correct as written — projective and
  epipolar geometry, absolute pose, SfM, bundle adjustment, multi-view stereo,
  from CS4277, alongside camera ISP, super-resolution and image restoration from
  the Amazon role. **He did not claim RANSAC, PnP, SIFT or ORB**, and they appear
  nowhere in the recorded syllabus, so they stay off the list below only as
  unclaimed — do not add them.

Still absent from every content source, and therefore still unusable:

TensorFlow (except a passing reference to TensorFlow.js in a fork), Hugging Face,
scikit-learn, Keras, NumPy, RANSAC, PnP, SIFT, ORB, Gurobi, Pyomo, Kubernetes,
PostgreSQL, MongoDB, Pinecone, FAISS, pgvector, Weights & Biases, MLflow,
TensorRT, distillation, Optuna.

**Question (still open):** which of the remaining names have you actually used,
and on what?

## 6. Attested but unconnected to any work

- `cloud security` — **answered**: the deployment work on Churp is the backing
  experience. **Still open:** the narrower `AWS IMDSv2, metadata APIs` phrasing in
  `gen-security` reads as bug-bounty research rather than deployment. Confirm which
  context it should sit in, since the two tell a reader different stories.
- `Edge AI / Hailo model deployment` — **answered** (Rahul, 2026-09-07): the Hailo
  repository genuinely deploys OCR and object-detection models, so it is now the
  `hailo` résumé project. `autonomous robotics (sensor integration)` is still a
  skills-line entry with no project or outcome behind it.

## 7. Work on the site with no résumé entry at all

`waaah-comics` — **answered**: now the `waaah` résumé project.

Still unused by any résumé: `kalidokit-fork` (MediaPipe/TensorFlow.js kinematics),
`crawl4ai-deepseek-example`, `geometry`, `information-lab`, `kaogenie`.

**Question:** should any of these become selectable résumé project entries too?

## 9. Projects Rahul has blocked from résumés — 2026-09-07

`asyncddgs`, `portfolio`, `utopia`, `flowshop` and `ie2110` carry a `blocked`
reason in `projects.json`. They are withheld from `list_resume_blocks` and refused
by both renderers, so neither an agent nor a canonical config can put them on a
document. Do not "helpfully" restore one; ask Rahul first.

Blocking `flowshop` cost nothing: the same SimPy digital twin and CP-SAT
optimizer is already an Abbott internship bullet (`abbott-intern.digital-twin`), so
the operations-research résumé had been carrying that work twice. It now appears
once, as experience, which is the stronger placement.

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

## Standing prohibitions

`PRODUCT.md` is binding regardless of anything above:

> Do not fabricate experience, metrics, employers, qualifications, project
> outcomes, or robotics/SLAM/Gaussian-splatting work.

No evidence supports claiming professional SLAM, localization, Gaussian splatting,
or probabilistic robotics delivery. The unpublished OpenCV/SLAM study mentioned in
the README stays out of résumés.
