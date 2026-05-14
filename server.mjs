import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

loadEnvFile(path.join(__dirname, '.env'));
loadEnvFile(path.join(__dirname, '.env.local'));

const { createPageAgentResponse } = await import('./server/pageAgent.mjs');
const { emitServerLog } = await import('./server/posthogTelemetry.mjs');

const PORT = Number(process.env.PORT || process.env.API_PORT || 5174);

const readJsonBody = (request) => new Promise((resolve, reject) => {
  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
    if (body.length > 64_000) {
      reject(new Error('Request too large'));
      request.destroy();
    }
  });
  request.on('end', () => {
    try {
      resolve(JSON.parse(body || '{}'));
    } catch {
      reject(new Error('Invalid JSON'));
    }
  });
  request.on('error', reject);
});

const writeJson = (response, status, payload) => {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  response.end(JSON.stringify(payload));
};

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    writeJson(response, 204, {});
    return;
  }

  if (request.method !== 'POST' || request.url !== '/api/page-agent') {
    writeJson(response, 404, { error: 'Not found' });
    return;
  }

  const startedAt = Date.now();
  try {
    const body = await readJsonBody(request);
    const { status, payload } = await createPageAgentResponse(body);
    writeJson(response, status, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    emitServerLog('warn', 'page_agent_request_rejected', {
      route: '/api/page-agent',
      status: 400,
      duration_ms: Date.now() - startedAt,
      error_type: message === 'Invalid JSON' ? 'invalid_json' : 'request_error',
    });
    writeJson(response, 400, { error: message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[portfolio-api] listening on http://127.0.0.1:${PORT}`);
});
