import { readFile } from 'node:fs/promises';
import path from 'node:path';
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

export const checkBundle = async (distDirectory) => {
  const html = await readFile(path.join(distDirectory, 'index.html'), 'utf8');
  const entry = findEntryScript(html);
  const bytes = await readFile(path.join(distDirectory, entry));
  const gzipped = gzipSync(bytes, { level: 9 }).length;
  console.log(`main entry chunk ${entry}: ${bytes.length.toLocaleString('en-US')} B / ${MAIN_CHUNK_LIMIT.toLocaleString('en-US')} B (gzip ${gzipped.toLocaleString('en-US')} B)`);
  const failures = [];
  if (bytes.length > MAIN_CHUNK_LIMIT) {
    failures.push(`main entry chunk ${entry} is ${bytes.length} B, over the ${MAIN_CHUNK_LIMIT} B cap`);
  }
  return { entry, bytes: bytes.length, gzipped, failures };
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const distDirectory = path.resolve(import.meta.dirname, '..', 'dist');
  checkBundle(distDirectory).then(({ failures }) => {
    for (const failure of failures) console.error(failure);
    if (failures.length) process.exitCode = 1;
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
