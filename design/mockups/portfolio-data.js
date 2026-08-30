// portfolio-data.js — content lifted from Rah-Rah-Mitra/Portfolio (portfolioData.ts, siteConfig.ts, lib/workstation.ts). Condensed for mockups.
export const CONTACT = {
  name: 'Rahul Mitra', short: 'RM', location: 'Singapore',
  tagline: 'Systems Architect & AI Engineer — ISE × CS × Mathematics',
  bio: 'NUS Industrial Systems Engineering (2nd Major CS, Minor Math). Builds intelligent systems across agentic AI, high-performance computing, operations research, 3D perception, and open-source engineering — from a fine-tuned 109M-parameter transformer to async Python libraries with global PyPI adoption.',
  email: 'mitrarahul2002@gmail.com',
  linkedin: 'linkedin.com/in/rahulmitra-dev', github: 'github.com/Rah-Rah-Mitra', instagram: 'instagram.com/rah.rah.mitra',
};
export const APPS = [
  { id: 'home', label: 'Home / Dossier', short: 'Home', kind: 'DOSSIER', win: 'WIN-01', desc: 'Positioning, current proof, primary actions.', icon: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9.5 21v-6h5v6' },
  { id: 'work', label: 'Selected Work', short: 'Work', kind: 'EVIDENCE', win: 'WIN-02', desc: 'Six evidence-rich engineering systems.', icon: 'M3.5 7.5h17V20h-17zM8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3.5 12h17' },
  { id: 'experience', label: 'Experience', short: 'Experience', kind: 'EVIDENCE', win: 'WIN-03', desc: 'Chronological professional record.', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2' },
  { id: 'archive', label: 'Project Archive', short: 'Archive', kind: 'EVIDENCE', win: 'WIN-04', desc: 'All projects, searchable and filterable.', icon: 'M3.5 4h17v4h-17zM5.5 8v12h13V8M10 12h4' },
  { id: 'systems', label: 'Systems Lab', short: 'Systems', kind: 'LAB', win: 'WIN-05', desc: 'Deterministic scheduling exhibits.', icon: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1' },
  { id: 'camera', label: 'Camera Lab', short: 'Camera', kind: 'LAB', win: 'WIN-06', desc: 'Interactive camera geometry and optics.', icon: 'M4 8h3.5L9.5 5h5L16.5 8H20v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z' },
  { id: 'world', label: '3D World', short: '3D World', kind: 'WORLD', win: 'WIN-07', desc: 'The shared optical test bench.', icon: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12 4 7.5M12 12v9' },
  { id: 'capabilities', label: 'Capabilities', short: 'Capabilities', kind: 'EVIDENCE', win: 'WIN-08', desc: 'Methods linked to supporting proof.', icon: 'M3.5 3.5h7v7h-7zM13.5 3.5h7v7h-7zM3.5 13.5h7v7h-7zM13.5 13.5h7v7h-7z' },
  { id: 'proof', label: 'Proof Vault', short: 'Proof', kind: 'PROOF', win: 'WIN-09', desc: 'Distinctions, credentials, evidence links.', icon: 'M12 3l7 2.8V11c0 4.8-3.2 7.7-7 9.7C8.2 18.7 5 15.8 5 11V5.8zM9 11.5l2 2 4-4.5' },
  { id: 'resumes', label: 'Resumes & Contact', short: 'Resumes', kind: 'PROOF', win: 'WIN-10', desc: 'Role-targeted resumes, direct contact.', icon: 'M6.5 3h7L18 7.5V21h-11.5zM13.5 3v4.5H18M9.5 12h5M9.5 15.5h5' },
];
export const FEATURED = [
  { id: 'hfs', no: '01', title: 'Hybrid Flow Shop Digital Twin', cat: 'Operations Research · Abbott', desc: 'SimPy discrete-event simulation + OR-Tools CP-SAT scheduling of a complex hybrid flow shop, with robust-optimization research for uncertainty-aware decisions.', tags: ['SimPy', 'CP-SAT', 'Robust Opt'], outcome: 'Deployment-oriented decision-support workflow.' },
  { id: 'ots', no: '02', title: 'OnTheSpectrum', cat: '3D Asset Pipeline', desc: 'Local-first Blender-to-Three.js asset and world prototyping pipeline — generated GLBs, metadata, previews, playable world QA.', tags: ['Three.js', 'Blender MCP', 'GLB'], outcome: 'Reusable pipeline behind the spatial portfolio.' },
  { id: 'utopia', no: '03', title: 'Project Utopia', cat: 'Situational Awareness', desc: 'Real-time global intelligence dashboard: AI news aggregation, geopolitical monitoring, infrastructure tracking.', tags: ['OSINT', 'Geospatial', 'AI'], outcome: 'Public experimental global-systems platform.' },
  { id: 'churp', no: '04', title: 'Churp', cat: 'Civic Tech · People\u2019s Association', desc: 'End-to-end garden-plot balloting platform — admin + public frontends, GIS allocation, Singpass Login + Myinfo identity.', tags: ['Singpass', 'GIS', 'Smart Nation'], outcome: 'Production-ready for national rollout · S$20,000 Sparks fund.' },
  { id: 'maritime', no: '05', title: 'Maritime Deficiency Forecasting', cat: 'AI & NLP · Hackathon Lead', desc: 'Fine-tuned 109M-parameter BERT + DNN severity forecasting on maritime inspection logs, trained on the ASPIRE 2A supercomputer.', tags: ['BERT', 'HPC', 'NLP'], outcome: 'Completed submission with certificate evidence.' },
  { id: 'addgs', no: '06', title: 'AsyncDDGS', cat: 'Open-Source Engineering', desc: 'asyncio-first DuckDuckGo search client on PyPI (aiohttp, pytest CI/CD); referenced by AI tooling and bot frameworks.', tags: ['Python', 'asyncio', 'PyPI'], outcome: 'Maintained public library, global adoption.' },
];
export const ARCHIVE = [
  { d: '2026-05', title: 'OnTheSpectrum', cat: '3D Asset Pipeline', dom: '3D / Vision', tags: 'Python · Three.js · Blender MCP' },
  { d: '2026-05', title: 'AsyncDDGS', cat: 'Open Source', dom: 'Software', tags: 'asyncio · aiohttp · PyPI' },
  { d: '2026-04', title: 'Geometry', cat: 'Mathematics Lab', dom: '3D / Vision', tags: 'Geometry · Learning systems' },
  { d: '2026-04', title: 'Information Lab', cat: 'Rust Systems Research', dom: 'Software', tags: 'Rust · IR · Tooling' },
  { d: '2026-04', title: 'Changeover Data Pipeline', cat: 'Data Quality', dom: 'Operations', tags: '15-stage · Excel VBA · Audit' },
  { d: '2026-03', title: 'Arcane', cat: 'Security Tooling', dom: 'Security', tags: 'Rust · Automation · OCR' },
  { d: '2026-03', title: 'Project Utopia', cat: 'Situational Awareness', dom: 'AI', tags: 'OSINT · Geospatial' },
  { d: '2026-03', title: 'Hailo Training', cat: 'Edge AI', dom: 'AI', tags: 'Edge · Acceleration' },
  { d: '2026-02', title: 'Hybrid Flow Shop Digital Twin', cat: 'Operations Research', dom: 'Operations', tags: 'SimPy · CP-SAT' },
  { d: '2026-02', title: 'APC Simulator Cloud Ops', cat: 'Solution Architecture', dom: 'Operations', tags: 'Azure · Docker' },
  { d: '2026-01', title: 'Volt Pulse SG', cat: 'Agentic AI', dom: 'AI', tags: 'SEALION · Supabase · RRF' },
  { d: '2026-01', title: 'Waaah Comics', cat: 'Generative AI & CV', dom: '3D / Vision', tags: 'MediaPipe · Gemini · Veo' },
  { d: '2025-10', title: 'Churp', cat: 'Citizen Developer', dom: 'Civic', tags: 'Singpass · GIS · Balloting' },
  { d: '2025-07', title: 'SmartExam', cat: 'AI Agents & RAG', dom: 'AI', tags: 'Next.js · RAG · Agents' },
  { d: '2025-07', title: 'KaoGenie', cat: 'AI Experiment', dom: 'AI', tags: 'Python · Prototyping' },
  { d: '2025-06', title: 'EthosLens', cat: 'AI Research Engine', dom: 'AI', tags: 'FastAPI · LangChain' },
  { d: '2025-05', title: 'AgeWellLah.AI', cat: 'AI & HealthTech', dom: 'AI', tags: 'RAG · IRIS Vector · OAuth2' },
  { d: '2025-04', title: 'Maritime Severity Forecasting', cat: 'AI & NLP', dom: 'AI', tags: 'BERT · DNN · ASPIRE 2A' },
  { d: '2025', title: 'tp / ip (Java coursework)', cat: 'Coursework Archive', dom: 'Software', tags: 'Java · SWE' },
  { d: '2024', title: 'IE2110 Graph Optimization', cat: 'OR Coursework', dom: 'Operations', tags: 'Dijkstra · Network flow' },
  { d: '2024', title: 'LLMs for Cybersecurity', cat: 'Learning Archive', dom: 'Security', tags: 'Mistral · LLaMA · AutoTrain' },
  { d: '2023', title: 'EG1311 Project', cat: 'Engineering Coursework', dom: 'Software', tags: 'C++' },
];
export const DOMAINS = ['All', 'AI', 'Operations', 'Software', 'Security', 'Civic', '3D / Vision'];
export const EXPERIENCE = [
  { d: 'AUG 2026 — PRESENT', org: 'STMicroelectronics', role: 'Operations Research · NUS System Design Project', sum: 'AI-driven put-away recommendation system for the Singapore warehouse — picking history, demand forecasts, live capacity replacing experience-based slotting.', tags: ['Warehouse Opt', 'Forecasting'] },
  { d: 'JAN 2026 — PRESENT', org: 'Abbott', role: 'Operational AI Systems & Data Engineer', sum: 'SimPy + CP-SAT hybrid flow-shop digital twin; 15-stage changeover pipeline that processed five years of unseen unclean data without errors; Docker/Azure APC simulator operations; AI upskilling for the regional engineering workforce.', tags: ['CP-SAT', 'Azure', 'Data Quality'] },
  { d: '2025 — PRESENT', org: 'People\u2019s Association · Sparks', role: 'Citizen Developer — Churp', sum: 'End-to-end garden-plot balloting platform with Singpass + Myinfo, production-ready for national rollout. S$20,000 Sparks Community Innovation Fund.', tags: ['Civic Tech', 'Singpass'] },
  { d: 'MAY 2024 — PRESENT', org: 'YesWeHack', role: 'Bug Bounty Researcher', sum: 'GovTech GBBP12/13 and LTA programs + 13 more: responsibly disclosed SSRF, CSRF, SQL/NoSQL injection, auth bypasses. Burp Suite, Wireshark, custom Python/Bash tooling.', tags: ['GovTech', 'LTA', 'SSRF'] },
  { d: 'IN PROGRESS', org: 'NUS', role: 'B.Eng Industrial & Systems Engineering', sum: 'Second Major Computer Science, Minor Mathematics. Top student, 3D Computer Vision (CS4277), class of 24.', tags: ['ISE', 'CS', 'Math'] },
];
export const CAPABILITIES = [
  { no: '01', title: 'Software & Systems', sum: 'Typed frontends, Python services, async libraries, CI/CD, maintainable public artifacts.', tools: 'Python · TypeScript · React · FastAPI · Docker', proof: 'AsyncDDGS · SmartExam · Churp' },
  { no: '02', title: 'Solution Architecture', sum: 'Ambiguous operational problems into deployable cloud architectures with stakeholder loops.', tools: 'Azure · Docker · APIs · Singpass · OAuth2', proof: 'APC Cloud Ops · Churp · Volt Pulse' },
  { no: '03', title: 'AI Engineering', sum: 'NLP, RAG, vector search, agents, CV, HPC training — with evaluation and deployment constraints.', tools: 'BERT · RAG · GPT-4 · ASPIRE 2A · SEALION', proof: 'Maritime BERT · AgeWellLah · EthosLens' },
  { no: '04', title: 'Operations Research', sum: 'Scheduling, discrete-event simulation, graph algorithms, robust optimization in real constraints.', tools: 'CP-SAT · SimPy · Dijkstra · Excel VBA', proof: 'Digital Twin · Changeover Pipeline' },
  { no: '05', title: 'Cybersecurity', sum: 'Adversarial lens: bug bounty research, secure design, traffic analysis, responsible disclosure.', tools: 'Burp Suite · Wireshark · Python · Rust', proof: 'GovTech GBBP · LTA · Arcane' },
  { no: '06', title: 'Data & Product Analytics', sum: 'Auditable pipelines, workforce enablement, user testing, decision-ready reporting.', tools: 'Data Quality · Process Analytics · VBA', proof: 'Changeover Pipeline · Abbott Upskilling' },
];
export const PROOF = [
  { d: '2026 JUL', title: 'Top Student — 3D Computer Vision (CS4277)', cat: 'Academic Distinction', note: 'NUS SoC Certificate of Outstanding Performance; top of class of 24. SfM, bundle adjustment, multi-view stereo.', link: 'View NUS certificate' },
  { d: '2026 JAN', title: 'Top 8 Finalist — SMU Hack For Cities', cat: 'Hackathon', note: 'Volt Pulse SG agentic energy tracking, of 50+ teams.', link: 'Devpost' },
  { d: '2025 — NOW', title: 'S$20,000 Sparks Community Innovation Fund', cat: 'Civic Award', note: 'Churp — national-rollout-ready balloting platform.', link: 'Sparks by PA' },
  { d: '2024 — NOW', title: 'Bug Bounty — GovTech GBBP12/13 & LTA', cat: 'Vulnerability Disclosure', note: 'SSRF, CSRF, SQL/NoSQL injection, auth bypasses responsibly disclosed.', link: 'YesWeHack' },
  { d: '2025', title: 'Maritime Hackathon — Team Lead & Model Trainer', cat: 'AI & NLP', note: '109M-param BERT + DNN on ASPIRE 2A.', link: 'Certificate' },
  { d: '2025', title: 'CTF @ DSTA BRAINHACK', cat: 'CTF Debut', note: 'Top-quartile, ~90th of 400+ teams.', link: 'DSTA' },
  { d: '2025', title: 'SmartExam @ GovTech × NTUPC', cat: 'AI & Full-Stack', note: 'Multi-agent autonomous exam generation with RAG.', link: 'GitHub' },
  { d: '2023 DEC', title: 'NVIDIA DLI — Disaster Risk Monitoring', cat: 'Certification', note: 'U-Net segmentation on multi-spectral satellite imagery, HPC training.', link: 'learn.nvidia.com' },
  { d: '2022 — 24', title: 'Early Certification Trail', cat: 'Certifications', note: 'Docker, reverse engineering, CNNs/RNNs, Unity/C#, deep RL, Excel Advanced.', link: 'Archive' },
];
export const RESUMES = [
  { role: 'Software Engineer', head: 'Python, TypeScript, React, CI/CD, open-source systems.', kw: 'Python · React · FastAPI · Docker' },
  { role: 'Solution Architect', head: 'Cloud, product and stakeholder architecture.', kw: 'Azure · RAG · Singpass · APIs' },
  { role: 'AI Engineer', head: 'BERT, RAG, vector search, agents, HPC, deployment.', kw: 'BERT · Agents · OpenAI · HPC' },
  { role: 'Operations Research', head: 'Scheduling, simulation, graph optimization, decision support.', kw: 'CP-SAT · SimPy · Statistics' },
  { role: 'Cyber Security', head: 'Bug bounty, web app security, exploit scripting.', kw: 'Burp · Wireshark · OAuth2 · Rust' },
  { role: 'Civic Tech Architect', head: 'Singpass-integrated civic platforms, AI for communities.', kw: 'Civic · Myinfo · GIS · A11y' },
  { role: 'General / Master CV', head: 'Two-page cross-disciplinary CV unifying every profile.', kw: 'Full Stack · AI/ML · OR · Security' },
];
