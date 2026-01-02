"""Gantt/Timeline API endpoints."""
import uuid
from typing import List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.project import Project
from app.models.gantt_item import GanttItem, GanttItemType, GanttItemStatus
from app.models.gate import Gate, GateStatus
from app.models.document_version import DocumentVersion, DocumentState
from app.models.task import Task, TaskStatus
from app.models.role import RoleCode
from app.schemas.gantt import GanttItemResponse, GanttPlanUpdate, GanttResponse
from app.services.audit import log_action, AuditAction, model_to_dict
from app.core.deps import get_current_user, ProjectAccess, get_client_info

router = APIRouter()


@router.get("/projects/{project_id}/gantt", response_model=GanttResponse)
def get_gantt(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    project: Project = Depends(ProjectAccess()),
):
    """Get Gantt chart data for a project."""
    # Get explicit gantt items
    items = db.query(GanttItem).filter(GanttItem.project_id == project_id).all()
    
    # Build response
    item_responses = [GanttItemResponse.model_validate(item) for item in items]
    
    # Extract dependencies
    dependencies = []
    for item in items:
        if item.dependencies_json:
            for dep in item.dependencies_json:
                dependencies.append({
                    "from_id": dep.get("from_id"),
                    "to_id": str(item.id),
                    "type": dep.get("type", "finish_to_start"),
                })
    
    return GanttResponse(
        items=item_responses,
        dependencies=dependencies,
    )


@router.post("/projects/{project_id}/gantt", response_model=GanttItemResponse, status_code=status.HTTP_201_CREATED)
def create_gantt_item(
    request: Request,
    project_id: uuid.UUID,
    item_type: str,
    title: str,
    owner_role: str = None,
    related_task_id: uuid.UUID = None,
    related_document_id: uuid.UUID = None,
    related_gate_id: uuid.UUID = None,
    start_planned: str = None,
    end_planned: str = None,
    dependencies_json: List[dict] = None,
    is_blocking: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project: Project = Depends(ProjectAccess(required_roles=[RoleCode.BUSINESS_OWNER.value])),
):
    """Create a gantt item."""
    from datetime import date
    
    # Validate item type
    valid_types = [t.value for t in GanttItemType]
    if item_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid item type. Must be one of: {valid_types}",
        )
    
    # Parse dates
    start_date = None
    end_date = None
    if start_planned:
        start_date = date.fromisoformat(start_planned)
    if end_planned:
        end_date = date.fromisoformat(end_planned)
    
    item = GanttItem(
        project_id=project_id,
        item_type=item_type,
        title=title,
        owner_role=owner_role,
        related_task_id=related_task_id,
        related_document_id=related_document_id,
        related_gate_id=related_gate_id,
        start_planned=start_date,
        end_planned=end_date,
        status=GanttItemStatus.DRAFT.value,
        dependencies_json=dependencies_json,
        is_blocking=is_blocking,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    
    return GanttItemResponse.model_validate(item)


@router.post("/projects/{project_id}/gantt/{item_id}/plan")
def update_gantt_plan(
    request: Request,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    plan_update: GanttPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project: Project = Depends(ProjectAccess(required_roles=[RoleCode.BUSINESS_OWNER.value])),
):
    """Update planned dates for a gantt item (Business Owner only, requires reason)."""
    item = db.query(GanttItem).filter(
        GanttItem.id == item_id,
        GanttItem.project_id == project_id,
    ).first()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gantt item not found",
        )
    
    if not plan_update.reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reason is required for plan updates",
        )
    
    before = {
        "start_planned": item.start_planned.isoformat() if item.start_planned else None,
        "end_planned": item.end_planned.isoformat() if item.end_planned else None,
    }
    
    if plan_update.start_planned is not None:
        item.start_planned = plan_update.start_planned
    if plan_update.end_planned is not None:
        item.end_planned = plan_update.end_planned
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project_id,
        actor_user_id=current_user.id,
        action=AuditAction.GANTT_PLAN_UPDATE,
        entity_type="GanttItem",
        entity_id=item.id,
        before_json=before,
        after_json={
            "start_planned": item.start_planned.isoformat() if item.start_planned else None,
            "end_planned": item.end_planned.isoformat() if item.end_planned else None,
            "reason": plan_update.reason,
        },
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    
    return {"status": "updated", "item_id": item_id}


@router.post("/projects/{project_id}/gantt/sync")
def sync_gantt_from_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project: Project = Depends(ProjectAccess(required_roles=[RoleCode.BUSINESS_OWNER.value])),
):
    """Sync gantt items from project gates, documents, and tasks."""
    created_items = []
    
    # Sync gates
    gates = db.query(Gate).filter(Gate.project_id == project_id).all()
    for gate in gates:
        existing = db.query(GanttItem).filter(
            GanttItem.project_id == project_id,
            GanttItem.related_gate_id == gate.id,
        ).first()
        
        if not existing:
            item = GanttItem(
                project_id=project_id,
                item_type=GanttItemType.APPROVAL_GATE.value,
                title=gate.title,
                related_gate_id=gate.id,
                status=_map_gate_status(gate.status),
                is_blocking=True,
            )
            db.add(item)
            created_items.append(item)
    
    # Sync document versions in review
    versions = db.query(DocumentVersion).join(
        DocumentVersion.document
    ).filter(
        DocumentVersion.document.has(project_id=project_id),
        DocumentVersion.state == DocumentState.IN_REVIEW.value,
    ).all()
    
    for version in versions:
        existing = db.query(GanttItem).filter(
            GanttItem.project_id == project_id,
            GanttItem.related_document_version_id == version.id,
        ).first()
        
        if not existing:
            item = GanttItem(
                project_id=project_id,
                item_type=GanttItemType.APPROVAL_GATE.value,
                title=f"{version.document.doc_type} {version.version_string} Review",
                related_document_id=version.document_id,
                related_document_version_id=version.id,
                status=GanttItemStatus.WAITING_APPROVAL.value,
                start_actual=version.submitted_at,
                is_blocking=True,
            )
            db.add(item)
            created_items.append(item)
    
    db.commit()
    
    return {
        "status": "synced",
        "items_created": len(created_items),
    }


def _map_gate_status(gate_status: str) -> str:
    """Map gate status to gantt item status."""
    mapping = {
        GateStatus.OPEN.value: GanttItemStatus.IN_PROGRESS.value,
        GateStatus.BLOCKED.value: GanttItemStatus.BLOCKED.value,
        GateStatus.READY.value: GanttItemStatus.WAITING_APPROVAL.value,
        GateStatus.CLOSED.value: GanttItemStatus.DONE.value,
    }
    return mapping.get(gate_status, GanttItemStatus.DRAFT.value)

