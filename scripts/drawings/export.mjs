// Regenerates the desk drawing set (lib/drawings/*.generated.ts) from the
// committed estate pack through Vite SSR, the way export-portfolio-snapshot.mjs
// runs lib/portfolioSnapshot.ts. Run: npm run drawings. Writes only under
// lib/drawings; reads only public/estate (scripts/drawings/build.ts).
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createServer } from 'vite';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
// noDiscovery stops Vite's background dep-scan, which otherwise errors when we close the server right after loading one module.
const server = await createServer({ root: projectRoot, configFile: false, logLevel: 'warn', appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { buildDrawingSet, drawingFiles, readDrawingInputs } = await server.ssrLoadModule('/scripts/drawings/build.ts');
  const set = buildDrawingSet(readDrawingInputs(projectRoot));
  const files = drawingFiles(set);
  const sheetDir = path.join(projectRoot, 'lib', 'drawings', 'sheets');
  await mkdir(sheetDir, { recursive: true });
  const keep = new Set(files.map((file) => path.normalize(path.join(projectRoot, file.path))));
  for (const name of await readdir(sheetDir)) {
    const full = path.join(sheetDir, name);
    if (name.endsWith('.generated.ts') && !keep.has(path.normalize(full))) {
      await rm(full);
      console.log(`removed ${path.relative(projectRoot, full)}`);
    }
  }
  let gz = 0;
  for (const file of files) {
    await writeFile(path.join(projectRoot, file.path), file.text, 'utf8');
    const size = gzipSync(file.text, { level: 9 }).length;
    gz += size;
    console.log(`wrote ${file.path.padEnd(44)} ${String(file.text.length).padStart(7)} B  gzip ${String(size).padStart(6)} B`);
  }
  const { source, stats } = set;
  console.log(`drawing set: ${source.packName}, ${source.edition} @ ${source.commit.slice(0, 7)}; ${files.length} files, gzip ${gz} B in all`);
  console.log(`doors ${stats.doors}, kerbs ${stats.kerbMetres} m, partial ${stats.partial.join(', ') || 'none'}`);
} finally {
  await server.close();
}
