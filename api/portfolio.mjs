import { portfolioExport } from '../server/portfolioMcp.mjs';

// https://rahul-mitra.com/api/portfolio: the same data as the MCP tools, as one JSON document.
export const GET = () => Response.json(portfolioExport(), {
  headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' },
});
