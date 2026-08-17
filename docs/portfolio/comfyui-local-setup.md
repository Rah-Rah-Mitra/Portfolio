# Local ComfyUI MCP setup and smoke verification

This repository contains no credentials, ComfyUI user configuration, or model weights. Keep MCP configuration in each user’s local Claude or Codex settings, not in Git.

## Required `comfyui-local` server values

- Command: `C:\Program Files\nodejs\npx.cmd`
- Arguments: `-y comfyui-mcp@latest`
- URL: `http://127.0.0.1:8188`
- Codex startup timeout: `120s`

Claude user configuration should define a local `comfyui-local` MCP server with the command and arguments above, and provide the URL only through local user configuration or environment settings. Codex user configuration should define the same `comfyui-local` server and set its startup timeout to 120 seconds. Do not paste tokens, cookies, model paths, or model weights into either configuration.

With ComfyUI Desktop already running at the configured URL, smoke-test the read-only local endpoint:

```powershell
npm run comfy:smoke
```

The smoke test checks system statistics, queue state, available node classes, and the checked-in model manifest. A successful smoke test is not permission to claim that a new image, video, model, or animation was generated. Record new output only after its workflow, prompt, seed, model hash, license, and reviewed files have been captured in the provenance manifests.
