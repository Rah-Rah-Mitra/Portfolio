
import React from 'react';
import { EventHighlight, PortfolioData, ProjectHighlight } from './types';
import { CodeBracketIcon, AcademicCapIcon, CommandLineIcon, DevicePhoneMobileIcon, ServerStackIcon, PaintBrushIcon } from './components/icons/TechIcons';
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
      id: 6,
      title: "AsyncDDGS — Open-Source PyPI Library",
      description: "Engineered and maintain AsyncDDGS, an asyncio-first, aiohttp-based DuckDuckGo search client on PyPI. Achieves sub-100ms query responses via Python's event loop, bypassing the GIL bottleneck. Actively referenced in starred AI projects (SearchGPT, Auto-Photoshop-StableDiffusion-Plugin) and Discord bot frameworks. Maintained with pytest CI/CD via GitHub Actions.",
      date: "2024 – Present",
      imageUrl: assets.SE_ACHIEVEMENT_ASYNCDDGS,
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
  experiences: [
    {
      id: 1,
      role: "Base Support Assistant",
      company: "Singapore Navy",
      duration: "Jan 2022 – Jan 2023",
      responsibilities: [
        "Analyzed complex food-waste cycles across military units, identifying systemic inefficiencies in manual data aggregation processes.",
        "Engineered an Excel VBA automation solution that compressed a 6-month manual reporting cycle into a sub-3-minute automated process.",
        "Delivered operational innovation within a strictly constrained, security-classified environment using only approved legacy tooling.",
        "Demonstrated a core ISE bias toward process optimization and automation — reducing human error and freeing analyst capacity."
      ],
      logoUrl: assets.SE_EXP_LOGO_NAVY
    },
    {
      id: 2,
      role: "Astronomy Head & Robotics Member",
      company: "STEM Inc. (ASRJC)",
      duration: "Mar 2019 – Aug 2020",
      responsibilities: [
        "Organized and led weekly stargazing sessions and celestial observation programs, disseminating STEM knowledge to the broader school community.",
        "Competed in the 7th Singapore Astronomical Olympiad, applying rigorous scientific methodology under competitive conditions.",
        "Engineered an autonomous robot for the National Robotics Challenge, gaining foundational hands-on experience with autonomous systems.",
        "Received the ASRJC Outstanding Contribution Award for sustained, high-level commitment to institutional excellence and collaborative leadership."
      ],
      logoUrl: assets.SE_EXP_LOGO_STEMINC
    },
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
      date: "2023 – Present",
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
      date: "2023 – Present",
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
  experiences: [
    {
      id: 1,
      role: "Independent Bug Bounty Researcher",
      company: "YesWeHack Platform",
      duration: "2023 – Present",
      responsibilities: [
        "Orchestrate full-stack web application assessments against governmental and infrastructural targets (GovTech GBBP12/13, LTA, 13+ programs).",
        "Discover and responsibly disclose SSRF, CSRF, SQL/NoSQL Injection, and authentication bypass vulnerabilities with detailed technical reports.",
        "Leverage Burp Suite for granular MitM HTTP interception and Wireshark for OSI Layer 3–4 deep packet inspection and TLS handshake analysis.",
        "Deploy bespoke Python/Bash scripts to automate endpoint fuzzing, payload delivery, and enumeration at scale."
      ],
      logoUrl: assets.CS_EXP_LOGO_YESWEHACK
    },
    {
      id: 2,
      role: "Base Support Assistant",
      company: "Singapore Navy",
      duration: "Jan 2022 – Jan 2023",
      responsibilities: [
        "Operated within a security-classified military environment, developing a strong appreciation for operational security and access control.",
        "Delivered automation tooling (Excel VBA) under strict policy constraints, demonstrating pragmatic engineering in adversarial environments.",
        "Managed sensitive operational data with strict confidentiality protocols aligned with military security standards."
      ],
      logoUrl: assets.CS_EXP_LOGO_NAVY
    },
    {
      id: 3,
      role: "Robotics Member & Astronomy Head",
      company: "STEM Inc. (ASRJC)",
      duration: "Mar 2019 – Aug 2020",
      responsibilities: [
        "Engineered autonomous robots for the National Robotics Challenge — foundational experience in autonomous systems and sensor integration.",
        "Competed in the 7th Singapore Astronomical Olympiad, cultivating rigorous analytical and problem-solving discipline.",
        "Received the ASRJC Outstanding Contribution Award for leadership and technical contributions."
      ],
      logoUrl: assets.CS_EXP_LOGO_STEMINC
    },
  ],
};

export const projectHighlights: ProjectHighlight[] = [
  {
    id: 'on-the-spectrum',
    title: 'OnTheSpectrum',
    category: '3D Asset Pipeline',
    description: 'A local-first Blender-to-Three.js asset and world prototyping pipeline with generated GLBs, metadata, previews, and playable world QA.',
    tags: ['Python', 'Three.js', 'Blender MCP', 'GLB', 'World Builder'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/OnTheSpectrum',
    imageUrl: '/renders/on_the_spectrum-painter-chibi-preview.png',
    accent: 'cyan',
    linkedEventIds: ['january-gauntlet-2026'],
    npcRole: '3D world architect',
  },
  {
    id: 'volt-pulse-sg',
    title: 'Volt Pulse SG',
    category: 'Agentic AI & Sustainability',
    description: 'Top 8 finalist at SMU Hack For Cities 2026: an agentic AI system for household energy-cost tracking, multilingual retrieval, and recommendation routing.',
    tags: ['Agentic AI', 'SEALION', 'Supabase', 'RRF', 'Net Zero'],
    accent: 'green',
    linkedEventIds: ['smu-hack-for-cities-2026'],
    npcRole: 'sustainability systems guide',
  },
  {
    id: 'waaah-comics',
    title: 'Waaah Comics',
    category: 'Generative AI & Computer Vision',
    description: 'A 24-hour build turning physical hand gestures into digital comic strips with MediaPipe 3D landmarks, Gemini, Veo, and canvas tooling.',
    tags: ['MediaPipe', 'Gemini', 'Veo', 'Konva.js', 'Computer Vision'],
    liveUrl: 'https://lnkd.in/gneUG9fj',
    accent: 'violet',
    linkedEventIds: ['january-gauntlet-2026', 'waaah-comics'],
    npcRole: 'gesture-to-story creator',
  },
  {
    id: 'smart-exam',
    title: 'SmartExam',
    category: 'AI Agents & RAG',
    description: 'A multi-agent autonomous exam-generation system from varied source material, built for the GovTech x NTUPC Product Hackathon.',
    tags: ['Next.js', 'RAG', 'AI Agents', 'System Design'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/SmartExam',
    imageUrl: assets.SE_ACHIEVEMENT_SMARTEXAM,
    accent: 'blue',
    linkedEventIds: ['january-gauntlet-2026'],
    npcRole: 'education-agent guide',
  },
  {
    id: 'ethos-lens',
    title: 'EthosLens',
    category: 'AI Research Engine',
    description: 'An automated research engine scoring brands on ethical and sustainability practices, built at LifeHack 2025.',
    tags: ['FastAPI', 'Python', 'LangChain', 'Sustainability'],
    imageUrl: assets.SE_ACHIEVEMENT_ETHOSLENS,
    accent: 'red',
    linkedEventIds: ['january-gauntlet-2026'],
    npcRole: 'ethical intelligence guide',
  },
  {
    id: 'project-utopia',
    title: 'Project Utopia',
    category: 'Situational Awareness',
    description: 'A real-time global intelligence dashboard for AI-powered news aggregation, geopolitical monitoring, and infrastructure tracking.',
    tags: ['Dashboard', 'OSINT', 'Geospatial', 'AI'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/Project-Utopia',
    accent: 'amber',
    linkedEventIds: ['january-gauntlet-2026'],
    npcRole: 'global-systems analyst',
  },
  {
    id: 'arcane',
    title: 'Arcane',
    category: 'Security Tooling',
    description: 'A Rust-forward security and red-team tooling track connected to Arcane, Arcane-PP, Arcane-GLM, and Arcane-OCR experiments.',
    tags: ['Rust', 'Security', 'Automation', 'OCR'],
    repoUrl: 'https://github.com/Rah-Rah-Mitra/Arcane',
    accent: 'violet',
    linkedEventIds: ['certification-trail'],
    npcRole: 'security tooling guide',
  },
  {
    id: 'churp',
    title: 'Churp',
    category: 'Citizen Developer Platform',
    description: 'A Sparks by PA continuation project for Tengah community gardening: smarter plot management and feedback workflows.',
    tags: ['Smart Nation', 'Community', 'Product', 'Civic Tech'],
    accent: 'green',
    linkedEventIds: ['sparks-by-pa-churp'],
    npcRole: 'community systems guide',
  },
];

export const eventHighlights: EventHighlight[] = [
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
    title: 'Abbott Internship',
    dateLabel: 'Posted Jan 2026',
    source: 'LinkedIn',
    summary: 'Started a new role as Data Analytics & Project/Product Management Intern at Abbott.',
    tags: ['Data Analytics', 'Product Management', 'Internship'],
    organizations: ['Abbott'],
    linkedProjectIds: ['project-utopia'],
    npcDialogue: 'The Abbott node connects analytics with product judgment: turning messy signals into decisions people can act on.',
  },
  {
    id: 'sparks-by-pa-churp',
    title: 'Sparks by PA - Churp',
    dateLabel: '2025',
    source: 'LinkedIn',
    summary: 'Continued Churp as a Citizen Developer effort after Sparks by PA, focused on smarter plot management and feedback solutions for Tengah community gardening.',
    tags: ['Citizen Developer', 'Smart Nation', 'Community Innovation'],
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
