import time
import psycopg2
import psycopg2.extras
from app.models.schemas import ConnectionParams
from app.services.connection_service import build_connection


def execute_select(params: ConnectionParams, sql: str) -> tuple[list[str], list[list], int]:
    stripped = sql.strip().upper()
    if not stripped.startswith("SELECT") and not stripped.startswith("WITH"):
        raise ValueError("Only SELECT queries are allowed")

    conn = build_connection(params)
    t0 = time.monotonic()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            rows = cur.fetchall()
            columns = [desc[0] for desc in cur.description] if cur.description else []
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            return columns, [list(row.values()) for row in rows], elapsed_ms
    finally:
        conn.close()
