from fastapi import APIRouter, HTTPException
from app.models.schemas import QueryRequest, QueryResponse
from app.services import ai_service, query_service

router = APIRouter(prefix="/query", tags=["query"])


@router.post("", response_model=QueryResponse)
def run_query(request: QueryRequest):
    try:
        sql = ai_service.generate_sql(request.question, request.schema)

        if sql.startswith("-- Cannot answer"):
            raise HTTPException(status_code=422, detail=sql)

        columns, rows = query_service.execute_select(request.connection, sql)
        return QueryResponse(
            sql=sql,
            columns=columns,
            rows=rows,
            row_count=len(rows),
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
