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
    "Architected a layout-agnostic AI put-away engine ingesting each site's shelf coordinates, dimensions, and operating rules, letting one model adapt to any STMicroelectronics warehouse floor plan without per-site rework.",
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
    'Developed ADAM, an offline tool-calling assistant on a locally hosted Gemma 4 E4B model (llama.cpp) answering spray-dryer setpoint, process, and signal questions for 6 dryers across 4 global sites, giving engineers self-serve answers to decisions previously requiring APC specialists, with rollout to Abbott servers scheduled.',
    "Converted 4 sites' Advanced Process Control master files from Excel into 7 steady-state gain models solved as HiGHS linear programs and SLSQP tracking QPs, returning setpoints, binding constraints, and shadow prices in milliseconds across 5 modes: APC replica, single-setpoint push, CV targeting, what-if limit reports, and operator what-ifs.",
    "Implemented minimum lexicographic constraint relaxation with one LP per candidate, replacing a reference simulator's bisection search, and fixed 2 defects in its quadratic program: a tolerance-band penalty applied to measured rather than predicted values, and an out-of-bounds start point.",
    "Validated replica outputs against live APC setpoints, matching move direction in 83% of cases and temperature setpoints within 0.12 °C over 24 readings, after tracing a tag-mapping bug pairing one dryer with a second dryer's Seeq tags.",
    'Qualified each operating point from read-only Seeq pulls via plant-state classification and 30-minute steadiness checks before any solve, and kept LLM output free of computed numbers through JSON-schema-constrained tool calls and automatic checks of each narration against solver results.',
    'Built a Seeq signal-analytics toolkit (Kalman smoothing, Welch spectra, lag and coherence, PELT change points, matrix-profile motifs and discords, an 18-feature fingerprint) and a 5-stage offline handbook RAG pipeline: GPU OCR and layout parsing, recursive chunking, ONNX embeddings, a Chroma vector store, and LangChain retrieval.',
    'Proved production modules identical to research notebooks with exact-equality parity tests, alongside 20 engine tests, HTTP contract tests, a headless notebook runner, and a deterministic model stand-in for GPU-free CI.',
    'Hardened global deployment with lock-pinned CUDA and CPU builds, OS trust-store integration for enterprise TLS-inspecting proxies, and an auditable decision register for every deviation from the vendor reference.',
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
    "Recruited into PA's Sparks Citizens Developer network as a community innovator in recognition of prior public-good initiatives, then designed, built, and deployed Churp, a resident-driven garden-plot balloting platform now live in Tengah and slated for national rollout, seeded by a S$20K Sparks Community Innovation Fund award.",
    'Owned most software development and deployment across admin and public Next.js frontends, a NestJS backend, and GIS mapping.',
    'Integrated Singpass Login (OIDC) to secure resident sign-in and Myinfo to verify identity and address, keeping garden-plot balloting fair for 150 residents signed up at release.',
    'Provisioned 10 AWS services with Terraform (ECS Fargate, Multi-AZ RDS Postgres with PostGIS, ALB behind WAFv2, Route 53, ACM, KMS, Secrets Manager, and a Rust auth gateway on Lambda and API Gateway), shipped via keyless GitHub Actions CI/CD on IAM OIDC across 5 repos with gated migrations, RDS snapshots, and auto-rollback.',
    "Led deployment planning, multi-repo coordination, and stakeholder management in an 11-person team across People's Association, Tengah community partners, and PA ICT (GovTech).",
    'Surveyed garden sites into geospatial datasets for mapping, plot allocation, and site planning, and designed rules-based balloting across 4 control points (eligibility, conflict resolution, exceptions, admin oversight), keeping allocation auditable.',
  ],
  'career-ntuc-active-ageing': ["Coordinated weekly senior-engagement activities, including home visits to check on residents' wellbeing, hear life stories, and help with everyday tasks, building empathy for accessible, community-focused product design."],
  'career-yeswehack-independent-researcher': [
    'Tested web applications and APIs for SSRF, CSRF, SQL/NoSQL injection, authentication bypass, and adjacent trust-boundary failures.',
    'Built Python and Bash automation around Burp Suite and Wireshark-assisted investigation.',
  ],
  'career-singapore-navy': ['Compressed a month-long manual analysis of 6 months of food-waste data into a 3-minute Excel VBA reporting workflow inside a security-constrained environment.'],
  'nus-education': ['Applied optimization, simulation, software engineering, and multi-view geometry through coursework and project systems.'],
  'education-asrjc-stem': ['Led astronomy outreach, competed in Singapore’s 7th Astronomical Olympiad, and engineered an autonomous robot for the National Robotics Challenge.'],
};
