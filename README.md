# Rahul Mitra — Continuous Field Test

Production: [rahul-mitra.com](https://rahul-mitra.com/)

An evidence-first engineering portfolio spanning software systems, AI and perception, operations research, solution architecture, 3D, civic work, and responsible security. Experience, projects, outcomes, resumes, and contact paths remain semantic HTML; the Optical Courier world, Effects Lab, AI assistant, and media are optional supporting layers. Explore World links to the shared `#world` optical-test-bench anchor and surface used by both Guided and local Explore control.

## Run locally

Prerequisites: Node.js 20+.

```powershell
npm install
npm run dev
```

The Vite app runs at `http://127.0.0.1:5173` and proxies `/api/page-agent` to `http://127.0.0.1:5174`. Set `GEMINI_API_KEY` or `GOOGLE_API_KEY` in `.env.local` for the private assistant endpoint. Never expose model keys through a `VITE_` variable.

Models can read the site without a browser: `/api/mcp` is a public MCP endpoint (tools listed in `public/llms.txt`) and `/api/portfolio` returns the same data as JSON. Most tools are open; the job-search ones (preferences and the application tracker) are mine and need a bearer token. The MCP tools also build résumés: an agent selects from approved blocks and `/api/resume` renders the Harvard-style PDF, DOCX or Markdown from a spec carried in the URL. A deterministic checker rides along, reporting repeated opening verbs, repeated sentence frames and unquantified bullets against the block ids they sit on; `npm run resume:lint` runs the same rules over the content pool itself. `npm run dev` serves `/api/resume` and `/api/page-agent` only; `npm test` exercises every handler directly.

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

The Camera Laboratory is explicitly a synthetic portfolio-site experiment, not professional project experience. It ships deterministic intrinsics, extrinsics, thin-lens optics, and stereo calculations as semantic controls and result tables. The separate OpenCV/C-RADIO/BiRefNet SLAM study remains unpublished and cannot delay the core experience.
