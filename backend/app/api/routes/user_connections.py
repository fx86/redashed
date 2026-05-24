from fastapi import APIRouter, Depends, HTTPException
from app.deps import get_current_user
from app.models.schemas import (
    SavedConnectionCreate, SavedConnectionResponse, SchemaResponse,
    ConnectionParams, QueryResponse, SavedConnectionQueryRequest, RunSqlRequest,
)
from app.services import encryption_service, supabase_service, connection_service, ai_service, query_service

router = APIRouter(prefix="/user-connections", tags=["user-connections"])


@router.post("", response_model=SavedConnectionResponse)
def create_connection(body: SavedConnectionCreate, user=Depends(get_current_user)):
    params = ConnectionParams(host=body.host, port=body.port, database=body.database, user=body.db_user, password=body.password)
    try:
        connection_service.test_and_introspect(params)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {e}")

    row = supabase_service.insert(
        "connections",
        {
            "user_id": user["user_id"],
            "name": body.name,
            "host": body.host,
            "port": body.port,
            "database": body.database,
            "db_user": body.db_user,
            "password_enc": encryption_service.encrypt(body.password),
        },
        user["jwt"],
    )
    return _to_response(row)


@router.get("", response_model=list[SavedConnectionResponse])
def list_connections(user=Depends(get_current_user)):
    rows = supabase_service.select("connections", {"user_id": user["user_id"]}, user["jwt"])
    return [_to_response(r) for r in rows]


@router.get("/{connection_id}/schema", response_model=SchemaResponse)
def get_schema(connection_id: str, user=Depends(get_current_user)):
    rows = supabase_service.select("connections", {"id": connection_id, "user_id": user["user_id"]}, user["jwt"])
    if not rows:
        raise HTTPException(status_code=404, detail="Connection not found")
    row = rows[0]
    params = ConnectionParams(
        host=row["host"], port=row["port"], database=row["database"],
        user=row["db_user"], password=encryption_service.decrypt(row["password_enc"]),
    )
    tables = connection_service.test_and_introspect(params)
    return SchemaResponse(tables=tables)


@router.post("/{connection_id}/query", response_model=QueryResponse)
def query_connection(connection_id: str, body: SavedConnectionQueryRequest, user=Depends(get_current_user)):
    rows = supabase_service.select("connections", {"id": connection_id, "user_id": user["user_id"]}, user["jwt"])
    if not rows:
        raise HTTPException(status_code=404, detail="Connection not found")
    row = rows[0]
    params = ConnectionParams(
        host=row["host"], port=row["port"], database=row["database"],
        user=row["db_user"], password=encryption_service.decrypt(row["password_enc"]),
    )
    try:
        tables = connection_service.test_and_introspect(params)
        sql = ai_service.generate_sql(body.question, tables)
        if sql.startswith("-- Cannot answer"):
            raise HTTPException(status_code=422, detail=sql)
        columns, result_rows = query_service.execute_select(params, sql)
        return QueryResponse(sql=sql, columns=columns, rows=result_rows, row_count=len(result_rows))
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{connection_id}/run-sql", response_model=QueryResponse)
def run_sql(connection_id: str, body: RunSqlRequest, user=Depends(get_current_user)):
    rows = supabase_service.select("connections", {"id": connection_id, "user_id": user["user_id"]}, user["jwt"])
    if not rows:
        raise HTTPException(status_code=404, detail="Connection not found")
    row = rows[0]
    params = ConnectionParams(
        host=row["host"], port=row["port"], database=row["database"],
        user=row["db_user"], password=encryption_service.decrypt(row["password_enc"]),
    )
    try:
        columns, result_rows = query_service.execute_select(params, body.sql)
        return QueryResponse(sql=body.sql, columns=columns, rows=result_rows, row_count=len(result_rows))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{connection_id}", status_code=204)
def delete_connection(connection_id: str, user=Depends(get_current_user)):
    supabase_service.delete("connections", connection_id, user["jwt"])


def _to_response(row: dict) -> SavedConnectionResponse:
    return SavedConnectionResponse(
        id=row["id"], name=row["name"], host=row["host"],
        port=row["port"], database=row["database"], db_user=row["db_user"],
        created_at=row["created_at"],
    )
