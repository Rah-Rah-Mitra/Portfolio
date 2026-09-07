import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPortfolioSnapshot } from '../lib/portfolioSnapshot';
import { SITE_CONFIG } from '../siteConfig';
import snapshot from '../server/portfolio-snapshot.json';
import { listResumes, resumeConfigs, resumeMarkdown } from '../server/portfolioMcp.mjs';
import { POST } from '../api/mcp.mjs';
import { GET } from '../api/portfolio.mjs';

const TOOLS = ['build_resume', 'get_profile', 'get_project', 'get_resume', 'get_resume_guide', 'list_experience', 'list_projects', 'list_resume_blocks', 'list_resumes'];
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
  it('lists the read and builder tools', async () => {
    const { tools } = await rpc('tools/list');
    expect(tools.map((tool: { name: string }) => tool.name).sort()).toEqual(TOOLS);
  });

  it('returns the highlights résumé through get_resume, with its build spec', async () => {
    const { content } = await rpc('tools/call', { name: 'get_resume', arguments: { slug: 'highlights' } });
    const payload = JSON.parse(content[0].text);
    expect(payload.markdown).toContain('put-away');
    expect(payload.pdfUrl).toBe(highlightsPdf);
    expect(payload.spec.slug).toBe('highlights');
  });

  it('builds a tailored résumé from selected block ids', async () => {
    const spec = {
      subject: 'Test build',
      pages: 1,
      sections: [
        { type: 'experience', title: 'EXPERIENCE', entries: [{ id: 'stmicro-or', bullets: ['putaway'] }] },
        { type: 'skills', title: 'SKILLS AND CERTIFICATIONS', lines: ['se-skills'] },
      ],
    };
    const { content } = await rpc('tools/call', { name: 'build_resume', arguments: { spec } });
    const built = JSON.parse(content[0].text);
    expect(built.pages).toBe(1);
    expect(built.fit.fitted).toBe(true);
    expect(built.pdfUrl).toMatch(/^https:\/\/rahul-mitra\.com\/api\/resume\?spec=/);
    expect(built.markdown).toContain('put-away');
  });

  it('refuses a build whose spec carries bullet prose instead of ids', async () => {
    const spec = {
      sections: [{ type: 'experience', title: 'EXPERIENCE', entries: [{ id: 'stmicro-or', bullets: ['I invented a thing'] }] }],
    };
    const result = await rpc('tools/call', { name: 'build_resume', arguments: { spec } });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/unknown bullet/);
  });

  it('serves the building blocks and the guide', async () => {
    const blocks = await rpc('tools/call', { name: 'list_resume_blocks', arguments: { section: 'skills' } });
    expect(JSON.parse(blocks.content[0].text).skillLines.length).toBeGreaterThan(15);
    const guide = await rpc('tools/call', { name: 'get_resume_guide', arguments: {} });
    expect(guide.content[0].text).toContain('Never write your own bullet text');
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
