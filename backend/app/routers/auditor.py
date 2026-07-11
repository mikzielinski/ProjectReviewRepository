"""Read-only auditor portal: cross-project audit trail, controls, and compliance gaps."""

import csv
import io
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import or_
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
from app.schemas.auditor import AuditorAuditEntry, AuditorControlItem, AuditorOverview
from app.services.audit import action_label
from app.services.project_access import org_ids_for_user, project_ids_for_user

router = APIRouter(prefix="/auditor", tags=["auditor"])

_GAP_STATUSES = {"NOT_STARTED", "IN_PROGRESS"}
_DONE_STATUSES = {"TESTED", "IMPLEMENTED", "NON_APPLICABLE"}


def _accessible_project_ids(db: Session, user_id: UUID) -> list[UUID]:
    return project_ids_for_user(db, user_id)


def _is_overdue(next_review_at: Optional[datetime]) -> bool:
    if not next_review_at:
        return False
    review_dt = next_review_at.replace(tzinfo=timezone.utc) if next_review_at.tzinfo is None else next_review_at
    return review_dt < datetime.now(timezone.utc)


def _gap_reason(status: str, is_overdue: bool, is_applicable: bool) -> Optional[str]:
    if not is_applicable:
        return None
    if status in _GAP_STATUSES:
        return f"Status: {status}"
    if is_overdue:
        return "Overdue review"
    if status not in _DONE_STATUSES:
        return f"Status: {status}"
    return None


@router.get("/overview", response_model=AuditorOverview)
def auditor_overview(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    project_ids = _accessible_project_ids(db, current_user.id)
    if not project_ids:
        return AuditorOverview(
            compliance_project_count=0,
            total_control_assignments=0,
            overdue_count=0,
            gap_count=0,
            tested_count=0,
            by_status={},
        )

    compliance_count = (
        db.query(Project)
        .filter(Project.id.in_(project_ids), Project.project_category == "COMPLIANCE")
        .count()
    )

    assignments = (
        db.query(ProjectControlAssignment)
        .filter(
            ProjectControlAssignment.project_id.in_(project_ids),
            ProjectControlAssignment.is_applicable.is_(True),
        )
        .all()
    )

    by_status: dict[str, int] = {}
    overdue_count = 0
    gap_count = 0
    tested_count = 0

    for a in assignments:
        by_status[a.status] = by_status.get(a.status, 0) + 1
        overdue = _is_overdue(a.next_review_at)
        if overdue:
            overdue_count += 1
        if a.status == "TESTED":
            tested_count += 1
        if _gap_reason(a.status, overdue, a.is_applicable):
            gap_count += 1

    return AuditorOverview(
        compliance_project_count=compliance_count,
        total_control_assignments=len(assignments),
        overdue_count=overdue_count,
        gap_count=gap_count,
        tested_count=tested_count,
        by_status=by_status,
    )


@router.get("/audit-trail", response_model=list[AuditorAuditEntry])
def auditor_audit_trail(
    project_id: Optional[UUID] = None,
    limit: int = Query(200, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    project_ids = _accessible_project_ids(db, current_user.id)
    if not project_ids:
        return []

    if project_id:
        if project_id not in project_ids:
            return []
        project_ids = [project_id]

    projects = {p.id: p for p in db.query(Project).filter(Project.id.in_(project_ids)).all()}

    filters = [AuditLog.project_id.in_(project_ids)]
    user_org_ids = org_ids_for_user(db, current_user.id)
    if user_org_ids:
        filters.append(
            (AuditLog.org_id.in_(user_org_ids)) & (AuditLog.project_id.is_(None))
        )

    logs = (
        db.query(AuditLog, User)
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .filter(or_(*filters))
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )

    result = []
    for log, user in logs:
        proj = projects.get(log.project_id) if log.project_id else None
        result.append(
            AuditorAuditEntry(
                id=log.id,
                project_id=log.project_id,
                project_key=proj.key if proj else None,
                project_name=proj.name if proj else None,
                action=log.action,
                action_label=action_label(log.action),
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                actor_name=user.name if user else None,
                actor_email=user.email if user else None,
                before_json=log.before_json,
                after_json=log.after_json,
                created_at=log.created_at,
            )
        )
    return result


def _list_controls(
    db: Session,
    user_id: UUID,
    project_id: Optional[UUID] = None,
    status: Optional[str] = None,
    overdue_only: bool = False,
) -> list[AuditorControlItem]:
    project_ids = _accessible_project_ids(db, user_id)
    if not project_ids:
        return []

    if project_id:
        if project_id not in project_ids:
            return []
        project_ids = [project_id]

    projects = {p.id: p for p in db.query(Project).filter(Project.id.in_(project_ids)).all()}

    rows = (
        db.query(ProjectControlAssignment, ComplianceControl, ComplianceFramework)
        .join(ComplianceControl, ComplianceControl.id == ProjectControlAssignment.control_id)
        .join(ComplianceFramework, ComplianceFramework.id == ComplianceControl.framework_id)
        .filter(
            ProjectControlAssignment.project_id.in_(project_ids),
            ProjectControlAssignment.is_applicable.is_(True),
        )
        .order_by(ProjectControlAssignment.project_id, ComplianceFramework.code, ComplianceControl.sort_order)
        .all()
    )

    result = []
    for a, ctrl, fw in rows:
        if status and a.status.upper() != status.upper():
            continue
        overdue = _is_overdue(a.next_review_at)
        if overdue_only and not overdue:
            continue

        owner = db.query(User).filter(User.id == a.control_owner_user_id).first() if a.control_owner_user_id else None
        assignee = db.query(User).filter(User.id == a.assignee_user_id).first() if a.assignee_user_id else None
        proj = projects.get(a.project_id)

        result.append(
            AuditorControlItem(
                assignment_id=a.id,
                project_id=a.project_id,
                project_key=proj.key if proj else None,
                project_name=proj.name if proj else None,
                control_ref=ctrl.control_ref,
                control_title=ctrl.title,
                framework_code=fw.code,
                domain=ctrl.domain,
                status=a.status,
                is_applicable=a.is_applicable,
                control_owner_name=owner.name if owner else None,
                assignee_name=assignee.name if assignee else None,
                next_review_at=a.next_review_at,
                last_tested_at=a.last_tested_at,
                is_overdue=overdue,
                gap_reason=_gap_reason(a.status, overdue, a.is_applicable),
            )
        )
    return result


@router.get("/controls", response_model=list[AuditorControlItem])
def auditor_controls(
    project_id: Optional[UUID] = None,
    status: Optional[str] = None,
    overdue_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    return _list_controls(db, current_user.id, project_id, status, overdue_only)


@router.get("/gaps", response_model=list[AuditorControlItem])
def auditor_gaps(
    project_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    return [c for c in _list_controls(db, current_user.id, project_id) if c.gap_reason]


def _controls_to_report_rows(controls: list[AuditorControlItem]) -> list[dict]:
    return [
        {
            "project_key": c.project_key or "",
            "project_name": c.project_name or "",
            "control_ref": c.control_ref,
            "control_title": c.control_title,
            "framework_code": c.framework_code or "",
            "domain": c.domain or "",
            "status": c.status,
            "control_owner": c.control_owner_name or "",
            "assignee": c.assignee_name or "",
            "next_review_at": c.next_review_at.isoformat() if c.next_review_at else "",
            "last_tested_at": c.last_tested_at.isoformat() if c.last_tested_at else "",
            "is_overdue": "yes" if c.is_overdue else "no",
            "gap_reason": c.gap_reason or "",
        }
        for c in controls
    ]


@router.get("/report")
def auditor_report(
    project_id: Optional[UUID] = None,
    format: str = Query("csv", pattern="^(csv|json)$"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Export all accessible controls as CSV or JSON report."""
    controls = _list_controls(db, current_user.id, project_id)
    rows = _controls_to_report_rows(controls)

    if format == "json":
        return {"generated_at": datetime.now(timezone.utc).isoformat(), "count": len(rows), "controls": rows}

    output = io.StringIO()
    fieldnames = [
        "project_key", "project_name", "control_ref", "control_title", "framework_code",
        "domain", "status", "control_owner", "assignee", "next_review_at",
        "last_tested_at", "is_overdue", "gap_reason",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

    filename = f"auditor-report-{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
