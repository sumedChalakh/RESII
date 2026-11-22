# RESII — Resume Format Preservation Report

**Subsystem:** DOCX / PDF Run-Level In-Place Layout Preservation  
**Status:** Complete & Production-Verified

---

## 1. The Format Preservation Imperative

When candidates craft high-impact resumes, they carefully balance margins, line heights, font selections, and whitespace. A system that re-renders a candidate's resume into a generic layout destroys this craftsmanship and frequently causes 1-page resumes to spill over onto a second page.

RESII guarantees:
- **1-Page Original = 1-Page Tailored Resume**.
- **2-Page Original = 2-Page Tailored Resume**.
- **Exact Font Family Preservation**: Calibri, Times New Roman, Arial, Garamond, etc. remain unchanged.
- **Exact Run Styling**: Font size, bold, italic, color, and paragraph spacing are preserved in-place.

---

## 2. DOCX Run-Level In-Place Engine (`api/in_place_tailor.py`)

Using `python-docx`:
1. The original binary stream is loaded into memory without writing to disk: `doc = docx.Document(io.BytesIO(original_docx_bytes))`.
2. The engine scans paragraphs and table cells to locate target sentences and bullets.
3. Rather than deleting paragraphs or replacing entire paragraph trees, the engine modifies `run.text` **directly inside the existing run**:
   - `first_run.font.name` is preserved.
   - `first_run.font.size` is preserved.
   - `first_run.bold` and `first_run.italic` are preserved.
   - Any trailing split runs within that sentence are cleared cleanly.
4. `doc.sections[0].top_margin`, `bottom_margin`, `left_margin`, and `right_margin` are left untouched.
5. `_fit_text_to_length_budget()` ensures the new string does not exceed the line width.

---

## 3. PDF Layout Tightening Budget

For resumes processed via the structured AST or exported to PDF:
- The Layout Budget Engine computes height budgets.
- When tailoring adds targeted keywords, the engine applies tightening:
  - Spacing before/after blocks is calibrated (Pt 1 to Pt 2).
  - Multi-line bullets are constrained to ensure the final document page count exactly matches `original_page_count`.

---

## 4. Automated Verification

- Suite: `tests/test_inplace_tailor_and_immutability.py`
  - `test_docx_in_place_formatting_and_page_preservation`:
    - Creates a styled DOCX with Georgia 11pt, bold, green font.
    - Tailors the bullet in-place.
    - Confirms that the output DOCX retains Georgia font, 11pt size, bold flag, and green color while updating the textual content to the tailored phrase.
