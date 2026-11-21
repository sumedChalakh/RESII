# RESII — Document Engine & Layout Architecture Audit

**Target:** `api/ingestion.py`, `api/layout_engine.py`, `api/templates.py`, `api/resumes.py`  
**Scope:** Multi-Format Ingestion, AST Tree Fidelity, Formatting Preservation, Page Budgeting, Server-Side Rendering, and Concurrency  
**Status:** Audit Completed  
**Current Grade:** **Partially Implemented / Mocked (D)**  

---

## 1. Executive Summary

RESII's document subsystem is responsible for:
1. Ingesting resumes across diverse file formats (PDF, DOCX, TXT).
2. Parsing documents into a normalized Abstract Syntax Tree (AST Document Tree: Header, Sections, Blocks, Lines).
3. Computing physical page fit, margin tightening, and bullet omission.
4. Rendering production-grade, ATS-compliant PDF and DOCX files.
5. Managing multi-tab concurrency through version locking.

**Audit Finding:**  
While optimistic concurrency locking (`X-Resume-Version`) is correctly implemented and tested, the **document ingestion and rendering pipelines are largely simulated**:
- Uploaded resumes have their body text discarded and replaced by a hardcoded seed resume.
- PDF and DOCX parsers strip all visual formatting, typography, bold/italic emphasis, and tables.
- PDF generation returns a hardcoded 44-byte static PDF stub that does not contain the user's actual resume data.
- DOCX export is completely unimplemented.

---

## 2. In-Depth Subsystem Analysis

### 2.1 File Ingestion & Parsing Fidelity (`api/ingestion.py`)

#### PDF Extraction
- **Code:** `api/ingestion.py:11-16`
  ```python
  import pypdf
  reader = pypdf.PdfReader(io.BytesIO(content))
  pages_text = [page.extract_text() or "" for page in reader.pages]
  return "\n".join(pages_text)
  ```
- **Limitations:**
  - `pypdf.extract_text()` pulls unformatted character streams.
  - Multi-column resumes (e.g. sidebar for contact/skills, main column for experience) are flattened in reading order, causing jumbled lines.
  - Font sizes, font weights (bold/semi-bold), bullet markers, and table structures are completely lost.

#### DOCX Extraction
- **Code:** `api/ingestion.py:19-23`
  ```python
  import docx
  doc = docx.Document(io.BytesIO(content))
  return "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
  ```
- **Limitations:**
  - Iterates only over `doc.paragraphs`. Any resume with experience or education formatted inside tables (`doc.tables`) is completely ignored.
  - Run-level styling (`run.bold`, `run.font.name`, hyperlinks) is discarded.

#### The Parse Tree Gap
- **Code:** `api/ingestion.py:31-160`
  ```python
  def parse_text_into_document_tree(raw_text: str, filename: str = "Resume.pdf") -> Dict[str, Any]:
      lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
      contact_name = lines[0] if lines else "Alex Rivera"
      # ...
      # HARDCODED SECTIONS:
      sections = [
          {"type": "experience", "title": "Professional Experience", "blocks": [
              {"role": "Senior Full-Stack Engineer", "company": "CloudScale Systems", ...},
              {"role": "Software Engineer II", "company": "Apex Data Labs", ...}
          ]},
          {"type": "education", "title": "Education", ...},
          {"type": "skills", "title": "Technical Skills", ...}
      ]
  ```
- **Critical Flaw:**
  - When a user uploads their own unique resume (e.g. a Healthcare Manager or Finance Analyst), the parser extracts their name, but **completely discards their actual career experience and injects the hardcoded CloudScale Systems software engineer experience**!
- **Production Fix:**
  - Implement a true semantic section segmentation engine (or LLM parser) that partitions lines by header keywords (`EXPERIENCE`, `WORK HISTORY`, `EDUCATION`, `SKILLS`, `PROJECTS`) and maps each company, date range, title, and bullet dynamically.

---

### 2.2 Layout Budget Engine & Page Tightening (`api/layout_engine.py`)

- **Code:** `api/layout_engine.py:3-45`
  ```python
  def calculate_layout_budget(document_tree: Dict[str, Any]) -> Dict[str, Any]:
      total_lines = 0
      for sec in sections:
          total_lines += 2
          for blk in sec.get("blocks", []):
              total_lines += 2
              total_lines += len(blk.get("lines", []))
      
      if total_lines <= 36:
          tightened = False; page_count = 1
      elif total_lines <= 46:
          tightened = True; page_count = 1
      else:
          page_count = (total_lines // 40) + 1; tightened = True
  ```
- **Analysis:**
  - The logic approximates line height by counting raw bullet items.
  - **Limitations:**
    - A 3-line bullet point is counted as 1 line.
    - Long company titles or section headings that wrap are not accounted for.
    - True printable height depends on font size (10pt vs 11pt vs 12pt), font family metrics, page margins (0.5 in vs 0.75 in), and line spacing (1.15 vs 1.25).
- **Production Fix:**
  - Use headless browser or canvas text measurement (`font.measureText()`) or CSS `@page` media rules in headless Chromium / Weasyprint to measure true pixel/millimeter height.

---

### 2.3 Server-Side Document Rendering (`api/templates.py`)

#### PDF Generation Stub
- **Code:** `api/templates.py:81-93`
  ```python
  @router.get("/pdf/read/{resume_id}")
  def read_pdf_preview(resume_id: str = "primary", ...):
      pdf_sample = (
          b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
          b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
          b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>\nendobj\n"
          b"4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (RESII ATS Document) Tj ET\nendstream\nendobj\n"
          b"xref\n0 5\n0000000000 65535 f\n..."
          b"trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n310\n%%EOF"
      )
      return Response(content=pdf_sample, media_type="application/pdf")
  ```
- **Critical Flaw:**
  - This returns a static 44-byte PDF containing only the words *"RESII ATS Document"*.
  - When users click "Download PDF" or "Preview PDF", they do not receive their actual resume.
- **Production Requirement:**
  - Implement real HTML-to-PDF rendering using **Weasyprint** or **Playwright / Headless Chrome**.
  - Pass the resume document tree into a Jinja2 template matching the active template design tokens, rendering high-DPI vector text, selectable ATS fonts, and exact page dimensions.

#### DOCX Export Stub
- **Code:** `api/templates.py:100-106`
  ```python
  @router.get("/word/read/{resume_id}")
  def read_word_preview(resume_id: str = "primary", ...):
      return {
          "status": "ready",
          "resume_id": resume_id,
          "export_format": "docx",
          "download_url": f"/api/v3/templates/download/docx/{resume_id}"
      }
  ```
- **Critical Flaw:**
  - The endpoint returns a JSON status object, but no `.docx` binary builder exists, and `/api/v3/templates/download/docx/{resume_id}` returns a 404!
- **Production Requirement:**
  - Implement a DOCX builder using `python-docx` that generates real `.docx` files formatted with clean heading styles, bullet runs, and ATS-friendly tables.

---

### 2.4 Optimistic Concurrency Engine (`api/resumes.py`)

- **Code:** `api/resumes.py:118-135`
  ```python
  @router.put("/{resume_id}/document")
  def update_resume_document(resume_id: str, req: UpdateDocumentRequest, response: Response):
      current_server_version = target_resume.get("version", 1)
      if req.version < current_server_version:
          raise HTTPException(
              status_code=status.HTTP_409_CONFLICT,
              detail={
                  "message": "Document has been modified by another session.",
                  "server_version": current_server_version,
                  "client_version": req.version
              }
          )
      new_version = current_server_version + 1
      target_resume["version"] = new_version
      response.headers["X-Resume-Version"] = str(new_version)
  ```
- **Evaluation:**
  - **Verdict: A (Implemented & Verified)**
  - Tested in `api/tests/test_phase2.py:test_optimistic_concurrency_conflict`.
  - Accurately triggers HTTP 409 Conflict when a stale client attempts to save over a newer version, and powers the frontend "Keep mine" conflict modal in `web/src/pages/EditTreePage.tsx`.

---

## 3. Production Document Engine Architecture

```
                  ┌─────────────────────────────────────────┐
                  │    Normalized Resume Document Tree      │
                  │ (Header, Sections, Blocks, Lines, Meta) │
                  └────────────────────┬────────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
     [HTML/CSS Jinja2 Engine]                     [python-docx Builder]
                │                                             │
      ┌─────────┴─────────┐                         ┌─────────┴─────────┐
      ▼                   ▼                         ▼                   ▼
(Classic Spruce)    (Modern Tech)            (Heading Styles)    (Bullet Lists)
      │                   │                         │                   │
      └─────────┬─────────┘                         └─────────┬─────────┘
                ▼                                             ▼
        [WeasyPrint / Typst]                             Real .docx
                │                                       Binary Stream
                ▼
        Real Multi-Page
          ATS Vector
          PDF Stream
```
