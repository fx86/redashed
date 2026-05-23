from pydantic import BaseModel
from typing import Any


class ConnectionParams(BaseModel):
    host: str
    port: int = 5432
    database: str
    user: str
    password: str


class ColumnInfo(BaseModel):
    name: str
    type: str
    nullable: bool


class TableInfo(BaseModel):
    name: str
    schema: str
    columns: list[ColumnInfo]


class SchemaResponse(BaseModel):
    tables: list[TableInfo]


class QueryRequest(BaseModel):
    connection: ConnectionParams
    question: str
    schema: list[TableInfo]


class QueryResponse(BaseModel):
    sql: str
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
