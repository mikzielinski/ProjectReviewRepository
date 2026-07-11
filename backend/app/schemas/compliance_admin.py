from typing import Any, Optional
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field


class ProjectTypeDefinitionCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    category: str = Field(default="DEVELOPMENT", description="DEVELOPMENT | COMPLIANCE")
    default_compliance_settings_json: Optional[dict] = None
    default_required_document_types_json: Optional[list] = None
    default_template_doc_types_json: Optional[list] = None
    default_control_framework_codes_json: Optional[list] = None
    org_specific: bool = False


class ProjectTypeDefinitionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    default_compliance_settings_json: Optional[dict] = None
    default_required_document_types_json: Optional[list] = None
    default_template_doc_types_json: Optional[list] = None
    default_control_framework_codes_json: Optional[list] = None
    is_active: Optional[bool] = None


class ProjectTypeDefinitionRead(BaseModel):
    id: UUID
    org_id: Optional[UUID] = None
    code: str
    name: str
    description: Optional[str] = None
    category: str
    default_compliance_settings_json: Optional[dict] = None
    default_required_document_types_json: Optional[list] = None
    default_template_doc_types_json: Optional[list] = None
    default_control_framework_codes_json: Optional[list] = None
    is_active: bool
    created_at: Any

    class Config:
        from_attributes = True


class ComplianceFrameworkRead(BaseModel):
    id: UUID
    code: str
    name: str
    version: Optional[str] = None
    description: Optional[str] = None
    source_url: Optional[str] = None
    is_active: bool
    control_count: int = 0

    class Config:
        from_attributes = True


class ComplianceControlRead(BaseModel):
    id: UUID
    framework_id: UUID
    framework_code: Optional[str] = None
    parent_control_id: Optional[UUID] = None
    control_ref: str
    title: str
    description: Optional[str] = None
    domain: Optional[str] = None
    control_type: Optional[str] = None
    testing_frequency_days: Optional[int] = None
    evidence_requirements_json: Optional[list] = None
    mapped_document_types_json: Optional[list] = None
    sort_order: int
    is_active: bool
    sub_controls: list["ComplianceControlRead"] = []

    class Config:
        from_attributes = True


class ProjectControlAssignmentRead(BaseModel):
    id: UUID
    project_id: UUID
    control_id: UUID
    control_ref: Optional[str] = None
    control_title: Optional[str] = None
    framework_code: Optional[str] = None
    domain: Optional[str] = None
    control_owner_user_id: Optional[UUID] = None
    control_owner_name: Optional[str] = None
    assignee_user_id: Optional[UUID] = None
    assignee_name: Optional[str] = None
    status: str
    is_applicable: bool
    implementation_notes: Optional[str] = None
    evidence_links_json: Optional[list] = None
    review_frequency_days: Optional[int] = None
    next_review_at: Optional[datetime] = None
    last_tested_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProjectControlAssignmentDetailRead(ProjectControlAssignmentRead):
    description: Optional[str] = None
    control_type: Optional[str] = None
    testing_frequency_days: Optional[int] = None
    mapped_document_types_json: Optional[list] = None
    evidence_requirements_json: Optional[list] = None


class ControlTestRunEntry(BaseModel):
    id: UUID
    action: str
    tested_at: Optional[datetime] = None
    tested_by_name: Optional[str] = None
    status: Optional[str] = None
    evidence_links_json: Optional[list] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None


class ProjectControlAssignmentUpdate(BaseModel):
    control_owner_user_id: Optional[UUID] = None
    assignee_user_id: Optional[UUID] = None
    status: Optional[str] = None
    is_applicable: Optional[bool] = None
    implementation_notes: Optional[str] = None
    evidence_links_json: Optional[list] = None
    review_frequency_days: Optional[int] = None
    next_review_at: Optional[datetime] = None
    last_tested_at: Optional[datetime] = None


class ControlScheduleItem(BaseModel):
    assignment_id: UUID
    project_id: UUID
    project_key: Optional[str] = None
    control_ref: str
    control_title: str
    framework_code: Optional[str] = None
    control_owner_name: Optional[str] = None
    assignee_name: Optional[str] = None
    next_review_at: Optional[datetime] = None
    status: str
    is_overdue: bool = False
