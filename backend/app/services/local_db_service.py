from __future__ import annotations

import json
import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

_pool: ThreadedConnectionPool | None = None
_tables_ready = False


def _get_pool() -> ThreadedConnectionPool:
    global _pool, _tables_ready
    if _pool is None:
        url = os.environ["DATABASE_URL"]
        _pool = ThreadedConnectionPool(minconn=1, maxconn=10, dsn=url)
    if not _tables_ready:
        conn = _pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS user_ai_keys (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        user_id TEXT NOT NULL UNIQUE,
                        provider TEXT NOT NULL,
                        model TEXT NOT NULL,
                        api_key_enc TEXT NOT NULL,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
            conn.commit()
            _tables_ready = True
        finally:
            _pool.putconn(conn)
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

def insert_saved_query(
    user_id: str, connection_id: str, question: str, sql: str,
    chart_type: str = "table", chart_config: dict | None = None,
) -> dict:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO saved_queries (user_id, connection_id, question, sql, chart_type, chart_config)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, connection_id, question, sql, chart_type, chart_config, created_at
                """,
                (user_id, connection_id, question, sql, chart_type, json.dumps(chart_config or {})),
            )
            row = dict(cur.fetchone())
            if isinstance(row.get("chart_config"), str):
                row["chart_config"] = json.loads(row["chart_config"])
            return row


def list_saved_queries(user_id: str) -> list[dict]:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, connection_id, question, sql, chart_type, chart_config, created_at FROM saved_queries WHERE user_id = %s ORDER BY created_at DESC",
                (user_id,),
            )
            rows = [dict(r) for r in cur.fetchall()]
            for row in rows:
                if isinstance(row.get("chart_config"), str):
                    row["chart_config"] = json.loads(row["chart_config"])
            return rows


def update_saved_query(
    query_id: str, user_id: str, question: str, sql: str,
    chart_type: str = "table", chart_config: dict | None = None,
) -> dict | None:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE saved_queries
                SET question = %s, sql = %s, chart_type = %s, chart_config = %s
                WHERE id = %s AND user_id = %s
                RETURNING id, connection_id, question, sql, chart_type, chart_config, created_at
                """,
                (question, sql, chart_type, json.dumps(chart_config or {}), query_id, user_id),
            )
            row = cur.fetchone()
            if row is None:
                return None
            row = dict(row)
            if isinstance(row.get("chart_config"), str):
                row["chart_config"] = json.loads(row["chart_config"])
            return row


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


def rename_dashboard(dashboard_id: str, name: str) -> dict | None:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "UPDATE dashboards SET name = %s WHERE id = %s RETURNING id, user_id, name, created_at",
                (name, dashboard_id),
            )
            row = cur.fetchone()
            return dict(row) if row else None


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

# chart_type and chart_config are the saved_query's — tiles are display containers only
_TILE_SELECT = """
    SELECT dt.id, dt.dashboard_id, dt.saved_query_id,
           sq.connection_id, sq.question, sq.sql,
           sq.chart_type, sq.chart_config, dt.position, dt.layout, dt.created_at
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
            # Resolve the saved_query_id for this tile
            cur.execute(
                "SELECT saved_query_id FROM dashboard_tiles WHERE id = %s AND dashboard_id = %s",
                (tile_id, dashboard_id),
            )
            tile_row = cur.fetchone()
            if not tile_row:
                return None
            saved_query_id = tile_row["saved_query_id"]
            # Write chart config to saved_queries so all tiles referencing this query see the update
            cur.execute(
                "UPDATE saved_queries SET chart_type = %s, chart_config = %s WHERE id = %s",
                (chart_type, json.dumps(chart_config), saved_query_id),
            )
            cur.execute(_TILE_SELECT + " WHERE dt.id = %s", (tile_id,))
            row = cur.fetchone()
            return _coerce_tile(dict(row)) if row else None


def rename_tile(tile_id: str, dashboard_id: str, title: str) -> dict | None:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT saved_query_id FROM dashboard_tiles WHERE id = %s AND dashboard_id = %s",
                (tile_id, dashboard_id),
            )
            row = cur.fetchone()
            if not row:
                return None
            cur.execute("UPDATE saved_queries SET question = %s WHERE id = %s", (title, row["saved_query_id"]))
            cur.execute(_TILE_SELECT + " WHERE dt.id = %s", (tile_id,))
            result = cur.fetchone()
            return _coerce_tile(dict(result)) if result else None


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
                "SELECT id, connection_id, question, sql, chart_type, chart_config, created_at FROM saved_queries WHERE id = %s AND user_id = %s",
                (query_id, user_id),
            )
            row = cur.fetchone()
            if not row:
                return None
            row = dict(row)
            if isinstance(row.get("chart_config"), str):
                row["chart_config"] = json.loads(row["chart_config"])
            return row


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


# ── Uploaded files ─────────────────────────────────────────────────────────────

def get_or_create_flatfile_connection(user_id: str, schema_name: str) -> str:
    """Return the UUID of the user's flat_file connection, creating it if needed."""
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id FROM user_connections WHERE user_id = %s AND db_type = 'flat_file' LIMIT 1",
                (user_id,),
            )
            row = cur.fetchone()
            if row:
                return str(row["id"])
            cur.execute(
                """
                INSERT INTO user_connections (user_id, name, db_type, extra_config)
                VALUES (%s, 'Uploaded Files', 'flat_file', %s)
                RETURNING id
                """,
                (user_id, json.dumps({"uploads_schema": schema_name})),
            )
            return str(cur.fetchone()["id"])


def insert_upload_record(
    user_id: str,
    original_filename: str,
    table_name: str,
    schema_name: str,
    separator: str,
    row_count: int,
    col_count: int,
) -> dict:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO uploaded_files
                    (user_id, original_filename, table_name, schema_name, separator, row_count, col_count)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, user_id, original_filename, table_name, schema_name,
                          separator, row_count, col_count, created_at, expires_at
                """,
                (user_id, original_filename, table_name, schema_name, separator, row_count, col_count),
            )
            return dict(cur.fetchone())


def list_uploads(user_id: str) -> list[dict]:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, user_id, original_filename, table_name, schema_name,
                       separator, row_count, col_count, created_at, expires_at
                FROM uploaded_files
                WHERE user_id = %s
                ORDER BY created_at DESC
                """,
                (user_id,),
            )
            return [dict(r) for r in cur.fetchall()]


def get_upload(upload_id: str, user_id: str) -> dict | None:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, user_id, original_filename, table_name, schema_name,
                       separator, row_count, col_count, created_at, expires_at
                FROM uploaded_files
                WHERE id = %s AND user_id = %s
                """,
                (upload_id, user_id),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def delete_upload_record(upload_id: str, user_id: str) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM uploaded_files WHERE id = %s AND user_id = %s",
                (upload_id, user_id),
            )


# ── User AI keys ───────────────────────────────────────────────────────────────

def upsert_user_ai_key(user_id: str, provider: str, model: str, api_key_enc: str) -> dict:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO user_ai_keys (user_id, provider, model, api_key_enc)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (user_id) DO UPDATE
                    SET provider = EXCLUDED.provider,
                        model = EXCLUDED.model,
                        api_key_enc = EXCLUDED.api_key_enc,
                        updated_at = NOW()
                RETURNING id, user_id, provider, model, created_at, updated_at
                """,
                (user_id, provider, model, api_key_enc),
            )
            return dict(cur.fetchone())


def get_user_ai_key(user_id: str) -> dict | None:
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, user_id, provider, model, api_key_enc FROM user_ai_keys WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def delete_user_ai_key(user_id: str) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM user_ai_keys WHERE user_id = %s", (user_id,))
