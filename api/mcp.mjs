import { createMcpHandler } from 'mcp-handler';
import { registerPortfolioTools } from '../server/portfolioMcp.mjs';
import { registerJobSearchTools } from '../server/jobSearch.mjs';

// https://rahul-mitra.com/api/mcp. The portfolio, résumé and profile-export
// tools are open; the job-search tools refuse a caller without
// PORTFOLIO_JOB_TOKEN, checked per call rather than per request so a stale
// credential cannot take the open tools down with it.
// ponytail: stateless per-request server; mcp-handler answers legacy GET/DELETE session ops itself.
const handler = createMcpHandler((server) => {
  registerPortfolioTools(server);
  registerJobSearchTools(server);
}, {
  serverInfo: { name: 'rahul-mitra-portfolio', version: '1.1.0' },
  instructions: 'Portfolio and résumé data for Rahul Mitra (rahul-mitra.com). Start with get_profile or list_resumes; get_resume returns a full résumé as Markdown plus PDF/DOCX links. The portfolio, résumé and profile-export tools are open; the job-search tools (preferences, application tracker) are Rahul\'s own and refuse callers without his bearer token.',
});

export { handler as GET, handler as POST };
