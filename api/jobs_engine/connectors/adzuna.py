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

class AdzunaConnector(BaseJobConnector):
    """Connector for the licensed Adzuna Job Search API."""

    BASE_URL = "https://api.adzuna.com/v1/api/jobs"

    def __init__(self, app_id: Optional[str] = None, app_key: Optional[str] = None):
        super().__init__()
        self.app_id = app_id
        self.app_key = app_key

    def fetch_jobs(self, country: str = "in", page: int = 1, query: str = "software engineer", **kwargs) -> List[Dict[str, Any]]:
        if not self.app_id or not self.app_key:
            return []

        url = f"{self.BASE_URL}/{country.lower()}/search/{page}"
        params = {
            "app_id": self.app_id,
            "app_key": self.app_key,
            "results_per_page": kwargs.get("results_per_page", 30),
            "what": query,
            "content-type": "application/json"
        }
        resp = self._safe_get(url, params=params)
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        data = resp.json()
        return data.get("results", [])

    def normalize_job(self, raw: Dict[str, Any], company_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        raw_id = str(raw.get("id", ""))
        title = raw.get("title", "").strip()
        title_clean = strip_html(title)

        comp_data = raw.get("company", {})
        comp_name = comp_data.get("display_name", "Employer") if isinstance(comp_data, dict) else str(comp_data)

        raw_desc = raw.get("description", "")
        clean_desc = strip_html(raw_desc)

        loc_data = raw.get("location", {})
        location_name = loc_data.get("display_name", "India") if isinstance(loc_data, dict) else str(loc_data)

        country = "India" if "india" in location_name.lower() else "Global"
        city = None
        for in_city in ["bengaluru", "bangalore", "pune", "hyderabad", "mumbai", "delhi", "noida", "gurgaon", "gurugram", "chennai"]:
            if in_city in location_name.lower():
                country = "India"
                city = in_city.title()
                break

        workplace_type = infer_workplace_type(title_clean, location_name, clean_desc)
        experience_level = infer_experience_level(title_clean, clean_desc)
        employment_type = infer_employment_type(title_clean, clean_desc)
        
        raw_min = raw.get("salary_min")
        raw_max = raw.get("salary_max")
        s_min, s_max, s_curr, s_formatted = parse_salary(raw_min, raw_max, "INR" if country == "India" else "USD", clean_desc)
        skills = extract_skills(f"{title_clean} {clean_desc}")

        posted_at = raw.get("created")
        if not posted_at:
            posted_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

        app_url = raw.get("redirect_url") or f"https://www.adzuna.in/jobs/details/{raw_id}"

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        return {
            "id": f"job_adz_{raw_id}",
            "external_job_id": raw_id,
            "company_id": None,
            "company_name": comp_name,
            "company_website": None,
            "source_name": "adzuna",
            "source_job_url": app_url,
            "job_title": title_clean,
            "department": "Engineering",
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
            "verification_status": "verified",
            "first_seen_at": now_iso,
            "last_seen_at": now_iso,
            "last_verified_at": now_iso,
            "created_at": now_iso,
            "updated_at": now_iso
        }
