import io
from typing import Dict, Any, List, Tuple
import fitz

TEMPLATES_STYLE = {
    "classic_spruce": {
        "accent": (15 / 255.0, 76 / 255.0, 58 / 255.0), # #0f4c3a
        "font_reg": "helv",
        "font_bold": "hebo",
        "font_italic": "heit",
        "margin_mm": 18
    },
    "modern_tech": {
        "accent": (67 / 255.0, 56 / 255.0, 202 / 255.0), # #4338ca
        "font_reg": "helv",
        "font_bold": "hebo",
        "font_italic": "heit",
        "margin_mm": 16
    },
    "executive_serif": {
        "accent": (30 / 255.0, 41 / 255.0, 59 / 255.0), # #1e293b
        "font_reg": "tiro",
        "font_bold": "tibo",
        "font_italic": "tiit",
        "margin_mm": 20
    },
    "minimal_mono": {
        "accent": (13 / 255.0, 148 / 255.0, 136 / 255.0), # #0d9488
        "font_reg": "cour",
        "font_bold": "cobo",
        "font_italic": "coit",
        "margin_mm": 15
    },
    "creative_bold": {
        "accent": (225 / 255.0, 29 / 255.0, 72 / 255.0), # #e11d48
        "font_reg": "helv",
        "font_bold": "hebo",
        "font_italic": "heit",
        "margin_mm": 17
    }
}


def _hex_to_rgb(hex_str: str) -> Tuple[float, float, float]:
    clean = hex_str.lstrip('#')
    if len(clean) == 6:
        return (
            int(clean[0:2], 16) / 255.0,
            int(clean[2:4], 16) / 255.0,
            int(clean[4:6], 16) / 255.0
        )
    return (0.1, 0.1, 0.1)


def _wrap_text(text: str, fontname: str, fontsize: float, max_width: float) -> List[str]:
    words = text.split()
    if not words:
        return []
    lines: List[str] = []
    curr: List[str] = []
    for w in words:
        test = " ".join(curr + [w])
        if fitz.get_text_length(test, fontname=fontname, fontsize=fontsize) <= max_width:
            curr.append(w)
        else:
            if curr:
                lines.append(" ".join(curr))
                curr = [w]
            else:
                lines.append(w)
                curr = []
    if curr:
        lines.append(" ".join(curr))
    return lines


def generate_pdf(document: Dict[str, Any], template_id: str = "classic_spruce") -> bytes:
    """
    Renders the structured document tree into a high-fidelity vector PDF using PyMuPDF (fitz).
    Applies template typography, accent colors, page margins, and dynamic pagination.
    """
    style = TEMPLATES_STYLE.get(template_id, TEMPLATES_STYLE["classic_spruce"])
    accent_rgb = style["accent"]
    font_reg = style["font_reg"]
    font_bold = style["font_bold"]
    font_italic = style["font_italic"]

    # Convert margin to points (1 mm = 72 / 25.4 pt = ~2.83465 pt)
    margin_pt = style["margin_mm"] * (72.0 / 25.4)
    page_width = 595.32   # A4 width in pt
    page_height = 841.92  # A4 height in pt
    content_width = page_width - (2 * margin_pt)
    max_y = page_height - margin_pt

    doc = fitz.open()
    page = doc.new_page(width=page_width, height=page_height)
    current_y = margin_pt + 8

    header = document.get("header", {})
    candidate_name = header.get("name", "Candidate").strip()
    headline = header.get("title", "").strip()
    email = header.get("email", "").strip()
    phone = header.get("phone", "").strip()
    location = header.get("location", "").strip()
    links = header.get("links", [])

    # 1. Candidate Name (Header)
    name_size = 18.0
    name_w = fitz.get_text_length(candidate_name, fontname=font_bold, fontsize=name_size)
    name_x = (page_width - name_w) / 2.0 if template_id != "minimal_mono" else margin_pt
    page.insert_text(
        fitz.Point(name_x, current_y),
        candidate_name,
        fontname=font_bold,
        fontsize=name_size,
        color=(0.1, 0.1, 0.1)
    )
    current_y += name_size + 4

    # 2. Professional Headline / Title
    if headline:
        head_size = 11.0
        head_w = fitz.get_text_length(headline, fontname=font_italic, fontsize=head_size)
        head_x = (page_width - head_w) / 2.0 if template_id != "minimal_mono" else margin_pt
        page.insert_text(
            fitz.Point(head_x, current_y),
            headline,
            fontname=font_italic,
            fontsize=head_size,
            color=accent_rgb
        )
        current_y += head_size + 4

    # 3. Contact Details
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
        contact_line = "  •  ".join(contact_parts)
        contact_size = 9.0
        c_w = fitz.get_text_length(contact_line, fontname=font_reg, fontsize=contact_size)
        c_x = (page_width - c_w) / 2.0 if template_id != "minimal_mono" else margin_pt
        page.insert_text(
            fitz.Point(c_x, current_y),
            contact_line,
            fontname=font_reg,
            fontsize=contact_size,
            color=(0.3, 0.3, 0.3)
        )
        current_y += contact_size + 8

    # 4. Accent Divider Line
    page.draw_line(
        fitz.Point(margin_pt, current_y),
        fitz.Point(page_width - margin_pt, current_y),
        color=accent_rgb,
        width=1.5
    )
    current_y += 14

    # Helper for page breaks
    def ensure_space(needed_pt: float) -> None:
        nonlocal page, current_y
        if current_y + needed_pt > max_y:
            page = doc.new_page(width=page_width, height=page_height)
            current_y = margin_pt + 12

    # 5. Sections
    sections = document.get("sections", [])
    for sec in sections:
        ensure_space(36)
        sec_title = sec.get("title", "").strip().upper()
        sec_size = 11.0

        # Section Heading
        page.insert_text(
            fitz.Point(margin_pt, current_y),
            sec_title,
            fontname=font_bold,
            fontsize=sec_size,
            color=accent_rgb
        )
        current_y += 3
        # Underline rule
        page.draw_line(
            fitz.Point(margin_pt, current_y),
            fitz.Point(page_width - margin_pt, current_y),
            color=(0.82, 0.82, 0.82),
            width=0.6
        )
        current_y += 13

        # Blocks within Section
        for blk in sec.get("blocks", []):
            role = blk.get("role", "").strip()
            company = blk.get("company", "").strip()
            period = blk.get("period", "").strip()
            location = blk.get("location", "").strip()

            has_header_line = bool(role or company or period)
            if has_header_line:
                ensure_space(20)
                # Left text: Role / Company
                if role and company:
                    left_text = f"{role} — {company}"
                elif role:
                    left_text = role
                else:
                    left_text = company

                page.insert_text(
                    fitz.Point(margin_pt, current_y),
                    left_text,
                    fontname=font_bold,
                    fontsize=10.0,
                    color=(0.12, 0.12, 0.12)
                )

                # Right text: Period & Location
                right_parts = [p for p in [period, location] if p]
                if right_parts:
                    right_text = " | ".join(right_parts)
                    rw = fitz.get_text_length(right_text, fontname=font_reg, fontsize=9.0)
                    rx = page_width - margin_pt - rw
                    page.insert_text(
                        fitz.Point(rx, current_y),
                        right_text,
                        fontname=font_reg,
                        fontsize=9.0,
                        color=(0.35, 0.35, 0.35)
                    )
                current_y += 13

            # Lines / Bullet items
            bullet_indent = 12.0
            avail_text_width = content_width - bullet_indent - 4.0

            for line_item in blk.get("lines", []):
                bullet_raw = line_item.get("text", "").strip()
                if not bullet_raw:
                    continue

                wrapped_lines = _wrap_text(bullet_raw, font_reg, 9.5, avail_text_width)
                for l_i, wrapped_line in enumerate(wrapped_lines):
                    ensure_space(13)
                    if l_i == 0:
                        # Draw bullet symbol
                        page.insert_text(
                            fitz.Point(margin_pt + 2, current_y),
                            "•",
                            fontname=font_bold,
                            fontsize=9.5,
                            color=accent_rgb
                        )

                    page.insert_text(
                        fitz.Point(margin_pt + bullet_indent, current_y),
                        wrapped_line,
                        fontname=font_reg,
                        fontsize=9.5,
                        color=(0.2, 0.2, 0.2)
                    )
                    current_y += 12.5

            current_y += 5  # spacing after block

        current_y += 8  # spacing after section

    # Set metadata
    doc.set_metadata({
        "title": f"{candidate_name} Resume",
        "author": candidate_name,
        "creator": "RESII Real Resume Document Engine",
        "producer": "PyMuPDF"
    })

    pdf_bytes = doc.tobytes(deflate=True, clean=True)
    doc.close()
    return pdf_bytes
