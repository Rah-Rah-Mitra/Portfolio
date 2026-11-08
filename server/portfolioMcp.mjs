// portfolioMcp.mjs: read-only portfolio data plus the résumé builder tools for
// api/mcp.mjs (MCP) and api/portfolio.mjs (JSON export). Imports ONLY JSON and
// packages: Vercel compiles api/ per file as native ESM (no bundling), so
// nothing here may import portfolioData.ts; regenerate
// server/portfolio-snapshot.json with `npm run snapshot` after data changes.
import { z } from 'zod';
import snapshot from './portfolio-snapshot.json' with { type: 'json' };
import { configBySlug, pools, profile, resumeBlocks, resumeConfigs } from './resumeContent.mjs';
import {
  ENTRY_SECTION_TYPES, TIERS, TIER_BUDGETS, assemble, bulletLine, decodeSpec, encodeSpec, measureBulletLines, referenceLines,
  renderResume, renderResumeMarkdown, requestedTier, resolveBullet, specSchema, tierFallbacks,
} from './resumeRender.mjs';
import { checkResume, firstWord, framesIn, leadLemma, metricClasses, metricsIn, termsIn } from './resumeCheck.mjs';
import { RESUME_GUIDE } from './resumeGuide.mjs';

export { resumeConfigs };

const abs = (path) => new URL(path, snapshot.site.canonicalUrl).href;

/** Markdown for one canonical résumé config. */
export const resumeMarkdown = (config) => renderResumeMarkdown(config, pools, profile);

export const listResumes = () => snapshot.resumes.map((resume) => ({
  slug: resume.id,
  role: resume.role,
  headline: resume.headline,
  keywords: resume.keywords,
  pages: configBySlug(resume.id)?.pages ?? null,
  pdfUrl: abs(resume.pdfUrl),
  docxUrl: abs(resume.docxUrl),
}));

export const getProfile = () => ({
  name: snapshot.site.name,
  ...snapshot.profile,
  location: snapshot.site.location,
  email: snapshot.site.email,
  site: snapshot.site.canonicalUrl,
  links: snapshot.site.social,
  resumeEdition: snapshot.site.resumeEdition,
});

// 3-line port of lib/workbench.ts filterArchiveRows (that one lives in the React graph).
export const filterProjects = (query = '', domain = 'All') => {
  const q = query.trim().toLowerCase();
  return snapshot.archive.filter((row) => (domain === 'All' || row.domain === domain)
    && (!q || `${row.title} ${row.category} ${row.stack} ${row.domain}`.toLowerCase().includes(q)));
};

/**
 * The unselected bullets sitting on entries a spec already uses. Swapping one in
 * is the only remedy an agent may apply, so the checker needs this list to tell
 * an actionable finding from one it can only report.
 */
export const swapCandidates = (spec, chosen) => {
  const taken = new Set(chosen);
  const candidates = [];
  for (const section of spec.sections) {
    if (!section.entries) continue; // skills and summary select no entries
    for (const selection of section.entries) {
      const entry = pools[section.type].entries.find((item) => item.id === selection.id);
      for (const bullet of entry?.bullets ?? []) {
        const ref = `${entry.id}.${bullet.id}`;
        // At the tier this entry asks for, so a swap is judged on the sentence it
        // would actually print.
        const { text } = resolveBullet(bullet, { slug: spec.slug }, requestedTier(spec, selection.variant), ref);
        if (!taken.has(ref)) candidates.push({ ref, entryId: entry.id, sectionType: section.type, text });
      }
    }
  }
  return candidates;
};

/**
 * Lane A of the checker, measured at the typography the résumé actually ships
 * at: linting a 10.5pt config as though it were 10pt would report the wrong line
 * counts. `fit` comes from the render when there is one, so build_resume pays for
 * a single pass rather than two.
 */
/**
 * The alternative wordings available for the bullets on this page, with the three
 * facts the rules are about derived at the résumé's own typography. A wording
 * already selected is not offered back.
 */
const rephrasingsFor = (spec, bullets, typography) => {
  const options = [];
  for (const bullet of bullets) {
    const [entryId, bulletId] = [bullet.entryId, bullet.bulletId];
    const source = pools[bullet.sectionType]?.entries.find((entry) => entry.id === entryId)
      ?.bullets?.find((item) => item.id === bulletId);
    for (const [id, phrasing] of Object.entries(source?.phrasings ?? {})) {
      if (bullet.phrasing === id) continue;
      options.push({ ref: bullet.ref, id, text: phrasing.text });
    }
  }
  const lines = measureBulletLines(options.map((option) => option.text), typography);
  const byRef = {};
  options.forEach((option, index) => {
    const found = metricsIn(option.text);
    byRef[option.ref] = [...(byRef[option.ref] ?? []), {
      id: option.id,
      text: option.text,
      lead: firstWord(option.text).replace(/[^A-Za-z-]+$/, ''),
      lemma: leadLemma(firstWord(option.text)),
      frames: framesIn(option.text).map((frame) => (frame.kind === 'opener' ? `opener:${frame.surface}` : 'trailing-participle')),
      lines: lines[index],
      hasMetric: found.metrics.length > 0,
    }];
  });
  return byRef;
};

// Group labels printed inside an items string, "AI tools (Claude Code, ChatGPT,
// ...)". Once the parentheses split, the label stands alone like a technology,
// but it names a category and is printed on four of the six role résumés and
// not on ai-engineer's, which lists the same tools bare. As a term it moved
// AI-engineer postings to solution-architect, and told the ai-engineer build it
// was missing "AI tools".
const GROUP_LABELS = new Set(['AI tools']);

/**
 * Rahul's own attested technologies, taken from the skills lines rather than a
 * dictionary: the checker imports nothing, so the vocabulary is passed in, and
 * this keeps it to terms he has already claimed somewhere.
 *
 * Exported because jobSearch.mjs matches postings against it too: it is the
 * larger half of the alphabet a posting may choose from (the other half is the
 * 47 unique keyword entries on snapshot.resumes[], which alone were too few to
 * match a posting with).
 */
export const skillTerms = (() => {
  const terms = new Set();
  for (const line of pools.skills.lines) {
    // Parentheses are separators, not wrappers. Splitting on [,;] first tore
    // every comma-bearing parenthetical into unbalanced fragments -- "deep RL
    // (PPO", "DQN)", "Route 53)", "Flask)" -- which could never match anything
    // and were dead weight in every alphabet built from this list.
    for (const chunk of line.items.replace(/[()]/g, ',').split(/[,;]/)) {
      const cleaned = chunk.trim();
      for (const part of cleaned.split(/\s*\/\s*|\s+&\s+/)) {
        const term = part.trim();
        if (term.length > 2 && !GROUP_LABELS.has(term)) terms.add(term);
      }
    }
  }
  return [...terms].sort((a, b) => b.length - a.length);
})();

export const checkSpec = (spec, fit = null) => {
  const typography = { bodyPt: fit?.bodyPt ?? undefined, marginIn: fit?.marginIn ?? undefined };
  const bullets = assemble(spec, pools).filter((item) => item.kind === 'bullet');
  // Without a fit there is no typography to measure at, and a count taken at the
  // 10.5pt/0.7in default is not the one a fitted one-pager ships. Withhold the
  // measurement rather than publishing a provisional one: R5 line-budget keys on
  // a supplied count, so it correctly stays silent, and metrics.maxBulletLines
  // falls out null beside metrics.typography null. An agent trimming against a
  // number measured at the wrong size ships a thinner resume than it had room for.
  // Measured as printed: a cv-inline bullet carries its entry's label on its
  // first line, and leaving it out would undercount every project by a line.
  const lines = fit ? measureBulletLines(bullets.map(bulletLine), typography) : [];
  // Each sentence at the reference layout too, whatever this build fitted at:
  // a tier's budget is defined there (R9), so it needs no fit to be judged.
  const atReference = referenceLines(bullets.map((bullet) => bullet.text));
  return checkResume(bullets.map((bullet, index) => ({ ...bullet, referenceLines: atReference[index], ...(fit ? { lines: lines[index] } : {}) })), {
    tierBudgets: TIER_BUDGETS,
    candidates: swapCandidates(spec, bullets.map((bullet) => bullet.ref)),
    rephrasings: rephrasingsFor(spec, bullets, typography),
    skillTerms,
    // The four-bullet ceiling is what a single page can carry, not a house rule
    // about entries. A two-page spec has the room, and the master CV uses it.
    maxBullets: spec.pages >= 2 ? 8 : 4,
    typography: fit ? { bodyPt: fit.bodyPt, marginIn: fit.marginIn } : null,
  });
};

/**
 * The findings a build reports. Errors and warnings always; a note only where the
 * caller asked for that rule by name. build_resume asks for none — a note is the
 * softest thing the checker says and a build report is already long — but
 * build_tailored_resume asks for R7, which is the one rule that compares the
 * evidence on the page against evidence sitting unused on the same entries, and
 * that is exactly the question a posting puts.
 */
export const reportedFindings = (full, keepNotes = []) => ({
  ...full,
  findings: full.findings.filter((item) => item.severity !== 'note' || keepNotes.includes(item.rule)),
});

/**
 * Render a spec and return links, the fit report and the check report. The check
 * rides along unasked: the failure this exists to prevent is an agent building,
 * getting a URL and handing it over, and a check you have to remember to call is
 * one a hurried agent skips. Only errors and warnings travel here unless the
 * caller names a note rule; check_resume returns the notes too.
 */
export const buildResume = async (spec, { keepNotes = [] } = {}) => {
  const result = await renderResume(spec, pools, profile);
  // The spec as built: auto-fit may have given bullets a shorter tier
  // (fitStrategy short-first), and every output below has to describe the
  // document the PDF is, links included.
  const built = result.spec ?? spec;
  const encoded = encodeSpec(built);
  const full = checkSpec(built, result.fit);
  return {
    pages: result.pages,
    fit: result.fit,
    check: reportedFindings(full, keepNotes),
    tierFallbacks: tierFallbacks(assemble(built, pools)),
    // The spec as built, per-bullet tiers included: building it again gives
    // this document exactly.
    spec: built,
    pdfUrl: abs(`/api/resume?spec=${encoded}`),
    docxUrl: abs(`/api/resume?format=docx&spec=${encoded}`),
    markdown: result.markdown,
  };
};

export const portfolioExport = () => ({
  mcp: abs('/api/mcp'),
  profile: getProfile(),
  experience: snapshot.experience,
  projects: snapshot.projects,
  resumes: listResumes().map((resume) => ({ ...resume, markdown: resumeMarkdown(configBySlug(resume.slug)) })),
});

/** What a block id renders as by default — the sentence the menu is measured on. */
const defaultText = (bullet) => bullet.variants.full ?? Object.values(bullet.variants)[0] ?? '';

/**
 * Which of the eight canonical résumés select each bullet and each skills line.
 *
 * A pure function of the configs already imported, and the cheapest role signal
 * on the menu: a bullet four of the six role résumés carry says little about a
 * posting, and one only the cyber-security résumé carries says a great deal.
 *
 * An empty list is a fact, not a gap. Four selectable bullets sit on no canonical
 * résumé at all, which is why every bullet carries the key even when it is empty:
 * absent-vs-empty is the difference between "nothing selects this" and "the menu
 * forgot to say", and only one of those is true.
 */
// Which canonical résumés select each block, resolved through assemble() rather
// than by walking the spec shape again here. resumeAssemble.mjs says the
// assembly rules "live here and only here", and the shape has already grown
// selectors twice (variant, roleVariant): a private copy of the walk would keep
// rendering correctly while quietly reporting the wrong résumés.
const selectedBy = () => {
  const used = new Map();
  for (const config of resumeConfigs) {
    for (const item of assemble(config, pools)) {
      const id = item.kind === 'bullet' ? item.ref : item.kind === 'skill' ? item.lineId : null;
      if (id) used.set(id, [...(used.get(id) ?? []), config.slug]);
    }
  }
  return used;
};

/**
 * resumeBlocks() plus the derived fields that let an agent choose well instead of
 * being told afterwards that it chose badly: the opening verb, the rendered line
 * cost, whether the bullet carries a measurement, which of Rahul's attested
 * technologies it names, and which canonical résumés select it. A repetition
 * finding is a complaint about a decision the menu gave no way to make, so the
 * menu now carries the facts the rules are about.
 *
 * `terms` is the same computation R7 scores a bullet on — termsIn() against the
 * skills-line vocabulary — so choosing by keyword and being judged by keyword use
 * one measure rather than two. Lowercased, as the checker reports them.
 *
 * Derived here rather than in resumeContent.mjs because line measurement needs
 * pdfkit, and the builder window imports that module in the browser.
 */
export const decoratedBlocks = ({ tier } = {}) => {
  const blocks = resumeBlocks();
  const used = selectedBy();
  const pool = new Map();
  for (const type of ENTRY_SECTION_TYPES) {
    for (const entry of pools[type].entries) {
      for (const bullet of entry.bullets ?? []) pool.set(`${entry.id}.${bullet.id}`, bullet);
    }
  }
  // One traversal carrying the ref with the bullet: a second parallel walk for
  // the ids would be a second thing to keep in the same order.
  const items = blocks.sections.flatMap((section) => section.entries
    .flatMap((entry) => entry.bullets.map((bullet) => ({ bullet, ref: `${entry.id}.${bullet.id}` }))));
  // With a tier, each bullet is the one sentence that tier prints (falling back
  // as a build would), which is all an agent tailoring at that length needs;
  // without one, every stored tier and its line cost.
  const resolved = items.map(({ bullet, ref }) => (tier
    ? resolveBullet(pool.get(ref), {}, tier, ref)
    : { text: defaultText(bullet), tierUsed: 'full' }));
  const texts = resolved.map((row) => row.text);
  const lines = referenceLines(texts);
  const tierKeys = items.map(({ bullet }) => TIERS.filter((key) => bullet.variants[key]));
  const tierTexts = tierKeys.flatMap((keys, index) => keys.map((key) => items[index].bullet.variants[key]));
  const tierCounts = referenceLines(tierTexts);
  let cursor = 0;
  items.forEach(({ bullet, ref }, index) => {
    bullet.lead = firstWord(texts[index]).replace(/[^A-Za-z-]+$/, '');
    bullet.lines = lines[index];
    // Outcome (a result against a baseline or target) and scale (a size or a
    // count) apart; hasMetric stays as either, for callers that read it.
    bullet.metric = metricClasses(texts[index]);
    bullet.hasMetric = bullet.metric.outcome || bullet.metric.scale;
    bullet.terms = termsIn(texts[index], skillTerms);
    bullet.usedBy = used.get(ref) ?? [];
    const counts = Object.fromEntries(tierKeys[index].map((key) => [key, tierCounts[cursor++]]));
    if (tier) {
      bullet.text = texts[index];
      bullet.tier = resolved[index].tierUsed;
      delete bullet.variants;
    } else {
      bullet.tierLines = counts;
    }
  });
  for (const line of blocks.skillLines) line.usedBy = used.get(line.id) ?? [];
  // Alternative wordings, with the same derived fields, so an agent can see that
  // a bullet opening "Built" also has one opening "Turned" before it picks.
  for (const section of blocks.sections) {
    for (const entry of section.entries) {
      for (const bullet of entry.bullets) {
        const source = pool.get(`${entry.id}.${bullet.id}`);
        const phrasings = Object.entries(source?.phrasings ?? {});
        if (!phrasings.length) continue;
        const measured = referenceLines(phrasings.map(([, item]) => item.text));
        bullet.phrasings = Object.fromEntries(phrasings.map(([id, item], index) => [id, {
          text: item.text,
          note: item.note,
          lead: firstWord(item.text).replace(/[^A-Za-z-]+$/, ''),
          lines: measured[index],
          metric: metricClasses(item.text),
          hasMetric: metricsIn(item.text).metrics.length > 0,
          // An alternative wording carries its own sentence, so it names its own
          // technologies: a wording can be the one that says "Terraform" out loud
          // where the default says "infrastructure as code".
          terms: termsIn(item.text, skillTerms),
        }]));
      }
    }
  }
  return blocks;
};

/**
 * The inverse of a block's `terms`: which selectable ids carry each term.
 *
 * A coverage report that names a term Rahul has and this document lacks is only
 * half an answer, because the one move an agent may make is selecting an id. This
 * is the other half. Built from resumeBlocks(), so a `blocked` entry is never
 * named — the withholding has to survive being asked the question backwards.
 *
 * Vocabulary is passed in for the same reason the checker's is: the caller knows
 * which alphabet it is reporting against. Bullets are indexed on the sentence
 * selecting the id actually renders, not on every variant, so a named block is
 * one that carries the term when you select it.
 *
 * Memoised on the array identity: the two call sites each pass a module constant.
 */
const termIndexes = new Map();
export const blocksByTerm = (terms = skillTerms) => {
  if (!termIndexes.has(terms)) {
    const index = new Map();
    const blocks = resumeBlocks();
    const sources = [
      ...blocks.sections.flatMap((section) => section.entries
        .flatMap((entry) => entry.bullets.map((bullet) => [`${entry.id}.${bullet.id}`, defaultText(bullet)]))),
      ...blocks.skillLines.map((line) => [line.id, `${line.label} ${line.items}`]),
    ];
    for (const [id, text] of sources) {
      for (const term of termsIn(text, terms)) index.set(term, [...(index.get(term) ?? []), id]);
    }
    termIndexes.set(terms, index);
  }
  return termIndexes.get(terms);
};

// Compact, not pretty-printed. Every one of these payloads is read by a model
// through an MCP tool result, and the indentation was 12,197 bytes of it across
// list_resume_blocks, list_resumes and get_profile alone. Use the MCP inspector
// with a formatter when eyeballing one by hand.
const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });

export const registerPortfolioTools = (server) => {
  server.registerTool('get_profile', {
    title: 'Profile',
    description: 'Who Rahul Mitra is: bio, the master CV\'s summary paragraph (`summary`, CV-only: no role résumé prints it), the expected start date every résumé prints (`availability`), location, links, headline stats, competency clusters, skills, and the current résumé edition.',
    inputSchema: z.object({}),
  }, async () => text(getProfile()));

  server.registerTool('list_experience', {
    title: 'Experience',
    description: 'Full professional and education record, newest first, with scope, responsibilities, outcomes, and linked project ids.',
    inputSchema: z.object({}),
  }, async () => text(snapshot.experience));

  server.registerTool('list_projects', {
    title: 'Projects',
    description: `All ${snapshot.projects.length} indexed projects as compact rows. Optional text query and domain filter (${snapshot.domains.join(', ')}). Use get_project for the full record.`,
    inputSchema: z.object({ query: z.string().optional(), domain: z.enum(snapshot.domains).optional() }),
  }, async ({ query, domain }) => text(filterProjects(query, domain)));

  server.registerTool('get_project', {
    title: 'Project detail',
    description: 'Full record for one project id from list_projects, including the spotlight narrative, tags, and links.',
    inputSchema: z.object({ id: z.string() }),
  }, async ({ id }) => {
    const project = snapshot.projects.find((candidate) => candidate.id === id);
    return project ? text(project) : { ...text(`Unknown project id: ${id}`), isError: true };
  });

  server.registerTool('list_resumes', {
    title: 'Résumés',
    description: 'The ready-made résumé variants (role-targeted one-pagers, the one-page "highlights" best-of, the two-page "general" master CV) with absolute PDF/DOCX URLs and page counts.',
    inputSchema: z.object({}),
  }, async () => text(listResumes()));

  server.registerTool('get_resume', {
    title: 'Résumé content',
    description: 'One ready-made résumé as Markdown, plus its PDF/DOCX URLs and its build spec. Use the spec as the starting point for a tailored build.',
    inputSchema: z.object({ slug: z.enum(resumeConfigs.map((config) => config.slug)) }),
  }, async ({ slug }) => {
    const resume = listResumes().find((candidate) => candidate.slug === slug);
    const config = configBySlug(slug);
    return text({ ...resume, markdown: resumeMarkdown(config), spec: config });
  });

  // ── résumé builder ──────────────────────────────────────────────────────
  server.registerTool('get_resume_guide', {
    title: 'How to build a résumé',
    description: 'Read this before build_resume. The two layout styles, the spec schema, the ordering policy, how auto-fit works, and the rule that you may only select from list_resume_blocks and must never write your own bullet text.',
    inputSchema: z.object({}),
  }, async () => text(RESUME_GUIDE));

  server.registerTool('list_resume_blocks', {
    title: 'Résumé building blocks',
    description: 'Every entry, bullet and skills line you may select, plus the ready-made résumés you can start from. These ids are the only content build_resume accepts. Each bullet carries its length tiers (`variants`: short = 1 line, standard ≤ 2 lines, full = the master CV sentence, deep = the long form; only some bullets have each) with `tierLines` (lines per tier at the reference layout, nus 10pt), its opening verb, line cost, whether it holds a measurement (`metric: {outcome, scale}`, with `hasMetric` = either), `rank` (1 = strongest on its entry), `requires` (bullets it reads best beside), `terms` (the technologies from Rahul\'s own skills lines that this wording names, lowercased) and `usedBy` (the canonical résumés that select it; empty is a fact, not a missing field). Pass `tier` to get the one sentence each bullet prints at that tier instead of every variant — the smallest menu for tailoring at one length. Alternative wordings carry their own verb, line cost, measurement and terms. Optionally filter to one section type.',
    inputSchema: z.object({
      section: z.enum([...ENTRY_SECTION_TYPES, 'skills']).optional(),
      tier: z.enum(TIERS).optional(),
    }),
  }, async ({ section, tier }) => {
    const blocks = decoratedBlocks({ tier });
    if (!section) return text(blocks);
    if (section === 'skills') return text({ skillLines: blocks.skillLines });
    return text({ sections: blocks.sections.filter((item) => item.type === section) });
  });

  server.registerTool('build_resume', {
    title: 'Build a résumé',
    description: 'Render a résumé from selected block ids and return PDF, DOCX and Markdown. It comes out in the NUS CDE style Rahul’s own CV uses unless you set style:"harvard". Content comes only from list_resume_blocks; bullet text cannot be supplied. Auto-fit adjusts typography within sanctioned limits and never drops what you chose; if it still overflows you get an overflow report to act on. The response also carries a check report naming repeated opening verbs, repeated sentence frames and over-long bullets, with the block ids to swap where a swap exists.',
    inputSchema: z.object({ spec: specSchema }),
  }, async ({ spec }) => {
    try {
      const built = await buildResume(spec);
      return text(built);
    } catch (error) {
      return { ...text(error instanceof Error ? error.message : 'Could not build résumé'), isError: true };
    }
  });

  server.registerTool('check_resume', {
    title: 'Check a résumé',
    description: 'Check a ready-made slug, or a résumé you built, for repeated opening verbs, a repeated sentence frame, hedging words, thin quantification and over-long bullets. Every finding names block ids, and where the menu holds a fix it names the swap rather than asking you to cut good material. Deterministic: the same selection always returns the same report. It reports counts, never a score, and it never rewrites text. Pass a slug, or the spec value out of a build_resume URL as encodedSpec.',
    inputSchema: z.object({
      slug: z.enum(resumeConfigs.map((config) => config.slug)).optional(),
      encodedSpec: z.string().max(8000).optional(),
    }),
  }, async ({ slug, encodedSpec }) => {
    if ((slug ? 1 : 0) + (encodedSpec ? 1 : 0) !== 1) {
      return { ...text('Pass exactly one of slug or encodedSpec.'), isError: true };
    }
    try {
      const requested = slug ? configBySlug(slug) : specSchema.parse(decodeSpec(encodedSpec));
      const { fit, spec: built } = await renderResume(requested, pools, profile);
      const spec = built ?? requested;
      return text({ ...checkSpec(spec, fit), tierFallbacks: tierFallbacks(assemble(spec, pools)) });
    } catch (error) {
      return { ...text(error instanceof Error ? error.message : 'Could not check that résumé'), isError: true };
    }
  });
};
