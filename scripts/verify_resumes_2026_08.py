from __future__ import annotations

import json
import zipfile
from pathlib import Path
from xml.etree import ElementTree

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "public" / "resume" / "generated"
EDITION = "2026-08"
EXPECTED_URIS = {
    "mailto:mitrarahul2002@gmail.com",
    "https://www.linkedin.com/in/rahulmitra-dev",
    "https://github.com/Rah-Rah-Mitra",
    "https://rahul-mitra.com/",
}


def docx_links(path: Path) -> set[str]:
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("word/_rels/document.xml.rels")
    root = ElementTree.fromstring(xml)
    return {
        relationship.attrib["Target"]
        for relationship in root
        if relationship.attrib.get("TargetMode") == "External"
        and relationship.attrib.get("Type", "").endswith("/hyperlink")
    }


def pdf_links(reader: PdfReader) -> set[str]:
    uris: set[str] = set()
    for page in reader.pages:
        for annotation_ref in page.get("/Annots", []):
            annotation = annotation_ref.get_object()
            action = annotation.get("/A")
            if action and action.get("/URI"):
                uris.add(str(action["/URI"]))
    return uris


def main() -> None:
    docx_files = sorted(GENERATED.glob(f"rahul-mitra-*-{EDITION}.docx"))
    pdf_files = sorted(GENERATED.glob(f"rahul-mitra-*-{EDITION}.pdf"))
    if len(docx_files) != 7 or len(pdf_files) != 7:
        raise RuntimeError(f"Expected 7 DOCX and 7 PDF files; found {len(docx_files)} and {len(pdf_files)}")

    report = []
    for docx_path in docx_files:
        pdf_path = docx_path.with_suffix(".pdf")
        reader = PdfReader(pdf_path)
        expected_pages = 2 if "-general-" in docx_path.name else 1
        extracted = "\n".join(page.extract_text() or "" for page in reader.pages)
        docx_uri_set = docx_links(docx_path)
        pdf_uri_set = pdf_links(reader)
        checks = {
            "page_count": len(reader.pages),
            "expected_page_count": expected_pages,
            "docx_contact_links": sorted(EXPECTED_URIS & docx_uri_set),
            "pdf_contact_links": sorted(EXPECTED_URIS & pdf_uri_set),
            "canonical_in_pdf_text": "rahul-mitra.com" in extracted,
            "legacy_domain_absent": ("rahul-mitra." + "vercel.app") not in extracted,
            "replacement_glyph_absent": "\ufffd" not in extracted,
        }
        if checks["page_count"] != expected_pages:
            raise RuntimeError(f"Unexpected page count for {pdf_path.name}: {checks['page_count']}")
        if set(checks["docx_contact_links"]) != EXPECTED_URIS:
            raise RuntimeError(f"Missing DOCX links in {docx_path.name}: {EXPECTED_URIS - docx_uri_set}")
        if set(checks["pdf_contact_links"]) != EXPECTED_URIS:
            raise RuntimeError(f"Missing PDF links in {pdf_path.name}: {EXPECTED_URIS - pdf_uri_set}")
        if not checks["canonical_in_pdf_text"] or not checks["legacy_domain_absent"] or not checks["replacement_glyph_absent"]:
            raise RuntimeError(f"Text validation failed for {pdf_path.name}")
        report.append({"slug": docx_path.stem, **checks})

    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
