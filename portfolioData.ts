
import React from 'react';
import { CompetencyCluster, EventHighlight, FieldNote, FieldNoteLink, PortfolioData, ProjectHighlight, ResumeProfile } from './types';
import { CodeBracketIcon, AcademicCapIcon, CommandLineIcon, DevicePhoneMobileIcon, ServerStackIcon } from './components/icons/TechIcons';
import * as assets from './assets';

/**
 * Data for the "Systems Architect & AI Engineer" profile (Light Theme).
 */
export const softwareEngineerData: PortfolioData = {
  name: "Rahul Mitra",
  tagline: "Systems Architect & AI Engineer | ISE × CS × Mathematics",
  bio: "NUS Industrial Systems Engineering student (Second Major CS, Minor Math). I build intelligent systems at the intersection of agentic AI, high-performance computing, and open-source engineering — from fine-tuned 109M-parameter transformer models to async Python libraries with global PyPI adoption.",
  profileImageUrl: assets.SE_PROFILE_IMAGE,
  contactEmail: "mitrarahul2002@gmail.com",
  linkedinUrl: "https://linkedin.com/in/rahulmitra-dev",
  githubUrl: "https://github.com/Rah-Rah-Mitra",
  instagramUrl: "https://www.instagram.com/rah.rah.mitra/",
  achievements: [
    {
      id: 7,
      title: "Top Student — 3D Computer Vision @ NUS School of Computing",
      description: "Awarded the NUS School of Computing Certificate of Outstanding Performance in 3D Computer Vision (CS4277), placed as the top student in a class of 24 for AY2025/26 Semester 2. The course covers projective geometry, camera models, fundamental and essential matrices, absolute pose estimation, three-view geometry, structure-from-motion with bundle adjustment, two-view and multi-view stereo, and generalized cameras.",
      date: "2026 Jul",
      imageUrl: assets.SE_ACHIEVEMENT_3DCV,
      category: "Academic Distinction",
      tags: ["3D Vision", "Multi-View Geometry", "Structure-from-Motion", "Bundle Adjustment", "NUS", "Top Student"]
    },
    {
      id: 6,
      title: "AsyncDDGS — Open-Source PyPI Library",
      description: "Engineered and maintain AsyncDDGS, an asyncio-first, aiohttp-based DuckDuckGo search client on PyPI. Achieves sub-100ms query responses via Python's event loop, bypassing the GIL bottleneck. Actively referenced in starred AI projects (SearchGPT, Auto-Photoshop-StableDiffusion-Plugin) and Discord bot frameworks. Maintained with pytest CI/CD via GitHub Actions.",
      date: "2024 – Present",
      category: "Open-Source Engineering",
      tags: ["Python", "asyncio", "aiohttp", "PyPI", "Open-Source", "CI/CD"]
    },
    {
      id: 5,
      title: "Maritime Hackathon 2025 — Team Lead & Model Trainer",
      description: "Led a multidisciplinary team at Maritime Hackathon 2025 to build a predictive system for maritime deficiency severity forecasting. Fine-tuned a 109-million parameter BERT model integrated with Deep Neural Networks (DNN) on the ASPIRE 2A supercomputer. Executed complex data engineering on maritime inspection logs, hyperparameter optimization, and gradient clipping to prevent catastrophic forgetting.",
      date: "2025",
      imageUrl: assets.SE_ACHIEVEMENT_MARITIME,
      category: "AI & NLP",
      tags: ["BERT", "DNN", "NLP", "HPC", "ASPIRE 2A", "Fine-Tuning", "Hackathon"]
    },
    {
      id: 4,
      title: "SmartExam @ GovTech x NTUPC Hackathon 2025",
      description: "Built 'SmartExam', an advanced multi-agent autonomous system for generating customized exams from various sources. Developed for the GovTech x NTUPC Product Hackathon, featuring a sophisticated RAG pipeline to automate the entire exam creation lifecycle. Explore the repository at github.com/Rah-Rah-Mitra/SmartExam.",
      date: "2025",
      imageUrl: assets.SE_ACHIEVEMENT_SMARTEXAM,
      category: "AI & Full-Stack Development",
      tags: ["AI Agents", "RAG", "System Design", "Hackathon", "Next.js"]
    },
    {
      id: 3,
      title: "EthosLens @ LifeHack 2025",
      description: "Backend developer for 'EthosLens' at LifeHack 2025 — an automated research engine scoring brands on ethical/sustainability practices using AI. View on Devpost (devpost.com/software/ethoslens) or GitHub (github.com/Rah-Rah-Mitra/EthosLens).",
      date: "2025",
      imageUrl: assets.SE_ACHIEVEMENT_ETHOSLENS,
      category: "AI & Sustainability Tech",
      tags: ["FastAPI", "Python", "LangChain", "Backend", "Hackathon", "Sustainability"]
    },
    {
      id: 2,
      title: "AgeWellLah.AI @ HealthHack 2025",
      description: "Primary AI/ML Engineer at HealthHack 2025, deploying a Retrieval-Augmented Generation (RAG) architecture with OpenAI GPT-4 and InterSystems IRIS Vector Search for elderly patient triage. Implemented cosine similarity semantic retrieval, Flask backend, and OAuth2-secured patient profiles — bridging experimental AI with PDPA-compliant production engineering. (github.com/ZulfaqarHafez/AgeWellLah.AI)",
      date: "2025",
      imageUrl: assets.SE_ACHIEVEMENT_AGEWELLAI,
      category: "AI & HealthTech",
      tags: ["RAG", "GPT-4", "InterSystems IRIS", "Flask", "OAuth2", "Hackathon"]
    },
    {
      id: 1,
      title: "Disaster Risk Monitoring Using Satellite Imagery — NVIDIA",
      description: "Completed an NVIDIA Deep Learning Institute certification applying AI to monitor and assess disaster risks via satellite imagery. Gained hands-on experience with multi-spectral geospatial data, U-Net semantic segmentation, and HPC-accelerated model training on the ASPIRE 2A supercomputer. (learn.nvidia.com/certificates?id=15f34263397c4584b947c5d6b449139a)",
      date: "2023 Dec",
      imageUrl: assets.SE_ACHIEVEMENT_NVIDIA_DIL_DRM,
      category: "AI & Geospatial",
      tags: ["NVIDIA", "Deep Learning", "U-Net", "Satellite Imagery", "HPC", "ASPIRE 2A"]
    }
  ],
  skills: [
    { id: 1, name: "Python (asyncio, FastAPI, Flask)", icon: React.createElement(CommandLineIcon, { className: "w-6 h-6" }) },
    { id: 2, name: "Deep Learning & Transformers (BERT, GPT-4, RAG)", icon: React.createElement(AcademicCapIcon, { className: "w-6 h-6" }) },
    { id: 3, name: "Deep Reinforcement Learning (PPO, A2C, DDPG, DQN)", icon: React.createElement(CodeBracketIcon, { className: "w-6 h-6" }) },
    { id: 4, name: "TypeScript, React & Next.js", icon: React.createElement(DevicePhoneMobileIcon, { className: "w-6 h-6" }) },
    { id: 5, name: "HPC & Distributed Training (ASPIRE 2A, CUDA)", icon: React.createElement(ServerStackIcon, { className: "w-6 h-6" }) },
    { id: 6, name: "SQL & NoSQL Databases", icon: React.createElement(ServerStackIcon, { className: "w-6 h-6" }) },
    { id: 7, name: "Mathematical Modeling (Linear Algebra, Probability, Calculus)", icon: React.createElement(AcademicCapIcon, { className: "w-6 h-6" }) },
    { id: 8, name: "Rust (Systems Programming & Digital Twins)", icon: React.createElement(CodeBracketIcon, { className: "w-6 h-6" }) },
  ],
};

/**
 * Data for the "Adversarial Security Researcher" profile (Dark Theme).
 */
export const cybersecurityData: PortfolioData = {
  name: "Rahul Mitra",
  tagline: "Adversarial Security Researcher & Bug Bounty Hunter",
  bio: "NUS Engineering student and active bug bounty hunter on YesWeHack. I've uncovered critical vulnerabilities — SSRF, CSRF, SQL/NoSQL Injection, and authentication bypasses — for Singapore's GovTech (GBBP12/13) and the Land Transport Authority. My adversarial mindset drives security-first design across every system I build.",
  profileImageUrl: assets.CS_PROFILE_IMAGE,
  contactEmail: "mitrarahul2002@gmail.com",
  linkedinUrl: "https://linkedin.com/in/rahulmitra-dev",
  githubUrl: "https://github.com/Rah-Rah-Mitra",
  instagramUrl: "https://www.instagram.com/rah.rah.mitra/",
  achievements: [
    {
      id: 3,
      title: "Active Bug Bounty Hunter — GovTech & LTA",
      description: "Actively participating in bug bounty programs on YesWeHack. Key engagements include Singapore's Government Technology Agency (GovTech GBBP12/13) and the Land Transport Authority (LTA) Bug Bounty Program, plus 13+ other private/public programs. Discovered and responsibly disclosed high-impact vulnerabilities including SSRF, CSRF, SQL/NoSQL Injection, and authentication bypasses. Utilizes Burp Suite for MitM traffic interception and Wireshark for deep packet inspection (OSI Layers 3–4).",
      date: "May 2024 – Present",
      imageUrl: assets.CS_ACHIEVEMENT_BUG_BOUNTY,
      category: "Vulnerability Disclosure",
      tags: ["Bug Bounty", "YesWeHack", "GovTech", "LTA", "SSRF", "CSRF", "SQLi"]
    },
    {
      id: 2,
      title: "CTF @ DSTA BRINHACK 2025",
      description: "Made my CTF debut at DSTA BRINHACK 2025. Our team secured a commendable top-quartile finish, placing ~90th among 400+ fiercely competing teams across diverse challenge categories.",
      date: "2025",
      imageUrl: assets.CS_ACHIEVEMENT_BRAINHACK_2025,
      category: "CTF Competition",
      tags: ["CTF", "DSTA", "Teamwork", "BrainHack", "First-Time"]
    },
    {
      id: 1,
      title: "Bespoke Vulnerability Automation Tooling",
      description: "Developed custom Python and Bash scripts to automate fuzzing, payload delivery, and endpoint enumeration — transitioning from manual exploitation to programmatic, engineering-led vulnerability research. Enables scalable coverage across large attack surfaces in competitive bug bounty environments.",
      date: "May 2024 – Present",
      imageUrl: assets.CS_ACHIEVEMENT_BUG_BOUNTY,
      category: "Security Engineering",
      tags: ["Python", "Bash", "Automation", "Fuzzing", "Custom Tooling"]
    }
  ],
  skills: [
    { id: 1, name: "Web App Penetration Testing (Burp Suite)", icon: React.createElement(CommandLineIcon, { className: "w-6 h-6" }) },
    { id: 2, name: "Network Analysis (Wireshark, TCP/UDP, TLS)", icon: React.createElement(ServerStackIcon, { className: "w-6 h-6" }) },
    { id: 3, name: "Vuln Research (SSRF, CSRF, SQLi, Auth Bypass)", icon: React.createElement(CodeBracketIcon, { className: "w-6 h-6" }) },
    { id: 4, name: "Custom Exploit Scripting (Python, Bash)", icon: React.createElement(CommandLineIcon, { className: "w-6 h-6" }) },
    { id: 5, name: "CTF Competitions", icon: React.createElement(AcademicCapIcon, { className: "w-6 h-6" }) },
    { id: 6, name: "OWASP Top 10 & Secure Design", icon: React.createElement(CodeBracketIcon, { className: "w-6 h-6" }) },
    { id: 7, name: "JWT / OAuth2 / Session Analysis", icon: React.createElement(DevicePhoneMobileIcon, { className: "w-6 h-6" }) },
    { id: 8, name: "Cloud Security (AWS IMDSv2, Metadata APIs)", icon: React.createElement(ServerStackIcon, { className: "w-6 h-6" }) },
  ],
};

export const resumeProfiles: ResumeProfile[] = [
  {
    id: 'software-engineer',
    role: 'Software Engineer',
    headline: 'Python, TypeScript, React, CI/CD, and open-source systems for product-facing engineering roles.',
    keywords: ['Python', 'TypeScript', 'React', 'FastAPI', 'Docker', 'CI/CD', 'System Design'],
    docxUrl: '/resume/generated/rahul-mitra-software-engineer-2026-07.docx',
    pdfUrl: '/resume/generated/rahul-mitra-software-engineer-2026-07.pdf',
    accent: 'cyan',
  },
  {
    id: 'solution-architect',
    role: 'Solution Architect',
    headline: 'Cloud, product, and stakeholder architecture across Azure simulators, civic tech, and agentic AI.',
    keywords: ['Azure', 'Docker', 'Bitbucket', 'RAG', 'APIs', 'Singpass', 'Stakeholders'],
    docxUrl: '/resume/generated/rahul-mitra-solution-architect-2026-07.docx',
    pdfUrl: '/resume/generated/rahul-mitra-solution-architect-2026-07.pdf',
    accent: 'blue',
  },
  {
    id: 'ai-engineer',
    role: 'AI Engineer',
    headline: 'Applied AI profile spanning BERT, RAG, vector search, agents, HPC, and model deployment.',
    keywords: ['BERT', 'RAG', 'AI Agents', 'Vector Search', 'OpenAI', 'HPC', 'Model Evaluation'],
    docxUrl: '/resume/generated/rahul-mitra-ai-engineer-2026-07.docx',
    pdfUrl: '/resume/generated/rahul-mitra-ai-engineer-2026-07.pdf',
    accent: 'violet',
  },
  {
    id: 'operations-research-engineer',
    role: 'Operations Research Engineer',
    headline: 'Scheduling, simulation, graph optimization, analytics automation, and decision-support engineering.',
    keywords: ['Constraint Programming', 'Scheduling', 'Simulation', 'Dijkstra', 'Statistics', 'Excel VBA'],
    docxUrl: '/resume/generated/rahul-mitra-operations-research-engineer-2026-07.docx',
    pdfUrl: '/resume/generated/rahul-mitra-operations-research-engineer-2026-07.pdf',
    accent: 'amber',
  },
  {
    id: 'cyber-security',
    role: 'Cyber Security',
    headline: 'Bug bounty, web application security, custom exploit scripting, and secure system design.',
    keywords: ['Burp Suite', 'Wireshark', 'SSRF', 'CSRF', 'SQLi', 'OAuth2/JWT', 'Rust'],
    docxUrl: '/resume/generated/rahul-mitra-cyber-security-2026-07.docx',
    pdfUrl: '/resume/generated/rahul-mitra-cyber-security-2026-07.pdf',
    accent: 'red',
  },
  {
    id: 'civic-tech-solution-architect',
    role: 'Solution Architect · Civic Tech',
    headline: 'Technology for social good: Singpass-integrated civic platforms, cloud architecture, and AI that reaches vulnerable communities.',
    keywords: ['Civic Tech', 'Social Impact', 'Singpass/Myinfo', 'Solution Architecture', 'Full-Stack', 'GIS', 'Accessibility'],
    docxUrl: '/resume/generated/rahul-mitra-civic-tech-solution-architect-2026-07.docx',
    pdfUrl: '/resume/generated/rahul-mitra-civic-tech-solution-architect-2026-07.pdf',
    accent: 'green',
  },
  {
    id: 'general',
    role: 'General / Master CV',
    headline: 'Two-page cross-disciplinary CV unifying every profile — software, AI/ML, operations research, architecture, and security — for broad job search.',
    keywords: ['Full Stack', 'AI/ML', 'Operations Research', 'Solution Architecture', 'Security', 'Two Pages'],
    docxUrl: '/resume/generated/rahul-mitra-general-2026-07.docx',
    pdfUrl: '/resume/generated/rahul-mitra-general-2026-07.pdf',
    accent: 'amber',
  },
];

export const coreCompetencies: CompetencyCluster[] = [
  {
    id: 'software-systems',
    title: 'Software & Systems Engineering',
    summary: 'Builds production-minded software with typed frontends, Python services, async libraries, automated tests, CI/CD, and maintainable public artifacts.',
    tools: ['Python', 'TypeScript', 'React', 'Next.js', 'FastAPI', 'aiohttp', 'Docker', 'GitHub Actions'],
    proof: ['AsyncDDGS', 'Interactive Portfolio', 'SmartExam', 'Churp'],
    accent: 'cyan',
  },
  {
    id: 'solution-architecture',
    title: 'Solution Architecture',
    summary: 'Turns ambiguous operational and civic problems into deployable architectures with cloud hosting, containerization, product requirements, and stakeholder feedback loops.',
    tools: ['Azure', 'Docker', 'Bitbucket CI/CD', 'API Design', 'Singpass/Myinfo', 'OAuth2', 'Supabase', 'Manufacturing Systems'],
    proof: ['Azure APC Web Simulator', 'Churp', 'Project Utopia', 'Volt Pulse SG'],
    accent: 'blue',
  },
  {
    id: 'ai-engineering',
    title: 'AI Engineering',
    summary: 'Ships applied AI across NLP, RAG, vector search, agents, computer vision, and high-performance training without losing sight of evaluation and deployment constraints.',
    tools: ['BERT', 'RAG', 'AI Agents', 'OpenAI GPT-4', 'Gemini', 'Vector Search', 'ASPIRE 2A', 'SEALION'],
    proof: ['Maritime BERT/DNN', 'AgeWellLah.AI', 'SmartExam', 'EthosLens'],
    accent: 'violet',
  },
  {
    id: 'operations-research',
    title: 'Operations Research',
    summary: 'Connects ISE modeling with practical optimization: scheduling, simulation, graph algorithms, decision analytics, and automation inside real operating constraints.',
    tools: ['Constraint Programming', 'Hybrid Flow Shop', 'Simulation', 'Dijkstra', 'Statistics', 'Jupyter', 'Excel VBA'],
    proof: ['Hybrid Flow Shop Digital Twin', 'IE2110 Graph Optimization', 'Singapore Navy Automation'],
    accent: 'amber',
  },
  {
    id: 'cybersecurity',
    title: 'Cybersecurity',
    summary: 'Applies an adversarial engineering lens through bug bounty research, secure design, traffic analysis, exploit automation, and responsible disclosure reporting.',
    tools: ['Burp Suite', 'Wireshark', 'SSRF', 'CSRF', 'SQL/NoSQL Injection', 'OAuth2/JWT', 'Python', 'Bash', 'Rust'],
    proof: ['GovTech GBBP12/13', 'LTA Bug Bounty', 'Arcane', 'DSTA BRINHACK'],
    accent: 'red',
  },
  {
    id: 'data-product',
    title: 'Data & Product Analytics',
    summary: 'Pairs analytics with product judgment: data pipelines, user testing, operational dashboards, civic feedback workflows, and decision-ready reporting.',
    tools: ['Product Discovery', 'User Testing', 'Dashboards', 'SQL/NoSQL', 'Process Analytics', 'Stakeholder Mapping'],
    proof: ['Abbott Operational AI', 'Churp', 'Volt Pulse SG', 'NTUC Health Volunteering'],
    accent: 'green',
  },
];

export const projectHighlights: ProjectHighlight[] = [
  {
    id: 'on-the-spectrum',
    title: 'OnTheSpectrum',
    category: '3D Asset Pipeline',
    description: 'A local-first Blender-to-Three.js asset and world prototyping pipeline with generated GLBs, metadata, previews, and playable world QA.',
    tags: ['Python', 'Three.js', 'Blender MCP', 'GLB', 'World Builder'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/OnTheSpectrum',
    dateLabel: 'May 2026',
    sortDate: '2026-05-31',
    imageUrl: '/renders/on_the_spectrum-painter-chibi-preview.png',
    accent: 'cyan',
    linkedEventIds: ['january-gauntlet-2026'],
    npcRole: '3D world architect',
  },
  {
    id: 'geometry',
    title: 'Geometry',
    category: 'Mathematics Knowledge Lab',
    description: 'A living undergraduate-to-graduate geometry notebook and visual reference space for mathematical modeling foundations.',
    tags: ['Mathematics', 'Geometry', 'HTML', 'Learning Systems'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/Geometry',
    dateLabel: 'Apr 2026',
    sortDate: '2026-04-30',
    accent: 'blue',
    linkedEventIds: ['nus-education'],
    npcRole: 'mathematics map guide',
  },
  {
    id: 'information-lab',
    title: 'Information Lab',
    category: 'Rust Systems Research',
    description: 'A Rust-forward information systems lab for experimenting with fast local tooling, data structures, and systems-level interfaces.',
    tags: ['Rust', 'Systems', 'Information Retrieval', 'Tooling'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/Information-Lab',
    dateLabel: 'Apr 2026',
    sortDate: '2026-04-30',
    accent: 'cyan',
    linkedEventIds: ['certification-trail'],
    npcRole: 'information systems guide',
  },
  {
    id: 'arcane',
    title: 'Arcane',
    category: 'Security Tooling',
    description: 'A Rust-forward security and red-team tooling family connected to Arcane, Arcane-PP, Arcane-GLM, and Arcane-OCR experiments.',
    tags: ['Rust', 'Security', 'Automation', 'OCR'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/Arcane',
    dateLabel: 'Mar 2026',
    sortDate: '2026-03-31',
    links: [
      { label: 'Arcane-PP', url: 'https://github.com/Rah-Rah-Mitra/Arcane-PP' },
      { label: 'Arcane-GLM', url: 'https://github.com/Rah-Rah-Mitra/Arcane-GLM' },
      { label: 'Arcane-OCR', url: 'https://github.com/Rah-Rah-Mitra/Arcane-OCR' },
    ],
    imageUrl: '/images/generated/arcane-security.png',
    accent: 'violet',
    linkedEventIds: ['certification-trail'],
    npcRole: 'security tooling guide',
  },
  {
    id: 'hailo-training',
    title: 'Hailo Training',
    category: 'Edge AI Training',
    description: 'A compact training and experimentation repo for edge-AI workflows around Hailo-style model deployment and acceleration.',
    tags: ['Edge AI', 'Model Training', 'HTML', 'Acceleration'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/Hailo-Training',
    dateLabel: 'Mar 2026',
    sortDate: '2026-03-31',
    accent: 'amber',
    linkedEventIds: ['certification-trail'],
    npcRole: 'edge inference guide',
  },
  {
    id: 'hybrid-flow-shop-digital-twin',
    title: 'Hybrid Flow Shop Digital Twin Optimizer',
    category: 'Operations Research & Manufacturing AI',
    description: 'A professional Abbott project modeling an NP-hard hybrid flow shop scheduling problem through Python simulation and constraint-programming optimization.',
    tags: ['Python', 'Digital Twin', 'Constraint Programming', 'Scheduling', 'Manufacturing'],
    dateLabel: '2026',
    sortDate: '2026-01-01',
    accent: 'amber',
    linkedEventIds: ['abbott-internship'],
    npcRole: 'operations research optimizer',
  },
  {
    id: 'azure-apc-web-simulator',
    title: 'Azure APC Web Simulator',
    category: 'Cloud Solution Architecture',
    description: 'A professional Abbott simulator for Advanced Process Control workflows, packaged with Docker and deployed through Bitbucket CI/CD for global manufacturing users.',
    tags: ['Azure', 'Docker', 'Bitbucket CI/CD', 'APC', 'Manufacturing'],
    dateLabel: '2026',
    sortDate: '2026-01-01',
    accent: 'blue',
    linkedEventIds: ['abbott-internship'],
    npcRole: 'manufacturing cloud architect',
  },
  {
    id: 'project-utopia',
    title: 'Project Utopia',
    category: 'Situational Awareness',
    description: 'A real-time global intelligence dashboard for AI-powered news aggregation, geopolitical monitoring, and infrastructure tracking.',
    tags: ['Dashboard', 'OSINT', 'Geospatial', 'AI'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/Project-Utopia',
    dateLabel: 'Mar 2026',
    sortDate: '2026-03-31',
    imageUrl: '/images/generated/project-utopia.png',
    accent: 'amber',
    linkedEventIds: ['january-gauntlet-2026'],
    npcRole: 'global-systems analyst',
  },
  {
    id: 'volt-pulse-sg',
    title: 'Volt Pulse SG',
    category: 'Agentic AI & Sustainability',
    description: 'Top 8 finalist at SMU Hack For Cities 2026: an agentic AI system for household energy-cost tracking, multilingual retrieval, and recommendation routing.',
    tags: ['Agentic AI', 'SEALION', 'Supabase', 'RRF', 'Net Zero'],
    dateLabel: 'Jan 2026',
    sortDate: '2026-01-31',
    imageUrl: '/images/generated/volt-pulse-sg.png',
    accent: 'green',
    linkedEventIds: ['smu-hack-for-cities-2026'],
    npcRole: 'sustainability systems guide',
  },
  {
    id: 'smart-exam',
    title: 'SmartExam',
    category: 'AI Agents & RAG',
    description: 'A multi-agent autonomous exam-generation system from varied source material, built for the GovTech x NTUPC Product Hackathon.',
    tags: ['Next.js', 'RAG', 'AI Agents', 'System Design'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/SmartExam',
    dateLabel: '2025',
    sortDate: '2025-01-01',
    imageUrl: assets.SE_ACHIEVEMENT_SMARTEXAM,
    accent: 'blue',
    linkedEventIds: ['january-gauntlet-2026'],
    npcRole: 'education-agent guide',
  },
  {
    id: 'waaah-comics',
    title: 'Waaah Comics',
    category: 'Generative AI & Computer Vision',
    description: 'A 24-hour build turning physical hand gestures into digital comic strips with MediaPipe 3D landmarks, Gemini, Veo, and canvas tooling.',
    tags: ['MediaPipe', 'Gemini', 'Veo', 'Konva.js', 'Computer Vision'],
    liveUrl: 'https://lnkd.in/gneUG9fj',
    dateLabel: 'Jan 2026',
    sortDate: '2026-01-31',
    imageUrl: '/images/generated/waaah-comics.png',
    accent: 'violet',
    linkedEventIds: ['january-gauntlet-2026', 'waaah-comics'],
    npcRole: 'gesture-to-story creator',
  },
  {
    id: 'ethos-lens',
    title: 'EthosLens',
    category: 'AI Research Engine',
    description: 'An automated research engine scoring brands on ethical and sustainability practices, built at LifeHack 2025.',
    tags: ['FastAPI', 'Python', 'LangChain', 'Sustainability'],
    dateLabel: '2025',
    sortDate: '2025-01-01',
    imageUrl: assets.SE_ACHIEVEMENT_ETHOSLENS,
    accent: 'red',
    linkedEventIds: ['january-gauntlet-2026'],
    npcRole: 'ethical intelligence guide',
  },
  {
    id: 'agewelllah-ai',
    title: 'AgeWellLah.AI',
    category: 'AI & HealthTech',
    description: 'A HealthHack 2025 elderly patient triage system using RAG, InterSystems IRIS vector search, Flask, OAuth2, and PDPA-aware architecture.',
    tags: ['RAG', 'HealthTech', 'Flask', 'OAuth2', 'Vector Search'],
    repoUrl: 'https://github.com/ZulfaqarHafez/AgeWellLah.AI',
    dateLabel: '2025',
    sortDate: '2025-01-01',
    imageUrl: assets.SE_ACHIEVEMENT_AGEWELLAI,
    accent: 'green',
    linkedEventIds: ['january-gauntlet-2026'],
    npcRole: 'healthtech triage guide',
  },
  {
    id: 'maritime-deficiency-severity',
    title: 'Maritime Deficiency Severity Forecasting',
    category: 'AI & NLP',
    description: 'A Maritime Hackathon 2025 predictive system using a fine-tuned 109M-parameter BERT model, DNN layers, and ASPIRE 2A supercomputing.',
    tags: ['BERT', 'DNN', 'NLP', 'HPC', 'Maritime'],
    dateLabel: '2025',
    sortDate: '2025-01-01',
    links: [
      { label: 'Certificate of submission', url: '/certificates/maritime-hackathon-2025-submission.pdf' },
    ],
    imageUrl: assets.SE_ACHIEVEMENT_MARITIME,
    accent: 'blue',
    linkedEventIds: ['january-gauntlet-2026'],
    npcRole: 'maritime AI guide',
  },
  {
    id: 'churp',
    title: 'Churp',
    category: 'Citizen Developer Platform',
    description: 'An end-to-end digital garden-plot balloting platform for People\'s Association - admin and public frontends, GIS-based allocation, and Singpass Login + Myinfo identity verification - production-ready for national rollout across Singapore.',
    tags: ['Civic Tech', 'Singpass', 'GIS', 'Balloting', 'Smart Nation'],
    dateLabel: '2025 - Present',
    sortDate: '2025-01-01',
    imageUrl: '/images/generated/churp-community.png',
    accent: 'green',
    linkedEventIds: ['sparks-by-pa-churp'],
    npcRole: 'community systems guide',
  },
  {
    id: 'kaogenie',
    title: 'KaoGenie',
    category: 'AI Experiment',
    description: 'A Python experimentation repo for fast AI prototyping, prompt workflows, and applied model exploration.',
    tags: ['Python', 'AI', 'Prototype', 'Automation'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/KaoGenie',
    dateLabel: 'Jul 2025',
    sortDate: '2025-07-31',
    accent: 'violet',
    linkedEventIds: ['january-gauntlet-2026'],
    npcRole: 'rapid prototype guide',
  },
  {
    id: 'asyncddgs',
    title: 'AsyncDDGS',
    category: 'Open-Source Engineering',
    description: 'An asyncio-first DuckDuckGo search client built with aiohttp, maintained with pytest CI/CD and referenced in AI tooling projects.',
    tags: ['Python', 'asyncio', 'aiohttp', 'PyPI', 'Open Source'],
    dateLabel: '2024-Present',
    sortDate: '2026-05-14',
    accent: 'cyan',
    linkedEventIds: ['software-achievement-6'],
    npcRole: 'open-source systems guide',
  },
];

export const projectArchive: ProjectHighlight[] = [
  {
    id: 'portfolio-repo',
    title: 'Portfolio',
    category: 'Portfolio Infrastructure',
    description: 'The interactive portfolio itself: React, Three.js, CFD background experiments, chatbot controls, and profile switching.',
    tags: ['TypeScript', 'React', 'Three.js', 'Portfolio'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/Portfolio',
    dateLabel: '2026',
    sortDate: '2026-01-01',
    accent: 'cyan',
  },
  {
    id: 'github-profile-repo',
    title: 'Rah-Rah-Mitra Profile Repo',
    category: 'GitHub Profile',
    description: 'Personal GitHub profile repository and public profile automation surface.',
    tags: ['Python', 'GitHub', 'Profile'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/Rah-Rah-Mitra',
    dateLabel: '2026',
    sortDate: '2026-01-01',
    accent: 'blue',
  },
  {
    id: 'kalidokit-fork',
    title: 'kalidokit',
    category: 'Computer Vision Fork',
    description: 'A fork around MediaPipe/TensorFlow.js pose, face, eye, and finger tracking kinematics.',
    tags: ['TypeScript', 'MediaPipe', 'Kinematics', 'Fork'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/kalidokit',
    dateLabel: '2026',
    sortDate: '2026-01-01',
    accent: 'violet',
  },
  {
    id: 'tp-java',
    title: 'tp',
    category: 'Coursework Archive',
    description: 'Java coursework repository preserved as part of the learning and software engineering archive.',
    tags: ['Java', 'Coursework', 'Software Engineering'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/tp',
    dateLabel: '2025',
    sortDate: '2025-01-01',
    accent: 'amber',
  },
  {
    id: 'ip-java',
    title: 'ip',
    category: 'Coursework Archive',
    description: 'Java individual project repository from the software engineering coursework trail.',
    tags: ['Java', 'Coursework', 'CLI'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/ip',
    dateLabel: '2025',
    sortDate: '2025-01-01',
    accent: 'amber',
  },
  {
    id: 'crawl4ai-deepseek-example',
    title: 'crawl4ai-deepseek-example',
    category: 'AI Experiment Archive',
    description: 'A small crawl4ai and DeepSeek example repository kept as an experimentation reference.',
    tags: ['AI', 'Crawling', 'DeepSeek'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/crawl4ai-deepseek-example',
    dateLabel: '2025',
    sortDate: '2025-01-01',
    accent: 'green',
  },
  {
    id: 'ie2110-grp-13',
    title: 'IE2110 Operations Research I',
    category: 'Operations Research Coursework',
    description: 'Operations Research I coursework applying foundational OR concepts: linear programming, network flow models, nonlinear programming, and engineering-management decision applications, with a Jupyter graph-optimization project for SSSP/APSP analysis.',
    tags: ['Jupyter Notebook', 'Operations Research', 'Network Flow', 'Dijkstra', 'ISE'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/IE2110-GRP-13',
    dateLabel: '2024',
    sortDate: '2024-01-01',
    accent: 'blue',
  },
  {
    id: 'fine-tuning-llms-cybersecurity',
    title: 'Fine-tuning LLMs for Cybersecurity',
    category: 'Learning Archive',
    description: 'Course repository connected to Mistral, LLaMA, AutoTrain, and AutoGen fine-tuning workflows for cybersecurity.',
    tags: ['LLM', 'Cybersecurity', 'Fine-Tuning', 'Learning'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/fine-tuning-llms-for-cybersecurity-mistral-llama-autotrain-autogen-3893128',
    dateLabel: '2024',
    sortDate: '2024-01-01',
    accent: 'red',
  },
  {
    id: 'references',
    title: 'References',
    category: 'Notebook Archive',
    description: 'Python and Jupyter notebook references from the broader learning archive.',
    tags: ['Jupyter Notebook', 'Python', 'References'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/References',
    dateLabel: '2024',
    sortDate: '2024-01-01',
    accent: 'violet',
  },
  {
    id: 'eg1311-project',
    title: 'EG1311 Project',
    category: 'Engineering Coursework',
    description: 'C++ group project repository from the early engineering project trail.',
    tags: ['C++', 'Engineering', 'Coursework'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/EG1311_Project',
    dateLabel: '2023',
    sortDate: '2023-01-01',
    accent: 'green',
  },
];

export const eventHighlights: EventHighlight[] = [
  {
    id: 'nus-3d-cv-award',
    title: 'NUS 3D Computer Vision - Certificate of Outstanding Performance',
    dateLabel: 'Jul 2026',
    exactDateRange: '2026-07-03',
    source: 'Portfolio',
    summary: 'Awarded the NUS School of Computing Certificate of Outstanding Performance in 3D Computer Vision (CS4277) as the top student in a class of 24 for AY2025/26 Semester 2, covering projective geometry, camera models, epipolar geometry, absolute pose estimation, structure-from-motion with bundle adjustment, and multi-view stereo.',
    tags: ['3D Vision', 'Multi-View Geometry', 'Structure-from-Motion', 'Bundle Adjustment', 'NUS', 'Top Student'],
    organizations: ['NUS School of Computing'],
    linkedProjectIds: ['on-the-spectrum', 'geometry'],
    linkUrl: '/certificates/nus-3d-computer-vision-outstanding-performance-2026.pdf',
    npcDialogue: 'This is the geometry bench: cameras, epipolar lines, and bundle adjustment. Top of a class of 24 - the maths behind the spatial and digital-twin work everywhere else on this map.',
  },
  {
    id: 'smu-hack-for-cities-2026',
    title: 'SMU Hack For Cities 2026 - Volt Pulse SG',
    dateLabel: 'Jan 26-29, 2026',
    exactDateRange: '2026-01-26 to 2026-01-29',
    source: 'LinkedIn',
    summary: 'Top 8 finalist building an agentic AI energy-cost tracking system for Singapore HDB households, combining SEALION embeddings, Supabase vector storage, RRF agent routing, and a scheduler-agent roadmap for proactive sustainability nudges.',
    tags: ['Top 8 Finalist', 'Agentic AI', 'RAG', 'Sustainability', 'Net Zero'],
    people: ['Kevan Soon', 'Zulfaqar Hafez', 'Kwa Guang Hao'],
    organizations: ['SMU Smart City Society', 'SMU Institute of Innovation & Entrepreneurship', 'IBM', 'AI Singapore', 'IMDA'],
    linkedProjectIds: ['volt-pulse-sg'],
    npcDialogue: 'Volt Pulse SG was where the agentic stack grew teeth: multilingual retrieval, RRF routing, and a plan for scheduler agents that can anticipate household energy needs before users ask.',
  },
  {
    id: 'january-gauntlet-2026',
    title: 'January Gauntlet 2026',
    dateLabel: 'Jan 10-31, 2026',
    exactDateRange: '2026-01-10 to 2026-01-31',
    source: 'LinkedIn',
    summary: 'A month-long sprint across Gemini Hackathon, Hack4Good NUS, HacknRoll, Build For Impact, Hack For Cities SMU, and ManusAI ideation, battle-testing Next.js, FastAPI, Cloudflare Workers, Supabase, Clerk, Vercel, Render, SeaLion, LangGraph, Gemini, Veo, MediaPipe, and OpenAI Vision.',
    tags: ['Hackathon', 'Generative AI', 'Computer Vision', 'Singapore Tech'],
    people: ['Kevan Soon', 'Zulfaqar Hafez'],
    organizations: ['NUS', 'SMU', 'SIT', 'ManusAI'],
    linkedProjectIds: ['waaah-comics', 'volt-pulse-sg', 'smart-exam', 'project-utopia', 'on-the-spectrum'],
    npcDialogue: 'The January Gauntlet is the lore board: six events in one month, a lot of caffeine, and a toolchain that went from geospatial systems to gesture-driven comics.',
  },
  {
    id: 'waaah-comics',
    title: 'Waaah Comics',
    dateLabel: 'Jan 2026',
    source: 'LinkedIn',
    summary: 'A 24-hour highlight project that transformed physical hand gestures into digital comic strips using MediaPipe 3D landmarks, Gemini 2.0 Flash, Veo 3, and canvas tooling.',
    tags: ['MediaPipe', 'Gemini', 'Veo', 'Konva.js', 'Creative AI'],
    linkedProjectIds: ['waaah-comics'],
    linkUrl: 'https://lnkd.in/gneUG9fj',
    npcDialogue: 'Waaah Comics is the motion lab: wave your hands, calibrate landmarks, and watch the pipeline turn awkward arm movements into generated comic frames.',
  },
  {
    id: 'abbott-internship',
    title: 'Abbott - Data Analytics to Operational AI',
    dateLabel: 'Jan 2026 - Present',
    exactDateRange: '2026-01-01 to Present',
    source: 'LinkedIn',
    summary: 'Data analytics and product management work - a Python digital twin optimizer for hybrid flow shop scheduling, an Azure APC web simulator, and Dockerized releases - that converted into an Operational AI Systems & Data Engineer contract building AI-enabled supply-chain and manufacturing analytics that help vulnerable patient groups.',
    tags: ['Data Analytics', 'Product Management', 'Operational AI', 'Digital Twin', 'Azure'],
    organizations: ['Abbott'],
    linkedProjectIds: ['hybrid-flow-shop-digital-twin', 'azure-apc-web-simulator'],
    npcDialogue: 'The Abbott node connects analytics, operations research, and cloud architecture: digital twins for scheduling, APC simulators for manufacturing, and operational AI that has to survive real factory constraints.',
  },
  {
    id: 'sparks-by-pa-churp',
    title: 'Sparks by PA - Churp',
    dateLabel: '2025 - Present',
    source: 'LinkedIn',
    summary: 'Built Churp into an end-to-end digital garden-plot balloting platform - admin and public frontends, GIS mapping, and Singpass Login + Myinfo identity verification - now production-ready for national rollout across Singapore. Awarded the S$20,000 Sparks Community Innovation Fund.',
    tags: ['Citizen Developer', 'Singpass', 'GIS', 'Balloting', 'Smart Nation'],
    organizations: ['PA', 'Tengah Town'],
    linkedProjectIds: ['churp'],
    npcDialogue: 'Churp is the community systems corner: it treats gardening plots like a civic product problem, with feedback loops and smarter allocation for residents.',
  },
  {
    id: 'nvidia-disaster-risk',
    title: 'NVIDIA Disaster Risk Monitoring Certification',
    dateLabel: '2023',
    source: 'LinkedIn',
    summary: 'Completed NVIDIA Disaster Risk Monitoring Using Satellite Imagery, adding geospatial AI and disaster-risk monitoring to the portfolio.',
    tags: ['NVIDIA', 'Geospatial AI', 'Satellite Imagery', 'Deep Learning'],
    linkedProjectIds: ['project-utopia'],
    npcDialogue: 'The NVIDIA certification is the geospatial anchor: satellite imagery, risk monitoring, and the roots of the global-awareness systems work.',
  },
  {
    id: 'certification-trail',
    title: 'Early AI, Security, and Tooling Certifications',
    dateLabel: '2022-2024',
    source: 'LinkedIn',
    summary: 'A certification trail covering Docker, Windows executable reverse engineering, CNNs, RNNs, Unity/C# game development, Excel 2019 Advanced, and reinforcement learning/deep RL.',
    tags: ['Docker', 'Reverse Engineering', 'CNN', 'RNN', 'Unity', 'Deep RL'],
    linkedProjectIds: ['arcane', 'on-the-spectrum'],
    npcDialogue: 'This wall is the skill-tree archive: Docker, reverse engineering, CNNs, RNNs, Unity, Excel automation, and deep reinforcement learning before the newer agentic systems arc.',
  },
];

const achievementProjectLinks: Record<string, string[]> = {
  'AsyncDDGS — Open-Source PyPI Library': ['asyncddgs'],
  'Maritime Hackathon 2025 — Team Lead & Model Trainer': ['maritime-deficiency-severity'],
  'SmartExam @ GovTech x NTUPC Hackathon 2025': ['smart-exam'],
  'EthosLens @ LifeHack 2025': ['ethos-lens'],
  'AgeWellLah.AI @ HealthHack 2025': ['agewelllah-ai'],
  'Disaster Risk Monitoring Using Satellite Imagery — NVIDIA': ['project-utopia'],
  'Active Bug Bounty Hunter — GovTech & LTA': ['arcane'],
  'CTF @ DSTA BRINHACK 2025': ['arcane'],
  'Bespoke Vulnerability Automation Tooling': ['arcane'],
};

const projectSortDates: Record<string, string> = {
  'on-the-spectrum': '2026-05-12',
  geometry: '2026-05-12',
  'information-lab': '2026-04-24',
  arcane: '2026-03-31',
  'hailo-training': '2026-03-26',
  'hybrid-flow-shop-digital-twin': '2026-02-15',
  'azure-apc-web-simulator': '2026-02-14',
  'project-utopia': '2026-03-12',
  'volt-pulse-sg': '2026-01-29',
  'waaah-comics': '2026-01-18',
  'smart-exam': '2025-07-01',
  'ethos-lens': '2025-06-01',
  'agewelllah-ai': '2025-05-01',
  'maritime-deficiency-severity': '2025-04-01',
  churp: '2025-10-01',
  kaogenie: '2025-07-27',
  asyncddgs: '2026-05-01',
};

const projectToFieldNote = (project: ProjectHighlight): FieldNote => ({
  id: `project-${project.id}`,
  title: project.title,
  kind: 'project',
  kinds: ['project'],
  dateLabel: project.dateLabel ?? 'Project',
  sortDate: projectSortDates[project.id] ?? '2025-01-01',
  source: project.repoUrl ? 'GitHub' : 'Portfolio',
  summary: project.description,
  tags: [project.category, ...project.tags],
  linkedProjectIds: [project.id],
  links: [
    ...(project.repoUrl ? [{ label: 'Open repository', url: project.repoUrl }] : []),
    ...(project.liveUrl ? [{ label: 'Open live work', url: project.liveUrl }] : []),
    ...(project.links ?? []),
  ],
  imageUrl: project.imageUrl,
  npcDialogue: `${project.title}: ${project.description}`,
});

const achievementSortDates: Record<string, string> = {
  'Top Student — 3D Computer Vision @ NUS School of Computing': '2026-07-03',
  'AsyncDDGS — Open-Source PyPI Library': '2026-05-01',
  'Maritime Hackathon 2025 — Team Lead & Model Trainer': '2025-08-01',
  'SmartExam @ GovTech x NTUPC Hackathon 2025': '2025-07-01',
  'EthosLens @ LifeHack 2025': '2025-06-01',
  'AgeWellLah.AI @ HealthHack 2025': '2025-05-01',
  'Disaster Risk Monitoring Using Satellite Imagery — NVIDIA': '2023-12-01',
  'Active Bug Bounty Hunter — GovTech & LTA': '2026-03-01',
  'CTF @ DSTA BRINHACK 2025': '2025-06-01',
  'Bespoke Vulnerability Automation Tooling': '2026-02-01',
};

const achievementToFieldNote = (
  profile: 'software' | 'cyber',
  achievement: PortfolioData['achievements'][number],
): FieldNote => ({
  id: `${profile}-achievement-${achievement.id}`,
  title: achievement.title,
  kind: 'achievement',
  kinds: ['achievement'],
  dateLabel: achievement.date,
  sortDate: achievementSortDates[achievement.title] ?? '2025-01-01',
  source: 'Portfolio',
  summary: achievement.description,
  tags: [achievement.category, ...(achievement.tags ?? [])].filter((tag): tag is string => Boolean(tag)),
  linkedProjectIds: achievementProjectLinks[achievement.title],
  imageUrl: achievement.imageUrl,
  npcDialogue: `${achievement.title}: ${achievement.description}`,
});

const eventToFieldNote = (event: EventHighlight): FieldNote => {
  const kindByEvent: Partial<Record<string, FieldNote['kind']>> = {
    'abbott-internship': 'career',
    'nus-3d-cv-award': 'certification',
    'nvidia-disaster-risk': 'certification',
    'certification-trail': 'certification',
  };
  const kind = kindByEvent[event.id] ?? 'event';

  return {
    id: event.id,
    title: event.title,
    kind,
    kinds: [kind],
    dateLabel: event.dateLabel,
    sortDate: event.exactDateRange?.slice(0, 10) ?? (
      event.id === 'waaah-comics' ? '2026-01-18' :
      event.id === 'sparks-by-pa-churp' ? '2025-10-01' :
      event.id === 'certification-trail' ? '2024-01-01' :
      event.id === 'nvidia-disaster-risk' ? '2023-12-01' :
      '2025-01-01'
    ),
    source: event.source,
    summary: event.summary,
    tags: event.tags,
    people: event.people,
    organizations: event.organizations,
    linkedProjectIds: event.linkedProjectIds,
    links: event.linkUrl
      ? [{ label: kind === 'certification' ? 'View certificate' : 'View linked media', url: event.linkUrl }]
      : undefined,
    imageUrl: event.imageUrl,
    npcDialogue: event.npcDialogue,
  };
};

const careerAndEducationNotes: FieldNote[] = [
  {
    id: 'nus-education',
    title: 'National University of Singapore',
    kind: 'education',
    kinds: ['education'],
    dateLabel: '2023-Present',
    sortDate: '2026-01-01',
    source: 'Education',
    summary: 'Penultimate undergraduate in Industrial Systems Engineering with a Second Major in Computer Science and a Mathematics Minor.',
    tags: ['NUS', 'ISE', 'Computer Science', 'Mathematics', 'Undergraduate'],
    linkedProjectIds: ['geometry', 'information-lab', 'project-utopia'],
  },
  {
    id: 'career-yeswehack-independent-researcher',
    title: 'Independent Bug Bounty Researcher - YesWeHack',
    kind: 'career',
    kinds: ['career'],
    dateLabel: '2023-Present',
    sortDate: '2026-01-01',
    source: 'Portfolio',
    summary: 'Active vulnerability research across government and transport targets, with work spanning SSRF, CSRF, SQL/NoSQL injection, authentication bypass, Burp Suite, Wireshark, and custom Python/Bash automation.',
    tags: ['Bug Bounty', 'YesWeHack', 'GovTech', 'LTA', 'Security'],
    linkedProjectIds: ['arcane'],
  },
  {
    id: 'career-singapore-navy',
    title: 'Singapore Navy - Base Support Assistant',
    kind: 'career',
    kinds: ['career'],
    dateLabel: 'Jan 2022-Jan 2023',
    sortDate: '2023-01-01',
    source: 'Portfolio',
    summary: 'Automated operational food-waste reporting with Excel VBA, turning a six-month manual cycle into a sub-three-minute workflow inside a security-constrained environment.',
    tags: ['Singapore Navy', 'Excel VBA', 'Operations', 'Automation', 'Process Improvement'],
    linkedProjectIds: ['information-lab'],
  },
  {
    id: 'education-asrjc-stem',
    title: 'ASRJC STEM Inc. - Robotics & Astronomy',
    kind: 'education',
    kinds: ['education'],
    dateLabel: '2019-2020',
    sortDate: '2020-08-01',
    source: 'Education',
    summary: 'Led astronomy outreach, competed in the Singapore Astronomical Olympiad, built autonomous robotics systems, and received the ASRJC Outstanding Contribution Award.',
    tags: ['ASRJC', 'STEM Inc.', 'Astronomy', 'Robotics', 'Leadership'],
    linkedProjectIds: ['on-the-spectrum'],
  },
];

const certificationNotes: FieldNote[] = [
  {
    id: 'cert-docker-absolute-beginner',
    title: 'Docker for the Absolute Beginner - Hands-On',
    kind: 'certification',
    kinds: ['certification'],
    dateLabel: '2024',
    sortDate: '2024-08-01',
    source: 'LinkedIn',
    summary: 'Stone River eLearning certification covering Docker fundamentals and hands-on container workflows.',
    tags: ['Docker', 'Containers', 'DevOps'],
    linkedProjectIds: ['portfolio-repo'],
  },
  {
    id: 'cert-reverse-engineering-windows',
    title: 'Reverse Engineering Windows Executables',
    kind: 'certification',
    kinds: ['certification'],
    dateLabel: '2024',
    sortDate: '2024-07-01',
    source: 'LinkedIn',
    summary: 'Digital forensics certification for cyber professionals focused on Windows executable reverse engineering.',
    tags: ['Reverse Engineering', 'Digital Forensics', 'Windows', 'Cybersecurity'],
    linkedProjectIds: ['arcane'],
  },
  {
    id: 'cert-cnn-python',
    title: 'Deep Learning CNN with Python',
    kind: 'certification',
    kinds: ['certification'],
    dateLabel: '2023',
    sortDate: '2023-10-01',
    source: 'LinkedIn',
    summary: 'Packt certification covering convolutional neural networks, deep learning foundations, and Python model workflows.',
    tags: ['CNN', 'Deep Learning', 'Python'],
    linkedProjectIds: ['maritime-deficiency-severity', 'hailo-training'],
  },
  {
    id: 'cert-rnn-python',
    title: 'Deep Learning RNN with Python',
    kind: 'certification',
    kinds: ['certification'],
    dateLabel: '2023',
    sortDate: '2023-09-01',
    source: 'LinkedIn',
    summary: 'Packt certification covering recurrent neural networks and sequence-modeling foundations.',
    tags: ['RNN', 'Deep Learning', 'Python'],
    linkedProjectIds: ['maritime-deficiency-severity'],
  },
  {
    id: 'cert-unity-csharp-games',
    title: 'Learning C# by Developing Games with Unity',
    kind: 'certification',
    kinds: ['certification'],
    dateLabel: '2023',
    sortDate: '2023-08-01',
    source: 'LinkedIn',
    summary: 'Packt certification connecting C# fundamentals with Unity game-development workflows.',
    tags: ['Unity', 'C#', 'Game Development'],
    linkedProjectIds: ['on-the-spectrum'],
  },
  {
    id: 'cert-excel-advanced',
    title: 'Excel 2019 Advanced',
    kind: 'certification',
    kinds: ['certification'],
    dateLabel: '2023',
    sortDate: '2023-07-01',
    source: 'LinkedIn',
    summary: 'Intellezy certification supporting the Excel and VBA automation work used in operations reporting.',
    tags: ['Excel', 'Analytics', 'Automation'],
    linkedProjectIds: ['information-lab'],
  },
  {
    id: 'cert-reinforcement-learning',
    title: 'Reinforcement Learning and Deep RL Python',
    kind: 'certification',
    kinds: ['certification'],
    dateLabel: '2023',
    sortDate: '2023-06-01',
    source: 'LinkedIn',
    summary: 'Packt certification covering reinforcement learning theory and Python implementation projects.',
    tags: ['Reinforcement Learning', 'Deep RL', 'Python'],
    linkedProjectIds: ['on-the-spectrum'],
  },
];

const fieldNoteMergeKeyById: Record<string, string> = {
  'project-maritime-deficiency-severity': 'project:maritime-deficiency-severity',
  'software-achievement-5': 'project:maritime-deficiency-severity',
  'nvidia-disaster-risk': 'certification:nvidia-disaster-risk',
  'software-achievement-1': 'certification:nvidia-disaster-risk',
  'career-yeswehack-independent-researcher': 'career:bug-bounty',
  'cyber-achievement-3': 'career:bug-bounty',
};

const normalizeMergeText = (value: string) => (
  value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
);

const normalizeTagText = (value: string) => normalizeMergeText(value);

const projectTitleById = new Map(projectHighlights.map((project) => [project.id, normalizeMergeText(project.title)]));

const stableUnique = <T,>(values: T[], getKey: (value: T) => string): T[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = getKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const mergeLinks = (current?: FieldNoteLink[], next?: FieldNoteLink[]) => {
  const links = stableUnique([...(current ?? []), ...(next ?? [])], (link) => link.url);
  return links.length ? links : undefined;
};

const getFieldNoteMergeKey = (note: FieldNote) => {
  const explicitKey = fieldNoteMergeKeyById[note.id];
  if (explicitKey) return explicitKey;

  const primaryProjectId = note.linkedProjectIds?.length === 1 ? note.linkedProjectIds[0] : undefined;
  const projectTitle = primaryProjectId ? projectTitleById.get(primaryProjectId) : undefined;
  const noteTitle = normalizeMergeText(note.title);

  if (primaryProjectId && projectTitle && (noteTitle.includes(projectTitle) || projectTitle.includes(noteTitle))) {
    return `project:${primaryProjectId}`;
  }

  return `title:${noteTitle}`;
};

const mergeFieldNotes = (notes: FieldNote[]) => {
  const mergedByKey = new Map<string, FieldNote>();

  notes.forEach((note) => {
    const key = getFieldNoteMergeKey(note);
    const existing = mergedByKey.get(key);
    if (!existing) {
      mergedByKey.set(key, { ...note, aliases: note.aliases ?? [] });
      return;
    }

    const aliases = stableUnique(
      [existing.id, ...(existing.aliases ?? []), note.id, ...(note.aliases ?? [])],
      (alias) => alias,
    ).filter((alias) => alias !== existing.id);
    const kinds = stableUnique([...existing.kinds, ...note.kinds], (kind) => kind);
    const tags = stableUnique([...existing.tags, ...note.tags], normalizeTagText);
    const linkedProjectIds = stableUnique(
      [...(existing.linkedProjectIds ?? []), ...(note.linkedProjectIds ?? [])],
      (projectId) => projectId,
    );
    const people = stableUnique([...(existing.people ?? []), ...(note.people ?? [])], (person) => person);
    const organizations = stableUnique(
      [...(existing.organizations ?? []), ...(note.organizations ?? [])],
      (organization) => organization,
    );
    const nextIsNewer = note.sortDate.localeCompare(existing.sortDate) > 0;

    mergedByKey.set(key, {
      ...existing,
      sortDate: nextIsNewer ? note.sortDate : existing.sortDate,
      summary: note.summary.length > existing.summary.length ? note.summary : existing.summary,
      tags,
      kinds,
      aliases,
      linkedProjectIds: linkedProjectIds.length ? linkedProjectIds : undefined,
      people: people.length ? people : undefined,
      organizations: organizations.length ? organizations : undefined,
      links: mergeLinks(existing.links, note.links),
      imageUrl: existing.imageUrl ?? note.imageUrl,
      npcDialogue: (note.npcDialogue?.length ?? 0) > (existing.npcDialogue?.length ?? 0)
        ? note.npcDialogue
        : existing.npcDialogue,
    });
  });

  return Array.from(mergedByKey.values()).sort((a, b) => b.sortDate.localeCompare(a.sortDate));
};

const rawFieldNotes: FieldNote[] = [
  ...eventHighlights.map(eventToFieldNote),
  ...projectHighlights.map(projectToFieldNote),
  ...softwareEngineerData.achievements.map((achievement) => achievementToFieldNote('software', achievement)),
  ...cybersecurityData.achievements.map((achievement) => achievementToFieldNote('cyber', achievement)),
  ...careerAndEducationNotes,
  ...certificationNotes,
];

export const fieldNotes: FieldNote[] = mergeFieldNotes(rawFieldNotes);

export const fieldNoteByIdOrAlias = new Map<string, FieldNote>(
  fieldNotes.flatMap((note) => (
    [note.id, ...(note.aliases ?? [])].map((id) => [id, note] as const)
  )),
);
