from fastapi import APIRouter, Depends
from app.deps import get_current_user
from app.models.schemas import SaveQueryRequest, SavedQueryResponse
from app.services import supabase_service

router = APIRouter(prefix="/saved-queries", tags=["saved-queries"])


@router.post("", response_model=SavedQueryResponse)
def save_query(body: SaveQueryRequest, user=Depends(get_current_user)):
    row = supabase_service.insert(
        "saved_queries",
        {
            "user_id": user["user_id"],
            "connection_id": body.connection_id,
            "question": body.question,
            "sql": body.sql,
        },
        user["jwt"],
    )
    return _to_response(row)


@router.get("", response_model=list[SavedQueryResponse])
def list_saved_queries(user=Depends(get_current_user)):
    rows = supabase_service.select("saved_queries", {"user_id": user["user_id"]}, user["jwt"])
    return [_to_response(r) for r in rows]


@router.delete("/{query_id}", status_code=204)
def delete_saved_query(query_id: str, user=Depends(get_current_user)):
    supabase_service.delete("saved_queries", query_id, user["jwt"])


def _to_response(row: dict) -> SavedQueryResponse:
    return SavedQueryResponse(
        id=row["id"],
        connection_id=row.get("connection_id"),
        question=row["question"],
        sql=row["sql"],
        created_at=row["created_at"],
    )
