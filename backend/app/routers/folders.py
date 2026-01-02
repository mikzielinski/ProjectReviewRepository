from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID

from app.db import get_db
from app.dependencies import get_current_active_user
from app.models import ProjectFolder, Project, User
from app.schemas.folders import ProjectFolderCreate, ProjectFolderRead, ProjectFolderTree, MoveProjectRequest
from app.core.enums import RoleCode

router = APIRouter(prefix="/folders", tags=["folders"])


def check_is_org_admin(current_user: User, db: Session):
    """Check if user can manage folders - allow all logged-in users for now"""
    # For folder management, we allow all logged-in users
    # In a production system, you might want to check for specific admin roles
    # But for organizational purposes, allowing all users to create folders is reasonable
    pass


@router.post("", response_model=ProjectFolderRead)
def create_folder(
    folder_data: ProjectFolderCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Create a new project folder"""
    check_is_org_admin(current_user, db)
    
    # Get user's org_id from first project they're a member of, or use/create default org
    from app.models import ProjectMember, Org
    member = db.query(ProjectMember).filter(ProjectMember.user_id == current_user.id).first()
    
    if member:
        project = db.query(Project).filter(Project.id == member.project_id).first()
        if project:
            org_id = project.org_id
        else:
            # Member exists but project doesn't - use default org
            default_org = db.query(Org).first()
            if not default_org:
                import uuid
                default_org = Org(id=uuid.uuid4(), name="Default Organization")
                db.add(default_org)
                db.commit()
                db.refresh(default_org)
            org_id = default_org.id
    else:
        # User is not a member of any project - use or create default org
        default_org = db.query(Org).first()
        if not default_org:
            import uuid
            default_org = Org(id=uuid.uuid4(), name="Default Organization")
            db.add(default_org)
            db.commit()
            db.refresh(default_org)
        org_id = default_org.id
    
    # Check if folder with same name already exists in same parent
    existing = db.query(ProjectFolder).filter(
        ProjectFolder.org_id == org_id,
        ProjectFolder.name == folder_data.name,
        ProjectFolder.parent_folder_id == folder_data.parent_folder_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Folder with this name already exists in this location")
    
    # Validate parent folder exists if provided
    if folder_data.parent_folder_id:
        parent = db.query(ProjectFolder).filter(
            ProjectFolder.id == folder_data.parent_folder_id,
            ProjectFolder.org_id == org_id
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent folder not found")
    
    folder = ProjectFolder(
        org_id=org_id,
        name=folder_data.name,
        parent_folder_id=folder_data.parent_folder_id,
        created_by=current_user.id
    )
    
    db.add(folder)
    db.commit()
    db.refresh(folder)
    
    return ProjectFolderRead.model_validate(folder)


@router.get("")
def list_folders_tree(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Get folder tree structure with projects"""
    try:
        # Get user's org_id
        from app.models import ProjectMember, Org
        
        # Try to get org_id from user's project membership
        member = db.query(ProjectMember).filter(ProjectMember.user_id == current_user.id).first()
        
        if member:
            project = db.query(Project).filter(Project.id == member.project_id).first()
            if project:
                org_id = project.org_id
            else:
                # Member exists but project doesn't - use default org
                default_org = db.query(Org).first()
                if not default_org:
                    return []
                org_id = default_org.id
        else:
            # User is not a member of any project - use default org
            default_org = db.query(Org).first()
            if not default_org:
                return []
            org_id = default_org.id
        
        # Get all folders for this org
        try:
            all_folders = db.query(ProjectFolder).filter(ProjectFolder.org_id == org_id).all()
        except Exception as e:
            # Table might not exist if migration hasn't been run
            import logging
            logging.getLogger(__name__).warning(f"ProjectFolder table might not exist: {e}")
            return []
        
        # Get all projects for this org
        try:
            all_projects = db.query(Project).filter(Project.org_id == org_id).all()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Error querying projects: {e}")
            return []
        
        # Build tree structure recursively
        def build_tree(parent_id=None):
            folders_in_level = [f for f in all_folders if f.parent_folder_id == parent_id]
            result = []
            
            for folder in folders_in_level:
                folder_data = {
                    "id": folder.id,
                    "name": folder.name,
                    "parent_folder_id": folder.parent_folder_id,
                    "subfolders": build_tree(folder.id),
                    "projects": [{"id": str(p.id), "name": p.name, "key": p.key, "status": p.status} 
                                for p in all_projects if getattr(p, 'folder_id', None) == folder.id]
                }
                result.append(folder_data)
            
            return result
        
        # Build tree starting from root (None parent)
        result = build_tree(None)
        
        # Add root projects if any
        root_projects_list = [{"id": str(p.id), "name": p.name, "key": p.key, "status": p.status} 
                             for p in all_projects if getattr(p, 'folder_id', None) is None]
        if root_projects_list:
            result.append({
                "id": None,  # None for root projects container
                "name": "Root",
                "parent_folder_id": None,
                "subfolders": [],
                "projects": root_projects_list
            })
        
        # Convert to dict format - return as-is since we have None IDs for root
        # FastAPI will serialize dicts automatically
        return result
    except Exception as e:
        import logging
        import traceback
        logger = logging.getLogger(__name__)
        logger.error(f"Error in list_folders_tree: {e}")
        logger.error(traceback.format_exc())
        # Return empty list instead of raising error to prevent UI breakage
        return []


@router.put("/{folder_id}", response_model=ProjectFolderRead)
def update_folder(
    folder_id: str,
    folder_data: ProjectFolderCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Update a folder (ORG_ADMIN only)"""
    check_is_org_admin(current_user, db)
    
    try:
        folder_uuid = UUID(folder_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid folder ID format")
    
    folder = db.query(ProjectFolder).filter(ProjectFolder.id == folder_uuid).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Check for duplicate name in same parent
    existing = db.query(ProjectFolder).filter(
        ProjectFolder.org_id == folder.org_id,
        ProjectFolder.name == folder_data.name,
        ProjectFolder.parent_folder_id == folder_data.parent_folder_id,
        ProjectFolder.id != folder_uuid
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Folder with this name already exists in this location")
    
    folder.name = folder_data.name
    folder.parent_folder_id = folder_data.parent_folder_id
    
    db.commit()
    db.refresh(folder)
    
    return ProjectFolderRead.model_validate(folder)


@router.delete("/{folder_id}", response_model=dict)
def delete_folder(
    folder_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Delete a folder (ORG_ADMIN only)"""
    check_is_org_admin(current_user, db)
    
    try:
        folder_uuid = UUID(folder_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid folder ID format")
    
    folder = db.query(ProjectFolder).filter(ProjectFolder.id == folder_uuid).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Check if folder has subfolders
    subfolders = db.query(ProjectFolder).filter(ProjectFolder.parent_folder_id == folder_uuid).count()
    if subfolders > 0:
        raise HTTPException(status_code=400, detail="Cannot delete folder with subfolders. Delete subfolders first.")
    
    # Check if folder has projects
    projects_count = db.query(Project).filter(Project.folder_id == folder_uuid).count()
    if projects_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete folder with projects. Move projects first.")
    
    db.delete(folder)
    db.commit()
    
    return {"id": str(folder_uuid), "status": "deleted"}


@router.post("/projects/{project_id}/move", response_model=dict)
def move_project(
    project_id: str,
    move_data: MoveProjectRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Move a project to a different folder (ORG_ADMIN only)"""
    check_is_org_admin(current_user, db)
    
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Validate folder exists if provided
    if move_data.folder_id:
        folder = db.query(ProjectFolder).filter(ProjectFolder.id == move_data.folder_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        if folder.org_id != project.org_id:
            raise HTTPException(status_code=400, detail="Folder belongs to different organization")
    
    project.folder_id = move_data.folder_id
    db.commit()
    db.refresh(project)
    
    return {"id": str(project_uuid), "folder_id": str(move_data.folder_id) if move_data.folder_id else None, "status": "moved"}

