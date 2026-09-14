"""python-docx plumbing shared by every resume style.

Nothing here is a visual decision -- these are the four things python-docx
makes awkward (paragraph spacing, real hyperlinks, right tab stops, an empty
spacer paragraph) and both harvard_style.py and nus_style.py need all four.
Styling lives in those modules; this file exists only so the 30-line
OxmlElement dance for a w:hyperlink is written once.
"""
from docx.enum.text import WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt


def content_width(section):
    return section.page_width - section.left_margin - section.right_margin


def para(doc, space_before=0, space_after=0):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    return p


def blank(doc, size_pt):
    """An empty paragraph, i.e. one body-size line of vertical rhythm.

    Spacing would be the obvious way to do this, but the NUS template really
    does carry empty paragraphs and Word takes the MAX of adjacent space-after
    and space-before rather than summing them -- so a run of spacing values
    does not compose the way a blank line does.
    """
    p = para(doc)
    # A non-breaking space, not an empty run: an empty w:r carries no rPr for
    # the size to live on, so the paragraph would fall back to the Normal style
    # and a resume built at 9pt would space itself at 8.5. The source document
    # uses an NBSP here for the same reason.
    run = p.add_run(" ")
    run.font.size = Pt(size_pt)
    return p


def right_tab(p, width):
    p.paragraph_format.tab_stops.add_tab_stop(width, WD_TAB_ALIGNMENT.RIGHT)


def add_hyperlink(paragraph, url, text, size_pt=None, font=None, bold=False):
    """Append a real w:hyperlink (black, no underline -- resumes: no colour).

    Hyperlink runs are NOT in paragraph.runs, so size and font must be set here.
    """
    part = paragraph.part
    r_id = part.relate_to(
        url,
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
        is_external=True,
    )
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), r_id)
    run = OxmlElement("w:r")
    rpr = OxmlElement("w:rPr")
    if font:
        rfonts = OxmlElement("w:rFonts")
        for attr in ("ascii", "hAnsi", "eastAsia", "cs"):
            rfonts.set(qn(f"w:{attr}"), font)
        rpr.append(rfonts)
    if bold:
        rpr.append(OxmlElement("w:b"))
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "000000")
    rpr.append(color)
    if size_pt is not None:
        for tag in ("w:sz", "w:szCs"):
            sz = OxmlElement(tag)
            sz.set(qn("w:val"), str(int(size_pt * 2)))
            rpr.append(sz)
    run.append(rpr)
    t = OxmlElement("w:t")
    t.set(qn("xml:space"), "preserve")
    t.text = text
    run.append(t)
    hyperlink.append(run)
    paragraph._p.append(hyperlink)


def bottom_border(p, val, size, color="000000", space=0):
    """Full-width rule under a paragraph (w:pBdr/w:bottom)."""
    ppr = p._p.get_or_add_pPr()
    pbdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), val)
    bottom.set(qn("w:sz"), str(size))
    bottom.set(qn("w:space"), str(space))
    bottom.set(qn("w:color"), color)
    pbdr.append(bottom)
    ppr.append(pbdr)
