from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class AuditorOverview(BaseModel):
    compliance_project_count: int
    total_control_assignments: int
    overdue_count: int
    gap_count: int
    tested_count: int
    by_status: dict[str, int]


class AuditorAuditEntry(BaseModel):
    id: UUID
    project_id: Optional[UUID] = None
    project_key: Optional[str] = None
    project_name: Optional[str] = None
    action: str
    action_label: Optional[str] = None
    entity_type: str
    entity_id: UUID
    actor_name: Optional[str] = None
    actor_email: Optional[str] = None
    before_json: Optional[dict] = None
    after_json: Optional[dict] = None
    created_at: Optional[datetime] = None


class AuditorControlItem(BaseModel):
    assignment_id: UUID
    project_id: UUID
    project_key: Optional[str] = None
    project_name: Optional[str] = None
    control_ref: str
    control_title: str
    framework_code: Optional[str] = None
    domain: Optional[str] = None
    status: str
    is_applicable: bool
    control_owner_name: Optional[str] = None
    assignee_name: Optional[str] = None
    next_review_at: Optional[datetime] = None
    last_tested_at: Optional[datetime] = None
    is_overdue: bool = False
    gap_reason: Optional[str] = None
