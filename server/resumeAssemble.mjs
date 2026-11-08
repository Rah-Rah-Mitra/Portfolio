// resumeAssemble.mjs: the spec-to-items resolver, shared by the renderer, the
// checker and the builder window.
//
// This file imports NOTHING on purpose. server/resumeRender.mjs pulls in pdfkit
// (12 MB) and node:zlib, and components/workbench/ResumeBuilder.tsx loads résumé
// modules in the browser after mount, so anything that needs to resolve a spec
// without paying for a PDF engine has to reach these three functions directly.
// resumeRender.mjs re-exports them, so its own callers are unchanged.
//
// The assembly rules live here and only here (they were build_resumes.py:46-74):
// sort policy and company grouping, bullet selection order, and one-line vs
// two-line entries, so the PDF, DOCX, Markdown and check outputs can never drift
// apart.

/**
 * Sort key for a dated entry, ordering by END date first: entries still running
 * come above ended ones, running ordered by `start` descending and ended by
 * `end` descending. An entry is still running exactly when it has no `end`.
 *
 * The "1"/"0" prefix is what puts running entries on top under one descending
 * string compare, so this stays a single sort rather than a partition.
 * build_resumes.py:entry_order is the same rule for the Word pipeline; the two
 * have to agree or the canonical PDFs and every custom build disagree on order.
 */
const entryOrder = (entry) => (entry.end ? `0${entry.end}` : `1${entry.start}`);

/**
 * The employer an entry belongs to: its organization without trailing
 * parentheticals, so "Abbott Laboratories (Contract)" and "Abbott Laboratories
 * (Converted to Contract)" are one company. build_resumes.py:company is the same
 * rule.
 */
const company = (entry) => entry.organization.replace(/(\s*\([^()]*\))+\s*$/, '').trim().toLowerCase();

/**
 * Rahul's rule on top of the date sort (2026-11-02): entries of one company sit
 * together whatever their dates. Each company's entries are pulled up under its
 * first-sorted one, in date order, so the Abbott internship prints directly under
 * the contract it became, above People's Association, which ended later. It
 * replaced a per-selection `after` key that only general carried.
 * build_resumes.py:group_by_company is the same pass.
 */
const groupByCompany = (chosen) => {
  const groups = new Map();
  for (const item of chosen) {
    const key = company(item.entry);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()].flat();
};

/**
 * The dated-entry section types, in the order a résumé prints them. Each type is
 * also the name of its content pool (scripts/resume/content/<type>.json), which
 * is what keeps `pools[section.type]` the whole lookup. `summary` and `skills`
 * are the two section types without entries. build_resumes.py loads the same
 * pools; every list of section types in the repo reads this one.
 */
export const ENTRY_SECTION_TYPES = ['education', 'experience', 'research', 'projects', 'leadership', 'national-service'];

/**
 * The master CV's one-bullet project line, "Role, Organization (Date): text".
 * A date joins a trailing parenthetical the organisation already has, so
 * "(1,300+ applicants)" becomes "(1,300+ applicants, Sep 2026)" rather than two
 * brackets in a row. build_resumes.py:inline_label is the same rule.
 */
const inlineLabel = (entry, role) => {
  const head = role ? `${role}, ${entry.organization}` : entry.organization;
  return head.endsWith(')') ? `${head.slice(0, -1)}, ${entry.dateLabel})` : `${head} (${entry.dateLabel})`;
};

/** The text a bullet prints: its sentence, behind its inline label when it has one. */
export const bulletLine = (item) => (item.label ? `${item.label}: ${item.text}` : item.text);

/**
 * The four length tiers a bullet can be written at (portfolio-mcp-upgrades.md,
 * Nov 2026). `full` is the master CV's own sentence and what `general` prints;
 * `standard` (at most 2 lines) and `short` (1 line) are approved shorter wordings
 * for one-pagers; `deep` is the long form for two-page custom builds. Budgets are
 * lines at the reference layout (resumeRender.mjs REFERENCE_LAYOUT: nus, 10pt,
 * 0.5in); `full` and `deep` have none.
 */
export const TIERS = ['short', 'standard', 'full', 'deep'];
export const TIER_BUDGETS = { short: 1, standard: 2 };
/** What a spec gets when it names no tier: the role résumés' tier. */
export const DEFAULT_TIER = 'standard';
// A missing tier falls back towards `full`, never to a different length class:
// a short that does not exist is answered by the standard, then the full.
const TIER_CHAIN = { short: ['short', 'standard', 'full'], standard: ['standard', 'full'], full: ['full'], deep: ['deep', 'full'] };

/**
 * An entry's bullets strongest first: `rank` 1 is the strongest, and bullets
 * without a rank follow the ranked ones in pool order.
 */
export const byRank = (bullets) => bullets
  .map((bullet, index) => [bullet, index])
  .sort(([a, i], [b, j]) => ((a.rank ?? Infinity) - (b.rank ?? Infinity)) || i - j)
  .map(([bullet]) => bullet);

/**
 * A selection's bullets as `{id, tier?}`: plain ids, per-bullet tier objects
 * (`{"id": "platform", "tier": "short"}`), or `top: N`, the N best-ranked bullets
 * in rank order. An explicit list keeps the order it was written in.
 */
export const selectedBullets = (selection, entry) => {
  if (selection.top != null) {
    if (selection.bullets?.length) throw new Error(`${entry.id} selects both bullets and top; choose one`);
    return byRank(entry.bullets ?? []).slice(0, selection.top).map((bullet) => ({ id: bullet.id }));
  }
  return (selection.bullets ?? []).map((item) => (typeof item === 'string'
    ? { id: item }
    : { id: item.id, ...(item.tier ? { tier: item.tier } : {}) }));
};

/** The tier asked of one bullet: its own, else its entry's, else the spec's. */
export const requestedTier = (spec, entryVariant, bulletTier) => bulletTier ?? entryVariant ?? spec.detail ?? DEFAULT_TIER;

// text[tier] down the fallback chain, with text[slug] (the per-résumé overrides
// the Python builder reads) beating text.full at the full step, mirroring
// build_resumes.py bullet_text.
export const resolveRole = (entry, selection) => {
  const role = entry.role;
  if (role == null || typeof role === 'string') return role ?? null;
  const key = selection?.roleVariant ?? 'default';
  // Object.hasOwn, not a plain read: `roleVariant: "toString"` is a legal id
  // string, and inheriting Object.prototype printed "function toString() {
  // [native code] }" as the job title on a 200 PDF.
  if (!Object.hasOwn(role, key)) throw new Error(`unknown role option "${key}" on ${entry.id}; choose one of ${Object.keys(role).join(', ')}`);
  return role[key];
};

/**
 * Which of Rahul's sentences this bullet renders as.
 *
 * Three axes, resolved in this order:
 *   phrasing  a lateral alternative wording of the same fact, chosen per bullet
 *             through spec.phrasings. Wins outright: it is the most specific
 *             instruction the caller gave. A phrasing may carry its own
 *             `tiers: {short, standard}` texts, used when that tier is asked
 *             for, and may declare which tier its main text is (`tier`).
 *   length    the tier asked for (requestedTier), down TIER_CHAIN. A missing
 *             tier is a fallback the caller is told about: `tierUsed` differs
 *             from `tier`, and resumeRender.mjs tierFallbacks reports the ones
 *             that land over the asked tier's line budget.
 *   targeting text[slug], the per-résumé overrides, at the full step.
 *
 * An unknown phrasing id throws rather than falling back, because a phrasing is
 * the caller naming one specific sentence: quietly rendering a different one is
 * the failure mode this whole design exists to prevent.
 */
export const resolveBullet = (bullet, spec, tier, ref) => {
  const phrasingId = spec.phrasings?.[ref];
  if (phrasingId) {
    // Own-property again: "constructor" matches the phrasing-id pattern, and an
    // inherited hit made `chosen.text` undefined, rendering the literal word
    // "undefined" as a bullet instead of throwing.
    const chosen = Object.hasOwn(bullet.phrasings ?? {}, phrasingId) ? bullet.phrasings[phrasingId] : null;
    if (!chosen) {
      const available = Object.keys(bullet.phrasings ?? {});
      throw new Error(`unknown phrasing "${phrasingId}" on ${ref}; ${available.length
        ? `choose one of ${available.join(', ')}`
        : 'this bullet has only one wording'}`);
    }
    const own = TIER_BUDGETS[tier] ? chosen.tiers?.[tier] : undefined;
    return own ? { text: own, tierUsed: tier } : { text: chosen.text, tierUsed: chosen.tier ?? 'full' };
  }
  const text = bullet.text;
  for (const key of TIER_CHAIN[tier] ?? TIER_CHAIN.full) {
    if (key === 'full') return { text: text[spec.slug] ?? text.full, tierUsed: 'full' };
    if (text[key]) return { text: text[key], tierUsed: key };
  }
  return { text: text.full, tierUsed: 'full' };
};

/** The sentence alone, for callers that do not need to know which tier it is. */
export const resolveBulletText = (bullet, spec, entryVariant, ref, bulletTier) => (
  resolveBullet(bullet, spec, requestedTier(spec, entryVariant, bulletTier), ref).text
);

/**
 * Resolve a spec against the content pools into a flat, ordered item list.
 *
 * Items carry their block ids because ids are the only thing an agent may act
 * on: the checker reports findings against `ref` (entryId.bulletId), and matching
 * report text back to the pool would be ambiguous across the per-slug overrides
 * and depth variants. `sectionType` rides along because section titles are prose
 * that a spec chooses (a projects section may still say "PROJECTS AND
 * COMPETITIONS", a leadership one "LEADERSHIP AND ACTIVITIES"), so no rule may
 * key on the title.
 */
export const assemble = (spec, pools) => {
  const skillLines = new Map(pools.skills.lines.map((line) => [line.id, line]));
  const items = [];
  const used = new Set();
  for (const section of spec.sections) {
    items.push({ kind: 'section', title: section.title.toUpperCase(), sectionType: section.type });
    if (section.type === 'summary') {
      // Rahul's own paragraph from profile.json, never a caller's: a summary
      // section selects it and carries no text of its own.
      const summary = pools.profile?.summary;
      if (!summary) throw new Error('a summary section needs profile.summary in the pools');
      items.push({ kind: 'text', sectionType: 'summary', text: summary });
      continue;
    }
    if (section.type === 'skills') {
      for (const id of section.lines) {
        const line = skillLines.get(id);
        if (!line) throw new Error(`unknown skills line: ${id}`);
        items.push({ kind: 'skill', lineId: line.id, label: line.label, items: line.items });
      }
      continue;
    }
    const pool = new Map(pools[section.type].entries.map((entry) => [entry.id, entry]));
    const selected = section.entries.map((selection) => {
      const entry = pool.get(selection.id);
      if (!entry) throw new Error(`unknown ${section.type} entry: ${selection.id}`);
      if (entry.blocked) throw new Error(`${selection.id} is not available for résumés: ${entry.blocked}`);
      const role = resolveRole(entry, selection);
      // A degree carries its GPA unless the selection drops it for space.
      const shown = role && entry.gpa && selection.gpa !== false ? `${role} (GPA: ${entry.gpa})` : role;
      // `date: false` leaves the heading undated, for an entry whose dates are
      // already in its own bullet. No canonical résumé uses it since the
      // 2026-11-02 master CV dated A*STAR's heading.
      const dateLabel = selection.date === false ? '' : entry.dateLabel;
      return { entry, bullets: selectedBullets(selection, entry), variant: selection.variant, role: shown, dateLabel };
    });
    const chosen = section.type === 'projects'
      ? selected.sort((a, b) => b.entry.sort.localeCompare(a.entry.sort))
      : groupByCompany(selected.sort((a, b) => entryOrder(b.entry).localeCompare(entryOrder(a.entry))));
    const inline = section.render === 'cv-inline';

    for (const { entry, bullets, variant, role, dateLabel } of chosen) {
      if (inline && bullets.length !== 1) {
        throw new Error(`a cv-inline section prints each entry as one bullet; ${entry.id} selects ${bullets.length}`);
      }
      items.push({
        kind: 'entry',
        entryId: entry.id,
        sectionType: section.type,
        organization: entry.organization,
        location: entry.location ?? '',
        role,
        dateLabel,
        ...(inline ? { inline: true } : {}),
      });
      const byId = new Map((entry.bullets ?? []).map((bullet) => [bullet.id, bullet]));
      for (const { id, tier: bulletTier } of bullets) {
        const bullet = byId.get(id);
        if (!bullet) throw new Error(`unknown bullet ${id} on ${entry.id}`);
        const ref = `${entry.id}.${id}`;
        const phrasing = spec.phrasings?.[ref] ?? null;
        used.add(ref);
        const tier = requestedTier(spec, variant, bulletTier);
        const { text, tierUsed } = resolveBullet(bullet, spec, tier, ref);
        items.push({
          kind: 'bullet',
          ref,
          entryId: entry.id,
          bulletId: id,
          sectionType: section.type,
          // `variant` is the tier asked for (the name the checker's reports have
          // always used); `tierUsed` is the one that printed.
          variant: tier,
          tier,
          tierUsed,
          ...(bullet.rank != null ? { rank: bullet.rank } : {}),
          ...(bullet.requires ? { requires: bullet.requires } : {}),
          ...(phrasing ? { phrasing } : {}),
          ...(inline ? { label: inlineLabel(entry, role) } : {}),
          text,
        });
      }
    }
  }
  // A phrasing named for a bullet this spec never selects is a mistake worth
  // saying out loud: silently ignoring it leaves the caller believing they
  // changed a sentence that is not on the page.
  for (const ref of Object.keys(spec.phrasings ?? {})) {
    if (!used.has(ref)) throw new Error(`spec.phrasings names ${ref}, which this résumé does not select`);
  }
  return items;
};
