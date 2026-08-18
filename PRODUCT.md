# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Primary: recruiters and hiring managers evaluating Rahul Mitra for graduate and early-career engineering roles across software, AI, operations research, solution architecture, spatial computing, and cybersecurity.
- Secondary: engineering peers, collaborators, hackathon and civic-tech partners, and visitors exploring the technical experiments in greater depth.
- The primary recruiter visit is brief and evidence-seeking; the portfolio must communicate Rahul's positioning, strongest proof, and an appropriate resume path within roughly 20 seconds.

## Product Purpose

Present Rahul as a multidisciplinary engineer who connects perception and uncertainty to optimization, software systems, security, and deployment. The portfolio must make truthful technical depth easy to scan, preserve a complete evidence archive, and reward deeper exploration through the assistant, Effects Lab, Camera Laboratory, and shared optical test bench.

Success means a visitor can quickly understand Rahul's engineering identity, inspect representative work and proof, choose a role-targeted resume, and contact him without needing to decode the experimental interactions.

## Positioning

This portfolio explains intelligent systems as one connected engineering practice: 3D perception and mathematical foundations, probabilistic reasoning, optimization and digital twins, software and AI systems, operational deployment, and an adversarial security lens. It pairs recruiter-ready editorial clarity with working technical experiments rather than presenting a generic personal landing page.

## Operating Context

- Single-page portfolio with anchored navigation and a visible, searchable, filterable index containing every project.
- One unified evidence model; no profile lenses or lens-dependent content branches.
- Role-targeted resume library with seven DOCX/PDF pairs.
- "Ask this portfolio" assistant backed by the private `/api/page-agent` endpoint and a safe local fallback.
- Optional Effects Lab plus an Explore World link to the shared `#world` optical-test-bench anchor. Guided and Explore use the same lazy renderer and no separate world modal ships.
- Quick Scan is the canonical static-first route. It preserves the resolved Dark or Light scheme and keeps recruiter evidence available without background simulation, video, or heavy rendering.
- PostHog analytics and feature flags remain part of the runtime.

## Capabilities and Constraints

- Preserve React 19, TypeScript, Vite, Tailwind, Three.js, Matter.js, the existing local proxy, and Vercel serverless API behavior.
- Keep API keys and model calls server-side; never expose deployment secrets or private keys.
- Keep all truthful projects, achievements, events, roles, education, certificates, resume variants, profile imagery, project imagery, and 3D assets accessible.
- `portfolioData.ts` and the current resume documents are factual authorities. Do not fabricate experience, metrics, employers, qualifications, project outcomes, or robotics/SLAM/Gaussian-splatting work.
- Robotics, localization, mapping, uncertainty, optimization, and Gaussian-splat-inspired motifs may frame interests and visual language but must not be represented as unsupported professional experience.
- Default content must remain readable and operable if optional effects or heavy assets fail.
- Canonical production domain is `https://rahul-mitra.com/`.

## Brand Commitments

- Name: Rahul Mitra.
- Voice: precise, technically literate, candid, warm, and evidence-led.
- Preserve the playful experimental personality, multidisciplinary systems/software and cybersecurity evidence, Effects Lab, AI assistant, and Explore World optical-test-bench direction as recognizable signatures.
- Binding direction: a clean white laboratory interface in which real work dominates and a graphite-and-teal Optical Courier acts only as a supporting navigation guide inside the shared world.
- Avoid generic AI gradients, excessive neon/glitch styling, game-UI framing, interchangeable card walls, meaningless equations, stock robot imagery, and motion that competes with reading.

## Evidence on Hand

- Structured product truth and proof: `portfolioData.ts`.
- Existing public repositories and external evidence links in `portfolioData.ts`.
- Profile and achievement imagery: `public/images/`.
- Certificates: `public/certificates/`.
- Existing 3D models and renders: `public/models/` and `public/renders/`.
- Historical and current resume sources: `public/resume/archive/`, `public/resume/template/`, and `public/resume/generated/`.
- Existing assistant, analytics, effects, and field-guide implementations under `components/`, `contexts/`, `server/`, `api/`, and `lib/`.
- No evidence supports claiming professional SLAM, localization, Gaussian splatting, or probabilistic robotics project delivery; future work must not imply it.

## Product Principles

1. Evidence before spectacle: make real work, contributions, methods, and proof immediately understandable.
2. Connected engineering story: show how mathematics, perception, optimization, software, AI, operations, and security reinforce each other.
3. Progressive depth: essential information is visible by default; archives and effects are optional layers, while Explore World is a local control surface for the shared optical test bench.
4. Human technicality: pair rigorous notation and systems thinking with clear language, warm photography, and approachable interaction.
5. Responsible truth: preserve confidentiality and responsible disclosure boundaries, and never convert visual motifs into unsupported claims.

## Accessibility & Inclusion

- Meet WCAG-conscious contrast, semantic heading, landmark, keyboard, focus, touch-target, alt-text, and form-label expectations.
- Respect `prefers-reduced-motion` across typography, effects, canvas, and Three.js experiences.
- Keep controls understandable without color alone and keep recruiter-critical content available without animation or pointer precision.
- Support desktop, tablet, mobile, and 320px narrow layouts without horizontal overflow or obstructed content.
