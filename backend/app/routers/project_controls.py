"""Project compliance controls: assignments, scheduler, audit."""

import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
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
    ControlTestRunEntry,
    ProjectControlAssignmentDetailRead,
    ProjectControlAssignmentRead,
    ProjectControlAssignmentUpdate,
)
from app.services.audit import AuditAction, action_label, log_action
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


def _serialize_assignment_detail(db: Session, a: ProjectControlAssignment) -> ProjectControlAssignmentDetailRead:
    base = _serialize_assignment(db, a)
    ctrl = db.query(ComplianceControl).filter(ComplianceControl.id == a.control_id).first()
    return ProjectControlAssignmentDetailRead(
        **base.model_dump(),
        description=ctrl.description if ctrl else None,
        control_type=ctrl.control_type if ctrl else None,
        testing_frequency_days=ctrl.testing_frequency_days if ctrl else None,
        mapped_document_types_json=ctrl.mapped_document_types_json if ctrl else None,
        evidence_requirements_json=ctrl.evidence_requirements_json if ctrl else None,
    )


def _get_assignment_or_404(db: Session, project_id: UUID, assignment_id: UUID) -> ProjectControlAssignment:
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
    return row


def _is_test_event(payload: ProjectControlAssignmentUpdate) -> bool:
    data = payload.model_dump(exclude_unset=True)
    if data.get("status") == "TESTED":
        return True
    if "last_tested_at" in data:
        return True
    if "evidence_links_json" in data:
        return True
    return False


def _build_test_after_json(row: ProjectControlAssignment, actor_id: UUID) -> dict:
    return {
        "status": row.status,
        "evidence_links_json": row.evidence_links_json,
        "last_tested_at": row.last_tested_at.isoformat() if row.last_tested_at else None,
        "tested_at": datetime.utcnow().isoformat(),
        "tested_by": str(actor_id),
        "implementation_notes": row.implementation_notes,
    }


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
            AuditAction.CONTROL_SYNC,
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


@router.get("/{project_id}/controls/report")
def project_controls_report(
    project_id: UUID,
    format: str = Query("csv", pattern="^(csv|json)$"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Export project control assignments as CSV or JSON."""
    project = _require_project_access(db, project_id, current_user.id)
    rows_data = []
    assignments = db.query(ProjectControlAssignment).filter(ProjectControlAssignment.project_id == project_id).all()
    now = datetime.now(timezone.utc)

    for a in assignments:
        detail = _serialize_assignment_detail(db, a)
        next_at = a.next_review_at
        is_overdue = False
        if next_at:
            review_dt = next_at.replace(tzinfo=timezone.utc) if next_at.tzinfo is None else next_at
            is_overdue = review_dt < now
        rows_data.append({
            "project_key": project.key,
            "control_ref": detail.control_ref or "",
            "control_title": detail.control_title or "",
            "framework_code": detail.framework_code or "",
            "domain": detail.domain or "",
            "status": detail.status,
            "control_owner": detail.control_owner_name or "",
            "assignee": detail.assignee_name or "",
            "next_review_at": detail.next_review_at.isoformat() if detail.next_review_at else "",
            "last_tested_at": detail.last_tested_at.isoformat() if detail.last_tested_at else "",
            "is_overdue": "yes" if is_overdue else "no",
            "implementation_notes": detail.implementation_notes or "",
        })

    if format == "json":
        return {"project_key": project.key, "count": len(rows_data), "controls": rows_data}

    output = io.StringIO()
    fieldnames = list(rows_data[0].keys()) if rows_data else [
        "project_key", "control_ref", "control_title", "framework_code", "domain",
        "status", "control_owner", "assignee", "next_review_at", "last_tested_at",
        "is_overdue", "implementation_notes",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows_data)

    filename = f"controls-{project.key}-{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{project_id}/controls/{assignment_id}", response_model=ProjectControlAssignmentDetailRead)
def get_project_control(
    project_id: UUID,
    assignment_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    _require_project_access(db, project_id, current_user.id)
    row = _get_assignment_or_404(db, project_id, assignment_id)
    return _serialize_assignment_detail(db, row)


@router.get("/{project_id}/controls/{assignment_id}/run-history", response_model=list[ControlTestRunEntry])
def control_run_history(
    project_id: UUID,
    assignment_id: UUID,
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    _require_project_access(db, project_id, current_user.id)
    _get_assignment_or_404(db, project_id, assignment_id)

    logs = (
        db.query(AuditLog, User)
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .filter(
            AuditLog.project_id == project_id,
            AuditLog.entity_type == "ProjectControlAssignment",
            AuditLog.entity_id == assignment_id,
        )
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )

    result = []
    for log, user in logs:
        after = log.after_json or {}
        tested_at = after.get("tested_at") or after.get("last_tested_at")
        parsed_tested_at = None
        if tested_at:
            try:
                parsed_tested_at = datetime.fromisoformat(str(tested_at).replace("Z", "+00:00"))
            except ValueError:
                parsed_tested_at = log.created_at

        result.append(
            ControlTestRunEntry(
                id=log.id,
                action=log.action,
                tested_at=parsed_tested_at or log.created_at,
                tested_by_name=user.name if user else None,
                status=after.get("status"),
                evidence_links_json=after.get("evidence_links_json"),
                notes=after.get("implementation_notes") or after.get("notes"),
                created_at=log.created_at,
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
    row = _get_assignment_or_404(db, project_id, assignment_id)

    before = {
        "status": row.status,
        "control_owner_user_id": str(row.control_owner_user_id) if row.control_owner_user_id else None,
        "assignee_user_id": str(row.assignee_user_id) if row.assignee_user_id else None,
        "evidence_links_json": row.evidence_links_json,
        "last_tested_at": row.last_tested_at.isoformat() if row.last_tested_at else None,
    }
    patch = payload.model_dump(exclude_unset=True)

    if patch.get("status") == "TESTED" and "last_tested_at" not in patch:
        patch["last_tested_at"] = datetime.utcnow()

    for field, value in patch.items():
        setattr(row, field, value)

    if row.last_tested_at and row.review_frequency_days:
        row.next_review_at = row.last_tested_at + timedelta(days=row.review_frequency_days)

    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)

    is_test = _is_test_event(payload)
    log_action(
        db,
        current_user.id,
        AuditAction.CONTROL_TEST if is_test else AuditAction.PROJECT_UPDATE,
        "ProjectControlAssignment",
        row.id,
        project_id=project_id,
        org_id=project.org_id,
        before_json=before,
        after_json=_build_test_after_json(row, current_user.id) if is_test else patch,
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
            "action_label": action_label(log.action),
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
