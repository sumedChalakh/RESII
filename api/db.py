import os
import sqlite3
import datetime
from typing import Generator
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, Session
from api.config import settings
from api.models import (
    Base,
    UserModel,
    ResumeModel,
    JobApplicationModel,
    SavedSearchModel,
    AutoApplyPreferenceModel,
    CandidateFactsModel,
    SubmissionHistoryModel,
    UserProfileModel,
    UserPreferenceModel,
    UserSeasonModel,
    UserBillingModel,
    CoverLetterModel,
    AIProviderSettingModel,
    ExtensionPairingCodeModel,
)
from api.security import hash_password
from api.ingestion import parse_text_into_document_tree

# Ensure engine is configured with WAL, foreign keys, and busy timeout
def create_app_engine(database_url: str = None):
    url = database_url or settings.DATABASE_URL
    # For SQLite, connect_args to check same thread = False for multi-threaded FastAPI
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    eng = create_engine(url, connect_args=connect_args)
    return eng

engine = create_app_engine()

@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enforces SQLite PRAGMAs: WAL mode, foreign keys, busy timeout."""
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.execute("PRAGMA busy_timeout=5000;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a database session with guaranteed closure."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_db_context(custom_engine=None):
    """Context manager for standalone / background database operations."""
    sm = sessionmaker(autocommit=False, autoflush=False, bind=custom_engine or engine)
    return sm()


DEMO_RESUME_TEXT = """Alex Rivera
Senior Software Engineer
alex@resii.dev | (555) 234-5678 | San Francisco, CA | github.com/alexrivera | linkedin.com/in/alexrivera

PROFESSIONAL EXPERIENCE
Senior Full-Stack Engineer | CloudScale Systems
2022 – Present | San Francisco, CA
• Engineered high-throughput FastAPI services, reducing P99 latency by 34% across 2M daily queries.
• Orchestrated bi-weekly Agile sprints for a 6-engineer pod, increasing story velocity by 22%.
• Led migration of frontend components from legacy React classes to modern Vite & Redux Toolkit architecture.

Software Engineer II | Apex Data Labs
2020 – 2022 | San Jose, CA
• Built real-time data ingestion pipelines using Python, Kafka, and PostgreSQL processing 10GB/day.
• Collaborated with product teams to design RESTful APIs adhering to OpenAPI specs.

EDUCATION
B.S. in Computer Science | University of California, Berkeley
2016 – 2020 | Berkeley, CA
• Dean's Honors List. Coursework: Distributed Systems, Operating Systems, Algorithms, Computer Architecture.

TECHNICAL SKILLS
• Languages: Python, TypeScript, JavaScript, SQL, Bash
• Frameworks & Tools: React 18, FastAPI, Next.js, Redux Toolkit, Docker, PostgreSQL, Redis, Git, Linux
"""

def seed_demo_data(db: Session):
    """
    Idempotent development / demo seeder.
    Creates demo user, resumes, applications, and account state.
    Strictly skipped in production environments or if RESII_DEMO_MODE is False.
    """
    if settings.ENVIRONMENT == "production" or not settings.RESII_DEMO_MODE:
        return

    # Check if demo user already exists
    demo_user = db.query(UserModel).filter(UserModel.id == "usr_demo_101").first()
    if not demo_user:
        demo_user = UserModel(
            id="usr_demo_101",
            email="demo@resii.com",
            name="Alex Rivera",
            role="user",
            avatar_url=None,
            created_at="2026-01-15T08:00:00Z",
            entitlements=["free", "ats_check", "resume_edit", "job_search", "tailor", "auto_apply", "season_pro"],
            password_hash=hash_password("demo123")
        )
        db.add(demo_user)
        db.flush()

    # Seed primary resume
    primary_resume = db.query(ResumeModel).filter(ResumeModel.id == "primary").first()
    if not primary_resume:
        demo_doc = parse_text_into_document_tree(DEMO_RESUME_TEXT, "Alex_Rivera_Resume.pdf")
        primary_resume = ResumeModel(
            id="primary",
            user_id="usr_demo_101",
            title="Senior Software Engineer",
            version=4,
            is_primary=True,
            ats_score=92,
            active_template="classic_spruce",
            template_meta={
                "template_name": "Classic Spruce",
                "accent_color": "#0f4c3a",
                "font_family": "system-ui, -apple-system, sans-serif",
                "margin_mm": 18
            },
            document=demo_doc,
            target_role="Senior Full-Stack Engineer",
            target_company="CloudScale Systems",
            created_at="2026-11-16T12:00:00Z",
            updated_at="2026-11-16T14:30:00Z"
        )
        db.add(primary_resume)

    # Seed secondary tailored resume
    stripe_resume = db.query(ResumeModel).filter(ResumeModel.id == "rez_stripe_01").first()
    if not stripe_resume:
        stripe_doc = parse_text_into_document_tree(DEMO_RESUME_TEXT, "Stripe_Resume.pdf")
        stripe_resume = ResumeModel(
            id="rez_stripe_01",
            user_id="usr_demo_101",
            title="Senior Backend Engineer (Stripe)",
            version=2,
            is_primary=False,
            ats_score=94,
            active_template="classic_spruce",
            document=stripe_doc,
            target_role="Senior Backend Engineer",
            target_company="Stripe",
            created_at="2026-11-16T10:00:00Z",
            updated_at="2026-11-16T12:00:00Z"
        )
        db.add(stripe_resume)

    # Seed demo profile
    profile = db.query(UserProfileModel).filter(UserProfileModel.user_id == "usr_demo_101").first()
    if not profile:
        profile = UserProfileModel(
            user_id="usr_demo_101",
            name="Alex Rivera",
            email="demo@resii.com",
            title="Senior Full-Stack Engineer",
            location="San Francisco, CA",
            bio="Specializing in high-throughput distributed architectures, React 18 frontend systems, and performance tuning.",
            phone="+1 (555) 234-5678",
            website="https://alexrivera.dev",
            google_drive_connected=True,
            google_account_email="alex.rivera.work@gmail.com"
        )
        db.add(profile)

    # Seed demo preferences
    user_prefs = db.query(UserPreferenceModel).filter(UserPreferenceModel.user_id == "usr_demo_101").first()
    if not user_prefs:
        user_prefs = UserPreferenceModel(
            user_id="usr_demo_101",
            email_job_alerts=True,
            email_weekly_digest=True,
            marketing_emails=False,
            theme="system",
            compact_view=False
        )
        db.add(user_prefs)

    # Seed demo candidate facts
    facts = db.query(CandidateFactsModel).filter(CandidateFactsModel.user_id == "usr_demo_101").first()
    if not facts:
        facts = CandidateFactsModel(
            user_id="usr_demo_101",
            facts={
                "work_authorization": "Authorized to work in the US (Citizen / Permanent Resident)",
                "requires_sponsorship": "No",
                "years_of_experience": "6+ years",
                "highest_education": "Bachelor of Science in Computer Science, UC Berkeley",
                "notice_period": "2 weeks",
                "preferred_location": "San Francisco, CA or Remote",
                "linkedin_url": "https://linkedin.com/in/alex-rivera-dev",
                "github_url": "https://github.com/alexrivera-tech",
                "portfolio_url": "https://alexrivera.dev"
            }
        )
        db.add(facts)

    # Seed demo auto-apply preferences
    auto_prefs = db.query(AutoApplyPreferenceModel).filter(AutoApplyPreferenceModel.user_id == "usr_demo_101").first()
    if not auto_prefs:
        auto_prefs = AutoApplyPreferenceModel(
            user_id="usr_demo_101",
            enabled=True,
            target_roles=["Senior Full-Stack Engineer", "Staff Software Engineer", "Backend Architect"],
            min_salary=170000,
            remote_only=True,
            min_match_threshold=85,
            daily_submission_limit=10,
            auto_review_tailoring=True
        )
        db.add(auto_prefs)

    # Seed demo season
    season = db.query(UserSeasonModel).filter(UserSeasonModel.user_id == "usr_demo_101").first()
    if not season:
        season = UserSeasonModel(
            user_id="usr_demo_101",
            season_data={
                "season_number": 3,
                "title": "Season 3: The Offer Hunt",
                "ends_in_days": 18,
                "current_level": 4,
                "current_xp": 1420,
                "xp_to_next_level": 2000,
                "streak_days": 12,
                "weekly_goal": {
                    "target_applications": 10,
                    "completed_applications": 7,
                    "target_tailored_resumes": 4,
                    "completed_tailored_resumes": 3
                },
                "badges": [
                    {"id": "b_ats_perfection", "name": "ATS Perfectionist", "description": "Achieved a 95%+ ATS score.", "unlocked": True, "icon": "Target"},
                    {"id": "b_interview_unlocked", "name": "First Round Champion", "description": "Advanced to Technical Interview.", "unlocked": True, "icon": "Sparkles"},
                    {"id": "b_tailor_pro", "name": "Keyword Sorcerer", "description": "Tailored 5+ resumes.", "unlocked": True, "icon": "Zap"},
                    {"id": "b_streak_master", "name": "Consistency Titan", "description": "10-day job search streak.", "unlocked": True, "icon": "Flame"},
                    {"id": "b_offer_titan", "name": "Signed & Delivered", "description": "Logged accepted offer.", "unlocked": False, "icon": "Trophy"}
                ]
            }
        )
        db.add(season)

    # Seed demo billing
    billing = db.query(UserBillingModel).filter(UserBillingModel.user_id == "usr_demo_101").first()
    if not billing:
        billing = UserBillingModel(
            user_id="usr_demo_101",
            tier="pro",
            status="active",
            renewal_date="2026-12-16",
            payment_method="Visa ending in 4242",
            features=[
                "Unlimited ATS Resume Checks",
                "Unlimited Keyword Tailoring Runs",
                "Autonomous Auto-Apply (up to 50 / week)",
                "Premium ATS Verified Templates",
                "Priority LLM Generation Engine",
                "Full Kanban Application Tracker"
            ],
            quotas={
                "tailoring_runs_remaining": "Unlimited",
                "auto_applies_used_this_week": 8,
                "auto_applies_limit": 50
            },
            payment_history=[
                {"id": "inv_101", "date": "2026-11-16", "amount": "$29.00", "status": "paid", "description": "RESII Pro Membership (Monthly)", "receipt_url": "#"},
                {"id": "inv_100", "date": "2026-10-16", "amount": "$29.00", "status": "paid", "description": "RESII Pro Membership (Monthly)", "receipt_url": "#"}
            ]
        )
        db.add(billing)

    # Seed demo job applications
    app_count = db.query(JobApplicationModel).filter(JobApplicationModel.user_id == "usr_demo_101").count()
    if app_count == 0:
        demo_apps = [
            JobApplicationModel(
                id="app_001",
                user_id="usr_demo_101",
                job_id="job_101",
                title="Senior Full-Stack Engineer",
                company="Stripe",
                location="San Francisco, CA (Remote)",
                salary_range="$175k - $220k",
                stage="interview",
                match_percentage=94,
                applied_date="2026-11-10",
                notes="Recruiter screen completed with Sarah. Technical systems design interview scheduled.",
                next_step="Technical Round with Staff Architect",
                next_step_date="2026-11-19",
                created_at="2026-11-10T12:00:00Z"
            ),
            JobApplicationModel(
                id="app_002",
                user_id="usr_demo_101",
                job_id="job_103",
                title="Frontend Architect",
                company="Linear",
                location="San Francisco, CA (Remote)",
                salary_range="$165k - $210k",
                stage="applied",
                match_percentage=92,
                applied_date="2026-11-14",
                notes="Application submitted via Greenhouse with tailored portfolio resume.",
                next_step="Recruiter Screen",
                next_step_date="2026-11-21",
                created_at="2026-11-14T12:00:00Z"
            ),
            JobApplicationModel(
                id="app_003",
                user_id="usr_demo_101",
                job_id="job_102",
                title="Distributed Systems Engineer",
                company="Datadog",
                location="New York, NY (Remote)",
                salary_range="$180k - $230k",
                stage="offer",
                match_percentage=89,
                applied_date="2026-10-28",
                notes="Received written offer package. Equity grant 12,000 RSUs vesting over 4 years.",
                next_step="Decision by Monday",
                next_step_date="2026-11-24",
                created_at="2026-10-28T12:00:00Z"
            )
        ]
        db.add_all(demo_apps)

    db.commit()


def init_db(custom_engine=None):
    """
    Initializes database schema and executes idempotent migrations/seeding.
    Safe to run repeatedly on startup.
    """
    target_engine = custom_engine or engine
    Base.metadata.create_all(bind=target_engine)

    # Idempotent migration for ai_provider_settings.api_key_encrypted
    try:
        from sqlalchemy import text
        with target_engine.connect() as conn:
            r = conn.execute(text("PRAGMA table_info(ai_provider_settings)")).fetchall()
            cols = [row[1] for row in r]
            if "api_key_encrypted" not in cols and len(cols) > 0:
                conn.execute(text("ALTER TABLE ai_provider_settings ADD COLUMN api_key_encrypted TEXT"))
                conn.commit()

            r_ep = conn.execute(text("PRAGMA table_info(extension_pairing_codes)")).fetchall()
            cols_ep = [row[1] for row in r_ep]
            if "code" in cols_ep:
                # Migrate to hash-only table: drop legacy table with NOT NULL code column
                conn.execute(text("DROP TABLE extension_pairing_codes"))
                conn.commit()
                Base.metadata.create_all(bind=target_engine)
            elif "code_hash" not in cols_ep and len(cols_ep) > 0:
                conn.execute(text("ALTER TABLE extension_pairing_codes ADD COLUMN code_hash VARCHAR(128)"))
                conn.commit()
    except Exception:
        pass

    # Seed demo data if appropriate
    sm = sessionmaker(autocommit=False, autoflush=False, bind=target_engine)
    with sm() as db:
        seed_demo_data(db)
