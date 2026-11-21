from typing import Optional, Dict, Any, List
import copy
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from api.auth import get_current_user_required, get_current_user_optional
from api.schemas import UserSession
from api.db import SessionLocal
from api.models import UserSeasonModel

router = APIRouter(prefix="/api/season", tags=["Season Gamification"])

DEFAULT_SEASON_TEMPLATE: Dict[str, Any] = {
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
        {
            "id": "b_ats_perfection",
            "name": "ATS Perfectionist",
            "description": "Achieved a 95%+ ATS parse score on a primary resume.",
            "unlocked": True,
            "icon": "Target"
        },
        {
            "id": "b_interview_unlocked",
            "name": "First Round Champion",
            "description": "Advanced an application to the Technical Interview stage.",
            "unlocked": True,
            "icon": "Sparkles"
        },
        {
            "id": "b_tailor_pro",
            "name": "Keyword Sorcerer",
            "description": "Tailored 5+ resumes to specific target companies.",
            "unlocked": True,
            "icon": "Zap"
        },
        {
            "id": "b_streak_master",
            "name": "Consistency Titan",
            "description": "Maintained a 10-day job search streak.",
            "unlocked": True,
            "icon": "Flame"
        },
        {
            "id": "b_offer_titan",
            "name": "Signed & Delivered",
            "description": "Logged an accepted job offer in Kanban.",
            "unlocked": False,
            "icon": "Trophy"
        }
    ]
}

SEASON_DATA_BY_USER: Dict[str, Dict[str, Any]] = {
    "usr_demo_101": copy.deepcopy(DEFAULT_SEASON_TEMPLATE)
}

LEADERBOARD = [
    {"rank": 1, "name": "Elena R.", "level": 9, "xp": 4820, "applications": 34, "offers": 2},
    {"rank": 2, "name": "Marcus K.", "level": 8, "xp": 4210, "applications": 28, "offers": 1},
    {"rank": 3, "name": "Alex R. (You)", "level": 4, "xp": 1420, "applications": 12, "offers": 0},
    {"rank": 4, "name": "Sophia T.", "level": 4, "xp": 1390, "applications": 11, "offers": 0},
    {"rank": 5, "name": "Devin W.", "level": 3, "xp": 980, "applications": 8, "offers": 0}
]

class GoalUpdateRequest(BaseModel):
    target_applications: Optional[int] = None
    target_tailored_resumes: Optional[int] = None

def _get_user_season(user_id: str) -> Dict[str, Any]:
    with SessionLocal() as db:
        record = db.query(UserSeasonModel).filter(UserSeasonModel.user_id == user_id).first()
        if record:
            data = copy.deepcopy(record.season_data)
            SEASON_DATA_BY_USER[user_id] = data
            return data
        
        data = copy.deepcopy(SEASON_DATA_BY_USER.get(user_id, DEFAULT_SEASON_TEMPLATE))
        try:
            db_record = UserSeasonModel(user_id=user_id, season_data=data)
            db.add(db_record)
            db.commit()
        except Exception:
            db.rollback()
        SEASON_DATA_BY_USER[user_id] = data
        return data

def _save_user_season(user_id: str, season_data: Dict[str, Any]) -> None:
    SEASON_DATA_BY_USER[user_id] = season_data
    with SessionLocal() as db:
        record = db.query(UserSeasonModel).filter(UserSeasonModel.user_id == user_id).first()
        if record:
            record.season_data = season_data
            db.commit()
        else:
            try:
                db_record = UserSeasonModel(user_id=user_id, season_data=season_data)
                db.add(db_record)
                db.commit()
            except Exception:
                db.rollback()

@router.get("/goal")
def get_season_goal(user: UserSession = Depends(get_current_user_required)):
    return _get_user_season(user.id)

@router.post("/goal")
def update_season_goal(
    req: GoalUpdateRequest,
    user: UserSession = Depends(get_current_user_required)
):
    season_data = _get_user_season(user.id)
    if req.target_applications is not None:
        season_data["weekly_goal"]["target_applications"] = req.target_applications
    if req.target_tailored_resumes is not None:
        season_data["weekly_goal"]["target_tailored_resumes"] = req.target_tailored_resumes
    _save_user_season(user.id, season_data)
    return season_data

@router.post("/seen")
def mark_season_seen(
    badge_id: Optional[str] = None,
    user: UserSession = Depends(get_current_user_required)
):
    return {"status": "marked_as_seen", "badge_id": badge_id, "user_id": user.id}

@router.get("/elsewhere")
def get_leaderboard(user: Optional[UserSession] = Depends(get_current_user_optional)):
    """Public read-only leaderboard displaying season standings."""
    return {
        "leaderboard": LEADERBOARD,
        "user_standing": 3,
        "total_participants": 245
    }
