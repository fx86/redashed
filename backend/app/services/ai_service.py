from __future__ import annotations
import os
from openai import OpenAI
from app.models.schemas import TableInfo


_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=os.environ["DEEPSEEK_API_KEY"],
            base_url="https://api.deepseek.com",
        )
    return _client


def _schema_to_text(tables: list[TableInfo], annotations: list[dict] | None = None) -> str:
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
        line = f"{table.schema}.{table.name}({cols})"
        if table_desc:
            line += f"  -- {table_desc}"
        lines.append(line)
    return "\n".join(lines)


def generate_sql(question: str, tables: list[TableInfo], annotations: list[dict] | None = None) -> str:
    schema_text = _schema_to_text(tables, annotations)

    response = _get_client().chat.completions.create(
        model="deepseek-chat",
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
                    "- Use fully qualified table names (schema.table)\n"
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
