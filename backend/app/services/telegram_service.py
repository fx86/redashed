from __future__ import annotations

import httpx

TIMEOUT = 10  # seconds


def send_message(bot_token: str, chat_id: str, text: str) -> bool:
    """Send a Telegram message. Returns True if delivered."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    try:
        r = httpx.post(
            url,
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            timeout=TIMEOUT,
        )
        return r.status_code == 200
    except Exception:
        return False


def test_connection(bot_token: str, chat_id: str) -> tuple[bool, str]:
    """Send a test message. Returns (success, error_message)."""
    ok = send_message(bot_token, chat_id, "✅ <b>Querywise alert connected!</b>\nYou'll receive alerts here.")
    if ok:
        return True, ""
    return False, "Telegram delivery failed — check your bot token and chat ID."
