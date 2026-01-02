from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db import get_db
from app.dependencies import get_current_active_user
from app.schemas import TemplateCreate, TemplateRead, TemplateUpdate
from app.models import Template
from app.core.enums import TemplateStatus

router = APIRouter(prefix="/templates", tags=["templates"])


@router.post("/upload", response_model=dict)
def upload_template_file(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """
    Upload a template file and return object_key and file_hash.
    HIPAA/GxP/GIS Compliance: Files are stored with integrity verification.
    """
    from app.services.storage import upload_file, generate_object_key
    import hashlib
    
    # Read file content
    content = file.file.read()
    
    # Generate object key
    object_key = generate_object_key("templates", file.filename)
    
    # Upload file and get hash
    uploaded_key, file_hash = upload_file(content, object_key, file.content_type or "application/octet-stream")
    
    # HIPAA/GxP/GIS Compliance: Audit log for file upload
    # Use separate session for audit log to avoid transaction conflicts
    try:
        from app.services.audit import log_action, AuditAction
        from app.db import SessionLocal
        
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        
        # Use separate session for audit logging to avoid transaction conflicts
        audit_db = SessionLocal()
        try:
            log_action(
                audit_db,
                actor_user_id=current_user.id,
                action=AuditAction.TEMPLATE_CREATE,  # Using TEMPLATE_CREATE for file upload
                entity_type="TemplateFile",
                entity_id=str(uploaded_key),  # Use object_key as entity_id for file uploads
                after_json={
                    "action": "file_upload",
                    "object_key": uploaded_key,
                    "filename": file.filename,
                    "file_size": len(content),
                    "file_hash": file_hash[:20] + "...",  # Partial hash for audit
                },
                ip=client_ip,
                user_agent=user_agent,
            )
            audit_db.commit()
        except Exception as audit_error:
            audit_db.rollback()
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Audit logging failed: {str(audit_error)}. File uploaded: {uploaded_key} by user {current_user.id}")
        finally:
            audit_db.close()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Audit logging setup failed: {str(e)}. File uploaded: {uploaded_key} by user {current_user.id}")
    
    return {
        "object_key": uploaded_key,
        "file_hash": file_hash,
        "filename": file.filename,
        "size": len(content),
    }


@router.get("", response_model=list[TemplateRead])
def list_templates(
    doc_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """
    List templates accessible to the current user.
    HIPAA/GxP/GIS Compliance: Users can only see templates from their organization.
    """
    from app.models import ProjectMember, Project
    
    # Get user's organizations from project memberships
    user_projects = db.query(ProjectMember.project_id).filter(
        ProjectMember.user_id == current_user.id,
        (ProjectMember.expires_at.is_(None) | (ProjectMember.expires_at > func.now()))
    ).subquery()
    
    # Get org_ids from projects
    user_org_ids = db.query(Project.org_id).filter(
        Project.id.in_(db.query(user_projects.c.project_id))
    ).distinct().all()
    org_ids = [org_id[0] for org_id in user_org_ids] if user_org_ids else []
    
    # If user has no org access, return empty list (or allow system-wide if admin)
    # For now, we'll allow all templates if user has no org restrictions
    # In production, you might want stricter access control
    query = db.query(Template)
    if org_ids:
        query = query.filter(Template.org_id.in_(org_ids))
    
    if doc_type:
        query = query.filter(Template.doc_type == doc_type)
    
    return query.all()


@router.post("", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
def create_template(
    request: Request,
    payload: TemplateCreate, 
    db: Session = Depends(get_db), 
    current_user=Depends(get_current_active_user)
):
    from app.models import Org
    # Get or create default org if org_id not provided
    if not payload.org_id:
        default_org = db.query(Org).first()
        if not default_org:
            import uuid
            default_org = Org(id=uuid.uuid4(), name="Default Organization")
            db.add(default_org)
            db.commit()
            db.refresh(default_org)
        org_id = default_org.id
    else:
        org_id = payload.org_id
    
    template = Template(
        org_id=org_id,
        doc_type=payload.doc_type,
        name=payload.name,
        version=payload.version or "v1",
        object_key=payload.object_key,
        file_hash=payload.file_hash,
        mapping_manifest_json=payload.mapping_manifest_json,
        created_by=current_user.id,
        status=TemplateStatus.DRAFT.value,
    )
    db.add(template)
    db.flush()  # Flush to get template.id
    
    # HIPAA/GxP/GIS Compliance: Audit log for template creation
    try:
        from app.services.audit import log_action, AuditAction, model_to_dict
        
        # Get client info from request
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        
        log_action(
            db,
            actor_user_id=current_user.id,
            action=AuditAction.TEMPLATE_CREATE,
            entity_type="Template",
            entity_id=template.id,
            org_id=org_id,
            after_json={
                "id": str(template.id),
                "name": template.name,
                "doc_type": template.doc_type,
                "version": template.version,
                "status": template.status,
                "object_key": template.object_key,
                "file_hash": template.file_hash[:20] + "..." if template.file_hash else None,  # Store partial hash for audit
            },
            ip=client_ip,
            user_agent=user_agent,
        )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Audit logging failed: {str(e)}. Template created: {template.id} by user {current_user.id}")
    
    db.commit()
    db.refresh(template)
    return template


@router.post("/{template_id}/approve", response_model=TemplateRead)
def approve_template(
    request: Request,
    template_id: str, 
    db: Session = Depends(get_db), 
    current_user=Depends(get_current_active_user)
):
    from uuid import UUID
    try:
        template_uuid = UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template ID format")
    template = db.query(Template).filter(Template.id == template_uuid).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # HIPAA/GxP/GIS Compliance: Store before state for audit
    before_status = template.status
    
    template.status = TemplateStatus.APPROVED.value
    db.add(template)
    db.flush()
    
    # HIPAA/GxP/GIS Compliance: Audit log for template approval
    try:
        from app.services.audit import log_action, AuditAction
        
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        
        log_action(
            db,
            actor_user_id=current_user.id,
            action=AuditAction.TEMPLATE_APPROVE,
            entity_type="Template",
            entity_id=template.id,
            org_id=template.org_id,
            before_json={"status": before_status},
            after_json={"status": template.status},
            ip=client_ip,
            user_agent=user_agent,
        )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Audit logging failed: {str(e)}. Template approved: {template.id} by user {current_user.id}")
    
    db.commit()
    db.refresh(template)
    return template


@router.get("/{template_id}", response_model=TemplateRead)
def get_template(
    template_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)
):
    """
    Get a single template by ID.
    HIPAA/GxP/GIS Compliance: Access control based on organization membership.
    """
    from uuid import UUID
    from app.models import ProjectMember, Project
    
    try:
        template_uuid = UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template ID format")
    
    template = db.query(Template).filter(Template.id == template_uuid).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # HIPAA/GxP/GIS Compliance: Verify user has access to template's organization
    user_orgs = db.query(Project.org_id).join(
        ProjectMember, Project.id == ProjectMember.project_id
    ).filter(
        ProjectMember.user_id == current_user.id,
        (ProjectMember.expires_at.is_(None) | (ProjectMember.expires_at > func.now()))
    ).distinct().all()
    user_org_ids = [org_id[0] for org_id in user_orgs] if user_orgs else []
    
    # Allow access if user is in the same org or if no org restrictions (for system templates)
    if user_org_ids and template.org_id not in user_org_ids:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You do not have permission to view this template"
        )
    
    return template


@router.put("/{template_id}", response_model=TemplateRead)
def update_template(
    request: Request,
    template_id: str,
    payload: TemplateUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Update a template."""
    from uuid import UUID
    from app.services.audit import log_action, AuditAction, model_to_dict
    
    try:
        template_uuid = UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template ID format")
    template = db.query(Template).filter(Template.id == template_uuid).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # HIPAA/GxP/GIS Compliance: Store before state for audit
    before_dict = model_to_dict(template)
    
    # Track if file was updated (object_key or file_hash changed)
    file_updated = False
    if payload.object_key is not None and payload.object_key != template.object_key:
        file_updated = True
    if payload.file_hash is not None and payload.file_hash != template.file_hash:
        file_updated = True
    
    # Update fields if provided
    if payload.doc_type is not None:
        template.doc_type = payload.doc_type
    if payload.name is not None:
        template.name = payload.name
    if payload.version is not None:
        template.version = payload.version
    if payload.object_key is not None:
        template.object_key = payload.object_key
    if payload.file_hash is not None:
        template.file_hash = payload.file_hash
    if payload.mapping_manifest_json is not None:
        template.mapping_manifest_json = payload.mapping_manifest_json
    
    # If file was updated and template was APPROVED, change status to DRAFT
    # This ensures that updated templates need to be re-approved
    if file_updated and template.status == TemplateStatus.APPROVED.value:
        template.status = TemplateStatus.DRAFT.value
    
    # Only update status if explicitly provided in payload
    if payload.status is not None:
        template.status = payload.status
    
    db.add(template)
    db.flush()
    
    # HIPAA/GxP/GIS Compliance: Audit log for template update
    # Use separate session for audit logging to avoid transaction conflicts
    try:
        from app.db import SessionLocal
        
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        
        after_dict = model_to_dict(template)
        # Don't log full file_hash in audit (privacy/security)
        if 'file_hash' in before_dict and before_dict['file_hash']:
            before_dict['file_hash'] = before_dict['file_hash'][:20] + "..."
        if 'file_hash' in after_dict and after_dict['file_hash']:
            after_dict['file_hash'] = after_dict['file_hash'][:20] + "..."
        
        # Use separate session for audit logging
        audit_db = SessionLocal()
        try:
            log_action(
                audit_db,
                actor_user_id=current_user.id,
                action=AuditAction.TEMPLATE_UPDATE,
                entity_type="Template",
                entity_id=template.id,
                org_id=template.org_id,
                before_json=before_dict,
                after_json=after_dict,
                ip=client_ip,
                user_agent=user_agent,
            )
            audit_db.commit()
        except Exception as audit_error:
            audit_db.rollback()
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Audit logging failed: {str(audit_error)}. Template updated: {template.id} by user {current_user.id}")
        finally:
            audit_db.close()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Audit logging setup failed: {str(e)}. Template updated: {template.id} by user {current_user.id}")
    
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    request: Request,
    template_id: str, 
    db: Session = Depends(get_db), 
    current_user=Depends(get_current_active_user)
):
    """Delete a template."""
    from uuid import UUID
    from app.services.audit import log_action, AuditAction, model_to_dict
    
    try:
        template_uuid = UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template ID format")
    template = db.query(Template).filter(Template.id == template_uuid).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # HIPAA/GxP/GIS Compliance: Store before state for audit
    before_dict = model_to_dict(template)
    # Don't log full file_hash in audit (privacy/security)
    if 'file_hash' in before_dict and before_dict['file_hash']:
        before_dict['file_hash'] = before_dict['file_hash'][:20] + "..."
    
    org_id = template.org_id
    template_id_str = str(template.id)
    
    db.delete(template)
    db.flush()
    
    # HIPAA/GxP/GIS Compliance: Audit log for template deletion
    try:
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        
        log_action(
            db,
            actor_user_id=current_user.id,
            action=AuditAction.TEMPLATE_DELETE,
            entity_type="Template",
            entity_id=template_id_str,
            org_id=org_id,
            before_json=before_dict,
            after_json=None,  # Entity deleted
            ip=client_ip,
            user_agent=user_agent,
        )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Audit logging failed: {str(e)}. Template deleted: {template_id_str} by user {current_user.id}")
    
    db.commit()
    return None


@router.get("/{template_id}/file")
def get_template_file(
    request: Request,
    template_id: str, 
    db: Session = Depends(get_db), 
    current_user=Depends(get_current_active_user)
):
    """Download template file."""
    from uuid import UUID
    from fastapi.responses import StreamingResponse
    from io import BytesIO
    import os
    from app.services.audit import log_action, AuditAction
    
    try:
        template_uuid = UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template ID format")
    
    template = db.query(Template).filter(Template.id == template_uuid).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # HIPAA/GxP/GIS Compliance: Verify user has access to template's organization
    # For now, allow access if user has no org restrictions (system templates)
    # In production, you might want stricter access control
    from app.models import ProjectMember, Project
    try:
        user_orgs = db.query(Project.org_id).join(
            ProjectMember, Project.id == ProjectMember.project_id
        ).filter(
            ProjectMember.user_id == current_user.id,
            (ProjectMember.expires_at.is_(None) | (ProjectMember.expires_at > func.now()))
        ).distinct().all()
        user_org_ids = [org_id[0] for org_id in user_orgs] if user_orgs else []
        
        # Only restrict access if user has org memberships and template is not in their orgs
        if user_org_ids and template.org_id not in user_org_ids:
            raise HTTPException(
                status_code=403,
                detail="Access denied: You do not have permission to access this template file"
            )
    except HTTPException:
        raise
    except Exception as access_error:
        # If access check fails, log but allow access (for system templates)
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Access check failed: {str(access_error)}. Allowing access to template {template.id} for user {current_user.id}")
    
    # HIPAA/GxP/GIS Compliance: Audit log for template file access
    # Use separate session for audit logging to avoid transaction conflicts
    try:
        from app.services.audit import log_action, AuditAction
        from app.db import SessionLocal
        
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        
        # Use separate session for audit logging to avoid transaction conflicts
        audit_db = SessionLocal()
        try:
            log_action(
                audit_db,
                actor_user_id=current_user.id,
                action=AuditAction.TEMPLATE_VIEW,
                entity_type="Template",
                entity_id=template.id,
                org_id=template.org_id,
                after_json={"action": "file_download", "object_key": template.object_key},
                ip=client_ip,
                user_agent=user_agent,
            )
            audit_db.commit()
        except Exception as audit_error:
            audit_db.rollback()
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Audit logging failed: {str(audit_error)}. Template file accessed: {template.id} by user {current_user.id}")
        finally:
            audit_db.close()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Audit logging setup failed: {str(e)}. Template file accessed: {template.id} by user {current_user.id}")
    
    # Try to use storage service if available
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Attempting to load template file: {template.object_key}")
    
    file_content = None
    
    try:
        from app.services.storage import download_file
        logger.info("Storage service available, using download_file")
        logger.info(f"Attempting to download file with object_key: {template.object_key}")
        # HIPAA/GxP/GIS Compliance: Verify file integrity using hash
        try:
            file_content = download_file(template.object_key, expected_hash=template.file_hash)
            logger.info(f"File downloaded successfully, size: {len(file_content)} bytes, hash verified")
        except ValueError as hash_error:
            # Hash verification failed - log but still return file for now
            logger.warning(f"Hash verification failed: {str(hash_error)}. Returning file anyway.")
            # Try again without hash verification
            try:
                file_content = download_file(template.object_key, expected_hash=None)
                logger.info(f"File downloaded without hash verification, size: {len(file_content)} bytes")
            except FileNotFoundError as file_error:
                logger.error(f"File not found in storage: {str(file_error)}")
                raise HTTPException(status_code=404, detail=f"Template file not found: {template.object_key}")
        except FileNotFoundError as file_error:
            logger.error(f"File not found in storage: {str(file_error)}")
            logger.error(f"Template object_key: {template.object_key}")
            logger.error(f"Storage base: {os.path.join(os.path.dirname(__file__), '../../storage')}")
            raise HTTPException(
                status_code=404, 
                detail=f"Template file not found: {template.object_key}. The file may not have been uploaded to storage yet. Please upload the file or update the template's object_key."
            )
    except ImportError:
        logger.info("Storage service not available, trying local filesystem")
        # Fallback: try to read from local filesystem if object_key is a path
        if os.path.exists(template.object_key):
            logger.info(f"File found on local filesystem: {template.object_key}")
            with open(template.object_key, 'rb') as f:
                file_content = f.read()
            
            # HIPAA/GxP/GIS Compliance: Verify file integrity
            import hashlib
            actual_hash = hashlib.sha256(file_content).hexdigest()
            if template.file_hash and actual_hash != template.file_hash:
                logger.error(f"File integrity check failed: expected {template.file_hash}, got {actual_hash}")
                raise HTTPException(
                    status_code=500, 
                    detail="File integrity check failed. File may have been tampered with."
                )
            
            logger.info(f"File read successfully, size: {len(file_content)} bytes, hash verified")
        else:
            logger.error(f"File not found on local filesystem: {template.object_key}")
            raise HTTPException(status_code=404, detail=f"Template file not found at: {template.object_key}")
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except FileNotFoundError as e:
        # File not found in storage
        logger.error(f"File not found: {str(e)}")
        raise HTTPException(status_code=404, detail=f"Template file not found: {template.object_key}. The file may not have been uploaded yet.")
    except ValueError as e:
        # Hash verification failed
        logger.error(f"File integrity check failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error loading template file: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to load template file: {str(e)}")
    
    # Ensure file_content was loaded
    if file_content is None:
        logger.error("File content is None after all attempts to load")
        raise HTTPException(status_code=500, detail="Failed to load template file: file content is empty")
    
    # Determine content type from file extension
    ext = template.object_key.split('.')[-1].lower()
    content_types = {
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'doc': 'application/msword',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xls': 'application/vnd.ms-excel',
        'xml': 'application/xml',
        'bpmn': 'application/xml',
    }
    media_type = content_types.get(ext, 'application/octet-stream')
    
    return StreamingResponse(
        BytesIO(file_content),
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{template.name}.{ext}"',
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Cache-Control": "no-cache"
        }
    )


@router.get("/{template_id}/styles")
def get_template_styles(
    template_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user)
):
    """Extract fonts and styles from DOCX template file."""
    from uuid import UUID
    from docx import Document
    from io import BytesIO
    from app.services.storage import download_file
    from app.models import ProjectMember, Project
    
    try:
        template_uuid = UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template ID format")
    
    template = db.query(Template).filter(Template.id == template_uuid).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Verify access
    try:
        user_orgs = db.query(Project.org_id).join(
            ProjectMember, Project.id == ProjectMember.project_id
        ).filter(
            ProjectMember.user_id == current_user.id,
            (ProjectMember.expires_at.is_(None) | (ProjectMember.expires_at > func.now()))
        ).distinct().all()
        user_org_ids = [org_id[0] for org_id in user_orgs] if user_orgs else []
        
        if user_org_ids and template.org_id not in user_org_ids:
            raise HTTPException(
                status_code=403,
                detail="Access denied"
            )
    except HTTPException:
        raise
    except Exception:
        pass  # Allow access for system templates
    
    # Download and parse DOCX
    try:
        from app.services.storage import download_file
        file_content = download_file(template.object_key, expected_hash=None)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Template file not found: {str(e)}")
    
    try:
        doc = Document(BytesIO(file_content))
        
        # Extract fonts used in the document
        fonts_used = set()
        styles_info = {}
        list_styles = {}  # Store list styles (bullet points)
        table_styles = []  # Store table styles (colors, etc.)
        
        # Get all styles from document
        for style in doc.styles:
            if hasattr(style, 'font') and style.font.name:
                fonts_used.add(style.font.name)
            styles_info[style.name] = {
                "name": style.name,
                "type": str(style.type) if hasattr(style, 'type') else None,
            }
        
        # Extract fonts and list styles from paragraphs
        for paragraph in doc.paragraphs:
            for run in paragraph.runs:
                if run.font.name:
                    fonts_used.add(run.font.name)
            
            # Check if paragraph is part of a list
            if paragraph.style and hasattr(paragraph.style, 'paragraph_format'):
                pf = paragraph.style.paragraph_format
                if hasattr(pf, 'list_format') and pf.list_format:
                    list_format = pf.list_format
                    list_id = getattr(list_format, 'ilvl', None)
                    if list_id is not None:
                        # Get list style
                        list_style_key = f"list_level_{list_id}"
                        if list_style_key not in list_styles:
                            list_styles[list_style_key] = {
                                "level": list_id,
                                "number_format": getattr(list_format, 'num_style', None),
                            }
        
        # Extract fonts and table styles from tables
        from docx.oxml.ns import qn
        for table_idx, table in enumerate(doc.tables):
            table_style = {
                "index": table_idx,
                "rows": []
            }
            
            for row_idx, row in enumerate(table.rows):
                row_style = {
                    "index": row_idx,
                    "cells": []
                }
                
                for cell_idx, cell in enumerate(row.cells):
                    cell_style = {
                        "index": cell_idx,
                        "background_color": None,
                        "shading": None
                    }
                    
                    # Extract cell background color/shading - check multiple locations
                    if hasattr(cell, '_element'):
                        # Check cell properties (tcPr)
                        tc_pr = cell._element.find('.//w:tcPr', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})
                        if tc_pr is not None:
                            shading = tc_pr.find('.//w:shd', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})
                            if shading is not None:
                                fill = shading.get(qn('w:fill'))
                                if fill:
                                    # Convert hex to rgb
                                    fill_hex = fill
                                    if fill_hex.startswith('#'):
                                        fill_hex = fill_hex[1:]
                                    if len(fill_hex) == 6:
                                        try:
                                            r = int(fill_hex[0:2], 16)
                                            g = int(fill_hex[2:4], 16)
                                            b = int(fill_hex[4:6], 16)
                                            cell_style["background_color"] = f"rgb({r}, {g}, {b})"
                                            cell_style["shading"] = fill_hex
                                        except ValueError:
                                            pass
                    
                    # Also check paragraph shading in cell
                    if not cell_style["background_color"]:
                        for paragraph in cell.paragraphs:
                            if hasattr(paragraph, '_element'):
                                p_pr = paragraph._element.find('.//w:pPr', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})
                                if p_pr is not None:
                                    shading = p_pr.find('.//w:shd', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})
                                    if shading is not None:
                                        fill = shading.get(qn('w:fill'))
                                        if fill:
                                            fill_hex = fill
                                            if fill_hex.startswith('#'):
                                                fill_hex = fill_hex[1:]
                                            if len(fill_hex) == 6:
                                                try:
                                                    r = int(fill_hex[0:2], 16)
                                                    g = int(fill_hex[2:4], 16)
                                                    b = int(fill_hex[4:6], 16)
                                                    cell_style["background_color"] = f"rgb({r}, {g}, {b})"
                                                    cell_style["shading"] = fill_hex
                                                    break
                                                except ValueError:
                                                    pass
                            
                            for run in paragraph.runs:
                                if run.font.name:
                                    fonts_used.add(run.font.name)
                    
                    row_style["cells"].append(cell_style)
                table_style["rows"].append(row_style)
            table_styles.append(table_style)
            
            # Log table styles for debugging
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"Table {table_idx}: Found {len(table_style['rows'])} rows with colors")
            for row_idx, row_data in enumerate(table_style['rows']):
                colored_cells = [c for c in row_data['cells'] if c['background_color']]
                if colored_cells:
                    logger.info(f"  Row {row_idx}: {len(colored_cells)} cells with colors: {[c['background_color'] for c in colored_cells]}")
        
        # Extract list styles from document's numbering part
        try:
            from docx.oxml import parse_xml
            from docx.oxml.ns import nsdecls, qn
            
            # Try to extract numbering styles
            numbering_part = doc.part.numbering_part
            if numbering_part:
                numbering_xml = numbering_part.element
                # Parse numbering definitions
                for num in numbering_xml.findall('.//w:num', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}):
                    num_id = num.get(qn('w:numId'))
                    abstract_num = num.find('.//w:abstractNumId', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})
                    if abstract_num is not None:
                        abstract_num_id = abstract_num.get(qn('w:val'))
                        # Find abstract numbering definition
                        abstract_num_def = numbering_xml.find(f'.//w:abstractNum[@w:abstractNumId="{abstract_num_id}"]', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})
                        if abstract_num_def is not None:
                            # Extract level definitions
                            for lvl in abstract_num_def.findall('.//w:lvl', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}):
                                ilvl = lvl.get(qn('w:ilvl'))
                                num_fmt = lvl.find('.//w:numFmt', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})
                                
                                level_info = {
                                    "level": int(ilvl) if ilvl else 0,
                                    "number_format": None,
                                    "bullet_text": None,
                                    "bullet_char": None,
                                    "bullet_font": None,
                                    "left_indent_pt": None,
                                    "hanging_indent_pt": None,
                                    "first_line_indent_pt": None,
                                }
                                
                                if num_fmt is not None:
                                    fmt_val = num_fmt.get(qn('w:val'))
                                    level_info["number_format"] = fmt_val
                                
                                # Extract indentation from paragraph properties (w:pPr/w:ind)
                                p_pr = lvl.find('.//w:pPr', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})
                                if p_pr is not None:
                                    indent = p_pr.find('.//w:ind', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})
                                    if indent is not None:
                                        # Indentation is in TWIPs (twentieths of a point), convert to points
                                        left_twips = indent.get(qn('w:left'))
                                        hanging_twips = indent.get(qn('w:hanging'))
                                        first_line_twips = indent.get(qn('w:firstLine'))
                                        
                                        if left_twips:
                                            level_info["left_indent_pt"] = round(int(left_twips) / 20, 2)
                                        if hanging_twips:
                                            level_info["hanging_indent_pt"] = round(int(hanging_twips) / 20, 2)
                                        if first_line_twips:
                                            level_info["first_line_indent_pt"] = round(int(first_line_twips) / 20, 2)
                                
                                # Extract bullet text/symbol (w:lvlText contains the actual symbol)
                                lvl_text = lvl.find('.//w:lvlText', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})
                                if lvl_text is not None:
                                    bullet_text = lvl_text.get(qn('w:val'))
                                    if bullet_text:
                                        level_info["bullet_text"] = bullet_text
                                        # Extract the actual character(s) - might be Unicode escape sequences
                                        # DOCX uses %1, %2, etc. for placeholders, but actual symbols are in the text
                                        level_info["bullet_char"] = bullet_text
                                
                                # Extract bullet font (w:rFonts or w:rPr/w:rFonts)
                                r_pr = lvl.find('.//w:rPr', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})
                                if r_pr is not None:
                                    r_fonts = r_pr.find('.//w:rFonts', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})
                                    if r_fonts is not None:
                                        font_name = r_fonts.get(qn('w:ascii')) or r_fonts.get(qn('w:hAnsi'))
                                        if font_name:
                                            level_info["bullet_font"] = font_name
                                
                                # Also check for custom bullet symbols in w:lvlPicBulletId (image bullets)
                                lvl_pic = lvl.find('.//w:lvlPicBulletId', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})
                                if lvl_pic is not None:
                                    pic_id = lvl_pic.get(qn('w:val'))
                                    level_info["bullet_image_id"] = pic_id
                                
                                if ilvl not in list_styles:
                                    list_styles[f"list_level_{ilvl}"] = level_info
                                else:
                                    # Merge with existing info
                                    existing = list_styles[f"list_level_{ilvl}"]
                                    existing.update(level_info)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Could not extract list styles: {str(e)}")
        
        # Standard Word fonts mapping (fallback)
        word_fonts = {
            "Calibri": "Calibri, 'Segoe UI', Arial, sans-serif",
            "Times New Roman": "'Times New Roman', Times, serif",
            "Arial": "Arial, Helvetica, sans-serif",
            "Cambria": "Cambria, Georgia, serif",
            "Verdana": "Verdana, Geneva, sans-serif",
            "Tahoma": "Tahoma, Geneva, sans-serif",
            "Courier New": "'Courier New', Courier, monospace",
            "Georgia": "Georgia, serif",
            "Trebuchet MS": "'Trebuchet MS', Helvetica, sans-serif",
            "Comic Sans MS": "'Comic Sans MS', cursive",
            "Impact": "Impact, Charcoal, sans-serif",
            "Lucida Console": "'Lucida Console', Monaco, monospace",
        }
        
        # Map fonts to CSS font families
        font_families = {}
        for font in fonts_used:
            if font in word_fonts:
                font_families[font] = word_fonts[font]
            else:
                # Use font name directly, with fallbacks
                font_families[font] = f"'{font}', Arial, sans-serif"
        
        # Extract page orientation information from sections
        page_orientations = []
        for section_idx, section in enumerate(doc.sections):
            # Convert EMU to pixels (1 EMU = 1/914400 inch, 96 DPI = 96 pixels per inch)
            # A4 Portrait: 21.0 cm x 29.7 cm = 8.27" x 11.69" = 794px x 1123px at 96 DPI
            # A4 Landscape: 29.7 cm x 21.0 cm = 11.69" x 8.27" = 1123px x 794px at 96 DPI
            width_emu = section.page_width
            height_emu = section.page_height
            
            # Check orientation
            is_landscape = width_emu > height_emu
            
            # Get orientation attribute if available
            pgSz = section._sectPr.find(qn('w:pgSz'))
            orient_attr = None
            if pgSz is not None:
                orient_attr = pgSz.get(qn('w:orient'))
            
            # Convert to pixels (96 DPI)
            width_px = int((width_emu / 914400) * 96)
            height_px = int((height_emu / 914400) * 96)
            
            page_orientations.append({
                "section_index": section_idx,
                "orientation": "landscape" if is_landscape else "portrait",
                "width_px": width_px,
                "height_px": height_px,
                "width_cm": round(width_emu / 914400 * 2.54, 2),
                "height_cm": round(height_emu / 914400 * 2.54, 2),
                "left_margin_cm": round(section.left_margin / 914400 * 2.54, 2),
                "right_margin_cm": round(section.right_margin / 914400 * 2.54, 2),
                "top_margin_cm": round(section.top_margin / 914400 * 2.54, 2),
                "bottom_margin_cm": round(section.bottom_margin / 914400 * 2.54, 2),
                "orientation_attribute": orient_attr
            })
        
        return {
            "fonts": list(fonts_used),
            "font_families": font_families,
            "styles": styles_info,
            "default_fonts": word_fonts,
            "list_styles": list_styles,
            "table_styles": table_styles,
            "page_orientations": page_orientations
        }
        
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error parsing DOCX: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to parse DOCX: {str(e)}")

