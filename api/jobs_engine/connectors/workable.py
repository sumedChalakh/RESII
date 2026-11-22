from typing import Dict, Any, List, Optional
import datetime
from api.jobs_engine.connectors.base import BaseJobConnector
from api.jobs_engine.normalizer import (
    strip_html,
    extract_skills,
    infer_workplace_type,
    infer_experience_level,
    infer_employment_type,
    parse_salary
)

class WorkableConnector(BaseJobConnector):
    """
    Connector for Workable Public Career Boards.
    Official Documentation: https://workable.readme.io/reference/jobs
    
    Technical & Access Limitation:
    The official developer REST API requires an employer API token (Authorization: Bearer <key>).
    Public unauthenticated listings are hosted per account via widget endpoints:
      https://apply.workable.com/api/v1/widget/accounts/{subdomain}
    Modern Workable accounts have widget endpoints disabled by default (returning 404 or empty jobs: []),
    and Workable careers portal v3 requires authenticated CSRF tokens.
    This connector queries available public accounts and safely returns legitimate postings where open.
    """

    BASE_URL = "https://apply.workable.com/api/v1/widget/accounts"

    def fetch_jobs(self, board_token: str, **kwargs) -> List[Dict[str, Any]]:
        """
        Attempts to fetch public job openings for a Workable account subdomain.
        Returns empty list if account is private, requires authentication, or has widgets disabled.
        """
        subdomain = board_token.strip().lower()
        if not subdomain:
            return []

        url = f"{self.BASE_URL}/{subdomain}"
        resp = self._safe_get(url)
        if resp.status_code in (401, 403, 404):
            return []
        resp.raise_for_status()
        data = resp.json()
        return data.get("jobs", []) if isinstance(data, dict) else []

    def normalize_job(self, raw: Dict[str, Any], company_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Normalizes Workable job JSON into RESII JobListing schema."""
        meta = company_meta or {}
        comp_name = meta.get("name", "Employer")
        comp_id = meta.get("id")
        comp_website = meta.get("website_url")
        default_country = meta.get("country", "India")
        subdomain = meta.get("ats_board_token") or "workable"

        raw_id = str(raw.get("shortcode") or raw.get("id", ""))
        title = raw.get("title", "").strip()
        raw_desc = raw.get("description", "")
        clean_desc = strip_html(raw_desc)

        city = raw.get("city")
        country_code = (raw.get("country") or "").lower()
        location_name = city or raw.get("country") or "Remote"

        country = "India" if country_code in ["in", "india"] else ("United States" if country_code in ["us", "usa"] else default_country)
        workplace_type = "remote" if raw.get("telecommuting") else infer_workplace_type(title, location_name, clean_desc)

        emp_raw = raw.get("employment_type") or "full_time"
        employment_type = infer_employment_type(emp_raw, clean_desc)
        experience_level = infer_experience_level(f"{title} {raw.get('experience', '')}", clean_desc)

        s_min, s_max, s_curr, s_formatted = parse_salary(None, None, "USD", clean_desc)
        skills = extract_skills(f"{title} {clean_desc}")

        posted_at = raw.get("published_on") or raw.get("created_at")
        if not posted_at:
            posted_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

        app_url = raw.get("url") or f"https://apply.workable.com/{subdomain}/j/{raw_id}/"

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        return {
            "id": f"job_wrk_{subdomain[:12]}_{raw_id[:16]}",
            "external_job_id": raw_id,
            "company_id": comp_id,
            "company_name": comp_name,
            "company_website": comp_website,
            "source_name": "workable",
            "source_job_url": app_url,
            "job_title": title,
            "department": raw.get("department"),
            "description": clean_desc,
            "location": location_name,
            "city": city,
            "country": country,
            "workplace_type": workplace_type,
            "employment_type": employment_type,
            "experience_level": experience_level,
            "salary_min": s_min,
            "salary_max": s_max,
            "salary_currency": s_curr,
            "salary_formatted": s_formatted,
            "required_skills": skills[:6] if skills else ["Software Engineering"],
            "preferred_skills": skills[6:12] if len(skills) > 6 else [],
            "posted_at": posted_at,
            "expires_at": None,
            "application_url": app_url,
            "is_active": True,
            "verification_status": "unverified",
            "first_seen_at": now_iso,
            "last_seen_at": now_iso,
            "last_verified_at": now_iso,
            "created_at": now_iso,
            "updated_at": now_iso
        }
