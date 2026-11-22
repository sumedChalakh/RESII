import hashlib
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

class ArbeitnowConnector(BaseJobConnector):
    """
    Connector for the official public Arbeitnow Job Board API.
    Documentation: https://www.arbeitnow.com/blog/job-board-api
    Endpoint: https://www.arbeitnow.com/api/job-board-api
    Returns 100-300 job listings per page with pagination support.
    """

    BASE_URL = "https://www.arbeitnow.com/api/job-board-api"

    def fetch_jobs(self, board_token: str = "", **kwargs) -> List[Dict[str, Any]]:
        """
        Fetches listings from Arbeitnow API.
        Supports pagination via page parameter.
        """
        page = kwargs.get("page", 1)
        resp = self._safe_get(self.BASE_URL, params={"page": page})
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", []) if isinstance(data, dict) else []

    def normalize_job(self, raw: Dict[str, Any], company_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Normalizes Arbeitnow job JSON into RESII JobListing schema."""
        slug = str(raw.get("slug", ""))
        title = raw.get("title", "").strip()
        comp_name = raw.get("company_name", "Employer").strip()
        app_url = raw.get("url") or f"https://www.arbeitnow.com/jobs/{slug}"

        raw_desc = raw.get("description", "")
        clean_desc = strip_html(raw_desc)

        is_remote = bool(raw.get("remote", False))
        location_raw = raw.get("location") or ("Remote" if is_remote else "Global")
        loc_lower = location_raw.lower()

        # Determine country and city
        country = "Global"
        city = None
        for in_city in ["bengaluru", "bangalore", "pune", "hyderabad", "mumbai", "delhi", "noida", "gurgaon", "chennai"]:
            if in_city in loc_lower:
                country = "India"
                city = in_city.title()
                break

        if country != "India":
            if "germany" in loc_lower or "berlin" in loc_lower or "munich" in loc_lower:
                country = "Germany"
            elif "uk" in loc_lower or "london" in loc_lower:
                country = "United Kingdom"
            elif "usa" in loc_lower or "united states" in loc_lower:
                country = "United States"

        if is_remote:
            workplace_type = "remote"
        else:
            workplace_type = infer_workplace_type(title, location_raw, clean_desc)

        job_types = raw.get("job_types") or []
        emp_raw = job_types[0] if job_types else "full_time"
        employment_type = infer_employment_type(emp_raw, clean_desc)
        experience_level = infer_experience_level(title, clean_desc)

        s_min, s_max, s_curr, s_formatted = parse_salary(None, None, "EUR" if country in ["Germany", "Europe"] else "USD", clean_desc)

        tags = raw.get("tags") or []
        skills_text = f"{title} {' '.join(tags)} {clean_desc[:1000]}"
        skills = extract_skills(skills_text)

        created_epoch = raw.get("created_at")
        if created_epoch and isinstance(created_epoch, (int, float)):
            posted_at = datetime.datetime.fromtimestamp(created_epoch, tz=datetime.timezone.utc).isoformat()
        else:
            posted_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        slug_hash = hashlib.sha256(slug.encode("utf-8")).hexdigest()[:16]

        return {
            "id": f"job_arb_{slug_hash}",
            "external_job_id": slug,
            "company_id": None,
            "company_name": comp_name,
            "company_website": None,
            "source_name": "arbeitnow",
            "source_job_url": app_url,
            "job_title": title,
            "department": tags[0] if tags else None,
            "description": clean_desc,
            "location": location_raw,
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
