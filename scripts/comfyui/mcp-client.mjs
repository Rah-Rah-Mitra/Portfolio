import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const npxPath = process.env.NPX_PATH ?? 'C:\\Progra~1\\nodejs\\npx.cmd';
const command = 'C:\\Windows\\System32\\cmd.exe';
const args = ['/d', '/s', '/c', `${npxPath} -y comfyui-mcp@latest --full`];
const action = process.argv[2] ?? 'list';
const toolName = process.argv[3];
const rawArguments = process.argv[4] ?? '{}';
const pending = new Map();
let requestId = 0;

const child = spawn(command, args, {
  env: {
    ...process.env,
    COMFYUI_URL: process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: 'C:\\Windows',
  windowsHide: true,
});

child.stderr.on('data', (chunk) => process.stderr.write(chunk));

const lines = createInterface({ input: child.stdout });
lines.on('line', (line) => {
  if (!line.trim().startsWith('{')) return;

  try {
    const message = JSON.parse(line);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
  } catch {
    // Non-protocol output is ignored; comfyui-mcp writes diagnostics to stderr.
  }
});

function send(method, params = {}) {
  const id = ++requestId;
  const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  return promise;
}

function notify(method, params = {}) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
}

function parseTextPayload(result) {
  const text = result?.content?.find((item) => item.type === 'text')?.text;
  if (!text) throw new Error('MCP tool returned no JSON text payload.');
  return JSON.parse(text);
}

try {
  const initialized = await send('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'portfolio-comfy-client', version: '1.0.0' },
  });

  notify('notifications/initialized');

  let result;
  if (action === 'list') {
    result = await send('tools/list');
  } else if (action === 'call' && toolName) {
    result = await send('tools/call', {
      name: toolName,
      arguments: JSON.parse(rawArguments),
    });
  } else if (action === 'run-saved' && toolName) {
    const spec = JSON.parse(rawArguments);
    const loaded = await send('tools/call', {
      name: 'get_workflow',
      arguments: { action: 'get', filename: toolName, format: 'api' },
    });
    const workflow = parseTextPayload(loaded);

    for (const [key, value] of Object.entries(spec.overrides ?? {})) {
      const separator = key.indexOf('.');
      const nodeId = key.slice(0, separator);
      const input = key.slice(separator + 1);
      if (!workflow[nodeId]?.inputs || !input) {
        throw new Error(`Unknown workflow override: ${key}`);
      }
      workflow[nodeId].inputs[input] = value;
    }

    result = await send('tools/call', {
      name: 'enqueue_workflow',
      arguments: { action: 'enqueue', workflow },
    });
  } else {
    throw new Error('Usage: node mcp-client.mjs list | call <tool-name> <json-arguments> | run-saved <filename> <json-spec>');
  }

  if (action === 'list') {
    console.log(JSON.stringify({
      server: initialized.serverInfo,
      tools: result.tools?.map(({ name, description }) => ({
        name,
        summary: description?.split('\n')[0],
      })),
    }, null, 2));
  } else {
    console.log(JSON.stringify({ server: initialized.serverInfo, result }, null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  child.stdin.end();
  child.kill();
}
