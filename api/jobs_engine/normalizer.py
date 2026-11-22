import re
import html
from typing import List, Optional, Tuple, Dict, Any

# Canonical Technical Skills Lexicon
TECH_SKILLS_LEXICON = [
    # Languages
    "Python", "TypeScript", "JavaScript", "Go", "Golang", "Rust", "Java", "C++", "C#", "Ruby", "PHP", "Swift", "Kotlin", "Scala", "SQL", "HTML", "CSS", "Bash", "Shell",
    # Frontend
    "React", "Next.js", "Vue", "Angular", "Svelte", "Redux", "Tailwind CSS", "Vite", "Webpack",
    # Backend & Frameworks
    "FastAPI", "Django", "Flask", "Node.js", "Express", "Spring Boot", "NestJS", "Ruby on Rails", "ASP.NET", "GraphQL", "REST API", "gRPC",
    # AI / ML / Data
    "Machine Learning", "Deep Learning", "LLM", "Generative AI", "NLP", "PyTorch", "TensorFlow", "Scikit-Learn", "Hugging Face", "LangChain", "LlamaIndex", "Pandas", "NumPy", "Apache Spark", "Airflow", "Databricks", "OpenAI",
    # Cloud & DevOps
    "AWS", "GCP", "Google Cloud", "Azure", "Docker", "Kubernetes", "Terraform", "CI/CD", "GitHub Actions", "Kafka", "RabbitMQ", "Linux", "Prometheus", "Grafana",
    # Databases & Storage
    "PostgreSQL", "Postgres", "MySQL", "MongoDB", "Redis", "Elasticsearch", "Cassandra", "Snowflake", "BigQuery", "DynamoDB", "SQLite"
]

import re
import html
from html.parser import HTMLParser
from typing import List, Optional, Tuple, Dict, Any

class _TextExtractingParser(HTMLParser):
    """
    Robust, injection-safe HTML-to-plain-text extractor using Python's stdlib HTMLParser.
    Eliminates catastrophic regex backtracking and cleans nested markup safely.
    """
    BLOCK_TAGS = {"p", "div", "br", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr", "section", "article"}

    def __init__(self):
        super().__init__()
        self.pieces: List[str] = []

    def handle_data(self, data: str):
        if data:
            self.pieces.append(data)

    def handle_starttag(self, tag: str, attrs):
        if tag.lower() in self.BLOCK_TAGS:
            self.pieces.append("\n")

    def handle_endtag(self, tag: str):
        if tag.lower() in self.BLOCK_TAGS:
            self.pieces.append("\n")

    def get_text(self) -> str:
        raw = "".join(self.pieces)
        decoded = html.unescape(raw)
        lines = [line.strip() for line in decoded.splitlines()]
        clean = "\n".join(l for l in lines if l)
        return clean.strip()

def strip_html(html_str: Optional[str]) -> str:
    """Removes HTML tags and unescapes HTML entities safely using stdlib HTMLParser."""
    if not html_str:
        return ""
    try:
        parser = _TextExtractingParser()
        parser.feed(html_str)
        parser.close()
        text = parser.get_text()
        if text:
            return text
    except Exception:
        pass
    # Safe fallback if parser encounters malformed edge cases
    text = re.sub(r'<[^>]+>', ' ', html_str)
    text = html.unescape(text)
    return " ".join(text.split()).strip()


def extract_skills(text: str) -> List[str]:
    """Extracts genuine technical skills found explicitly in text using regex word boundaries."""
    if not text:
        return []
    text_lower = text.lower()
    matched = []
    for skill in TECH_SKILLS_LEXICON:
        # Match case-insensitively with word boundaries
        pattern = r'\b' + re.escape(skill.lower()) + r'\b'
        if re.search(pattern, text_lower):
            matched.append(skill)
    # Canonical deduplication
    seen = set()
    deduped = []
    for s in matched:
        if s.lower() not in seen:
            seen.add(s.lower())
            deduped.append(s)
    return deduped


def infer_workplace_type(title: str, location: str, text: str) -> str:
    """Infers workplace type: remote, hybrid, or on_site."""
    combined = f"{title} {location} {text[:500]}".lower()
    if "remote" in combined or "anywhere" in combined or "work from home" in combined or "wfh" in combined:
        return "remote"
    if "hybrid" in combined or "flexible" in combined:
        return "hybrid"
    return "on_site"


def infer_experience_level(title: str, text: str) -> str:
    """Infers experience level: internship, fresher, 0-2 yrs, mid, senior, lead."""
    combined = f"{title} {text[:600]}".lower()
    
    if "intern" in combined or "internship" in combined or "co-op" in combined:
        return "internship"
    if "principal" in combined or "architect" in combined or "staff" in combined or "director" in combined or "vp" in combined or "head of" in combined:
        return "lead"
    if "senior" in combined or "sr." in combined or "sr " in combined or "lead" in combined or "5+" in combined or "6+" in combined:
        return "senior"
    if "0-2" in combined or "1-2" in combined or "1-3" in combined or "0 to 2" in combined or "1 to 2" in combined:
        return "0-2 yrs"
    if "fresher" in combined or "graduate" in combined or "entry level" in combined or "junior" in combined or "entry" in combined:
        return "fresher"
    return "mid"


def infer_employment_type(title: str, text: str) -> str:
    """Infers employment type: full_time, part_time, contract, internship."""
    combined = f"{title} {text[:500]}".lower()
    if "intern" in combined or "internship" in combined:
        return "internship"
    if "contract" in combined or "freelance" in combined or "contractor" in combined:
        return "contract"
    if "part-time" in combined or "part time" in combined:
        return "part_time"
    return "full_time"


def parse_salary(
    raw_min: Optional[Any],
    raw_max: Optional[Any],
    currency: Optional[str] = None,
    text: Optional[str] = None
) -> Tuple[Optional[float], Optional[float], Optional[str], Optional[str]]:
    """Standardizes salary figures and formatted display string."""
    s_min = None
    s_max = None
    curr = currency or "INR"

    if raw_min is not None:
        try:
            s_min = float(raw_min)
        except (ValueError, TypeError):
            pass

    if raw_max is not None:
        try:
            s_max = float(raw_max)
        except (ValueError, TypeError):
            pass

    # If salary was not provided in structured fields, try parsing from text
    if s_min is None and s_max is None and text:
        # Match e.g. ₹15,00,000 - ₹25,00,000 or $120,000 - $180,000
        inr_match = re.search(r'(?:₹|INR|Rs\.?)\s*([\d,]+(?:\.\d+)?)\s*(?:-|to)\s*(?:₹|INR|Rs\.?)?\s*([\d,]+(?:\.\d+)?)', text)
        usd_match = re.search(r'\$\s*([\d,]+)\s*(?:-|to)\s*\$?\s*([\d,]+)', text)
        if inr_match:
            try:
                curr = "INR"
                s_min = float(inr_match.group(1).replace(",", ""))
                s_max = float(inr_match.group(2).replace(",", ""))
            except ValueError:
                pass
        elif usd_match:
            try:
                curr = "USD"
                s_min = float(usd_match.group(1).replace(",", ""))
                s_max = float(usd_match.group(2).replace(",", ""))
            except ValueError:
                pass

    formatted = None
    if s_min is not None and s_max is not None:
        if curr == "INR":
            # Format in Indian Lakhs if >= 100,000
            if s_min >= 100000:
                formatted = f"₹{s_min/100000:.1f}L – ₹{s_max/100000:.1f}L/yr"
            else:
                formatted = f"₹{s_min:,.0f} – ₹{s_max:,.0f}"
        elif curr == "USD":
            formatted = f"${s_min/1000:.0f}k – ${s_max/1000:.0f}k/yr"
        else:
            formatted = f"{curr} {s_min:,.0f} – {s_max:,.0f}"
    elif s_min is not None:
        formatted = f"From {curr} {s_min:,.0f}"
    elif s_max is not None:
        formatted = f"Up to {curr} {s_max:,.0f}"

    return s_min, s_max, curr, formatted
