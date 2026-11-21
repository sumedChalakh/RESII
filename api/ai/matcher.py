import re
from typing import Optional, List, Dict
from api.ai.schemas import (
    ResumeMatchReport,
    RequirementMatch,
    JobDescriptionAnalysis,
    CandidateEvidenceLedger
)
from api.ai.evidence import format_evidence_for_prompt
from api.ai.providers.base import BaseLLMProvider, ProviderError
from api.ai.providers.factory import get_provider

SYSTEM_PROMPT = """You are an evidence-grounded resume matching and ATS evaluation engine.
Compare the candidate's verified evidence ledger against the job description requirements.

NON-NEGOTIABLE GROUNDING RULES:
1. Every matched requirement MUST cite at least one specific Candidate Claim ID (e.g. claim_item_0_b1).
2. NEVER mark a requirement as matched if the candidate evidence does not explicitly demonstrate it.
3. If the candidate lacks a required skill (e.g. Kubernetes, AWS, Go), classify it as 'missing' and list it under skill_gaps.
4. Calculate category scores (0-100) based strictly on evidenced proportion.
5. Provide a constructive, factual explanation.
6. Return valid JSON adhering to the ResumeMatchReport schema.
"""

def evaluate_match_heuristically(
    ledger: CandidateEvidenceLedger,
    analysis: JobDescriptionAnalysis
) -> ResumeMatchReport:
    """
    Deterministic evidence-grounded matcher.
    Guarantees strict citation of genuine candidate claim IDs without fabrication.
    """
    candidate_skills_lower = {s.lower(): s for s in ledger.skills}
    candidate_claims_by_skill: Dict[str, List[str]] = {}
    
    # Map skills to candidate claim IDs
    for claim in ledger.claims:
        claim_text_lower = claim.text.lower()
        for skill_lower, original_skill in candidate_skills_lower.items():
            if re.search(r"\b" + re.escape(skill_lower) + r"\b", claim_text_lower):
                candidate_claims_by_skill.setdefault(skill_lower, []).append(claim.id)

    matched_reqs: List[RequirementMatch] = []
    missing_reqs: List[str] = []
    partial_reqs: List[RequirementMatch] = []
    skill_gaps: List[str] = []

    # 1. Evaluate Required Skills
    req_hits = 0
    for req in analysis.required_skills:
        req_lower = req.lower()
        matching_claim_ids = candidate_claims_by_skill.get(req_lower, [])
        if matching_claim_ids:
            req_hits += 1
            # Find matching quote
            quote = next((c.text for c in ledger.claims if c.id == matching_claim_ids[0]), "")
            matched_reqs.append(RequirementMatch(
                requirement=req,
                requirement_type="required_skill",
                status="matched",
                candidate_claim_ids=matching_claim_ids[:3],
                evidence_quote=quote[:180],
                explanation=f"Candidate verified proficiency in '{req}' via {len(matching_claim_ids)} documented claim(s)."
            ))
        else:
            # Check for partial keyword match
            partial_hits = [c.id for c in ledger.claims if any(w in c.text.lower() for w in req_lower.split() if len(w) > 3)]
            if partial_hits:
                quote = next((c.text for c in ledger.claims if c.id == partial_hits[0]), "")
                partial_reqs.append(RequirementMatch(
                    requirement=req,
                    requirement_type="required_skill",
                    status="partial",
                    candidate_claim_ids=partial_hits[:2],
                    evidence_quote=quote[:180],
                    explanation=f"Related background detected, but explicit '{req}' expertise is unconfirmed."
                ))
            else:
                missing_reqs.append(req)
                skill_gaps.append(req)

    # 2. Evaluate Preferred Skills
    pref_hits = 0
    for pref in analysis.preferred_skills:
        pref_lower = pref.lower()
        matching_claim_ids = candidate_claims_by_skill.get(pref_lower, [])
        if matching_claim_ids:
            pref_hits += 1
            quote = next((c.text for c in ledger.claims if c.id == matching_claim_ids[0]), "")
            matched_reqs.append(RequirementMatch(
                requirement=pref,
                requirement_type="preferred_skill",
                status="matched",
                candidate_claim_ids=matching_claim_ids[:2],
                evidence_quote=quote[:180],
                explanation=f"Candidate demonstrates preferred capability in '{pref}'."
            ))
        else:
            missing_reqs.append(pref)

    # Compute category scores
    total_req = len(analysis.required_skills) or 1
    req_score = int((req_hits / total_req) * 100)

    total_pref = len(analysis.preferred_skills) or 1
    pref_score = int((pref_hits / total_pref) * 100)

    # Experience depth based on claims length and verified items
    exp_claims = [c for c in ledger.claims if c.claim_type in ("experience", "achievement")]
    exp_score = min(98, 60 + (len(exp_claims) * 3))

    tech_overlap = len(set(s.lower() for s in analysis.technology_stack) & set(candidate_skills_lower.keys()))
    total_tech = len(analysis.technology_stack) or 1
    tech_score = int((tech_overlap / total_tech) * 100)

    seniority_score = 85
    if analysis.seniority == "Senior" and len(exp_claims) >= 4:
        seniority_score = 92

    overall = int((req_score * 0.40) + (tech_score * 0.25) + (exp_score * 0.15) + (seniority_score * 0.10) + (pref_score * 0.10))
    overall = max(20, min(98, overall))

    explanation = (
        f"Match score of {overall}% based on {req_hits}/{total_req} required skills confirmed by candidate evidence. "
        f"{len(skill_gaps)} key skill gap(s) identified ({', '.join(skill_gaps[:3]) if skill_gaps else 'None'})."
    )

    return ResumeMatchReport(
        overall_score=overall,
        category_scores={
            "required_skills": req_score,
            "preferred_skills": pref_score,
            "experience_depth": exp_score,
            "technology_alignment": tech_score,
            "seniority_compatibility": seniority_score
        },
        matched_requirements=matched_reqs,
        missing_requirements=missing_reqs,
        partially_supported_requirements=partial_reqs,
        skill_gaps=skill_gaps,
        confidence=0.92,
        explanation=explanation,
        provider_used="heuristic_fallback",
        model_used=None,
        fallback_activated=True,
        inference_source="heuristic",
        fallback_reason="Deterministic evidence heuristic"
    )


def match_resume_to_job(
    ledger: CandidateEvidenceLedger,
    analysis: JobDescriptionAnalysis,
    provider: Optional[BaseLLMProvider] = None
) -> ResumeMatchReport:
    """
    Executes evidence-grounded matching between candidate claims and analyzed job requirements.
    Falls back gracefully to deterministic citation evaluation if provider is unavailable.
    """
    p = provider or get_provider()
    
    evidence_text = format_evidence_for_prompt(ledger)
    prompt = f"""<<<CANDIDATE_EVIDENCE_START>>>
{evidence_text}
<<<CANDIDATE_EVIDENCE_END>>>

<<<JOB_REQUIREMENTS_START>>>
Job Title: {analysis.job_title}
Company: {analysis.company or 'Target Company'}
Required Skills: {', '.join(analysis.required_skills)}
Preferred Skills: {', '.join(analysis.preferred_skills)}
Experience: {', '.join(analysis.experience_requirements)}
Technology Stack: {', '.join(analysis.technology_stack)}
<<<JOB_REQUIREMENTS_END>>>

Evaluate the match between the candidate's verified evidence and the job requirements.
Remember: every matched requirement MUST cite genuine Candidate Claim IDs from the ledger above.
Do NOT invent ungrounded matches.
"""

    try:
        report: ResumeMatchReport = p.generate(
            prompt=prompt,
            system_prompt=SYSTEM_PROMPT,
            response_model=ResumeMatchReport,
            temperature=0.1
        )
        if p.name == "mock":
            report.provider_used = "mock"
            report.model_used = getattr(p, "model", None) or "mock-grounded-v1"
            report.fallback_activated = False
            report.inference_source = "mock"
            report.fallback_reason = None
        else:
            report.provider_used = p.name
            report.model_used = getattr(p, "model", None) or "default"
            report.fallback_activated = False
            report.inference_source = "llm"
            report.fallback_reason = None
        return report
    except Exception as e:
        fallback = evaluate_match_heuristically(ledger, analysis)
        fallback.provider_used = "heuristic_fallback"
        fallback.model_used = None
        fallback.fallback_activated = True
        fallback.inference_source = "heuristic"
        fallback.fallback_reason = f"Provider '{p.name}' failed ({type(e).__name__})"
        return fallback
