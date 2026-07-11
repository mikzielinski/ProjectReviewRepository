from typing import Any, Optional
from uuid import UUID
from pydantic import BaseModel, Field

from app.schemas.auth import UserRead


class ProjectCreate(BaseModel):
    org_id: Optional[UUID] = None
    folder_id: Optional[UUID] = None
    key: str
    name: str
    description: Optional[str] = None
    project_type: Optional[str] = Field(default="IT", description="IT | RPA | INFRA | DATA | SECURITY | INTEGRATION")
    project_category: Optional[str] = Field(default="DEVELOPMENT", description="DEVELOPMENT | COMPLIANCE")
    project_type_definition_id: Optional[UUID] = None
    status: Optional[str] = "ACTIVE"
    retention_policy_json: Optional[dict] = None
    approval_policies_json: Optional[dict] = None
    escalation_chain_json: Optional[dict] = None
    compliance_settings_json: Optional[dict] = None
    raci_matrix_json: Optional[dict] = None
    enable_4_eyes_principal: Optional[bool] = False
    tech_stack_json: Optional[list] = None
    required_document_types_json: Optional[list] = None
    invited_users: Optional[list[dict]] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    project_type: Optional[str] = None
    project_category: Optional[str] = None
    project_type_definition_id: Optional[UUID] = None
    status: Optional[str] = None
    folder_id: Optional[UUID] = None
    retention_policy_json: Optional[dict] = None
    approval_policies_json: Optional[dict] = None
    escalation_chain_json: Optional[dict] = None
    compliance_settings_json: Optional[dict] = None
    raci_matrix_json: Optional[dict] = None
    enable_4_eyes_principal: Optional[bool] = None
    tech_stack_json: Optional[list] = None
    required_document_types_json: Optional[list] = None


class ProjectRead(BaseModel):
    id: UUID
    org_id: UUID
    folder_id: Optional[UUID] = None
    key: str
    name: str
    description: Optional[str] = None
    project_type: str = "IT"
    project_category: str = "DEVELOPMENT"
    project_type_definition_id: Optional[UUID] = None
    status: str
    retention_policy_json: Optional[dict] = None
    approval_policies_json: Optional[dict] = None
    escalation_chain_json: Optional[dict] = None
    compliance_settings_json: Optional[dict] = None
    required_document_types_json: Optional[list] = None
    enable_4_eyes_principal: bool = False
    tech_stack_json: Optional[list] = None
    raci_matrix_json: Optional[dict] = None
    created_at: Any

    class Config:
        from_attributes = True


class RACIMatrixUpdate(BaseModel):
    raci_matrix_json: dict


class ProjectMemberInvite(BaseModel):
    user_id: UUID
    role_code: str
    is_temporary: bool = False
    expires_at: Optional[Any] = None


class ProjectMemberRead(BaseModel):
    id: UUID
    project_id: UUID
    user_id: UUID
    role_code: str
    is_temporary: bool
    expires_at: Optional[Any] = None
    invited_by: Optional[UUID] = None
    created_at: Any
    user: Optional[UserRead] = None

    class Config:
        from_attributes = True


class ItProjectSummary(BaseModel):
    project_id: UUID
    key: str
    name: str
    project_type: str
    project_category: str = "DEVELOPMENT"
    status: str
    compliance_standards: list[str]
    documents_total: int
    documents_approved: int
    documents_in_review: int
    documents_draft: int
    open_tasks: int
    overdue_tasks: int
    required_docs_missing: int
    governance_score: float
    tech_stack: list[str]


class ItPortfolioDashboard(BaseModel):
    total_projects: int
    active_projects: int
    open_tasks: int
    documents_in_review: int
    compliance_gaps: int
    projects: list[ItProjectSummary]
