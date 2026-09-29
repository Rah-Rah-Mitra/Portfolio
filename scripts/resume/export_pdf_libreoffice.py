"""Export a generated edition's DOCX files to PDF with LibreOffice (no Windows).

Usage: python scripts/resume/export_pdf_libreoffice.py --edition 2026-11 [--slug general]

Word (export-pdf.ps1) is the reference exporter. This is the Linux path, and it
is only faithful under two conditions, both enforced here:

1. Every font the DOCX names must be installed as itself: Arial for the nus
   style (Microsoft's core-fonts arial32.exe), Times New Roman for harvard.
   fontconfig otherwise substitutes Liberation Sans or Serif, which is what the
   PDF then embeds and which can move a line break.
2. LibreOffice draws the NUS section rule upside down. nus_style.py writes a
   w:pBdr bottom border of thinThickSmallGap, which Word draws as a 2.16pt bar
   above a 0.72pt hairline (server/resumeStyles.mjs draws it the same way), and
   LibreOffice 24.2 draws as the hairline above the bar. So each DOCX is
   converted from a temporary copy whose bottom borders carry the mirrored
   value (thickThinSmallGap), which LibreOffice draws bar-over-hairline in the
   same band. The DOCX that ships is never modified. harvard_style.py uses a
   single rule, which has no orientation, so a Harvard edition passes through
   unchanged.

Each PDF is written next to its DOCX in public/resume/generated/, as
export-pdf.ps1 does. Run verify_resumes.py afterwards.
"""
import argparse
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GENERATED = ROOT / "public" / "resume" / "generated"

# Word's reading of each two-line border, in LibreOffice's terms. Only these
# styles have an orientation; everything else is left as written.
MIRROR = {
    "thinThickSmallGap": "thickThinSmallGap",
    "thinThickMediumGap": "thickThinMediumGap",
    "thinThickLargeGap": "thickThinLargeGap",
    "thickThinSmallGap": "thinThickSmallGap",
    "thickThinMediumGap": "thinThickMediumGap",
    "thickThinLargeGap": "thinThickLargeGap",
}
PARAGRAPH_BORDERS = re.compile(r"<w:pBdr\b[^>]*>.*?</w:pBdr>", re.S)
BOTTOM_BORDER = re.compile(r'(<w:bottom\b[^>]*\bw:val=")([A-Za-z]+)(")')


FONT_NAME = re.compile(r'<w:rFonts\b[^>]*\bw:ascii="([^"]+)"')
STYLE_REF = re.compile(r'<w:(?:pStyle|rStyle)\b[^>]*\bw:val="([^"]+)"')


def fonts_in_use(docx: Path) -> set:
    """Fonts named by the runs, the document defaults, and the styles the text uses.

    The python-docx template also carries unused styles (Macro Text names
    Courier), which must not block an export.
    """
    with zipfile.ZipFile(docx) as src:
        document = src.read("word/document.xml").decode("utf-8")
        styles = src.read("word/styles.xml").decode("utf-8") if "word/styles.xml" in src.namelist() else ""
    used = set(STYLE_REF.findall(document)) | {"Normal"}
    names = set(FONT_NAME.findall(document))
    for block in re.findall(r"<w:docDefaults>.*?</w:docDefaults>", styles, re.S):
        names.update(FONT_NAME.findall(block))
    for block in re.findall(r"<w:style\b.*?</w:style>", styles, re.S):
        style_id = re.search(r'w:styleId="([^"]+)"', block)
        if style_id and style_id.group(1) in used:
            names.update(FONT_NAME.findall(block))
    return names


def require_real_fonts(docs):
    """Refuse to export unless every font the documents use resolves to itself."""
    names = set().union(*(fonts_in_use(doc) for doc in docs))
    for name in sorted(names):
        try:
            family = subprocess.run(["fc-match", "-f", "%{family}", name],
                                    capture_output=True, text=True, check=True).stdout
        except (OSError, subprocess.CalledProcessError):
            sys.exit("fc-match is unavailable, so the font check cannot run")
        if name not in [part.strip() for part in family.split(",")]:
            sys.exit(f"{name} resolves to {family!r}, not {name} itself. Install the real font "
                     "first (see the 'No Windows?' note in .agents/skills/resume-editing/SKILL.md).")


def mirrored_copy(docx: Path, dest: Path) -> int:
    """Copy docx to dest with each oriented paragraph bottom border mirrored; return the count."""
    changed = 0

    def flip(match):
        nonlocal changed
        value = match.group(2)
        if value not in MIRROR:
            return match.group(0)
        changed += 1
        return match.group(1) + MIRROR[value] + match.group(3)

    with zipfile.ZipFile(docx) as src, zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as out:
        for item in src.infolist():
            data = src.read(item)
            if item.filename == "word/document.xml":
                xml = data.decode("utf-8")
                xml = PARAGRAPH_BORDERS.sub(lambda block: BOTTOM_BORDER.sub(flip, block.group(0)), xml)
                data = xml.encode("utf-8")
            out.writestr(item, data)
    return changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--edition", required=True)
    ap.add_argument("--slug", action="append", help="export only this slug (repeatable)")
    args = ap.parse_args()

    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        sys.exit("soffice not found: install LibreOffice Writer (libreoffice-writer)")
    docs = sorted(GENERATED.glob(f"rahul-mitra-*-{args.edition}.docx"))
    if args.slug:
        wanted = {f"rahul-mitra-{slug}-{args.edition}.docx" for slug in args.slug}
        docs = [doc for doc in docs if doc.name in wanted]
        missing = wanted - {doc.name for doc in docs}
        if missing:
            sys.exit(f"no DOCX for {sorted(missing)} in {GENERATED}")
    if not docs:
        sys.exit(f"no DOCX for edition {args.edition} in {GENERATED}")
    require_real_fonts(docs)

    with tempfile.TemporaryDirectory(prefix="resume-pdf-") as tmp:
        tmp = Path(tmp)
        staged = tmp / "docx"
        staged.mkdir()
        flips = {doc.name: mirrored_copy(doc, staged / doc.name) for doc in docs}
        # An isolated profile: a desktop LibreOffice left open would otherwise
        # hold the user profile lock and the conversion would silently do nothing.
        profile = (tmp / "profile").as_uri()
        subprocess.run([soffice, f"-env:UserInstallation={profile}", "--headless",
                        "--convert-to", "pdf", "--outdir", str(tmp / "pdf"),
                        *[str(staged / doc.name) for doc in docs]],
                       check=True, capture_output=True, timeout=900)
        for doc in docs:
            pdf = tmp / "pdf" / (doc.stem + ".pdf")
            if not pdf.exists():
                sys.exit(f"LibreOffice produced no PDF for {doc.name}")
            shutil.move(str(pdf), GENERATED / pdf.name)
            print(f"libreoffice -> {pdf.name} ({flips[doc.name]} rules mirrored)")


if __name__ == "__main__":
    main()
