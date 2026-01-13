from typing import Optional
from uuid import UUID
from pydantic import BaseModel
from datetime import datetime


class DocumentCreate(BaseModel):
    project_id: UUID
    doc_type: str
    title: str
    created_by: Optional[UUID] = None


class DocumentRead(BaseModel):
    id: UUID
    project_id: UUID
    doc_type: str
    title: str
    current_version_id: Optional[UUID] = None
    current_version_state: Optional[str] = None  # State of current version (DRAFT, IN_REVIEW, APPROVED, RELEASED, ARCHIVED)
    created_by: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentVersionCreate(BaseModel):
    version_string: Optional[str] = None
    template_id: Optional[UUID] = None
    content_json: Optional[dict] = None
    pkb_snapshot_id: Optional[UUID] = None
    created_by: Optional[UUID] = None


class DocumentVersionRead(BaseModel):
    id: UUID
    document_id: UUID
    version_string: str
    state: str
    template_id: Optional[UUID] = None
    template: Optional[dict] = None  # Template info (doc_type, object_key, etc.)
    content_json: Optional[dict] = None
    pkb_snapshot_id: Optional[UUID] = None
    file_object_key: Optional[str] = None
    file_hash: Optional[str] = None
    created_by: UUID
    created_at: datetime
    submitted_at: Optional[datetime] = None
    locked_at: Optional[datetime] = None

    class Config:
        from_attributes = True

