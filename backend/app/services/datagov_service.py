from __future__ import annotations

import csv
import io
import re
import time
import uuid

import httpx
import psycopg2
import psycopg2.extras

from app.services import local_db_service

_CKAN_BASE = "https://catalog.data.gov/api/3/action"
_ROW_LIMIT = 500_000


def search_datasets(query: str, rows: int = 10) -> list[dict]:
    r = httpx.get(
        f"{_CKAN_BASE}/package_search",
        params={"q": query, "rows": rows},
        timeout=10,
    )
    r.raise_for_status()
    results = r.json()["result"]["results"]
    out = []
    for pkg in results:
        csv_resources = [
            {
                "id": res["id"],
                "name": res.get("name") or res.get("description") or "CSV",
                "url": res["url"],
            }
            for res in pkg.get("resources", [])
            if res.get("format", "").upper() == "CSV" and res.get("url")
        ]
        if not csv_resources:
            continue
        out.append({
            "id": pkg["id"],
            "title": pkg.get("title", ""),
            "notes": (pkg.get("notes") or "")[:200],
            "organization": (pkg.get("organization") or {}).get("title", ""),
            "resources": csv_resources,
        })
    return out


def _sanitize_name(title: str) -> str:
    name = re.sub(r"[^a-z0-9_]", "_", title.lower())[:40]
    name = re.sub(r"_+", "_", name).strip("_")
    return name or "dataset"


def ingest(resource_url: str, dataset_title: str) -> tuple[str, int]:
    """Download CSV, load into datagov schema. Returns (full_table_name, row_count)."""
    short_id = str(uuid.uuid4())[:8]
    table_name = f"{_sanitize_name(dataset_title)}_{short_id}"
    full_table = f"datagov.{table_name}"

    r = httpx.get(resource_url, timeout=120, follow_redirects=True)
    r.raise_for_status()

    reader = csv.DictReader(io.StringIO(r.text))
    rows: list[list] = []
    headers: list[str] = []
    for i, row in enumerate(reader):
        if i == 0:
            headers = list(row.keys())
        if i >= _ROW_LIMIT:
            break
        rows.append(list(row.values()))

    if not rows:
        raise ValueError("Dataset is empty or could not be parsed as CSV")

    col_names = [
        re.sub(r"[^a-z0-9_]", "_", h.lower())[:60] or f"col_{i}"
        for i, h in enumerate(headers)
    ]
    col_defs = ", ".join(f'"{c}" TEXT' for c in col_names)
    insert_sql = (
        f'INSERT INTO {full_table} ({", ".join(f\'"{c}"\' for c in col_names)}) '
        f'VALUES ({", ".join(["%s"] * len(col_names))})'
    )

    with local_db_service._conn() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE SCHEMA IF NOT EXISTS datagov")
            cur.execute(f"CREATE TABLE IF NOT EXISTS {full_table} ({col_defs})")
            psycopg2.extras.execute_batch(cur, insert_sql, rows, page_size=1000)

    return full_table, len(rows)


def drop_table(table_name: str) -> None:
    if not table_name.startswith("datagov."):
        return
    with local_db_service._conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {table_name}")


def get_schema(table_name: str) -> list[dict]:
    """Return column info for an ingested datagov table."""
    parts = table_name.split(".", 1)
    if len(parts) != 2:
        return []
    schema, tname = parts
    with local_db_service._conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                ORDER BY ordinal_position
                """,
                (schema, tname),
            )
            return [dict(r) for r in cur.fetchall()]


def execute_select(sql: str) -> tuple[list[str], list[list], int]:
    stripped = sql.strip().upper()
    if not stripped.startswith("SELECT") and not stripped.startswith("WITH"):
        raise ValueError("Only SELECT queries are allowed")

    with local_db_service._conn() as conn:
        t0 = time.monotonic()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SET LOCAL statement_timeout = '30s'")
            cur.execute(sql)
            rows = cur.fetchall()
            columns = [desc[0] for desc in cur.description] if cur.description else []
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            return columns, [list(row.values()) for row in rows], elapsed_ms
