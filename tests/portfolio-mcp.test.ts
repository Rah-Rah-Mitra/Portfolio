import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPortfolioSnapshot } from '../lib/portfolioSnapshot';
import { SITE_CONFIG } from '../siteConfig';
import snapshot from '../server/portfolio-snapshot.json';
import { listResumes, resumeConfigs, resumeMarkdown } from '../server/portfolioMcp.mjs';
import { POST } from '../api/mcp.mjs';
import { GET } from '../api/portfolio.mjs';

const TOOLS = ['get_profile', 'get_project', 'get_resume', 'list_experience', 'list_projects', 'list_resumes'];
const highlightsPdf = `${SITE_CONFIG.canonicalUrl}resume/generated/rahul-mitra-highlights-${SITE_CONFIG.resumeEdition}.pdf`;

const rpc = async (method: string, params?: unknown) => {
  const response = await POST(new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }));
  expect(response.status).toBe(200);
  const body = await response.text();
  const message = response.headers.get('content-type')?.includes('text/event-stream')
    ? body.split('\n').filter((line) => line.startsWith('data:')).map((line) => JSON.parse(line.slice(5))).at(-1)
    : JSON.parse(body);
  expect(message.error).toBeUndefined();
  return message.result;
};

describe('portfolio snapshot', () => {
  it('matches the committed server/portfolio-snapshot.json (run `npm run snapshot` when this fails)', () => {
    expect(buildPortfolioSnapshot()).toEqual(snapshot);
  });
});

describe('résumé data', () => {
  it('lists every résumé with absolute URLs that exist on disk', () => {
    const resumes = listResumes();
    expect(resumes).toHaveLength(8);
    expect(resumeConfigs.map((config) => config.slug).sort()).toEqual(resumes.map((resume) => resume.slug).sort());
    for (const resume of resumes) {
      for (const url of [resume.pdfUrl, resume.docxUrl]) {
        expect(url.startsWith(SITE_CONFIG.canonicalUrl)).toBe(true);
        expect(existsSync(join('public', new URL(url).pathname)), url).toBe(true);
      }
    }
  });

  it('renders the highlights résumé with the slug overrides applied', () => {
    const markdown = resumeMarkdown(resumeConfigs.find((config) => config.slug === 'highlights'));
    expect(markdown.startsWith('# RAHUL MITRA')).toBe(true);
    expect(markdown).toContain('put-away');
    expect(markdown).toContain('custom fuzzing scripts');
    expect(markdown).toContain('**Languages:**');
  });
});

describe('api/mcp', () => {
  it('lists the six tools', async () => {
    const { tools } = await rpc('tools/list');
    expect(tools.map((tool: { name: string }) => tool.name).sort()).toEqual(TOOLS);
  });

  it('returns the highlights résumé through get_resume', async () => {
    const { content } = await rpc('tools/call', { name: 'get_resume', arguments: { slug: 'highlights' } });
    expect(content[0].text).toContain('put-away');
    expect(content[0].text).toContain(highlightsPdf);
  });

  it('filters projects and flags unknown ids', async () => {
    const { content } = await rpc('tools/call', { name: 'list_projects', arguments: { query: 'churp' } });
    expect(JSON.parse(content[0].text).map((row: { id: string }) => row.id)).toEqual(['churp']);
    const missing = await rpc('tools/call', { name: 'get_project', arguments: { id: 'nope' } });
    expect(missing.isError).toBe(true);
  });
});

describe('api/portfolio + llms.txt', () => {
  it('serves the JSON export', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.mcp).toBe(`${SITE_CONFIG.canonicalUrl}api/mcp`);
    expect(body.resumes).toHaveLength(8);
    expect(body.projects).toHaveLength(snapshot.projects.length);
  });

  it('keeps llms.txt pointing at the MCP endpoint and the current résumé edition', () => {
    const llms = readFileSync('public/llms.txt', 'utf8');
    expect(llms).toContain(`${SITE_CONFIG.canonicalUrl}api/mcp`);
    expect(llms).toContain(highlightsPdf);
    expect(llms).toContain(`rahul-mitra-general-${SITE_CONFIG.resumeEdition}.pdf`);
  });
});
