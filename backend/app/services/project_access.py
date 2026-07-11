"""Resolve which projects a user can access."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.enums import RoleCode
from app.models import Project, ProjectMember, User


def _active_memberships(db: Session, user_id: UUID) -> list[ProjectMember]:
    return (
        db.query(ProjectMember)
        .filter(ProjectMember.user_id == user_id)
        .filter(
            (ProjectMember.expires_at.is_(None))
            | (ProjectMember.expires_at > datetime.now(timezone.utc))
        )
        .all()
    )


def project_ids_for_user(db: Session, user_id: UUID) -> list[UUID]:
    """Project IDs the user can access via active membership."""
    return [m.project_id for m in _active_memberships(db, user_id)]


def org_ids_for_user(db: Session, user_id: UUID) -> list[UUID]:
    """Distinct org IDs from projects the user can access via active membership."""
    rows = (
        db.query(Project.org_id)
        .join(ProjectMember, Project.id == ProjectMember.project_id)
        .filter(ProjectMember.user_id == user_id)
        .filter(
            (ProjectMember.expires_at.is_(None))
            | (ProjectMember.expires_at > datetime.now(timezone.utc))
        )
        .distinct()
        .all()
    )
    return [row[0] for row in rows]


def bootstrap_memberships_from_env(db: Session) -> int:
    """
    Ensure emails listed in PROJECT_ACCESS_BOOTSTRAP_EMAILS have Business Owner
    membership on every project. Safe to run on every startup (idempotent).
    """
    raw = os.getenv("PROJECT_ACCESS_BOOTSTRAP_EMAILS", "mikzielinski@gmail.com")
    emails = [e.strip().lower() for e in raw.split(",") if e.strip()]
    if not emails:
        return 0

    users = db.query(User).filter(User.email.in_(emails), User.is_active.is_(True)).all()
    if not users:
        return 0

    projects = db.query(Project).all()
    if not projects:
        return 0

    added = 0
    for user in users:
        for project in projects:
            exists = (
                db.query(ProjectMember)
                .filter(
                    ProjectMember.project_id == project.id,
                    ProjectMember.user_id == user.id,
                )
                .first()
            )
            if exists:
                continue
            db.add(
                ProjectMember(
                    project_id=project.id,
                    user_id=user.id,
                    role_code=RoleCode.BUSINESS_OWNER.value,
                    is_temporary=False,
                    expires_at=None,
                    invited_by=user.id,
                )
            )
            added += 1

    if added:
        db.commit()
    return added
