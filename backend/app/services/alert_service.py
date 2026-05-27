from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone, timedelta

from app.services import local_db_service as db
from app.services import telegram_service
from app.services.encryption_service import decrypt
from app.services.connection_service import build_connection
from app.models.schemas import ConnectionParams
from app.services import query_service

logger = logging.getLogger(__name__)

COOLDOWN_MINUTES = 60   # minimum gap between firings for the same alert
CHECK_INTERVAL_S = 30 * 60  # evaluate all alerts every 30 minutes


# ── Evaluation ─────────────────────────────────────────────────────────────────

def evaluate_all_alerts() -> None:
    """Called by the background scheduler. Runs every CHECK_INTERVAL_S seconds."""
    alerts = db.list_all_active_alerts()
    logger.info("Alert scheduler: evaluating %d active alerts", len(alerts))
    for alert in alerts:
        try:
            _evaluate_one(alert)
        except Exception:
            logger.exception("Error evaluating alert %s", alert.get("id"))


def _evaluate_one(alert: dict) -> None:
    alert_id = alert["id"]

    # Cooldown — skip if fired recently
    last_fired = alert.get("last_fired_at")
    if last_fired:
        if isinstance(last_fired, str):
            last_fired = datetime.fromisoformat(last_fired.replace("Z", "+00:00"))
        if not last_fired.tzinfo:
            last_fired = last_fired.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - last_fired < timedelta(minutes=COOLDOWN_MINUTES):
            db.mark_alert_checked(alert_id, fired=False)
            return

    condition = alert["condition_type"]
    threshold = int(alert.get("threshold") or 0)
    fired = False
    message = ""

    conn_row = db.get_user_connection(alert["connection_id"], alert["user_id"])
    if not conn_row:
        return  # connection deleted — skip silently

    params = _params_from_row(conn_row)

    if condition == "query_failure":
        try:
            query_service.execute_select(params, alert["sql"])
        except Exception as e:
            fired = True
            message = (
                f"🚨 <b>{alert['name']}</b>\n"
                f"Query failed: <code>{str(e)[:300]}</code>"
            )
    else:
        try:
            columns, rows, _ = query_service.execute_select(params, alert["sql"])
            row_count = len(rows)
            if condition == "row_count_above" and row_count > threshold:
                fired = True
                message = (
                    f"🚨 <b>{alert['name']}</b>\n"
                    f"Row count <b>{row_count}</b> exceeded threshold <b>{threshold}</b>"
                )
            elif condition == "row_count_below" and row_count < threshold:
                fired = True
                message = (
                    f"🚨 <b>{alert['name']}</b>\n"
                    f"Row count <b>{row_count}</b> fell below threshold <b>{threshold}</b>"
                )
        except Exception as e:
            logger.warning("Alert %s query error (not a query_failure alert): %s", alert_id, e)

    db.mark_alert_checked(alert_id, fired=fired)

    if fired:
        try:
            bot_token = decrypt(alert["telegram_bot_token_enc"])
            telegram_service.send_message(bot_token, alert["telegram_chat_id"], message)
        except Exception:
            logger.exception("Failed to send Telegram message for alert %s", alert_id)


def _params_from_row(row: dict) -> ConnectionParams:
    return ConnectionParams(
        db_type=row.get("db_type", "postgres"),
        host=row.get("host") or "",
        port=row.get("port") or 5432,
        database=row.get("db_name") or "",
        user=row.get("db_user") or "",
        password=decrypt(row["password_enc"]) if row.get("password_enc") else "",
        extra_config=row.get("extra_config") or {},
    )


# ── Background scheduler ────────────────────────────────────────────────────────

_scheduler_started = False


def start_scheduler() -> None:
    global _scheduler_started
    if _scheduler_started:
        return
    _scheduler_started = True

    def _loop():
        # Wait one interval before the first check so server can warm up
        time.sleep(CHECK_INTERVAL_S)
        while True:
            try:
                evaluate_all_alerts()
            except Exception:
                logger.exception("Alert scheduler top-level error")
            time.sleep(CHECK_INTERVAL_S)

    t = threading.Thread(target=_loop, name="alert-scheduler", daemon=True)
    t.start()
    logger.info("Alert scheduler started (interval=%ds)", CHECK_INTERVAL_S)
