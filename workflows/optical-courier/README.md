# Optical Courier reproducibility record

This directory preserves the fixed-seed concept-production record for the
Optical Courier. `character-builder-studio.ui.json` is the exact saved ComfyUI
workflow used for the three-view sheets, BiRefNet crops, and local Hunyuan3D
proof. `prompt-manifest.json` records the exact prompts, seeds, prompt IDs,
timings, model filenames and hashes, reviewed outputs, and selection decision.

The selected sheet and its reviewed crops live under
`assets/optical-courier/concept/`. Raw candidate generations and the Hunyuan
GLB remain in the gitignored `artifacts/optical-courier/` tree. This keeps model
outputs that are not required by the site outside the public bundle and avoids
redistributing Hunyuan output without reviewing its territory-specific
community-license obligations.

The deterministic Blender 5.2 fallback and upload-ready FBX are documented in
`scripts/optical-courier/README.md`. The checkpoint is **pre-rig**, not a
production animation package. Mixamo remains blocked until the required Google
Chrome Browser extension/native host is available. No Adobe session, marker
placement, skin download, animation selection, or production GLB is claimed.

Model weights, browser state, credentials, cookies, tokens, and untouched
Mixamo downloads must never be committed.
