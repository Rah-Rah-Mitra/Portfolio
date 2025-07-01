
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
  contactEmail: "rahul.mitra.dev@example.com",
  linkedinUrl: "https://linkedin.com/in/rahulmitra-dev",
  githubUrl: "https://github.com/rahulmitra-dev",
  twitterUrl: "https://twitter.com/rahulmitra_dev",
  achievements: [
    { 
      id: 1, 
      title: "AI-Powered Customer Support Chatbot", 
      description: "Developed and deployed an AI chatbot that reduced customer service response times by 40% and improved user satisfaction scores by 25%. Integrated with existing CRM systems.",
      date: "2023 Q4", 
      imageUrl: assets.SE_ACHIEVEMENT_CHATBOT, 
      category: "AI & Machine Learning",
      tags: ["Python", "NLP", "Dialogflow", "API Integration"]
    },
    { 
      id: 2, 
      title: "Global E-commerce Platform Optimization", 
      description: "Led the performance optimization initiative for a global e-commerce site, resulting in a 2s reduction in average page load time and a 15% conversion rate increase.", 
      date: "2022 - 2023", 
      imageUrl: assets.SE_ACHIEVEMENT_ECOMMERCE, 
      category: "Web Development",
      tags: ["React", "Node.js", "AWS", "Performance Tuning"]
    },
    { 
      id: 3, 
      title: "Published Research on Quantum Computing Algorithms", 
      description: "Co-authored and published a paper in a peer-reviewed journal on novel algorithms for quantum simulations, contributing to advancements in the field.", 
      date: "2021", 
      imageUrl: assets.SE_ACHIEVEMENT_QUANTUM, 
      category: "Research",
      tags: ["Quantum Computing", "Algorithm Design", "Scientific Publication"]
    },
     { 
      id: 4, 
      title: "Community Coding Bootcamp Mentor", 
      description: "Volunteered as a mentor for a local coding bootcamp, guiding aspiring developers and contributing to curriculum development for web fundamentals.", 
      date: "Ongoing", 
      imageUrl: assets.SE_ACHIEVEMENT_BOOTCAMP, 
      category: "Community",
      tags: ["Mentorship", "Education", "JavaScript", "HTML/CSS"]
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
  contactEmail: "rahul.mitra.sec@example.com",
  linkedinUrl: "https://linkedin.com/in/rahulmitra-sec",
  githubUrl: "https://github.com/rahulmitra-sec",
  twitterUrl: "https://twitter.com/rahulmitra_sec",
  achievements: [
    { 
      id: 1, 
      title: "Critical Vulnerability Disclosure", 
      description: "Identified and reported a critical RCE vulnerability in a major financial services application, preventing potential data breaches. Acknowledged in their Hall of Fame.",
      date: "2023 Q3", 
      imageUrl: assets.CS_ACHIEVEMENT_BUG_BOUNTY, 
      category: "Bug Bounty",
      tags: ["RCE", "WebApp Pentesting", "Responsible Disclosure"]
    },
    { 
      id: 2, 
      title: "1st Place - National CTF Competition", 
      description: "Led a team to victory in the 'Defend the Flag' 2022 national cybersecurity competition, excelling in cryptography and reverse engineering challenges.", 
      date: "2022", 
      imageUrl: assets.CS_ACHIEVEMENT_CTF, 
      category: "Competition",
      tags: ["CTF", "Teamwork", "Problem Solving"]
    },
    { 
      id: 3, 
      title: "Open-Source Forensics Tool", 
      description: "Developed 'MemTrace', an open-source memory forensics tool for analyzing RAM dumps, now used by investigators to trace malicious activity.", 
      date: "2021", 
      imageUrl: assets.CS_ACHIEVEMENT_FORENSICS, 
      category: "Tool Development",
      tags: ["Python", "Forensics", "Open Source", "Memory Analysis"]
    },
     { 
      id: 4, 
      title: "Security Conference Speaker", 
      description: "Presented research on IoT device exploitation techniques at the 'SecureCon' conference, sharing insights with industry professionals.", 
      date: "2023", 
      imageUrl: assets.CS_ACHIEVEMENT_CONFERENCE, 
      category: "Public Speaking",
      tags: ["IoT Security", "Research", "Exploit Development"]
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