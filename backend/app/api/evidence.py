"""Evidence API endpoints."""
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.project import Project
from app.models.evidence import Evidence, EvidenceType, LinkedToType
from app.schemas.evidence import EvidenceUpload, EvidenceResponse
from app.services.storage import upload_file, generate_object_key
from app.services.audit import log_action, AuditAction, model_to_dict
from app.core.deps import get_current_user, ProjectAccess, get_client_info

router = APIRouter()


@router.post("/projects/{project_id}/evidence/upload", response_model=EvidenceResponse, status_code=status.HTTP_201_CREATED)
async def upload_evidence(
    request: Request,
    project_id: uuid.UUID,
    evidence_type: str = Form(...),
    title: str = Form(...),
    linked_to_type: str = Form(...),
    linked_to_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project: Project = Depends(ProjectAccess()),
):
    """Upload evidence file linked to a document/task/gate."""
    # Validate evidence type
    valid_evidence_types = [t.value for t in EvidenceType]
    if evidence_type not in valid_evidence_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid evidence type. Must be one of: {valid_evidence_types}",
        )
    
    # Validate linked_to_type
    valid_linked_types = [t.value for t in LinkedToType]
    if linked_to_type not in valid_linked_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid linked_to_type. Must be one of: {valid_linked_types}",
        )
    
    # Read file content
    content = await file.read()
    
    # Generate object key and upload
    object_key = generate_object_key(
        f"evidence/{project_id}",
        file.filename,
    )
    _, file_hash = upload_file(content, object_key)
    
    # Create evidence record
    evidence = Evidence(
        project_id=project_id,
        evidence_type=evidence_type,
        title=title,
        object_key=object_key,
        file_hash=file_hash,
        linked_to_type=linked_to_type,
        linked_to_id=linked_to_id,
        created_by=current_user.id,
    )
    db.add(evidence)
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project_id,
        actor_user_id=current_user.id,
        action=AuditAction.EVIDENCE_UPLOAD,
        entity_type="Evidence",
        entity_id=evidence.id,
        after_json={
            "evidence_type": evidence_type,
            "title": title,
            "file_hash": file_hash,
            "linked_to_type": linked_to_type,
            "linked_to_id": str(linked_to_id),
        },
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    db.refresh(evidence)
    
    return EvidenceResponse.model_validate(evidence)


@router.get("/projects/{project_id}/evidence", response_model=List[EvidenceResponse])
def list_evidence(
    project_id: uuid.UUID,
    evidence_type: str = None,
    linked_to_type: str = None,
    linked_to_id: uuid.UUID = None,
    db: Session = Depends(get_db),
    project: Project = Depends(ProjectAccess()),
):
    """List evidence in a project."""
    query = db.query(Evidence).filter(Evidence.project_id == project_id)
    
    if evidence_type:
        query = query.filter(Evidence.evidence_type == evidence_type)
    if linked_to_type:
        query = query.filter(Evidence.linked_to_type == linked_to_type)
    if linked_to_id:
        query = query.filter(Evidence.linked_to_id == linked_to_id)
    
    evidence_items = query.order_by(Evidence.created_at.desc()).all()
    return [EvidenceResponse.model_validate(e) for e in evidence_items]


@router.get("/evidence/{evidence_id}", response_model=EvidenceResponse)
def get_evidence(
    evidence_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get evidence details."""
    evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    
    if not evidence:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evidence not found",
        )
    
    return EvidenceResponse.model_validate(evidence)

