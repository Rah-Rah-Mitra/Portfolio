# Rahul Mitra Portfolio

Interactive portfolio with configurable text effects, a fluid background, a Three.js portfolio world, and a private page-agent API for chatbot-driven UI controls.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create `.env.local` and set `GEMINI_API_KEY` or `GOOGLE_API_KEY` for the local `/api/page-agent` server. Optional: set `GEMINI_MODEL` to override the hosted Gemma model.
3. Run the app and private API together:
   `npm run dev`

The Vite app runs on `http://127.0.0.1:5173` and proxies `/api/page-agent` to the local server on `http://127.0.0.1:5174`. Keep model keys server-side only; do not expose them with `VITE_` prefixes.
