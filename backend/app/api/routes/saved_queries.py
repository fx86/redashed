from fastapi import APIRouter, Depends, HTTPException
from app.deps import get_current_user
from app.models.schemas import SaveQueryRequest, SavedQueryResponse, RenameQueryRequest
from app.services import local_db_service

router = APIRouter(prefix="/saved-queries", tags=["saved-queries"])


@router.post("", response_model=SavedQueryResponse)
def save_query(body: SaveQueryRequest, user=Depends(get_current_user)):
    row = local_db_service.insert_saved_query(
        user_id=user["user_id"],
        connection_id=body.connection_id,
        question=body.question,
        sql=body.sql,
        chart_type=body.chart_type,
        chart_config=body.chart_config,
    )
    return _to_response(row)


@router.get("", response_model=list[SavedQueryResponse])
def list_saved_queries(user=Depends(get_current_user)):
    rows = local_db_service.list_saved_queries(user["user_id"])
    return [_to_response(r) for r in rows]


@router.get("/{query_id}", response_model=SavedQueryResponse)
def get_saved_query(query_id: str, user=Depends(get_current_user)):
    row = local_db_service.get_saved_query(query_id, user["user_id"])
    if not row:
        raise HTTPException(status_code=404, detail="Query not found")
    return _to_response(row)


@router.put("/{query_id}", response_model=SavedQueryResponse)
def update_saved_query(query_id: str, body: SaveQueryRequest, user=Depends(get_current_user)):
    row = local_db_service.update_saved_query(
        query_id=query_id,
        user_id=user["user_id"],
        question=body.question,
        sql=body.sql,
        chart_type=body.chart_type,
        chart_config=body.chart_config,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Query not found")
    return _to_response(row)


@router.patch("/{query_id}", response_model=SavedQueryResponse)
def rename_saved_query(query_id: str, body: RenameQueryRequest, user=Depends(get_current_user)):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    row = local_db_service.rename_saved_query(query_id, user["user_id"], body.question.strip())
    if not row:
        raise HTTPException(status_code=404, detail="Query not found")
    return _to_response(row)


@router.delete("/{query_id}", status_code=204)
def delete_saved_query(query_id: str, user=Depends(get_current_user)):
    local_db_service.delete_saved_query(query_id, user["user_id"])


def _to_response(row: dict) -> SavedQueryResponse:
    return SavedQueryResponse(
        id=str(row["id"]),
        connection_id=row.get("connection_id"),
        question=row["question"],
        sql=row["sql"],
        chart_type=row.get("chart_type", "table"),
        chart_config=row.get("chart_config") or {},
        created_at=str(row["created_at"]),
    )
