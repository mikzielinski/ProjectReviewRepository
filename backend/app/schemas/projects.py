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
    approval_policies_json: Optional[dict] = None
    escalation_chain_json: Optional[dict] = None
    compliance_settings_json: Optional[dict] = None
    raci_matrix_json: Optional[dict] = None
    enable_4_eyes_principal: Optional[bool] = False
    required_document_types_json: Optional[list] = None  # List of {document_type_id, document_type_code, document_type_name, update_frequency, document_creator_user_id}
    invited_users: Optional[list[dict]] = None  # List of {user_id: UUID, role_code: str}


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    folder_id: Optional[UUID] = None
    retention_policy_json: Optional[dict] = None
    approval_policies_json: Optional[dict] = None
    escalation_chain_json: Optional[dict] = None
    compliance_settings_json: Optional[dict] = None
    raci_matrix_json: Optional[dict] = None


class ProjectRead(BaseModel):
    id: UUID
    org_id: UUID
    folder_id: Optional[UUID] = None
    key: str
    name: str
    status: str
    retention_policy_json: Optional[dict] = None
    approval_policies_json: Optional[dict] = None
    escalation_chain_json: Optional[dict] = None
    compliance_settings_json: Optional[dict] = None
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

