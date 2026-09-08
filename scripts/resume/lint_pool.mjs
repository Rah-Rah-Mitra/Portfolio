// lint_pool.mjs: `npm run resume:lint`, the human lane of the résumé checker.
//
// Run this after editing scripts/resume/content/*.json. It reports what only a
// person writing prose can fix: which opening verbs the block pool leans on,
// which sentence shape repeats across it, tense that disagrees with an entry's
// own dates, and depth-variant gaps. None of this reaches an agent through the
// MCP surface, because agents select block ids and may never write bullet text.
//
// It also prints each canonical résumé's agent-lane report, so the effect of a
// pool edit on the eight shipped documents is visible in one command.
//
// Exit code is 0 unless a structural error fires. Repetition is a judgement
// call about Rahul's own approved material, not a build failure.
import { pools, profile, resumeConfigs } from '../../server/resumeContent.mjs';
import { checkSpec } from '../../server/portfolioMcp.mjs';
import { renderResumePdf } from '../../server/resumeRender.mjs';
import { checkPool } from '../../server/resumeCheck.mjs';

const SECTION_TYPES = ['education', 'experience', 'projects', 'leadership'];

/** Every selectable block, with each depth variant as its own row. */
export const poolEntries = () => SECTION_TYPES.flatMap((sectionType) => pools[sectionType].entries
  .filter((entry) => !entry.blocked)
  .map((entry) => ({
    entryId: entry.id,
    sectionType,
    dateLabel: entry.dateLabel,
    bullets: (entry.bullets ?? []).flatMap((bullet) => Object.entries(bullet.text)
      .map(([variant, text]) => ({ ref: `${entry.id}.${bullet.id}`, variant, text }))),
  })));

/**
 * Lane A for one canonical résumé, at the typography it really ships at. The real
 * profile has to go through the render: the name and contact lines take vertical
 * space, so a stub would let the fit ladder settle on a different rung and the
 * line counts would be measured against typography this résumé never uses.
 */
export const checkConfig = async (spec) => checkSpec(spec, (await renderResumePdf(spec, pools, profile)).fit);

const BAR = '─'.repeat(78);
const pad = (value, width) => String(value).padEnd(width);

const printFindings = (report, indent = '  ') => {
  for (const item of report.findings) {
    const where = Object.entries(item.where).map(([key, value]) => `${key}=${value}`).join(' ');
    console.log(`${indent}${pad(`[${item.severity}]`, 8)}${pad(item.rule, 4)}${pad(item.category, 28)}${where}`);
    const refs = item.occurrences.map((hit) => hit.ref + (hit.surface ? ` (${hit.surface})` : '')).join(', ');
    console.log(`${indent}        ${refs}${item.more ? ` ...and ${item.more} more` : ''}`);
    if (item.remedy?.candidates?.length) {
      console.log(`${indent}        swap in: ${item.remedy.candidates.map((hit) => hit.ref).join(', ')}`);
    } else if (item.remedy?.note) {
      console.log(`${indent}        ${item.remedy.note}`);
    }
  }
  if (report.counts.omitted) console.log(`${indent}...and ${report.counts.omitted} more`);
};

/**
 * `npm run resume:lint -- --phrasings` prints every alternative wording beside
 * the sentence it replaces. The guard proves a phrasing is faithful; only Rahul
 * can say whether it is the better sentence, so this is the view for that.
 */
const reviewPhrasings = () => {
  console.log(BAR);
  console.log('ALTERNATIVE WORDINGS   for review; edit the text in the content JSON');
  console.log(BAR);
  for (const sectionType of SECTION_TYPES) {
    for (const entry of pools[sectionType].entries) {
      if (entry.blocked) continue;
      for (const bullet of entry.bullets ?? []) {
        for (const [id, phrasing] of Object.entries(bullet.phrasings ?? {})) {
          const basis = phrasing.basis ?? 'default';
          console.log(`\n${entry.id}.${bullet.id} @${id}   scripts/resume/content/${sectionType}.json`);
          console.log(`  ${phrasing.note}${phrasing.basis ? `   [measured against text.${basis}]` : ''}`);
          console.log(`  was: ${bullet.text[basis]}`);
          console.log(`  now: ${phrasing.text}`);
        }
      }
    }
  }
};

const main = async () => {
  if (process.argv.includes('--phrasings')) return reviewPhrasings();
  const pool = checkPool(poolEntries());
  console.log(BAR);
  console.log('BLOCK POOL   what only a pool edit can fix');
  console.log(BAR);
  console.log(`  ${pool.metrics.bullets} selectable bullets, ${pool.metrics.distinctLeadLemmas} distinct opening verbs, `
    + `top "${pool.metrics.topOpener?.openers.join('/')}" on ${pool.metrics.topOpener?.count} `
    + `(${Math.round(pool.metrics.leadConcentration * 100)}%), ${Math.round(pool.metrics.metricCoverage * 100)}% carry a measurement`);
  const withAlternatives = poolEntries().flatMap((entry) => entry.bullets)
    .filter((bullet) => bullet.variant === 'default').length;
  const alternatives = SECTION_TYPES.flatMap((type) => pools[type].entries
    .filter((entry) => !entry.blocked)
    .flatMap((entry) => (entry.bullets ?? []).map((bullet) => Object.keys(bullet.phrasings ?? {}).length)));
  console.log(`  ${alternatives.filter(Boolean).length} of ${withAlternatives} bullets carry an alternative wording `
    + `(${alternatives.reduce((sum, count) => sum + count, 0)} in total)`);
  console.log('');
  printFindings(pool);

  console.log('');
  console.log(BAR);
  console.log('CANONICAL RESUMES   what an agent building from these would be told');
  console.log(BAR);
  let errors = pool.counts.errors;
  let warnings = pool.counts.warnings;
  for (const spec of resumeConfigs) {
    const report = await checkConfig(spec);
    errors += report.counts.errors;
    warnings += report.counts.warnings;
    const top = report.metrics.topOpener;
    console.log('');
    console.log(`${pad(spec.slug, 32)} ${report.gate}  `
      + `${report.counts.errors}e ${report.counts.warnings}w ${report.counts.notes}n  `
      + `${report.metrics.bullets} bullets, "${top?.openers.join('/')}" x${top?.count}, `
      + `${Math.round(report.metrics.metricCoverage * 100)}% measured, `
      + `${report.metrics.typography.bodyPt}pt/${report.metrics.typography.marginIn}in`);
    printFindings(report, '    ');
  }

  console.log('');
  console.log(BAR);
  console.log(errors
    ? `${errors} structural error(s). These are render defects, not style.`
    : 'No structural errors. Everything above is a judgement call about approved material.');
  // The closest honest thing to a progress number, and it stays here rather than
  // in any agent-facing tool: a scalar in a tool response is a target.
  console.log(`Corpus warning total: ${warnings}. It falls as bullets gain alternative wordings.`);
  process.exitCode = errors ? 1 : 0;
};

if (import.meta.url === `file://${process.argv[1]}`) await main();
