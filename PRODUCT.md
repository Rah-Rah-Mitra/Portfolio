# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Primary: recruiters and hiring managers evaluating Rahul Mitra for graduate and early-career engineering roles across software, AI, operations research, solution architecture, spatial computing, and cybersecurity.
- Secondary: engineering peers, collaborators, hackathon and civic-tech partners, and visitors exploring the technical experiments in greater depth.
- The primary recruiter visit is brief and evidence-seeking; the portfolio must communicate Rahul's positioning, strongest proof, and an appropriate resume path within roughly 20 seconds.

## Product Purpose

Present Rahul as a multidisciplinary engineer who connects perception and uncertainty to optimization, software systems, security, and deployment. The portfolio must make truthful technical depth easy to scan, preserve a complete evidence archive, and reward deeper exploration through the assistant, the FX panel, the Camera Lab, and the Systems Lab.

Success means a visitor can quickly understand Rahul's engineering identity, inspect representative work and proof, choose a role-targeted resume, and contact him without needing to decode the experimental interactions.

## Positioning

This portfolio explains intelligent systems as one connected engineering practice: 3D perception and mathematical foundations, probabilistic reasoning, optimization and digital twins, software and AI systems, operational deployment, and an adversarial security lens. It pairs recruiter-ready editorial clarity with working technical experiments rather than presenting a generic personal landing page.

## Operating Context

- Single-page portfolio drawn as the Industry "Field Workbench": draggable windows over a blueprint desk on desktop, one searchable registry (the Field Index) on mobile, and a visible, searchable, filterable index containing every project.
- One unified evidence model; no profile lenses or lens-dependent content branches.
- Resume library with eight DOCX/PDF pairs (six role-targeted one-pagers, a one-page Highlights best-of, and the two-page General / Master CV).
- Resume Builder: compose a targeted resume from the evidence record, on the site or through the MCP endpoint. Selection only — the builder cannot invent a line.
- "Ask this portfolio" assistant backed by the private `/api/page-agent` endpoint and a safe local fallback.
- Labs that run real models on synthetic data: the Camera Lab (camera models and a Zhang calibration) and, in the Systems Lab, a mechanism bench, a flow-shop sequencing model, and a contained matter.js drop test. Beside them, the Estate window (desktop only): Sample Town N5, a generated sample HDB neighbourhood built by Rahul's Bonsai-Estate pipeline, as a still render with a text registry of its fourteen buildings, and a 3D viewer to orbit it, fly to a building, read any storey as a plan cut with its rooms listed, and walk in through its void decks, stairs and lifts. The assistant can open it on a building, a storey or a walk-in.
- An optional FX panel: Pause all motion, opt-in sound cues, and two desktop-only desk backdrops (an N-body gravity field and a WebGL2 fluid), both off by default. Save-Data, reduced motion, and a `?mode=scan` link never load the backdrops. Under the same three the Estate shows its still render until the visitor asks for the 3D view, and the button says how much it downloads; under Save-Data the 3D view loads lean (plain massing blocks everywhere, full detail only for the building in focus) until the visitor asks for more. While the Estate's 3D view is in use, a running desk backdrop holds still rather than share the GPU.
- One light look; no dark scheme and no appearance preferences. Every window body is prerendered into the HTML, so crawlers, machine readers and hydration get the full evidence. Without JavaScript the desktop shows only the Home and Selected Work windows; the rest is in the DOM but hidden until JS runs.
- PostHog analytics and feature flags remain part of the runtime.

## Capabilities and Constraints

- Preserve React 19, TypeScript, Vite, Tailwind (preflight and `sr-only` only), Matter.js (the Systems Lab drop test), three.js (the Estate window, a lazy chunk loaded only when that window opens), the existing local proxy, and Vercel serverless API behavior. Three.js left with the retired 3D world in 2026-10 and came back only for the Estate; do not add another WebGL scene library.
- Keep API keys and model calls server-side; never expose deployment secrets or private keys.
- Keep all truthful projects, achievements, events, roles, education, certificates, resume variants, profile imagery, project imagery, and project 3D models accessible.
- `portfolioData.ts` and the current resume documents are factual authorities. Do not fabricate experience, metrics, employers, qualifications, project outcomes, or robotics/SLAM/Gaussian-splatting work.
- Robotics, localization, mapping, uncertainty, optimization, and Gaussian-splat-inspired motifs may frame interests and visual language but must not be represented as unsupported professional experience.
- Default content must remain readable and operable if optional effects or heavy assets fail.
- Canonical production domain is `https://rahul-mitra.com/`.

## Brand Commitments

- Name: Rahul Mitra.
- Voice: precise, technically literate, candid, warm, and evidence-led.
- Preserve the playful experimental personality, multidisciplinary systems/software and cybersecurity evidence, the working labs, the FX panel, and the AI assistant as recognizable signatures.
- Binding direction: the Industry blueprint drawing set (`DESIGN.md`, `design/industry/`) in which real work dominates and every lab measures something real.
- Avoid generic AI gradients, excessive neon/glitch styling, game-UI framing, interchangeable card walls, meaningless equations, stock robot imagery, and motion that competes with reading.

## Evidence on Hand

- Structured product truth and proof: `portfolioData.ts`.
- Existing public repositories and external evidence links in `portfolioData.ts`.
- Profile and achievement imagery: `public/images/`.
- Certificates: `public/certificates/`.
- OnTheSpectrum's model and preview render: `public/models/` and `public/renders/`.
- Historical and current resume sources: `public/resume/archive/`, `public/resume/template/`, and `public/resume/generated/`.
- Existing assistant, analytics, effects, and lab implementations under `components/`, `contexts/`, `server/`, `api/`, and `lib/`.
- No evidence supports claiming professional SLAM, localization, Gaussian splatting, or probabilistic robotics project delivery; future work must not imply it.

## Product Principles

1. Evidence before spectacle: make real work, contributions, methods, and proof immediately understandable.
2. Connected engineering story: show how mathematics, perception, optimization, software, AI, operations, and security reinforce each other.
3. Progressive depth: essential information is visible by default; archives, labs, and effects are optional layers that never gate a fact.
4. Human technicality: pair rigorous notation and systems thinking with clear language, warm photography, and approachable interaction.
5. Responsible truth: preserve confidentiality and responsible disclosure boundaries, and never convert visual motifs into unsupported claims.

## Accessibility & Inclusion

- Meet WCAG-conscious contrast, semantic heading, landmark, keyboard, focus, touch-target, alt-text, and form-label expectations.
- Respect `prefers-reduced-motion` and the FX "Pause all motion" switch across every animation, canvas, and lab (`lib/motion.ts`).
- Keep controls understandable without color alone and keep recruiter-critical content available without animation or pointer precision.
- Support desktop, tablet, mobile, and 320px narrow layouts without horizontal overflow or obstructed content.
