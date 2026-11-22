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

class AshbyConnector(BaseJobConnector):
    """Connector for the official public Ashby Job Board API."""

    BASE_URL = "https://api.ashbyhq.com/posting-api/job-board"

    def fetch_jobs(self, board_token: str, **kwargs) -> List[Dict[str, Any]]:
        url = f"{self.BASE_URL}/{board_token}"
        resp = self._safe_get(url)
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        data = resp.json()
        return data.get("jobs", []) if isinstance(data, dict) else []

    def normalize_job(self, raw: Dict[str, Any], company_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        meta = company_meta or {}
        comp_name = meta.get("name", "Employer")
        comp_id = meta.get("id")
        comp_website = meta.get("website_url")
        default_country = meta.get("country", "India")

        raw_id = str(raw.get("id", ""))
        title = raw.get("title", "").strip()

        raw_desc = raw.get("descriptionHtml") or raw.get("description", "")
        clean_desc = strip_html(raw_desc)

        location_name = raw.get("location") or "Remote"
        dept_name = raw.get("department")
        emp_type_raw = raw.get("employmentType") or "FullTime"

        # Determine country & city
        loc_lower = location_name.lower()
        country = default_country
        city = None
        for in_city in ["bengaluru", "bangalore", "pune", "hyderabad", "mumbai", "delhi", "noida", "gurgaon", "gurugram", "chennai"]:
            if in_city in loc_lower:
                country = "India"
                city = in_city.title()
                break

        workplace_type = infer_workplace_type(title, location_name, clean_desc)
        experience_level = infer_experience_level(title, clean_desc)
        employment_type = infer_employment_type(emp_type_raw, clean_desc)
        s_min, s_max, s_curr, s_formatted = parse_salary(None, None, "INR" if country == "India" else "USD", clean_desc)
        skills = extract_skills(f"{title} {clean_desc}")

        posted_at = raw.get("publishedAt")
        if not posted_at:
            posted_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

        app_url = raw.get("applyUrl") or raw.get("jobUrl") or f"https://jobs.ashbyhq.com/{meta.get('ats_board_token')}/{raw_id}"

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        return {
            "id": f"job_ash_{meta.get('ats_board_token', 'comp')}_{raw_id[:16]}",
            "external_job_id": raw_id,
            "company_id": comp_id,
            "company_name": comp_name,
            "company_website": comp_website,
            "source_name": "ashby",
            "source_job_url": raw.get("jobUrl") or app_url,
            "job_title": title,
            "department": dept_name,
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
