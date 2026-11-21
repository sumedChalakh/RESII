import uuid
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import copy
from api.auth import get_current_user_required
from api.schemas import UserSession
from api.db import SessionLocal
from api.models import UserBillingModel

router = APIRouter(prefix="/api/billing", tags=["Billing"])

BILLING_STATE_BY_USER: Dict[str, Dict[str, Any]] = {
    "usr_demo_101": {
        "tier": "pro",
        "status": "active",
        "renewal_date": "2026-12-16",
        "payment_method": "Visa ending in 4242",
        "features": [
            "Unlimited ATS Resume Checks",
            "Unlimited Keyword Tailoring Runs",
            "Autonomous Auto-Apply (up to 50 / week)",
            "Premium ATS Verified Templates",
            "Priority LLM Generation Engine",
            "Full Kanban Application Tracker"
        ],
        "quotas": {
            "tailoring_runs_remaining": "Unlimited",
            "auto_applies_used_this_week": 8,
            "auto_applies_limit": 50
        }
    }
}

PAYMENTS_HISTORY_BY_USER: Dict[str, List[Dict[str, Any]]] = {
    "usr_demo_101": [
        {
            "id": "inv_101",
            "date": "2026-11-16",
            "amount": "$29.00",
            "status": "paid",
            "description": "RESII Pro Membership (Monthly)",
            "receipt_url": "#"
        },
        {
            "id": "inv_100",
            "date": "2026-10-16",
            "amount": "$29.00",
            "status": "paid",
            "description": "RESII Pro Membership (Monthly)",
            "receipt_url": "#"
        }
    ]
}

def _get_user_billing(user_id: str) -> Dict[str, Any]:
    with SessionLocal() as db:
        record = db.query(UserBillingModel).filter(UserBillingModel.user_id == user_id).first()
        if record:
            data = {
                "tier": record.tier,
                "status": record.status,
                "renewal_date": record.renewal_date or "2026-12-31",
                "payment_method": record.payment_method or "None",
                "features": copy.deepcopy(record.features),
                "quotas": copy.deepcopy(record.quotas)
            }
            BILLING_STATE_BY_USER[user_id] = data
            return data

        fallback = BILLING_STATE_BY_USER.get(user_id, {
            "tier": "free",
            "status": "active",
            "renewal_date": "2026-12-31",
            "payment_method": "None",
            "features": [
                "Basic ATS Resume Check",
                "1 Resume Edit",
                "Job Feed Search"
            ],
            "quotas": {
                "tailoring_runs_remaining": 3,
                "auto_applies_used_this_week": 0,
                "auto_applies_limit": 5
            }
        })
        data = copy.deepcopy(fallback)
        history = copy.deepcopy(PAYMENTS_HISTORY_BY_USER.get(user_id, []))
        try:
            db_record = UserBillingModel(
                user_id=user_id,
                tier=data.get("tier", "free"),
                status=data.get("status", "active"),
                renewal_date=data.get("renewal_date"),
                payment_method=data.get("payment_method"),
                features=data.get("features", []),
                quotas=data.get("quotas", {}),
                payment_history=history
            )
            db.add(db_record)
            db.commit()
        except Exception:
            db.rollback()
        BILLING_STATE_BY_USER[user_id] = data
        return data

def _save_user_billing(user_id: str, billing_data: Dict[str, Any]) -> None:
    BILLING_STATE_BY_USER[user_id] = billing_data
    with SessionLocal() as db:
        record = db.query(UserBillingModel).filter(UserBillingModel.user_id == user_id).first()
        if record:
            record.tier = billing_data.get("tier", record.tier)
            record.status = billing_data.get("status", record.status)
            record.renewal_date = billing_data.get("renewal_date", record.renewal_date)
            record.payment_method = billing_data.get("payment_method", record.payment_method)
            record.features = billing_data.get("features", record.features)
            record.quotas = billing_data.get("quotas", record.quotas)
            db.commit()
        else:
            try:
                db_record = UserBillingModel(
                    user_id=user_id,
                    tier=billing_data.get("tier", "free"),
                    status=billing_data.get("status", "active"),
                    renewal_date=billing_data.get("renewal_date"),
                    payment_method=billing_data.get("payment_method"),
                    features=billing_data.get("features", []),
                    quotas=billing_data.get("quotas", {}),
                    payment_history=PAYMENTS_HISTORY_BY_USER.get(user_id, [])
                )
                db.add(db_record)
                db.commit()
            except Exception:
                db.rollback()

class CheckoutRequest(BaseModel):
    tier: str  # "pro" or "unlimited"
    billing_period: Optional[str] = "monthly"

class PromoCodeRequest(BaseModel):
    code: str

@router.get("/entitlements")
def get_entitlements(user: UserSession = Depends(get_current_user_required)):
    return _get_user_billing(user.id)

@router.post("/checkout")
def create_checkout_session(
    req: CheckoutRequest,
    user: UserSession = Depends(get_current_user_required)
):
    session_id = f"cs_test_{uuid.uuid4().hex}"
    user_billing = _get_user_billing(user.id)
    user_billing["tier"] = req.tier
    user_billing["status"] = "active"
    _save_user_billing(user.id, user_billing)
    return {
        "checkout_session_id": session_id,
        "url": f"https://checkout.stripe.com/pay/{session_id}",
        "tier": req.tier,
        "message": "Checkout session initialized."
    }

@router.post("/cancel")
def cancel_subscription(user: UserSession = Depends(get_current_user_required)):
    user_billing = _get_user_billing(user.id)
    user_billing["status"] = "cancelling_at_period_end"
    _save_user_billing(user.id, user_billing)
    return {
        "status": "cancelling_at_period_end",
        "message": "Subscription will not renew after current billing cycle."
    }

@router.post("/code")
def redeem_promo_code(
    req: PromoCodeRequest,
    user: UserSession = Depends(get_current_user_required)
):
    if req.code.upper() in ["LAUNCH50", "CAREER2026", "RESIIFREE"]:
        return {
            "valid": True,
            "discount_percentage": 50,
            "message": f"Promo code '{req.code}' applied! 50% discount granted on next billing cycle."
        }
    raise HTTPException(status_code=400, detail="Invalid or expired promo code.")

@router.get("/payments")
def get_payment_history(user: UserSession = Depends(get_current_user_required)):
    with SessionLocal() as db:
        record = db.query(UserBillingModel).filter(UserBillingModel.user_id == user.id).first()
        if record and record.payment_history:
            return {"invoices": record.payment_history}
    return {"invoices": PAYMENTS_HISTORY_BY_USER.get(user.id, [])}

@router.post("/touch")
def touch_session(user: UserSession = Depends(get_current_user_required)):
    return {"status": "refreshed", "timestamp": datetime.now(timezone.utc).isoformat()}
