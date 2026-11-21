import io
from typing import Dict, Any, List
import docx
from docx.shared import Pt, Mm, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

TEMPLATES_DOCX_STYLE = {
    "classic_spruce": {
        "accent": RGBColor(15, 76, 58), # #0f4c3a
        "margin_mm": 18
    },
    "modern_tech": {
        "accent": RGBColor(67, 56, 202), # #4338ca
        "margin_mm": 16
    },
    "executive_serif": {
        "accent": RGBColor(30, 41, 59), # #1e293b
        "margin_mm": 20
    },
    "minimal_mono": {
        "accent": RGBColor(13, 148, 136), # #0d9488
        "margin_mm": 15
    },
    "creative_bold": {
        "accent": RGBColor(225, 29, 72), # #e11d48
        "margin_mm": 17
    }
}


def generate_docx(document: Dict[str, Any], template_id: str = "classic_spruce") -> bytes:
    """
    Renders the structured document tree into a genuine DOCX document using python-docx.
    Configures document margins, headings with template accent colors, role blocks, and bullet lists.
    """
    style = TEMPLATES_DOCX_STYLE.get(template_id, TEMPLATES_DOCX_STYLE["classic_spruce"])
    accent_rgb = style["accent"]
    margin_mm = style["margin_mm"]

    doc = docx.Document()

    # Set page margins
    for section in doc.sections:
        section.top_margin = Mm(margin_mm)
        section.bottom_margin = Mm(margin_mm)
        section.left_margin = Mm(margin_mm)
        section.right_margin = Mm(margin_mm)

    header = document.get("header", {})
    candidate_name = header.get("name", "Candidate").strip()
    headline = header.get("title", "").strip()
    email = header.get("email", "").strip()
    phone = header.get("phone", "").strip()
    location = header.get("location", "").strip()
    links = header.get("links", [])

    # 1. Candidate Name (Heading 1)
    h1 = doc.add_paragraph()
    h1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    h1.paragraph_format.space_before = Pt(0)
    h1.paragraph_format.space_after = Pt(2)
    run_name = h1.add_run(candidate_name)
    run_name.font.size = Pt(20)
    run_name.bold = True
    run_name.font.color.rgb = RGBColor(25, 25, 25)

    # 2. Professional Headline / Title
    if headline:
        p_title = doc.add_paragraph()
        p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_title.paragraph_format.space_before = Pt(0)
        p_title.paragraph_format.space_after = Pt(4)
        run_title = p_title.add_run(headline)
        run_title.font.size = Pt(11)
        run_title.italic = True
        run_title.font.color.rgb = accent_rgb

    # 3. Contact Info
    contact_parts = []
    if email:
        contact_parts.append(email)
    if phone:
        contact_parts.append(phone)
    if location:
        contact_parts.append(location)
    for lk in links[:2]:
        contact_parts.append(lk)

    if contact_parts:
        p_contact = doc.add_paragraph()
        p_contact.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_contact.paragraph_format.space_before = Pt(0)
        p_contact.paragraph_format.space_after = Pt(10)
        run_contact = p_contact.add_run("  •  ".join(contact_parts))
        run_contact.font.size = Pt(9.5)
        run_contact.font.color.rgb = RGBColor(90, 90, 90)

    # 4. Sections
    sections = document.get("sections", [])
    for sec in sections:
        sec_title = sec.get("title", "").strip().upper()
        h2 = doc.add_paragraph()
        h2.paragraph_format.space_before = Pt(10)
        h2.paragraph_format.space_after = Pt(3)
        run_sec = h2.add_run(sec_title)
        run_sec.font.size = Pt(11.5)
        run_sec.bold = True
        run_sec.font.color.rgb = accent_rgb

        for blk in sec.get("blocks", []):
            role = blk.get("role", "").strip()
            company = blk.get("company", "").strip()
            period = blk.get("period", "").strip()
            location = blk.get("location", "").strip()

            has_header = bool(role or company or period)
            if has_header:
                p_blk = doc.add_paragraph()
                p_blk.paragraph_format.space_before = Pt(4)
                p_blk.paragraph_format.space_after = Pt(2)

                if role:
                    r_role = p_blk.add_run(role)
                    r_role.bold = True
                    r_role.font.size = Pt(10)
                    r_role.font.color.rgb = RGBColor(25, 25, 25)

                if company:
                    sep = " — " if role else ""
                    r_comp = p_blk.add_run(f"{sep}{company}")
                    r_comp.font.size = Pt(10)
                    r_comp.font.color.rgb = RGBColor(50, 50, 50)

                right_parts = [p for p in [period, location] if p]
                if right_parts:
                    r_meta = p_blk.add_run(f"  |  {' | '.join(right_parts)}")
                    r_meta.italic = True
                    r_meta.font.size = Pt(9)
                    r_meta.font.color.rgb = RGBColor(100, 100, 100)

            for line_item in blk.get("lines", []):
                bullet_raw = line_item.get("text", "").strip()
                if not bullet_raw:
                    continue

                p_bullet = doc.add_paragraph(style='List Bullet')
                p_bullet.paragraph_format.space_before = Pt(1)
                p_bullet.paragraph_format.space_after = Pt(1)
                r_bullet = p_bullet.add_run(bullet_raw)
                r_bullet.font.size = Pt(9.5)
                r_bullet.font.color.rgb = RGBColor(40, 40, 40)

    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
