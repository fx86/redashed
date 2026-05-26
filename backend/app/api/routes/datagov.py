from fastapi import APIRouter, Depends, HTTPException
from app.deps import get_current_user
from app.models.schemas import DataGovImportRequest, SavedConnectionResponse
from app.services import datagov_service, local_db_service

router = APIRouter(prefix="/datagov", tags=["datagov"])


@router.get("/search")
def search(q: str, user=Depends(get_current_user)):
    try:
        return datagov_service.search_datasets(q)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"data.gov search failed: {e}")


@router.post("/import", response_model=SavedConnectionResponse)
def import_dataset(body: DataGovImportRequest, user=Depends(get_current_user)):
    try:
        table_name, row_count = datagov_service.ingest(
            resource_url=body.resource_url,
            dataset_title=body.dataset_title,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ingest failed: {e}")

    row = local_db_service.insert_user_connection(
        user_id=user["user_id"],
        name=body.dataset_title,
        db_type="datagov",
        host=None,
        port=None,
        db_name=None,
        db_user=None,
        password_enc=None,
        extra_config={
            "dataset_id": body.dataset_id,
            "resource_url": body.resource_url,
            "table_name": table_name,
            "row_count": row_count,
        },
    )
    return SavedConnectionResponse(
        id=str(row["id"]),
        name=row["name"],
        db_type="datagov",
        host="",
        port=0,
        database="",
        db_user="",
        created_at=str(row["created_at"]),
    )
