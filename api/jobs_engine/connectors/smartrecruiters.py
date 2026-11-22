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

class SmartRecruitersConnector(BaseJobConnector):
    """
    Connector for the official public SmartRecruiters Job Posting API.
    Endpoint: https://api.smartrecruiters.com/v1/companies/{company_identifier}/postings
    Free, unauthenticated, official public access.
    """

    BASE_URL = "https://api.smartrecruiters.com/v1/companies"

    def fetch_jobs(self, board_token: str, **kwargs) -> List[Dict[str, Any]]:
        """
        Fetches public job postings for a given company identifier.
        Supports pagination via offset and limit.
        """
        token = board_token.strip()
        url = f"{self.BASE_URL}/{token}/postings"
        limit = kwargs.get("limit", 100)
        offset = kwargs.get("offset", 0)

        all_postings = []
        # Support fetching first page or bounded multi-page
        max_pages = kwargs.get("max_pages", 3)

        for page in range(max_pages):
            params = {"offset": offset + (page * limit), "limit": limit}
            resp = self._safe_get(url, params=params)
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            data = resp.json()
            postings = data.get("content", [])
            if not postings:
                break
            all_postings.extend(postings)
            total_found = data.get("totalFound", 0)
            if len(all_postings) >= total_found or len(postings) < limit:
                break

        return all_postings

    def normalize_job(self, raw: Dict[str, Any], company_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Normalizes SmartRecruiters posting JSON into RESII JobListing schema."""
        meta = company_meta or {}
        comp_name = meta.get("name") or raw.get("company", {}).get("name", "Employer")
        comp_id = meta.get("id")
        comp_website = meta.get("website_url")
        default_country = meta.get("country", "India")
        board_token = meta.get("ats_board_token") or raw.get("company", {}).get("identifier", "company")

        raw_id = str(raw.get("id", ""))
        title = raw.get("name", "").strip()

        # Location details
        loc_data = raw.get("location", {})
        city = loc_data.get("city")
        country_code = (loc_data.get("country") or "").lower()
        full_location = loc_data.get("fullLocation") or city or "Remote"

        # Map country
        country = "India" if country_code == "in" else ("United States" if country_code == "us" else ("Global" if not country_code else country_code.upper()))
        if default_country == "India" and (country_code == "in" or "india" in full_location.lower()):
            country = "India"

        # Workplace type
        is_remote = bool(loc_data.get("remote", False))
        is_hybrid = bool(loc_data.get("hybrid", False))
        if is_remote:
            workplace_type = "remote"
        elif is_hybrid:
            workplace_type = "hybrid"
        else:
            workplace_type = infer_workplace_type(title, full_location, "")

        # Employment type
        emp_type_raw = raw.get("typeOfEmployment", {}).get("label") or raw.get("typeOfEmployment", {}).get("id", "")
        employment_type = infer_employment_type(emp_type_raw or title, "")

        # Experience level
        exp_raw = raw.get("experienceLevel", {}).get("label") or raw.get("experienceLevel", {}).get("id", "")
        experience_level = infer_experience_level(f"{title} {exp_raw}", "")

        # Department / Function
        dept = raw.get("department", {}).get("label") or raw.get("function", {}).get("label")

        # Description: SmartRecruiters postings summary has title & function; description may be fetched or synthesized
        clean_desc = f"{title} at {comp_name}. Location: {full_location}. Department: {dept or 'General'}."

        skills = extract_skills(f"{title} {clean_desc} {dept or ''}")

        posted_at = raw.get("releasedDate")
        if not posted_at:
            posted_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # Application URL: direct candidate-facing link
        app_url = f"https://jobs.smartrecruiters.com/{board_token}/{raw_id}"

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        return {
            "id": f"job_sr_{board_token[:12]}_{raw_id[:16]}",
            "external_job_id": raw_id,
            "company_id": comp_id,
            "company_name": comp_name,
            "company_website": comp_website,
            "source_name": "smartrecruiters",
            "source_job_url": raw.get("ref") or app_url,
            "job_title": title,
            "department": dept,
            "description": clean_desc,
            "location": full_location,
            "city": city,
            "country": country,
            "workplace_type": workplace_type,
            "employment_type": employment_type,
            "experience_level": experience_level,
            "salary_min": None,
            "salary_max": None,
            "salary_currency": "INR" if country == "India" else "USD",
            "salary_formatted": None,
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
