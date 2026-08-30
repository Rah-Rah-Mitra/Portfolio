# Design reference

Unpacked from "Portfolio website redesign mockups.zip" (Claude Design export,
2026-08). Reference only — nothing here is imported by the build.

- `industry/` — the Industry design system bundle (readme, styles.css, manifest,
  adherence lint config). Live tokens/components are re-implemented in `index.css`.
- `mockups/` — approved canvas mockups the UI was built from:
  `workbench-desktop.dc.html` (desktop windowed UI), `mobile-field-index.dc.html`
  (mobile registry), `portfolio-ui-mockups.dc.html` (overview), plus their shared
  scripts (`pga-rig.js` → ported to `lib/rig.ts`, `portfolio-data.js`,
  `support.js`), the export's sync notes (`github.md`), and screenshots.
- `mockups/linkedin-thumbnail.dc.html` + `linkedin-thumb.jsx` (runtime:
  `animations-v3.jsx`, `tweaks-panel.jsx`) — the 1200×627, 3 s seamless-loop
  featured-card animation. `public/og-image.png` (frame T=0) and
  `public/og-video.mp4` are rendered from it (vanilla port + Playwright frame
  capture + ffmpeg); re-render those if this composition changes.
