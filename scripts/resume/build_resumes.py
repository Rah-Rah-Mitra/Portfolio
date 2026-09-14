"""Build resume DOCX files from scripts/resume/content/*.json.

Usage:
    python scripts/resume/build_resumes.py --edition 2026-09 [--slug software-engineer] [--style nus|harvard] [--sample]

Outputs public/resume/generated/rahul-mitra-<slug>-<edition>.docx (one per
config in content/resumes/). --sample renders a placeholder template to
public/resume/template/<style>-template-2026.docx instead.

Two styles, both in this directory and both exposing the same nine names:
nus_style (the NUS CDE format, default since edition 2026-11) and
harvard_style. The eight canonical resumes ship in the default style; the
other one is an option, and the per-config bodyPt/marginIn are tuned for the
default, so --style harvard is a best-effort escape hatch rather than a second
shipped set. The on-demand renderer (server/resumeRender.mjs) auto-fits per
style, so it is correct in either.

Ordering policy (deliberate, user-mandated, revised 2026-09): experience,
education and leadership sort by END date first - entries still running come
first, ordered by `start` descending, then ended entries by `end` descending.
An entry is "still running" exactly when it carries no `end` key. Projects sort
by `sort` (most recent activity) descending, `0000-00` pins an entry last.

This replaced a strict `start` sort. Under that rule People's Association
(Sep 2025 - Sep 2026) fell below the Abbott internship (Jan 2026 - Jun 2026)
even though it finished nine months later, which reads as a gap.
"""
import argparse
import json
from pathlib import Path

from docx import Document

import harvard_style
import nus_style

STYLES = {"nus": nus_style, "harvard": harvard_style}
DEFAULT_STYLE = "nus"

ROOT = Path(__file__).resolve().parents[2]
CONTENT = Path(__file__).resolve().parent / "content"
GENERATED = ROOT / "public" / "resume" / "generated"
TEMPLATE_DIR = ROOT / "public" / "resume" / "template"


def load(name):
    with open(CONTENT / name, encoding="utf-8") as f:
        return json.load(f)


def entry_role(entry, selection):
    role = entry.get("role")
    if not isinstance(role, dict):
        return role
    key = selection.get("roleVariant", "default")
    if key not in role:
        raise SystemExit(f"unknown role option {key!r} on {entry['id']}")
    return role[key]



def entry_order(entry):
    """Sort key for a dated entry: running entries above ended ones.

    Returns (running, key) and is used with reverse=True, so running entries
    (1) sort above ended entries (0). `end` is an explicit key rather than
    something parsed out of `dateLabel`: dateLabel is display text, and an
    ordering that depends on parsing it breaks silently the first time someone
    writes "Present" a new way.
    """
    end = entry.get("end")
    return (0, end) if end else (1, entry["start"])


def bullet_text(bullet, slug):
    text = bullet["text"]
    return text.get(slug, text["default"])


def build_resume(config, pools, profile, edition, style):
    slug = config["slug"]
    body_pt = config.get("bodyPt", style.BODY_PT)
    doc = Document()
    width = style.setup_document(doc, body_pt=body_pt, margin_in=config.get("marginIn"))

    style.add_name(doc, profile["name"])
    style.add_contact_line(doc, profile["contact"])

    for i, section in enumerate(config["sections"]):
        style.add_section_header(doc, section["title"], first=(i == 0), body_pt=body_pt)
        if section["type"] == "skills":
            lines = {line["id"]: line for line in pools["skills"]["lines"]}
            for line_id in section["lines"]:
                line = lines[line_id]
                style.add_skill_line(doc, line["label"], line["items"])
            continue

        pool = {e["id"]: e for e in pools[section["type"]]["entries"]}
        for sel in section["entries"]:
            blocked = pool[sel["id"]].get("blocked")
            if blocked:
                raise SystemExit(f"{slug}: {sel['id']} is blocked from resumes - {blocked}")
        chosen = [
            {"entry": pool[sel["id"]], "bullets": sel.get("bullets", []),
             "role": entry_role(pool[sel["id"]], sel)}
            for sel in section["entries"]
        ]
        if section["type"] == "projects":
            chosen.sort(key=lambda c: c["entry"]["sort"], reverse=True)
        else:
            chosen.sort(key=lambda c: entry_order(c["entry"]), reverse=True)

        for position, c in enumerate(chosen):
            e = c["entry"]
            style.add_entry(doc, width, section["type"], e, c["role"],
                            first=(position == 0), body_pt=body_pt)
            bullets = {b["id"]: b for b in e.get("bullets", [])}
            for b_id in c["bullets"]:
                style.add_bullet(doc, bullet_text(bullets[b_id], slug), body_pt=body_pt)

    props = doc.core_properties
    props.author = profile["name"].title()
    props.last_modified_by = props.author
    props.title = f"{profile['name'].title()} - {config['subject']}"
    props.subject = config["subject"]
    props.keywords = "rahul-mitra.com, " + config["subject"]
    return doc


def build_sample(edition, style):
    """Placeholder-text template kept in-repo as the visual reference."""
    entry = lambda org, role, date: {"organization": org, "location": "City", "dateLabel": date, "role": role}
    doc = Document()
    width = style.setup_document(doc)
    style.add_name(doc, "FIRSTNAME LASTNAME")
    style.add_contact_line(doc, [
        {"text": "+00 0000 0000", "url": "tel:+0000000000"},
        {"text": "email@example.com", "url": "mailto:email@example.com"},
        {"text": "linkedin.com/in/handle", "url": "https://www.linkedin.com/"},
    ])
    style.add_section_header(doc, "EDUCATION", first=True)
    style.add_entry(doc, width, "education",
                    entry("University Name", "Degree Name", "Aug 20XX – May 20XX"), "Degree Name", first=True)
    style.add_bullet(doc, "Honor, award, or thesis line with a quantified outcome.")
    style.add_section_header(doc, "EXPERIENCE")
    style.add_entry(doc, width, "experience",
                    entry("Organisation", "Role Title", "May 20XX – Aug 20XX"), "Role Title", first=True)
    style.add_bullet(doc, "Past-tense action verb + what you did + measurable result.")
    style.add_bullet(doc, "Second bullet; 1–3 bullets per entry, quantify almost everything.")
    style.add_section_header(doc, "LEADERSHIP AND ACTIVITIES")
    style.add_entry(doc, width, "leadership",
                    entry("Organisation", "Role", "Aug 20XX – Present"), "Role", first=True)
    style.add_bullet(doc, "Led a committee of N to deliver X, achieving Y.")
    style.add_section_header(doc, "SKILLS AND CERTIFICATIONS")
    style.add_skill_line(doc, "Technical", "Skill, Skill, Skill")
    style.add_skill_line(doc, "Interests", "Interest, Interest")
    out = TEMPLATE_DIR / f"{style.STYLE}-template-2026.docx"
    out.parent.mkdir(parents=True, exist_ok=True)
    doc.save(out)
    print(f"wrote {out}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--edition", required=True)
    ap.add_argument("--slug")
    ap.add_argument("--style", choices=sorted(STYLES), default=DEFAULT_STYLE)
    ap.add_argument("--sample", action="store_true")
    args = ap.parse_args()
    style = STYLES[args.style]

    if args.sample:
        build_sample(args.edition, style)
        return

    profile = load("profile.json")
    pools = {
        "education": load("education.json"),
        "experience": load("experience.json"),
        "projects": load("projects.json"),
        "leadership": load("leadership.json"),
        "skills": load("skills.json"),
    }
    configs = sorted((CONTENT / "resumes").glob("*.json"))
    if args.slug:
        configs = [c for c in configs if c.stem == args.slug]
        if not configs:
            raise SystemExit(f"no config for slug {args.slug}")
    GENERATED.mkdir(parents=True, exist_ok=True)
    for path in configs:
        with open(path, encoding="utf-8") as f:
            config = json.load(f)
        doc = build_resume(config, pools, profile, args.edition, style)
        out = GENERATED / f"rahul-mitra-{config['slug']}-{args.edition}.docx"
        doc.save(out)
        print(f"wrote {out.name}")


if __name__ == "__main__":
    main()
