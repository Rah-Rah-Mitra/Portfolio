"""Build Harvard-style resume DOCX files from scripts/resume/content/*.json.

Usage:
    python scripts/resume/build_resumes.py --edition 2026-09 [--slug software-engineer] [--sample]

Outputs public/resume/generated/rahul-mitra-<slug>-<edition>.docx (one per
config in content/resumes/). --sample renders a placeholder template to
public/resume/template/harvard-template-2026.docx instead.

Ordering policy (deliberate, user-mandated): experience/education/leadership
sort strictly reverse-chronologically by `start`; projects sort by `sort`
(most recent activity) descending, `0000-00` pins an entry last.
"""
import argparse
import json
from pathlib import Path

from docx import Document

import harvard_style as hs

ROOT = Path(__file__).resolve().parents[2]
CONTENT = Path(__file__).resolve().parent / "content"
GENERATED = ROOT / "public" / "resume" / "generated"
TEMPLATE_OUT = ROOT / "public" / "resume" / "template" / "harvard-template-2026.docx"


def load(name):
    with open(CONTENT / name, encoding="utf-8") as f:
        return json.load(f)


def bullet_text(bullet, slug):
    text = bullet["text"]
    return text.get(slug, text["default"])


def build_resume(config, pools, profile, edition):
    slug = config["slug"]
    doc = Document()
    width = hs.setup_document(doc, body_pt=config.get("bodyPt", hs.BODY_PT), margin_in=config.get("marginIn"))

    hs.add_name(doc, profile["name"])
    hs.add_contact_line(doc, profile["contact"])

    for i, section in enumerate(config["sections"]):
        hs.add_section_header(doc, section["title"], first=(i == 0))
        if section["type"] == "skills":
            lines = {line["id"]: line for line in pools["skills"]["lines"]}
            for line_id in section["lines"]:
                line = lines[line_id]
                hs.add_skill_line(doc, line["label"], line["items"])
            continue

        pool = {e["id"]: e for e in pools[section["type"]]["entries"]}
        chosen = [
            {"entry": pool[sel["id"]], "bullets": sel.get("bullets", [])}
            for sel in section["entries"]
        ]
        if section["type"] == "projects":
            chosen.sort(key=lambda c: c["entry"]["sort"], reverse=True)
        else:
            chosen.sort(key=lambda c: c["entry"]["start"], reverse=True)

        for c in chosen:
            e = c["entry"]
            if "role" in e:
                hs.add_entry(doc, width, e["organization"], e.get("location", ""),
                             e["role"], e["dateLabel"])
            else:  # single-line entry (projects)
                hs.add_entry(doc, width, e["organization"], e["dateLabel"])
            bullets = {b["id"]: b for b in e.get("bullets", [])}
            for b_id in c["bullets"]:
                hs.add_bullet(doc, bullet_text(bullets[b_id], slug))

    props = doc.core_properties
    props.author = profile["name"].title()
    props.last_modified_by = props.author
    props.title = f"{profile['name'].title()} - {config['subject']}"
    props.subject = config["subject"]
    props.keywords = "rahul-mitra.com, " + config["subject"]
    return doc


def build_sample(edition):
    """Placeholder-text template kept in-repo as the visual reference."""
    doc = Document()
    width = hs.setup_document(doc)
    hs.add_name(doc, "FIRSTNAME LASTNAME")
    hs.add_contact_line(doc, [
        {"text": "City"},
        {"text": "email@example.com", "url": "mailto:email@example.com"},
        {"text": "linkedin.com/in/handle", "url": "https://www.linkedin.com/"},
    ])
    hs.add_section_header(doc, "EDUCATION", first=True)
    hs.add_entry(doc, width, "University Name", "City", "Degree Name", "Aug 20XX – May 20XX")
    hs.add_bullet(doc, "Honor, award, or thesis line with a quantified outcome.")
    hs.add_section_header(doc, "EXPERIENCE")
    hs.add_entry(doc, width, "Organisation (bold)", "City", "Role Title (italic)", "May 20XX – Aug 20XX")
    hs.add_bullet(doc, "Past-tense action verb + what you did + measurable result.")
    hs.add_bullet(doc, "Second bullet; 1–3 bullets per entry, quantify almost everything.")
    hs.add_section_header(doc, "LEADERSHIP AND ACTIVITIES")
    hs.add_entry(doc, width, "Organisation", "City", "Role", "Aug 20XX – Present")
    hs.add_bullet(doc, "Led a committee of N to deliver X, achieving Y.")
    hs.add_section_header(doc, "SKILLS AND INTERESTS")
    hs.add_skill_line(doc, "Technical", "Skill, Skill, Skill")
    hs.add_skill_line(doc, "Interests", "Interest, Interest")
    TEMPLATE_OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(TEMPLATE_OUT)
    print(f"wrote {TEMPLATE_OUT}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--edition", required=True)
    ap.add_argument("--slug")
    ap.add_argument("--sample", action="store_true")
    args = ap.parse_args()

    if args.sample:
        build_sample(args.edition)
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
        doc = build_resume(config, pools, profile, args.edition)
        out = GENERATED / f"rahul-mitra-{config['slug']}-{args.edition}.docx"
        doc.save(out)
        print(f"wrote {out.name}")


if __name__ == "__main__":
    main()
