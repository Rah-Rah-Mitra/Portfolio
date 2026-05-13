import { createPageAgentResponse } from '../server/pageAgent.mjs';

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
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { status, payload } = await createPageAgentResponse(body);
  return jsonResponse(payload, status);
};
