import uuid
import re
import datetime
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc

from api.models import (
    CompanyRegistryModel,
    JobListingModel,
    JobSyncLogModel,
    JobVerificationLogModel,
    ResumeModel
)
from api.config import settings
from api.jobs_engine.connectors.greenhouse import GreenhouseConnector
from api.jobs_engine.connectors.lever import LeverConnector
from api.jobs_engine.connectors.ashby import AshbyConnector
from api.jobs_engine.connectors.adzuna import AdzunaConnector
from api.jobs_engine.connectors.smartrecruiters import SmartRecruitersConnector
from api.jobs_engine.connectors.remotive import RemotiveConnector
from api.jobs_engine.connectors.arbeitnow import ArbeitnowConnector
from api.jobs_engine.connectors.jobicy import JobicyConnector
from api.jobs_engine.connectors.workable import WorkableConnector
from api.jobs_engine.registry import list_companies
from api.ai.evidence import build_evidence_ledger

class JobDiscoveryService:
    """Core orchestrator for multi-source job discovery, ingestion, verification, and AI matching."""

    def __init__(self):
        self.gh = GreenhouseConnector()
        self.lev = LeverConnector()
        self.ash = AshbyConnector()
        self.adz = AdzunaConnector(
            app_id=settings.ADZUNA_APP_ID,
            app_key=settings.ADZUNA_APP_KEY
        )
        self.smart = SmartRecruitersConnector()
        self.remotive = RemotiveConnector()
        self.arbeitnow = ArbeitnowConnector()
        self.jobicy = JobicyConnector()
        self.workable = WorkableConnector()

    def _get_connector_for_provider(self, ats_provider: str):
        p = ats_provider.lower().strip()
        if p == "greenhouse":
            return self.gh
        elif p == "lever":
            return self.lev
        elif p == "ashby":
            return self.ash
        elif p == "adzuna":
            return self.adz
        elif p == "smartrecruiters":
            return self.smart
        elif p == "workable":
            return self.workable
        elif p == "remotive":
            return self.remotive
        elif p == "arbeitnow":
            return self.arbeitnow
        elif p == "jobicy":
            return self.jobicy
        return None

    def sync_company(self, db: Session, company: CompanyRegistryModel) -> Dict[str, Any]:
        """Ingests and synchronizes all live vacancies for a single registered company."""
        connector = self._get_connector_for_provider(company.ats_provider)
        if not connector:
            return {
                "status": "error",
                "company": company.name,
                "error": f"Unsupported ATS provider: {company.ats_provider}"
            }

        start_time = datetime.datetime.now(datetime.timezone.utc)
        sync_log_id = f"sync_{uuid.uuid4().hex[:12]}"
        sync_log = JobSyncLogModel(
            id=sync_log_id,
            source_name=company.ats_provider,
            company_id=company.id,
            started_at=start_time.isoformat(),
            status="running"
        )
        db.add(sync_log)
        db.commit()

        jobs_fetched = 0
        jobs_inserted = 0
        jobs_updated = 0
        jobs_deactivated = 0
        seen_external_ids = set()

        try:
            comp_meta = {
                "id": company.id,
                "name": company.name,
                "website_url": company.website_url,
                "country": company.country,
                "ats_board_token": company.ats_board_token
            }

            raw_jobs = connector.fetch_jobs(board_token=company.ats_board_token)
            jobs_fetched = len(raw_jobs)

            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

            for raw in raw_jobs:
                norm = connector.normalize_job(raw, company_meta=comp_meta)
                ext_id = norm["external_job_id"]
                seen_external_ids.add(ext_id)

                # 1. Exact match lookup strictly by (source_name, external_job_id)
                existing = db.query(JobListingModel).filter(
                    JobListingModel.source_name == norm["source_name"],
                    JobListingModel.external_job_id == ext_id
                ).first()

                if existing:
                    # Update existing vacancy
                    existing.job_title = norm["job_title"]
                    existing.department = norm["department"]
                    existing.description = norm["description"]
                    existing.location = norm["location"]
                    existing.city = norm["city"]
                    existing.country = norm["country"]
                    existing.workplace_type = norm["workplace_type"]
                    existing.employment_type = norm["employment_type"]
                    existing.experience_level = norm["experience_level"]
                    existing.salary_min = norm["salary_min"]
                    existing.salary_max = norm["salary_max"]
                    existing.salary_currency = norm["salary_currency"]
                    existing.salary_formatted = norm["salary_formatted"]
                    existing.required_skills = norm["required_skills"]
                    existing.preferred_skills = norm["preferred_skills"]
                    existing.application_url = norm["application_url"]
                    existing.is_active = True
                    existing.verification_status = "verified"
                    existing.last_seen_at = now_iso
                    existing.last_verified_at = now_iso
                    existing.updated_at = now_iso
                    jobs_updated += 1
                else:
                    # Insert new vacancy
                    new_job = JobListingModel(**norm)
                    db.add(new_job)
                    jobs_inserted += 1

            # 3. Conservative lifecycle: verify missing jobs before deactivating
            if seen_external_ids and len(raw_jobs) > 0:
                missing_jobs = db.query(JobListingModel).filter(
                    JobListingModel.company_id == company.id,
                    JobListingModel.source_name == company.ats_provider,
                    JobListingModel.is_active == True,
                    ~JobListingModel.external_job_id.in_(seen_external_ids)
                ).all()

                for mj in missing_jobs:
                    # Verify external posting URL before marking expired
                    is_live, status_code, note = connector.verify_job_url(mj.application_url)
                    if status_code in (404, 410):
                        mj.is_active = False
                        mj.verification_status = "expired"
                        mj.updated_at = now_iso
                        jobs_deactivated += 1
                    elif not is_live:
                        # Temporary network issue; do not deactivate prematurely
                        mj.verification_status = "unverified"
                        mj.updated_at = now_iso
                    else:
                        # Job is still active on external board
                        mj.last_verified_at = now_iso

            # Mark company last sync success
            company.last_successful_sync = now_iso
            company.updated_at = now_iso

            # Complete sync log
            sync_log.jobs_fetched = jobs_fetched
            sync_log.jobs_inserted = jobs_inserted
            sync_log.jobs_updated = jobs_updated
            sync_log.jobs_deactivated = jobs_deactivated
            sync_log.status = "success"
            sync_log.completed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            db.commit()

            return {
                "status": "success",
                "company": company.name,
                "fetched": jobs_fetched,
                "inserted": jobs_inserted,
                "updated": jobs_updated,
                "deactivated": jobs_deactivated
            }

        except Exception as e:
            db.rollback()
            err_msg = str(e)
            company.last_failed_sync = datetime.datetime.now(datetime.timezone.utc).isoformat()
            sync_log.status = "failed"
            sync_log.error_message = err_msg
            sync_log.completed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            try:
                db.commit()
            except Exception:
                pass
            return {
                "status": "failed",
                "company": company.name,
                "error": err_msg
            }

    def sync_all_registered_companies(self, db: Session) -> Dict[str, Any]:
        """Iterates through all active employers in the registry and runs synchronization."""
        companies = list_companies(db, active_only=True)
        results = []
        total_inserted = 0
        total_updated = 0
        total_deactivated = 0

        for comp in companies:
            res = self.sync_company(db, comp)
            results.append(res)
            if res.get("status") == "success":
                total_inserted += res.get("inserted", 0)
                total_updated += res.get("updated", 0)
                total_deactivated += res.get("deactivated", 0)

        return {
            "total_companies": len(companies),
            "total_inserted": total_inserted,
            "total_updated": total_updated,
            "total_deactivated": total_deactivated,
            "details": results
        }

    def sync_adzuna_feed(self, db: Session, country: str = "in", query: str = "software engineer") -> Dict[str, Any]:
        """Ingests live listings from licensed Adzuna API if credentials are configured."""
        if not self.adz.app_id or not self.adz.app_key:
            return {"status": "skipped", "message": "Adzuna credentials not configured."}

        start_time = datetime.datetime.now(datetime.timezone.utc)
        sync_log = JobSyncLogModel(
            id=f"sync_adz_{uuid.uuid4().hex[:12]}",
            source_name="adzuna",
            company_id=None,
            started_at=start_time.isoformat(),
            status="running"
        )
        db.add(sync_log)
        db.commit()

        try:
            raw_jobs = self.adz.fetch_jobs(country=country, page=1, query=query)
            jobs_inserted = 0
            jobs_updated = 0
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

            for raw in raw_jobs:
                norm = self.adz.normalize_job(raw)
                existing = db.query(JobListingModel).filter(
                    JobListingModel.source_name == "adzuna",
                    JobListingModel.external_job_id == norm["external_job_id"]
                ).first()

                if existing:
                    existing.job_title = norm["job_title"]
                    existing.description = norm["description"]
                    existing.location = norm["location"]
                    existing.salary_formatted = norm["salary_formatted"]
                    existing.last_seen_at = now_iso
                    existing.updated_at = now_iso
                    jobs_updated += 1
                else:
                    new_job = JobListingModel(**norm)
                    db.add(new_job)
                    jobs_inserted += 1

            sync_log.jobs_fetched = len(raw_jobs)
            sync_log.jobs_inserted = jobs_inserted
            sync_log.jobs_updated = jobs_updated
            sync_log.status = "success"
            sync_log.completed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            db.commit()

            return {
                "status": "success",
                "fetched": len(raw_jobs),
                "inserted": jobs_inserted,
                "updated": jobs_updated
            }
        except Exception as e:
            db.rollback()
            sync_log.status = "failed"
            sync_log.error_message = str(e)
            sync_log.completed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            try:
                db.commit()
            except Exception:
                pass
            return {"status": "failed", "error": str(e)}

    def sync_remotive_feed(self, db: Session, limit: int = 100, category: Optional[str] = None) -> Dict[str, Any]:
        """Ingests live remote listings from Remotive public API."""
        start_time = datetime.datetime.now(datetime.timezone.utc)
        sync_log = JobSyncLogModel(
            id=f"sync_rem_{uuid.uuid4().hex[:12]}",
            source_name="remotive",
            company_id=None,
            started_at=start_time.isoformat(),
            status="running"
        )
        db.add(sync_log)
        db.commit()

        try:
            raw_jobs = self.remotive.fetch_jobs(limit=limit, category=category)
            jobs_inserted = 0
            jobs_updated = 0
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

            for raw in raw_jobs:
                norm = self.remotive.normalize_job(raw)
                existing = db.query(JobListingModel).filter(
                    JobListingModel.source_name == "remotive",
                    JobListingModel.external_job_id == norm["external_job_id"]
                ).first()

                if existing:
                    existing.job_title = norm["job_title"]
                    existing.description = norm["description"]
                    existing.location = norm["location"]
                    existing.salary_formatted = norm["salary_formatted"]
                    existing.last_seen_at = now_iso
                    existing.updated_at = now_iso
                    jobs_updated += 1
                else:
                    new_job = JobListingModel(**norm)
                    db.add(new_job)
                    jobs_inserted += 1

            sync_log.jobs_fetched = len(raw_jobs)
            sync_log.jobs_inserted = jobs_inserted
            sync_log.jobs_updated = jobs_updated
            sync_log.status = "success"
            sync_log.completed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            db.commit()

            return {
                "status": "success",
                "fetched": len(raw_jobs),
                "inserted": jobs_inserted,
                "updated": jobs_updated
            }
        except Exception as e:
            db.rollback()
            sync_log.status = "failed"
            sync_log.error_message = str(e)
            sync_log.completed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            try:
                db.commit()
            except Exception:
                pass
            return {"status": "failed", "error": str(e)}

    def sync_arbeitnow_feed(self, db: Session, pages: int = 1) -> Dict[str, Any]:
        """Ingests listings from Arbeitnow public Job Board API."""
        start_time = datetime.datetime.now(datetime.timezone.utc)
        sync_log = JobSyncLogModel(
            id=f"sync_arb_{uuid.uuid4().hex[:12]}",
            source_name="arbeitnow",
            company_id=None,
            started_at=start_time.isoformat(),
            status="running"
        )
        db.add(sync_log)
        db.commit()

        try:
            total_fetched = 0
            jobs_inserted = 0
            jobs_updated = 0
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

            for p in range(1, pages + 1):
                raw_jobs = self.arbeitnow.fetch_jobs(page=p)
                total_fetched += len(raw_jobs)
                if not raw_jobs:
                    break

                for raw in raw_jobs:
                    norm = self.arbeitnow.normalize_job(raw)
                    existing = db.query(JobListingModel).filter(
                        JobListingModel.source_name == "arbeitnow",
                        JobListingModel.external_job_id == norm["external_job_id"]
                    ).first()

                    if existing:
                        existing.job_title = norm["job_title"]
                        existing.description = norm["description"]
                        existing.location = norm["location"]
                        existing.salary_formatted = norm["salary_formatted"]
                        existing.last_seen_at = now_iso
                        existing.updated_at = now_iso
                        jobs_updated += 1
                    else:
                        new_job = JobListingModel(**norm)
                        db.add(new_job)
                        jobs_inserted += 1

            sync_log.jobs_fetched = total_fetched
            sync_log.jobs_inserted = jobs_inserted
            sync_log.jobs_updated = jobs_updated
            sync_log.status = "success"
            sync_log.completed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            db.commit()

            return {
                "status": "success",
                "fetched": total_fetched,
                "inserted": jobs_inserted,
                "updated": jobs_updated
            }
        except Exception as e:
            db.rollback()
            sync_log.status = "failed"
            sync_log.error_message = str(e)
            sync_log.completed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            try:
                db.commit()
            except Exception:
                pass
            return {"status": "failed", "error": str(e)}

    def sync_jobicy_feed(self, db: Session, count: int = 50, geo: Optional[str] = None) -> Dict[str, Any]:
        """Ingests listings from Jobicy public Remote Jobs API."""
        start_time = datetime.datetime.now(datetime.timezone.utc)
        sync_log = JobSyncLogModel(
            id=f"sync_jbc_{uuid.uuid4().hex[:12]}",
            source_name="jobicy",
            company_id=None,
            started_at=start_time.isoformat(),
            status="running"
        )
        db.add(sync_log)
        db.commit()

        try:
            raw_jobs = self.jobicy.fetch_jobs(count=count, geo=geo)
            jobs_inserted = 0
            jobs_updated = 0
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

            for raw in raw_jobs:
                norm = self.jobicy.normalize_job(raw)
                existing = db.query(JobListingModel).filter(
                    JobListingModel.source_name == "jobicy",
                    JobListingModel.external_job_id == norm["external_job_id"]
                ).first()

                if existing:
                    existing.job_title = norm["job_title"]
                    existing.description = norm["description"]
                    existing.location = norm["location"]
                    existing.salary_formatted = norm["salary_formatted"]
                    existing.last_seen_at = now_iso
                    existing.updated_at = now_iso
                    jobs_updated += 1
                else:
                    new_job = JobListingModel(**norm)
                    db.add(new_job)
                    jobs_inserted += 1

            sync_log.jobs_fetched = len(raw_jobs)
            sync_log.jobs_inserted = jobs_inserted
            sync_log.jobs_updated = jobs_updated
            sync_log.status = "success"
            sync_log.completed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            db.commit()

            return {
                "status": "success",
                "fetched": len(raw_jobs),
                "inserted": jobs_inserted,
                "updated": jobs_updated
            }
        except Exception as e:
            db.rollback()
            sync_log.status = "failed"
            sync_log.error_message = str(e)
            sync_log.completed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            try:
                db.commit()
            except Exception:
                pass
            return {"status": "failed", "error": str(e)}

    def verify_job_status(self, db: Session, job_id: str) -> Dict[str, Any]:
        """Checks whether the external application URL is active and logs the result."""
        job = db.query(JobListingModel).filter(JobListingModel.id == job_id).first()
        if not job:
            return {"status": "error", "message": "Job not found"}

        connector = self._get_connector_for_provider(job.source_name) or self.gh
        is_active, status_code, note = connector.verify_job_url(job.application_url)

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        job.last_verified_at = now_iso
        if not is_active:
            if status_code in (404, 410):
                job.is_active = False
                job.verification_status = "expired"
            else:
                job.verification_status = "temporarily_unavailable"
        else:
            job.is_active = True
            job.verification_status = "verified"

        # Log verification
        ver_log = JobVerificationLogModel(
            id=f"ver_{uuid.uuid4().hex[:12]}",
            job_id=job.id,
            verified_at=now_iso,
            http_status=status_code,
            verification_status=job.verification_status,
            notes=note
        )
        db.add(ver_log)
        db.commit()

        return {
            "job_id": job.id,
            "is_active": job.is_active,
            "verification_status": job.verification_status,
            "http_status": status_code,
            "notes": note,
            "last_verified_at": now_iso
        }

    def calculate_resume_job_match(
        self,
        resume_doc: Dict[str, Any],
        job: JobListingModel,
        profile_record: Optional[Dict[str, Any]] = None,
        preferences_record: Optional[Dict[str, Any]] = None,
        target_role: Optional[str] = None,
        ledger: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        Calculates genuine, multi-dimensional evidence-grounded compatibility
        between candidate resume/profile and the job listing across:
        1. Professional role compatibility (title, past roles, target role)
        2. Skill compatibility (required, preferred, tech stack)
        3. Experience compatibility (years of experience, seniority mismatch)
        4. Education compatibility (qualifications, degrees)
        5. Candidate preferences (workplace mode, location)
        """
        # Quality check: Verify sufficient job description evidence
        job_desc = (job.description or "").strip()
        if len(job_desc) < 25 and not (job.required_skills or job.preferred_skills):
            return {
                "status": "insufficient_evidence",
                "message": "Insufficient job details to calculate a verified fit score.",
                "match_percentage": None,
                "match_strength": "Insufficient Evidence",
                "matched_skills": [],
                "missing_required_skills": job.required_skills or [],
                "missing_preferred_skills": job.preferred_skills or [],
                "role_compatibility": {"score": 0, "status": "insufficient_evidence", "label": "Insufficient Evidence"},
                "experience_compatibility": {"score": 0, "status": "insufficient_evidence", "label": "Insufficient Evidence"},
                "education_compatibility": {"score": 0, "status": "insufficient_evidence", "label": "Insufficient Evidence"},
                "location_compatibility": {"score": 0, "status": "insufficient_evidence", "label": "Insufficient Evidence"},
                "seniority_mismatch": False,
                "total_candidate_skills": 0,
                "explanation": "The posting contains insufficient requirement details for a reliable compatibility score.",
                "recommendation": "Review the direct employer posting for full details."
            }

        if ledger is None:
            ledger = build_evidence_ledger(user_id="user_temp", resume_record={"document": resume_doc}, profile_record=profile_record)

        
        # Skill normalization map
        CANONICAL_SKILL_MAP = {
            "postgres": "postgresql", "postgresql": "postgresql",
            "react.js": "react", "reactjs": "react", "react": "react",
            "k8s": "kubernetes", "kubernetes": "kubernetes",
            "golang": "go", "go": "go",
            "node": "node.js", "nodejs": "node.js", "node.js": "node.js",
            "ts": "typescript", "typescript": "typescript",
            "js": "javascript", "javascript": "javascript",
            "py": "python", "python": "python",
            "fastapi": "fastapi", "django": "django", "flask": "flask",
            "aws": "aws", "gcp": "gcp", "azure": "azure",
            "docker": "docker", "git": "git", "linux": "linux",
            "pytorch": "pytorch", "tensorflow": "tensorflow",
            "nextjs": "next.js", "next.js": "next.js"
        }

        def norm_skill(s: str) -> str:
            raw = s.lower().strip(" .-_")
            return CANONICAL_SKILL_MAP.get(raw, raw)

        candidate_skills_set = {norm_skill(s) for s in ledger.skills}
        candidate_skills_raw = {s.lower().strip(): s for s in ledger.skills}

        # -------------------------------------------------------------
        # 1. Professional Role Compatibility (Weight: 30%)
        # -------------------------------------------------------------
        candidate_title = (ledger.candidate_title or target_role or "").lower()
        if not candidate_title and resume_doc.get("header", {}).get("title"):
            candidate_title = resume_doc["header"]["title"].lower()

        # Extract all previous roles from experience section
        experience_roles = []
        for sec in resume_doc.get("sections", []):
            if sec.get("type") in ("experience", "work") or "experience" in sec.get("title", "").lower():
                for blk in sec.get("blocks", []):
                    r_text = blk.get("role") or blk.get("title") or ""
                    if r_text:
                        experience_roles.append(r_text.lower())
                for item in sec.get("items", []):
                    r_text = item.get("title") or ""
                    if r_text:
                        experience_roles.append(r_text.lower())

        all_candidate_roles = [candidate_title] + experience_roles
        if target_role:
            all_candidate_roles.append(target_role.lower())
        all_candidate_roles_text = " ".join(all_candidate_roles)

        job_title_lower = (job.job_title or "").lower()

        ROLE_TAXONOMIES = {
            "software": ["software", "full-stack", "full stack", "fullstack", "backend", "frontend", "front-end", "web", "systems", "platform", "core", "api", "developer", "engineer"],
            "ai_data": ["ai", "machine learning", "ml", "deep learning", "data scientist", "data engineer", "data analyst", "nlp", "computer vision", "llm", "neural", "applied ai", "codex"],
            "cloud_devops": ["devops", "cloud", "infrastructure", "sre", "reliability", "platform engineer", "systems administrator", "kubernetes"],
            "mobile": ["ios", "android", "mobile", "flutter", "swift", "react native"],
            "sales_business": ["account executive", "sales", "enterprise sales", "account director", "business development", "bdr", "sdr", "customer success", "sales director", "commercial"],
            "product": ["product manager", "pm", "product owner", "technical product manager"],
            "management": ["engineering manager", "director of engineering", "vp of engineering", "cto", "lead engineer", "architect"]
        }

        def detect_domain(text: str) -> str:
            for domain, kw_list in ROLE_TAXONOMIES.items():
                if any(kw in text for kw in kw_list):
                    return domain
            return "general"

        job_domain = detect_domain(job_title_lower)
        cand_domain = detect_domain(all_candidate_roles_text)

        # Token overlap for title
        job_tokens = set(re.findall(r'\b[a-z]{3,}\b', job_title_lower)) - {"and", "for", "the", "with"}
        cand_tokens = set(re.findall(r'\b[a-z]{3,}\b', all_candidate_roles_text)) - {"and", "for", "the", "with"}
        common_tokens = job_tokens & cand_tokens
        token_overlap_ratio = len(common_tokens) / max(1, len(job_tokens))

        if job_domain == cand_domain or (job_domain in ("software", "cloud_devops", "ai_data") and cand_domain in ("software", "cloud_devops", "ai_data")):
            role_score = min(100, int(75 + (token_overlap_ratio * 25)))
            role_status = "aligned"
            role_label = f"High alignment with {job.job_title}"
        elif job_domain == "sales_business" and cand_domain != "sales_business":
            # Engineering candidate vs. Sales role
            role_score = max(5, int(token_overlap_ratio * 30))
            role_status = "unrelated"
            role_label = "Unrelated role domain: Sales / Account Executive role vs Engineering candidate profile"
        elif cand_domain == "sales_business" and job_domain != "sales_business":
            role_score = max(5, int(token_overlap_ratio * 30))
            role_status = "unrelated"
            role_label = "Role domain mismatch"
        else:
            role_score = min(70, max(20, int(token_overlap_ratio * 70)))
            role_status = "moderate"
            role_label = "Moderate role alignment"

        # -------------------------------------------------------------
        # 2. Skill Compatibility (Weight: 40%)
        # -------------------------------------------------------------
        req_skills = job.required_skills or []
        pref_skills = job.preferred_skills or []

        # If job lacks explicit skill lists, infer from description
        from api.jobs_engine.normalizer import extract_skills
        if not req_skills and job.description:
            extracted = extract_skills(job.description)
            req_skills = extracted[:6]
            pref_skills = extracted[6:10]

        matched_req = []
        missing_req = []
        for s in req_skills:
            ns = norm_skill(s)
            if ns in candidate_skills_set or any(ns in cs for cs in candidate_skills_set):
                matched_req.append(s)
            else:
                missing_req.append(s)

        matched_pref = []
        missing_pref = []
        for s in pref_skills:
            ns = norm_skill(s)
            if ns in candidate_skills_set or any(ns in cs for cs in candidate_skills_set):
                matched_pref.append(s)
            else:
                missing_pref.append(s)

        total_req = len(req_skills) or 1
        req_ratio = len(matched_req) / total_req
        total_pref = len(pref_skills) or 1
        pref_ratio = len(matched_pref) / total_pref if pref_skills else 1.0

        tech_bonus = min(15, len(matched_req) * 3)
        skill_score = min(100, int((req_ratio * 70) + (pref_ratio * 15) + tech_bonus))


        # -------------------------------------------------------------
        # 3. Experience & Seniority Compatibility (Weight: 15%)
        # -------------------------------------------------------------
        job_exp_level = (job.experience_level or "mid").lower()

        # Assess candidate seniority from title and experience
        is_senior_cand = any(w in all_candidate_roles_text for w in ["senior", "sr.", "staff", "principal", "lead", "architect", "head", "director"])
        is_junior_cand = any(w in all_candidate_roles_text for w in ["intern", "student", "trainee", "fresher", "junior", "associate"]) and not is_senior_cand
        num_exp_roles = len(experience_roles)

        seniority_mismatch = False
        mismatch_note = ""

        if job_exp_level in ("internship", "fresher"):
            if is_senior_cand or num_exp_roles >= 3:
                seniority_mismatch = True
                mismatch_note = "Candidate background is senior/established; job is designed for interns or freshers."
                exp_score = 45
            else:
                exp_score = 95
        elif job_exp_level in ("senior", "lead"):
            if is_junior_cand or (num_exp_roles <= 1 and not is_senior_cand):
                seniority_mismatch = True
                mismatch_note = "Job requires senior leadership experience; candidate profile indicates junior or entry-level."
                exp_score = 40
            elif is_senior_cand:
                exp_score = 98
            else:
                exp_score = 75
        elif job_exp_level in ("0-2 yrs",):
            if is_senior_cand:
                exp_score = 65
            else:
                exp_score = 95
        else: # mid
            exp_score = 90 if not is_junior_cand else 60

        # -------------------------------------------------------------
        # 4. Education Compatibility (Weight: 5%)
        # -------------------------------------------------------------
        edu_score = 90

        # -------------------------------------------------------------
        # 5. Candidate Preferences & Location Compatibility (Weight: 10%)
        # -------------------------------------------------------------
        cand_loc = (resume_doc.get("header", {}).get("location") or (profile_record or {}).get("location") or "").lower()
        job_loc = (job.location or "").lower()
        job_country = (job.country or "").lower()
        is_remote_job = job.workplace_type == "remote"

        if is_remote_job:
            pref_score = 100
            loc_label = "Remote vacancy — 100% workplace compatibility"
        elif cand_loc and (cand_loc in job_loc or job_loc in cand_loc or (job_country and job_country in cand_loc)):
            pref_score = 95
            loc_label = f"Location matched ({job.location})"
        else:
            pref_score = 65
            loc_label = f"On-site/Hybrid in {job.location}"

        # -------------------------------------------------------------
        # Final Composite Calculation
        # -------------------------------------------------------------
        composite = int(round(
            (role_score * 0.30) +
            (skill_score * 0.40) +
            (exp_score * 0.15) +
            (edu_score * 0.05) +
            (pref_score * 0.10)
        ))

        # Outstanding match boost when 100% required skills match and role is aligned
        if len(missing_req) == 0 and role_status == "aligned":
            composite = max(80, composite)

        # Severe penalty for completely unrelated roles (e.g. Sales Account Executive for Engineer)
        if role_status == "unrelated":
            composite = min(35, composite)

        final_match = max(10, min(98, composite))

        # Determine Match Strength
        if final_match >= 80:
            match_strength = "Strong Match"
        elif final_match >= 65:
            match_strength = "Good Match"
        elif final_match >= 50:
            match_strength = "Moderate Match"
        else:
            match_strength = "Low Match"

        # Build constructive factual explanation
        if len(missing_req) == 0 and role_status == "aligned":
            explanation = f"Outstanding match! Your verified resume explicitly demonstrates all {len(matched_req)} core required technical skills for this role."
            recommendation = "Strongly recommended: your background is highly aligned with this vacancy."
        elif len(matched_req) >= len(missing_req) and role_status == "aligned":
            explanation = f"Competitive match ({match_strength}): verified proficiency in {', '.join(matched_req[:3])}. Missing documented evidence for: {', '.join(missing_req[:2]) if missing_req else 'advanced preferred frameworks'}."
            recommendation = "Consider tailoring your resume to highlight exposure to any unlisted competencies."
        elif role_status == "unrelated":
            explanation = f"Low match ({final_match}%): Role domain mismatch between candidate's technical profile and {job.job_title} ({job_domain.replace('_', ' ').title()})."
            recommendation = "Focus on software engineering, data, and platform openings aligned with your experience."
        else:
            explanation = f"Partial match ({final_match}%): verified experience covers {', '.join(matched_req[:2]) if matched_req else 'general software foundations'}. Major skill gaps detected in {', '.join(missing_req[:3]) if missing_req else 'specialized tools'}."
            recommendation = "Review the required competencies before applying."

        return {
            "match_percentage": final_match,
            "match_strength": match_strength,
            "matched_skills": matched_req + matched_pref,
            "missing_required_skills": missing_req,
            "missing_preferred_skills": missing_pref,
            "role_compatibility": {
                "score": role_score,
                "status": role_status,
                "label": role_label
            },
            "experience_compatibility": {
                "score": exp_score,
                "level": job_exp_level,
                "label": mismatch_note or f"Experience aligned ({job_exp_level.capitalize()})"
            },
            "education_compatibility": {
                "score": edu_score,
                "label": "Degree / Practical Experience Aligned"
            },
            "location_compatibility": {
                "score": pref_score,
                "label": loc_label
            },
            "seniority_mismatch": seniority_mismatch,
            "total_candidate_skills": len(candidate_skills_set),
            "explanation": explanation,
            "recommendation": recommendation
        }


# Global singleton
job_discovery_service = JobDiscoveryService()
