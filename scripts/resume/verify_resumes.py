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

from pypdf import PdfReader

import harvard_style
import nus_style

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

    if failures:
        print(f"FAIL ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print(f"OK: {len(configs)} {args.style} resumes verified for edition {args.edition}")


if __name__ == "__main__":
    main()
