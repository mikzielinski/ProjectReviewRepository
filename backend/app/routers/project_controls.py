"""Project compliance controls: assignments, scheduler, audit."""

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_active_user
from app.models import (
    AuditLog,
    ComplianceControl,
    ComplianceFramework,
    Project,
    ProjectControlAssignment,
    User,
)
from app.schemas.compliance_admin import (
    ControlScheduleItem,
    ProjectControlAssignmentRead,
    ProjectControlAssignmentUpdate,
)
from app.services.audit import AuditAction, log_action
from app.services.project_access import project_ids_for_user
from app.services.project_controls_sync import framework_codes_from_project, sync_controls_for_project

router = APIRouter(prefix="/projects", tags=["project-controls"])


def _require_project_access(db: Session, project_id: UUID, user_id: UUID) -> Project:
    if project_id not in project_ids_for_user(db, user_id):
        raise HTTPException(status_code=403, detail="No access to this project")
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _framework_codes_from_project(project: Project) -> list[str]:
    return framework_codes_from_project(project)


def _serialize_assignment(db: Session, a: ProjectControlAssignment) -> ProjectControlAssignmentRead:
    ctrl = db.query(ComplianceControl).filter(ComplianceControl.id == a.control_id).first()
    fw_code = None
    if ctrl:
        fw = db.query(ComplianceFramework).filter(ComplianceFramework.id == ctrl.framework_id).first()
        fw_code = fw.code if fw else None
    owner = db.query(User).filter(User.id == a.control_owner_user_id).first() if a.control_owner_user_id else None
    assignee = db.query(User).filter(User.id == a.assignee_user_id).first() if a.assignee_user_id else None
    return ProjectControlAssignmentRead(
        id=a.id,
        project_id=a.project_id,
        control_id=a.control_id,
        control_ref=ctrl.control_ref if ctrl else None,
        control_title=ctrl.title if ctrl else None,
        framework_code=fw_code,
        domain=ctrl.domain if ctrl else None,
        control_owner_user_id=a.control_owner_user_id,
        control_owner_name=owner.name if owner else None,
        assignee_user_id=a.assignee_user_id,
        assignee_name=assignee.name if assignee else None,
        status=a.status,
        is_applicable=a.is_applicable,
        implementation_notes=a.implementation_notes,
        evidence_links_json=a.evidence_links_json,
        review_frequency_days=a.review_frequency_days,
        next_review_at=a.next_review_at,
        last_tested_at=a.last_tested_at,
        updated_at=a.updated_at,
    )


@router.post("/{project_id}/controls/sync", response_model=list[ProjectControlAssignmentRead])
def sync_project_controls(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Create control assignments from project's enabled compliance frameworks."""
    project = _require_project_access(db, project_id, current_user.id)
    created = sync_controls_for_project(db, project, current_user.id)
    if created:
        log_action(
            db,
            current_user.id,
            "CONTROL_SYNC",
            "Project",
            project_id,
            project_id=project_id,
            org_id=project.org_id,
            after_json={"controls_added": created},
        )
        db.commit()

    all_rows = db.query(ProjectControlAssignment).filter(ProjectControlAssignment.project_id == project_id).all()
    return [_serialize_assignment(db, a) for a in all_rows]


@router.get("/{project_id}/controls", response_model=list[ProjectControlAssignmentRead])
def list_project_controls(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    _require_project_access(db, project_id, current_user.id)
    rows = db.query(ProjectControlAssignment).filter(ProjectControlAssignment.project_id == project_id).all()
    return [_serialize_assignment(db, a) for a in rows]


@router.get("/{project_id}/controls/schedule", response_model=list[ControlScheduleItem])
def control_schedule(
    project_id: UUID,
    overdue_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    _require_project_access(db, project_id, current_user.id)
    now = datetime.now(timezone.utc)
    rows = (
        db.query(ProjectControlAssignment, ComplianceControl, ComplianceFramework, Project)
        .join(ComplianceControl, ComplianceControl.id == ProjectControlAssignment.control_id)
        .join(ComplianceFramework, ComplianceFramework.id == ComplianceControl.framework_id)
        .join(Project, Project.id == ProjectControlAssignment.project_id)
        .filter(
            ProjectControlAssignment.project_id == project_id,
            ProjectControlAssignment.is_applicable.is_(True),
        )
        .order_by(ProjectControlAssignment.next_review_at.nullslast())
        .all()
    )
    result = []
    for a, ctrl, fw, proj in rows:
        next_at = a.next_review_at
        is_overdue = False
        if next_at:
            review_dt = next_at.replace(tzinfo=timezone.utc) if next_at.tzinfo is None else next_at
            is_overdue = review_dt < now
        if overdue_only and not is_overdue:
            continue
        owner = db.query(User).filter(User.id == a.control_owner_user_id).first() if a.control_owner_user_id else None
        assignee = db.query(User).filter(User.id == a.assignee_user_id).first() if a.assignee_user_id else None
        result.append(
            ControlScheduleItem(
                assignment_id=a.id,
                project_id=project_id,
                project_key=proj.key,
                control_ref=ctrl.control_ref,
                control_title=ctrl.title,
                framework_code=fw.code,
                control_owner_name=owner.name if owner else None,
                assignee_name=assignee.name if assignee else None,
                next_review_at=a.next_review_at,
                status=a.status,
                is_overdue=is_overdue,
            )
        )
    return result


@router.put("/{project_id}/controls/{assignment_id}", response_model=ProjectControlAssignmentRead)
def update_project_control(
    project_id: UUID,
    assignment_id: UUID,
    payload: ProjectControlAssignmentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    project = _require_project_access(db, project_id, current_user.id)
    row = (
        db.query(ProjectControlAssignment)
        .filter(
            ProjectControlAssignment.id == assignment_id,
            ProjectControlAssignment.project_id == project_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Control assignment not found")

    before = {
        "status": row.status,
        "control_owner_user_id": str(row.control_owner_user_id) if row.control_owner_user_id else None,
        "assignee_user_id": str(row.assignee_user_id) if row.assignee_user_id else None,
    }
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)

    log_action(
        db,
        current_user.id,
        AuditAction.PROJECT_UPDATE,
        "ProjectControlAssignment",
        row.id,
        project_id=project_id,
        org_id=project.org_id,
        before_json=before,
        after_json=payload.model_dump(exclude_unset=True),
    )
    db.commit()
    return _serialize_assignment(db, row)


@router.get("/{project_id}/audit-trail")
def project_audit_trail(
    project_id: UUID,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    _require_project_access(db, project_id, current_user.id)
    logs = (
        db.query(AuditLog, User)
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .filter(AuditLog.project_id == project_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(log.id),
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": str(log.entity_id),
            "actor_name": user.name if user else None,
            "actor_email": user.email if user else None,
            "before_json": log.before_json,
            "after_json": log.after_json,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log, user in logs
    ]
