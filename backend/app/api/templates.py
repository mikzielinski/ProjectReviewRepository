"""Templates API endpoints."""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.template import Template, TemplateStatus
from app.models.role import RoleCode
from app.schemas.template import TemplateCreate, TemplateResponse, TemplateApprove
from app.services.storage import upload_file, generate_object_key
from app.services.audit import log_action, AuditAction, model_to_dict
from app.services.docx_renderer import validate_manifest
from app.core.deps import get_current_user, get_client_info

router = APIRouter()


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    request: Request,
    doc_type: str = Form(...),
    name: str = Form(...),
    version: str = Form(...),
    mapping_manifest_json: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a new document template with mapping manifest."""
    import json
    
    if not current_user.org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to an organization",
        )
    
    # Validate file type
    if not file.filename.endswith('.docx'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Template must be a .docx file",
        )
    
    # Parse and validate manifest
    try:
        manifest = json.loads(mapping_manifest_json)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON in mapping manifest",
        )
    
    manifest_errors = validate_manifest(manifest)
    if manifest_errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid manifest: {manifest_errors}",
        )
    
    # Read file content
    content = await file.read()
    
    # Generate object key and upload
    object_key = generate_object_key(
        f"templates/{current_user.org_id}",
        file.filename,
    )
    _, file_hash = upload_file(
        content,
        object_key,
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    
    # Create template record
    template = Template(
        org_id=current_user.org_id,
        doc_type=doc_type,
        name=name,
        version=version,
        object_key=object_key,
        file_hash=file_hash,
        status=TemplateStatus.DRAFT.value,
        mapping_manifest_json=manifest,
        created_by=current_user.id,
    )
    db.add(template)
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=current_user.org_id,
        actor_user_id=current_user.id,
        action=AuditAction.TEMPLATE_CREATE,
        entity_type="Template",
        entity_id=template.id,
        after_json=model_to_dict(template),
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    db.refresh(template)
    
    return TemplateResponse.model_validate(template)


@router.get("", response_model=List[TemplateResponse])
def list_templates(
    doc_type: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List templates available to the user's organization."""
    if not current_user.org_id:
        return []
    
    query = db.query(Template).filter(Template.org_id == current_user.org_id)
    
    if doc_type:
        query = query.filter(Template.doc_type == doc_type)
    if status_filter:
        query = query.filter(Template.status == status_filter)
    
    templates = query.order_by(Template.created_at.desc()).all()
    return [TemplateResponse.model_validate(t) for t in templates]


@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get template details."""
    template = db.query(Template).filter(
        Template.id == template_id,
        Template.org_id == current_user.org_id,
    ).first()
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    
    return TemplateResponse.model_validate(template)


@router.post("/{template_id}/approve")
def approve_template(
    request: Request,
    template_id: uuid.UUID,
    approve_data: TemplateApprove,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approve a template for use."""
    template = db.query(Template).filter(
        Template.id == template_id,
        Template.org_id == current_user.org_id,
    ).first()
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    
    if template.status != TemplateStatus.DRAFT.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft templates can be approved",
        )
    
    before = {"status": template.status}
    template.status = TemplateStatus.APPROVED.value
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=current_user.org_id,
        actor_user_id=current_user.id,
        action=AuditAction.TEMPLATE_APPROVE,
        entity_type="Template",
        entity_id=template.id,
        before_json=before,
        after_json={"status": template.status, "comment": approve_data.comment},
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    
    return {"status": "approved", "template_id": template_id}

