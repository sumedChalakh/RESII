import os
import io
import time
import uuid
import json
import sqlite3
import tempfile
import shutil
import pytest
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
from fastapi.testclient import TestClient

from api.config import settings
from api.main import app
from api.models import (
    Base,
    UserModel,
    SessionModel,
    ResumeModel,
    ManagedFileModel,
    JobApplicationModel,
    SavedSearchModel,
    TailorReviewModel,
    TailorEventModel,
    AutoApplyPreferenceModel,
    CandidateFactsModel,
    SubmissionHistoryModel,
    UserProfileModel,
    UserPreferenceModel,
    UserSeasonModel,
    UserBillingModel,
    PublicCheckModel,
)
from api.db import create_app_engine, init_db, SessionLocal
from api.security import hash_password, verify_password, sign_session_id, generate_csrf_token
from api.storage import FileStorageManager
from api.backup import create_backup, restore_backup
from api.database import users_db, active_sessions
from api.resumes import resumes_db

client = TestClient(app)

# Helper to create an isolated user with active session
def create_test_user_session(user_id: str, email: str, password: str = "securepass123"):
    pwd_hash = hash_password(password)
    user_record = {
        "id": user_id,
        "email": email,
        "name": f"User {user_id}",
        "role": "user",
        "created_at": "2026-11-19T00:00:00Z",
        "entitlements": ["free", "ats_check", "resume_edit"],
        "password_hash": pwd_hash
    }
    users_db[email] = user_record
    
    session_id = f"sess_{user_id}_{int(time.time()*1000)}"
    now = time.time()
    active_sessions[session_id] = {
        "user": user_record,
        "created_at": now,
        "last_active": now
    }
    cookie_val = sign_session_id(session_id, settings.SECRET_KEY)
    csrf_token = generate_csrf_token(session_id, settings.SECRET_KEY)
    return user_record, session_id, cookie_val, csrf_token


# =========================================================================
# TEST 1: Database initialization and table creation
# =========================================================================
def test_database_initialization_and_table_creation():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_init.db").replace("\\", "/")
        test_engine = create_app_engine(f"sqlite:///{db_path}")
        try:
            init_db(custom_engine=test_engine)

            insp = inspect(test_engine)
            tables = set(insp.get_table_names())
            expected_tables = {
                "users",
                "sessions",
                "resumes",
                "managed_files",
                "job_applications",
                "saved_searches",
                "tailor_reviews",
                "tailor_events",
                "auto_apply_preferences",
                "candidate_facts",
                "submission_history",
                "user_profiles",
                "user_preferences",
                "user_seasons",
                "user_billing",
                "public_checks"
            }
            missing = expected_tables - tables
            assert len(missing) == 0, f"Missing tables in database: {missing}"
        finally:
            test_engine.dispose()


# =========================================================================
# TEST 2: SQLite PRAGMAs and configuration
# =========================================================================
def test_sqlite_pragmas_and_configuration():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_pragmas.db").replace("\\", "/")
        test_engine = create_app_engine(f"sqlite:///{db_path}")
        try:
            init_db(custom_engine=test_engine)

            with test_engine.connect() as conn:
                journal_mode = conn.execute(text("PRAGMA journal_mode;")).scalar()
                foreign_keys = conn.execute(text("PRAGMA foreign_keys;")).scalar()
                busy_timeout = conn.execute(text("PRAGMA busy_timeout;")).scalar()
                synchronous = conn.execute(text("PRAGMA synchronous;")).scalar()

                assert journal_mode.lower() == "wal", f"Expected WAL, got {journal_mode}"
                assert foreign_keys == 1, f"Expected foreign_keys=1, got {foreign_keys}"
                assert busy_timeout == 5000, f"Expected busy_timeout=5000, got {busy_timeout}"
                assert synchronous in (1, "1", "NORMAL", "normal"), f"Expected NORMAL synchronous mode, got {synchronous}"
        finally:
            test_engine.dispose()


# =========================================================================
# TEST 3: User creation and retrieval
# =========================================================================
def test_user_creation_and_retrieval():
    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    email = f"user_{uuid.uuid4().hex[:8]}@example.com"
    pwd_hash = hash_password("SecretPassword!123")

    with SessionLocal() as db:
        user = UserModel(
            id=user_id,
            email=email,
            name="Persistence Test User",
            password_hash=pwd_hash,
            role="user",
            entitlements=["free", "resume_edit"],
            created_at="2026-11-19T00:00:00Z"
        )
        db.add(user)
        db.commit()

    # Retrieve via proxy and direct session
    assert email in users_db
    retrieved = users_db[email]
    assert retrieved["id"] == user_id
    assert retrieved["name"] == "Persistence Test User"
    assert retrieved["role"] == "user"


# =========================================================================
# TEST 4: Password hash persistence
# =========================================================================
def test_password_hash_persistence():
    email = f"auth_{uuid.uuid4().hex[:8]}@example.com"
    raw_pass = "MyStrongArgonPassword#2026"
    pwd_hash = hash_password(raw_pass)

    users_db[email] = {
        "id": f"usr_{uuid.uuid4().hex[:8]}",
        "email": email,
        "name": "Auth Tester",
        "password_hash": pwd_hash,
        "role": "user",
        "entitlements": ["free"],
        "created_at": "2026-11-19T00:00:00Z"
    }

    # Verify password against persisted record: verify_password(hash_value, password)
    user_record = users_db[email]
    assert verify_password(user_record["password_hash"], raw_pass) is True
    assert verify_password(user_record["password_hash"], "WrongPassword!") is False


# =========================================================================
# TEST 5: Session persistence across simulated restart
# =========================================================================
def test_session_persistence_across_restart():
    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    email = f"sess_{uuid.uuid4().hex[:8]}@example.com"
    user, session_id, cookie, csrf = create_test_user_session(user_id, email)

    # Directly verify in DB
    with SessionLocal() as db:
        db_sess = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        assert db_sess is not None
        assert db_sess.user_id == user_id

    # Simulated restart: reading from a fresh session instance
    with SessionLocal() as fresh_db:
        recovered = fresh_db.query(SessionModel).filter(SessionModel.id == session_id).first()
        assert recovered is not None
        assert recovered.user_id == user_id
        assert recovered.user.email == email


# =========================================================================
# TEST 6: Session expiry and revocation
# =========================================================================
def test_session_expiry_and_revocation():
    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    email = f"exp_{uuid.uuid4().hex[:8]}@example.com"
    user, session_id, cookie, csrf = create_test_user_session(user_id, email)

    # Revoke session via proxy deletion
    assert session_id in active_sessions
    del active_sessions[session_id]

    # Verify revoked in DB and no longer in active_sessions
    assert session_id not in active_sessions
    with SessionLocal() as db:
        record = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        assert record is not None
        assert record.revoked is True


# =========================================================================
# TEST 7: Resume persistence across restart
# =========================================================================
def test_resume_persistence_across_restart():
    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    email = f"res_{uuid.uuid4().hex[:8]}@example.com"
    user, session_id, cookie, csrf = create_test_user_session(user_id, email)

    resume_id = f"res_{uuid.uuid4().hex[:8]}"
    doc_tree = {
        "header": {"name": "Jordan Developer", "title": "Backend Engineer", "contacts": ["jordan@test.com"]},
        "sections": [
            {
                "id": "sec_exp",
                "type": "experience",
                "title": "Experience",
                "items": [
                    {
                        "id": "item_1",
                        "title": "Senior Engineer",
                        "subtitle": "ScaleCorp",
                        "date_range": "2023 - Present",
                        "location": "Remote",
                        "description": "",
                        "bullets": ["Architected distributed messaging pipelines."]
                    }
                ]
            }
        ]
    }

    resumes_db[resume_id] = {
        "id": resume_id,
        "user_id": user_id,
        "title": "Jordan Resume 2026",
        "target_role": "Backend Engineer",
        "template": "classic-ats",
        "version": 1,
        "document": doc_tree,
        "updated_at": "2026-11-19T10:00:00Z"
    }

    # Simulate restart: open fresh session and read directly
    with SessionLocal() as db:
        persisted = db.query(ResumeModel).filter(ResumeModel.id == resume_id).first()
        assert persisted is not None
        assert persisted.user_id == user_id
        assert persisted.title == "Jordan Resume 2026"
        assert persisted.document["header"]["name"] == "Jordan Developer"
        assert len(persisted.document["sections"]) == 1


# =========================================================================
# TEST 8: Document-tree persistence with nested sections
# =========================================================================
def test_document_tree_persistence_nested_structure():
    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    email = f"tree_{uuid.uuid4().hex[:8]}@example.com"
    user, session_id, cookie, csrf = create_test_user_session(user_id, email)

    resume_id = f"res_{uuid.uuid4().hex[:8]}"
    complex_tree = {
        "header": {
            "name": "Samantha Chen",
            "title": "Principal Architect",
            "contacts": ["samantha@domain.com", "+1 555 999 8888", "Seattle, WA"]
        },
        "sections": [
            {
                "id": "sec_sum",
                "type": "summary",
                "title": "Professional Summary",
                "items": [
                    {
                        "id": "item_sum_1",
                        "title": "",
                        "subtitle": "",
                        "date_range": "",
                        "location": "",
                        "description": "Enterprise cloud architect with 12+ years designing mission-critical systems.",
                        "bullets": []
                    }
                ]
            },
            {
                "id": "sec_skills",
                "type": "skills",
                "title": "Core Competencies",
                "items": [
                    {
                        "id": "item_sk_1",
                        "title": "Languages & Frameworks",
                        "subtitle": "",
                        "date_range": "",
                        "location": "",
                        "description": "Python, Go, TypeScript, React, Next.js, FastAPI, Kubernetes",
                        "bullets": []
                    }
                ]
            }
        ]
    }

    resumes_db[resume_id] = {
        "id": resume_id,
        "user_id": user_id,
        "title": "Samantha Architect",
        "target_role": "Principal Architect",
        "template": "modern-compact",
        "version": 1,
        "document": complex_tree,
        "updated_at": "2026-11-19T10:00:00Z"
    }

    with SessionLocal() as db:
        res = db.query(ResumeModel).filter(ResumeModel.id == resume_id).first()
        assert res is not None
        assert len(res.document["sections"]) == 2
        assert res.document["sections"][0]["items"][0]["description"].startswith("Enterprise cloud architect")


# =========================================================================
# TEST 9: Document version increments
# =========================================================================
def test_document_version_increments():
    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    email = f"ver_{uuid.uuid4().hex[:8]}@example.com"
    user, session_id, cookie, csrf = create_test_user_session(user_id, email)

    resume_id = f"res_{uuid.uuid4().hex[:8]}"
    initial_tree = {
        "header": {"name": "Version Test", "title": "Developer", "contacts": []},
        "sections": []
    }
    resumes_db[resume_id] = {
        "id": resume_id,
        "user_id": user_id,
        "title": "Version Test Resume",
        "target_role": "Developer",
        "template": "classic-ats",
        "version": 1,
        "document": initial_tree,
        "updated_at": "2026-11-19T10:00:00Z"
    }

    # Update through the API
    update_payload = {
        "document": {
            "header": {"name": "Version Test Updated", "title": "Lead Developer", "contacts": []},
            "sections": []
        },
        "version": 1
    }
    res = client.put(
        f"/api/v3/resumes/{resume_id}/document",
        json=update_payload,
        cookies={settings.COOKIE_NAME: cookie},
        headers={"x-csrf-token": csrf}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["version"] == 2
    assert data["document"]["header"]["name"] == "Version Test Updated"

    # Confirm in DB
    with SessionLocal() as db:
        db_res = db.query(ResumeModel).filter(ResumeModel.id == resume_id).first()
        assert db_res.version == 2


# =========================================================================
# TEST 10: Stale document update returns 409 Conflict
# =========================================================================
def test_stale_document_update_returns_409():
    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    email = f"conflict_{uuid.uuid4().hex[:8]}@example.com"
    user, session_id, cookie, csrf = create_test_user_session(user_id, email)

    resume_id = f"res_{uuid.uuid4().hex[:8]}"
    resumes_db[resume_id] = {
        "id": resume_id,
        "user_id": user_id,
        "title": "Conflict Resume",
        "target_role": "Engineer",
        "template": "classic-ats",
        "version": 5,  # current version in DB is 5
        "document": {"header": {"name": "Test", "title": "Engineer", "contacts": []}, "sections": []},
        "updated_at": "2026-11-19T10:00:00Z"
    }

    # Client sends stale version: 4
    stale_payload = {
        "document": {"header": {"name": "Stale Name", "title": "Engineer", "contacts": []}, "sections": []},
        "version": 4
    }
    res = client.put(
        f"/api/v3/resumes/{resume_id}/document",
        json=stale_payload,
        cookies={settings.COOKIE_NAME: cookie},
        headers={"x-csrf-token": csrf}
    )
    assert res.status_code == 409
    assert "changed in another tab" in str(res.json()).lower()


# =========================================================================
# TEST 11: Concurrent update conflict handling
# =========================================================================
def test_concurrent_update_conflict_handling():
    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    email = f"race_{uuid.uuid4().hex[:8]}@example.com"
    user, session_id, cookie, csrf = create_test_user_session(user_id, email)

    resume_id = f"res_{uuid.uuid4().hex[:8]}"
    resumes_db[resume_id] = {
        "id": resume_id,
        "user_id": user_id,
        "title": "Race Resume",
        "target_role": "Engineer",
        "template": "classic-ats",
        "version": 1,
        "document": {"header": {"name": "Race Original", "title": "Engineer", "contacts": []}, "sections": []},
        "updated_at": "2026-11-19T10:00:00Z"
    }

    # First client updates from v1 -> succeeds to v2
    res1 = client.put(
        f"/api/v3/resumes/{resume_id}/document",
        json={"document": {"header": {"name": "Winner Update", "title": "Engineer", "contacts": []}, "sections": []}, "version": 1},
        cookies={settings.COOKIE_NAME: cookie},
        headers={"x-csrf-token": csrf}
    )
    assert res1.status_code == 200
    assert res1.json()["version"] == 2

    # Second client also submits from v1 (stale) -> 409 Conflict
    res2 = client.put(
        f"/api/v3/resumes/{resume_id}/document",
        json={"document": {"header": {"name": "Late Update", "title": "Engineer", "contacts": []}, "sections": []}, "version": 1},
        cookies={settings.COOKIE_NAME: cookie},
        headers={"x-csrf-token": csrf}
    )
    assert res2.status_code == 409


# =========================================================================
# TEST 12: User ownership isolation
# =========================================================================
def test_user_ownership_isolation():
    user_a, sess_a, cookie_a, csrf_a = create_test_user_session(f"usr_a_{uuid.uuid4().hex[:6]}", f"a_{uuid.uuid4().hex[:6]}@example.com")
    user_b, sess_b, cookie_b, csrf_b = create_test_user_session(f"usr_b_{uuid.uuid4().hex[:6]}", f"b_{uuid.uuid4().hex[:6]}@example.com")

    # Create resume for User A
    resume_a_id = f"res_a_{uuid.uuid4().hex[:8]}"
    resumes_db[resume_a_id] = {
        "id": resume_a_id,
        "user_id": user_a["id"],
        "title": "Private Resume A",
        "target_role": "Architect",
        "template": "classic-ats",
        "version": 1,
        "document": {"header": {"name": "User A", "title": "Architect", "contacts": []}, "sections": []},
        "updated_at": "2026-11-19T10:00:00Z"
    }

    # User B attempts to access User A's resume
    res = client.get(
        f"/api/v3/resumes/{resume_a_id}",
        cookies={settings.COOKIE_NAME: cookie_b}
    )
    assert res.status_code == 404

    # User B attempts to edit User A's resume
    res = client.put(
        f"/api/v3/resumes/{resume_a_id}/document",
        json={"document": {"header": {"name": "Hacked", "title": "None", "contacts": []}, "sections": []}, "version": 1},
        cookies={settings.COOKIE_NAME: cookie_b},
        headers={"x-csrf-token": csrf_b}
    )
    assert res.status_code == 404


# =========================================================================
# TEST 13: Job and application record persistence
# =========================================================================
def test_job_and_application_record_persistence():
    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    email = f"job_{uuid.uuid4().hex[:8]}@example.com"
    user, session_id, cookie, csrf = create_test_user_session(user_id, email)

    # Create application via API
    app_payload = {
        "job_id": "job_999",
        "title": "Staff Backend Engineer",
        "company": "Stripe",
        "location": "San Francisco, CA",
        "salary_range": "$200k - $250k",
        "stage": "applied",
        "match_percentage": 94,
        "applied_date": "2026-11-19",
        "notes": "Applied via referral"
    }
    res = client.post(
        "/api/jobs/applications",
        json=app_payload,
        cookies={settings.COOKIE_NAME: cookie},
        headers={"x-csrf-token": csrf}
    )
    assert res.status_code == 200
    created_app = res.json()
    app_id = created_app["id"]

    # Verify directly in SQLite
    with SessionLocal() as db:
        app_rec = db.query(JobApplicationModel).filter(JobApplicationModel.id == app_id).first()
        assert app_rec is not None
        assert app_rec.company == "Stripe"
        assert app_rec.user_id == user_id
        assert app_rec.match_percentage == 94


# =========================================================================
# TEST 14: Template preference persistence
# =========================================================================
def test_template_preference_persistence():
    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    email = f"tmpl_{uuid.uuid4().hex[:8]}@example.com"
    user, session_id, cookie, csrf = create_test_user_session(user_id, email)

    resume_id = f"res_{uuid.uuid4().hex[:8]}"
    resumes_db[resume_id] = {
        "id": resume_id,
        "user_id": user_id,
        "title": "Template Resume",
        "target_role": "Engineer",
        "template": "classic-ats",
        "version": 1,
        "document": {"header": {"name": "Test", "title": "Dev", "contacts": []}, "sections": []},
        "updated_at": "2026-11-19T10:00:00Z"
    }

    # Switch template via API
    res = client.post(
        "/api/v3/templates/switch",
        json={"resume_id": resume_id, "template_id": "modern_tech"},
        cookies={settings.COOKIE_NAME: cookie},
        headers={"x-csrf-token": csrf}
    )
    assert res.status_code == 200

    # Verify in DB
    with SessionLocal() as db:
        r = db.query(ResumeModel).filter(ResumeModel.id == resume_id).first()
        assert r.active_template == "modern_tech"


# =========================================================================
# TEST 15: Transaction rollback on error
# =========================================================================
def test_transaction_rollback_on_error():
    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    email = f"tx_{uuid.uuid4().hex[:8]}@example.com"
    user, session_id, cookie, csrf = create_test_user_session(user_id, email)

    with SessionLocal() as db:
        try:
            # Add a valid record
            app1 = JobApplicationModel(
                id=f"app_{uuid.uuid4().hex[:8]}",
                user_id=user_id,
                title="Role 1",
                company="Company 1",
                created_at="2026-11-19T00:00:00Z"
            )
            db.add(app1)
            db.flush()

            # Attempt to add an invalid record causing failure (duplicate primary key)
            app2 = JobApplicationModel(
                id=app1.id,
                user_id=user_id,
                title="Role 2",
                company="Company 2",
                created_at="2026-11-19T00:00:00Z"
            )
            db.add(app2)
            db.commit()
        except IntegrityError:
            db.rollback()

    # Verify app1 was rolled back and not persisted
    with SessionLocal() as db:
        rec = db.query(JobApplicationModel).filter(JobApplicationModel.id == app1.id).first()
        assert rec is None, "Transaction should have rolled back completely"


# =========================================================================
# TEST 16: Foreign-key enforcement
# =========================================================================
def test_foreign_key_enforcement():
    with SessionLocal() as db:
        # Inserting a resume for a non-existent user should fail when foreign keys are ON
        orphan_resume = ResumeModel(
            id=f"res_{uuid.uuid4().hex[:8]}",
            user_id="usr_does_not_exist_in_db_xyz",
            title="Orphan Resume",
            target_role="Tester",
            active_template="classic-ats",
            version=1,
            document={},
            created_at="2026-11-19T10:00:00Z",
            updated_at="2026-11-19T10:00:00Z"
        )
        db.add(orphan_resume)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


# =========================================================================
# TEST 17: Duplicate migration prevention (idempotency)
# =========================================================================
def test_duplicate_migration_prevention():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_idempotent.db").replace("\\", "/")
        test_engine = create_app_engine(f"sqlite:///{db_path}")
        try:
            # Call init_db multiple times
            init_db(custom_engine=test_engine)
            init_db(custom_engine=test_engine)
            init_db(custom_engine=test_engine)

            insp = inspect(test_engine)
            assert "users" in insp.get_table_names()
            assert "resumes" in insp.get_table_names()
        finally:
            test_engine.dispose()


# =========================================================================
# TEST 18: Managed file access controls and path traversal prevention
# =========================================================================
def test_managed_file_access_controls_and_path_traversal():
    with tempfile.TemporaryDirectory() as tmpdir:
        mgr = FileStorageManager(base_dir=tmpdir)
        user_a, sess_a, cookie_a, csrf_a = create_test_user_session(f"usr_{uuid.uuid4().hex[:8]}", f"fa_{uuid.uuid4().hex[:8]}@example.com")
        user_b, sess_b, cookie_b, csrf_b = create_test_user_session(f"usr_{uuid.uuid4().hex[:8]}", f"fb_{uuid.uuid4().hex[:8]}@example.com")

        # Save file with traversal attempt in filename
        with SessionLocal() as db:
            file_record = mgr.save_file(
                db=db,
                user_id=user_a["id"],
                original_filename="../../etc/passwd",
                content=b"Sample resume data bytes",
                content_type="application/pdf"
            )
            db.commit()
            file_id = file_record.id

            # Verify sanitized filename in DB
            assert file_record.original_filename == "passwd"

            # User A can retrieve it
            fname, data = mgr.get_file_content(db, user_a["id"], file_id)
            assert fname == "passwd"
            assert data == b"Sample resume data bytes"

            # User B cannot retrieve it (raises FileNotFoundError)
            with pytest.raises(FileNotFoundError):
                mgr.get_file_content(db, user_b["id"], file_id)


# =========================================================================
# TEST 19: Backup creation and manifest integrity
# =========================================================================
def test_backup_creation_and_manifest_integrity():
    with tempfile.TemporaryDirectory() as tmpdir:
        backup_root = os.path.join(tmpdir, "backups").replace("\\", "/")
        result = create_backup(target_backup_dir=backup_root)
        assert result["status"] == "success"
        backup_folder = result["backup_dir"]

        # Check files exist
        assert os.path.exists(os.path.join(backup_folder, "resii_backup.db"))
        assert os.path.exists(os.path.join(backup_folder, "manifest.json"))
        assert os.path.isdir(os.path.join(backup_folder, "uploads"))

        # Check manifest contents
        with open(os.path.join(backup_folder, "manifest.json"), "r", encoding="utf-8") as f:
            manifest = json.load(f)
        assert "database" in manifest
        assert manifest["database"]["integrity"] == "verified"
        assert len(manifest["database"]["sha256"]) == 64


# =========================================================================
# TEST 20: Backup restore to separate target
# =========================================================================
def test_backup_restore_to_separate_target():
    with tempfile.TemporaryDirectory() as tmpdir:
        backup_root = os.path.join(tmpdir, "backups").replace("\\", "/")
        result = create_backup(target_backup_dir=backup_root)
        backup_dir = result["backup_dir"]

        restore_db = os.path.join(tmpdir, "restored.db").replace("\\", "/")
        restore_storage = os.path.join(tmpdir, "restored_storage").replace("\\", "/")

        restored = restore_backup(
            backup_folder=backup_dir,
            target_db_path=restore_db,
            target_storage_dir=restore_storage
        )
        assert restored["status"] == "restored"
        assert os.path.exists(restore_db)

        # Verify integrity of restored database
        conn = sqlite3.connect(restore_db)
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA integrity_check;")
            res = cursor.fetchone()
            assert res[0] == "ok"
        finally:
            conn.close()


# =========================================================================
# TEST 21: Phase 6B.2 security regression test
# =========================================================================
def test_phase6b2_security_regression():
    user, sess_id, cookie, csrf = create_test_user_session(
        f"usr_sec_{uuid.uuid4().hex[:6]}",
        f"sec_{uuid.uuid4().hex[:6]}@example.com"
    )

    # CSRF protection: state-changing POST without CSRF token must be rejected (403)
    res_no_csrf = client.post(
        "/api/jobs/applications",
        json={"title": "Engineer", "company": "Acme"},
        cookies={settings.COOKIE_NAME: cookie}
    )
    assert res_no_csrf.status_code == 403

    # CSRF protection with token succeeds
    res_with_csrf = client.post(
        "/api/jobs/applications",
        json={"title": "Engineer", "company": "Acme"},
        cookies={settings.COOKIE_NAME: cookie},
        headers={"x-csrf-token": csrf}
    )
    assert res_with_csrf.status_code == 200


# =========================================================================
# TEST 22: Phase 6C PDF/DOCX export regression test
# =========================================================================
def test_phase6c_pdf_docx_export_regression():
    user, sess_id, cookie, csrf = create_test_user_session(
        f"usr_exp_{uuid.uuid4().hex[:6]}",
        f"exp_{uuid.uuid4().hex[:6]}@example.com"
    )
    resume_id = f"res_{uuid.uuid4().hex[:8]}"

    genuine_doc_tree = {
        "header": {
            "name": "Marcus Aurelius",
            "title": "Principal Systems Engineer",
            "contacts": ["marcus@roman.net", "Rome, IT"]
        },
        "sections": [
            {
                "id": "sec_exp",
                "type": "experience",
                "title": "Experience",
                "items": [
                    {
                        "id": "item_1",
                        "title": "Emperor of Systems",
                        "subtitle": "Pax Romana Labs",
                        "date_range": "161 – 180 AD",
                        "location": "Rome",
                        "description": "Architected empire-wide logistics and governance protocols.",
                        "bullets": [
                            "Reduced query latency across 40 provinces by 50% via optimized courier pipelines.",
                            "Penned Meditations on asynchronous fault-tolerance."
                        ]
                    }
                ]
            }
        ]
    }

    resumes_db[resume_id] = {
        "id": resume_id,
        "user_id": user["id"],
        "title": "Marcus Resume",
        "target_role": "Principal Systems Engineer",
        "template": "classic-ats",
        "version": 1,
        "document": genuine_doc_tree,
        "updated_at": "2026-11-19T10:00:00Z"
    }

    # Test PDF Export
    pdf_res = client.get(
        f"/api/v3/resumes/{resume_id}/export/pdf",
        cookies={settings.COOKIE_NAME: cookie}
    )
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert pdf_res.content.startswith(b"%PDF")
    assert b"Marcus" in pdf_res.content or len(pdf_res.content) > 1000

    # Test DOCX Export
    docx_res = client.get(
        f"/api/v3/resumes/{resume_id}/export/docx",
        cookies={settings.COOKIE_NAME: cookie}
    )
    assert docx_res.status_code == 200
    assert docx_res.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert docx_res.content.startswith(b"PK\x03\x04")
