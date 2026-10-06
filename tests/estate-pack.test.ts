import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ESTATE_CATALOGUE } from '../lib/estate/catalogue.generated';
import { checkCommittedCatalogue, checkShippedClasses, SHIPPED_CLASSES } from '../scripts/estate/check.mjs';
import { gitlink } from '../scripts/estate/lib/provenance.mjs';
import { DECODED_CLASSES } from '../components/workbench/estate/engine/streaming';

// The catalogue and the pack it names (plan §10.2 estate-pack): the merge gate
// for the Estate window. lib/estate/catalogue.generated.ts is committed and
// read by the main bundle; every /estate/ URL it names must exist under
// public/, or production shows a broken poster and a Load that 404s into "the
// site was updated". There is no skip-when-absent path: a checkout that carries
// the catalogue without its pack fails here, which is exactly the branch to stop
// (a dev pack is only ever copied in locally, never committed; the committed
// pack is v1.2's release, packed with --release). A catalogue generated from a dev pack (`dev: true`) also fails
// where CI or Vercel runs this; scripts/estate/check.mjs (estate:check) fails
// it everywhere, and scripts/check-bundle.mjs fails the Vercel build on it.
//
// Beyond the gate: one version folder; every file pack.json lists is on disk at
// the size it records, and its payload (gunzipped where gzipped) hashes to the
// sha256 that names it; the licence names CC BY 4.0. The leak scan of every
// byte and the budgets are estate:check's.

const root = fileURLToPath(new URL('..', import.meta.url));
const publicDir = join(root, 'public');
const catalogueText = readFileSync(join(root, 'lib', 'estate', 'catalogue.generated.ts'), 'utf8');
const urls = [...new Set(catalogueText.match(/\/estate\/v\d+\.\d+\/[A-Za-z0-9._/-]+/g) ?? [])];
const onDisk = (url: string) => join(publicDir, ...url.slice(1).split('/'));

interface Ref { path: string; bytes: number; sha256: string }
/** Every FileRef in a pack.json, wherever it sits. */
const fileRefs = (value: unknown, out: Ref[] = []): Ref[] => {
  if (Array.isArray(value)) value.forEach((v) => fileRefs(v, out));
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.path === 'string' && typeof o.bytes === 'number' && typeof o.sha256 === 'string') out.push(o as unknown as Ref);
    Object.values(o).forEach((v) => fileRefs(v, out));
  }
  return out;
};

describe('the Estate catalogue’s merge gate', () => {
  it('names the pack, the poster and its sources', () => {
    expect(urls).toContain(ESTATE_CATALOGUE.packUrl);
    expect(urls).toContain(ESTATE_CATALOGUE.poster.src);
    for (const entry of ESTATE_CATALOGUE.poster.srcSet.split(',')) expect(urls).toContain(entry.trim().split(/\s+/)[0]);
  });

  it('finds every /estate/ URL it names under public/ (a catalogue without its pack never merges)', () => {
    const missing = urls.filter((url) => !existsSync(onDisk(url)));
    expect(missing, 'regenerate lib/estate/catalogue.generated.ts with the pack it describes committed under public/estate').toEqual([]);
  });

  it('is never a dev catalogue where CI or Vercel runs, and agrees with its pack about it', () => {
    const pack = JSON.parse(readFileSync(onDisk(ESTATE_CATALOGUE.packUrl), 'utf8')) as { source: { dev?: boolean; commit: string }; edition: string };
    expect(ESTATE_CATALOGUE.dev).toBe(pack.source.dev === true);
    expect(ESTATE_CATALOGUE.commit).toBe(pack.source.commit);
    expect(ESTATE_CATALOGUE.edition).toBe(pack.edition);
    if (process.env.CI || process.env.VERCEL) {
      expect(ESTATE_CATALOGUE.dev, 'a dev catalogue reached CI: regenerate it from the published release pack').toBe(false);
    }
    // estate:check's own rule says the same thing, everywhere.
    const problems = checkCommittedCatalogue(root);
    expect(problems.some((p: string) => /dev pack/.test(p))).toBe(ESTATE_CATALOGUE.dev);
    expect(problems.filter((p: string) => !/dev pack/.test(p))).toEqual([]);
  });

  // Plan §4 rule 2 and §10.2: the pack and the catalogue were built from the
  // upstream commit the submodule's gitlink records. A version move that
  // commits a new pack and catalogue but forgets the gitlink (or the reverse)
  // fails here, not only in a manual `estate:check --provenance`. gitlink()
  // reads the portfolio's own index; the submodule's checkout is never opened.
  it.skipIf(!existsSync(join(root, '.git')))('was built from the upstream commit the submodule gitlink records', () => {
    const pack = JSON.parse(readFileSync(onDisk(ESTATE_CATALOGUE.packUrl), 'utf8')) as { source: { commit: string } };
    const recorded = gitlink(root);
    expect(recorded, 'no gitlink in the index: is the submodule entry still committed?').toMatch(/^[0-9a-f]{40}$/);
    expect(pack.source.commit, 'pack.json source.commit against the gitlink').toBe(recorded);
    expect(ESTATE_CATALOGUE.commit, 'the catalogue’s commit against the gitlink').toBe(recorded);
  });
});

describe('the pack under public/estate', () => {
  const estateDir = join(publicDir, 'estate');
  const versions = existsSync(estateDir) ? readdirSync(estateDir).filter((name) => /^v\d+\.\d+$/.test(name)) : [];

  it('holds the licence and exactly the one version folder the catalogue names', () => {
    expect(versions).toEqual([ESTATE_CATALOGUE.edition]);
    const licence = readFileSync(join(estateDir, 'LICENSE.txt'), 'utf8');
    expect(licence).toMatch(/CC BY 4\.0/);
    expect(licence).toMatch(/not covered by this\s+repository['’]s\s+MIT licence/i);
  });

  it('carries every class this engine reads, for every site (a P4 pack would skip every P5 suite and refuse every Enter)', () => {
    // The gate's list is exactly what the engine decodes, plus the poster the shell shows.
    expect([...SHIPPED_CLASSES].sort()).toEqual(['poster', ...DECODED_CLASSES].sort());
    const pack = JSON.parse(readFileSync(onDisk(ESTATE_CATALOGUE.packUrl), 'utf8'));
    expect(checkShippedClasses(pack), 'repack with --classes poster,s0,f,d,i,w,nav,ground').toEqual([]);
    // And the rule bites: the P4b class set is refused.
    expect(checkShippedClasses({ ...pack, classes: ['poster', 's0', 'f', 'd'] })[0]).toMatch(/lacks i, w, nav, ground/);
  });

  it('has every file pack.json lists, at its recorded size, hashing to the name it carries', () => {
    const pack = JSON.parse(readFileSync(onDisk(ESTATE_CATALOGUE.packUrl), 'utf8'));
    const refs = fileRefs(pack);
    expect(refs.length).toBeGreaterThan(10);
    const base = join(estateDir, ESTATE_CATALOGUE.edition);
    for (const ref of refs) {
      const file = join(base, ...ref.path.split('/'));
      expect(existsSync(file), ref.path).toBe(true);
      expect(statSync(file).size, ref.path).toBe(ref.bytes);
      const stored = readFileSync(file);
      const payload = stored[0] === 0x1f && stored[1] === 0x8b ? gunzipSync(stored) : stored;
      expect(createHash('sha256').update(payload).digest('hex'), ref.path).toBe(ref.sha256);
      expect(ref.path, ref.path).toContain(`.${ref.sha256.slice(0, 8)}.`);
    }
  });
});
