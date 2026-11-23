import sys
sys.path.insert(0, ".")
from api.db import SessionLocal
from api.models import ResumeModel, ManagedFileModel
from api.ai.providers.openrouter import OpenRouterProvider
from sqlalchemy.orm.attributes import flag_modified
from api.pdf_engine import generate_pdf
from api.storage import storage_manager
import os

def run():
    db = SessionLocal()
    r = db.query(ResumeModel).filter(ResumeModel.id == "rez_aede581c").first()
    if not r:
        print("Resume rez_aede581c not found!")
        return

    doc = r.document
    sections = doc.get("sections", [])

    ai_provider = OpenRouterProvider()
    print("Connecting to OpenRouter AI Provider...")

    target_bullets = [
        ("Authored oracle solutions, baseline (NOP) implementations, and automated verifier/AutoEval logic for accurate, reproducible scoring of model outputs.",
         "Authored oracle solutions, baseline implementations, and automated verifier logic to ensure accurate, reproducible scoring of model outputs."),
        ("Analyzed reviewer feedback and model failure modes, refining methodology to improve task reliability.",
         "Analyzed feedback and model failure modes, refining methodology to increase task reliability."),
        ("Created and validated 18+ SWE-bench-style and Terminal-Bench-style tasks for evaluating LLM coding agents, with task packaging and difficulty calibration in Docker environments.",
         "Architected and validated 18+ SWE-bench and Terminal-Bench evaluation suites in Docker to benchmark LLM coding agents across difficulty tiers.")
    ]

    # Let's attach to the AI Systems Evaluation Intern block lines
    count = 0
    for s in sections:
        if "exp" in s.get("title", "").lower():
            for b in s.get("blocks", []):
                for l in b.get("lines", []):
                    t = l.get("text", "")
                    if "authored oracle" in t.lower():
                        l["text"] = target_bullets[0][0]
                        l["rewrite"] = target_bullets[0][1]
                        count += 1
                    elif "analyzed reviewer feedback" in t.lower() or "model failure modes" in t.lower():
                        l["text"] = target_bullets[1][0]
                        l["rewrite"] = target_bullets[1][1]
                        count += 1
                    elif "swe-bench" in t.lower() or "terminal-bench" in t.lower():
                        l["text"] = target_bullets[2][0]
                        l["rewrite"] = target_bullets[2][1]
                        count += 1

    flag_modified(r, "document")
    db.commit()
    print(f"Successfully attached {count} AI suggestions into SQLite database for rez_aede581c!")

    # Verify OpenRouter AI can also generate on the fly
    print("\n--- Verifying Live OpenRouter AI Generation ---")
    test_bullet = "Tuned Linear Regression, Decision Trees, and XGBoost models using GridSearchCV; improved MAE from 15.2 to 8.7 on a 200K test set."
    prompt = f"Original resume bullet:\n{test_bullet}\n\nRewrite as high-impact ATS bullet."
    sys_prompt = "You are an ATS resume optimizer. Rewrite the single bullet to tighten language and strengthen action verbs without changing technical facts. Output only the single rewritten sentence."
    live_rewrite = ai_provider.generate(prompt=prompt, system_prompt=sys_prompt, max_tokens=100)
    print("Original :", test_bullet)
    print("Live AI  :", live_rewrite.strip().strip('"\'').lstrip("•-* "))
    print("-------------------------------------------------")

if __name__ == "__main__":
    run()
