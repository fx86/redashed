from fastapi import APIRouter, Depends, HTTPException
from app.deps import get_current_user
from app.models.schemas import (
    SavedConnectionCreate, SavedConnectionResponse, SchemaResponse,
    ConnectionParams, QueryResponse, SavedConnectionQueryRequest, RunSqlRequest,
    UpsertAnnotationRequest, AnnotationResponse,
)
from app.services import encryption_service, connection_service, ai_service, query_service, local_db_service, datagov_service

router = APIRouter(prefix="/user-connections", tags=["user-connections"])


def _load_connection(connection_id: str, user_id: str) -> dict:
    row = local_db_service.get_user_connection(connection_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    return row


def _resolve_ai_key(user_id: str):
    row = local_db_service.get_user_ai_key(user_id)
    if not row:
        return None
    return {
        "provider": row["provider"],
        "model": row["model"],
        "api_key": encryption_service.decrypt(row["api_key_enc"]),
    }


def _params_from_row(row: dict) -> ConnectionParams:
    return ConnectionParams(
        db_type=row.get("db_type", "postgres"),
        host=row.get("host") or "",
        port=row.get("port") or 5432,
        database=row.get("db_name") or "",
        user=row.get("db_user") or "",
        password=encryption_service.decrypt(row["password_enc"]) if row.get("password_enc") else "",
        extra_config=row.get("extra_config") or {},
    )


@router.post("", response_model=SavedConnectionResponse)
def create_connection(body: SavedConnectionCreate, user=Depends(get_current_user)):
    params = ConnectionParams(
        db_type=body.db_type,
        host=body.host,
        port=body.port,
        database=body.database,
        user=body.db_user,
        password=body.password,
        extra_config=body.extra_config,
    )
    try:
        connection_service.test_and_introspect(params)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {e}")

    row = local_db_service.insert_user_connection(
        user_id=user["user_id"],
        name=body.name,
        db_type=body.db_type,
        host=body.host or None,
        port=body.port or None,
        db_name=body.database or None,
        db_user=body.db_user or None,
        password_enc=encryption_service.encrypt(body.password) if body.password else None,
        extra_config=body.extra_config,
    )
    return _to_response(row)


@router.get("", response_model=list[SavedConnectionResponse])
def list_connections(user=Depends(get_current_user)):
    rows = local_db_service.list_user_connections(user["user_id"])
    return [_to_response(r) for r in rows]


@router.get("/{connection_id}/schema", response_model=SchemaResponse)
def get_schema(connection_id: str, user=Depends(get_current_user)):
    row = _load_connection(connection_id, user["user_id"])
    db_type = row.get("db_type")

    if db_type == "flat_file":
        from app.services import upload_service
        from app.models.schemas import TableInfo, ColumnInfo
        raw = upload_service.get_upload_tables(user["user_id"])
        tables = [
            TableInfo(
                name=t["name"],
                schema=t["schema"],
                columns=[ColumnInfo(name=c["name"], type=c["type"], nullable=c["nullable"]) for c in t["columns"]],
            )
            for t in raw
        ]
        return SchemaResponse(tables=tables)

    if db_type == "datagov":
        table_name = row.get("extra_config", {}).get("table_name", "")
        cols = datagov_service.get_schema(table_name)
        schema, tname = table_name.split(".", 1) if "." in table_name else ("datagov", table_name)
        from app.models.schemas import TableInfo, ColumnInfo
        table = TableInfo(
            schema=schema,
            name=tname,
            columns=[ColumnInfo(name=c["column_name"], type=c["data_type"], nullable=c["is_nullable"] == "YES") for c in cols],
        )
        return SchemaResponse(tables=[table])

    params = _params_from_row(row)
    tables = connection_service.test_and_introspect(params)
    return SchemaResponse(tables=tables)


@router.get("/{connection_id}/ping")
def ping_connection(connection_id: str, user=Depends(get_current_user)):
    """Lightweight liveness check — runs SELECT 1 against the connection."""
    row = _load_connection(connection_id, user["user_id"])
    db_type = row.get("db_type")
    try:
        if db_type in ("datagov", "flat_file"):
            import os
            import psycopg2
            conn = psycopg2.connect(os.environ["DATABASE_URL"])
            conn.close()
        else:
            params = _params_from_row(row)
            conn = connection_service.build_connection(params)
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
            conn.close()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


@router.post("/{connection_id}/query", response_model=QueryResponse)
def query_connection(connection_id: str, body: SavedConnectionQueryRequest, user=Depends(get_current_user)):
    row = _load_connection(connection_id, user["user_id"])
    db_type = row.get("db_type")
    user_ai_key = _resolve_ai_key(user["user_id"])
    try:
        if db_type == "flat_file":
            from app.services import upload_service
            from app.models.schemas import TableInfo, ColumnInfo
            raw = upload_service.get_upload_tables(user["user_id"])
            tables = [
                TableInfo(
                    name=t["name"],
                    schema=t["schema"],
                    columns=[ColumnInfo(name=c["name"], type=c["type"], nullable=c["nullable"]) for c in t["columns"]],
                )
                for t in raw
            ]
            annotations = local_db_service.list_annotations(user["user_id"], connection_id)
            sql = ai_service.generate_sql(
                body.question, tables, annotations, user_ai_key=user_ai_key, qualify_tables=False
            )
            if sql.startswith("-- Cannot answer"):
                raise HTTPException(status_code=422, detail=sql)
            columns, result_rows, elapsed_ms = upload_service.execute_upload_sql(user["user_id"], sql)

        elif db_type == "datagov":
            table_name = row.get("extra_config", {}).get("table_name", "")
            cols = datagov_service.get_schema(table_name)
            schema, tname = table_name.split(".", 1) if "." in table_name else ("datagov", table_name)
            from app.models.schemas import TableInfo, ColumnInfo
            tables = [TableInfo(
                schema=schema, name=tname,
                columns=[ColumnInfo(name=c["column_name"], type=c["data_type"], nullable=c["is_nullable"] == "YES") for c in cols],
            )]
            annotations = local_db_service.list_annotations(user["user_id"], connection_id)
            sql = ai_service.generate_sql(body.question, tables, annotations, user_ai_key=user_ai_key)
            if sql.startswith("-- Cannot answer"):
                raise HTTPException(status_code=422, detail=sql)
            columns, result_rows, elapsed_ms = datagov_service.execute_select(sql)

        else:
            params = _params_from_row(row)
            tables = connection_service.test_and_introspect(params)
            annotations = local_db_service.list_annotations(user["user_id"], connection_id)
            sql = ai_service.generate_sql(body.question, tables, annotations, user_ai_key=user_ai_key)
            if sql.startswith("-- Cannot answer"):
                raise HTTPException(status_code=422, detail=sql)
            columns, result_rows, elapsed_ms = query_service.execute_select(params, sql)

        return QueryResponse(sql=sql, columns=columns, rows=result_rows, row_count=len(result_rows), execution_time_ms=elapsed_ms)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{connection_id}/run-sql", response_model=QueryResponse)
def run_sql(connection_id: str, body: RunSqlRequest, user=Depends(get_current_user)):
    row = _load_connection(connection_id, user["user_id"])
    db_type = row.get("db_type")
    try:
        if db_type == "flat_file":
            from app.services import upload_service
            columns, result_rows, elapsed_ms = upload_service.execute_upload_sql(user["user_id"], body.sql)
        elif db_type == "datagov":
            columns, result_rows, elapsed_ms = datagov_service.execute_select(body.sql)
        else:
            params = _params_from_row(row)
            columns, result_rows, elapsed_ms = query_service.execute_select(params, body.sql)
        return QueryResponse(sql=body.sql, columns=columns, rows=result_rows, row_count=len(result_rows), execution_time_ms=elapsed_ms)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{connection_id}", status_code=204)
def delete_connection(connection_id: str, user=Depends(get_current_user)):
    row = local_db_service.get_user_connection(connection_id, user["user_id"])
    if row and row.get("db_type") == "datagov":
        table_name = row.get("extra_config", {}).get("table_name", "")
        if table_name:
            datagov_service.drop_table(table_name)
    local_db_service.delete_user_connection(connection_id, user["user_id"])


# ── Annotations ────────────────────────────────────────────────────────────────

@router.get("/{connection_id}/annotations", response_model=list[AnnotationResponse])
def list_annotations(connection_id: str, user=Depends(get_current_user)):
    _load_connection(connection_id, user["user_id"])
    rows = local_db_service.list_annotations(user["user_id"], connection_id)
    return [_ann_response(r) for r in rows]


@router.put("/{connection_id}/annotations", response_model=AnnotationResponse)
def upsert_annotation(connection_id: str, body: UpsertAnnotationRequest, user=Depends(get_current_user)):
    _load_connection(connection_id, user["user_id"])
    row = local_db_service.upsert_annotation(
        user_id=user["user_id"],
        connection_id=connection_id,
        table_schema=body.table_schema,
        table_name=body.table_name,
        column_name=body.column_name,
        description=body.description,
    )
    return _ann_response(row)


@router.delete("/{connection_id}/annotations/{annotation_id}", status_code=204)
def delete_annotation(connection_id: str, annotation_id: str, user=Depends(get_current_user)):
    _load_connection(connection_id, user["user_id"])
    local_db_service.delete_annotation(annotation_id, user["user_id"])


def _to_response(row: dict) -> SavedConnectionResponse:
    return SavedConnectionResponse(
        id=str(row["id"]),
        name=row["name"],
        db_type=row.get("db_type", "postgres"),
        host=row.get("host") or "",
        port=row.get("port") or 5432,
        database=row.get("db_name") or "",
        db_user=row.get("db_user") or "",
        created_at=str(row["created_at"]),
    )


def _ann_response(row: dict) -> AnnotationResponse:
    return AnnotationResponse(
        id=str(row["id"]),
        table_schema=row["table_schema"],
        table_name=row["table_name"],
        column_name=row.get("column_name"),
        description=row["description"],
    )
