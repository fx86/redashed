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


def _schema_to_text(tables: list[TableInfo]) -> str:
    lines = []
    for table in tables:
        cols = ", ".join(
            f"{c.name} {c.type}{'?' if c.nullable else ''}"
            for c in table.columns
        )
        lines.append(f"{table.schema}.{table.name}({cols})")
    return "\n".join(lines)


def generate_sql(question: str, tables: list[TableInfo]) -> str:
    schema_text = _schema_to_text(tables)

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
