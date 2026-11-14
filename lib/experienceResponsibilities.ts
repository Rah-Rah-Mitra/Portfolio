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
    "Architected a layout-agnostic AI put-away engine reading each site's shelf coordinates, dimensions, and operating rules, so one model fits any STMicroelectronics warehouse without per-site rework.",
    'Defined a historical-replay evaluation comparing 3 metrics against current allocation (travel distance per order, handling time, and slow-mover Golden Region occupancy), piloting on 2 AMK warehouses: dice and finished goods.',
    'Formulated a 4-stage shelf-ranking pipeline: movement profiling from pick frequency, dwell time, and demand; filtering on packaging zone, fit, capacity, and restricted areas; Golden Region priority for fast movers; and logged rationale per decision.',
  ],
  'career-amazon-vision': [
    'Tackled an Amazon Robotics brief spanning 3 workstreams (camera ISP, super-resolution, image restoration) to make low-cost cameras rival far pricier sensors, mentored by Dan Shao, VP of Computer Vision, ML and AI at Zelig.',
    'Reproduced a published UNet super-resolution model in PyTorch from broken author code, recovering its undocumented evaluation protocol and training 12 models, matching reported results at 8x and landing within 0.78 dB at 2x and 4x.',
    'Diagnosed a robustness gap where fixed-blur super-resolution models lost most PSNR gains under unseen blur, then added randomised-blur training and fine-tuning, recovering up to 0.7 dB across lens, out-of-focus, and resampling blur.',
    'Launched 3 trained models as a public web app via a Flask inference API on a Colab T4 GPU behind a secure tunnel on a reserved domain.',
    'Authored and presented a super-resolution literature review spanning multi-image, video, and single-image methods, organised around camera information loss and recovery, comparing 4 model families on fidelity and hallucination risk.',
  ],
  'career-abbott-contract': [
    'Developed ADAM, an offline tool-calling LLM assistant (Gemma 4 E4B on llama.cpp) for 6 spray dryers across 4 global sites, giving engineers self-serve answers to decisions previously requiring process-control specialists.',
    "Rebuilt 4 sites' Excel-based Advanced Process Control (APC) models as 7 steady-state gain models solved by HiGHS LPs and SLSQP QPs, returning setpoints, binding constraints, and shadow prices in milliseconds.",
    'Verified the APC replica against live plant setpoints, matching move direction in 83% of cases and temperatures within 0.12 °C over 24 readings.',
    'Implemented a Seeq signal-analytics toolkit (Kalman smoothing, spectral and lag analysis, change-point detection, matrix profiles) and a 5-stage offline handbook RAG pipeline (OCR, ONNX embeddings, Chroma, LangChain).',
    'Enforced Seeq plant-state and 30-minute steadiness checks before each optimiser solve, and kept LLM narration free of computed numbers through schema-constrained tool calls verified against solver results.',
    "Replaced a reference simulator's bisection search with minimum lexicographic constraint relaxation via LPs, fixing 2 QP defects.",
    'Proved production modules identical to research notebooks via exact-equality parity tests, plus 20 engine tests and GPU-free CI.',
    'Hardened global deployment with lock-pinned CUDA and CPU builds, OS trust-store integration for enterprise TLS-inspecting proxies, and an auditable decision register for every deviation from the vendor reference.',
  ],
  'career-abbott-intern': [
    'Engineered a SimPy discrete-event digital twin and OR-Tools CP-SAT solver for hybrid flow-shop scheduling, comparing 3 approaches (heuristic, MIP, genetic algorithm) to produce decision-ready schedules.',
    'Validated a 15-stage changeover-data pipeline on 5 years of unseen raw data, with zero failures across operator and machine anomalies.',
    'Deployed a team-built APC simulator to live internal users on Azure App Service, with Docker, access restrictions, and session hardening.',
    'Trained regional engineering teams across Asia and Europe on repeatable AI workflows spanning 7 areas: prompting, model selection, benchmarks, cost awareness, agents, validation, and safeguards.',
    'Strengthened Excel, VBA, Python, master-data, and scheduling workflows with 3 safeguards: validation rules, correction tables, and reproducible intermediate stages, leaving every transformation auditable.',
    'Documented deployment, access provisioning, and technical handover across 3 procedures, so internal manufacturing and engineer-training users stayed supported after transfer to owning teams.',
  ],
  'career-pa-churp': [
    'Designed, built, and deployed Churp, a resident-driven garden-plot balloting platform now live in Tengah and slated for national rollout, seeded by a S$20K Sparks Community Innovation Fund award.',
    "Integrated Singpass Login and Myinfo (OIDC) to verify residents' identity and address, keeping balloting fair for 150 sign-ups at release.",
    'Provisioned 10 AWS services with Terraform (ECS Fargate, Multi-AZ RDS with PostGIS, WAFv2, Lambda, KMS), deployed through keyless GitHub Actions CI/CD across 5 repos with gated migrations and auto-rollback.',
    'Owned most software development and deployment across admin and public Next.js frontends, a NestJS backend, and GIS mapping.',
    'Surveyed garden sites into geospatial datasets for mapping and plot allocation, and designed rules-based balloting across 4 control points (eligibility, conflict resolution, exceptions, admin oversight), keeping allocation auditable.',
    "Led deployment planning, multi-repo coordination, and stakeholder management in an 11-person team across People's Association, Tengah community partners, and PA ICT (GovTech).",
  ],
  'career-ntuc-active-ageing': ["Coordinated weekly senior-engagement activities, including home visits to check on residents' wellbeing, hear life stories, and help with everyday tasks, building empathy for accessible, community-focused product design."],
  'career-yeswehack-independent-researcher': [
    'Tested web applications and APIs for SSRF, CSRF, SQL/NoSQL injection, authentication bypass, and adjacent trust-boundary failures.',
    'Built Python and Bash automation around Burp Suite and Wireshark-assisted investigation.',
  ],
  'career-singapore-navy': ['Compressed a month-long manual analysis of 6 months of food-waste data into a 3-minute Excel VBA report in a restricted environment.'],
  'nus-education': ['Applied optimization, simulation, software engineering, and multi-view geometry through coursework and project systems.'],
  'education-asrjc-stem': ['Led astronomy outreach, competed in Singapore’s 7th Astronomical Olympiad, and engineered an autonomous robot for the National Robotics Challenge.'],
};
