# ComfyUI asset pipeline

The portfolio uses local ComfyUI for authored support media. Career claims and project evidence remain ordinary HTML; generated assets are visual context only.

## Local runtime

- Endpoint: `http://127.0.0.1:8188`
- Verified baseline: ComfyUI 0.33.0, PyTorch 2.9.1 + ROCm 7.2.1, AMD Radeon 890M
- Fast video baseline: `ltxv-2b-0.9.8-distilled.safetensors`
- Character exploration: Z-Image Turbo, BiRefNet, Hunyuan3D/TRELLIS workflows already installed locally

Run `npm run comfy:smoke` while Comfy Desktop is open. The smoke test is read-only: it checks the API, available node classes, queue state, and the model manifest.

Run `npm run comfy:field-media` to enqueue the pinned calibration-video workflow, then copy the returned MP4 from ComfyUI output into `public/media/field-calibration.mp4`. Run `npm run media:encode` to create the muted VP9 WebM and poster through the pinned `ffmpeg-static` dependency.

## Reproducibility contract

Every shipped asset must have an entry in `model-manifest.json` containing its prompt, seed, workflow name, model, license/source URL, dimensions, duration, and output path. Model weights are never committed.

The current local source workflows are:

- `LTXV Fast T2V (distilled).json`
- `Character Builder - Studio.json`
- `Character Builder - 2 Image to 3D.json`
- `Helper - Extract Pose Sheet (DWPose).json`

Export a workflow's API form from ComfyUI before automating it. Do not submit the UI graph directly to `/prompt`.

## Quality gates

- LTXV 2B is the production fallback.
- LTX-2.3 may be used only after a 512p four-second benchmark completes in 15 minutes or less with no ROCm or custom-node errors and a visible consistency improvement.
- ARDY is research-only for this Windows/AMD pipeline.
- Large GIFs are prohibited. Ship WebM and H.264 MP4 plus a poster and transcript.
- The shipped 768×512, 97-frame LTXV 2B render completed in 95.33 seconds on the verified ROCm runtime. Its false-color footage is deliberately subdued in CSS and used only as supporting calibration ambience.
