import { createMcpHandler } from 'mcp-handler';
import { registerPortfolioTools } from '../server/portfolioMcp.mjs';

// https://rahul-mitra.com/api/mcp — read-only, no auth.
// ponytail: stateless per-request server; mcp-handler answers legacy GET/DELETE session ops itself.
const handler = createMcpHandler(registerPortfolioTools, {
  serverInfo: { name: 'rahul-mitra-portfolio', version: '1.0.0' },
  instructions: 'Read-only portfolio and résumé data for Rahul Mitra (rahul-mitra.com). Start with get_profile or list_resumes; get_resume returns a full résumé as Markdown plus PDF/DOCX links.',
});

export { handler as GET, handler as POST };
