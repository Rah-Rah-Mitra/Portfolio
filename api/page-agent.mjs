import { createPageAgentResponse } from '../server/pageAgent.mjs';
import { emitServerLog, flushServerLogs } from '../server/posthogTelemetry.mjs';

const responseHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: responseHeaders,
});

export const OPTIONS = () => new Response(null, {
  status: 204,
  headers: responseHeaders,
});

export const GET = () => jsonResponse({ error: 'Not found' }, 404);

export const POST = async (request) => {
  const startedAt = Date.now();
  let body;
  try {
    body = await request.json();
  } catch {
    emitServerLog('warn', 'page_agent_request_rejected', {
      route: '/api/page-agent',
      status: 400,
      duration_ms: Date.now() - startedAt,
      error_type: 'invalid_json',
    });
    await flushServerLogs();
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { status, payload } = await createPageAgentResponse(body);
  await flushServerLogs();
  return jsonResponse(payload, status);
};
