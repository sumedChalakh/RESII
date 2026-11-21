import os
import re
from pathlib import Path

FIXTURES_DIR = Path("extension/tests/fixtures")

FIELD_RULES = {
    "first_name": re.compile(r"(first[_\-\s]?name|given[_\-\s]?name|fname)", re.I),
    "last_name": re.compile(r"(last[_\-\s]?name|family[_\-\s]?name|surname|lname)", re.I),
    "full_name": re.compile(r"(full[_\-\s]?name|candidate[_\-\s]?name|^name$|^name[\s_])", re.I),
    "email": re.compile(r"(e[_\-\s]?mail)", re.I),
    "phone": re.compile(r"(phone|mobile|tel|telephone|cell)", re.I),
    "work_authorization": re.compile(r"(work[_\-\s]?auth|authorized[_\-\s]?to[_\-\s]?work|citizenship|legal[_\-\s]?right)", re.I),
    "requires_sponsorship": re.compile(r"(sponsor|sponsorship|visa)", re.I),
    "location": re.compile(r"(location|\bcity\b|address|postal|zip|\bstate\b|residence)", re.I),
    "linkedin_url": re.compile(r"(linkedin)", re.I),
    "github_url": re.compile(r"(github)", re.I),
    "portfolio_url": re.compile(r"(portfolio|personal[_\-\s]?site|website|url)", re.I),
    "resume_file": re.compile(r"(resume|cv|curriculum[_\-\s]?vitae)", re.I),
    "cover_letter": re.compile(r"(cover[_\-\s]?letter|letter|comments)", re.I),
    "years_experience": re.compile(r"(years[_\-\s]?(?:of[_\-\s]?(?:work[_\-\s]?)?)?experience|total[_\-\s]?experience|experience[_\-\s]?years)", re.I),
}

SENSITIVE_KEYWORDS = [
    "gender",
    "race",
    "ethnicity",
    "veteran",
    "disability",
    "sexual orientation",
    "religion",
    "marital status",
    "eeo",
    "demographic"
]


def classify_element(tag_html: str, label_text: str = ""):
    combined = f"{label_text} {tag_html}".lower()

    # 1. Sensitive demographic
    for sens in SENSITIVE_KEYWORDS:
        if sens in combined:
            return "sensitive_demographic"

    # 2. Automation IDs (Workday)
    if 'data-automation-id="legalnamesection_firstname"' in combined:
        return "first_name"
    if 'data-automation-id="legalnamesection_lastname"' in combined:
        return "last_name"
    if 'data-automation-id="phone-number"' in combined:
        return "phone"
    if 'data-automation-id="file-upload-input-ref"' in combined:
        return "resume_file"
    if 'data-automation-id="addresssection_city"' in combined:
        return "location"

    # 3. HTML5 input types
    if 'type="email"' in tag_html.lower():
        return "email"
    if 'type="tel"' in tag_html.lower():
        return "phone"
    if 'type="file"' in tag_html.lower():
        if "cover" in combined or "letter" in combined:
            return "cover_letter"
        return "resume_file"

    # Extract clean input name attribute value
    name_attr_match = re.search(r'name="([^"]+)"', tag_html, re.I)
    name_val = name_attr_match.group(1) if name_attr_match else ""
    field_text = f"{label_text} {name_val}".strip()

    # 4. Regex classification on label + name
    for cat, pattern in FIELD_RULES.items():
        if pattern.search(field_text):
            return cat

    if "<textarea" in tag_html.lower():
        return "screening_question"

    return "unknown"


def extract_elements_with_labels(html: str):
    labels_by_for = {}
    for m in re.finditer(r'<label[^>]*for="([^"]+)"[^>]*>([\s\S]*?)</label>', html, re.I):
        labels_by_for[m.group(1)] = re.sub(r'<[^>]+>', '', m.group(2)).strip()

    elements = []
    for m in re.finditer(r'<(?:input|textarea|select)[^>]*>', html, re.I):
        tag = m.group(0)
        if 'type="submit"' in tag.lower() or 'type="reset"' in tag.lower():
            continue

        id_m = re.search(r'id="([^"]+)"', tag, re.I)
        label = ""
        if id_m and id_m.group(1) in labels_by_for:
            label = labels_by_for[id_m.group(1)]
        else:
            start_pos = m.start()
            preceding = html[max(0, start_pos - 150):start_pos]
            label_match = re.search(r'<label[^>]*>([^<]+)', preceding, re.I)
            if label_match:
                label = label_match.group(1).strip()

        elements.append((tag, label))
    return elements


def test_greenhouse_fixture_classification():
    html = (FIXTURES_DIR / "greenhouse-form.html").read_text(encoding="utf-8")
    assert "boards.greenhouse.io" in html

    elements = extract_elements_with_labels(html)
    categories = [classify_element(tag, label) for tag, label in elements]

    assert "first_name" in categories
    assert "last_name" in categories
    assert "email" in categories
    assert "phone" in categories
    assert "resume_file" in categories
    assert "cover_letter" in categories
    assert "linkedin_url" in categories
    assert "github_url" in categories
    assert "sensitive_demographic" in categories


def test_lever_fixture_classification():
    html = (FIXTURES_DIR / "lever-form.html").read_text(encoding="utf-8")
    assert "jobs.lever.co" in html

    elements = extract_elements_with_labels(html)
    categories = [classify_element(tag, label) for tag, label in elements]

    assert "full_name" in categories
    assert "email" in categories
    assert "phone" in categories
    assert "location" in categories
    assert "resume_file" in categories
    assert "linkedin_url" in categories
    assert "github_url" in categories
    assert "sensitive_demographic" in categories


def test_workday_fixture_classification():
    html = (FIXTURES_DIR / "workday-form.html").read_text(encoding="utf-8")
    assert "data-automation-id" in html

    elements = extract_elements_with_labels(html)
    categories = [classify_element(tag, label) for tag, label in elements]

    assert "first_name" in categories
    assert "last_name" in categories
    assert "email" in categories
    assert "phone" in categories
    assert "resume_file" in categories
    assert "location" in categories
    assert "sensitive_demographic" in categories


def test_linkedin_fixture_classification():
    html = (FIXTURES_DIR / "linkedin-form.html").read_text(encoding="utf-8")
    assert "jobs-easy-apply" in html

    elements = extract_elements_with_labels(html)
    categories = [classify_element(tag, label) for tag, label in elements]

    assert "first_name" in categories
    assert "last_name" in categories
    assert "email" in categories
    assert "phone" in categories
    assert "resume_file" in categories
    assert "location" in categories
    assert "years_experience" in categories
    assert "sensitive_demographic" in categories


def test_generic_fixture_classification():
    html = (FIXTURES_DIR / "generic-form.html").read_text(encoding="utf-8")

    elements = extract_elements_with_labels(html)
    categories = [classify_element(tag, label) for tag, label in elements]

    assert "first_name" in categories
    assert "last_name" in categories
    assert "email" in categories
    assert "phone" in categories
    assert "work_authorization" in categories
    assert "requires_sponsorship" in categories
    assert "years_experience" in categories
    assert "sensitive_demographic" in categories


def test_submission_button_isolation():
    for fixture in ["greenhouse-form.html", "lever-form.html", "workday-form.html", "linkedin-form.html", "generic-form.html"]:
        html = (FIXTURES_DIR / fixture).read_text(encoding="utf-8")
        btn_matches = [m.group(0) for m in re.finditer(r"<(?:button|input)[^>]*>[\s\S]*?(?:</button>)?", html, re.I)]
        submits = [b for b in btn_matches if any(w in b.lower() for w in ["submit", "apply", "next-button"])]
        assert len(submits) >= 1, f"Expected submit button in {fixture}"
