"""
Pydantic schemas for Document Types.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class DocumentTypeCreate(BaseModel):
    """Schema for creating a document type."""
    code: str = Field(..., description="Unique code for the document type (e.g., 'PDD', 'CUSTOM_DOC')")
    name: str = Field(..., description="Display name (e.g., 'Product Design Document')")
    description: Optional[str] = Field(None, description="Optional description")
    default_file_extension: str = Field("docx", description="Default file extension (docx, xlsx, pptx)")
    org_specific: bool = Field(False, description="If True, this type is specific to the organization")


class DocumentTypeUpdate(BaseModel):
    """Schema for updating a document type."""
    name: Optional[str] = None
    description: Optional[str] = None
    default_file_extension: Optional[str] = None
    is_active: Optional[bool] = None


class DocumentTypeRead(BaseModel):
    """Schema for reading a document type."""
    id: UUID
    org_id: Optional[UUID] = None
    code: str
    name: str
    description: Optional[str] = None
    default_file_extension: str
    is_active: bool
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

