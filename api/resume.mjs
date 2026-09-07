import { decodeSpec, renderResume, specSchema } from '../server/resumeRender.mjs';
import { pools, profile } from '../server/resumeContent.mjs';

// https://rahul-mitra.com/api/resume?spec=<base64url deflated JSON>&format=pdf|docx|md
//
// Stateless: the spec in the URL is the whole résumé, so a built document is
// reproducible from its link with no storage behind it. Only pool ids are
// accepted, so there is no way to inject text through this endpoint.
const TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown; charset=utf-8',
};

const fail = (message, status = 400) => Response.json({ error: message }, {
  status,
  headers: { 'Access-Control-Allow-Origin': '*' },
});

const build = async (rawSpec, format, download) => {
  const parsed = specSchema.safeParse(rawSpec);
  if (!parsed.success) {
    return fail(`Invalid résumé spec: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`);
  }
  let result;
  try {
    result = await renderResume(parsed.data, pools, profile);
  } catch (error) {
    // Unknown entry/bullet/skills-line ids land here; tell the caller which.
    return fail(error instanceof Error ? error.message : 'Could not render résumé');
  }
  const name = `rahul-mitra-${(parsed.data.slug ?? 'custom').replace(/[^a-z0-9-]/gi, '')}.${format}`;
  const body = format === 'md' ? result.markdown : result[format];
  return new Response(body, {
    headers: {
      'Content-Type': TYPES[format],
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name}"`,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
      'X-Resume-Pages': String(result.pages),
      'X-Resume-Fit': `${result.fit.bodyPt}pt/${result.fit.marginIn}in${result.fit.fitted ? '' : ' OVERFLOW'}`,
    },
  });
};

const formatOf = (url) => {
  const format = (url.searchParams.get('format') ?? 'pdf').toLowerCase();
  return format in TYPES ? format : null;
};

export const OPTIONS = () => new Response(null, {
  status: 204,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  },
});

export const GET = async (request) => {
  const url = new URL(request.url);
  const format = formatOf(url);
  if (!format) return fail('format must be pdf, docx or md');
  let spec;
  try {
    spec = decodeSpec(url.searchParams.get('spec'));
  } catch {
    return fail('spec must be base64url-encoded deflated JSON; build it with the build_resume MCP tool');
  }
  return build(spec, format, url.searchParams.get('download') === '1');
};

// POST takes the spec as a plain JSON body, for specs too long to sit in a URL.
export const POST = async (request) => {
  const url = new URL(request.url);
  const format = formatOf(url);
  if (!format) return fail('format must be pdf, docx or md');
  let body;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body');
  }
  return build(body.spec ?? body, format, url.searchParams.get('download') === '1');
};
