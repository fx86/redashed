from __future__ import annotations
from pydantic import BaseModel
from typing import Any, Optional


class ConnectionParams(BaseModel):
    host: str
    port: int = 5432
    database: str
    user: str
    password: str
    db_type: str = "postgres"
    extra_config: dict = {}


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
    execution_time_ms: int = 0


# Saved connections
class SavedConnectionCreate(BaseModel):
    name: str
    db_type: str = "postgres"
    host: str = ""
    port: int = 5432
    database: str = ""
    db_user: str = ""
    password: str = ""
    extra_config: dict = {}


class SavedConnectionResponse(BaseModel):
    id: str
    name: str
    db_type: str = "postgres"
    host: str
    port: int
    database: str
    db_user: str
    created_at: str


# Annotations
class UpsertAnnotationRequest(BaseModel):
    table_schema: str
    table_name: str
    column_name: Optional[str] = None
    description: str


class AnnotationResponse(BaseModel):
    id: str
    table_schema: str
    table_name: str
    column_name: Optional[str]
    description: str


class SavedConnectionQueryRequest(BaseModel):
    question: str


# Saved queries
class SaveQueryRequest(BaseModel):
    connection_id: str
    question: str
    sql: str


class RenameQueryRequest(BaseModel):
    question: str


class SavedQueryResponse(BaseModel):
    id: str
    connection_id: Optional[str]
    question: str
    sql: str
    created_at: str


# Dashboards
class DashboardCreate(BaseModel):
    name: str


class DashboardResponse(BaseModel):
    id: str
    name: str
    created_at: str
    can_edit: bool = True
    is_owner: bool = True


class DashboardEditorResponse(BaseModel):
    id: str
    dashboard_id: str
    user_id: str
    granted_by: str
    created_at: str


class AddEditorRequest(BaseModel):
    user_id: str


class UpdateTileConfigRequest(BaseModel):
    chart_type: str
    chart_config: dict = {}


class TileLayout(BaseModel):
    x: int = 0
    y: int = 0
    w: int = 6
    h: int = 4


class DashboardTileCreate(BaseModel):
    saved_query_id: str
    chart_type: str = "table"
    chart_config: dict = {}
    position: int = 0
    layout: TileLayout = TileLayout()


class DashboardTileResponse(BaseModel):
    id: str
    dashboard_id: str
    saved_query_id: str
    connection_id: str
    question: str
    sql: str
    chart_type: str
    chart_config: dict
    position: int
    layout: TileLayout
    created_at: str


class TileLayoutItem(BaseModel):
    id: str
    x: int
    y: int
    w: int
    h: int


class UpdateLayoutRequest(BaseModel):
    layouts: list[TileLayoutItem]


class RunSqlRequest(BaseModel):
    sql: str
