from fastapi import APIRouter, HTTPException, Depends
from app.deps import get_current_user
from app.models.schemas import AiKeyUpsertRequest, AiKeyResponse
from app.services import local_db_service, encryption_service, ai_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/ai-key", response_model=AiKeyResponse)
def get_ai_key(user=Depends(get_current_user)):
    row = local_db_service.get_user_ai_key(user["user_id"])
    if not row:
        return AiKeyResponse(has_key=False)
    return AiKeyResponse(has_key=True, provider=row["provider"], model=row["model"])


@router.put("/ai-key", response_model=AiKeyResponse)
def upsert_ai_key(body: AiKeyUpsertRequest, user=Depends(get_current_user)):
    try:
        ai_service.test_key(body.provider, body.model, body.api_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    encrypted = encryption_service.encrypt(body.api_key)
    row = local_db_service.upsert_user_ai_key(user["user_id"], body.provider, body.model, encrypted)
    return AiKeyResponse(has_key=True, provider=row["provider"], model=row["model"])


@router.delete("/ai-key", status_code=204)
def delete_ai_key(user=Depends(get_current_user)):
    local_db_service.delete_user_ai_key(user["user_id"])
