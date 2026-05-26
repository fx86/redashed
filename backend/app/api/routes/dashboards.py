from fastapi import APIRouter, Depends, HTTPException
from app.deps import get_current_user
from app.models.schemas import (
    DashboardCreate, DashboardRename, DashboardResponse,
    DashboardTileCreate, DashboardTileResponse,
    UpdateLayoutRequest, UpdateTileConfigRequest,
    RenameTileRequest,
    DashboardEditorResponse, AddEditorRequest,
)
from app.services import local_db_service

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


@router.get("", response_model=list[DashboardResponse])
def list_dashboards(user=Depends(get_current_user)):
    rows = local_db_service.list_dashboards(user["user_id"])
    return [_to_dashboard(r, user["user_id"]) for r in rows]


@router.post("", response_model=DashboardResponse)
def create_dashboard(body: DashboardCreate, user=Depends(get_current_user)):
    row = local_db_service.insert_dashboard(user["user_id"], body.name)
    return _to_dashboard(row, user["user_id"])


@router.patch("/{dashboard_id}", response_model=DashboardResponse)
def rename_dashboard(dashboard_id: str, body: DashboardRename, user=Depends(get_current_user)):
    if not local_db_service.can_edit_dashboard(dashboard_id, user["user_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to edit this dashboard")
    row = local_db_service.rename_dashboard(dashboard_id, body.name)
    if not row:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return _to_dashboard(row, user["user_id"])


@router.delete("/{dashboard_id}", status_code=204)
def delete_dashboard(dashboard_id: str, user=Depends(get_current_user)):
    # Only owner can delete the dashboard itself
    dash = local_db_service.get_dashboard(dashboard_id)
    if not dash or dash["user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the dashboard owner can delete it")
    local_db_service.delete_dashboard(dashboard_id, user["user_id"])


@router.get("/{dashboard_id}/tiles", response_model=list[DashboardTileResponse])
def list_tiles(dashboard_id: str, user=Depends(get_current_user)):
    rows = local_db_service.list_tiles(dashboard_id)
    return [_to_tile(r) for r in rows]


@router.post("/{dashboard_id}/tiles", response_model=DashboardTileResponse)
def create_tile(dashboard_id: str, body: DashboardTileCreate, user=Depends(get_current_user)):
    if not local_db_service.can_edit_dashboard(dashboard_id, user["user_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to edit this dashboard")
    row = local_db_service.insert_tile(
        dashboard_id=dashboard_id,
        saved_query_id=body.saved_query_id,
        chart_type=body.chart_type,
        chart_config=body.chart_config,
        position=body.position,
        layout=body.layout.model_dump(),
    )
    return _to_tile(row)


@router.patch("/{dashboard_id}/tiles/{tile_id}", response_model=DashboardTileResponse)
def rename_tile(dashboard_id: str, tile_id: str, body: RenameTileRequest, user=Depends(get_current_user)):
    if not local_db_service.can_edit_dashboard(dashboard_id, user["user_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to edit this dashboard")
    row = local_db_service.rename_tile(tile_id, dashboard_id, body.title)
    if not row:
        raise HTTPException(status_code=404, detail="Tile not found")
    return _to_tile(row)


@router.patch("/{dashboard_id}/tiles/{tile_id}/config", response_model=DashboardTileResponse)
def update_tile_config(dashboard_id: str, tile_id: str, body: UpdateTileConfigRequest, user=Depends(get_current_user)):
    if not local_db_service.can_edit_dashboard(dashboard_id, user["user_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to edit this dashboard")
    row = local_db_service.update_tile_config(tile_id, dashboard_id, body.chart_type, body.chart_config)
    if not row:
        raise HTTPException(status_code=404, detail="Tile not found")
    return _to_tile(row)


@router.put("/{dashboard_id}/layout", status_code=204)
def update_layout(dashboard_id: str, body: UpdateLayoutRequest, user=Depends(get_current_user)):
    if not local_db_service.can_edit_dashboard(dashboard_id, user["user_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to edit this dashboard")
    local_db_service.update_tile_layouts(dashboard_id, [l.model_dump() for l in body.layouts])


@router.delete("/{dashboard_id}/tiles/{tile_id}", status_code=204)
def delete_tile(dashboard_id: str, tile_id: str, user=Depends(get_current_user)):
    if not local_db_service.can_edit_dashboard(dashboard_id, user["user_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to edit this dashboard")
    local_db_service.delete_tile(tile_id)


# ── Editor management (owner-only) ────────────────────────────────────────────

@router.get("/{dashboard_id}/editors", response_model=list[DashboardEditorResponse])
def list_editors(dashboard_id: str, user=Depends(get_current_user)):
    _require_owner(dashboard_id, user["user_id"])
    rows = local_db_service.list_dashboard_editors(dashboard_id)
    return [_to_editor(r) for r in rows]


@router.post("/{dashboard_id}/editors", response_model=DashboardEditorResponse, status_code=201)
def add_editor(dashboard_id: str, body: AddEditorRequest, user=Depends(get_current_user)):
    _require_owner(dashboard_id, user["user_id"])
    if body.user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="You are already the owner")
    row = local_db_service.add_dashboard_editor(dashboard_id, body.user_id, user["user_id"])
    return _to_editor(row)


@router.delete("/{dashboard_id}/editors/{editor_user_id}", status_code=204)
def remove_editor(dashboard_id: str, editor_user_id: str, user=Depends(get_current_user)):
    _require_owner(dashboard_id, user["user_id"])
    local_db_service.remove_dashboard_editor(dashboard_id, editor_user_id)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _require_owner(dashboard_id: str, user_id: str) -> dict:
    dash = local_db_service.get_dashboard(dashboard_id)
    if not dash or dash["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Only the dashboard owner can manage editors")
    return dash


def _to_dashboard(row: dict, current_user_id: str) -> DashboardResponse:
    return DashboardResponse(
        id=str(row["id"]),
        name=row["name"],
        created_at=str(row["created_at"]),
        can_edit=True,  # list_dashboards only returns owned or editor rows
        is_owner=row["user_id"] == current_user_id,
    )


def _to_tile(row: dict) -> DashboardTileResponse:
    return DashboardTileResponse(
        id=str(row["id"]),
        dashboard_id=str(row["dashboard_id"]),
        saved_query_id=str(row["saved_query_id"]),
        connection_id=row["connection_id"],
        question=row["question"],
        sql=row["sql"],
        chart_type=row["chart_type"],
        chart_config=row["chart_config"],
        position=row["position"],
        layout=row.get("layout") or {"x": 0, "y": 0, "w": 6, "h": 4},
        created_at=str(row["created_at"]),
    )


def _to_editor(row: dict) -> DashboardEditorResponse:
    return DashboardEditorResponse(
        id=str(row["id"]),
        dashboard_id=str(row["dashboard_id"]),
        user_id=row["user_id"],
        granted_by=row["granted_by"],
        created_at=str(row["created_at"]),
    )
