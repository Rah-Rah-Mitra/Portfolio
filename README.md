# Rahul Mitra Portfolio

Production: [rahul-mitra.com](https://rahul-mitra.com/)

Evidence-led engineering portfolio spanning software systems, AI, operations research, 3D computer vision, solution architecture, and responsible security. The primary reading experience is intentionally calm; the grounded portfolio assistant, effects lab, and Three.js spatial map remain optional interactive layers.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create `.env` or `.env.local` and set `GEMINI_API_KEY` or `GOOGLE_API_KEY` for the local `/api/page-agent` server. Optional: set `GEMINI_MODEL` to override the hosted Gemma model.
3. Run the app and private API together:
   `npm run dev`

The Vite app runs on `http://127.0.0.1:5173` and proxies `/api/page-agent` to the local server on `http://127.0.0.1:5174`. Keep model keys server-side only; do not expose them with `VITE_` prefixes.
