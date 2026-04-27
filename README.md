# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app: `npm run dev`

## Local QA (contributors)

Keep local checks fast before opening a PR:

1. `npm run lint` – runs ESLint on the TypeScript/React source
2. `npm run typecheck` – runs `tsc --noEmit`

Optional formatting check (useful before larger refactors):

```bash
npx prettier --check .
```

For a quick pre-push pass, run:

```bash
npm run lint && npm run typecheck
```
