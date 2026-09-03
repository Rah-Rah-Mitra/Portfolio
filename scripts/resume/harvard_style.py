"""Harvard-resume style constants and low-level python-docx helpers.

This module IS the template: every visual decision for the generated
resumes lives here. Content lives in scripts/resume/content/*.json and
the assembly logic in build_resumes.py. Do not restyle generated files
by hand -- change these constants and rebuild.
"""
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Mm, Pt

FONT = "Times New Roman"  # Harvard convention; universally available. Do not change.
BODY_PT = 10.5
NAME_PT = 16
CONTACT_PT = 9.5  # must keep the 5-item contact line on ONE line at A4/0.7" margins

# A4 (Singapore standard). Letter would be Inches(8.5)/Inches(11).
PAGE_WIDTH = Mm(210)
PAGE_HEIGHT = Mm(297)
MARGIN_LR = Inches(0.7)
MARGIN_TOP = Inches(0.55)
MARGIN_BOTTOM = Inches(0.5)

BULLET = "• "
SEP = " · "  # contact-line separator
EN_DASH = "–"


def content_width(section):
    return section.page_width - section.left_margin - section.right_margin


def setup_document(doc, body_pt=BODY_PT, margin_in=None):
    """Page geometry + Normal style. Returns the usable content width.

    margin_in: optional per-resume side margin in inches (config `marginIn`,
    trim-ladder last step "margins toward 0.5\""). None keeps MARGIN_LR.
    """
    section = doc.sections[0]
    section.page_width = PAGE_WIDTH
    section.page_height = PAGE_HEIGHT
    section.left_margin = section.right_margin = Inches(margin_in) if margin_in is not None else MARGIN_LR
    section.top_margin = MARGIN_TOP
    section.bottom_margin = MARGIN_BOTTOM

    style = doc.styles["Normal"]
    style.font.name = FONT
    style.font.size = Pt(body_pt)
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.get_or_add_rFonts()
    for attr in ("ascii", "hAnsi", "eastAsia", "cs"):
        rfonts.set(qn(f"w:{attr}"), FONT)
    pf = style.paragraph_format
    pf.line_spacing = 1.0
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    return content_width(section)


def _para(doc, space_before=0, space_after=0):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    return p


def add_name(doc, name):
    p = _para(doc, space_after=2)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(name)
    run.bold = True
    run.font.size = Pt(NAME_PT)
    return p


def add_hyperlink(paragraph, url, text, size_pt=None):
    """Append a real w:hyperlink (black, no underline -- Harvard: no colour).

    Hyperlink runs are NOT in paragraph.runs, so the size must be set here.
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


def add_contact_line(doc, items):
    """items: [{text, url?}] joined by SEP; url items become hyperlinks."""
    p = _para(doc, space_after=4)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for i, item in enumerate(items):
        if i:
            run = p.add_run(SEP)
            run.font.size = Pt(CONTACT_PT)
        if item.get("url"):
            add_hyperlink(p, item["url"], item["text"], size_pt=CONTACT_PT)
        else:
            run = p.add_run(item["text"])
            run.font.size = Pt(CONTACT_PT)
    return p


def add_section_header(doc, title, first=False):
    p = _para(doc, space_before=3 if first else 6, space_after=2)
    p.paragraph_format.keep_with_next = True
    run = p.add_run(title.upper())
    run.bold = True
    # 1pt letterspacing
    rpr = run._r.get_or_add_rPr()
    spacing = OxmlElement("w:spacing")
    spacing.set(qn("w:val"), "20")
    rpr.append(spacing)
    # full-width bottom rule
    ppr = p._p.get_or_add_pPr()
    pbdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "000000")
    pbdr.append(bottom)
    ppr.append(pbdr)
    return p


def _right_tab(p, width):
    p.paragraph_format.tab_stops.add_tab_stop(width, WD_TAB_ALIGNMENT.RIGHT)


def add_entry(doc, width, org, right1, role=None, right2=None):
    """Two-line Harvard entry: bold org + right col; italic role + right col.

    With role=None a single line is emitted (projects: name + date).
    """
    p1 = _para(doc)
    p1.paragraph_format.keep_with_next = True
    _right_tab(p1, width)
    p1.add_run(org).bold = True
    if right1:
        p1.add_run("\t" + right1)
    if role is None:
        return p1
    p2 = _para(doc, space_after=1)
    p2.paragraph_format.keep_with_next = True
    _right_tab(p2, width)
    p2.add_run(role).italic = True
    if right2:
        p2.add_run("\t" + right2)
    return p2


def add_bullet(doc, text):
    p = _para(doc, space_after=1)
    pf = p.paragraph_format
    pf.left_indent = Inches(0.18)
    pf.first_line_indent = Inches(-0.18)
    p.add_run(BULLET + text)
    return p


def add_skill_line(doc, label, items):
    p = _para(doc, space_after=1)
    p.add_run(f"{label}: ").bold = True
    p.add_run(items)
    return p
