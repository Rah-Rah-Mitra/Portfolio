---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["App.tsx","index.css","components/workbench/FieldWorkbench.tsx","components/workbench/FieldIndex.tsx"]
---

# Portfolio surface brief

- Scope and mode: the recruiter portfolio at `index.html`; Experience mode with a fast Persuade opening, drawn as the Industry "Field Workbench".
- Audience and job: recruiters should understand Rahul's connected intelligent-systems position, representative proof, suitable résumé, and contact path in roughly 20 seconds. Technical visitors can open the labs, filter the full record, and use the optional assistant and FX panel.
- Outcome and proof: Home / Dossier and Selected Work open at boot; every other surface is a named window over the desk on desktop and a row in the Field Index on mobile. Nothing recruiter-critical lives only in a lab, the FX panel, or the assistant.
- Chosen direction: a light blueprint drawing set — steel-blue accent, Barlow Condensed over Barlow, square hairline frames with `+` registration marks, duotone imagery. See `DESIGN.md` and `design/industry/`.
- Structural thesis: eleven draggable windows over a gridded desk with a tool rail; cards hang from crane rigs (`lib/rig.ts`). Mobile is one searchable registry. The server renders both; CSS hides one and hydration keeps only the active surface.
- Signature interaction and motion: windows swing on their rigs; the labs run real models (Camera Lab: pinhole, pose, thin lens, stereo, Zhang calibration; Systems Lab: mechanism bench, flow-shop sequencing, drop test). WIN-07 is the Estate (`#world`, FIG. 07): Sample Town N5, a generated sample HDB neighbourhood (not a real town), shown as a duotone still render beside a text registry of its fourteen buildings; a lazy three.js viewer orbits it, flies to a building, cuts any storey as a plan with its rooms listed, and walks in through void decks, stairs and lifts once loaded, automatically where heavy assets are allowed and after a labelled Load click under Save-Data, reduced motion or `?mode=scan`. Its sheet does not scroll; its side panel does. The FX panel can switch on an N-body or fluid desk backdrop, both off at boot; while the Estate's viewer is in use a running backdrop holds still ("HELD · ESTATE"). Every loop halts under reduced motion or "Pause all motion" (`lib/motion.ts`), and the Estate's flights, stair climbs and lift fades cut to the end.
- Boundaries: preserve the unified evidence model, project filters, archive search, the private assistant API and its fallback, analytics, résumé downloads, accessibility, and canonical SEO. Do not revive Build/Secure lenses, a dark scheme, or the retired optical workstation, and do not imply robotics, SLAM, localization, mapping, or Gaussian-splatting delivery.
- States and adaptation: desktop at 881px and wider, the Field Index at 880px and narrower. With JavaScript off, every window body is ordinary prerendered content in the evidence order.
