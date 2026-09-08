// resumeCheck.mjs: the deterministic résumé checker.
//
// Text in, findings out. This file imports NOTHING, which is a load-bearing
// constraint rather than a style preference: server/resumeRender.mjs pulls in
// pdfkit (12 MB) and the builder window loads résumé modules in the browser, so
// the checker has to stay reachable from both without dragging an engine along.
// tests/resume-check.test.ts asserts the absence of any import statement.
//
// Two lanes share this one rule engine:
//   Lane A (checkResume)  runs over an assembled selection and reports only what
//                         an agent composing a résumé can actually act on.
//   Lane B (checkPool)    runs over the block pool and reports what only Rahul,
//                         editing prose, can fix.
// A rule belongs to exactly one lane. Telling an agent about a defect it is
// forbidden to fix (bullet text is never agent-supplied) is noise.
//
// Every threshold below was calibrated against the real corpus. The counts each
// rule fires today are asserted in tests/resume-check.test.ts, so a content edit
// that moves them shows up as a failing assertion rather than a quietly
// different report.

export const CHECK_VERSION = 1;

// Tuning, all measured against the real corpus (see tests/resume-check.test.ts).
const LEAD_REPEAT_MIN = 3;      // bullets in one section sharing a lead lemma
const OPENER_MIN = 4;           // bullets sharing an identical opening phrase
const PARTICIPLE_MIN = 5;       // bullets closing on a participial clause
const PARTICIPLE_SHARE = 0.4;   // ...and that share of the résumé
const POOL_LEAD_MIN = 3;        // pool lead-lemma concentration
const POOL_FRAME_MIN = 6;       // pool sentence-frame concentration
const MAX_CANDIDATES = 4;       // swap suggestions per finding
const MAX_OCCURRENCES = 12;     // block ids listed per finding

// Evidence outranks wording, and paid experience is the strongest evidence on the
// page. Every rule here is about style, so no finding in the EXPERIENCE section
// may ever be answered by removing a role: the remedies there are reworded or
// accepted, never dropped. A résumé that is right about the work and repeats a
// verb beats one that reads well and has less to show.
const EVIDENCE_FIRST = 'experience';
const EVIDENCE_GAP = 2;         // extra named technologies before a stronger alternative is worth naming

// ── lexicon ───────────────────────────────────────────────────────────────
// Frozen and exported so the word lists are reviewable in one place, and so a
// test can prove the checker never emits a string it did not read from input.

const IRREGULAR_LEAD = {
  built: 'build', led: 'lead', ran: 'run', wrote: 'write', made: 'make',
  held: 'hold', drove: 'drive', won: 'win', taught: 'teach', brought: 'bring',
  sought: 'seek', spent: 'spend', met: 'meet', kept: 'keep', grew: 'grow',
};

// Hedges and padding. This list is deliberately small: a 33-pattern sweep over
// the 68 selectable texts returned 5 hits, so filler is a real but minor defect
// in this corpus, reported as a note rather than dressed up as a gate. The
// lookarounds treat a hyphenated compound as one token, so "responsible" cannot
// fire inside "responsible-disclosure".
const HEDGES = [
  'responsible for', 'helped', 'helping', 'assisted', 'assisting', 'worked on',
  'involved in', 'tasked with', 'participated in', 'contributed to',
  'was able to', 'in order to', 'successfully', 'various', 'several',
  'a variety of', 'duties included', 'utilized', 'utilised', 'leveraged',
  'day-to-day', 'as needed', 'robust', 'cutting-edge', 'state-of-the-art',
  'and more', 'among others',
];

// Digit runs that look quantified but name a product, protocol, course, version
// or year. These are masked before metric matching, which is what takes the
// naive "a digit means quantified" count on this corpus from 16 bullets down to
// the 10 that really carry a measurement.
const NON_METRIC = [
  /\b(?:19|20)\d{2}\b/g,                                    // 2023, 2024
  /\b[A-Z][A-Za-z]*\d{2,}(?:\/\d+)*\b/g,                    // CS4277, GBBP12/13
  /\b\d+(?:\.\d+)+\b/g,                                     // 2.0
  /\b\d\s?[Dd]\b(?![a-z])/g,                                // 3D
  /\b(?:GPT|Veo|Gemini|Gemma|Llama|Mistral|BERT|Route|Layer|OSI|OAuth|RTX|CUDA|ASPIRE|IPv|HTTP)[- ]?\d+[A-Za-z]?\b/g,
  /\b\d+(?:st|nd|rd|th)\b/g,                                // 7th Singapore Astronomical Olympiad
];

// What does count. Each pattern names a magnitude, a unit, or a population.
const METRIC = [
  { kind: 'percent', re: /\b\d[\d,.]*\s?%/g },
  { kind: 'currency', re: /(?:S\$|US\$|\$|€|£)\s?\d[\d,.]*/g },
  { kind: 'plus', re: /\b\d[\d,.]*\+/g },
  { kind: 'multiplier', re: /\b\d+(?:\.\d+)?\s?[xX]\b/g },
  { kind: 'magnitude', re: /\b\d+(?:\.\d+)?[KMB]\b/g },
  { kind: 'unit', re: /\b\d+-(?:stage|hour|day|week|month|year|person|team|node|step|fold|page|minute|second)\b/gi },
  { kind: 'duration', re: /\b(?:sub-)?\d+\s?(?:ms|sec|seconds?|minutes?|hours?|days?|weeks?|months?|years?)\b/g },
  { kind: 'bound', re: /\bsub-(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)-(?:minute|second|hour|day|ms)\b/gi },
  { kind: 'word-count', re: /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|zero)[- ](?:month|week|day|year|hour|plant|plants|site|sites|team|teams|model|models|failure|failures|line|lines|stage|stages)\b/gi },
  { kind: 'population', re: /\b\d[\d,]*\s+(?:teams?|students?|candidates?|programs?|users?|sites?|models?|services?|plants?|tests?|assertions?)\b/gi },
  { kind: 'of-n', re: /\b(?:class|cohort|field|group)\s+of\s+\d+/gi },
  { kind: 'rank', re: /\btop\s+(?:\d+|quartile|quarter|half)\b/gi },
];

export const LEXICON = Object.freeze({
  irregularLead: Object.freeze({ ...IRREGULAR_LEAD }),
  hedges: Object.freeze([...HEDGES]),
  metricKinds: Object.freeze(METRIC.map((rule) => rule.kind)),
});

// ── primitives ────────────────────────────────────────────────────────────

const undouble = (base) => (/([bdfglmnprt])\1$/.test(base) ? base.slice(0, -1) : base);

/**
 * The lemma of a bullet's opening verb.
 *
 * Deliberately minimal: an irregular map, a leading "co-" strip, and an -ed/-ing
 * stripper. A derivational family table (engineer, engineering and engineered in
 * one bucket with automate and automation) was measured to change the lead-verb
 * picture by a single family while manufacturing non-words such as "pursu" and
 * "appli" that would then ship inside agent-facing evidence. Build and Built must
 * collapse: a reader sees a present-tense current role and a past-tense previous
 * one as the same opener, and so does Co-built.
 */
export const leadLemma = (word) => {
  const raw = String(word ?? '').toLowerCase().replace(/^co-/, '').replace(/[^a-z-]+$/, '');
  if (!raw) return '';
  if (IRREGULAR_LEAD[raw]) return IRREGULAR_LEAD[raw];
  if (raw.length > 5 && raw.endsWith('ing')) return undouble(raw.slice(0, -3));
  if (raw.length > 4 && raw.endsWith('ed')) return undouble(raw.slice(0, -2));
  return raw;
};

/**
 * True for a bullet that opens with a label rather than a verb. Three exist and
 * all three are deliberate ("Relevant coursework:", "NVIDIA Disaster Risk
 * Monitoring with Satellite Imagery:"), so every verb rule shares this one
 * predicate rather than each defining its own. The window is 60 characters
 * because the longest of the three carries its colon at 54.
 */
export const isLabelLine = (text) => /^[^.]{0,60}:/.test(String(text ?? ''));

export const firstWord = (text) => (String(text ?? '').trim().split(/\s+/)[0] ?? '');

const leadSurface = (text) => firstWord(text).replace(/[^A-Za-z-]+$/, '');

/**
 * Metric spans in a bullet, plus the digit runs that were rejected and why.
 * Reporting the rejects matters: an agent that sees GPT-4 suppressed as a product
 * number understands why its bullet did not count as quantified, and does not
 * respond by inventing one, which the résumé rules flatly ban.
 */
export const metricsIn = (text) => {
  const source = String(text ?? '');
  const suppressed = [];
  // Mask non-metric digit runs in place, preserving every offset.
  let masked = source;
  for (const rule of NON_METRIC) {
    // The offset is read from the end of the argument list rather than as the
    // second parameter: String.replace inserts one argument per capture group,
    // so a group added to any NON_METRIC pattern later would otherwise shift the
    // offset silently and mask the wrong span.
    masked = masked.replace(new RegExp(rule.source, rule.flags), (...args) => {
      const match = args[0];
      const offset = args[args.length - 2];
      suppressed.push({ surface: match, start: offset, reason: 'product-number' });
      return ' '.repeat(match.length);
    });
  }
  const spans = [];
  for (const { kind, re } of METRIC) {
    for (const match of masked.matchAll(new RegExp(re.source, re.flags))) {
      const surface = source.slice(match.index, match.index + match[0].length).replace(/[,.;:]+$/, '');
      if (surface) spans.push({ kind, surface, start: match.index, end: match.index + surface.length });
    }
  }
  // De-overlap by span: longest match wins at any given start.
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const metrics = [];
  for (const span of spans) if (!metrics.length || span.start >= metrics[metrics.length - 1].end) metrics.push(span);
  return { metrics, suppressed: suppressed.sort((a, b) => a.start - b.start) };
};

/**
 * How many of Rahul's own attested technologies a bullet names.
 *
 * The term list is supplied by the caller from the skills lines, so this file
 * still imports nothing and the vocabulary stays the one he has already claimed
 * rather than a dictionary. It is a measure of evidence DENSITY, not of quality:
 * a bullet naming no technology may still carry the better outcome, which is why
 * the rule that uses it reports both and never says one bullet beats another.
 */
export const termsIn = (text, terms = []) => {
  const source = String(text ?? '');
  const found = new Set();
  for (const term of terms) {
    const re = new RegExp(`(?<![A-Za-z])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'i');
    if (re.test(source)) found.add(term.toLowerCase());
  }
  return [...found].sort();
};

/** Hedge and padding spans, matched so a hyphenated compound stays one token. */
export const hedgesIn = (text) => {
  const source = String(text ?? '');
  const found = [];
  for (const phrase of HEDGES) {
    const re = new RegExp(`(?<![\\w-])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'gi');
    for (const match of source.matchAll(re)) {
      found.push({ surface: source.slice(match.index, match.index + match[0].length), start: match.index });
    }
  }
  return found.sort((a, b) => a.start - b.start);
};

/**
 * The two repeated sentence frames this corpus actually has. Classic filler is
 * nearly absent here; what reads as padding is 10 of 41 bullets opening
 * "Built a/an ..." and 47% of texts closing on a trailing participial clause.
 * A unigram rule structurally cannot see either.
 */
export const framesIn = (text) => {
  const source = String(text ?? '');
  const frames = [];
  const opener = /^(\w[\w-]*\s+an?)\s/.exec(source);
  if (opener) frames.push({ kind: 'opener', surface: opener[1].toLowerCase(), start: 0 });
  for (const match of source.matchAll(/,\s+(\w+ing)\b/g)) {
    frames.push({ kind: 'trailing-participle', surface: match[1].toLowerCase(), start: match.index });
  }
  return frames;
};

const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

/**
 * Does this entry's date label describe work that is still going on?
 *
 * Parsing the end month matters rather than the year alone: "Jan 2026 - Jun 2026"
 * and "Sep 2025 - Sep 2026" are both finished as of a 2026-09 edition, and a
 * year-only comparison reads them as ongoing and then flags their correct past
 * tense. Labels here are "Aug 2026 - Present", "Jan 2026 - Jun 2026", "Mar 2026",
 * "2024 - Present" or a bare year.
 */
export const isOngoing = (dateLabel, today) => {
  const label = String(dateLabel ?? '').trim();
  if (/present\s*$/i.test(label)) return true;
  const tail = label.split(/[\u2013\u2014-]/).pop().trim();
  const withMonth = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(tail);
  if (withMonth) {
    const month = MONTHS[withMonth[1].toLowerCase()];
    return month ? `${withMonth[2]}-${month}` > today : false;
  }
  const yearOnly = /^(\d{4})$/.exec(tail);
  return yearOnly ? `${yearOnly[1]}-12` > today : false;
};

// The PDF fonts are Standard-14 Times, which pdfkit writes in WinAnsi. That is
// Latin-1 plus the printable set Windows-1252 maps into 0x80-0x9F, and it is not
// a contiguous range: a codepoint ceiling would pass Latin Extended-A, Greek and
// Cyrillic, all of which would drop out of the document. The corpus contains one
// non-ASCII character today, the en dash in "OSI Layer 3-4", and it is in the
// set; this guard is for whatever gets pasted in next.
const WINANSI_SPECIALS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

export const isWinAnsi = (glyph) => {
  const code = glyph.codePointAt(0);
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)
    || code === 0x09 || code === 0x0a || WINANSI_SPECIALS.has(code);
};


// ── the attestation guard ─────────────────────────────────────────────────
// Runs over COMMITTED content, in npm test and npm run resume:lint. There is no
// request-time text to validate, because agents send ids: a bad phrasing can
// only enter through a commit, so that is where the guard belongs.
//
// What it catches: invented facts, added or dropped entities and numbers, a
// dropped product-number, fit drift, a phrasing that buys nothing, and verb-role
// drift. What it CANNOT catch: recombination (every token attested, arranged to
// assert something no source asserts), modality ("targets replacing" becoming
// "replaced" keeps the lemma and turns a plan into a result), and implicature.
// A sentence can pass every rule here and still be wrong. Human review is the
// control; this is a filter in front of it, never a substitute for it.

/** Proper nouns and numbers, which are the tokens that carry a factual claim. */
const claimTokens = (text) => (String(text ?? '')
  .split(/\s+/).slice(1).join(' ')                 // drop the lead verb, which is what a phrasing is FOR
  .match(/\b(?:[A-Z][A-Za-z0-9+.#-]*|[0-9][\w.,%+-]*)\b/g) ?? [])
  .map((token) => token.toLowerCase().replace(/[.,;:]+$/, ''));

const multiset = (values) => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([value, count]) => `${value}x${count}`).join('|');
};

/**
 * Check one alternative phrasing against the bullet it belongs to.
 *
 * `lineGrid` is [{ bodyPt, marginIn, phrasing, default }] measured by the caller
 * with the renderer's own wrapper. It is a sweep of the whole legal spec grid,
 * not the four-rung auto-fit ladder: specSchema lets a caller pin bodyPt 10 to
 * 12 and marginIn 0.5 to 1.0, so parity at the ladder is a sample rather than an
 * invariant, and a phrasing that fits at 10pt can overflow at 12.
 *
 * Returns [{ code, detail }]; empty means clean.
 */
export const attestPhrasing = (phrasing, bullet, { lineGrid = [], ownership = null } = {}) => {
  const problems = [];
  const text = String(phrasing?.text ?? '');
  // Which approved wording this is an alternative TO. Almost always the default;
  // "deep" exists so a bullet can carry a tighter form of its own long variant,
  // which is otherwise unwritable: such a phrasing is longer than the default by
  // construction and the fit rule would reject it for the wrong reason.
  const basisKey = phrasing?.basis ?? 'default';
  const base = bullet.text[basisKey];
  const push = (code, detail) => problems.push({ code, detail });

  if (!text) return [{ code: 'G0-empty', detail: 'a phrasing needs text' }];
  if (!base) return [{ code: 'G0-basis', detail: `basis "${basisKey}" does not exist on this bullet` }];
  if (!phrasing.note) push('G0-note', 'a phrasing needs a note saying how its shape differs');

  // G1 evidence containment: every proper noun and number must already appear in
  // one of this bullet's own approved wordings.
  const attested = new Set([...claimTokens(base), ...claimTokens(bullet.text.deep ?? '')]);
  const invented = claimTokens(text).filter((token) => !attested.has(token));
  if (invented.length) push('G1-unattested', `not in this bullet's approved text: ${[...new Set(invented)].join(', ')}`);

  // G2/G3 the facts are the same facts. Not subset: dropping a number is a
  // different sentence, and dropping a suppressed product-number quietly loses
  // evidence (the "3D" in the MediaPipe bullet is the whole 3D-landmark claim).
  const here = metricsIn(text);
  const there = metricsIn(base);
  if (multiset(here.metrics.map((item) => item.surface)) !== multiset(there.metrics.map((item) => item.surface))) {
    push('G2-metrics', `measurements differ: [${here.metrics.map((m) => m.surface)}] vs [${there.metrics.map((m) => m.surface)}]`);
  }
  if (multiset(here.suppressed.map((item) => item.surface)) !== multiset(there.suppressed.map((item) => item.surface))) {
    push('G3-entities', `product numbers differ: [${here.suppressed.map((m) => m.surface)}] vs [${there.suppressed.map((m) => m.surface)}]`);
  }

  // G4 renderable in the PDF fonts.
  const bad = [...text].filter((glyph) => !isWinAnsi(glyph));
  if (bad.length) push('G4-glyph', `outside WinAnsi: ${[...new Set(bad)].join('')}`);

  // G5 fit, swept rather than sampled.
  const overflows = lineGrid.filter((point) => point.phrasing > point.default);
  if (overflows.length) {
    const worst = overflows[overflows.length - 1];
    push('G5-fit', `longer than the ${basisKey} wording at ${overflows.length}/${lineGrid.length} typography settings, worst ${worst.bodyPt}pt/${worst.marginIn}in (${worst.phrasing} lines vs ${worst.default})`);
  }

  // G6 earns its place. Three ways to do that: open on a different verb, take a
  // different sentence shape, or measurably cost fewer lines somewhere on the
  // grid. The third is what a length alternative is for, and it is not supposed
  // to change the verb, so requiring it to would reject exactly the phrasing that
  // gives the fit ladder a content-side rung it otherwise lacks.
  const sameLead = leadLemma(firstWord(text)) === leadLemma(firstWord(base));
  const shape = (value) => framesIn(value).map((frame) => `${frame.kind}:${frame.surface}`).sort().join('|');
  const shorterSomewhere = lineGrid.some((point) => point.phrasing < point.default);
  if (sameLead && shape(text) === shape(base) && !shorterSomewhere) {
    push('G6-redundant', `same opening verb and same sentence shape as the ${basisKey} wording, and never shorter`);
  }

  // G7 the claim itself. This is the rule a synonym list would break: containment,
  // metrics, fit and lemma can all pass while the ownership moves.
  if (ownership) {
    const lemmaHere = leadLemma(firstWord(text));
    const lemmaThere = leadLemma(firstWord(base));
    const rankHere = ownership.ranks[lemmaHere];
    const rankThere = ownership.ranks[lemmaThere];
    if (!rankHere) push('G7-unranked', `"${firstWord(text)}" (${lemmaHere}) is not in ownership.json; add it deliberately`);
    else if (rankThere && rankHere !== rankThere) {
      push('G7-ownership', `"${firstWord(text)}" is ${rankHere} where the default is ${rankThere}; this changes what is claimed, not how it is worded`);
    }
  }
  return problems;
};

// ── report assembly ───────────────────────────────────────────────────────

/**
 * One finding. Occurrences are capped and the overflow counted rather than
 * dropped silently: the coverage note on the two-page CV would otherwise list
 * two thirds of the résumé, which is a wall of ids rather than something to act
 * on. `where` always carries the true total, so the cap never hides the size of
 * what was found.
 */
const finding = (rule, severity, category, where, occurrences, remedy) => ({
  rule,
  severity,
  category,
  where,
  occurrences: occurrences.slice(0, MAX_OCCURRENCES),
  ...(occurrences.length > MAX_OCCURRENCES ? { more: occurrences.length - MAX_OCCURRENCES } : {}),
  ...(remedy ? { remedy } : {}),
});

const byRef = (a, b) => String(a.ref).localeCompare(String(b.ref));

/** The distinct opening words actually on the page, for one group of bullets. */
const openersOf = (rows) => [...new Set(rows.map((row) => row.surface))].sort();

/**
 * Prefer an alternative wording over swapping a block out. A rephrase keeps the
 * evidence and changes only the sentence; a swap trades one piece of evidence for
 * another, which is a bigger decision and often the wrong one.
 */
const rephraseRemedy = (rephrase, swaps, noneNote) => {
  if (rephrase.length) return { kind: 'rephrase', candidates: rephrase, ...(swaps.length ? { alsoSwappable: swaps.map((item) => item.ref) } : {}) };
  if (swaps.length) return { kind: 'swap', candidates: swaps };
  return { kind: 'none', note: noneNote };
};

const bySection = (rows) => {
  const groups = new Map();
  for (const row of rows) {
    const key = row.sectionType ?? 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
};

const round = (value) => Math.round(value * 100) / 100;

const SEVERITY_ORDER = { error: 0, warn: 1, note: 2 };
const RULE_ORDER = { R1: 0, R2: 1, R3: 2, R4: 3, R5: 4, R6: 5, R7: 6, P1: 7, P2: 8, P3: 9, P4: 10 };

/**
 * Sort findings into a total order that does not depend on input order, cap them
 * once, and derive the headline metrics. One cap and one `omitted` count, not a
 * separate truncation rule per finding type.
 */
/**
 * One line naming what is actually wrong and what to do about it.
 *
 * The findings array is precise and an agent skimming JSON reads none of it.
 * This is the sentence that gets read, so it says the biggest problem, the fix
 * that costs nothing, and the standing rule that keeps the fix from being
 * "delete some evidence".
 */
const summarise = (rows, findings, counts) => {
  if (!rows.length) return 'Nothing selected.';
  const actionable = findings.filter((item) => item.remedy?.kind === 'rephrase');
  const parts = [];
  const worst = findings.find((item) => item.severity === 'error')
    ?? findings.find((item) => item.category === 'lead-verb-repeat')
    ?? findings.find((item) => item.severity === 'warn')
    ?? findings[0];
  if (!worst) return `${rows.length} bullets, nothing to flag.`;
  if (counts.errors) parts.push(`${counts.errors} structural error(s) to fix before sending`);
  const where = worst.where ?? {};
  const section = String(where.sectionType ?? '').toUpperCase();
  const openers = (where.openers ?? []).join('/');
  const phrase = {
    'lead-verb-repeat': () => `${where.count} of ${where.of} ${section} bullets open "${openers}"`,
    'adjacent-repeat': () => `${where.count} bullets in a row in ${section} open "${openers}"`,
    'frame-repeat': () => `${where.count} of ${where.of} bullets share one sentence shape${where.opener ? ` ("${where.opener} ...")` : ''}`,
    unquantified: () => `only ${where.quantified} of ${where.of} bullets carry a measurement`,
    'line-budget': () => `${where.count} bullet(s) run past ${where.maxLines} lines`,
    hedge: () => `${where.count} bullet(s) hedge a claim the evidence already supports`,
    'too-many-bullets': () => `an entry carries more than ${where.limit} bullets`,
    'duplicate-block': () => 'the same block is selected twice',
    'duplicate-label-line': () => 'two label lines are selected on one entry',
    'unrenderable-glyph': () => 'a character will not render in the PDF fonts',
    'unused-evidence': () => `${where.count} bullet(s) you selected have a richer alternative on the same entry`,
  }[worst.category];
  parts.push(phrase ? phrase() : `worst finding is ${worst.category}`);
  const free = actionable.flatMap((item) => item.remedy.candidates ?? []).slice(0, 2);
  parts.push(free.length
    ? `${actionable.length} finding(s) have an approved alternative wording that costs no evidence, starting with ${free.map((item) => `${item.ref}@${item.phrasing}`).join(' and ')}`
    : 'no alternative wording is available, so accept what remains');
  parts.push('Never drop a bullet, a role, or a measurement to clear a style finding: the evidence outranks the wording');
  return `${parts.join('. ')}.`;
};

const report = (rows, all, typography, maxFindings) => {
  const sorted = [...all].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    || RULE_ORDER[a.rule] - RULE_ORDER[b.rule]
    || String(a.category).localeCompare(String(b.category))
    || String(a.occurrences[0]?.ref ?? '').localeCompare(String(b.occurrences[0]?.ref ?? '')));
  const findings = sorted.slice(0, maxFindings);
  const counts = {
    errors: sorted.filter((item) => item.severity === 'error').length,
    warnings: sorted.filter((item) => item.severity === 'warn').length,
    notes: sorted.filter((item) => item.severity === 'note').length,
    omitted: sorted.length - findings.length,
  };
  // Tallied by lemma so Build and Built count as one opener, but reported as the
  // words on the page: the lemma is a manufactured stem and "pursu" has no place
  // in anything a reader or an agent sees.
  const verbs = rows.filter((row) => row.lemma);
  const tally = new Map();
  for (const row of verbs) {
    const seen = tally.get(row.lemma) ?? { count: 0, openers: new Set() };
    seen.count += 1;
    seen.openers.add(row.surface);
    tally.set(row.lemma, seen);
  }
  const top = [...tally].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))[0] ?? null;
  // Label lines ("Relevant coursework: ...") are not claims and never carry a
  // measurement, so they stay out of the coverage denominator here exactly as
  // they do in R4's own count.
  const countable = rows.filter((row) => !row.isLabel);
  const quantified = countable.filter((row) => row.metrics.length).length;
  return {
    version: CHECK_VERSION,
    summary: summarise(rows, findings, counts),
    metrics: {
      bullets: rows.length,
      distinctLeadLemmas: tally.size,
      topOpener: top ? { openers: [...top[1].openers].sort(), count: top[1].count } : null,
      leadConcentration: verbs.length && top ? round(top[1].count / verbs.length) : 0,
      metricCoverage: countable.length ? round(quantified / countable.length) : 0,
      maxBulletLines: rows.reduce((max, row) => Math.max(max, row.lines ?? 0), 0) || null,
      ...(typography ? { typography } : {}),
    },
    gate: counts.errors === 0 ? 'pass' : 'fail',
    counts,
    findings,
  };
};

const annotate = (bullet) => {
  const { metrics, suppressed } = metricsIn(bullet.text);
  const label = isLabelLine(bullet.text);
  return {
    ...bullet,
    isLabel: label,
    lemma: label ? null : leadLemma(firstWord(bullet.text)),
    surface: leadSurface(bullet.text),
    metrics,
    suppressed,
    hedges: hedgesIn(bullet.text),
    frames: framesIn(bullet.text),
  };
};

/**
 * Lane A. `bullets` are assembled items carrying { ref, entryId, bulletId,
 * sectionType, variant, text } and optionally `lines` from measureBulletLines.
 * `candidates` are the unselected bullets available on entries already in the
 * résumé: swapping one in is the only remedy an agent is allowed to apply, so a
 * finding that has none says so rather than implying a fix that does not exist.
 */
export const checkResume = (bullets, { candidates = [], rephrasings = {}, skillTerms = [], maxLines = 3, typography = null, maxFindings = 12 } = {}) => {
  const rows = bullets.map(annotate);
  // Alternative wordings Rahul has already approved for the bullets on this page,
  // keyed by ref. These are what turn a finding that could only be reported into
  // one that can be answered: most entries carry a single bullet, so for the bulk
  // of the repetition there has never been another block to swap to.
  const rephraseFor = (refs, clears) => refs.flatMap((ref) => (rephrasings[ref] ?? [])
    .filter((option) => clears(option))
    .map((option) => ({ ref, phrasing: option.id, lead: option.lead, lines: option.lines, hasMetric: option.hasMetric, text: option.text })))
    .sort((a, b) => byRef(a, b) || String(a.phrasing).localeCompare(String(b.phrasing)))
    .slice(0, MAX_CANDIDATES);
  const findings = [];

  // R1 lead-verb-repeat: three or more bullets in one SECTION open with the same
  // lemma. The window is the section rather than the document because that is
  // where a reader's eye lands: the general CV is 35% "build" overall but 7 of 12
  // inside PROJECTS, and the document-wide number hides that.
  for (const [sectionType, group] of bySection(rows)) {
    const byLemma = new Map();
    for (const row of group) {
      if (!row.lemma) continue;
      byLemma.set(row.lemma, [...(byLemma.get(row.lemma) ?? []), row]);
    }
    for (const [lemma, hits] of [...byLemma].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
      if (hits.length < LEAD_REPEAT_MIN) continue;
      // Candidates come from the firing section only. A swap offered from another
      // section is not a remedy for this finding.
      const used = new Set(group.map((row) => row.ref));
      const swaps = candidates
        .filter((item) => item.sectionType === sectionType && !used.has(item.ref)
          && group.some((row) => row.entryId === item.entryId)
          && leadLemma(firstWord(item.text)) !== lemma)
        .map((item) => ({ ref: item.ref, lead: leadSurface(item.text), hasMetric: metricsIn(item.text).metrics.length > 0 }))
        .sort((a, b) => Number(b.hasMetric) - Number(a.hasMetric) || byRef(a, b))
        .slice(0, MAX_CANDIDATES);
      // A phrasing clears this finding exactly when it opens on a different lemma.
      const rephrase = rephraseFor(hits.map((row) => row.ref), (option) => option.lemma !== lemma);
      findings.push(finding('R1', 'warn', 'lead-verb-repeat',
        // Openers are the surface forms actually on the page. The lemma is only a
        // grouping key, and a suffix stripper makes non-words out of some verbs
        // ("Pursuing" gives "pursu"), which have no business in agent-facing text.
        { sectionType, openers: openersOf(hits), count: hits.length, of: group.length },
        hits.map((row) => ({ ref: row.ref, surface: row.surface })),
        rephraseRemedy(rephrase, swaps, sectionType === EVIDENCE_FIRST
          ? 'Nothing on these entries opens differently yet, so accept this one. Never drop a role, or a bullet that carries the evidence, to fix a repeated verb: what the work was outranks how the sentence opens. A pool rewrite is the only real fix and it is not yours to make.'
          : 'No unselected bullet on these entries opens differently, and none of them has an alternative wording yet. The levers are a pool rewrite, or dropping an entry if it was marginal anyway. Accepting the repeat is usually better than dropping evidence for it.')));
    }
  }

  // R2 adjacent-repeat: consecutive bullets sharing a lemma, maximal runs merged
  // so a run of three is one finding. Cheapest defect to see and the first a
  // reader notices. Reordering is not a remedy: assemble sorts by date.
  for (const [sectionType, group] of bySection(rows)) {
    let run = [];
    const flush = () => {
      if (run.length >= 2) {
        // Only the second and later members need to move; the order is fixed by date.
        const later = run.slice(1).map((row) => row.ref);
        const rephrase = rephraseFor(later, (option) => option.lemma !== run[0].lemma);
        findings.push(finding('R2', 'warn', 'adjacent-repeat',
          { sectionType, openers: openersOf(run), count: run.length },
          run.map((row) => ({ ref: row.ref, surface: row.surface })),
          rephrase.length
            ? { kind: 'rephrase', candidates: rephrase, note: 'Change the second and any later bullet in the run. The order is fixed by date.' }
            : { kind: 'swap-later', note: 'Change the second and any later bullet in the run. The order is fixed by date.' }));
      }
      run = [];
    };
    for (const row of group) {
      if (row.lemma && run.length && run[run.length - 1].lemma === row.lemma) run.push(row);
      else { flush(); run = row.lemma ? [row] : []; }
    }
    flush();
  }

  // R3 frame-repeat: the padding this corpus really has. Four or more bullets
  // sharing an opener frame, or closing on a trailing participial clause.
  const frameGroups = new Map();
  for (const row of rows) {
    for (const frame of row.frames) {
      const key = frame.kind === 'opener' ? `opener:${frame.surface}` : 'trailing-participle';
      if (!frameGroups.has(key)) frameGroups.set(key, new Map());
      frameGroups.get(key).set(row.ref, frame.surface);
    }
  }
  for (const [key, hits] of [...frameGroups].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))) {
    const [kind, opener] = key.split(':');
    // Two different thresholds, because the two frames are noticed differently.
    // An identical opening phrase is conspicuous at any length, so it is a count.
    // A trailing participle is ordinary English and only reads as padding once it
    // dominates, and the pool runs 47% of them, so a bare count there would fire
    // on every résumé and stop discriminating.
    const loud = kind === 'opener'
      ? hits.size >= OPENER_MIN
      : hits.size >= PARTICIPLE_MIN && hits.size / rows.length >= PARTICIPLE_SHARE;
    if (!loud) continue;
    const framed = [...hits].map(([ref]) => ref);
    const rephrase = rephraseFor(framed, (option) => !option.frames.includes(key));
    findings.push(finding('R3', 'warn', 'frame-repeat',
      { frame: kind, ...(opener ? { opener } : {}), count: hits.size, of: rows.length },
      [...hits].map(([ref, surface]) => ({ ref, surface })).sort(byRef),
      rephrase.length
        ? { kind: 'rephrase', candidates: rephrase, note: 'These bullets share one sentence shape, which reads as padding even though each is factual. Each wording below breaks it.' }
        : { kind: 'accept-or-swap', note: 'These bullets share one sentence shape, which reads as padding even though each is factual. Vary it in the pool, or accept it.' }));
  }

  // Hedges ride as a category of R3 rather than seven rules of their own: this
  // corpus carries five hits in total.
  const hedged = rows.filter((row) => row.hedges.length);
  if (hedged.length) {
    findings.push(finding('R3', 'note', 'hedge',
      { count: hedged.length, of: rows.length },
      hedged.map((row) => ({ ref: row.ref, surface: row.hedges[0].surface })).sort(byRef),
      { kind: 'pool-edit', note: 'A hedging word weakens a claim the evidence already supports. Only Rahul can reword it.' }));
  }

  // R4 unquantified: reported as coverage, as a note on purpose. Measured coverage
  // across the approved résumés is about a quarter, so a rule that reads as a
  // verdict on Rahul's own documents gets ignored, or answered with an invented
  // number, and inventing numbers is the one thing the résumé rules ban.
  const countable = rows.filter((row) => !row.isLabel);
  const quantified = countable.filter((row) => row.metrics.length);
  const unquantified = countable.filter((row) => !row.metrics.length);
  if (unquantified.length) {
    const spare = candidates
      .filter((item) => !rows.some((row) => row.ref === item.ref)
        && rows.some((row) => row.entryId === item.entryId)
        && metricsIn(item.text).metrics.length)
      .map((item) => ({ ref: item.ref, metrics: metricsIn(item.text).metrics.map((metric) => metric.surface) }))
      .sort(byRef)
      .slice(0, MAX_CANDIDATES);
    findings.push(finding('R4', 'note', 'unquantified',
      { quantified: quantified.length, of: countable.length },
      unquantified.map((row) => ({
        ref: row.ref,
        ...(row.suppressed.length ? { suppressed: row.suppressed.map((item) => ({ surface: item.surface, reason: item.reason })) } : {}),
      })).sort(byRef),
      spare.length
        ? { kind: 'swap', candidates: spare, note: 'These unselected bullets, on entries you already use, do carry a measurement.' }
        : { kind: 'none', note: 'Never add a number to satisfy this. A measurement that is not already in the block pool does not exist.' }));
  }

  // R5 line-budget: silent on every canonical résumé, and fires exactly when an
  // agent asks for deep variants on a one-page budget. Line counts come from the
  // renderer's own wrapper, measured by the caller at the fitted typography.
  const overLong = rows.filter((row) => typeof row.lines === 'number' && row.lines > maxLines);
  if (overLong.length) {
    const rephrase = rephraseFor(overLong.map((row) => row.ref),
      (option) => typeof option.lines === 'number' && option.lines <= maxLines);
    findings.push(finding('R5', 'warn', 'line-budget',
      { maxLines, count: overLong.length },
      overLong.map((row) => ({ ref: row.ref, lines: row.lines, variant: row.variant })).sort(byRef),
      rephrase.length
        ? { kind: 'rephrase', candidates: rephrase, note: 'These wordings hold the same facts inside the budget.' }
        : { kind: 'variant-or-pages', note: 'Set variant "standard" on these entries, or raise pages to 2.' }));
  }

  // R7 unused-evidence: an entry you already use carries a bullet that names more
  // of the technologies your own skills lines claim than one you picked. This is
  // the rule that answers "why does every résumé take the changeover pipeline and
  // leave the digital twin behind" without anyone having to notice by eye.
  //
  // A note, and phrased as a trade rather than a verdict: the thinner bullet often
  // carries the measured outcome, so the report names both counts and lets the
  // agent decide which evidence the posting actually wants.
  if (skillTerms.length) {
    const richer = [];
    for (const row of rows) row.terms = termsIn(row.text, skillTerms);
    for (const item of candidates) {
      if (rows.some((row) => row.ref === item.ref)) continue;
      const spare = { ref: item.ref, terms: termsIn(item.text, skillTerms), metrics: metricsIn(item.text).metrics.length };
      for (const row of rows.filter((entry) => entry.entryId === item.entryId)) {
        if (spare.terms.length - row.terms.length < EVIDENCE_GAP) continue;
        richer.push({ ref: row.ref, names: row.terms.length, hasMetric: row.metrics.length > 0,
          instead: spare.ref, insteadNames: spare.terms.length, insteadHasMetric: spare.metrics > 0,
          insteadTerms: spare.terms.slice(0, 6) });
      }
    }
    if (richer.length) {
      findings.push(finding('R7', 'note', 'unused-evidence', { count: richer.length },
        richer.sort(byRef),
        { kind: 'swap', note: 'These entries are already on the page, and each carries another bullet naming more of the technologies your skills lines claim. Not automatically better: check whether the one you picked carries the measured outcome instead, and keep whichever the posting is actually hiring for.' }));
    }
  }

  // R6 structure: hard checks that guard a real render defect rather than taste.
  // All three are silent today, which is what makes gate "pass" mean something.
  const perEntry = new Map();
  for (const row of rows) perEntry.set(row.entryId, [...(perEntry.get(row.entryId) ?? []), row]);
  const crowded = [...perEntry].filter(([, list]) => list.length > 4);
  if (crowded.length) {
    findings.push(finding('R6', 'error', 'too-many-bullets', { limit: 4 },
      crowded.map(([entryId, list]) => ({ ref: entryId, count: list.length })).sort(byRef),
      { kind: 'drop', note: 'Four bullets on one entry is the ceiling. Drop one.' }));
  }
  const duplicates = [...new Set(rows.map((row) => row.ref).filter((ref, index, all) => all.indexOf(ref) !== index))];
  if (duplicates.length) {
    findings.push(finding('R6', 'error', 'duplicate-block', {},
      duplicates.sort().map((ref) => ({ ref })),
      { kind: 'drop', note: 'The same block is selected twice and would render twice.' }));
  }
  // Two bullets on one entry opening with the SAME label render as two
  // "Relevant coursework:" rows, which is never intended: the pool carries
  // several course lists so a résumé can pick the one that fits the posting, not
  // so it can print them all. Different labels on one entry are fine and
  // deliberate: the Additional Projects entry is a titled line per project.
  const sameLabel = new Map();
  for (const row of rows) {
    if (!row.isLabel) continue;
    const key = `${row.entryId}::${row.text.slice(0, row.text.indexOf(':')).toLowerCase()}`;
    sameLabel.set(key, [...(sameLabel.get(key) ?? []), row]);
  }
  const collisions = [...sameLabel.values()].filter((list) => list.length > 1);
  if (collisions.length) {
    findings.push(finding('R6', 'error', 'duplicate-label-line', {},
      collisions.flat().map((row) => ({ ref: row.ref })).sort(byRef),
      { kind: 'drop', note: 'Keep one of these. They are alternative lists under the same heading, not additions to each other.' }));
  }

  const unrenderable = rows
    .map((row) => ({ ref: row.ref, surface: [...row.text].filter((glyph) => !isWinAnsi(glyph)).join('') }))
    .filter((row) => row.surface);
  if (unrenderable.length) {
    findings.push(finding('R6', 'error', 'unrenderable-glyph', {}, unrenderable.sort(byRef),
      { kind: 'pool-edit', note: 'This character is outside the encoding the PDF fonts use.' }));
  }

  return report(rows, findings, typography, maxFindings);
};

/**
 * Lane B. Runs over the whole block pool and reports what only a human editing
 * prose can fix, which is why none of it reaches an agent. The pool's lead-verb
 * concentration is the root of the repetition every résumé inherits, and because
 * most entries carry a single bullet, no selection can undo it.
 *
 * `entries` are { entryId, sectionType, dateLabel, bullets: [{ ref, variant, text }] }.
 */
export const checkPool = (entries, { today = '2026-09' } = {}) => {
  const findings = [];
  const texts = entries.flatMap((entry) => entry.bullets.map((bullet) => ({
    ...bullet, sectionType: entry.sectionType, entryId: entry.entryId,
  })));
  const defaults = texts.filter((row) => row.variant === 'default');

  // P1 lead concentration per section type. The single most useful number the
  // checker produces: it names where a rewrite pass would actually move things.
  const bySectionType = new Map();
  for (const row of defaults) {
    if (isLabelLine(row.text)) continue;
    if (!bySectionType.has(row.sectionType)) bySectionType.set(row.sectionType, new Map());
    const tally = bySectionType.get(row.sectionType);
    const lemma = leadLemma(firstWord(row.text));
    tally.set(lemma, [...(tally.get(lemma) ?? []), { ref: row.ref, surface: leadSurface(row.text) }]);
  }
  for (const [sectionType, tally] of [...bySectionType].sort((a, b) => a[0].localeCompare(b[0]))) {
    const total = [...tally.values()].reduce((sum, refs) => sum + refs.length, 0);
    for (const [lemma, refs] of [...tally].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
      if (refs.length < POOL_LEAD_MIN) continue;
      findings.push(finding('P1', 'warn', 'pool-lead-concentration',
        { sectionType, openers: [...new Set(refs.map((item) => item.surface))].sort(), count: refs.length, of: total, share: round(refs.length / total) },
        refs.map((item) => ({ ref: item.ref, surface: item.surface })).sort(byRef),
        { kind: 'pool-edit', note: 'Diversify these opening verbs in the content pool. Every résumé selecting from this section inherits the repeat, and most entries carry a single bullet, so no selection can avoid it.' }));
    }
  }

  // P2 frame concentration across the pool, the same two frames as R3.
  const frames = new Map();
  for (const row of defaults) {
    for (const frame of framesIn(row.text)) {
      const key = frame.kind === 'opener' ? `opener:${frame.surface}` : 'trailing-participle';
      if (!frames.has(key)) frames.set(key, new Set());
      frames.get(key).add(row.ref);
    }
  }
  for (const [key, refs] of [...frames].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))) {
    if (refs.size < POOL_FRAME_MIN) continue;
    const [kind, opener] = key.split(':');
    findings.push(finding('P2', 'warn', 'pool-frame-concentration',
      { frame: kind, ...(opener ? { opener } : {}), count: refs.size, of: defaults.length },
      [...refs].sort().map((ref) => ({ ref })),
      { kind: 'pool-edit', note: 'One sentence shape repeated across the pool. Vary it where the fact allows.' }));
  }

  // P3 tense against the entry's own date label. Education is exempt: a degree
  // in progress still takes "Awarded" for a prize already received, so the rule
  // would be wrong there rather than merely noisy.
  for (const entry of entries) {
    if (entry.sectionType === 'education') continue;
    if (!isOngoing(entry.dateLabel, today)) continue;
    const past = entry.bullets.filter((bullet) => bullet.variant === 'default'
      && !isLabelLine(bullet.text)
      && /^[A-Z][a-z]+ed\b/.test(bullet.text.trim()));
    if (past.length) {
      findings.push(finding('P3', 'note', 'tense-vs-dates',
        { entryId: entry.entryId, dateLabel: String(entry.dateLabel ?? '') },
        past.map((bullet) => ({ ref: bullet.ref, surface: leadSurface(bullet.text) })).sort(byRef),
        { kind: 'pool-edit', note: 'An ongoing role reads in the present tense elsewhere in these résumés. Either reword, or record the exception deliberately.' }));
    }
  }

  // P4 variant hygiene: a deep variant that is not actually deeper, and the
  // coverage behind detail "deep", which silently falls back to the default on
  // every bullet with no deep key.
  const shallow = texts.filter((row) => row.variant === 'deep' && texts.some((other) => other.ref === row.ref
    && other.variant === 'default' && row.text.length <= other.text.length));
  if (shallow.length) {
    findings.push(finding('P4', 'note', 'variant-not-deeper', {},
      shallow.map((row) => ({ ref: row.ref })).sort(byRef),
      { kind: 'pool-edit', note: 'A deep variant no longer than its default earns nothing.' }));
  }
  const withDeep = new Set(texts.filter((row) => row.variant === 'deep').map((row) => row.ref));
  const missing = defaults.filter((row) => !withDeep.has(row.ref));
  if (missing.length) {
    findings.push(finding('P4', 'note', 'deep-coverage',
      { withDeep: withDeep.size, of: defaults.length },
      missing.map((row) => ({ ref: row.ref })).sort(byRef),
      { kind: 'pool-edit', note: 'Asking for detail "deep" falls back to the default on these, with no warning at build time.' }));
  }

  const rows = defaults.map((row) => annotate(row));
  return report(rows, findings, null, 40);
};
