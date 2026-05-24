from fastapi import APIRouter, Depends
from app.deps import get_current_user
from app.models.schemas import (
    DashboardCreate, DashboardResponse,
    DashboardTileCreate, DashboardTileResponse,
)
from app.services import supabase_service

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


@router.get("", response_model=list[DashboardResponse])
def list_dashboards(user=Depends(get_current_user)):
    rows = supabase_service.select("dashboards", {"user_id": user["user_id"]}, user["jwt"])
    return [_to_dashboard(r) for r in rows]


@router.post("", response_model=DashboardResponse)
def create_dashboard(body: DashboardCreate, user=Depends(get_current_user)):
    row = supabase_service.insert(
        "dashboards",
        {"user_id": user["user_id"], "name": body.name},
        user["jwt"],
    )
    return _to_dashboard(row)


@router.delete("/{dashboard_id}", status_code=204)
def delete_dashboard(dashboard_id: str, user=Depends(get_current_user)):
    supabase_service.delete("dashboards", dashboard_id, user["jwt"])


@router.get("/{dashboard_id}/tiles", response_model=list[DashboardTileResponse])
def list_tiles(dashboard_id: str, user=Depends(get_current_user)):
    rows = supabase_service.select("dashboard_tiles", {"dashboard_id": dashboard_id}, user["jwt"])
    return [_to_tile(r) for r in rows]


@router.post("/{dashboard_id}/tiles", response_model=DashboardTileResponse)
def create_tile(dashboard_id: str, body: DashboardTileCreate, user=Depends(get_current_user)):
    row = supabase_service.insert(
        "dashboard_tiles",
        {
            "dashboard_id": dashboard_id,
            "connection_id": body.connection_id,
            "question": body.question,
            "sql": body.sql,
            "chart_type": body.chart_type,
            "chart_config": body.chart_config,
            "position": body.position,
        },
        user["jwt"],
    )
    return _to_tile(row)


@router.delete("/{dashboard_id}/tiles/{tile_id}", status_code=204)
def delete_tile(dashboard_id: str, tile_id: str, user=Depends(get_current_user)):
    supabase_service.delete("dashboard_tiles", tile_id, user["jwt"])


def _to_dashboard(row: dict) -> DashboardResponse:
    return DashboardResponse(id=row["id"], name=row["name"], created_at=row["created_at"])


def _to_tile(row: dict) -> DashboardTileResponse:
    return DashboardTileResponse(
        id=row["id"],
        dashboard_id=row["dashboard_id"],
        connection_id=row["connection_id"],
        question=row["question"],
        sql=row["sql"],
        chart_type=row["chart_type"],
        chart_config=row["chart_config"],
        position=row["position"],
        created_at=row["created_at"],
    )
