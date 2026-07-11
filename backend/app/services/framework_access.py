"""RBAC helpers for org admin and framework owner roles."""

from __future__ import annotations

import os
from typing import Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_active_user
from app.models import ComplianceFramework, User


def _parse_email_list(raw: str) -> list[str]:
    return [e.strip().lower() for e in raw.split(",") if e.strip()]


def admin_emails() -> list[str]:
    raw = os.getenv("ADMIN_EMAILS", "mikzielinski@gmail.com")
    return _parse_email_list(raw)


def is_org_admin(user: User) -> bool:
    return user.email.lower() in admin_emails()


def _framework_owner_email(framework_code: str) -> Optional[str]:
    env_key = f"FRAMEWORK_OWNER_{framework_code.upper()}"
    value = os.getenv(env_key)
    if value:
        return value.strip().lower()
    return None


def _user_owns_framework(user: User, fw: ComplianceFramework) -> bool:
    if fw.owner_user_id and fw.owner_user_id == user.id:
        return True
    if fw.owner_email and fw.owner_email.lower() == user.email.lower():
        return True
    env_owner = _framework_owner_email(fw.code)
    if env_owner and env_owner == user.email.lower():
        return True
    return False


def get_framework_by_code(db: Session, code: str) -> Optional[ComplianceFramework]:
    return (
        db.query(ComplianceFramework)
        .filter(ComplianceFramework.code == code.upper())
        .first()
    )


def is_framework_owner(user: User, framework_code: str, db: Session) -> bool:
    if is_org_admin(user):
        return True
    fw = get_framework_by_code(db, framework_code)
    if not fw:
        return False
    return _user_owns_framework(user, fw)


def owned_frameworks_for_user(db: Session, user: User) -> list[ComplianceFramework]:
    if is_org_admin(user):
        return (
            db.query(ComplianceFramework)
            .filter(ComplianceFramework.is_active.is_(True))
            .order_by(ComplianceFramework.code)
            .all()
        )

    rows = (
        db.query(ComplianceFramework)
        .filter(ComplianceFramework.is_active.is_(True))
        .order_by(ComplianceFramework.code)
        .all()
    )
    return [fw for fw in rows if _user_owns_framework(user, fw)]


def require_org_admin(user: User = Depends(get_current_active_user)) -> User:
    if not is_org_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Org admin access required")
    return user


def require_framework_owner(
    framework_code: str,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> User:
    if not is_framework_owner(user, framework_code, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Not authorized to manage framework '{framework_code}'",
        )
    return user
