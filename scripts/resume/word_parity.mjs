// word_parity.mjs: hold the résumé builder's layout against Microsoft Word's.
//
//   npm run resume:word-parity            (Windows with Word installed)
//   npm run resume:word-parity -- --keep  (keep the DOCX files it wrote)
//
// The builder (server/resumeRender.mjs) lays a résumé out itself, because
// neither Python nor Word runs on Vercel, then ships a PDF it drew and a DOCX
// that Word will lay out again on the reader's machine. Those are only the same
// document if the builder breaks every line where Word does. This renders a
// matrix of specs, opens each DOCX in Word over COM, and compares, paragraph by
// paragraph, the line count and the page each starts on, plus the page total.
// Any difference fails the run.
//
// It is the independent check behind the builder's measuring (unkerned widths,
// a break after a hyphen, headings that wrap before their dates rather than run
// into them): on 2026-11-13 the builder agreed with Word on all 467 lines of the
// eight canonical résumés only once those were in. Re-run it after touching
// resumeStyles.mjs or resumeRender.mjs, and before re-pinning any line count a
// test holds. Not part of `npm test`: it needs Word.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configBySlug, pools, profile, resumeConfigs } from '../../server/resumeContent.mjs';
import { layoutResume, renderResume } from '../../server/resumeRender.mjs';

if (process.platform !== 'win32') {
  console.error('word_parity needs Windows with Microsoft Word installed.');
  process.exit(2);
}

// The tailored one-pager whose builder link showed headings drawn over their
// dates on 2026-11-13 (live at 10.5pt; its DOCX ran to 2 pages in Word).
const TAILORED = {
  subject: 'Tailored résumé',
  pages: 1,
  sections: [
    { type: 'education', title: 'EDUCATION', entries: [{ id: 'nus', bullets: ['majors', 'award'] }] },
    {
      type: 'experience',
      title: 'WORK EXPERIENCE',
      entries: [
        { id: 'stmicro-or', bullets: ['layout-agnostic'] },
        { id: 'abbott-contract', bullets: ['fault-detection', 'platform'] },
        { id: 'abbott-intern', bullets: ['pipeline', 'upskilling'] },
        { id: 'pa', bullets: ['churp'] },
      ],
    },
    { type: 'research', title: 'RESEARCH EXPERIENCE', entries: [{ id: 'amazon-vision', bullets: ['sr-reproduction'] }] },
    {
      type: 'projects',
      title: 'PROJECTS',
      entries: [{ id: 'swarmline', bullets: ['coordination'] }, { id: 'maritime', bullets: ['main'] }, { id: 'voltpulse', bullets: ['main'] }],
    },
    { type: 'leadership', title: 'CO-CURRICULAR ACTIVITIES AND VOLUNTEER EXPERIENCES', entries: [{ id: 'ntuc', bullets: ['main'] }] },
    { type: 'skills', title: 'SKILLS AND CERTIFICATIONS', lines: ['ai-skills'] },
  ],
};

const unpinned = ({ bodyPt, marginIn, ...rest }) => rest;
const cases = [
  ...resumeConfigs.map((config) => [`${config.slug}, as shipped`, { ...config, autoFit: false }]),
  ...resumeConfigs.map((config) => [`${config.slug}, auto-fit`, unpinned(config)]),
  ['tailored link of 2026-11-13, auto-fit', TAILORED],
  ['ai-engineer at a fixed 10.5pt (headings must wrap cleanly)', { ...configBySlug('ai-engineer'), bodyPt: 10.5, autoFit: false }],
  ['general, deep detail on 3 pages', { ...unpinned(configBySlug('general')), detail: 'deep', pages: 3 }],
];

const keep = process.argv.includes('--keep');
const dir = mkdtempSync(join(tmpdir(), 'resume-word-parity-'));
const ours = [];
for (const [index, [name, spec]] of cases.entries()) {
  const result = await renderResume(spec, pools, profile);
  const file = join(dir, `case-${String(index).padStart(2, '0')}.docx`);
  writeFileSync(file, result.docx);
  ours.push({ name, file, fit: result.fit, layout: layoutResume(result.spec, pools, profile, result.fit) });
}

// One Word instance for the whole matrix. Per paragraph: wdStatisticLines (1)
// over its range, and wdActiveEndPageNumber (3) of its first character.
const script = join(dir, 'word-layout.ps1');
writeFileSync(script, `
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$out = @()
try {
  foreach ($f in Get-ChildItem (Join-Path '${dir}' '*.docx') | Sort-Object Name) {
    $d = $word.Documents.Open($f.FullName, $false, $true)
    $rows = @()
    foreach ($p in $d.Paragraphs) {
      $start = $d.Range($p.Range.Start, $p.Range.Start)
      $rows += ,@($p.Range.ComputeStatistics(1), $start.Information(3))
    }
    $out += [pscustomobject]@{ file = $f.FullName; pages = $d.ComputeStatistics(2); paragraphs = $rows }
    $d.Close(0)
  }
} finally {
  $word.Quit()
  [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
ConvertTo-Json -InputObject $out -Depth 5 -Compress
`, 'utf8');
const word = JSON.parse(execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const byFile = new Map((Array.isArray(word) ? word : [word]).map((row) => [row.file.toLowerCase(), row]));

let failures = 0;
let lines = 0;
for (const { name, file, fit, layout } of ours) {
  const theirs = byFile.get(file.toLowerCase());
  const problems = [];
  if (!theirs) problems.push('Word returned nothing for this document');
  else {
    if (theirs.pages !== layout.pages) problems.push(`pages: builder ${layout.pages}, Word ${theirs.pages}`);
    if (theirs.paragraphs.length !== layout.paragraphs.length) {
      problems.push(`paragraphs: builder ${layout.paragraphs.length}, Word ${theirs.paragraphs.length}`);
    } else {
      layout.paragraphs.forEach((row, index) => {
        const [wordLines, wordPage] = theirs.paragraphs[index];
        lines += row.lines;
        if (wordLines !== row.lines || wordPage !== row.page) {
          problems.push(`¶${index + 1} "${row.text.slice(0, 56)}": builder ${row.lines} line(s) on p${row.page}, Word ${wordLines} on p${wordPage}`);
        }
      });
    }
  }
  const typography = `${fit.bodyPt}pt${fit.wrappedHeadings?.length ? `, ${fit.wrappedHeadings.length} heading(s) wrapped` : ''}`;
  console.log(`${problems.length ? '✗' : '✓'} ${name} — ${typography}, ${layout.pages} page(s), ${layout.paragraphs.length} paragraphs`);
  for (const problem of problems.slice(0, 8)) console.log(`    ${problem}`);
  if (problems.length > 8) console.log(`    … and ${problems.length - 8} more`);
  failures += problems.length ? 1 : 0;
}

console.log(failures
  ? `\nFAIL: ${failures} of ${ours.length} documents lay out differently in Word.`
  : `\nOK: ${ours.length} documents, ${lines} lines, laid out identically by the builder and by Word.`);
if (keep || failures) console.log(`DOCX files: ${dir}`);
else rmSync(dir, { recursive: true, force: true });
process.exit(failures ? 1 : 0);
