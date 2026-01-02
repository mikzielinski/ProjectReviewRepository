from typing import Optional, List
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class ProjectFolderCreate(BaseModel):
    name: str
    parent_folder_id: Optional[UUID] = None


class ProjectFolderRead(BaseModel):
    id: UUID
    org_id: UUID
    name: str
    parent_folder_id: Optional[UUID] = None
    created_by: UUID
    created_at: datetime
    subfolders: List["ProjectFolderRead"] = []
    project_count: int = 0

    class Config:
        from_attributes = True


class ProjectFolderTree(BaseModel):
    id: Optional[UUID] = None  # Can be None for root projects
    name: str
    parent_folder_id: Optional[UUID] = None
    subfolders: List["ProjectFolderTree"] = []
    projects: List[dict] = []  # List of projects in this folder

    class Config:
        from_attributes = True


class MoveProjectRequest(BaseModel):
    folder_id: Optional[UUID] = None  # None means move to root

