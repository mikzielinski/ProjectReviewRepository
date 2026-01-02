from typing import List, Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_active_user
from app.db import get_db
from app.models import ProjectMember, User
from app.core.enums import RoleCode


def require_project_role(
    allowed_roles: List[RoleCode], project_id_param: str = "project_id"
):
    def dependency(
        user: User = Depends(get_current_active_user), db: Session = Depends(get_db), **kwargs
    ) -> User:
        project_id = kwargs.get(project_id_param)
        if project_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project required")
        membership = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
            .first()
        )
        if membership and membership.role_code in [r.value for r in allowed_roles]:
            return user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    return dependency

