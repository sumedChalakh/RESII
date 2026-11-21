from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends, Response, status
from pydantic import BaseModel
from api.auth import get_current_user_required, get_current_user_optional
from api.schemas import UserSession
from api.resumes import RESUMES_DB
from api.pdf_engine import generate_pdf
from api.docx_engine import generate_docx

router = APIRouter(prefix="/api/v3/templates", tags=["Templates"])

TEMPLATES_CATALOG = [
    {
        "id": "classic_spruce",
        "name": "Classic Spruce",
        "description": "Clean, ATS-optimized layout with deep emerald accents and optimal line density.",
        "category": "ATS Favorite",
        "thumbnail": "/templates/classic_spruce.png",
        "accent_color": "#0f4c3a",
        "font_family": "system-ui, -apple-system, sans-serif",
        "page_budget_margin_mm": 18,
        "is_ats_grade_a": True
    },
    {
        "id": "modern_tech",
        "name": "Modern Tech",
        "description": "Refined tech professional layout with subtle indigo borders and skills grid.",
        "category": "Engineering",
        "thumbnail": "/templates/modern_tech.png",
        "accent_color": "#4338ca",
        "font_family": "'Inter', sans-serif",
        "page_budget_margin_mm": 16,
        "is_ats_grade_a": True
    },
    {
        "id": "executive_serif",
        "name": "Executive Serif",
        "description": "Distinguished typography for director and leadership applications.",
        "category": "Executive",
        "thumbnail": "/templates/executive_serif.png",
        "accent_color": "#1e293b",
        "font_family": "'Merriweather', Georgia, serif",
        "page_budget_margin_mm": 20,
        "is_ats_grade_a": True
    },
    {
        "id": "minimal_mono",
        "name": "Minimalist Monospace",
        "description": "High-signal density designed for systems engineers and backend specialists.",
        "category": "Engineering",
        "thumbnail": "/templates/minimal_mono.png",
        "accent_color": "#0d9488",
        "font_family": "'JetBrains Mono', 'Fira Code', monospace",
        "page_budget_margin_mm": 15,
        "is_ats_grade_a": True
    },
    {
        "id": "creative_bold",
        "name": "Creative Bold",
        "description": "Dynamic header with high visual contrast for product design and brand leaders.",
        "category": "Creative",
        "thumbnail": "/templates/creative_bold.png",
        "accent_color": "#e11d48",
        "font_family": "'Poppins', sans-serif",
        "page_budget_margin_mm": 17,
        "is_ats_grade_a": True
    }
]

class TemplateSwitchRequest(BaseModel):
    resume_id: str
    template_id: str

@router.get("/")
def list_templates(user: Optional[UserSession] = Depends(get_current_user_optional)):
    """Public template catalog listing available designs without user-specific data."""
    return {
        "templates": TEMPLATES_CATALOG,
        "total": len(TEMPLATES_CATALOG)
    }

@router.post("/switch")
def switch_template(
    req: TemplateSwitchRequest,
    user: UserSession = Depends(get_current_user_required)
):
    """
    Switches the active layout template for a resume.
    Strictly verifies authenticated ownership; never falls back to arbitrary resumes.
    """
    resume = RESUMES_DB.get(req.resume_id)
    if not resume or resume.get("user_id") != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found."
        )
        
    tpl = next((t for t in TEMPLATES_CATALOG if t["id"] == req.template_id), None)
    if not tpl:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template '{req.template_id}' not found."
        )
        
    resume["active_template"] = tpl["id"]
    resume["template_meta"] = {
        "template_name": tpl["name"],
        "accent_color": tpl["accent_color"],
        "font_family": tpl["font_family"],
        "margin_mm": tpl["page_budget_margin_mm"]
    }
    
    return {
        "status": "success",
        "message": f"Successfully switched to '{tpl['name']}' without content loss.",
        "resume_id": req.resume_id,
        "template": tpl
    }

@router.get("/pdf/read/{resume_id}")
@router.post("/pdf/read")
def read_pdf_preview(
    resume_id: str = "primary",
    user: UserSession = Depends(get_current_user_required)
):
    """
    Generates PDF preview payload for owned resume.
    Rejects unauthorized or cross-user access with HTTP 404.
    """
    resume = RESUMES_DB.get(resume_id)
    if not resume or resume.get("user_id") != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found."
        )

    tpl_id = resume.get("active_template", "classic_spruce")
    doc_tree = resume.get("document", {})
    pdf_bytes = generate_pdf(doc_tree, template_id=tpl_id)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=resii_{resume_id}.pdf"
        }
    )

@router.get("/word/read/{resume_id}")
def read_word_preview(
    resume_id: str = "primary",
    user: UserSession = Depends(get_current_user_required)
):
    """
    Generates Word export preview URL for owned resume.
    Rejects unauthorized access with HTTP 404.
    """
    resume = RESUMES_DB.get(resume_id)
    if not resume or resume.get("user_id") != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found."
        )

    return {
        "status": "ready",
        "resume_id": resume_id,
        "export_format": "docx",
        "download_url": f"/api/v3/templates/download/docx/{resume_id}"
    }

@router.get("/download/docx/{resume_id}")
def download_docx_preview(
    resume_id: str,
    user: UserSession = Depends(get_current_user_required)
):
    """
    Downloads Word export preview for owned resume.
    Rejects unauthorized access with HTTP 404.
    """
    resume = RESUMES_DB.get(resume_id)
    if not resume or resume.get("user_id") != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found."
        )

    tpl_id = resume.get("active_template", "classic_spruce")
    doc_tree = resume.get("document", {})
    docx_bytes = generate_docx(doc_tree, template_id=tpl_id)

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f"attachment; filename=resii_{resume_id}.docx"
        }
    )
