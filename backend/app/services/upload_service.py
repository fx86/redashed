from __future__ import annotations

import io
import logging
import os
import re
import time

import pandas as pd
import psycopg2
import psycopg2.extras

log = logging.getLogger(__name__)

from app.services.local_db_service import _conn


def uploads_schema_name(user_id: str) -> str:
    clean = user_id.replace("-", "")[:16]
    return f"ul_{clean}"


def sanitize_table_name(name: str) -> str:
    base = re.sub(r"\.[^.]+$", "", name)
    clean = re.sub(r"[^a-z0-9_]", "_", base.lower())
    clean = re.sub(r"_+", "_", clean).strip("_") or "upload"
    if clean[0].isdigit():
        clean = "t_" + clean
    return clean[:50]


def ensure_schema(user_id: str) -> str:
    schema = uploads_schema_name(user_id)
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
    return schema


_DTYPE_TO_PG = {
    "int64": "BIGINT",
    "int32": "INTEGER",
    "float64": "DOUBLE PRECISION",
    "float32": "REAL",
    "bool": "BOOLEAN",
    "object": "TEXT",
}


def _pg_type(dtype_str: str) -> str:
    if dtype_str.startswith("datetime"):
        return "TIMESTAMP"
    return _DTYPE_TO_PG.get(dtype_str, "TEXT")


def _sanitize_columns(df: pd.DataFrame) -> pd.DataFrame:
    new_cols: list[str] = []
    for c in df.columns:
        clean = re.sub(r"[^a-z0-9_]", "_", str(c).lower().strip())
        clean = re.sub(r"_+", "_", clean).strip("_") or "col"
        if clean[0].isdigit():
            clean = "c_" + clean
        new_cols.append(clean)
    seen: dict[str, int] = {}
    deduped: list[str] = []
    for c in new_cols:
        if c in seen:
            seen[c] += 1
            deduped.append(f"{c}_{seen[c]}")
        else:
            seen[c] = 0
            deduped.append(c)
    df.columns = deduped
    return df


def _to_python(v):
    """Convert a pandas cell value to a plain Python type safe for psycopg2.

    dtype_backend='numpy_nullable' returns pd.NA for missing values (not None
    and not float nan), and wraps integers/booleans in pandas extension types.
    psycopg2 cannot serialise any of these — convert them here.
    """
    if v is None:
        return None
    # pd.NA, pd.NaT, and numpy masked scalars all satisfy pd.isna() but
    # pd.isna raises TypeError on non-scalar containers, so guard it.
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    # numpy / pandas extension scalars expose .item() to get a Python native.
    if hasattr(v, "item"):
        return v.item()
    return v


def _write_table(df: pd.DataFrame, schema: str, table_name: str) -> None:
    col_defs = ", ".join(f'"{c}" {_pg_type(str(t))}' for c, t in df.dtypes.items())
    placeholders = ", ".join(["%s"] * len(df.columns))
    insert_sql = f'INSERT INTO "{schema}"."{table_name}" VALUES ({placeholders})'

    rows = []
    for row in df.itertuples(index=False):
        rows.append(tuple(_to_python(v) for v in row))

    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f'DROP TABLE IF EXISTS "{schema}"."{table_name}"')
            cur.execute(f'CREATE TABLE "{schema}"."{table_name}" ({col_defs})')
            psycopg2.extras.execute_batch(cur, insert_sql, rows, page_size=500)


def parse_and_store(
    file_bytes: bytes,
    filename: str,
    separator: str,
    user_id: str,
    table_name: str | None = None,
) -> dict:
    """Parse a flat file with pandas and persist it as a Postgres table."""
    schema = ensure_schema(user_id)

    sep = separator.replace("\\t", "\t").replace("\\n", "\n")

    try:
        df = pd.read_csv(io.BytesIO(file_bytes), sep=sep, engine="python", dtype_backend="numpy_nullable")
    except Exception as e:
        raise ValueError(f"Could not parse file: {e}")

    if df.empty or len(df.columns) == 0:
        raise ValueError("File is empty or could not be parsed with the chosen separator")

    df = _sanitize_columns(df)
    # Always sanitize — a user-supplied table_name must still be a safe,
    # unquoted-friendly identifier (no digit-leading names, no special chars).
    tname = sanitize_table_name(table_name) if table_name else sanitize_table_name(filename)
    _write_table(df, schema, tname)

    # Verify the table actually landed — _write_table rolls back on any insert
    # failure, which would leave the schema present but the table absent.
    if not table_exists(schema, tname):
        raise ValueError(
            f"Table creation was rolled back for '{tname}'. "
            "Check server logs for the underlying database error."
        )

    return {
        "schema_name": schema,
        "table_name": tname,
        "row_count": len(df),
        "columns": list(df.columns),
    }


def table_exists(schema_name: str, table_name: str) -> bool:
    """Return True if the table exists in the given schema."""
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = %s AND table_name = %s
                LIMIT 1
                """,
                (schema_name, table_name),
            )
            return cur.fetchone() is not None


def drop_table(schema_name: str, table_name: str) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f'DROP TABLE IF EXISTS "{schema_name}"."{table_name}"')


def get_upload_tables(user_id: str) -> list[dict]:
    """Return TableInfo-style dicts for all tables in the user's uploads schema."""
    schema = uploads_schema_name(user_id)
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT table_name, column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = %s
                ORDER BY table_name, ordinal_position
                """,
                (schema,),
            )
            rows = cur.fetchall()

    tables: dict[str, list] = {}
    for row in rows:
        t = row["table_name"]
        if t not in tables:
            tables[t] = []
        tables[t].append(
            {
                "name": row["column_name"],
                "type": row["data_type"],
                "nullable": row["is_nullable"] == "YES",
            }
        )
    return [{"name": t, "schema": schema, "columns": cols} for t, cols in tables.items()]


def execute_upload_sql(user_id: str, sql: str) -> tuple[list[str], list[list], int]:
    """Run a SELECT against the user's uploads schema (dedicated connection, not the pool)."""
    stripped = sql.strip().upper()
    if not stripped.startswith("SELECT") and not stripped.startswith("WITH"):
        raise ValueError("Only SELECT queries are allowed")

    schema = uploads_schema_name(user_id)
    t0 = time.monotonic()
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(f'SET search_path TO "{schema}", public')
            cur.execute(sql)
            rows = cur.fetchall()
            columns = [desc[0] for desc in cur.description] if cur.description else []
            elapsed_ms = int((time.monotonic() - t0) * 1000)
        return columns, [list(row.values()) for row in rows], elapsed_ms
    except psycopg2.errors.UndefinedTable as e:
        # Either the generated SQL referenced a relation that isn't in the user's
        # uploads schema, or the table was genuinely dropped. Log the SQL and
        # surface it so the failure is diagnosable rather than a blind guess.
        log.warning("UndefinedTable in upload query for user=%s sql=%s", user_id, sql)
        raise ValueError(
            "The query referenced a table that isn't in your uploaded data. "
            "If you recently re-uploaded, retry; otherwise delete this upload and "
            f"re-upload the file.\nGenerated SQL: {sql}"
        ) from e
    finally:
        conn.close()
