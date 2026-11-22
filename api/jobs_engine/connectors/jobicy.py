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

class JobicyConnector(BaseJobConnector):
    """
    Connector for the official public Jobicy Remote Jobs API v2.
    Documentation: https://jobicy.com/jobs-rss-feed
    Endpoint: https://jobicy.com/api/v2/remote-jobs
    Free public API with geo-filtering and industry tags.
    """

    BASE_URL = "https://jobicy.com/api/v2/remote-jobs"

    def fetch_jobs(self, board_token: str = "", **kwargs) -> List[Dict[str, Any]]:
        """
        Fetches remote listings from Jobicy API.
        Optional kwargs: count (default 50), geo (e.g. 'india', 'apac', 'usa'), industry.
        """
        params = {"count": kwargs.get("count", 50)}
        if "geo" in kwargs and kwargs["geo"]:
            params["geo"] = kwargs["geo"]
        if "industry" in kwargs and kwargs["industry"]:
            params["industry"] = kwargs["industry"]

        resp = self._safe_get(self.BASE_URL, params=params)
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        data = resp.json()
        return data.get("jobs", []) if isinstance(data, dict) else []

    def normalize_job(self, raw: Dict[str, Any], company_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Normalizes Jobicy job item into RESII JobListing schema."""
        raw_id = str(raw.get("id", ""))
        title = raw.get("jobTitle", "").strip()
        comp_name = raw.get("companyName", "Employer").strip()
        app_url = raw.get("url") or f"https://jobicy.com/jobs/{raw_id}"

        raw_desc = raw.get("jobDescription") or raw.get("jobExcerpt", "")
        clean_desc = strip_html(raw_desc)

        job_geo = raw.get("jobGeo") or "Anywhere / Remote"
        loc_lower = job_geo.lower()

        # Determine country
        if "india" in loc_lower:
            country = "India"
        elif "usa" in loc_lower or "united states" in loc_lower:
            country = "United States"
        elif "uk" in loc_lower or "europe" in loc_lower:
            country = "Europe"
        else:
            country = "Global"

        workplace_type = "remote"
        job_types = raw.get("jobType") or []
        emp_raw = job_types[0] if isinstance(job_types, list) and job_types else str(job_types)
        employment_type = infer_employment_type(emp_raw or title, clean_desc)

        level_raw = raw.get("jobLevel") or ""
        experience_level = infer_experience_level(f"{title} {level_raw}", clean_desc)

        s_min, s_max, s_curr, s_formatted = parse_salary(None, None, "USD", clean_desc)

        industries = raw.get("jobIndustry") or []
        skills_text = f"{title} {' '.join(industries) if isinstance(industries, list) else industries} {clean_desc[:1000]}"
        skills = extract_skills(skills_text)

        posted_at = raw.get("pubDate")
        if not posted_at:
            posted_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        return {
            "id": f"job_jbc_{raw_id}",
            "external_job_id": raw_id,
            "company_id": None,
            "company_name": comp_name,
            "company_website": None,
            "source_name": "jobicy",
            "source_job_url": app_url,
            "job_title": title,
            "department": industries[0] if isinstance(industries, list) and industries else str(industries),
            "description": clean_desc,
            "location": job_geo,
            "city": None,
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
