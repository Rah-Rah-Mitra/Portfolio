import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// The last step of `npm run build`, so a breach fails the Vercel build rather than
// shipping. Vite only warns at 500 kB; the main chunk was 496,834 B when this cap
// landed, and the Estate window's engine must stay in its own lazy chunk.
export const MAIN_CHUNK_LIMIT = 510_000;

const attribute = (attributes, name) => {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
};

// The entry chunk is whatever the built index.html loads as its one module script,
// read from the page itself rather than guessed from Vite's file naming.
export const findEntryScript = (html) => {
  const sources = [...html.matchAll(/<script\b([^>]*)>/gi)]
    .map(([, attributes]) => attributes)
    .filter((attributes) => attribute(attributes, 'type')?.toLowerCase() === 'module')
    .map((attributes) => attribute(attributes, 'src'))
    .filter((src) => src !== undefined);
  if (sources.length !== 1) {
    throw new Error(`Expected exactly one module script with a src in index.html, found ${sources.length}`);
  }
  const [src] = sources;
  if (!/^\/assets\/[^/?#]+\.js$/.test(src)) throw new Error(`Unexpected entry script path: ${src}`);
  return src.slice(1);
};

// Static imports in minified chunk code: `from"./x.js"` and `import"./x.js"`. A lazy
// chunk is `import("./x.js")`, which the parenthesis keeps out.
export const staticImports = (code) => [...code.matchAll(/\b(?:from|import)\s*["'](\.\/[^"'?#]+\.js)["']/g)]
  .map(([, specifier]) => specifier);

// The main bundle is the entry plus every chunk it imports statically, transitively:
// all of it loads and runs on every page view. Today the entry imports nothing
// statically, but Rollup can move code the entry shares with a lazy chunk into a
// chunk of its own, and the cap must still see it.
export const checkBundle = async (distDirectory) => {
  const html = await readFile(path.join(distDirectory, 'index.html'), 'utf8');
  const entry = findEntryScript(html);
  const files = [];
  let bytes = 0;
  let gzipped = 0;
  const visit = async (file) => {
    if (files.includes(file)) return;
    files.push(file);
    const content = await readFile(path.join(distDirectory, file));
    bytes += content.length;
    gzipped += gzipSync(content, { level: 9 }).length;
    for (const specifier of staticImports(content.toString('utf8'))) {
      await visit(path.posix.join(path.posix.dirname(file), specifier));
    }
  };
  await visit(entry);
  console.log(`main bundle ${files.join(' + ')}: ${bytes.toLocaleString('en-US')} B / ${MAIN_CHUNK_LIMIT.toLocaleString('en-US')} B (gzip ${gzipped.toLocaleString('en-US')} B)`);
  const failures = [];
  if (bytes > MAIN_CHUNK_LIMIT) {
    failures.push(`main bundle (${files.join(', ')}) is ${bytes} B, over the ${MAIN_CHUNK_LIMIT} B cap`);
  }
  return { entry, files, bytes, gzipped, failures };
};

// Compared through realpath: Node resolves symlinks and junctions for import.meta
// but leaves argv[1] as typed, and a mismatch here would skip the check silently.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const distDirectory = path.resolve(import.meta.dirname, '..', 'dist');
  checkBundle(distDirectory).then(({ failures }) => {
    for (const failure of failures) console.error(failure);
    if (failures.length) process.exitCode = 1;
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
