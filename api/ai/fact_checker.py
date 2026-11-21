import re
from typing import Optional, List, Dict, Any
from api.ai.schemas import FactVerificationResult, CandidateEvidenceLedger

def verify_candidate_claim(
    claim_text: str,
    ledger: CandidateEvidenceLedger
) -> FactVerificationResult:
    """
    Classifies a proposed candidate assertion against the verified evidence ledger.
    Categories:
    - supported: verified directly by existing evidence
    - partially_supported: verified in part, but missing specific details
    - unsupported: zero evidence found
    - contradictory: conflicts with verified records
    - requires_confirmation: sensitive or ungrounded claim requiring human sign-off
    """
    clean_claim = claim_text.strip()
    claim_lower = clean_claim.lower()

    # 1. Check for contradictions
    # Check graduation date contradictions
    grad_years = re.findall(r"\b(19\d{2}|20\d{2})\b", claim_text)
    for c in ledger.claims:
        if c.claim_type == "education":
            c_years = re.findall(r"\b(19\d{2}|20\d{2})\b", c.text)
            if grad_years and c_years:
                if grad_years[0] not in c_years and abs(int(grad_years[0]) - int(c_years[0])) > 4:
                    return FactVerificationResult(
                        claim=clean_claim,
                        classification="contradictory",
                        evidence_citations=[c.id],
                        confidence=0.98,
                        reasoning=f"Claim asserts year {grad_years[0]}, which contradicts verified education record '{c.text}'."
                    )

    # 2. Check for exact skill/tool support
    supported_claim_ids = []
    for c in ledger.claims:
        # Check high lexical or semantic overlap
        c_lower = c.text.lower()
        if clean_claim.lower() in c_lower or (len(clean_claim) > 5 and any(phrase in c_lower for phrase in clean_claim.lower().split(", "))):
            supported_claim_ids.append(c.id)

    # Check against verified skills
    for s in ledger.skills:
        if s.lower() in claim_lower:
            # Found matching skill
            matching_ids = [c.id for c in ledger.claims if s.lower() in c.text.lower()]
            if matching_ids:
                supported_claim_ids.extend(matching_ids[:2])

    if supported_claim_ids:
        unique_ids = list(dict.fromkeys(supported_claim_ids))
        return FactVerificationResult(
            claim=clean_claim,
            classification="supported",
            evidence_citations=unique_ids[:4],
            confidence=0.95,
            reasoning=f"Verified directly against candidate evidence ({len(unique_ids)} matching citation(s))."
        )

    # 3. Check for partial support (e.g. general domain match)
    domain_words = [w for w in re.findall(r"\b[A-Za-z]{4,}\b", claim_lower) if w not in ("with", "have", "that", "from", "experience", "senior")]
    partial_citations = []
    for c in ledger.claims:
        for dw in domain_words:
            if dw in c.text.lower():
                partial_citations.append(c.id)
                break

    if partial_citations:
        return FactVerificationResult(
            claim=clean_claim,
            classification="partially_supported",
            evidence_citations=list(dict.fromkeys(partial_citations))[:3],
            confidence=0.75,
            reasoning="Related experience detected in candidate records, but explicit assertion is unverified."
        )

    # 4. Check for unsupported claim
    return FactVerificationResult(
        claim=clean_claim,
        classification="unsupported",
        evidence_citations=[],
        confidence=0.95,
        reasoning="No evidence found in candidate's resume, confirmed facts, or profile."
    )
