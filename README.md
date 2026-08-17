# Rahul Mitra — Continuous Field Test

Production: [rahul-mitra.com](https://rahul-mitra.com/)

An evidence-first engineering portfolio spanning software systems, AI and perception, operations research, solution architecture, 3D, civic work, and responsible security. Experience, projects, outcomes, resumes, and contact paths remain semantic HTML; the generated field engineer, Effects Lab, AI assistant, video, and Spatial World are optional supporting layers.

## Run locally

Prerequisites: Node.js 20+.

```powershell
npm install
npm run dev
```

The Vite app runs at `http://127.0.0.1:5173` and proxies `/api/page-agent` to `http://127.0.0.1:5174`. Set `GEMINI_API_KEY` or `GOOGLE_API_KEY` in `.env.local` for the private assistant endpoint. Never expose model keys through a `VITE_` variable.

## Verify

```powershell
npm test
npm run test:e2e
npm run media:check
npm run build
```

Vite/esbuild can fail to resolve the UNC workspace path on Windows. For a production build, mirror the repository to a local drive (excluding `.git`, `.claude`, `node_modules`, and generated output), run `npm ci` and `npm run build` there, then verify the Vercel preview.

## ComfyUI and media

Start ComfyUI on `http://127.0.0.1:8188`, then use:

```powershell
npm run comfy:smoke
npm run comfy:field-media
npm run media:encode
npm run media:check
```

Reproducible prompts, seeds, workflow inputs, output hashes, model hashes, and license notes live in [`workflows/comfyui`](workflows/comfyui). Model weights and user-level MCP credentials are intentionally excluded from Git. See [`workflows/comfyui/README.md`](workflows/comfyui/README.md) for Claude Code and optional Codex MCP setup; restart those clients after changing their user configuration.

The Technical Lab is explicitly a synthetic calibration study, not professional project experience. C-RADIOv4 remains a benchmark candidate; the shipped deterministic study uses OpenCV, and BiRefNet is used for the generated guide cutout.
