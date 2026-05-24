from __future__ import annotations
import os
import httpx


def _base_headers(user_jwt: str) -> dict:
    return {
        "apikey": os.environ["SUPABASE_ANON_KEY"],
        "Authorization": f"Bearer {user_jwt}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _url(table: str) -> str:
    return f"{os.environ['SUPABASE_URL']}/rest/v1/{table}"


_TIMEOUT = httpx.Timeout(10.0)


def insert(table: str, data: dict, jwt: str) -> dict:
    r = httpx.post(_url(table), json=data, headers=_base_headers(jwt), timeout=_TIMEOUT)
    r.raise_for_status()
    return r.json()[0]


def select(table: str, filters: dict, jwt: str) -> list[dict]:
    params = {k: f"eq.{v}" for k, v in filters.items()}
    params["order"] = "created_at.desc"
    r = httpx.get(_url(table), params=params, headers=_base_headers(jwt), timeout=_TIMEOUT)
    r.raise_for_status()
    return r.json()


def delete(table: str, row_id: str, jwt: str) -> None:
    r = httpx.delete(
        f"{_url(table)}?id=eq.{row_id}",
        headers=_base_headers(jwt),
        timeout=_TIMEOUT,
    )
    r.raise_for_status()
