# Archived Spatial World Upgrade — Historical Migration Prompt

Use the prompt below for a dedicated implementation task. It is intentionally written as an execution brief rather than a mood-board request.

> **Superseded historical migration input (2026-08-17):** This brief predates the continuous optical-test-bench plan. The separate `PortfolioWorld` modal and its FX state were retired in commit `ffceca5`. Preserve this document as architecture, performance, licensing, and asset provenance only; do not execute its separate-world assumptions as current product requirements. Any future implementation must use the shared `#world` optical-test-bench boundary and the current `PRODUCT.md` and `DESIGN.md`. All remaining Build/Secure and lens references below are historical and non-executable; the current product has no lenses.

---

This historical brief addressed a principal real-time 3D engineer, technical artist, interaction designer, accessibility engineer, and web performance lead responsible for replacing Rahul Mitra's now-retired separate Portfolio World.

## Mission

The proposed migration was to replace the former lazy-loaded Three.js modal with a memorable spatial journey matching the interaction density, animation polish, environmental cohesion, sound design, and technical discipline demonstrated by [Messenger by Abeto](https://messenger.abeto.co/), without copying its planet, art, characters, story, UI, topology, or delivery mechanics.

The result must remain Rahul's professional portfolio: a human-centred robotics and intelligent-systems field notebook experienced through registered camera viewpoints. It must foreground truthful work across software and systems engineering, AI, operations research, optimization, 3D computer vision, spatial computing, probabilistic reasoning, solution architecture, and responsible cybersecurity. It must never become a generic game, a cyberpunk lobby, or a collection of purchased assets without narrative purpose.

Do not stop after recommendations, mockups, or a graybox. Inspect the existing code and assets, write the architecture decision, implement the approved delivery tiers, profile them, and verify the result. If proprietary assets, GPU infrastructure, credentials, or license rights are unavailable, finish every independent layer, provide exact integration interfaces and a reproducible handoff, and report the blocked gate precisely.

## Historical system and provenance to preserve

- Workspace: `D:\Portfolio`
- Production site: `https://rahul-mitra.com/`
- Stack: React 19, TypeScript, Vite, Tailwind, Three.js, Matter.js, PostHog, server-side `/api/page-agent`
- Retired source at the time: `components/PortfolioWorld.tsx` (deleted in `ffceca5`; available in Git history)
- Existing GLBs: `public/models/*.glb`
- Factual sources: `portfolioData.ts`, `PRODUCT.md`, `DESIGN.md`, current résumé sources and generated résumés
- Preserve the AI assistant, local fallback, UI commands, FX Lab, Build/Secure lenses, analytics, focus management, reduced-motion behavior, data-driven project content, and complete cleanup of renderers, resources, events, animation frames, pointer lock, and audio.
- Do not fabricate projects, metrics, robotics or SLAM experience, Gaussian-splatting research, professional localization work, or outcomes.
- Do not replace the accessible portfolio page. Any future shared optical test bench is an optional deeper route, never the only way to reach evidence, résumés, contact information, or projects.

## Reference interpretation

Treat Messenger as a quality bar for:

- A coherent world with a clear traversal loop rather than a 3D menu.
- Character, camera, environment, interface, audio, and objectives behaving as one authored system.
- Progressive discovery, contextual interactions, small moments of delight, and meaningful environmental transitions.
- Browser-native delivery discipline. Its current web build exposes a Three.js/WebGL-oriented bundle with WebGPU paths and KTX2, Draco, Meshopt, BVH, and zoned audio capabilities. Learn from the engineering pattern; do not reproduce its assets or implementation.

The portfolio's world must instead feel like a calibrated multi-camera survey of intelligent systems: a warm field station connected to sparse reconstruction sites, optimization paths, observation landmarks, uncertainty regions, and evidence stations.

## Required architecture decision

Start by writing an ADR that compares and prototypes these three options:

1. **Web-native only:** extend the current Three.js implementation, optionally using WebGPU with WebGL2 fallback.
2. **Unreal Pixel Streaming only:** run the packaged Unreal application on GPU infrastructure and stream it to the browser through WebRTC.
3. **Hybrid — expected default:** ship a fast web-native spatial journey to every supported browser, then offer an explicit high-fidelity Unreal session for the Nordic environment and MetaHuman guide when capacity, device, connection, and user choice permit it.

Do not imply that Unreal Engine can be shipped as a normal static WebGL bundle. Epic's supported browser delivery path is Pixel Streaming: the Unreal application runs on a GPU host while video/audio and input travel through WebRTC. Keep the existing Vercel site as the portfolio shell. Host signalling, session orchestration, TURN/STUN, the Pixel Streaming frontend, and GPU workloads on infrastructure suited to long-lived WebSocket/WebRTC sessions.

Choose the hybrid option unless measured evidence makes another option clearly superior. The site must still work when the Unreal service is offline, at capacity, blocked by a corporate firewall, too expensive to start, or unsuitable for the visitor's device.

## Spatial experience concept

Create a short, replayable 5–8 minute journey called **The Perception Field**.

The visitor arrives at an elevated survey point and follows a visible pose path through seven registered viewpoints. Each viewpoint has its own camera pose, landmark geometry, ambient sound, interaction, and evidence surface:

1. **Arrival / Overview:** Rahul's positioning and the map legend.
2. **Systems Workshop:** selected software, digital-twin, and optimization work.
3. **Multi-View Ridge:** accurate 3D computer-vision foundations—projective geometry, camera models, epipolar geometry, absolute pose, structure from motion, bundle adjustment, two-view and multi-view stereo.
4. **Trajectory Trail:** career, education, and selected field notes.
5. **Proof Archive:** achievements, certificates, distinctions, and event evidence.
6. **Dispatch Station:** role-targeted résumé selection and download.
7. **Signal Point:** contact, LinkedIn, GitHub, and a deliberate return to the main portfolio.

Keep project selection data-driven because Rahul will later decide which projects receive limited world space. Never hard-code a shortlist into scene logic. Provide a typed world manifest that maps factual portfolio IDs to zones, camera poses, markers, optional models, dialogue, evidence links, lens priority, and load groups.

Use camera frustums, pose trails, sparse landmarks, reconstruction points, optimization contours, feasible regions, network paths, and uncertainty ellipses as accurate spatial language. They must clarify the journey, not act as equation wallpaper. Gaussian-splat-like point clusters may be used as a visual motif only and must not be described as Rahul's completed research.

## Art direction

Extend the website's documented visual world: warm laboratory paper, deep green-black ink, signal teal, optimization amber, reconstruction violet, and restrained security coral.

Translate those materials into a real-time environment:

- Weathered field instruments, camera calibration targets, survey markers, tracing paper, machined metal, painted timber, water, mist, and warm practical light.
- A quiet Nordic field station rather than a fantasy village or sci-fi command centre.
- Professionally restrained interface layers with Archivo and IBM Plex Mono; remove the current generic neon HUD, glow-heavy crosshair, rounded game panels, and Inter/Arial canvas labels.
- No copied Messenger silhouettes, planet, terrain arrangement, character design, UI, missions, or sound.
- No stock robot illustrations, fake terminal text, meaningless equations, or unearned robotics claims.

## Existing and Fab asset strategy

Inventory every existing `public/models/*.glb` asset before changing it. Record file size, triangle count, material count, texture formats and dimensions, skeleton, animation clips, draw calls, bounds, and license/source. Reuse assets only when they support a named station or interaction. Replace duplicate NPC instances with deliberate roles and LOD-aware variants.

Rahul owns access to the Fab listing [Nordic Fishing Hut — Coastal Lakeside Cabin](https://www.fab.com/listings/e56e7e02-01b8-4a15-a108-aa5d76ea0e10). The listing describes a 1.67 GB Unreal environment with 569 static meshes, 385 textures, 37 master materials, 164 material instances, 10 material functions, Nanite-oriented meshes, openable props, POM, RVT usage, a demo level, and a separate hut/dock level instance.

Use this pack as a source environment for the **Systems Workshop / Dispatch Station**, not as the whole portfolio and not as evidence of Rahul's work. Select only the meshes and props that serve the journey. Do not assume the promotional FluidFlux or Ultra Dynamic Sky setup is included; the listing explicitly says those presentation systems are not included.

**Hard license gate:** the listing currently states “Allows usage with AI: No.” Do not upload, embed, inspect, transform, or derive the proprietary asset binaries through generative-AI services. Do not place Fab source content in the public repository. Verify Rahul's purchased license tier and the current Fab and MetaHuman terms before any production integration. Keep licensed Unreal source assets in an ignored local/depot path. An AI implementation agent may create generic import manifests, validation scripts, Unreal code, and human-executed editor instructions, but it must not ingest restricted asset files unless the applicable license explicitly permits that use.

## MetaHuman strategy

MetaHuman is optional and must earn its cost. Use at most one foreground MetaHuman as a calm field-station guide or narrator; keep the web-native fallback as a stylized existing character or non-human survey instrument. Do not create Rahul's likeness without explicit approval and suitable source material.

For Unreal:

- Assemble an optimized—not cinematic—MetaHuman unless a measured close-up demands higher fidelity.
- Use LODSync with intentional per-platform/per-quality Min LODs.
- Prefer card- or mesh-based hair for normal interaction; strand grooms may appear only in a close-up quality tier that meets the frame budget.
- Limit face and body animation complexity, cloth, physics, shadowed lights, and simultaneous skeletal meshes.
- Use Animation Budget Allocator / visibility-based ticking where suitable.
- Provide idle, orient-to-visitor, short gesture, walk, and dialogue states with clean interruption rules.
- Facial animation and synthesized voice are separate consent and licensing gates. Do not clone Rahul's voice or face by inference.

## Web-native implementation

Build the default experience within the existing React/Three.js boundary unless profiling proves a small additional dependency is justified.

- Keep the world in a lazy chunk and prefetch only after visitor intent or idle time on capable devices.
- Split the world into independently loadable zones and manifest-defined asset groups.
- Use glTF 2.0, Meshopt or Draco mesh compression as measured, KTX2/Basis Universal textures, mipmaps, and texture atlases where visually safe.
- Add `KTX2Loader`, `DRACOLoader` or Meshopt decoder only when the export pipeline actually produces those formats.
- Use BVH-accelerated raycasting/collision for static geometry; do not add a full physics engine unless interactions require it.
- Share geometry and materials, instance repeated props/vegetation, merge static meshes by material and visibility cell, and avoid one draw call per decorative object.
- Bake complex Unreal/PBR material graphs into a small documented web material set. POM, RVTs, Blueprints, Nanite, and Unreal material functions do not transfer directly to Three.js.
- Use authored LODs and impostors for vegetation and distant landmarks.
- Implement adaptive resolution and quality scaling from measured frame time, not only device strings.
- Suspend rendering, animation, audio, loaders, and input when hidden, closed, out of focus, or in reduced-motion/static mode.
- Dispose every GPU resource and abort or ignore stale async loads on exit.
- Use a single controlled animation loop and a central lifetime manager.
- Add spatial ambience, footsteps, interaction cues, and zone crossfades. Audio must begin only after a user gesture, expose mute and volume, respect reduced stimulation, and have captions or visual equivalents for information-bearing sound.
- Support keyboard, mouse, touch, and controller only when each path is tested. Provide click/tap navigation and a visible station list so pointer lock is never mandatory.

## Unreal implementation

Create a separate private Unreal project/repository or depot for licensed source content. Pin an Unreal version compatible with the chosen asset pack, MetaHuman pipeline, and Pixel Streaming generation; do not upgrade the engine mid-milestone.

- Use World Partition or explicit streamed sublevels/data layers for the seven stations.
- Build HLODs for distant environment groups and validate their source LODs.
- Use Nanite for appropriate static geometry in the streamed Unreal tier, but do not treat Nanite as a substitute for material, texture, animation, memory, or network discipline.
- Consolidate the 37 master materials into a small project-specific set where licensing and visual fidelity allow it.
- Audit every material for POM, RVT, translucency, two-sided rendering, overdraw, shader permutations, and texture residency.
- Default to scalable lighting. Compare Lumen against baked/static lighting and reflection captures. Disable hardware ray tracing in the normal streaming tier unless profiling proves it fits both GPU density and cost targets.
- Use dynamic resolution and TSR quality tiers.
- Create deterministic spawn, camera, interaction, and reset states so every streamed session starts cleanly.
- Exchange typed events with the React shell over the Pixel Streaming data channel: station changes, project IDs, analytics-safe interaction names, résumé requests, assistant navigation, mute, quality, reset, and exit.
- Never expose cloud, signalling, TURN, analytics, or model API secrets in the client.

## Pixel Streaming platform

Treat Pixel Streaming as a small production service, not an iframe demo.

- Package the Unreal application for a headless/streaming GPU host.
- Containerize the signalling/frontend services and version them with the Unreal build.
- Provide TLS, STUN/TURN, health checks, observability, rate limits, session authentication, abuse protection, and region-aware routing.
- Use one interactive session per visitor unless a deliberately read-only shared/SFU mode is implemented.
- Add warm-pool, queue, timeout, reconnect, idle shutdown, capacity-full, and service-unavailable states.
- Never auto-start a billable GPU session on page load. Require an explicit “Launch high-fidelity world” action that shows estimated startup time, controls, data use, and a web-native alternative.
- Set hard concurrency and daily cost caps. Log startup latency, stream connection stages, session duration, bitrate, packet loss, input latency, encoder utilization, GPU utilization, exit cause, and fallback cause without recording sensitive interaction content.
- Provide a poster/video preview while a session warms. If startup exceeds the limit, return the visitor to the web-native world with a useful explanation.
- Keep the normal portfolio and résumé downloads online even if every streaming component is down.

## Performance budgets

Measure on representative hardware and connection profiles; do not declare success from a development workstation.

### Main portfolio

- No eager Unreal, MetaHuman, Fab, world audio, or heavy 3D download.
- Preserve Core Web Vitals targets: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at the 75th percentile.
- Opening and closing the world must not leak WebGL contexts, listeners, timers, audio nodes, decoded assets, or animation frames.

### Web-native world

- Interactive bootstrap JavaScript: ≤ 250 KB gzip beyond already-shared application code.
- Initial world payload: ≤ 12 MB desktop and ≤ 6 MB mobile; load additional stations progressively.
- Time to controllable state: ≤ 4 s on a typical broadband desktop and ≤ 8 s on a mid-range mobile Fast 4G profile.
- Target: stable 60 fps desktop and 30–45 fps mobile; reduce quality before allowing sustained frame times above budget.
- Desktop active scene guideline: ≤ 150 draw calls and ≤ 1.5 million visible triangles. Mobile guideline: ≤ 80 draw calls and ≤ 500k visible triangles. Override only with profiler evidence.
- Cap device pixel ratio by quality tier. Avoid 4K render targets and full-resolution post-processing by default.
- Establish explicit texture-memory, geometry-memory, audio-memory, and decoded-asset budgets in the ADR after the asset audit.

### Unreal stream

- Warm first frame target: ≤ 8 s; cold start target: ≤ 25 s with honest progress states.
- Desktop target: up to 1080p/60 with dynamic resolution and a measured bitrate range.
- Mobile target: 720p/30 or an equivalent quality tier with touch-safe controls.
- Adapt bitrate and resolution to packet loss and latency; do not prioritize pristine pixels over controllability.
- Define maximum cost per session and per month before production enablement.

## UX and accessibility

- The first screen explains what the world is, why it is optional, expected load, controls, and how to leave.
- Provide “Guided journey,” “Explore freely,” and “View lightweight map” entries.
- Guided mode moves between authored camera markers with skip/back controls and never causes motion without warning.
- Reduced-motion mode removes camera sweeps, head bob, screen shake, large parallax, motion blur, and aggressive particle motion. Use cuts or short fades.
- Provide a static/2D station navigator, keyboard-operable evidence panels, visible focus, escape behavior, touch targets of at least 44×44 CSS pixels, and screen-reader access to every fact shown in 3D.
- Do not require precise aiming, sound, color, pointer lock, or rapid input.
- Prevent the world, assistant, and FX controls from fighting for focus or stacking multiple modal layers.
- Mobile must never trap the user behind browser chrome, orientation assumptions, or an unreachable exit control.

## AI assistant and FX integration

- Update “Ask this portfolio” commands so factual answers can highlight or navigate to a station, but the assistant must work without opening the world.
- World commands must validate portfolio IDs against the typed manifest and reject invented locations.
- Let the Effects Lab control only documented optional effects and quality tiers. Add an obvious pause/reset. Effects must not reduce legibility or mutate factual content.
- Preserve private `/api/page-agent`, server-side keys, safe local fallback, failure states, analytics privacy, and prompt-injection boundaries.

## Delivery phases and gates

### Phase 0 — Audit and ADR

- Recover and baseline the retired world from Git history only when its measurements inform the shared test-bench ADR; cover desktop, tablet, mobile, reduced motion, low-power GPU, and no-WebGL/failure paths.
- Produce asset inventory, dependency map, flame charts, GPU captures, network waterfall, accessibility tree notes, current cleanup audit, risk register, and cost model.
- Write the three-option ADR and select the delivery model.

**Gate:** no production art integration until budgets, manifest schema, license boundaries, and delivery architecture are approved.

### Phase 1 — Vertical slice

- Implement Arrival, Systems Workshop, and one evidence interaction in the web-native tier.
- Demonstrate authored camera movement, free exploration, mobile navigation, reduced motion, sound unlock/mute, loading/error/offline states, and clean teardown.
- Create the equivalent small Unreal slice with one streamed station only if the Unreal tier is selected.

**Gate:** meet frame-time, payload, accessibility, teardown, and first-frame targets before expanding content.

### Phase 2 — Complete web-native journey

- Add all seven manifest-driven stations, data links, typed navigation events, analytics, assistant integration, quality tiers, sound zones, and fallback map.
- Reuse or replace existing GLBs based on the asset audit.

### Phase 3 — Licensed environment integration

- Human operator imports the Nordic hut project under the verified license.
- Select and optimize the hut, dock, workshop props, vegetation, and relevant interactions.
- Keep the proprietary source outside the public repository and produce a redacted manifest for the website project.

### Phase 4 — MetaHuman guide

- Add the single optimized guide, animation state machine, dialogue integration, LOD/hair tiers, consent gates, subtitles, and fallback character.
- Profile it independently and remove it if it prevents the service from meeting density or cost targets.

### Phase 5 — Pixel Streaming productionization

- Build infrastructure-as-code, deployment pipeline, GPU image, signalling, TURN, session broker, warm pool, monitoring, queue and fallbacks.
- Run load, soak, reconnect, packet-loss, mobile network, firewall, region, idle-cleanup, and budget-cap tests.
- Do not deploy paid infrastructure or create cloud resources without explicit authorization.

### Phase 6 — Final polish and release

- Run Impeccable critique/audit/polish on the surrounding web UI.
- Test Chrome, Edge, Firefox and Safari where supported; Windows, macOS, iOS and Android; keyboard, touch, pointer and reduced motion.
- Run production build, TypeScript, existing tests, accessibility audits, Lighthouse, bundle analysis, GLTF validation, texture validation, UE automated tests, Unreal Insights, RenderDoc/GPU profiling where available, and Pixel Streaming synthetic sessions.
- Roll out behind the existing PostHog feature flag, begin with an internal cohort, and retain an immediate kill switch.

## Required deliverables

1. ADR with measured comparison, selected architecture, cost model, security model, and fallback topology.
2. Typed world-manifest schema and data migration from current hard-coded NPC definitions.
3. Asset ledger with source/license, size, geometry, textures, materials, animation, station, load group, LODs, and disposition.
4. Web-native implementation and export/compression pipeline.
5. Private Unreal project structure and reproducible human-run Fab import instructions.
6. Pixel Streaming infrastructure and React integration when authorized.
7. Performance dashboard and budgets enforced in CI where practical.
8. Accessibility and input test matrix.
9. Screenshots/video evidence for desktop, tablet, mobile, reduced motion, loading, offline, capacity-full, reconnect, and fallback states.
10. Updated `PRODUCT.md`, `DESIGN.md`, README, analytics event catalogue, runbooks, and deployment/cost documentation.

## Definition of done

- A recruiter can understand Rahul's positioning and access selected evidence within 20 seconds without entering the world.
- The optional world feels like one authored spatial journey, not nine NPCs on a grid.
- The web-native tier starts quickly, degrades gracefully, meets its measured budgets, and survives repeated open/close cycles without leaks.
- Both Build and Secure lenses remain understandable and truthful.
- The Unreal tier starts only by explicit choice, has a reliable fallback, and cannot create uncontrolled GPU spend.
- The Nordic environment and MetaHuman are purposeful, licensed, optimized, and never presented as Rahul's own authored project work.
- All factual claims resolve to repository data or evidence links.
- No private licensed Fab source, API secret, certificate key, personal biometric material, or confidential employer content enters the public repository.
- No unsupported professional claim is introduced.
- Do not call the project complete while a required validation, license gate, production fallback, or cleanup test is missing.

## Research anchors

- Messenger benchmark: https://messenger.abeto.co/
- Fab Nordic Fishing Hut listing: https://www.fab.com/listings/e56e7e02-01b8-4a15-a108-aa5d76ea0e10
- Epic Pixel Streaming overview: https://dev.epicgames.com/documentation/unreal-engine/pixel-streaming-in-unreal-engine
- Epic MetaHuman documentation: https://dev.epicgames.com/documentation/metahuman/metahumans-in-unreal-engine
- Epic per-platform LOD guidance: https://dev.epicgames.com/documentation/en-us/unreal-engine/per-platform-lods

---

The historical intended result was not “the retired world with better models.” Its useful target remains a measured, optional spatial product: web-native by default, Unreal-enhanced by consent, and unmistakably part of Rahul Mitra's portfolio.
