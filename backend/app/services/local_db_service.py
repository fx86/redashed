from __future__ import annotations

import json
import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

_pool: ThreadedConnectionPool | None = None


def _get_pool() -> ThreadedConnectionPool:
    global _pool
    if _pool is None:
        url = os.environ["DATABASE_URL"]
        _pool = ThreadedConnectionPool(minconn=1, maxconn=10, dsn=url)
    return _pool


@contextmanager
def _conn():
    pool = _get_pool()
    conn = pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


# ── Saved queries ──────────────────────────────────────────────────────────────

def insert_saved_query(user_id: str, connection_id: str, question: str, sql: str) -> dict:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO saved_queries (user_id, connection_id, question, sql)
                VALUES (%s, %s, %s, %s)
                RETURNING id, connection_id, question, sql, created_at
                """,
                (user_id, connection_id, question, sql),
            )
            return dict(cur.fetchone())


def list_saved_queries(user_id: str) -> list[dict]:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, connection_id, question, sql, created_at FROM saved_queries WHERE user_id = %s ORDER BY created_at DESC",
                (user_id,),
            )
            return [dict(r) for r in cur.fetchall()]


def rename_saved_query(query_id: str, user_id: str, question: str) -> dict | None:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE saved_queries SET question = %s
                WHERE id = %s AND user_id = %s
                RETURNING id, connection_id, question, sql, created_at
                """,
                (question, query_id, user_id),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def delete_saved_query(query_id: str, user_id: str) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM saved_queries WHERE id = %s AND user_id = %s",
                (query_id, user_id),
            )


# ── Dashboards ─────────────────────────────────────────────────────────────────

def insert_dashboard(user_id: str, name: str) -> dict:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "INSERT INTO dashboards (user_id, name) VALUES (%s, %s) RETURNING id, user_id, name, created_at",
                (user_id, name),
            )
            return dict(cur.fetchone())


def get_dashboard(dashboard_id: str) -> dict | None:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, user_id, name, created_at FROM dashboards WHERE id = %s",
                (dashboard_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def can_edit_dashboard(dashboard_id: str, user_id: str) -> bool:
    """True if user owns the dashboard or has been granted editor access."""
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM dashboards WHERE id = %s AND user_id = %s
                UNION ALL
                SELECT 1 FROM dashboard_editors WHERE dashboard_id = %s AND user_id = %s
                LIMIT 1
                """,
                (dashboard_id, user_id, dashboard_id, user_id),
            )
            return cur.fetchone() is not None


def list_dashboards(user_id: str) -> list[dict]:
    """Returns dashboards the user owns or has been granted edit access to."""
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, user_id, name, created_at FROM dashboards WHERE user_id = %s
                UNION
                SELECT d.id, d.user_id, d.name, d.created_at
                FROM dashboards d
                JOIN dashboard_editors e ON e.dashboard_id = d.id
                WHERE e.user_id = %s
                ORDER BY created_at DESC
                """,
                (user_id, user_id),
            )
            return [dict(r) for r in cur.fetchall()]


def delete_dashboard(dashboard_id: str, user_id: str) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM dashboards WHERE id = %s AND user_id = %s",
                (dashboard_id, user_id),
            )


# ── Dashboard editors ──────────────────────────────────────────────────────────

def list_dashboard_editors(dashboard_id: str) -> list[dict]:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, dashboard_id, user_id, granted_by, created_at FROM dashboard_editors WHERE dashboard_id = %s ORDER BY created_at",
                (dashboard_id,),
            )
            return [dict(r) for r in cur.fetchall()]


def add_dashboard_editor(dashboard_id: str, user_id: str, granted_by: str) -> dict:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO dashboard_editors (dashboard_id, user_id, granted_by)
                VALUES (%s, %s, %s)
                ON CONFLICT (dashboard_id, user_id) DO UPDATE SET granted_by = EXCLUDED.granted_by
                RETURNING id, dashboard_id, user_id, granted_by, created_at
                """,
                (dashboard_id, user_id, granted_by),
            )
            return dict(cur.fetchone())


def remove_dashboard_editor(dashboard_id: str, user_id: str) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM dashboard_editors WHERE dashboard_id = %s AND user_id = %s",
                (dashboard_id, user_id),
            )


# ── Dashboard tiles ────────────────────────────────────────────────────────────

# All tile reads go through this JOIN — question/sql/connection_id always live in saved_queries
_TILE_SELECT = """
    SELECT dt.id, dt.dashboard_id, dt.saved_query_id,
           sq.connection_id, sq.question, sq.sql,
           dt.chart_type, dt.chart_config, dt.position, dt.layout, dt.created_at
    FROM dashboard_tiles dt
    JOIN saved_queries sq ON sq.id = dt.saved_query_id
"""


def insert_tile(
    dashboard_id: str,
    saved_query_id: str,
    chart_type: str,
    chart_config: dict,
    position: int,
    layout: dict | None = None,
) -> dict:
    tile_layout = layout or {"x": 0, "y": 0, "w": 6, "h": 4}
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO dashboard_tiles (dashboard_id, saved_query_id, chart_type, chart_config, position, layout)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (dashboard_id, saved_query_id, chart_type, json.dumps(chart_config), position, json.dumps(tile_layout)),
            )
            tile_id = cur.fetchone()["id"]
            cur.execute(_TILE_SELECT + " WHERE dt.id = %s", (tile_id,))
            return _coerce_tile(dict(cur.fetchone()))


def list_tiles(dashboard_id: str) -> list[dict]:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(_TILE_SELECT + " WHERE dt.dashboard_id = %s ORDER BY dt.position", (dashboard_id,))
            return [_coerce_tile(dict(r)) for r in cur.fetchall()]


def update_tile_layouts(dashboard_id: str, layouts: list[dict]) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(
                cur,
                "UPDATE dashboard_tiles SET layout = %s::jsonb WHERE id = %s AND dashboard_id = %s",
                [
                    (json.dumps({"x": l["x"], "y": l["y"], "w": l["w"], "h": l["h"]}), l["id"], dashboard_id)
                    for l in layouts
                ],
            )


def update_tile_config(tile_id: str, dashboard_id: str, chart_type: str, chart_config: dict) -> dict | None:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "UPDATE dashboard_tiles SET chart_type = %s, chart_config = %s WHERE id = %s AND dashboard_id = %s",
                (chart_type, json.dumps(chart_config), tile_id, dashboard_id),
            )
            if cur.rowcount == 0:
                return None
            cur.execute(_TILE_SELECT + " WHERE dt.id = %s", (tile_id,))
            row = cur.fetchone()
            return _coerce_tile(dict(row)) if row else None


def delete_tile(tile_id: str) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM dashboard_tiles WHERE id = %s", (tile_id,))


def _coerce_tile(row: dict) -> dict:
    for key in ("chart_config", "layout"):
        if isinstance(row.get(key), str):
            row[key] = json.loads(row[key])
    return row


# ── Saved query by ID ──────────────────────────────────────────────────────────

def get_saved_query(query_id: str, user_id: str) -> dict | None:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, connection_id, question, sql, created_at FROM saved_queries WHERE id = %s AND user_id = %s",
                (query_id, user_id),
            )
            row = cur.fetchone()
            return dict(row) if row else None


# ── User connections ────────────────────────────────────────────────────────────

def insert_user_connection(
    user_id: str,
    name: str,
    db_type: str,
    host: str | None,
    port: int | None,
    db_name: str | None,
    db_user: str | None,
    password_enc: str | None,
    extra_config: dict | None = None,
) -> dict:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO user_connections (user_id, name, db_type, host, port, db_name, db_user, password_enc, extra_config)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, user_id, name, db_type, host, port, db_name, db_user, extra_config, created_at
                """,
                (user_id, name, db_type, host, port, db_name, db_user, password_enc, json.dumps(extra_config or {})),
            )
            return _coerce_conn(dict(cur.fetchone()))


def list_user_connections(user_id: str) -> list[dict]:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, user_id, name, db_type, host, port, db_name, db_user, extra_config, created_at FROM user_connections WHERE user_id = %s ORDER BY created_at DESC",
                (user_id,),
            )
            return [_coerce_conn(dict(r)) for r in cur.fetchall()]


def get_user_connection(connection_id: str, user_id: str) -> dict | None:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, user_id, name, db_type, host, port, db_name, db_user, password_enc, extra_config, created_at FROM user_connections WHERE id = %s AND user_id = %s",
                (connection_id, user_id),
            )
            row = cur.fetchone()
            return _coerce_conn(dict(row)) if row else None


def delete_user_connection(connection_id: str, user_id: str) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM user_connections WHERE id = %s AND user_id = %s", (connection_id, user_id))


def _coerce_conn(row: dict) -> dict:
    if isinstance(row.get("extra_config"), str):
        row["extra_config"] = json.loads(row["extra_config"])
    return row


# ── Schema annotations ─────────────────────────────────────────────────────────

def list_annotations(user_id: str, connection_id: str) -> list[dict]:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, table_schema, table_name, column_name, description FROM schema_annotations WHERE user_id = %s AND connection_id = %s",
                (user_id, connection_id),
            )
            return [dict(r) for r in cur.fetchall()]


def upsert_annotation(
    user_id: str,
    connection_id: str,
    table_schema: str,
    table_name: str,
    column_name: str | None,
    description: str,
) -> dict:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                DELETE FROM schema_annotations
                WHERE user_id = %s AND connection_id = %s AND table_schema = %s AND table_name = %s
                  AND (column_name = %s OR (column_name IS NULL AND %s IS NULL))
                """,
                (user_id, connection_id, table_schema, table_name, column_name, column_name),
            )
            cur.execute(
                """
                INSERT INTO schema_annotations (user_id, connection_id, table_schema, table_name, column_name, description)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, table_schema, table_name, column_name, description, created_at
                """,
                (user_id, connection_id, table_schema, table_name, column_name, description),
            )
            return dict(cur.fetchone())


def delete_annotation(annotation_id: str, user_id: str) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM schema_annotations WHERE id = %s AND user_id = %s", (annotation_id, user_id))
