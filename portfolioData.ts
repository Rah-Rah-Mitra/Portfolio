
import React from 'react';
import { PortfolioData } from './types';
import { CodeBracketIcon, AcademicCapIcon, CommandLineIcon, DevicePhoneMobileIcon, ServerStackIcon, PaintBrushIcon } from './components/icons/TechIcons';
import * as assets from './assets';

/**
 * Data for the "Innovative Software Engineer" profile (Light Theme).
 */
export const softwareEngineerData: PortfolioData = {
  name: "Rahul Mitra",
  tagline: "Innovative Software Engineer & Creative Problem Solver",
  bio: "Driven by a passion for technology and a keen eye for detail, I specialize in crafting high-quality software solutions that are both user-friendly and impactful. My journey in tech has been fueled by continuous learning and a desire to build things that make a difference.",
  profileImageUrl: assets.SE_PROFILE_IMAGE,
  contactEmail: "mitrarahul2002@gmail.com",
  linkedinUrl: "https://linkedin.com/in/rahulmitra-dev",
  githubUrl: "https://github.com/Rah-Rah-Mitra",
  instagramUrl: "https://www.instagram.com/rah.rah.mitra/",
  achievements: [
    { 
      id: 4, 
      title: "SmartExam @ GovTech x NTUPC Hackathon 2025", 
      description: "Built 'SmartExam', an advanced, multi-agent autonomous system for generating customized exams from various sources. The project, developed for the GovTech x NTUPC Product Hackathon, features a sophisticated RAG pipeline to automate the entire exam creation lifecycle. Explore the repository at github.com/Rah-Rah-Mitra/SmartExam.",
      date: "2025", 
      imageUrl: assets.SE_ACHIEVEMENT_SMARTEXAM, 
      category: "AI & Full-Stack Development",
      tags: ["AI Agents", "RAG", "System Design", "Hackathon", "Next.js"]
    },
    { 
      id: 3, 
      title: "EthosLens @ LifeHack 2025", 
      description: "As a backend developer for the LifeHack 2025 hackathon, I helped build 'EthosLens,' an automated research engine for sustainability. It analyzes and scores brands on ethical practices using AI. View our project on Devpost (devpost.com/software/ethoslens) or explore the code on GitHub (github.com/Rah-Rah-Mitra/EthosLens).",
      date: "2025", 
      imageUrl: assets.SE_ACHIEVEMENT_ETHOSLENS, 
      category: "AI & Sustainability Tech",
      tags: ["FastAPI", "Python", "LangChain", "Backend", "Hackathon", "Sustainability"]
    },
    { 
      id: 2, 
      title: "AgeWellLah.AI @ HealthHack 2025", 
      description: "Contributed to 'AgeWellLah.AI' for HealthHack 2025, an AI chatbot enhancing value-based healthcare with personalized planners and support. The project leverages InterSystems IRIS and OpenAI for intelligent health management. View the project on GitHub (github.com/ZulfaqarHafez/AgeWellLah.AI).",
      date: "2025", 
      imageUrl: assets.SE_ACHIEVEMENT_AGEWELLAI, 
      category: "AI & HealthTech",
      tags: ["AI Chatbot", "HealthTech", "InterSystems IRIS", "Python", "Hackathon"]
    },
    {
      id: 1,
      title: "Disaster Risk Monitoring Using Satellite Imagery",
      description: "Completed an NVIDIA Deep Learning Institute course focused on applying AI techniques to monitor and assess disaster risks using satellite imagery. Gained hands-on experience with data processing, model training, and analysis of geospatial datasets. (https://learn.nvidia.com/certificates?id=15f34263397c4584b947c5d6b449139a)",
      date: "2023 Dec",
      imageUrl: assets.SE_ACHIEVEMENT_NVIDIA_DIL_DRM,
      category: "AI & HealthTech",
      tags: ["NVIDIA", "Deep Learning", "Geospatial", "Python", "Satellite Imagery"]
    }
  ],
  skills: [
    { id: 1, name: "TypeScript", icon: React.createElement(CodeBracketIcon, { className: "w-6 h-6" }) },
    { id: 2, name: "React & Next.js", icon: React.createElement(DevicePhoneMobileIcon, { className: "w-6 h-6" }) },
    { id: 3, name: "Node.js & Express", icon: React.createElement(ServerStackIcon, { className: "w-6 h-6" }) },
    { id: 4, name: "Python (Flask, Django)", icon: React.createElement(CommandLineIcon, { className: "w-6 h-6" }) },
    { id: 5, name: "Cloud Platforms (AWS, Azure)", icon: React.createElement(ServerStackIcon, { className: "w-6 h-6" }) },
    { id: 6, name: "Databases (SQL, NoSQL)", icon: React.createElement(ServerStackIcon, { className: "w-6 h-6" }) },
    { id: 7, name: "UI/UX Principles", icon: React.createElement(PaintBrushIcon, { className: "w-6 h-6" }) },
    { id: 8, name: "Agile Methodologies", icon: React.createElement(AcademicCapIcon, { className: "w-6 h-6" }) },
  ],
  experiences: [
    { 
      id: 1, 
      role: "Lead Software Engineer", 
      company: "Innovatech Solutions", 
      duration: "Mar 2021 - Present", 
      responsibilities: [
        "Architecting and developing scalable microservices for flagship products.",
        "Leading a team of 8 engineers, fostering a collaborative and high-performance culture.",
        "Driving adoption of best practices in code quality, testing, and CI/CD pipelines.",
        "Collaborating with product managers and designers to translate requirements into technical solutions."
      ],
      logoUrl: assets.SE_EXP_LOGO_INNOVATECH
    },
    { 
      id: 2, 
      role: "Full-Stack Developer", 
      company: "Digital Creations Co.", 
      duration: "Jul 2018 - Feb 2021", 
      responsibilities: [
        "Developed and maintained responsive web applications using React, Angular, and Vue.js.",
        "Built RESTful APIs and integrated with third-party services.",
        "Participated in full software development lifecycle, from concept to deployment.",
        "Contributed to database design and optimization."
      ],
      logoUrl: assets.SE_EXP_LOGO_DIGITALCO
    },
    { 
      id: 3, 
      role: "Junior Developer", 
      company: "Startup Hub X", 
      duration: "Jun 2017 - Jul 2018", 
      responsibilities: [
        "Assisted senior developers in building and testing new application features.",
        "Gained experience with version control (Git) and agile development processes.",
        "Provided technical support and bug fixes for existing applications."
      ],
      logoUrl: assets.SE_EXP_LOGO_STARTUPHUBX
    },
  ],
};

/**
 * Data for the "Cybersecurity Analyst" profile (Dark Theme).
 */
export const cybersecurityData: PortfolioData = {
  name: "R. Mitra",
  tagline: "Cybersecurity Analyst & Digital Guardian",
  bio: "Specializing in threat detection, penetration testing, and digital forensics. I'm dedicated to protecting digital assets and fortifying networks against emerging cyber threats. My mission is to build a more secure digital future, one vulnerability at a time.",
  profileImageUrl: assets.CS_PROFILE_IMAGE,
  contactEmail: "mitrarahul2002@gmail.com",
  linkedinUrl: "https://linkedin.com/in/rahulmitra-dev",
  githubUrl: "https://github.com/Rah-Rah-Mitra",
  instagramUrl: "https://www.instagram.com/rah.rah.mitra/",
  achievements: [
    { 
      id: 2, 
      title: "Active Bug Bounty Hunter", 
      description: "Regularly participate in bug bounty programs on the YesWeHack platform. Key engagements include Singapore's GOVTECH Bug Bounty Programs (VDP-12, VDP-13) and over 13 other private/public programs, identifying and reporting vulnerabilities.",
      date: "Present - 2023", 
      imageUrl: assets.CS_ACHIEVEMENT_BUG_BOUNTY, 
      category: "Vulnerability Disclosure",
      tags: ["Bug Bounty", "YesWeHack", "GovTech", "Security Research"]
    },
    { 
      id: 1, 
      title: "CTF @ DSTA BRINHACK 2025 Debut", 
      description: "Made my CTF debut at DSTA BRINHACK 2025. Our team secured a commendable top-quartile finish, placing around 90th among more than 400 fiercely competing teams.",
      date: "2025", 
      imageUrl: assets.CS_ACHIEVEMENT_BRAINHACK_2025, 
      category: "Competition",
      tags: ["CTF", "Teamwork", "DSTA", "First-Time"]
    }
  ],
  skills: [
    { id: 1, name: "Penetration Testing", icon: React.createElement(CommandLineIcon, { className: "w-6 h-6" }) },
    { id: 2, name: "Metasploit Framework", icon: React.createElement(CodeBracketIcon, { className: "w-6 h-6" }) },
    { id: 3, name: "Network Analysis (Wireshark)", icon: React.createElement(ServerStackIcon, { className: "w-6 h-6" }) },
    { id: 4, name: "Threat Intelligence", icon: React.createElement(AcademicCapIcon, { className: "w-6 h-6" }) },
    { id: 5, name: "Cryptography", icon: React.createElement(CodeBracketIcon, { className: "w-6 h-6" }) },
    { id: 6, name: "Incident Response", icon: React.createElement(DevicePhoneMobileIcon, { className: "w-6 h-6" }) },
    { id: 7, name: "Python (Scapy, Pwntools)", icon: React.createElement(CommandLineIcon, { className: "w-6 h-6" }) },
    { id: 8, name: "Digital Forensics", icon: React.createElement(PaintBrushIcon, { className: "w-6 h-6" }) },
  ],
  experiences: [
    { 
      id: 1, 
      role: "Senior Security Analyst", 
      company: "SecureNet Corp", 
      duration: "Jan 2022 - Present", 
      responsibilities: [
        "Leading penetration testing engagements for web applications and corporate networks.",
        "Developing and implementing incident response protocols.",
        "Analyzing threat intelligence to proactively identify and mitigate risks.",
        "Mentoring junior analysts and improving team's technical capabilities."
      ],
      logoUrl: assets.CS_EXP_LOGO_SECURENET
    },
    { 
      id: 2, 
      role: "Cybersecurity Consultant", 
      company: "CyberDefend Solutions", 
      duration: "May 2019 - Dec 2021", 
      responsibilities: [
        "Conducted security audits and risk assessments for a diverse portfolio of clients.",
        "Provided remediation guidance and strategic security advice.",
        "Developed custom security scripts and tools for automation.",
        "Authored detailed reports on findings for technical and executive audiences."
      ],
      logoUrl: assets.CS_EXP_LOGO_CYBERDEFEND
    },
    { 
      id: 3, 
      role: "IT Support Specialist (Security Focus)", 
      company: "DataSystems Inc.", 
      duration: "Jun 2017 - Apr 2019", 
      responsibilities: [
        "Managed firewall configurations and endpoint protection solutions.",
        "Responded to and investigated initial security alerts.",
        "Educated employees on security best practices and phishing awareness.",
      ],
      logoUrl: assets.CS_EXP_LOGO_DATASYSTEMS
    },
  ],
};
