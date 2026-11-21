import time
from typing import Optional, Dict, Any, List
from sqlalchemy import (
    String,
    Integer,
    Float,
    Boolean,
    Text,
    JSON,
    ForeignKey,
    Index,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="user", nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    entitlements: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)

    # Relationships
    sessions = relationship("SessionModel", back_populates="user", cascade="all, delete-orphan")
    resumes = relationship("ResumeModel", back_populates="user", cascade="all, delete-orphan")
    applications = relationship("JobApplicationModel", back_populates="user", cascade="all, delete-orphan")
    managed_files = relationship("ManagedFileModel", back_populates="user", cascade="all, delete-orphan")


class SessionModel(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # Raw unsigned session ID
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at: Mapped[float] = mapped_column(Float, nullable=False, default=time.time)
    last_active: Mapped[float] = mapped_column(Float, nullable=False, default=time.time)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user = relationship("UserModel", back_populates="sessions")

    @property
    def user_data(self):
        if self.user:
            return {
                "id": self.user.id,
                "email": self.user.email,
                "name": self.user.name,
                "role": self.user.role,
                "entitlements": self.user.entitlements,
                "password_hash": self.user.password_hash
            }
        return {}


class ResumeModel(Base):
    __tablename__ = "resumes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)  # Optimistic concurrency counter
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ats_score: Mapped[int] = mapped_column(Integer, default=70, nullable=False)
    active_template: Mapped[str] = mapped_column(String(64), default="classic_spruce", nullable=False)
    template_meta: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    document: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)  # Phase 6C Document Tree
    target_role: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    target_company: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)

    user = relationship("UserModel", back_populates="resumes")
    files = relationship("ManagedFileModel", back_populates="resume", cascade="all, delete-orphan")

    @property
    def document_tree(self):
        return self.document

    @document_tree.setter
    def document_tree(self, value):
        self.document = value

    @property
    def name(self):
        return self.title

    @name.setter
    def name(self, value):
        self.title = value

    @property
    def template(self):
        return self.active_template

    @template.setter
    def template(self, value):
        self.active_template = value


class ManagedFileModel(Base):
    __tablename__ = "managed_files"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    resume_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("resumes.id", ondelete="SET NULL"), index=True, nullable=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)

    user = relationship("UserModel", back_populates="managed_files")
    resume = relationship("ResumeModel", back_populates="files")


class JobApplicationModel(Base):
    __tablename__ = "job_applications"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    job_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(255), default="Remote", nullable=True)
    salary_range: Mapped[Optional[str]] = mapped_column(String(128), default="Competitive", nullable=True)
    stage: Mapped[str] = mapped_column(String(32), default="saved", nullable=False)
    match_percentage: Mapped[int] = mapped_column(Integer, default=85, nullable=False)
    applied_date: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, default="", nullable=True)
    next_step: Mapped[Optional[str]] = mapped_column(String(255), default="Initial prep", nullable=True)
    next_step_date: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)

    user = relationship("UserModel", back_populates="applications")


class SavedSearchModel(Base):
    __tablename__ = "saved_searches"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    query: Mapped[str] = mapped_column(String(255), nullable=False)
    is_remote: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)


class TailorReviewModel(Base):
    __tablename__ = "tailor_reviews"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    resume_id: Mapped[str] = mapped_column(String(64), ForeignKey("resumes.id", ondelete="CASCADE"), index=True, nullable=False)
    job_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    company_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending_review", nullable=False)
    total_suggestions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    suggestions: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    events_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tailored_resume_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)


class TailorEventModel(Base):
    __tablename__ = "tailor_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    review_id: Mapped[str] = mapped_column(String(64), ForeignKey("tailor_reviews.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    line_id: Mapped[str] = mapped_column(String(64), nullable=False)
    original_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    new_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timestamp: Mapped[str] = mapped_column(String(64), nullable=False)


class AutoApplyPreferenceModel(Base):
    __tablename__ = "auto_apply_preferences"

    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    target_roles: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    min_salary: Mapped[int] = mapped_column(Integer, default=120000, nullable=False)
    remote_only: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    min_match_threshold: Mapped[int] = mapped_column(Integer, default=80, nullable=False)
    daily_submission_limit: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    auto_review_tailoring: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class CandidateFactsModel(Base):
    __tablename__ = "candidate_facts"

    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    facts: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class SubmissionHistoryModel(Base):
    __tablename__ = "submission_history"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(255), nullable=False)
    submitted_at: Mapped[str] = mapped_column(String(64), nullable=False)
    match_percentage: Mapped[int] = mapped_column(Integer, default=85, nullable=False)
    tailored_resume: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(64), default="submitted_successfully", nullable=False)
    form_provider: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class UserProfileModel(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(255), default="Software Professional", nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(255), default="Remote", nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, default="", nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(64), default="", nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(255), default="", nullable=True)
    google_drive_connected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    google_account_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class UserPreferenceModel(Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    email_job_alerts: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_weekly_digest: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    marketing_emails: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    theme: Mapped[str] = mapped_column(String(32), default="system", nullable=False)
    compact_view: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class UserSeasonModel(Base):
    __tablename__ = "user_seasons"

    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    season_data: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)


class UserBillingModel(Base):
    __tablename__ = "user_billing"

    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    tier: Mapped[str] = mapped_column(String(32), default="free", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    renewal_date: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    payment_method: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    features: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    quotas: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    payment_history: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)


class PublicCheckModel(Base):
    __tablename__ = "public_checks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    data: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)


class CoverLetterModel(Base):
    __tablename__ = "cover_letters"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    job_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    job_title: Mapped[str] = mapped_column(String(255), nullable=False)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    tone: Mapped[str] = mapped_column(String(32), default="professional", nullable=False)
    length: Mapped[str] = mapped_column(String(32), default="standard", nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    paragraphs: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    grounded_claims: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)

    user = relationship("UserModel")


class AIProviderSettingModel(Base):
    __tablename__ = "ai_provider_settings"

    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), default="freeflow", nullable=False)
    model: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    base_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    api_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    api_key_redacted: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    temperature: Mapped[float] = mapped_column(Float, default=0.2, nullable=False)
    timeout_seconds: Mapped[float] = mapped_column(Float, default=30.0, nullable=False)

    user = relationship("UserModel")


class ExtensionPairingCodeModel(Base):
    __tablename__ = "extension_pairing_codes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    code_hash: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    created_at: Mapped[float] = mapped_column(Float, nullable=False)
    expires_at: Mapped[float] = mapped_column(Float, nullable=False)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user = relationship("UserModel")

