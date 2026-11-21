from typing import Dict, Any, Tuple

def calculate_layout_budget(document_tree: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes visual density and fitting parameters for an A4/Letter resume:
    Standard 1-page budget is approximately 38 - 44 total lines.
    - If lines <= 36: fits cleanly without tightening.
    - If lines 37..44: tightens margins and line-height (X-Tightened: true).
    - If lines > 44: drops overflow bullets or breaks into page 2.
    """
    total_lines = 0
    sections = document_tree.get("sections", [])
    
    for sec in sections:
        total_lines += 2 # Section title & spacing overhead
        for blk in sec.get("blocks", []):
            total_lines += 2 # Role, company, period
            lines = blk.get("lines", [])
            total_lines += len(lines)

    # Determine page fit and tightening
    page_count = 1
    tightened = False
    left_out = 0

    if total_lines <= 36:
        tightened = False
        page_count = 1
        left_out = 0
    elif total_lines <= 46:
        tightened = True
        page_count = 1
        left_out = 0
    else:
        # Overflow calculation
        page_count = (total_lines // 40) + 1
        tightened = True
        left_out = 0

    return {
        "total_lines": total_lines,
        "page_count": page_count,
        "tightened": tightened,
        "left_out": left_out
    }

def compute_ats_score(document_tree: Dict[str, Any]) -> int:
    """Computes a live ATS score based on bullet action verbs, metrics, and completeness."""
    score = 70
    sections = document_tree.get("sections", [])
    
    has_metrics = False
    total_bullets = 0
    action_verb_count = 0
    
    strong_verbs = ["engineered", "architected", "spearheaded", "directed", "built", "developed", "orchestrated", "scaled", "reduced", "increased"]
    
    for sec in sections:
        for blk in sec.get("blocks", []):
            for l in blk.get("lines", []):
                total_bullets += 1
                text = l.get("text", "").lower()
                # Check metrics ($ or %)
                if "%" in text or "$" in text or any(char.isdigit() for char in text):
                    has_metrics = True
                    score += 2
                # Check strong action verbs
                if any(v in text for v in strong_verbs):
                    action_verb_count += 1
                    score += 2

    if has_metrics:
        score += 6
    if action_verb_count >= 3:
        score += 6

    return min(98, max(50, score))
