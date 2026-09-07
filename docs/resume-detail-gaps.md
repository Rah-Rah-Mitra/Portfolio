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

## 4. Abbott contract role — no tools or metrics

The two contract bullets name four abstract areas (process improvement,
manufacturing analytics, decision support, supply-chain automation) with no tool,
technique, or measurement. The *internship* has plenty of depth; the contract role
has none.

## 5. ML tooling that is absent everywhere

An agent tailoring to a machine-learning posting will look for these and find
nothing. Confirmed absent from every content source:

PyTorch, TensorFlow (except a passing reference to TensorFlow.js in a fork),
Hugging Face, scikit-learn, Keras, NumPy, pandas, RANSAC, PnP, SIFT, ORB, Gurobi,
Pyomo, Kubernetes, Terraform, Redis, Kafka, PostgreSQL, MongoDB, Pinecone, FAISS,
Chroma, pgvector, Weights & Biases, MLflow, ONNX, TensorRT, quantization,
distillation, Optuna.

**Question:** which of these have you actually used, and on what?

## 6. Attested but unconnected to any work

These appear only as skills-line entries with no project or role behind them. They
are usable in a skills line but not in a bullet:

- `cloud security (AWS IMDSv2, metadata APIs)`
- `Edge AI / Hailo model deployment` and `autonomous robotics (sensor integration)`
  — the Hailo repository exists on the site but has no résumé project entry.

## 7. Work on the site with no résumé entry at all

Attested and potentially résumé-worthy, currently unused by any résumé:
`waaah-comics` (MediaPipe 3D landmarks, Gemini 2.0 Flash, Veo 3, Konva.js),
`hailo-training`, `kalidokit-fork` (MediaPipe/TensorFlow.js kinematics),
`crawl4ai-deepseek-example`, `geometry`, `information-lab`, `kaogenie`.

**Question:** should any of these become selectable résumé project entries?

---

## Standing prohibitions

`PRODUCT.md` is binding regardless of anything above:

> Do not fabricate experience, metrics, employers, qualifications, project
> outcomes, or robotics/SLAM/Gaussian-splatting work.

No evidence supports claiming professional SLAM, localization, Gaussian splatting,
or probabilistic robotics delivery. The unpublished OpenCV/SLAM study mentioned in
the README stays out of résumés.
