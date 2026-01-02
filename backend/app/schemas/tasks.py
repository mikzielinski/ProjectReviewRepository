from typing import Optional
from uuid import UUID
from pydantic import BaseModel
from datetime import datetime


class TaskCreate(BaseModel):
    task_type: str  # e.g., "UPLOAD_DOCUMENT", "REVIEW", "APPROVAL"
    title: str
    description: Optional[str] = None
    raci_stage: Optional[str] = None  # Stage from RACI matrix
    raci_task_name: Optional[str] = None  # Task name from RACI matrix
    assigned_to_user_id: Optional[UUID] = None
    required_role: Optional[str] = None
    estimated_time_hours: Optional[int] = None
    due_at: Optional[datetime] = None
    priority: Optional[str] = "NORMAL"
    is_blocking: bool = False


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    assigned_to_user_id: Optional[UUID] = None
    reviewer_id: Optional[UUID] = None
    estimated_time_hours: Optional[int] = None
    actual_time_hours: Optional[int] = None
    due_at: Optional[datetime] = None
    priority: Optional[str] = None


class TaskReview(BaseModel):
    action: str  # "APPROVE", "REJECT", "REQUEST_CHANGES"
    comment: Optional[str] = None


class TaskRead(BaseModel):
    id: str  # Can be UUID string or Integer string
    project_id: UUID
    task_type: str
    title: str
    description: Optional[str] = None
    raci_stage: Optional[str] = None
    raci_task_name: Optional[str] = None
    assigned_to_user_id: Optional[UUID] = None
    assigned_to_name: Optional[str] = None
    reviewer_id: Optional[UUID] = None
    reviewer_name: Optional[str] = None
    required_role: Optional[str] = None
    estimated_time_hours: Optional[int] = None
    actual_time_hours: Optional[int] = None
    status: str
    priority: str
    due_at: Optional[datetime] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None
    verified_by: Optional[UUID] = None
    is_blocking: bool

    class Config:
        from_attributes = True
        json_encoders = {
            UUID: str,
            datetime: lambda v: v.isoformat() if v else None
        }


class GenerateTasksFromRACIRequest(BaseModel):
    task_type: str = "GENERAL"
    task_prefix: str = ""
    priority: str = "NORMAL"

