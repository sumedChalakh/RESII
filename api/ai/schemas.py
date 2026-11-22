from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field

# -------------------------------------------------------------------------
# Provider Schemas
# -------------------------------------------------------------------------
class ProviderHealthResponse(BaseModel):
    provider: str
    status: Literal["online", "offline", "degraded", "not_configured"]
    latency_ms: Optional[float] = None
    message: str
    models: List[str] = Field(default_factory=list)

class AIProviderConfig(BaseModel):
    provider: Literal["freeflow", "ollama", "gemini", "openai_compatible", "openai", "mock", "openrouter", "huggingface"] = "freeflow"
    model: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    api_key_backup: Optional[str] = None
    temperature: float = Field(default=0.2, ge=0.0, le=1.0)
    timeout_seconds: float = Field(default=30.0, ge=1.0, le=120.0)

# -------------------------------------------------------------------------
# Normalized Candidate Evidence Schemas
# -------------------------------------------------------------------------
class CandidateClaim(BaseModel):
    id: str
    claim_type: Literal["skill", "experience", "education", "project", "achievement", "fact", "summary"]
    text: str
    provenance: Literal["resume_source", "user_confirmed", "profile_source", "accepted_ai_suggestion"]
    source_entity: str
    verified: bool = True
    context: Optional[str] = None

class CandidateEvidenceLedger(BaseModel):
    user_id: str
    candidate_name: str
    candidate_title: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    claims: List[CandidateClaim] = Field(default_factory=list)
    confirmed_facts: Dict[str, Any] = Field(default_factory=dict)
    unverified_gaps: List[str] = Field(default_factory=list)

# -------------------------------------------------------------------------
# Job Description Analysis Schemas
# -------------------------------------------------------------------------
class JobDescriptionAnalysis(BaseModel):
    job_title: str
    company: Optional[str] = None
    required_skills: List[str] = Field(default_factory=list)
    preferred_skills: List[str] = Field(default_factory=list)
    experience_requirements: List[str] = Field(default_factory=list)
    education_requirements: List[str] = Field(default_factory=list)
    responsibilities: List[str] = Field(default_factory=list)
    technology_stack: List[str] = Field(default_factory=list)
    seniority: Optional[str] = None
    location: Optional[str] = None
    work_mode: Optional[Literal["remote", "hybrid", "on-site", "unspecified"]] = "unspecified"
    important_keywords: List[str] = Field(default_factory=list)
    inferred_attributes: Dict[str, str] = Field(default_factory=dict)
    provider_used: Optional[str] = None
    model_used: Optional[str] = None
    fallback_activated: bool = False
    inference_source: Literal["llm", "heuristic", "mock"] = "heuristic"
    fallback_reason: Optional[str] = None

# -------------------------------------------------------------------------
# Resume-to-Job Match Schemas
# -------------------------------------------------------------------------
class RequirementMatch(BaseModel):
    requirement: str
    requirement_type: Literal["required_skill", "preferred_skill", "experience", "education", "responsibility"]
    status: Literal["matched", "partial", "missing"]
    candidate_claim_ids: List[str] = Field(default_factory=list)
    evidence_quote: Optional[str] = None
    explanation: str

class ResumeMatchReport(BaseModel):
    overall_score: int = Field(ge=0, le=100)
    category_scores: Dict[str, int] = Field(
        default_factory=lambda: {
            "required_skills": 0,
            "preferred_skills": 0,
            "experience_depth": 0,
            "technology_alignment": 0,
            "seniority_compatibility": 0
        }
    )
    matched_requirements: List[RequirementMatch] = Field(default_factory=list)
    missing_requirements: List[str] = Field(default_factory=list)
    partially_supported_requirements: List[RequirementMatch] = Field(default_factory=list)
    skill_gaps: List[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.85)
    explanation: str
    provider_used: Optional[str] = None
    model_used: Optional[str] = None
    fallback_activated: bool = False
    inference_source: Literal["llm", "heuristic", "mock"] = "heuristic"
    fallback_reason: Optional[str] = None

# -------------------------------------------------------------------------
# Resume Tailoring Schemas
# -------------------------------------------------------------------------
class TailorSuggestion(BaseModel):
    id: str
    resume_id: str
    section_id: str
    item_id: Optional[str] = None
    line_id: str
    original_text: str
    suggested_text: str
    explanation: str
    evidence_references: List[str] = Field(default_factory=list)
    related_requirement: str
    confidence: float = Field(ge=0.0, le=1.0, default=0.9)
    status: Literal["pending", "accepted", "rejected"] = "pending"

class TailoringPlanResponse(BaseModel):
    review_id: str
    resume_id: str
    job_title: str
    company_name: str
    total_suggestions: int
    suggestions: List[TailorSuggestion]
    match_rate: int
    matched_keywords: List[str]
    missing_keywords: List[str]
    status: str = "pending_review"
    provider_used: Optional[str] = None
    model_used: Optional[str] = None
    fallback_activated: bool = False
    inference_source: Literal["llm", "heuristic", "mock"] = "heuristic"
    fallback_reason: Optional[str] = None

# -------------------------------------------------------------------------
# Candidate Fact Verification Schemas
# -------------------------------------------------------------------------
class FactVerificationResult(BaseModel):
    claim: str
    classification: Literal["supported", "partially_supported", "unsupported", "contradictory", "requires_confirmation"]
    evidence_citations: List[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str

# -------------------------------------------------------------------------
# Cover Letter Schemas
# -------------------------------------------------------------------------
class CoverLetterRequest(BaseModel):
    resume_id: Optional[str] = "primary"
    job_description: str
    job_title: Optional[str] = None
    company_name: Optional[str] = None
    tone: Literal["professional", "enthusiastic", "concise", "technical"] = "professional"
    length: Literal["short", "standard", "detailed"] = "standard"

class CoverLetterResponse(BaseModel):
    id: str
    recipient_company: str
    job_title: str
    tone: str
    length: str
    content: str
    paragraphs: List[str]
    grounded_claims: List[str]
    unverified_omissions: List[str] = Field(default_factory=list)
    created_at: str
    provider_used: Optional[str] = None
    model_used: Optional[str] = None
    fallback_activated: bool = False
    inference_source: Literal["llm", "heuristic", "mock"] = "heuristic"
    fallback_reason: Optional[str] = None
