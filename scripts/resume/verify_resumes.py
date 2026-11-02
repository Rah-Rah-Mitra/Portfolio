"""Verify a generated resume edition: file set, page counts, links, content.

Usage: python scripts/resume/verify_resumes.py --edition 2026-09 [--style nus]
Exits non-zero on any failure. The expected slug set is derived from
scripts/resume/content/resumes/*.json, so adding a resume config
automatically extends verification. --style must match the style the edition
was built in, since the font assertion is the one check that depends on it.
"""
import argparse
import re
import json
import sys
import zipfile
from pathlib import Path

from docx import Document
from pypdf import PdfReader

import harvard_style
import nus_style
from build_resumes import company, load

STYLES = {"nus": nus_style, "harvard": harvard_style}

ROOT = Path(__file__).resolve().parents[2]
CONTENT = Path(__file__).resolve().parent / "content"
GENERATED = ROOT / "public" / "resume" / "generated"

EXPECTED_URIS = [
    "tel:+6585155413",
    "mailto:mitrarahul2002@gmail.com",
    "https://www.linkedin.com/in/rahulmitra-dev",
    "https://github.com/Rah-Rah-Mitra",
    "https://rahul-mitra.com/",
]
REQUIRED_TEXT = ["RAHUL MITRA", "rahul-mitra.com", "STMicroelectronics", "put-away",
                 "Amazon", "super-resolution"]
FORBIDDEN_TEXT = ["PROFILE SUMMARY", "vercel.app", "�"]
# A heading whose date the right tab could not hold prints it against the text:
# "(NUS Capstone)Aug 2026 - Present". The JS fit model counts pages, not heading
# width, so ai-engineer and cyber-security landed on 9.5pt with STMicro's heading
# overrun on 2026-11-02. A date inside running text has a space or "(" before it.
GLUED_DATE = re.compile(r"[^\s(–-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}")

failures = []


def check(cond, message):
    if not cond:
        failures.append(message)


def flatten(value):
    """Collapse whitespace, including around hyphens and dots, for substring checks.

    Word's glyph positioning survives into pypdf's extraction as stray spaces:
    at the 0.5-0.6in margins this edition uses, "super-resolution" comes back as
    "super -resolution" on seven of the eight documents. The word is really on
    the page - it is the extractor that inserts the gap - so comparing flattened
    text keeps the assertion about content instead of about kerning. A line wrap
    inside "put-away" or "rahul-mitra.com" would do the same thing.
    """
    return re.sub(r"\s*([-.])\s*", r"\1", re.sub(r"\s+", " ", value))


def verify_grouping(config, docx):
    """No company's entries are split by another entry (the 2026-11-02 rule).

    Reads the order the DOCX actually prints, from its bold entry headings, so a
    builder that sorted correctly and wrote out of order still fails here.
    """
    slug = config["slug"]
    paragraphs = Document(docx).paragraphs
    heads = [i for i, p in enumerate(paragraphs) if p.runs and p.runs[0].bold]
    for section in config["sections"]:
        if section["type"] in ("summary", "skills", "projects"):
            continue
        pool = {e["id"]: e for e in load(f"{section['type']}.json")["entries"]}
        at = {}
        for sel in section["entries"]:
            org = pool[sel["id"]]["organization"]
            spot = next((i for i in heads if org in paragraphs[i].text and i not in at.values()), None)
            check(spot is not None, f"{slug}: no heading for {sel['id']}")
            if spot is not None:
                at[sel["id"]] = spot
        printed = [company(pool[i]) for i in sorted(at, key=at.get)]
        for name in set(printed):
            spots = [k for k, c in enumerate(printed) if c == name]
            check(spots == list(range(spots[0], spots[0] + len(spots))),
                  f"{slug}: {section['type']} splits {name}'s entries")


def verify_slug(slug, pages, edition, style):
    docx = GENERATED / f"rahul-mitra-{slug}-{edition}.docx"
    pdf = GENERATED / f"rahul-mitra-{slug}-{edition}.pdf"
    check(docx.exists(), f"{slug}: missing {docx.name}")
    check(pdf.exists(), f"{slug}: missing {pdf.name}")
    if not (docx.exists() and pdf.exists()):
        return

    with zipfile.ZipFile(docx) as z:
        rels = z.read("word/_rels/document.xml.rels").decode("utf-8")
        styles = z.read("word/styles.xml").decode("utf-8")
    for uri in EXPECTED_URIS:
        check(uri in rels, f"{slug}: docx missing hyperlink {uri}")
    check(style.FONT in styles, f"{slug}: docx styles missing {style.FONT}")
    check("Aptos" not in styles, f"{slug}: docx styles still reference Aptos")

    reader = PdfReader(pdf)
    check(len(reader.pages) == pages,
          f"{slug}: {len(reader.pages)} pages, expected {pages}")
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    for needle in REQUIRED_TEXT:
        check(flatten(needle) in flatten(text), f"{slug}: pdf text missing {needle!r}")
    # Not flattened: every forbidden string is a whole word or a domain, and
    # flattening could only ever hide one.
    for needle in FORBIDDEN_TEXT:
        check(needle not in text, f"{slug}: pdf text contains forbidden {needle!r}")
    for glued in GLUED_DATE.finditer(text):
        check(False, f"{slug}: a heading's date runs into its text at {text[max(0, glued.start() - 20):glued.end()]!r}")

    annots = set()
    for page in reader.pages:
        for annot in page.get("/Annots") or []:
            obj = annot.get_object()
            action = obj.get("/A")
            if action and action.get("/URI"):
                annots.add(str(action["/URI"]))
    for uri in EXPECTED_URIS:
        check(uri in annots, f"{slug}: pdf missing link annotation {uri}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--edition", required=True)
    ap.add_argument("--style", choices=sorted(STYLES), default="nus")
    args = ap.parse_args()
    style = STYLES[args.style]

    configs = sorted((CONTENT / "resumes").glob("*.json"))
    check(len(configs) > 0, "no resume configs found")
    for path in configs:
        with open(path, encoding="utf-8") as f:
            config = json.load(f)
        verify_slug(config["slug"], config["pages"], args.edition, style)
        docx = GENERATED / f"rahul-mitra-{config['slug']}-{args.edition}.docx"
        if docx.exists():
            verify_grouping(config, docx)

    if failures:
        print(f"FAIL ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print(f"OK: {len(configs)} {args.style} resumes verified for edition {args.edition}")


if __name__ == "__main__":
    main()
