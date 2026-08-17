# Local-drive verification

Run Node/Vite verification from a local-drive mirror when the source checkout is a UNC path. The verifier copies the source into a destination outside the repository, excludes user-owned `.claude/`, `.git/`, `node_modules/`, `dist/`, `.impeccable/`, and entries whose basename starts with `.env`, then runs fresh dependency installation plus test, typecheck, and build there. It never writes back to the source checkout.

```powershell
$env:PORTFOLIO_VERIFY_MIRROR = 'C:\codex-verify\portfolio'
node scripts/verify-local-mirror.mjs
```

Use a dedicated local destination. The script rejects a destination that is the source directory or a child of it. Do not point it at a user workspace, a repository root, or a directory containing uncommitted work you need to retain.
