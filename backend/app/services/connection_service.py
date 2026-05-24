import psycopg2
import psycopg2.extras
from app.models.schemas import ConnectionParams, TableInfo, ColumnInfo


def build_dsn(params: ConnectionParams) -> str:
    return (
        f"host={params.host} port={params.port} dbname={params.database} "
        f"user={params.user} password={params.password} "
        f"connect_timeout=10 sslmode=prefer"
    )


def build_connection(params: ConnectionParams):
    """Return a dbapi-compatible connection for the given params."""
    if params.db_type == "snowflake":
        try:
            import snowflake.connector
        except ImportError:
            raise ValueError("Snowflake connector not installed. Add snowflake-connector-python to requirements.")
        kw: dict = dict(
            account=params.host,
            user=params.user,
            password=params.password,
            database=params.database,
        )
        cfg = params.extra_config or {}
        if cfg.get("warehouse"):
            kw["warehouse"] = cfg["warehouse"]
        if cfg.get("role"):
            kw["role"] = cfg["role"]
        if cfg.get("schema_name"):
            kw["schema"] = cfg["schema_name"]
        return snowflake.connector.connect(**kw)
    return psycopg2.connect(build_dsn(params))


_INTROSPECT_SQL = """
    SELECT
        t.table_schema,
        t.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable
    FROM information_schema.tables t
    JOIN information_schema.columns c
        ON t.table_schema = c.table_schema
        AND t.table_name = c.table_name
    WHERE t.table_schema NOT IN ('information_schema', 'pg_catalog', 'INFORMATION_SCHEMA')
      AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_schema, t.table_name, c.ordinal_position
"""


def test_and_introspect(params: ConnectionParams) -> list[TableInfo]:
    conn = build_connection(params)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute("SET statement_timeout = '15s'")
            cur.execute(_INTROSPECT_SQL)
            rows = cur.fetchall()

        tables: dict[tuple, TableInfo] = {}
        for row in rows:
            key = (row["table_schema"], row["table_name"])
            if key not in tables:
                tables[key] = TableInfo(
                    schema=row["table_schema"],
                    name=row["table_name"],
                    columns=[],
                )
            tables[key].columns.append(
                ColumnInfo(
                    name=row["column_name"],
                    type=row["data_type"],
                    nullable=row["is_nullable"] == "YES",
                )
            )

        return list(tables.values())
    finally:
        conn.close()
