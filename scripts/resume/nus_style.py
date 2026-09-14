"""NUS CDE resume style -- the default since edition 2026-11.

This is the format the NUS Centre for Future-ready Graduates hands out
(public/resume/template/NUS Resume - Y3-Y4.docx, alongside NUS Guidelines.pdf),
as realised in Rahul's master CV. Arial, a right-aligned name, ruled caps
section headers and one-line entries, with a blank body-size line as the only
vertical rhythm.

Every number here was measured out of rahul-mitra-master-cv.docx rather than
chosen: 8.5pt body (w:sz 17), 9.5pt headers, 19.5pt name, 0.5" sides and
0.667" top/bottom, a thinThickSmallGap rule at w:sz 18, bullets indented to
780 twips. Page size is the one deliberate change -- A4, because the repo
ships to Singapore and the rest of the pipeline is A4 already.

Two more deliberate departures from the source document:
  - literal "• " bullets instead of a Word numbering list, because the repo's
    ATS-safety rule says the glyph must be in the text (SKILL.md);
  - all five contact items are live links. The source has two, which is an
    artifact of it having been round-tripped through HTML -- the same export
    flattened the skills-line label, which is why that one is NOT bold here
    either: it is the one place the source is unambiguous about its own intent.
"""
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Inches, Mm, Pt

from docx_base import add_hyperlink, blank, bottom_border, content_width, para, right_tab

STYLE = "nus"
FONT = "Arial"
# The starting size for the fit ladder, not the shipped one: every config pins
# its own bodyPt, and MIN_BODY_PT is the floor the source document settled on.
BODY_PT = 10.5
NAME_PT = 19.5
CONTACT_PT = 8.5
HEADER_PT = 9.5
MIN_BODY_PT = 8.5  # the floor the fit ladder may reach in this style

PAGE_WIDTH = Mm(210)
PAGE_HEIGHT = Mm(297)
MARGIN_LR = Inches(0.5)
MARGIN_TOP = Inches(0.667)
MARGIN_BOTTOM = Inches(0.667)

BULLET = "• "
SEP = " | "  # NBSPs so the contact line never breaks at a separator
BULLET_LEFT_IN = 780 / 1440  # w:ind w:left="780": the text column for bullets

# Width of "• " in ems under Arial/Helvetica metrics (bullet 350 + space 278).
# Used as the hanging indent so wrapped lines land under the first line's text
# rather than under the bullet -- the source document gets this from a numbering
# tab stop, which a literal bullet has to reproduce arithmetically.
BULLET_EM = 0.628


def setup_document(doc, body_pt=BODY_PT, margin_in=None):
    """Page geometry + Normal style. Returns the usable content width."""
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
    p = para(doc)
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = p.add_run(name.upper())
    run.bold = True
    run.font.size = Pt(NAME_PT)
    return p


def add_contact_line(doc, items):
    """items: [{text, url?}] joined by SEP, right-flush under the name."""
    p = para(doc)
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    for i, item in enumerate(items):
        if i:
            run = p.add_run(SEP)
            run.font.size = Pt(CONTACT_PT)
        if item.get("url"):
            add_hyperlink(p, item["url"], item["text"], size_pt=CONTACT_PT, font=FONT)
        else:
            run = p.add_run(item["text"])
            run.font.size = Pt(CONTACT_PT)
    return p


def add_section_header(doc, title, first=False, body_pt=BODY_PT):
    """Blank line, then caps + a thinThickSmallGap rule. `first` is unused: the
    blank paragraph after the contact line is in the source document too."""
    blank(doc, body_pt)
    p = para(doc)
    p.paragraph_format.keep_with_next = True
    run = p.add_run(title.upper())
    run.bold = True
    run.font.size = Pt(HEADER_PT)
    bottom_border(p, "thinThickSmallGap", 18)
    return p


def _entry_line(doc, width, text, right, space_after=0):
    p = para(doc, space_after=space_after)
    p.paragraph_format.keep_with_next = True
    right_tab(p, width)
    p.add_run(text).bold = True
    if right:
        p.add_run("\t" + right).bold = True
    return p


def add_entry(doc, width, section_type, entry, role, first=False, body_pt=BODY_PT):
    """One bold line per entry, right-flush dates, with the name order set by
    the section:

        education    Organization<tab>Dates, then the degree on its own line
        experience   Role, Organization<tab>Dates
        projects     Role, Organization<tab>Dates
        leadership   Organization, Role<tab>Dates

    Leadership really does flip the order in the source document. It is kept
    because it reads better in both places -- an employer leads a job, an
    organisation leads a volunteer post -- not because it was overlooked.
    """
    if not first:
        blank(doc, body_pt)
    org = entry["organization"]
    date = entry["dateLabel"]
    if section_type == "education":
        p = _entry_line(doc, width, org, date)
        return _entry_line(doc, width, role, None) if role else p
    if not role:
        return _entry_line(doc, width, org, date)
    head = f"{org}, {role}" if section_type == "leadership" else f"{role}, {org}"
    return _entry_line(doc, width, head, date)


def add_bullet(doc, text, body_pt=BODY_PT):
    p = para(doc)
    pf = p.paragraph_format
    pf.left_indent = Inches(BULLET_LEFT_IN)
    pf.first_line_indent = -Pt(BULLET_EM * body_pt)
    p.add_run(BULLET + text)
    return p


def add_skill_line(doc, label, items):
    p = para(doc)
    p.add_run(f"{label}: {items}")
    return p
