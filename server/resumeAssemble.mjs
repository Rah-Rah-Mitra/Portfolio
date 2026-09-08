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
// sort policy, bullet selection order, and one-line vs two-line entries, so the
// PDF, DOCX, Markdown and check outputs can never drift apart.

// text[variant] ?? text[slug] ?? text.default, mirroring build_resumes.py:33-35
// with the reserved depth keys layered on top.
export const resolveRole = (entry, selection) => {
  const role = entry.role;
  if (role == null || typeof role === 'string') return role ?? null;
  const key = selection?.roleVariant ?? 'default';
  if (!role[key]) throw new Error(`unknown role option "${key}" on ${entry.id}; choose one of ${Object.keys(role).join(', ')}`);
  return role[key];
};

export const resolveBulletText = (bullet, spec, entryVariant) => {
  const variant = entryVariant ?? spec.detail;
  const text = bullet.text;
  if (variant && variant !== 'standard' && text[variant]) return text[variant];
  return text[spec.slug] ?? text.default;
};

/**
 * Resolve a spec against the content pools into a flat, ordered item list.
 *
 * Items carry their block ids because ids are the only thing an agent may act
 * on: the checker reports findings against `ref` (entryId.bulletId), and matching
 * report text back to the pool would be ambiguous across the per-slug overrides
 * and depth variants. `sectionType` rides along because section titles are prose
 * that a spec chooses (the general CV calls its projects section "PROJECTS AND
 * COMPETITIONS"), so no rule may key on the title.
 */
export const assemble = (spec, pools) => {
  const skillLines = new Map(pools.skills.lines.map((line) => [line.id, line]));
  const items = [];
  for (const section of spec.sections) {
    items.push({ kind: 'section', title: section.title.toUpperCase(), sectionType: section.type });
    if (section.type === 'skills') {
      for (const id of section.lines) {
        const line = skillLines.get(id);
        if (!line) throw new Error(`unknown skills line: ${id}`);
        items.push({ kind: 'skill', lineId: line.id, label: line.label, items: line.items });
      }
      continue;
    }
    const pool = new Map(pools[section.type].entries.map((entry) => [entry.id, entry]));
    const key = section.type === 'projects' ? 'sort' : 'start';
    const chosen = section.entries.map((selection) => {
      const entry = pool.get(selection.id);
      if (!entry) throw new Error(`unknown ${section.type} entry: ${selection.id}`);
      if (entry.blocked) throw new Error(`${selection.id} is not available for résumés: ${entry.blocked}`);
      return { entry, bullets: selection.bullets ?? [], variant: selection.variant, role: resolveRole(entry, selection) };
    }).sort((a, b) => b.entry[key].localeCompare(a.entry[key]));

    for (const { entry, bullets, variant, role } of chosen) {
      items.push({
        kind: 'entry',
        entryId: entry.id,
        sectionType: section.type,
        organization: entry.organization,
        location: entry.location ?? '',
        role,
        dateLabel: entry.dateLabel,
      });
      const byId = new Map((entry.bullets ?? []).map((bullet) => [bullet.id, bullet]));
      for (const id of bullets) {
        const bullet = byId.get(id);
        if (!bullet) throw new Error(`unknown bullet ${id} on ${entry.id}`);
        items.push({
          kind: 'bullet',
          ref: `${entry.id}.${id}`,
          entryId: entry.id,
          bulletId: id,
          sectionType: section.type,
          variant: variant ?? spec.detail ?? 'standard',
          text: resolveBulletText(bullet, spec, variant),
        });
      }
    }
  }
  return items;
};
