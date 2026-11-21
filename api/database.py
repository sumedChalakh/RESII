import time
from collections.abc import MutableMapping
from typing import Dict, Any, Optional, List, Iterator
from api.db import SessionLocal
from api.models import UserModel, SessionModel
from api.security import hash_password

class SessionEntryProxy(MutableMapping):
    """Proxy representing an individual active user session backed by SQLite."""

    def __init__(self, session_id: str):
        self.session_id = session_id

    def _get_model(self, db):
        return db.query(SessionModel).filter(
            SessionModel.id == self.session_id,
            SessionModel.revoked == False
        ).first()

    def __getitem__(self, key: str) -> Any:
        with SessionLocal() as db:
            m = self._get_model(db)
            if not m:
                raise KeyError(self.session_id)
            if key == "user":
                u = m.user
                return {
                    "id": u.id,
                    "email": u.email,
                    "name": u.name,
                    "role": u.role,
                    "avatar_url": u.avatar_url,
                    "created_at": u.created_at,
                    "entitlements": u.entitlements,
                    "password_hash": u.password_hash
                }
            elif key == "created_at":
                return m.created_at
            elif key == "last_active":
                return m.last_active
            elif key == "revoked":
                return m.revoked
            raise KeyError(key)

    def __setitem__(self, key: str, value: Any) -> None:
        with SessionLocal() as db:
            m = self._get_model(db)
            if not m:
                raise KeyError(self.session_id)
            if key == "last_active":
                m.last_active = float(value)
            elif key == "created_at":
                m.created_at = float(value)
            elif key == "revoked":
                m.revoked = bool(value)
            db.commit()

    def __delitem__(self, key: str) -> None:
        pass

    def __iter__(self) -> Iterator[str]:
        return iter(["user", "created_at", "last_active", "revoked"])

    def __len__(self) -> int:
        return 4

    def get(self, key: str, default: Any = None) -> Any:
        try:
            return self[key]
        except KeyError:
            return default


class ActiveSessionsProxy(MutableMapping):
    """Database-backed proxy mapping for active sessions."""

    def __getitem__(self, session_id: str) -> SessionEntryProxy:
        with SessionLocal() as db:
            sess = db.query(SessionModel).filter(
                SessionModel.id == session_id,
                SessionModel.revoked == False
            ).first()
            if not sess:
                raise KeyError(session_id)
        return SessionEntryProxy(session_id)

    def __setitem__(self, session_id: str, data: Dict[str, Any]) -> None:
        with SessionLocal() as db:
            sess = db.query(SessionModel).filter(SessionModel.id == session_id).first()
            user_data = data.get("user", {})
            user_id = data.get("user_id") or user_data.get("id", "usr_demo_101")
            
            # Ensure user exists first
            user_model = db.query(UserModel).filter(UserModel.id == user_id).first()
            if not user_model and user_data:
                user_model = UserModel(
                    id=user_id,
                    email=user_data.get("email", f"{user_id}@resii.com"),
                    name=user_data.get("name", "User"),
                    role=user_data.get("role", "user"),
                    avatar_url=user_data.get("avatar_url"),
                    created_at=user_data.get("created_at", "2026-01-15T08:00:00Z"),
                    entitlements=user_data.get("entitlements", ["free"]),
                    password_hash=user_data.get("password_hash", "")
                )
                db.add(user_model)
                db.flush()

            now = time.time()
            created_at = float(data.get("created_at", now))
            last_active = float(data.get("last_active", now))

            if sess:
                sess.user_id = user_id
                sess.created_at = created_at
                sess.last_active = last_active
                sess.revoked = False
            else:
                sess = SessionModel(
                    id=session_id,
                    user_id=user_id,
                    created_at=created_at,
                    last_active=last_active,
                    revoked=False
                )
                db.add(sess)
            db.commit()

    def __delitem__(self, session_id: str) -> None:
        with SessionLocal() as db:
            sess = db.query(SessionModel).filter(SessionModel.id == session_id).first()
            if sess:
                sess.revoked = True
                db.commit()

    def __contains__(self, session_id: Any) -> bool:
        if not isinstance(session_id, str):
            return False
        with SessionLocal() as db:
            sess = db.query(SessionModel).filter(
                SessionModel.id == session_id,
                SessionModel.revoked == False
            ).first()
            return sess is not None

    def __iter__(self) -> Iterator[str]:
        with SessionLocal() as db:
            ids = [s.id for s in db.query(SessionModel.id).filter(SessionModel.revoked == False).all()]
        return iter(ids)

    def __len__(self) -> int:
        with SessionLocal() as db:
            return db.query(SessionModel).filter(SessionModel.revoked == False).count()

    def clear(self) -> None:
        with SessionLocal() as db:
            db.query(SessionModel).update({"revoked": True})
            db.commit()

    def get(self, session_id: str, default: Any = None) -> Any:
        if session_id in self:
            return self[session_id]
        return default


class UsersProxy(MutableMapping):
    """Database-backed proxy mapping for users keyed by email."""

    def _user_to_dict(self, u: UserModel) -> Dict[str, Any]:
        return {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "role": u.role,
            "avatar_url": u.avatar_url,
            "created_at": u.created_at,
            "entitlements": list(u.entitlements or []),
            "password_hash": u.password_hash
        }

    def __getitem__(self, email: str) -> Dict[str, Any]:
        with SessionLocal() as db:
            u = db.query(UserModel).filter(UserModel.email == email.lower()).first()
            if not u:
                raise KeyError(email)
            return self._user_to_dict(u)

    def __setitem__(self, email: str, data: Dict[str, Any]) -> None:
        with SessionLocal() as db:
            clean_email = email.lower()
            u = db.query(UserModel).filter(UserModel.email == clean_email).first()
            if u:
                u.name = data.get("name", u.name)
                u.role = data.get("role", u.role)
                u.avatar_url = data.get("avatar_url", u.avatar_url)
                u.entitlements = data.get("entitlements", u.entitlements)
                if "password_hash" in data:
                    u.password_hash = data["password_hash"]
            else:
                u = UserModel(
                    id=data.get("id", f"usr_{secrets_token()}"),
                    email=clean_email,
                    name=data.get("name", clean_email.split("@")[0].title()),
                    role=data.get("role", "user"),
                    avatar_url=data.get("avatar_url"),
                    created_at=data.get("created_at", "2026-01-15T08:00:00Z"),
                    entitlements=data.get("entitlements", ["free"]),
                    password_hash=data.get("password_hash", "")
                )
                db.add(u)
            db.commit()

    def __delitem__(self, email: str) -> None:
        with SessionLocal() as db:
            u = db.query(UserModel).filter(UserModel.email == email.lower()).first()
            if u:
                db.delete(u)
                db.commit()

    def __contains__(self, email: Any) -> bool:
        if not isinstance(email, str):
            return False
        with SessionLocal() as db:
            return db.query(UserModel).filter(UserModel.email == email.lower()).first() is not None

    def __iter__(self) -> Iterator[str]:
        with SessionLocal() as db:
            emails = [u.email for u in db.query(UserModel.email).all()]
        return iter(emails)

    def __len__(self) -> int:
        with SessionLocal() as db:
            return db.query(UserModel).count()

    def get(self, email: str, default: Any = None) -> Any:
        try:
            return self[email]
        except KeyError:
            return default

    def values(self) -> List[Dict[str, Any]]:
        with SessionLocal() as db:
            return [self._user_to_dict(u) for u in db.query(UserModel).all()]

    def items(self) -> List[tuple]:
        with SessionLocal() as db:
            return [(u.email, self._user_to_dict(u)) for u in db.query(UserModel).all()]


def secrets_token():
    import uuid
    return uuid.uuid4().hex[:8]


# Singletons
active_sessions = ActiveSessionsProxy()
users_db = UsersProxy()

# Static / seed definitions
DEMO_PASSWORD_HASH = hash_password("demo123")
DEMO_USER = {
    "id": "usr_demo_101",
    "email": "demo@resii.com",
    "name": "Alex Rivera",
    "role": "user",
    "avatar_url": None,
    "created_at": "2026-01-15T08:00:00Z",
    "entitlements": ["free", "ats_check", "resume_edit", "job_search", "tailor", "auto_apply", "season_pro"],
    "password_hash": DEMO_PASSWORD_HASH
}

PUBLIC_CHECKS_CONFIG = {
    "max_file_size_mb": 10,
    "allowed_extensions": [".pdf", ".docx", ".txt"],
    "supported_features": ["ats_scoring", "machine_read", "grammar_analysis", "keyword_targeting"],
    "scoring_model_version": "v3.8-resii-ats"
}
