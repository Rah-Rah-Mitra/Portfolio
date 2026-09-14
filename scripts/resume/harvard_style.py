"""Harvard-resume style constants and layout.

One of two styles (see nus_style.py, which is the default since edition
2026-11). Every visual decision for a Harvard-styled resume lives here.
Content lives in scripts/resume/content/*.json and the assembly logic in
build_resumes.py. Do not restyle generated files by hand -- change these
constants and rebuild.

Both style modules expose the same eight names, which is the whole contract
build_resumes.py knows about: FONT, BODY_PT, setup_document, add_name,
add_contact_line, add_section_header, add_entry, add_bullet, add_skill_line.
"""
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Mm, Pt

from docx_base import add_hyperlink, bottom_border, content_width, para, right_tab

STYLE = "harvard"
FONT = "Times New Roman"  # Harvard convention; universally available.
BODY_PT = 10.5
NAME_PT = 16
CONTACT_PT = 9.5  # must keep the 5-item contact line on ONE line at A4/0.7" margins
MIN_BODY_PT = 10  # the trim ladder never goes below this in this style

# A4 (Singapore standard). Letter would be Inches(8.5)/Inches(11).
PAGE_WIDTH = Mm(210)
PAGE_HEIGHT = Mm(297)
MARGIN_LR = Inches(0.7)
MARGIN_TOP = Inches(0.55)
MARGIN_BOTTOM = Inches(0.5)

BULLET = "• "
SEP = " · "  # contact-line separator
EN_DASH = "–"


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


def add_name(doc, name):
    p = para(doc, space_after=2)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(name)
    run.bold = True
    run.font.size = Pt(NAME_PT)
    return p


def add_contact_line(doc, items):
    """items: [{text, url?}] joined by SEP; url items become hyperlinks."""
    p = para(doc, space_after=4)
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


def add_section_header(doc, title, first=False, body_pt=BODY_PT):
    p = para(doc, space_before=3 if first else 6, space_after=2)
    p.paragraph_format.keep_with_next = True
    run = p.add_run(title.upper())
    run.bold = True
    # 1pt letterspacing
    rpr = run._r.get_or_add_rPr()
    spacing = OxmlElement("w:spacing")
    spacing.set(qn("w:val"), "20")
    rpr.append(spacing)
    bottom_border(p, "single", 6, space=1)
    return p


def add_entry(doc, width, section_type, entry, role, first=False):
    """Two-line Harvard entry: bold org + right col; italic role + right col.

    Projects render as a single line (name + date) whether or not they carry a
    role: the role reads as a label there, and the second line would cost the
    one-pagers a line per project. Which shape a section gets is the style's
    decision, not a function of whether `role` happens to be set -- that is why
    section_type is passed in.
    """
    org = entry["organization"]
    date = entry["dateLabel"]
    two_line = bool(role) and section_type != "projects"
    p1 = para(doc)
    p1.paragraph_format.keep_with_next = True
    right_tab(p1, width)
    p1.add_run(org).bold = True
    right1 = entry.get("location", "") if two_line else date
    if right1:
        p1.add_run("\t" + right1)
    if not two_line:
        return p1
    p2 = para(doc, space_after=1)
    p2.paragraph_format.keep_with_next = True
    right_tab(p2, width)
    p2.add_run(role).italic = True
    p2.add_run("\t" + date)
    return p2


def add_bullet(doc, text, body_pt=BODY_PT):
    p = para(doc, space_after=1)
    pf = p.paragraph_format
    pf.left_indent = Inches(0.18)
    pf.first_line_indent = Inches(-0.18)
    p.add_run(BULLET + text)
    return p


def add_skill_line(doc, label, items):
    p = para(doc, space_after=1)
    p.add_run(f"{label}: ").bold = True
    p.add_run(items)
    return p
