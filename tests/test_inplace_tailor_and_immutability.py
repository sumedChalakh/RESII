import os
import io
import hashlib
import docx
from docx.shared import Pt, RGBColor
import pytest
from api.db import SessionLocal
from api.models import UserModel, ResumeModel, ManagedFileModel, TailoredResumeModel
from api.storage import storage_manager
from api.in_place_tailor import tailor_docx_in_place, tailor_resume_in_place, _fit_text_to_length_budget


def test_fit_text_to_length_budget():
    original = "Developed machine learning models using Python and scikit-learn for fraud detection."
    # Shorter or comparable length should stay intact
    new_text = "Architected predictive machine learning models in Python for fraud detection."
    budgeted = _fit_text_to_length_budget(original, new_text)
    assert budgeted == new_text

    # Extremely long text that would cause page-break overflow should be gracefully budgeted
    very_long = ("Architected and engineered comprehensive, multi-layered predictive machine learning models "
                 "using distributed Python, Apache Spark, TensorFlow, and advanced neural architectures with "
                 "real-time monitoring, alerting, telemetry, logging, and automated failure recovery pipelines.")
    budgeted_long = _fit_text_to_length_budget(original, very_long)
    assert len(budgeted_long) <= len(original) + 25
    assert budgeted_long.endswith(".")


def test_docx_in_place_formatting_and_page_preservation(tmp_path):
    # 1. Create a dummy docx with specific font, size, bold, margins
    doc = docx.Document()
    p = doc.add_paragraph()
    run = p.add_run("Implemented a distributed ML pipeline on 2M IBM Telco records.")
    run.font.name = "Georgia"
    run.font.size = Pt(11)
    run.bold = True
    run.font.color.rgb = RGBColor(15, 76, 58)

    buf = io.BytesIO()
    doc.save(buf)
    original_docx_bytes = buf.getvalue()
    original_hash = hashlib.sha256(original_docx_bytes).hexdigest()

    # 2. Perform in-place tailoring
    replacements = [{
        "original": "Implemented a distributed ML pipeline on 2M IBM Telco records.",
        "replacement": "Architected and deployed a distributed ML pipeline on 2M records with PySpark."
    }]

    tailored_bytes = tailor_docx_in_place(original_docx_bytes, replacements, strict_page_count=1)

    # 3. Verify original bytes remained 100% untouched
    assert hashlib.sha256(original_docx_bytes).hexdigest() == original_hash

    # 4. Inspect tailored docx structure
    tailored_doc = docx.Document(io.BytesIO(tailored_bytes))
    assert len(tailored_doc.paragraphs) == 1
    t_para = tailored_doc.paragraphs[0]
    assert "Architected and deployed" in t_para.text
    
    # Run properties preserved
    first_run = t_para.runs[0]
    assert first_run.font.name == "Georgia"
    assert first_run.font.size == Pt(11)
    assert first_run.bold is True


def test_original_resume_immutability_and_tailored_versioning():
    with SessionLocal() as db:
        user = db.query(UserModel).filter(UserModel.id == "usr_demo_101").first()
        assert user is not None

        # Create original resume & managed file
        resume_id = "test_rez_immutability_01"
        sample_content = b"ORIGINAL IMMUTABLE RESUME BYTES 12345"
        sample_hash = hashlib.sha256(sample_content).hexdigest()

        # Clean existing test records if any
        db.query(TailoredResumeModel).filter(TailoredResumeModel.parent_resume_id == resume_id).delete()
        db.query(ManagedFileModel).filter(ManagedFileModel.resume_id == resume_id).delete()
        db.query(ResumeModel).filter(ResumeModel.id == resume_id).delete()
        db.commit()

        # 1. Insert parent resume first (foreign key target)
        resume = ResumeModel(
            id=resume_id,
            user_id=user.id,
            title="My Master Resume",
            version=1,
            is_primary=True,
            ats_score=90,
            active_template="classic_spruce",
            document={
                "header": {"name": "Test User", "title": "Software Engineer"},
                "sections": [{
                    "id": "sec_exp",
                    "title": "Experience",
                    "blocks": [{
                        "role": "Engineer",
                        "company": "Tech Corp",
                        "lines": [{"id": "l1", "text": "Implemented distributed API architecture."}]
                    }]
                }]
            },
            original_format="docx",
            original_file_hash=sample_hash,
            original_page_count=1,
            created_at="2026-11-21T12:00:00Z",
            updated_at="2026-11-21T12:00:00Z"
        )
        db.add(resume)
        db.commit()

        # 2. Save original file linked to parent resume
        mf = storage_manager.save_file(
            db=db,
            user_id=user.id,
            original_filename="My_Master_Resume.docx",
            content=sample_content,
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            resume_id=resume_id
        )
        db.commit()

        # Verify integrity before tailoring
        assert storage_manager.verify_file_integrity(db, user.id, mf.id) is True

        # Tailor resume for Bristol-Myers Squibb
        result = tailor_resume_in_place(
            db=db,
            user_id=user.id,
            resume_id=resume_id,
            job_description="Seeking AI Engineer experienced in scalable systems and PySpark.",
            job_title="AI Engineer",
            company_name="Bristol-Myers Squibb",
            target_format="docx"
        )

        assert result["success"] is True
        assert result["company_name"] == "Bristol-Myers Squibb"
        assert result["page_count"] == 1
        assert "file_base64" in result
        assert len(result["file_base64"]) > 100

        # Verify original file was NEVER modified (IMMUTABILITY INVARIANT)
        orig_filename, orig_bytes = storage_manager.get_file_content(db, user.id, mf.id)
        assert orig_bytes == sample_content
        assert hashlib.sha256(orig_bytes).hexdigest() == sample_hash
        assert storage_manager.verify_file_integrity(db, user.id, mf.id) is True

        # Verify tailored record exists in tailored_resumes table
        tailored_record = db.query(TailoredResumeModel).filter(
            TailoredResumeModel.id == result["tailored_id"]
        ).first()
        assert tailored_record is not None
        assert tailored_record.company_name == "Bristol-Myers Squibb"
        assert tailored_record.job_title == "AI Engineer"
        assert tailored_record.status == "Draft"
        assert tailored_record.page_count == 1
