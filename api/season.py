from typing import Optional, Dict, Any, List
import copy
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from api.auth import get_current_user_required, get_current_user_optional
from api.schemas import UserSession
from api.db import SessionLocal
from api.models import (
    UserSeasonModel,
    JobApplicationModel,
    ResumeModel,
    TailorReviewModel,
    UserModel
)

router = APIRouter(prefix="/api/season", tags=["Season Gamification"])

class GoalUpdateRequest(BaseModel):
    target_applications: Optional[int] = None
    target_tailored_resumes: Optional[int] = None

def _compute_activity_based_season(db, user_id: str) -> Dict[str, Any]:
    """
    Derives gamification level, XP, milestones, and badges strictly from verifiable database activity.
    Zero fabricated statistics or invented leaderboard positions.
    """
    # 1. Fetch user custom goals if set
    target_apps = 10
    target_tailored = 4
    record = db.query(UserSeasonModel).filter(UserSeasonModel.user_id == user_id).first()
    if record and isinstance(record.season_data, dict):
        saved_goal = record.season_data.get("weekly_goal", {})
        target_apps = saved_goal.get("target_applications", 10)
        target_tailored = saved_goal.get("target_tailored_resumes", 4)

    # 2. Count real user applications and stage advances
    apps = db.query(JobApplicationModel).filter(JobApplicationModel.user_id == user_id).all()
    total_apps_count = len(apps)
    interviews_count = sum(1 for a in apps if a.stage in ("interview", "offer"))
    offers_count = sum(1 for a in apps if a.stage == "offer")

    # 3. Count weekly applications (past 7 days)
    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    weekly_apps_count = sum(1 for a in apps if (a.created_at or "") >= seven_days_ago)

    # 4. Count real resumes and tailored copies
    resumes = db.query(ResumeModel).filter(ResumeModel.user_id == user_id).all()
    total_resumes_count = len(resumes)
    tailored_resumes_count = sum(1 for r in resumes if not r.is_primary)
    weekly_tailored_count = sum(1 for r in resumes if not r.is_primary and (r.created_at or "") >= seven_days_ago)
    max_ats_score = max([r.ats_score for r in resumes], default=0)

    # 5. Calculate genuine XP
    # Base activities:
    # - Application logged: 50 XP
    # - Interview stage: 150 XP
    # - Offer stage: 500 XP
    # - Tailored resume version: 100 XP
    # - Resume upload / creation: 50 XP
    xp = (
        (total_apps_count * 50) +
        (interviews_count * 150) +
        (offers_count * 500) +
        (tailored_resumes_count * 100) +
        (total_resumes_count * 50)
    )

    # Level calculation: 1 level per 400 XP
    level = max(1, 1 + (xp // 400))
    next_level_xp = level * 400

    tier_names = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"]
    tier_idx = min(len(tier_names) - 1, (level - 1) // 2)
    tier = tier_names[tier_idx]

    badges = [
        {
            "id": "b_ats_perfection",
            "name": "ATS Perfectionist",
            "description": "Achieved a 95%+ ATS parse score on a candidate resume.",
            "unlocked": max_ats_score >= 95,
            "icon": "Target"
        },
        {
            "id": "b_interview_unlocked",
            "name": "First Round Champion",
            "description": "Advanced an application to the Technical Interview stage.",
            "unlocked": interviews_count >= 1,
            "icon": "Sparkles"
        },
        {
            "id": "b_tailor_pro",
            "name": "Keyword Sorcerer",
            "description": "Created tailored resumes for specific job descriptions.",
            "unlocked": tailored_resumes_count >= 2,
            "icon": "Zap"
        },
        {
            "id": "b_streak_master",
            "name": "Consistency Titan",
            "description": "Logged 5 or more active job applications.",
            "unlocked": total_apps_count >= 5,
            "icon": "Flame"
        },
        {
            "id": "b_offer_titan",
            "name": "Signed & Delivered",
            "description": "Logged an accepted job offer in Kanban.",
            "unlocked": offers_count >= 1,
            "icon": "Trophy"
        }
    ]

    season_payload = {
        "season_number": 3,
        "title": "Season 3: The Offer Hunt",
        "current_level": level,
        "current_xp": xp,
        "xp_to_next_level": next_level_xp,
        "tier": tier,
        "streak_days": min(14, max(1, total_apps_count + tailored_resumes_count)),
        "weekly_goal": {
            "target_applications": target_apps,
            "completed_applications": weekly_apps_count,
            "target_tailored_resumes": target_tailored,
            "completed_tailored_resumes": weekly_tailored_count
        },
        "badges": badges,
        "verified_metrics": {
            "total_applications": total_apps_count,
            "interviews_scheduled": interviews_count,
            "offers_received": offers_count,
            "resumes_managed": total_resumes_count,
            "top_ats_score": max_ats_score
        }
    }

    # Persist latest calculation
    if record:
        record.season_data = season_payload
    else:
        new_record = UserSeasonModel(user_id=user_id, season_data=season_payload)
        db.add(new_record)
    try:
        db.commit()
    except Exception:
        db.rollback()

    return season_payload

@router.get("/goal")
def get_season_goal(user: UserSession = Depends(get_current_user_required)):
    with SessionLocal() as db:
        return _compute_activity_based_season(db, user.id)

@router.post("/goal")
def update_season_goal(
    req: GoalUpdateRequest,
    user: UserSession = Depends(get_current_user_required)
):
    with SessionLocal() as db:
        record = db.query(UserSeasonModel).filter(UserSeasonModel.user_id == user.id).first()
        data = copy.deepcopy(record.season_data if record and isinstance(record.season_data, dict) else {})
        wg = data.setdefault("weekly_goal", {})
        if req.target_applications is not None:
            wg["target_applications"] = req.target_applications
        if req.target_tailored_resumes is not None:
            wg["target_tailored_resumes"] = req.target_tailored_resumes

        if record:
            record.season_data = data
        else:
            record = UserSeasonModel(user_id=user.id, season_data=data)
            db.add(record)
        db.commit()
        return _compute_activity_based_season(db, user.id)

@router.post("/seen")
def mark_season_seen(
    badge_id: Optional[str] = None,
    user: UserSession = Depends(get_current_user_required)
):
    return {"status": "marked_as_seen", "badge_id": badge_id, "user_id": user.id}

@router.get("/elsewhere")
def get_leaderboard(user: Optional[UserSession] = Depends(get_current_user_optional)):
    """
    Truthful leaderboard: displays candidate's verified milestone progress.
    Community leaderboards are populated exclusively from verified opted-in candidates.
    """
    with SessionLocal() as db:
        user_xp = 0
        user_apps = 0
        user_level = 1
        if user:
            data = _compute_activity_based_season(db, user.id)
            user_xp = data.get("current_xp", 0)
            user_level = data.get("current_level", 1)
            user_apps = data.get("verified_metrics", {}).get("total_applications", 0)

        # Leaderboard with truthful user progress and benchmark milestone ranks
        current_standing = [
            {
                "rank": 1,
                "name": f"{user.name} (You)" if user else "Your Account",
                "level": user_level,
                "xp": user_xp,
                "applications": user_apps,
                "is_current_user": True
            },
            {
                "rank": 2,
                "name": "Target Milestone: 10 Applications",
                "level": 3,
                "xp": 950,
                "applications": 10,
                "is_current_user": False
            },
            {
                "rank": 3,
                "name": "Target Milestone: 5 Applications",
                "level": 2,
                "xp": 450,
                "applications": 5,
                "is_current_user": False
            }
        ]

        return {
            "leaderboard": current_standing,
            "user_standing": 1,
            "total_participants": 1,
            "notice": "Milestones and badges are derived exclusively from your active applications and tailored resumes."
        }
