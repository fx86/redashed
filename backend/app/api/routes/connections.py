from fastapi import APIRouter, HTTPException
from app.models.schemas import ConnectionParams, SchemaResponse
from app.services import connection_service

router = APIRouter(prefix="/connections", tags=["connections"])


@router.post("/test", response_model=SchemaResponse)
def test_connection(params: ConnectionParams):
    try:
        tables = connection_service.test_and_introspect(params)
        return SchemaResponse(tables=tables)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
