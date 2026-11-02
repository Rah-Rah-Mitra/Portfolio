// experienceResponsibilities.ts: what each experience record involved, for the
// MCP's list_experience. Only lib/portfolioSnapshot.ts imports this file.
//
// It is not in portfolioData.ts on purpose. The site never renders
// responsibilities (the Experience window shows scope, the first outcome and
// tags), and portfolioData.ts is in the main bundle, whose cap is fixed
// (scripts/check-bundle.mjs). Keyed like experienceDetailById, by record id or
// the alias a merged field note carries. The CV-sourced lines are the master
// CV's words; edit them there first (scripts/resume/content/*.json).
export const experienceResponsibilities: Record<string, string[]> = {
  'career-astar-artc': [
    "Selected for a 4-month research attachment in ARTC's Digital Supply Chain Group, running alongside final-semester studies.",
  ],
  'career-stmicro-or': [
    "Architected a layout-agnostic AI put-away engine to run in any STMicroelectronics warehouse worldwide, ingesting each site's shelf coordinates, dimensions, and operating rules so one model adapts to any floor plan.",
    'Designed a 4-stage shelf-ranking pipeline: movement profiling from pick frequency, dwell time, and demand; filtering on packaging zone, fit, capacity, and restricted areas; Golden Region priority for fast movers; and logged rationale per decision.',
    'Defined a historical-replay evaluation comparing 3 metrics against current allocation (travel distance per order, handling time, slow-mover Golden Region occupancy), piloting on 2 AMK warehouses: dice and finished goods.',
  ],
  'career-amazon-vision': [
    'Reproduced a published UNet super-resolution model in PyTorch from broken author code, training 12 models across three scales, two datasets, and two losses.',
    'Closed a robustness gap under unseen blur with randomised-blur training and fine-tuning.',
    'Authored and presented a super-resolution literature review spanning multi-image, video, and single-image methods.',
    'Deployed three trained models as a public web app: a Flask inference API on a Colab T4 GPU and a hosted front end.',
  ],
  'career-abbott-contract': [
    'Develop a chat-based spray-dryer fault-detection tool validated across 5+ plants worldwide, cutting critical-failure diagnosis from days or months of manual raw-signal analysis to within an hour, flagging inconclusive signals rather than false positives.',
    "Deliver fast metrics for high-stakes decisions such as new product introductions (NPI) and planned stoppages, recommending optimal setpoints from an estimated response surface model and answering engineers' and managers' questions, with rollout planned on Abbott servers for 24/7 access.",
    'Assemble a five-stage offline process-intelligence platform for globally distributed spray-drying plants: GPU OCR and layout parsing, recursive chunking, bge-small ONNX embeddings, a Chroma vector store, and LangChain over a locally hosted Gemma model.',
    'Convert global plants’ Advanced Process Control models from their Excel master files into a single HiGHS linear program with a tracking QP and PLC predictor, returning setpoints, binding constraints, and shadow prices at millisecond latency.',
    'Build a live multi-site data layer over read-only Seeq historian pulls, mapping each site through configuration rather than forks, with Kalman smoothing, Welch PSD, change-point detection, and matrix-profile motifs in SciPy and pandas.',
    'Design a tool loop where the model emits schema-constrained JSON and the solver computes every number, gated by an automated numeric-fidelity check and a per-call audit log with no write path to plant control.',
    'Harden global deployment with lock-pinned CUDA and CPU builds, OS trust-store integration for enterprise TLS-inspecting proxies, and an auditable decision register for every deviation from the vendor reference.',
    'Build MCP servers, 20+ regression tests, a headless notebook runner, and a deterministic model stand-in for GPU-free CI, with golden snapshots committed for reproducible runs.',
  ],
  'career-abbott-intern': [
    'Developed a SimPy discrete-event digital twin and OR-Tools CP-SAT solver for hybrid flow-shop scheduling, then compared three approaches (heuristic, MIP, and genetic algorithm) to turn production objectives and constraints into decision-ready schedules.',
    'Validated a non-destructive, 15-stage changeover-data pipeline that exposes every intermediate state instead of mutating source data.',
    'Deployed a team-built APC simulator to production for live internal users on Azure App Service, with Docker packaging, access restrictions, and runtime and session hardening.',
    'Trained regional engineering teams across Asia and Europe on repeatable AI workflows spanning seven areas: prompting, model selection, benchmarks, cost awareness, agents, validation, and safeguards.',
    'Strengthened Excel, VBA, Python, master-data, and scheduling workflows with three safeguards: validation rules, correction tables, and reproducible intermediate stages, leaving every transformation auditable.',
    'Documented deployment, access provisioning, and technical handover across three procedures, so internal manufacturing and engineer-training users stayed supported after transfer to owning teams.',
  ],
  'career-pa-churp': [
    'Led most software development and deployment of a digital garden-plot balloting platform across admin and public Next.js frontends, a NestJS backend, and GIS mapping, now live in Tengah with national rollout planned.',
    'Integrated Singpass Login (OIDC) to secure resident sign-in and Myinfo to verify identity and address.',
    'Led deployment planning, multi-repo coordination, and stakeholder management across People’s Association, Tengah community partners, and PA ICT (GovTech).',
    'Provisioned 10 AWS services with Terraform (ECS Fargate, Multi-AZ RDS Postgres with PostGIS, ALB behind WAFv2, Route 53, ACM, KMS, Secrets Manager, and a Rust auth gateway on Lambda and API Gateway), shipped via keyless GitHub Actions CI/CD on IAM OIDC across 5 repos with gated migrations, RDS snapshots, and auto-rollback.',
    'Conducted field surveys of garden sites and structured physical plot records into geospatial datasets driving three platform workflows: mapping, plot allocation, and site planning.',
    'Designed rules-based balloting workflows across four control points: eligibility checks, conflict resolution, exception handling, and administrative oversight, keeping allocation transparent and auditable.',
  ],
  'career-ntuc-active-ageing': ['Coordinated weekly senior-engagement activities, including home visits to check health, hear life stories, and help with everyday tasks, building empathy for accessible, community-focused product design.'],
  'career-yeswehack-independent-researcher': [
    'Tested web applications and APIs for SSRF, CSRF, SQL/NoSQL injection, authentication bypass, and adjacent trust-boundary failures.',
    'Built Python and Bash automation around Burp Suite and Wireshark-assisted investigation.',
  ],
  'career-singapore-navy': ['Compressed a month-long manual analysis of 6 months of food-waste data into a 3-minute Excel VBA reporting workflow inside a security-constrained environment.'],
  'nus-education': ['Applied optimization, simulation, software engineering, and multi-view geometry through coursework and project systems.'],
  'education-asrjc-stem': ['Led astronomy outreach, competed in Singapore’s 7th Astronomical Olympiad, and engineered an autonomous robot for the National Robotics Challenge.'],
};
