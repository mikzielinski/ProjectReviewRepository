"""Backfill demo audit trail entries for compliance projects (idempotent)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models import AuditLog, Project, User
from app.services.audit import AuditAction

logger = logging.getLogger(__name__)

_DEMO_ACTIONS = [
    (AuditAction.PROJECT_CREATE, "Project", "Project utworzony (seed demo)"),
    (AuditAction.PROJECT_UPDATE, "Project", "Profil compliance skonfigurowany"),
    ("CONTROL_SYNC", "Project", "Kontrolki zsynchronizowane z frameworkiem"),
    (AuditAction.TASK_CREATE, "Task", "Zadanie: przegląd kontrolki rozpoczęty"),
    (AuditAction.TASK_COMPLETE, "Task", "Zadanie: test kontrolki ukończony"),
    (AuditAction.DOCUMENT_CREATE, "Document", "Dokument compliance utworzony"),
]


def seed_auditor_demo_logs(db: Session, min_per_project: int = 3) -> int:
    """
    Ensure each DEMO-* compliance project has project-scoped audit entries.
    Skips projects that already have at least min_per_project logs.
    """
    owners = (
        db.query(User)
        .filter(User.is_active.is_(True))
        .order_by(User.created_at.asc())
        .limit(1)
        .all()
    )
    if not owners:
        return 0
    actor = owners[0]

    projects = (
        db.query(Project)
        .filter(Project.key.like("DEMO-%"), Project.project_category == "COMPLIANCE")
        .all()
    )
    if not projects:
        return 0

    created = 0
    now = datetime.now(timezone.utc)
    for project in projects:
        existing = (
            db.query(AuditLog)
            .filter(AuditLog.project_id == project.id)
            .count()
        )
        if existing >= min_per_project:
            continue

        for idx, (action, entity_type, note) in enumerate(_DEMO_ACTIONS):
            if existing + idx >= min_per_project and existing > 0:
                break
            db.add(
                AuditLog(
                    id=uuid4(),
                    org_id=project.org_id or actor.org_id,
                    project_id=project.id,
                    actor_user_id=actor.id,
                    action=action,
                    entity_type=entity_type,
                    entity_id=project.id,
                    after_json={"note": note, "seed": "auditor_demo"},
                    created_at=now - timedelta(days=len(_DEMO_ACTIONS) - idx, hours=idx),
                )
            )
            created += 1

    if created:
        db.commit()
        logger.info("Seeded %s demo audit log entries", created)
    return created
