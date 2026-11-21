import re
from typing import Optional, List, Dict, Any, Type, TypeVar
from pydantic import BaseModel
from api.ai.providers.base import (
    BaseLLMProvider,
    ProviderUnavailableError,
    ProviderTimeoutError,
    InvalidResponseError,
)
from api.ai.schemas import (
    ProviderHealthResponse,
    JobDescriptionAnalysis,
    ResumeMatchReport,
    RequirementMatch,
    TailoringPlanResponse,
    TailorSuggestion,
    FactVerificationResult,
    CoverLetterResponse,
)

T = TypeVar("T", bound=BaseModel)

class MockAIProvider(BaseLLMProvider):
    """
    Deterministic synthetic AI provider for unit testing, offline verification,
    and fallback resilience testing.
    Strictly adheres to evidence grounding: never fabricates metrics, skills, or dates.
    Can be configured to simulate errors (timeout, unavailable, malformed).
    """

    def __init__(
        self,
        simulate_error: Optional[str] = None,
        timeout_seconds: float = 30.0
    ):
        super().__init__(name="mock", timeout_seconds=timeout_seconds)
        self.simulate_error = simulate_error

    def health(self) -> ProviderHealthResponse:
        if self.simulate_error == "unavailable":
            return ProviderHealthResponse(
                provider="mock",
                status="offline",
                message="Simulated mock offline state.",
                models=[]
            )
        return ProviderHealthResponse(
            provider="mock",
            status="online",
            latency_ms=1.5,
            message="Deterministic mock provider active.",
            models=["mock-grounded-v1", "mock-ats-evaluator"]
        )

    def list_models(self) -> List[str]:
        return ["mock-grounded-v1", "mock-ats-evaluator"]

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        response_model: Optional[Type[T]] = None,
        max_tokens: int = 2048,
        temperature: float = 0.2
    ) -> Any:
        # Error simulation checks
        if self.simulate_error == "unavailable":
            raise ProviderUnavailableError("Simulated provider connection failure.")
        elif self.simulate_error == "timeout":
            raise ProviderTimeoutError("Simulated provider timeout.")
        elif self.simulate_error == "malformed":
            raise InvalidResponseError("Simulated malformed unparseable model response.")

        if response_model is None:
            return "Mock completion response."

        # Synthetic generation based on requested schema
        if issubclass(response_model, JobDescriptionAnalysis):
            return self._generate_job_analysis(prompt)
        elif issubclass(response_model, ResumeMatchReport):
            return self._generate_match_report(prompt)
        elif issubclass(response_model, FactVerificationResult):
            return self._generate_fact_verification(prompt)
        elif issubclass(response_model, CoverLetterResponse):
            return self._generate_cover_letter(prompt)
        
        raise InvalidResponseError(f"Unsupported mock response model: {response_model.__name__}")

    def _generate_job_analysis(self, prompt: str) -> JobDescriptionAnalysis:
        # Extract title if present in prompt
        title = "Software Engineer"
        for t in ["Senior Full-Stack Engineer", "Frontend Architect", "Distributed Systems Engineer", "Lead Developer", "Principal Architect"]:
            if t.lower() in prompt.lower():
                title = t
                break

        company = "Target Company"
        for c in ["Stripe", "Linear", "Datadog", "Google", "Meta", "Amazon"]:
            if c.lower() in prompt.lower():
                company = c
                break

        # Extract skills mentioned in the prompt
        known_tech = ["Python", "TypeScript", "React", "FastAPI", "SQL", "Docker", "PostgreSQL", "Redis", "Kafka", "AWS", "Kubernetes", "Next.js"]
        found = [k for k in known_tech if k.lower() in prompt.lower()]
        
        required = found[:4] if found else ["Python", "FastAPI"]
        preferred = found[4:7] if len(found) > 4 else []

        work_mode = "remote" if "remote" in prompt.lower() else "unspecified"

        return JobDescriptionAnalysis(
            job_title=title,
            company=company,
            required_skills=required,
            preferred_skills=preferred,
            experience_requirements=["5+ years software engineering experience"],
            education_requirements=["Bachelor's degree in Computer Science or equivalent"],
            responsibilities=["Design and implement scalable distributed services", "Collaborate with cross-functional pods"],
            technology_stack=found or ["Python", "React"],
            seniority="Senior" if "senior" in prompt.lower() or "staff" in prompt.lower() else "Mid-Level",
            location="Remote" if work_mode == "remote" else "San Francisco, CA",
            work_mode=work_mode,
            important_keywords=found or ["Architecture", "Scalability", "API"],
            inferred_attributes={"team_size": "Pod of 6-8 engineers"},
            provider_used="mock",
            model_used="mock-grounded-v1",
            fallback_activated=False,
            inference_source="mock",
            fallback_reason=None
        )

    def _generate_match_report(self, prompt: str) -> ResumeMatchReport:
        # Extract candidate claims present in the prompt
        claim_pattern = re.compile(r"\[(claim_[a-zA-Z0-9_]+)\](?:\s*\([^)]*\))?:\s*([^\n]+)")
        extracted_claims = claim_pattern.findall(prompt)  # List of (claim_id, claim_text)

        # Parse required and preferred skills from prompt
        req_match = re.search(r"Required Skills:\s*([^\n]+)", prompt)
        required_skills = []
        if req_match:
            required_skills = [s.strip() for s in req_match.group(1).split(",") if s.strip()]

        pref_match = re.search(r"Preferred Skills:\s*([^\n]+)", prompt)
        preferred_skills = []
        if pref_match:
            preferred_skills = [s.strip() for s in pref_match.group(1).split(",") if s.strip()]

        if not required_skills and not preferred_skills:
            known_tech = ["Python", "FastAPI", "React", "TypeScript", "SQL", "Docker", "PostgreSQL", "Redis", "Kafka", "AWS", "Kubernetes", "Golang"]
            for tech in known_tech:
                if tech.lower() in prompt.lower():
                    required_skills.append(tech)

        matched: List[RequirementMatch] = []
        missing: List[str] = []
        skill_gaps: List[str] = []

        all_reqs = [(req, "required_skill") for req in required_skills] + [(pref, "preferred_skill") for pref in preferred_skills]
        if not all_reqs:
            all_reqs = [("Python", "required_skill")]

        for req_name, req_type in all_reqs:
            req_lower = req_name.lower()
            matching_claims = []
            for cid, ctext in extracted_claims:
                if re.search(r"\b" + re.escape(req_lower) + r"\b", ctext.lower()):
                    matching_claims.append((cid, ctext))

            if matching_claims:
                matched.append(RequirementMatch(
                    requirement=req_name,
                    requirement_type=req_type,
                    status="matched",
                    candidate_claim_ids=[c[0] for c in matching_claims[:3]],
                    evidence_quote=matching_claims[0][1][:180],
                    explanation=f"Demonstrated in candidate record ({matching_claims[0][1][:80]})."
                ))
            else:
                missing.append(req_name)
                skill_gaps.append(req_name)

        matched_req_count = sum(1 for m in matched if m.requirement_type == "required_skill")
        req_score = int((matched_req_count / (len(required_skills) or 1)) * 100) if required_skills else 90

        matched_pref_count = sum(1 for m in matched if m.requirement_type == "preferred_skill")
        pref_score = int((matched_pref_count / (len(preferred_skills) or 1)) * 100) if preferred_skills else 80

        overall = min(98, max(20, int((req_score * 0.5) + (pref_score * 0.1) + 35)))

        return ResumeMatchReport(
            overall_score=overall,
            category_scores={
                "required_skills": req_score,
                "preferred_skills": pref_score,
                "experience_depth": 85,
                "technology_alignment": 88,
                "seniority_compatibility": 90
            },
            matched_requirements=matched,
            missing_requirements=missing,
            partially_supported_requirements=[],
            skill_gaps=skill_gaps,
            confidence=0.92,
            explanation=f"Evidence-grounded match with {len(matched)} verified requirements and {len(missing)} missing.",
            provider_used="mock",
            model_used="mock-grounded-v1",
            fallback_activated=False,
            inference_source="mock",
            fallback_reason=None
        )

    def _generate_fact_verification(self, prompt: str) -> FactVerificationResult:
        lower = prompt.lower()
        if "invent" in lower or "unsupported" in lower or "kubernetes" in lower and "no evidence" in lower:
            return FactVerificationResult(
                claim="Kubernetes production deployment",
                classification="unsupported",
                evidence_citations=[],
                confidence=0.95,
                reasoning="No evidence found in candidate resume or confirmed facts to support this claim."
            )
        elif "contradict" in lower or "1990" in lower:
            return FactVerificationResult(
                claim="Graduated college in 1990",
                classification="contradictory",
                evidence_citations=["edu_uc_berkeley_2020"],
                confidence=0.98,
                reasoning="Contradicts verified candidate education record indicating UC Berkeley graduation in 2020."
            )
        else:
            return FactVerificationResult(
                claim="Python & FastAPI experience",
                classification="supported",
                evidence_citations=["exp_cloudscale_fastapi", "skills_python"],
                confidence=0.99,
                reasoning="Directly supported by candidate's employment history at CloudScale Systems."
            )

    def _generate_cover_letter(self, prompt: str) -> CoverLetterResponse:
        company = "Stripe"
        for c in ["Stripe", "Linear", "Datadog", "Google"]:
            if c.lower() in prompt.lower():
                company = c
                break

        title = "Senior Full-Stack Engineer"
        for t in ["Senior Full-Stack Engineer", "Frontend Architect", "Distributed Systems Engineer"]:
            if t.lower() in prompt.lower():
                title = t
                break

        p1 = f"I am writing to express my strong enthusiasm for the {title} position at {company}. With a track record of building reliable, high-throughput distributed systems, I am eager to contribute to your engineering team."
        p2 = "In my recent work, I spearheaded the engineering of FastAPI microservices and modern React applications, focusing rigorously on P99 latency reduction and resilient architectural patterns. My background aligns closely with the core engineering standards at your organization."
        p3 = f"I look forward to discussing how my verified technical background and hands-on system architecture experience can support {company}'s ongoing product milestones."

        return CoverLetterResponse(
            id="cov_letter_mock_001",
            recipient_company=company,
            job_title=title,
            tone="professional",
            length="standard",
            content=f"{p1}\n\n{p2}\n\n{p3}",
            paragraphs=[p1, p2, p3],
            grounded_claims=["FastAPI microservices", "React applications", "P99 latency reduction"],
            unverified_omissions=[],
            created_at="2026-11-19T18:00:00Z",
            provider_used="mock",
            model_used="mock-grounded-v1",
            fallback_activated=False,
            inference_source="mock",
            fallback_reason=None
        )
