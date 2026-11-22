import re
import uuid
import datetime
from typing import Optional, Tuple, List, Dict, Any
from sqlalchemy.orm import Session
from api.models import CompanyRegistryModel
from api.jobs_engine.connectors.base import is_safe_external_url

ATS_PATTERNS = [
    (re.compile(r'boards\.greenhouse\.io/([^/?#]+)', re.I), "greenhouse"),
    (re.compile(r'job-boards\.greenhouse\.io/([^/?#]+)', re.I), "greenhouse"),
    (re.compile(r'jobs\.lever\.co/([^/?#]+)', re.I), "lever"),
    (re.compile(r'jobs\.ashbyhq\.com/([^/?#]+)', re.I), "ashby"),
    (re.compile(r'jobs\.smartrecruiters\.com/([^/?#]+)', re.I), "smartrecruiters"),
    (re.compile(r'smartrecruiters\.com/([^/?#]+)', re.I), "smartrecruiters"),
    (re.compile(r'apply\.workable\.com/([^/?#]+)', re.I), "workable"),
]

def detect_ats_from_career_url(url: str) -> Optional[Tuple[str, str]]:
    """
    Detects ATS provider and board token from a career page URL with SSRF protection.
    Returns (provider, board_token) if recognized, else None.
    """
    if not url:
        return None
    is_safe, _ = is_safe_external_url(url)
    if not is_safe:
        return None

    for pattern, provider in ATS_PATTERNS:
        match = pattern.search(url)
        if match:
            return provider, match.group(1).lower().strip("/")
    return None


def register_company(
    db: Session,
    name: str,
    ats_provider: str,
    ats_board_token: str,
    career_page_url: Optional[str] = None,
    website_url: Optional[str] = None,
    country: str = "India"
) -> CompanyRegistryModel:
    """Idempotently registers or updates an employer in the discovery registry with URL safety validation."""
    if career_page_url:
        is_safe, reason = is_safe_external_url(career_page_url)
        if not is_safe:
            raise ValueError(f"Unsafe career page URL: {reason}")
    if website_url:
        is_safe, reason = is_safe_external_url(website_url)
        if not is_safe:
            raise ValueError(f"Unsafe company website URL: {reason}")

    provider_norm = ats_provider.lower().strip()
    token_norm = ats_board_token.lower().strip()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    existing = db.query(CompanyRegistryModel).filter(
        CompanyRegistryModel.ats_provider == provider_norm,
        CompanyRegistryModel.ats_board_token == token_norm
    ).first()

    if existing:
        existing.name = name
        if career_page_url:
            existing.career_page_url = career_page_url
        if website_url:
            existing.website_url = website_url
        existing.country = country
        existing.updated_at = now_iso
        db.commit()
        db.refresh(existing)
        return existing

    comp_id = f"comp_{provider_norm[:3]}_{token_norm[:20]}_{uuid.uuid4().hex[:4]}"
    new_comp = CompanyRegistryModel(
        id=comp_id,
        name=name,
        career_page_url=career_page_url or f"https://jobs.{provider_norm}.io/{token_norm}",
        ats_provider=provider_norm,
        ats_board_token=token_norm,
        website_url=website_url,
        country=country,
        status="active",
        sync_frequency_hours=24,
        is_active=True,
        created_at=now_iso,
        updated_at=now_iso
    )
    db.add(new_comp)
    db.commit()
    db.refresh(new_comp)
    return new_comp


def list_companies(db: Session, active_only: bool = True) -> List[CompanyRegistryModel]:
    """Returns list of registered employers."""
    q = db.query(CompanyRegistryModel)
    if active_only:
        q = q.filter(CompanyRegistryModel.is_active == True)
    return q.order_by(CompanyRegistryModel.name.asc()).all()
