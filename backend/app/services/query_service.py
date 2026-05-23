import psycopg2
import psycopg2.extras
from app.models.schemas import ConnectionParams
from app.services.connection_service import build_dsn


def execute_select(params: ConnectionParams, sql: str) -> tuple[list[str], list[list]]:
    stripped = sql.strip().upper()
    if not stripped.startswith("SELECT") and not stripped.startswith("WITH"):
        raise ValueError("Only SELECT queries are allowed")

    conn = psycopg2.connect(build_dsn(params))
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            rows = cur.fetchall()
            columns = [desc[0] for desc in cur.description] if cur.description else []
            return columns, [list(row.values()) for row in rows]
    finally:
        conn.close()
