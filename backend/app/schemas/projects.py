from typing import Optional
from uuid import UUID
from pydantic import BaseModel
from datetime import datetime
from app.schemas.auth import UserRead


class ProjectCreate(BaseModel):
    org_id: Optional[UUID] = None
    folder_id: Optional[UUID] = None
    key: str
    name: str
    status: Optional[str] = "ACTIVE"
    retention_policy_json: Optional[dict] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    retention_policy_json: Optional[dict] = None


class ProjectRead(BaseModel):
    id: UUID
    org_id: UUID
    folder_id: Optional[UUID] = None
    key: str
    name: str
    status: str
    retention_policy_json: Optional[dict] = None
    raci_matrix_json: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RACIMatrixUpdate(BaseModel):
    raci_matrix_json: dict


class ProjectMemberInvite(BaseModel):
    user_id: UUID
    role_code: str
    is_temporary: bool = False
    expires_at: Optional[datetime] = None


class ProjectMemberRead(BaseModel):
    id: UUID
    project_id: UUID
    user_id: UUID
    role_code: str
    is_temporary: bool
    expires_at: Optional[datetime] = None
    invited_by: Optional[UUID] = None
    created_at: datetime
    user: Optional["UserRead"] = None  # Include user details

    class Config:
        from_attributes = True

