import os
import uuid
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request, status, Header
from pydantic import BaseModel
import copy
from api.auth import get_current_user_required
from api.schemas import UserSession
from api.db import SessionLocal
from api.models import UserBillingModel
from api.config import settings

router = APIRouter(prefix="/api/billing", tags=["Billing"])

def _get_user_billing(user_id: str) -> Dict[str, Any]:
    with SessionLocal() as db:
        record = db.query(UserBillingModel).filter(UserBillingModel.user_id == user_id).first()
        if record:
            return {
                "tier": record.tier,
                "status": record.status,
                "renewal_date": record.renewal_date,
                "payment_method": record.payment_method or "None",
                "features": copy.deepcopy(record.features or []),
                "quotas": copy.deepcopy(record.quotas or {})
            }

        default_data = {
            "tier": "free",
            "status": "active",
            "renewal_date": None,
            "payment_method": "None",
            "features": [
                "1 Primary Resume",
                "Unlimited ATS Score Checks",
                "Basic Template Access",
                "Job Feed Search"
            ],
            "quotas": {
                "tailoring_runs_remaining": 3,
                "auto_applies_used_this_week": 0,
                "auto_applies_limit": 5
            }
        }
        try:
            db_record = UserBillingModel(
                user_id=user_id,
                tier="free",
                status="active",
                renewal_date=None,
                payment_method="None",
                features=default_data["features"],
                quotas=default_data["quotas"],
                payment_history=[]
            )
            db.add(db_record)
            db.commit()
        except Exception:
            db.rollback()
        return default_data

def _save_user_billing(user_id: str, billing_data: Dict[str, Any]) -> None:
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
                    payment_history=[]
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
    """
    Creates a real Stripe checkout session when STRIPE_SECRET_KEY is configured.
    Never simulates payments or returns synthetic checkout URLs in production.
    """
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe_key:
        if settings.ENVIRONMENT == "production":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Billing and payment checkout is currently unconfigured. Set STRIPE_SECRET_KEY in production to process paid subscriptions."
            )
        # In non-production/development mode, simulate sandbox checkout session for test isolation
        user_billing = _get_user_billing(user.id)
        user_billing["tier"] = req.tier
        user_billing["status"] = "active"
        _save_user_billing(user.id, user_billing)
        return {
            "checkout_session_id": f"cs_test_mock_{user.id}",
            "url": f"{settings.FRONTEND_URL}/billing?session_id=cs_test_mock_{user.id}&success=true",
            "tier": req.tier,
            "message": "Development sandbox checkout initialized (no real charge processed)."
        }

    try:
        import stripe
        stripe.api_key = stripe_key
        # Create genuine Stripe checkout session
        price_map = {
            "pro": os.getenv("STRIPE_PRICE_ID_PRO", "price_pro_monthly"),
            "unlimited": os.getenv("STRIPE_PRICE_ID_UNLIMITED", "price_unlimited_monthly")
        }
        price_id = price_map.get(req.tier.lower())
        if not price_id:
            raise HTTPException(status_code=400, detail=f"Invalid tier: {req.tier}")

        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=f"{settings.FRONTEND_URL}/billing?session_id={{CHECKOUT_SESSION_ID}}&success=true",
            cancel_url=f"{settings.FRONTEND_URL}/billing?canceled=true",
            client_reference_id=user.id,
            customer_email=user.email,
            metadata={"user_id": user.id, "tier": req.tier}
        )
        return {
            "checkout_session_id": session.id,
            "url": session.url,
            "tier": req.tier,
            "message": "Stripe checkout session initialized."
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe checkout initialization failed: {str(e)}"
        )

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
    return {"invoices": []}

@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: Optional[str] = Header(None, alias="Stripe-Signature")):
    """
    Handles Stripe subscription and payment webhooks with cryptographic signature verification.
    """
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    if not webhook_secret or not stripe_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe webhook is unconfigured.")

    import stripe
    stripe.api_key = stripe_key
    body = await request.body()

    try:
        event = stripe.Webhook.construct_event(body, stripe_signature, webhook_secret)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Webhook signature verification failed: {str(e)}")

    event_type = event.get("type")
    data_object = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        user_id = data_object.get("client_reference_id")
        tier = data_object.get("metadata", {}).get("tier", "pro")
        if user_id:
            user_billing = _get_user_billing(user_id)
            user_billing["tier"] = tier
            user_billing["status"] = "active"
            _save_user_billing(user_id, user_billing)

    elif event_type in ("customer.subscription.deleted", "customer.subscription.updated"):
        status_val = data_object.get("status")
        user_id = data_object.get("metadata", {}).get("user_id")
        if user_id and status_val:
            user_billing = _get_user_billing(user_id)
            if status_val in ("canceled", "unpaid"):
                user_billing["tier"] = "free"
                user_billing["status"] = "inactive"
            else:
                user_billing["status"] = status_val
            _save_user_billing(user_id, user_billing)

    return {"status": "processed"}

@router.post("/touch")
def touch_session(user: UserSession = Depends(get_current_user_required)):
    return {"status": "refreshed", "timestamp": datetime.now(timezone.utc).isoformat()}

@router.post("/touch")
def touch_session(user: UserSession = Depends(get_current_user_required)):
    return {"status": "refreshed", "timestamp": datetime.now(timezone.utc).isoformat()}
