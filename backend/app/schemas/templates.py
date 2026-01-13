from typing import Optional
from uuid import UUID
from pydantic import BaseModel
from datetime import datetime


class TemplateCreate(BaseModel):
    org_id: Optional[UUID] = None
    doc_type: str
    name: str
    version: Optional[str] = "v1"
    object_key: str
    file_hash: str
    status: Optional[str] = "DRAFT"
    mapping_manifest_json: dict
    created_by: Optional[UUID] = None


class TemplateUpdate(BaseModel):
    doc_type: Optional[str] = None
    name: Optional[str] = None
    version: Optional[str] = None
    object_key: Optional[str] = None
    file_hash: Optional[str] = None
    mapping_manifest_json: Optional[dict] = None
    status: Optional[str] = None


class TemplateRead(BaseModel):
    id: UUID
    org_id: UUID
    doc_type: str
    name: str
    version: str
    object_key: str
    file_hash: str
    pdf_object_key: Optional[str] = None
    pdf_hash: Optional[str] = None
    checked_out_by: Optional[UUID] = None
    checked_out_at: Optional[datetime] = None
    status: str
    mapping_manifest_json: dict
    created_by: UUID
    created_at: datetime

    class Config:
        from_attributes = True

