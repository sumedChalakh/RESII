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

class RemotiveConnector(BaseJobConnector):
    """
    Connector for the official public Remotive Remote Jobs API.
    Documentation: https://remotive.com/remote-jobs/api
    Endpoint: https://remotive.com/api/remote-jobs
    Free public access for remote tech opportunities.
    """

    BASE_URL = "https://remotive.com/api/remote-jobs"

    def fetch_jobs(self, board_token: str = "", **kwargs) -> List[Dict[str, Any]]:
        """
        Fetches remote listings from Remotive API.
        Optional kwargs: limit, category, search.
        """
        params = {}
        if "limit" in kwargs and kwargs["limit"]:
            params["limit"] = kwargs["limit"]
        if "category" in kwargs and kwargs["category"]:
            params["category"] = kwargs["category"]
        if "search" in kwargs and kwargs["search"]:
            params["search"] = kwargs["search"]

        resp = self._safe_get(self.BASE_URL, params=params if params else None)
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        data = resp.json()
        return data.get("jobs", []) if isinstance(data, dict) else []

    def normalize_job(self, raw: Dict[str, Any], company_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Normalizes Remotive job item into RESII JobListing schema."""
        raw_id = str(raw.get("id", ""))
        title = raw.get("title", "").strip()
        comp_name = raw.get("company_name", "Employer").strip()
        app_url = raw.get("url") or f"https://remotive.com/remote-jobs/{raw_id}"

        raw_desc = raw.get("description", "")
        clean_desc = strip_html(raw_desc)

        candidate_loc = raw.get("candidate_required_location") or "Worldwide / Remote"
        loc_lower = candidate_loc.lower()

        # Determine country
        if "india" in loc_lower:
            country = "India"
        elif any(us_loc in loc_lower for us_loc in ["usa", "united states", "us only"]):
            country = "United States"
        elif any(eu_loc in loc_lower for eu_loc in ["europe", "uk", "germany"]):
            country = "Europe"
        else:
            country = "Global"

        workplace_type = "remote"
        job_type_raw = raw.get("job_type") or "full_time"
        employment_type = infer_employment_type(job_type_raw, clean_desc)
        experience_level = infer_experience_level(title, clean_desc)

        # Parse salary if provided
        salary_text = raw.get("salary")
        s_min, s_max, s_curr, s_formatted = parse_salary(None, None, "USD", f"{salary_text or ''} {clean_desc}")

        # Extract skills and tags
        tags = raw.get("tags") or []
        skills_text = f"{title} {' '.join(tags)} {clean_desc[:1000]}"
        skills = extract_skills(skills_text)

        posted_at = raw.get("publication_date")
        if not posted_at:
            posted_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        return {
            "id": f"job_rem_{raw_id}",
            "external_job_id": raw_id,
            "company_id": None,
            "company_name": comp_name,
            "company_website": None,
            "source_name": "remotive",
            "source_job_url": app_url,
            "job_title": title,
            "department": raw.get("category"),
            "description": clean_desc,
            "location": candidate_loc,
            "city": None,
            "country": country,
            "workplace_type": workplace_type,
            "employment_type": employment_type,
            "experience_level": experience_level,
            "salary_min": s_min,
            "salary_max": s_max,
            "salary_currency": s_curr,
            "salary_formatted": s_formatted or salary_text,
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
