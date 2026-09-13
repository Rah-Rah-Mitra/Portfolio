# Design reference

Unpacked from "Portfolio website redesign mockups.zip" (Claude Design export;
first drop 2026-08, re-dropped 2026-09 with the PGA library added). Reference
only — nothing here is imported by the build.

The 2026-09 re-drop changed **no tokens**: every file in `industry/` and every
mockup except `portfolio-ui-mockups.dc.html` came back byte-identical. The whole
delta is the PGA mechanism library below, plus the "ZONE 2 — THE PARTS BIN"
section added to the overview sheet that surfaces it.

- `industry/` — the Industry design system bundle (readme, styles.css, manifest,
  adherence lint config). Live tokens/components are re-implemented in `index.css`.
- `mockups/` — approved canvas mockups the UI was built from:
  `workbench-desktop.dc.html` (desktop windowed UI), `mobile-field-index.dc.html`
  (mobile registry), `portfolio-ui-mockups.dc.html` (overview), plus their shared
  scripts (`pga-rig.js` → ported to `lib/rig.ts`, `portfolio-data.js`,
  `support.js`), the export's sync notes (`github.md`), and screenshots.
- `mockups/pga*.js` + `mockups/pga-asset-library.dc.html` +
  `mockups/pga-checklist.md` — the **PGA mechanism library** (2026-09). A planar
  projective geometric algebra core `P(R*2,0,1)` (`pga.js`: geometric product,
  points/lines, join/meet, rotors/translators/motors, the sandwich `M p M~`), a
  blueprint drawing kit (`pga-draw.js`: pins, grounded pivots, rails, gears,
  sheaves, ropes, springs, hatching, traces), and 83 live mechanism assets in 16
  families across `pga-assets-1/2/3.js`. Nothing is keyframed — each part is
  placed by a motor and its dependents are solved from constraints every frame.
  Zero dependencies, plain ES modules, canvas 2D.
  `pga-rig.js` is the *older* verlet core that `lib/rig.ts` was ported from; the
  two are unrelated despite the shared prefix, and the shipped rig still runs
  verlet. Porting the rig onto this algebra is a separate, unstarted job.
- `mockups/linkedin-thumbnail.dc.html` + `linkedin-thumb.jsx` (runtime:
  `animations-v3.jsx`, `tweaks-panel.jsx`) — the 1200×627, 3 s seamless-loop
  featured-card animation. `public/og-card-2026.png` (frame T=0; filename is
  version-stamped because LinkedIn caches og images by URL — bump the name
  when the card changes) and
  `public/og-video.mp4` are rendered from it (vanilla port + Playwright frame
  capture + ffmpeg); re-render those if this composition changes.
