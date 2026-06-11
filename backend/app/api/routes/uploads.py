from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from app.deps import get_current_user
from app.models.schemas import UploadResponse, QueryResponse
from app.services import upload_service, local_db_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/uploads", tags=["uploads"])

_MAX_BYTES = 150 * 1024 * 1024  # 150 MB — free tier limit


@router.post("", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    separator: str = Form(","),
    table_name: str = Form(None),
    user=Depends(get_current_user),
):
    content = await file.read()
    if len(content) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 150 MB limit for free accounts")

    try:
        result = upload_service.parse_and_store(
            file_bytes=content,
            filename=file.filename or "upload",
            separator=separator,
            user_id=user["user_id"],
            table_name=table_name or None,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        log.exception("parse_and_store failed for user=%s file=%s", user["user_id"], file.filename)
        raise HTTPException(status_code=500, detail=f"Failed to process file: {e}")

    try:
        connection_id = local_db_service.get_or_create_flatfile_connection(
            user["user_id"], result["schema_name"]
        )
        record = local_db_service.insert_upload_record(
            user_id=user["user_id"],
            original_filename=file.filename or "upload",
            table_name=result["table_name"],
            schema_name=result["schema_name"],
            separator=separator,
            row_count=result["row_count"],
            col_count=len(result["columns"]),
        )
    except Exception as e:
        log.exception("DB record creation failed for user=%s file=%s", user["user_id"], file.filename)
        raise HTTPException(status_code=500, detail=f"Upload stored but metadata save failed: {e}")

    return UploadResponse(
        id=str(record["id"]),
        original_filename=record["original_filename"],
        table_name=record["table_name"],
        schema_name=record["schema_name"],
        separator=record["separator"],
        row_count=record["row_count"],
        col_count=record["col_count"],
        created_at=str(record["created_at"]),
        expires_at=str(record["expires_at"]),
        connection_id=connection_id,
        columns=result["columns"],
    )


@router.get("", response_model=list[UploadResponse])
def list_uploads(user=Depends(get_current_user)):
    records = local_db_service.list_uploads(user["user_id"])
    connection_id = local_db_service.get_flatfile_connection_id(user["user_id"])
    valid = []
    for r in records:
        if upload_service.table_exists(r["schema_name"], r["table_name"]):
            valid.append(_to_response(r, connection_id))
        else:
            # Orphaned record — table was never committed or has been dropped.
            log.warning(
                "Removing orphaned upload record %s (table %s.%s missing)",
                r["id"], r["schema_name"], r["table_name"],
            )
            local_db_service.delete_upload_record(str(r["id"]), user["user_id"])
    return valid


@router.delete("/{upload_id}", status_code=204)
def delete_upload(upload_id: str, user=Depends(get_current_user)):
    record = local_db_service.get_upload(upload_id, user["user_id"])
    if not record:
        raise HTTPException(status_code=404, detail="Upload not found")
    upload_service.drop_table(record["schema_name"], record["table_name"])
    local_db_service.delete_upload_record(upload_id, user["user_id"])


@router.post("/{upload_id}/run-sql", response_model=QueryResponse)
def run_upload_sql(upload_id: str, body: dict, user=Depends(get_current_user)):
    record = local_db_service.get_upload(upload_id, user["user_id"])
    if not record:
        raise HTTPException(status_code=404, detail="Upload not found")
    sql = body.get("sql", "")
    try:
        columns, rows, elapsed_ms = upload_service.execute_upload_sql(user["user_id"], sql)
        return QueryResponse(sql=sql, columns=columns, rows=rows, row_count=len(rows), execution_time_ms=elapsed_ms)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _to_response(record: dict, connection_id: str | None = None) -> UploadResponse:
    return UploadResponse(
        id=str(record["id"]),
        original_filename=record["original_filename"],
        table_name=record["table_name"],
        schema_name=record["schema_name"],
        separator=record["separator"],
        row_count=record["row_count"],
        col_count=record["col_count"],
        created_at=str(record["created_at"]),
        expires_at=str(record["expires_at"]),
        connection_id=connection_id,
    )
