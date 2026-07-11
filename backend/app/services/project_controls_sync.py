"""Sync project control assignments from enabled compliance frameworks."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import ComplianceControl, ComplianceFramework, Project, ProjectControlAssignment


def framework_codes_from_project(project: Project) -> list[str]:
    settings = project.compliance_settings_json or {}
    mapping = {
        "iso27001": "ISO27001",
        "soc2": "SOC2",
        "sox": "SOX",
        "hipaa": "HIPAA",
        "gxp": "GXP",
        "iso42001": "ISO42001",
        "eu_ai_act": "EU_AI_ACT",
        "knf": "KNF_DORA",
    }
    return [mapping[k] for k, v in settings.items() if v and k in mapping]


def sync_controls_for_project(
    db: Session,
    project: Project,
    owner_user_id: UUID,
) -> int:
    """Create missing control assignments. Returns count created."""
    fw_codes = framework_codes_from_project(project)
    if not fw_codes:
        return 0

    frameworks = db.query(ComplianceFramework).filter(ComplianceFramework.code.in_(fw_codes)).all()
    fw_ids = [f.id for f in frameworks]
    controls = (
        db.query(ComplianceControl)
        .filter(ComplianceControl.framework_id.in_(fw_ids), ComplianceControl.is_active.is_(True))
        .order_by(ComplianceControl.sort_order)
        .all()
    )

    created = 0
    for ctrl in controls:
        exists = (
            db.query(ProjectControlAssignment)
            .filter(
                ProjectControlAssignment.project_id == project.id,
                ProjectControlAssignment.control_id == ctrl.id,
            )
            .first()
        )
        if exists:
            continue
        next_review = None
        if ctrl.testing_frequency_days:
            next_review = datetime.now(timezone.utc) + timedelta(days=ctrl.testing_frequency_days)
        db.add(
            ProjectControlAssignment(
                project_id=project.id,
                control_id=ctrl.id,
                control_owner_user_id=owner_user_id,
                status="NOT_STARTED",
                review_frequency_days=ctrl.testing_frequency_days,
                next_review_at=next_review,
            )
        )
        created += 1

    if created:
        db.commit()
    return created
