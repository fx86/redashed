from fastapi import APIRouter, Depends, HTTPException
from app.deps import get_current_user
from app.models.schemas import AlertCreate, AlertUpdate, AlertResponse, TestTelegramRequest
from app.services import local_db_service as db
from app.services import telegram_service, alert_service
from app.services.encryption_service import encrypt

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertResponse])
def list_alerts(user=Depends(get_current_user)):
    return db.list_alerts(user["user_id"])


@router.post("", response_model=AlertResponse)
def create_alert(body: AlertCreate, user=Depends(get_current_user)):
    condition_types = {"row_count_above", "row_count_below", "query_failure"}
    if body.condition_type not in condition_types:
        raise HTTPException(status_code=400, detail=f"condition_type must be one of: {', '.join(condition_types)}")

    token_enc = encrypt(body.telegram_bot_token)
    row = db.insert_alert(
        user_id=user["user_id"],
        name=body.name,
        saved_query_id=body.saved_query_id,
        connection_id=body.connection_id,
        sql=body.sql,
        condition_type=body.condition_type,
        threshold=body.threshold,
        telegram_chat_id=body.telegram_chat_id,
        telegram_bot_token_enc=token_enc,
    )
    return row


@router.patch("/{alert_id}", response_model=AlertResponse)
def update_alert(alert_id: str, body: AlertUpdate, user=Depends(get_current_user)):
    updates: dict = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.condition_type is not None:
        updates["condition_type"] = body.condition_type
    if body.threshold is not None:
        updates["threshold"] = body.threshold
    if body.is_active is not None:
        updates["is_active"] = body.is_active
    if body.telegram_chat_id is not None:
        updates["telegram_chat_id"] = body.telegram_chat_id
    if body.telegram_bot_token is not None:
        updates["telegram_bot_token_enc"] = encrypt(body.telegram_bot_token)

    row = db.update_alert(alert_id, user["user_id"], **updates)
    if not row:
        raise HTTPException(status_code=404, detail="Alert not found")
    return row


@router.delete("/{alert_id}", status_code=204)
def delete_alert(alert_id: str, user=Depends(get_current_user)):
    db.delete_alert(alert_id, user["user_id"])


@router.post("/{alert_id}/run", response_model=AlertResponse)
def run_alert_now(alert_id: str, user=Depends(get_current_user)):
    """Manually trigger evaluation of a single alert immediately."""
    alert = db.get_alert(alert_id, user["user_id"])
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    try:
        alert_service._evaluate_one(alert)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return db.get_alert(alert_id, user["user_id"])


@router.post("/test-telegram")
def test_telegram(body: TestTelegramRequest, user=Depends(get_current_user)):
    """Send a test message to verify Telegram bot credentials before saving."""
    ok, err = telegram_service.test_connection(body.telegram_bot_token, body.telegram_chat_id)
    if not ok:
        raise HTTPException(status_code=400, detail=err or "Telegram delivery failed")
    return {"ok": True}
