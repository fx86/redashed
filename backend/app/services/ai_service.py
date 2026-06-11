from __future__ import annotations
import os
import re
from openai import OpenAI
from app.models.schemas import TableInfo


def _ident(name: str) -> str:
    """Render a table/column name as a safe SQL identifier, quoting only when
    required (e.g. names that start with a digit or contain special chars)."""
    if re.fullmatch(r"[a-z_][a-z0-9_]*", name):
        return name
    return '"' + name.replace('"', '""') + '"'


_client: OpenAI | None = None

_PROVIDER_BASE_URLS: dict[str, str | None] = {
    "deepseek": "https://api.deepseek.com",
    "openai": None,
    "openrouter": "https://openrouter.ai/api/v1",
}


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=os.environ["DEEPSEEK_API_KEY"],
            base_url="https://api.deepseek.com",
        )
    return _client


def _build_client(provider: str, api_key: str) -> OpenAI:
    base_url = _PROVIDER_BASE_URLS.get(provider)
    kw: dict = {"api_key": api_key}
    if base_url:
        kw["base_url"] = base_url
    if provider == "openrouter":
        kw["default_headers"] = {"HTTP-Referer": "https://querywise.app"}
    return OpenAI(**kw)


def test_key(provider: str, model: str, api_key: str) -> None:
    """Raises ValueError if the key is invalid or the provider rejects it."""
    try:
        client = _build_client(provider, api_key)
        client.chat.completions.create(
            model=model,
            max_tokens=1,
            messages=[{"role": "user", "content": "hi"}],
        )
    except Exception as e:
        raise ValueError(str(e)[:200])


def _schema_to_text(
    tables: list[TableInfo],
    annotations: list[dict] | None = None,
    qualify: bool = True,
) -> str:
    ann_map: dict[tuple, str] = {}
    if annotations:
        for a in annotations:
            key = (a["table_schema"], a["table_name"], a.get("column_name"))
            ann_map[key] = a["description"]

    lines = []
    for table in tables:
        table_key = (table.schema, table.name, None)
        table_desc = ann_map.get(table_key, "")
        cols = ", ".join(
            f"{c.name} {c.type}{'?' if c.nullable else ''}"
            + (f" -- {ann_map[(table.schema, table.name, c.name)]}" if (table.schema, table.name, c.name) in ann_map else "")
            for c in table.columns
        )
        # qualify=False renders the bare (correctly-quoted) table name — used for
        # uploads, where the executor sets search_path to the user's schema and
        # forcing the model to reproduce an opaque schema name is error-prone.
        rel = f"{table.schema}.{table.name}" if qualify else _ident(table.name)
        line = f"{rel}({cols})"
        if table_desc:
            line += f"  -- {table_desc}"
        lines.append(line)
    return "\n".join(lines)


def generate_sql(
    question: str,
    tables: list[TableInfo],
    annotations: list[dict] | None = None,
    user_ai_key: dict | None = None,
    qualify_tables: bool = True,
) -> str:
    schema_text = _schema_to_text(tables, annotations, qualify=qualify_tables)
    naming_rule = (
        "- Use fully qualified table names (schema.table)\n"
        if qualify_tables
        else "- Use the table names exactly as written in the schema (bare, already "
             "quoted where needed); do NOT add a schema prefix\n"
    )

    if user_ai_key:
        client = _build_client(user_ai_key["provider"], user_ai_key["api_key"])
        model = user_ai_key["model"]
    else:
        client = _get_client()
        model = "deepseek-chat"

    response = client.chat.completions.create(
        model=model,
        max_tokens=1024,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a SQL expert. Given a PostgreSQL schema and a user question, "
                    "write a single read-only SELECT query that answers the question.\n\n"
                    "Rules:\n"
                    "- Output ONLY the SQL query, no explanation, no markdown fences\n"
                    "- Use only SELECT statements — never INSERT, UPDATE, DELETE, DROP, or DDL\n"
                    + naming_rule +
                    "- Limit results to 500 rows unless the user specifies otherwise\n"
                    "- If the question cannot be answered with the given schema, respond with: "
                    "-- Cannot answer: <brief reason>"
                ),
            },
            {
                "role": "user",
                "content": f"Schema:\n{schema_text}\n\nQuestion: {question}",
            },
        ],
    )

    return response.choices[0].message.content.strip()
