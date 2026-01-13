"""
Document Types API endpoints.
Allows creating and managing document types for templates.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app.db import get_db
from app.dependencies import get_current_active_user
from app.models import DocumentType, User
from app.schemas import DocumentTypeCreate, DocumentTypeRead, DocumentTypeUpdate
from app.services.audit import log_action, AuditAction

router = APIRouter(prefix="/document-types", tags=["document-types"])


@router.post("", response_model=DocumentTypeRead, status_code=status.HTTP_201_CREATED)
def create_document_type(
    request: Request,
    payload: DocumentTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Create a new document type.
    Document types can be organization-specific (org_id) or global (org_id=None).
    """
    # Check if code already exists (case-insensitive)
    existing = db.query(DocumentType).filter(
        DocumentType.code.ilike(payload.code)
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Document type with code '{payload.code}' already exists"
        )
    
    # Validate file extension
    valid_extensions = ['docx', 'xlsx', 'pptx']
    if payload.default_file_extension not in valid_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file extension. Must be one of: {', '.join(valid_extensions)}"
        )
    
    # Get user's organization ID from their projects
    org_id = None
    if payload.org_specific:
        # Get user's org from their project memberships
        from app.models import ProjectMember, Project
        user_project = db.query(Project).join(
            ProjectMember, Project.id == ProjectMember.project_id
        ).filter(
            ProjectMember.user_id == current_user.id,
            (ProjectMember.expires_at.is_(None) | (ProjectMember.expires_at > func.now()))
        ).first()
        
        if user_project:
            org_id = user_project.org_id
        else:
            # Fallback: use default org if user has no projects
            from app.models import Org
            default_org = db.query(Org).first()
            if default_org:
                org_id = default_org.id
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot determine organization. Please create a project first."
                )
    
    # Create document type
    doc_type = DocumentType(
        org_id=org_id,
        code=payload.code.upper(),  # Always uppercase
        name=payload.name,
        description=payload.description,
        default_file_extension=payload.default_file_extension,
        is_active=True,
        created_by=current_user.id
    )
    
    db.add(doc_type)
    db.commit()  # Commit immediately to ensure doc_type is persisted
    
    # Extract all values after commit to avoid session issues
    doc_type_id_value = doc_type.id
    doc_type_org_id_value = doc_type.org_id
    doc_type_code_value = doc_type.code
    doc_type_name_value = doc_type.name
    doc_type_description_value = doc_type.description
    doc_type_ext_value = doc_type.default_file_extension
    
    # Audit log - in separate try/except so it doesn't affect doc_type creation
    try:
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        
        log_action(
            db,
            actor_user_id=current_user.id,
            action=AuditAction.TEMPLATE_CREATE,  # Reusing action type
            entity_type="DocumentType",
            entity_id=doc_type_id_value,
            org_id=doc_type_org_id_value,
            after_json={
                "code": doc_type_code_value,
                "name": doc_type_name_value,
                "description": doc_type_description_value,
                "default_file_extension": doc_type_ext_value,
                "org_id": str(doc_type_org_id_value) if doc_type_org_id_value else None
            },
            ip=client_ip,
            user_agent=user_agent,
        )
        db.commit()  # Commit audit log
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Audit logging failed: {str(e)}")
        # Don't fail the whole request if audit logging fails
        try:
            db.rollback()
        except:
            pass
    
    # Refresh the object to ensure it's fully loaded from database
    db.refresh(doc_type)
    
    return doc_type


@router.get("", response_model=List[DocumentTypeRead])
def list_document_types(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    List all document types.
    Returns global types (org_id=None) and types specific to user's organization.
    """
    # Get user's organization IDs from their project memberships
    from app.models import ProjectMember, Project
    user_orgs = db.query(Project.org_id).join(
        ProjectMember, Project.id == ProjectMember.project_id
    ).filter(
        ProjectMember.user_id == current_user.id,
        (ProjectMember.expires_at.is_(None) | (ProjectMember.expires_at > func.now()))
    ).distinct().all()
    user_org_ids = [org_id[0] for org_id in user_orgs] if user_orgs else []
    
    # Always include global types (org_id=None)
    # Also include organization-specific types if user belongs to those orgs
    filters = [DocumentType.org_id.is_(None)]  # Always include global types
    
    if user_org_ids:
        filters.append(DocumentType.org_id.in_(user_org_ids))
    
    query = db.query(DocumentType).filter(or_(*filters))
    
    if not include_inactive:
        query = query.filter(DocumentType.is_active == True)
    
    doc_types = query.order_by(DocumentType.name).all()
    return doc_types


@router.get("/{doc_type_id}", response_model=DocumentTypeRead)
def get_document_type(
    doc_type_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific document type by ID."""
    from uuid import UUID
    
    try:
        doc_type_uuid = UUID(doc_type_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document type ID format")
    
    doc_type = db.query(DocumentType).filter(DocumentType.id == doc_type_uuid).first()
    
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    
    # Check access: must be global or belong to user's org
    if doc_type.org_id:
        from app.models import ProjectMember, Project
        user_orgs = db.query(Project.org_id).join(
            ProjectMember, Project.id == ProjectMember.project_id
        ).filter(
            ProjectMember.user_id == current_user.id,
            (ProjectMember.expires_at.is_(None) | (ProjectMember.expires_at > func.now()))
        ).distinct().all()
        user_org_ids = [org_id[0] for org_id in user_orgs] if user_orgs else []
        
        if doc_type.org_id not in user_org_ids:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return doc_type


@router.put("/{doc_type_id}", response_model=DocumentTypeRead)
def update_document_type(
    request: Request,
    doc_type_id: str,
    payload: DocumentTypeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a document type."""
    from uuid import UUID
    from datetime import datetime
    
    try:
        doc_type_uuid = UUID(doc_type_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document type ID format")
    
    doc_type = db.query(DocumentType).filter(DocumentType.id == doc_type_uuid).first()
    
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    
    # Check access
    if doc_type.org_id:
        from app.models import ProjectMember, Project
        user_orgs = db.query(Project.org_id).join(
            ProjectMember, Project.id == ProjectMember.project_id
        ).filter(
            ProjectMember.user_id == current_user.id,
            (ProjectMember.expires_at.is_(None) | (ProjectMember.expires_at > func.now()))
        ).distinct().all()
        user_org_ids = [org_id[0] for org_id in user_orgs] if user_orgs else []
        
        if doc_type.org_id not in user_org_ids:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Update fields
    if payload.name is not None:
        doc_type.name = payload.name
    if payload.description is not None:
        doc_type.description = payload.description
    if payload.default_file_extension is not None:
        valid_extensions = ['docx', 'xlsx', 'pptx']
        if payload.default_file_extension not in valid_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file extension. Must be one of: {', '.join(valid_extensions)}"
            )
        doc_type.default_file_extension = payload.default_file_extension
    if payload.is_active is not None:
        doc_type.is_active = payload.is_active
    
    doc_type.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(doc_type)
    
    return doc_type


@router.delete("/{doc_type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document_type(
    doc_type_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a document type (soft delete by setting is_active=False)."""
    from uuid import UUID
    
    try:
        doc_type_uuid = UUID(doc_type_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document type ID format")
    
    doc_type = db.query(DocumentType).filter(DocumentType.id == doc_type_uuid).first()
    
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    
    # Check access
    if doc_type.org_id:
        from app.models import ProjectMember, Project
        user_orgs = db.query(Project.org_id).join(
            ProjectMember, Project.id == ProjectMember.project_id
        ).filter(
            ProjectMember.user_id == current_user.id,
            (ProjectMember.expires_at.is_(None) | (ProjectMember.expires_at > func.now()))
        ).distinct().all()
        user_org_ids = [org_id[0] for org_id in user_orgs] if user_orgs else []
        
        if doc_type.org_id not in user_org_ids:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Soft delete
    doc_type.is_active = False
    db.commit()
    
    return None

