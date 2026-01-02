"""
Documents endpoints - Phase 1 basic implementation
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.document import Document
from app.models.document_version import DocumentVersion
from app.models.approval import Approval
from app.models.task import Task
from app.models.project_member import ProjectMember
from app.models.template import Template
from app.core.audit import log_audit, AuditAction, EntityType
from app.core.approval_policies import get_approval_policy, create_approval_steps_from_policy
from app.core.rbac import (
    check_sod_author_cannot_approve,
    check_sod_reviewer_cannot_approve,
    check_temporary_user_cannot_approve
)

router = APIRouter()


class DocumentCreate(BaseModel):
    project_id: int
    doc_type: str
    title: str


class DocumentVersionCreate(BaseModel):
    version_string: str
    template_id: Optional[int] = None
    content_json: Optional[dict] = None


class DocumentResponse(BaseModel):
    id: int
    project_id: int
    doc_type: str
    title: str
    current_version_id: Optional[int]
    created_at: str

    class Config:
        from_attributes = True


class DocumentVersionResponse(BaseModel):
    id: int
    document_id: int
    version_string: str
    state: str
    created_at: str

    class Config:
        from_attributes = True


@router.get("/projects/{project_id}/documents", response_model=List[DocumentResponse])
async def list_documents(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all documents in a project"""
    documents = db.query(Document).filter(Document.project_id == project_id).all()
    return documents


@router.post("/projects/{project_id}/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    project_id: int,
    doc_data: DocumentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new document"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    document = Document(
        project_id=project_id,
        doc_type=doc_data.doc_type,
        title=doc_data.title,
        created_by=current_user.id
    )
    
    db.add(document)
    db.commit()
    db.refresh(document)
    
    # Audit log
    log_audit(
        db=db,
        actor_user_id=current_user.id,
        action=AuditAction.DOCUMENT_CREATED,
        entity_type=EntityType.DOCUMENT,
        entity_id=document.id,
        project_id=project_id,
        after_json={"doc_type": doc_data.doc_type, "title": doc_data.title}
    )
    
    return document


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get document details"""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.post("/{document_id}/versions", response_model=DocumentVersionResponse, status_code=status.HTTP_201_CREATED)
async def create_version(
    document_id: int,
    version_data: DocumentVersionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new document version (R4: edits create new version)"""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # R4: Check if current version is APPROVED - if so, new version must be DRAFT
    if document.current_version_id:
        current_version = db.query(DocumentVersion).filter(
            DocumentVersion.id == document.current_version_id
        ).first()
        if current_version and current_version.state == "APPROVED":
            # Approved versions are immutable - new version must be DRAFT
            pass
    
    version = DocumentVersion(
        document_id=document_id,
        version_string=version_data.version_string,
        state="DRAFT",
        template_id=version_data.template_id,
        content_json=version_data.content_json,
        created_by=current_user.id
    )
    
    db.add(version)
    db.commit()
    db.refresh(version)
    
    # Update document's current_version_id
    document.current_version_id = version.id
    db.commit()
    
    # Audit log
    log_audit(
        db=db,
        actor_user_id=current_user.id,
        action=AuditAction.DOCUMENT_VERSION_CREATED,
        entity_type=EntityType.DOCUMENT_VERSION,
        entity_id=version.id,
        project_id=document.project_id,
        after_json={"version_string": version_data.version_string, "state": "DRAFT"}
    )
    
    return version


@router.post("/versions/{version_id}/submit", response_model=DocumentVersionResponse)
async def submit_for_review(
    version_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Submit document version for review
    Creates approval steps based on policy and auto-creates review tasks
    """
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Document version not found")
    
    if version.state != "DRAFT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit version in state {version.state}. Only DRAFT versions can be submitted."
        )
    
    document = db.query(Document).filter(Document.id == version.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Get approval policy for this doc type
    policy = get_approval_policy(document.doc_type)
    
    # Create approval steps
    approvals = create_approval_steps_from_policy(
        db=db,
        document_version_id=version_id,
        doc_type=document.doc_type,
        policy=policy
    )
    
    # Update version state
    version.state = "IN_REVIEW"
    version.submitted_at = datetime.utcnow()
    
    # Auto-create review tasks for each approval step
    project_members = db.query(ProjectMember).filter(
        ProjectMember.project_id == document.project_id,
        ProjectMember.is_temporary == False  # Only permanent members can be assigned
    ).all()
    
    for approval in approvals:
        # Find project members with the required role
        eligible_members = [
            pm for pm in project_members
            if pm.role_code == approval.role_required and pm.is_active()
        ]
        
        if eligible_members:
            # Assign to first eligible member (or could be round-robin)
            assigned_member = eligible_members[0]
            
            task = Task(
                project_id=document.project_id,
                task_type="APPROVAL",
                title=f"Approve {document.doc_type} - {document.title} (v{version.version_string})",
                description=f"Review and approve document version {version.version_string}. Step {approval.step_no}.",
                related_document_version_id=version_id,
                assigned_to_user_id=assigned_member.user_id,
                required_role=approval.role_required,
                status="OPEN",
                priority="HIGH" if approval.step_no == 1 else "MEDIUM",
                is_blocking=True
            )
            db.add(task)
    
    db.commit()
    db.refresh(version)
    
    # Audit log
    log_audit(
        db=db,
        actor_user_id=current_user.id,
        action=AuditAction.DOCUMENT_SUBMITTED,
        entity_type=EntityType.DOCUMENT_VERSION,
        entity_id=version_id,
        project_id=document.project_id,
        before_json={"state": "DRAFT"},
        after_json={"state": "IN_REVIEW", "approvals_created": len(approvals)}
    )
    
    return version


class ApprovalRequest(BaseModel):
    comment: Optional[str] = None
    evidence_hash: Optional[str] = None


class RejectionRequest(BaseModel):
    comment: str
    reason: Optional[str] = None


@router.post("/versions/{version_id}/approve", response_model=dict)
async def approve_version(
    version_id: int,
    approval_data: ApprovalRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Approve a document version (with SoD enforcement)
    R1: Author cannot approve
    R2: Reviewer cannot approve same version
    R3: Temporary users cannot approve
    """
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Document version not found")
    
    if version.state != "IN_REVIEW":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve version in state {version.state}"
        )
    
    document = db.query(Document).filter(Document.id == version.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Get user's project membership
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == document.project_id,
        ProjectMember.user_id == current_user.id
    ).first()
    
    if not member or not member.is_active():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this project"
        )
    
    # R3: Temporary users cannot approve
    check_temporary_user_cannot_approve(member)
    
    # Find pending approval for this user's role
    pending_approval = db.query(Approval).filter(
        Approval.document_version_id == version_id,
        Approval.role_required == member.role_code,
        Approval.status == "PENDING"
    ).order_by(Approval.step_no).first()
    
    if not pending_approval:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No pending approval found for your role"
        )
    
    # R1: Author cannot approve
    check_sod_author_cannot_approve(
        author_user_id=version.created_by,
        approver_user_id=current_user.id,
        db=db
    )
    
    # R2: Check if user was a reviewer (commented) - if so, cannot approve
    from app.models.review_comment import ReviewComment
    reviewer_comments = db.query(ReviewComment).filter(
        ReviewComment.document_version_id == version_id,
        ReviewComment.user_id == current_user.id
    ).first()
    
    if reviewer_comments:
        check_sod_reviewer_cannot_approve(
            reviewer_user_id=current_user.id,
            approver_user_id=current_user.id
        )
    
    # Approve this step
    pending_approval.status = "APPROVED"
    pending_approval.approver_user_id = current_user.id
    pending_approval.comment = approval_data.comment
    pending_approval.signed_at = datetime.utcnow()
    pending_approval.evidence_hash = approval_data.evidence_hash
    
    # Get final step from policy
    policy = get_approval_policy(document.doc_type)
    final_step = policy.get_final_step()
    
    is_final_approval = final_step and pending_approval.step_no == final_step.step_no
    
    # Check if all required approvals are done
    all_approvals = db.query(Approval).filter(
        Approval.document_version_id == version_id
    ).all()
    
    # Filter required approvals (non-optional steps)
    policy_steps = {step.step_no: step for step in policy.get_all_steps()}
    required_approvals = [
        a for a in all_approvals 
        if policy_steps.get(a.step_no) and not policy_steps[a.step_no].is_optional
    ]
    approved_required = [a for a in required_approvals if a.status == "APPROVED"]
    
    if is_final_approval and len(approved_required) == len(required_approvals):
        # All approvals complete - mark as APPROVED
        version.state = "APPROVED"
        version.locked_at = datetime.utcnow()  # R4: Lock approved version (immutable)
        
        # Update document's current_version_id
        document.current_version_id = version_id
        
        # Close related tasks
        tasks = db.query(Task).filter(
            Task.related_document_version_id == version_id,
            Task.status.in_(["OPEN", "IN_PROGRESS"])
        ).all()
        for task in tasks:
            task.status = "CLOSED"
            task.completed_at = datetime.utcnow()
    
    db.commit()
    
    # Audit log
    log_audit(
        db=db,
        actor_user_id=current_user.id,
        action=AuditAction.APPROVAL_APPROVED,
        entity_type=EntityType.APPROVAL,
        entity_id=pending_approval.id,
        project_id=document.project_id,
        before_json={"status": "PENDING"},
        after_json={"status": "APPROVED", "version_state": version.state}
    )
    
    return {
        "message": "Approval successful",
        "approval_id": pending_approval.id,
        "version_state": version.state,
        "is_final": is_final_approval
    }


@router.post("/versions/{version_id}/reject", response_model=dict)
async def reject_version(
    version_id: int,
    rejection_data: RejectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Reject a document version
    Sets version back to DRAFT and cancels pending approvals
    """
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Document version not found")
    
    if version.state != "IN_REVIEW":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reject version in state {version.state}"
        )
    
    document = db.query(Document).filter(Document.id == version.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Get user's project membership
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == document.project_id,
        ProjectMember.user_id == current_user.id
    ).first()
    
    if not member or not member.is_active():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this project"
        )
    
    # Find pending approval for this user's role
    pending_approval = db.query(Approval).filter(
        Approval.document_version_id == version_id,
        Approval.role_required == member.role_code,
        Approval.status == "PENDING"
    ).first()
    
    if not pending_approval:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No pending approval found for your role"
        )
    
    # Reject this approval
    pending_approval.status = "REJECTED"
    pending_approval.approver_user_id = current_user.id
    pending_approval.comment = rejection_data.comment
    pending_approval.signed_at = datetime.utcnow()
    
    # Reject all other pending approvals
    other_pending = db.query(Approval).filter(
        Approval.document_version_id == version_id,
        Approval.status == "PENDING"
    ).all()
    for approval in other_pending:
        approval.status = "REJECTED"
        approval.comment = f"Rejected due to rejection at step {pending_approval.step_no}"
    
    # Set version back to DRAFT
    version.state = "DRAFT"
    
    # Close related tasks
    tasks = db.query(Task).filter(
        Task.related_document_version_id == version_id,
        Task.status.in_(["OPEN", "IN_PROGRESS"])
    ).all()
    for task in tasks:
        task.status = "CLOSED"
        task.completed_at = datetime.utcnow()
    
    db.commit()
    
    # Audit log
    log_audit(
        db=db,
        actor_user_id=current_user.id,
        action=AuditAction.APPROVAL_REJECTED,
        entity_type=EntityType.APPROVAL,
        entity_id=pending_approval.id,
        project_id=document.project_id,
        before_json={"status": "PENDING", "version_state": "IN_REVIEW"},
        after_json={"status": "REJECTED", "version_state": "DRAFT"}
    )
    
    return {
        "message": "Version rejected and set back to DRAFT",
        "approval_id": pending_approval.id
    }


@router.post("/versions/{version_id}/comment")
async def add_comment(
    version_id: int,
    comment_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a review comment to a document version"""
    from app.models.review_comment import ReviewComment
    
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Document version not found")
    
    document = db.query(Document).filter(Document.id == version.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    comment = ReviewComment(
        document_version_id=version_id,
        user_id=current_user.id,
        comment=comment_data.get("comment", "")
    )
    
    db.add(comment)
    db.commit()
    db.refresh(comment)
    
    return comment


@router.post("/versions/{version_id}/render")
async def render_version(
    version_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Render document version to Word using template
    Creates .docx file and stores in MinIO
    """
    from app.core.word_renderer import WordRenderer
    from app.core.storage import get_storage_service
    
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Document version not found")
    
    if not version.template_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document version has no template assigned"
        )
    
    if not version.content_json:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document version has no content to render"
        )
    
    template = db.query(Template).filter(Template.id == version.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    if template.status != "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Template must be approved before rendering"
        )
    
    # Render Word document
    renderer = WordRenderer()
    docx_bytes = renderer.render(template, version.content_json)
    file_hash = renderer.compute_hash(docx_bytes)
    
    # Store in MinIO
    storage = get_storage_service()
    document = db.query(Document).filter(Document.id == version.document_id).first()
    object_key = f"documents/{document.project_id}/{version.document_id}/v{version.version_string}.docx"
    storage.upload_file(docx_bytes, object_key)
    
    # Update version with file info
    version.file_object_key = object_key
    version.file_hash = file_hash
    db.commit()
    
    # Audit log
    log_audit(
        db=db,
        actor_user_id=current_user.id,
        action=AuditAction.DOCUMENT_VERSION_CREATED,
        entity_type=EntityType.DOCUMENT_VERSION,
        entity_id=version_id,
        project_id=document.project_id,
        after_json={"file_object_key": object_key, "file_hash": file_hash}
    )
    
    return {
        "message": "Document rendered successfully",
        "file_object_key": object_key,
        "file_hash": file_hash
    }


@router.get("/versions/{version_id}/download")
async def download_version(
    version_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Download rendered document version
    Returns file content as stream
    """
    from fastapi.responses import StreamingResponse
    from app.core.storage import get_storage_service
    from io import BytesIO
    
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Document version not found")
    
    if not version.file_object_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document version has not been rendered yet"
        )
    
    storage = get_storage_service()
    file_content = storage.download_file(version.file_object_key)
    
    return StreamingResponse(
        BytesIO(file_content),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="document_v{version.version_string}.docx"'
        }
    )

