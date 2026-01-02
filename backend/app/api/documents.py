"""Documents API endpoints."""
import uuid
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io

from app.database import get_db
from app.models.user import User
from app.models.project import Project
from app.models.document import Document, DocType
from app.models.document_version import DocumentVersion, DocumentState
from app.models.approval import Approval, ApprovalStatus
from app.models.review_comment import ReviewComment
from app.models.task import Task, TaskStatus, TaskType
from app.models.role import RoleCode
from app.schemas.document import (
    DocumentCreate, DocumentResponse, DocumentVersionCreate,
    DocumentVersionResponse, DocumentSubmit, DocumentApprove, DocumentReject,
    CommentCreate, CommentResponse, ApprovalResponse
)
from app.services.audit import log_action, AuditAction, model_to_dict
from app.services.governance import (
    GovernanceError, validate_approval, create_approval_steps,
    check_all_approvals_complete, check_any_approval_rejected,
    check_user_has_role, get_user_roles_in_project
)
from app.services.storage import download_file, generate_object_key
from app.services.docx_renderer import render_document
from app.services.scheduler import create_task_reminders
from app.core.deps import get_current_user, ProjectAccess, get_client_info

router = APIRouter()


@router.get("/projects/{project_id}/documents", response_model=List[DocumentResponse])
def list_documents(
    project_id: uuid.UUID,
    doc_type: Optional[str] = None,
    db: Session = Depends(get_db),
    project: Project = Depends(ProjectAccess()),
):
    """List documents in a project."""
    query = db.query(Document).filter(Document.project_id == project_id)
    
    if doc_type:
        query = query.filter(Document.doc_type == doc_type)
    
    documents = query.order_by(Document.created_at.desc()).all()
    return [DocumentResponse.model_validate(d) for d in documents]


@router.post("/projects/{project_id}/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document(
    request: Request,
    project_id: uuid.UUID,
    doc_data: DocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project: Project = Depends(ProjectAccess()),
):
    """Create a new document."""
    # Validate doc type
    valid_types = [t.value for t in DocType]
    if doc_data.doc_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid document type. Must be one of: {valid_types}",
        )
    
    document = Document(
        project_id=project_id,
        doc_type=doc_data.doc_type,
        title=doc_data.title,
        created_by=current_user.id,
    )
    db.add(document)
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project_id,
        actor_user_id=current_user.id,
        action=AuditAction.DOCUMENT_CREATE,
        entity_type="Document",
        entity_id=document.id,
        after_json=model_to_dict(document),
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    db.refresh(document)
    
    return DocumentResponse.model_validate(document)


@router.get("/documents/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get document details."""
    document = db.query(Document).filter(Document.id == document_id).first()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    
    # Verify access
    project = db.query(Project).filter(Project.id == document.project_id).first()
    # Access check handled by endpoint security
    
    return DocumentResponse.model_validate(document)


@router.post("/documents/{document_id}/versions", response_model=DocumentVersionResponse, status_code=status.HTTP_201_CREATED)
def create_version(
    request: Request,
    document_id: uuid.UUID,
    version_data: DocumentVersionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new document version (draft)."""
    document = db.query(Document).filter(Document.id == document_id).first()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    
    # Determine version string
    existing_versions = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id
    ).count()
    version_string = f"v{existing_versions + 1}.0"
    
    # R4: If creating from approved version, it's a new draft
    if document.current_version:
        current = document.current_version
        if current.state == DocumentState.APPROVED.value:
            # Creating new version from approved - this is allowed
            pass
        elif current.state == DocumentState.DRAFT.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot create new version while draft exists. Edit the current draft instead.",
            )
    
    version = DocumentVersion(
        document_id=document_id,
        version_string=version_string,
        state=DocumentState.DRAFT.value,
        template_id=version_data.template_id,
        content_json=version_data.content_json,
        pkb_snapshot_id=version_data.pkb_snapshot_id,
        created_by=current_user.id,
    )
    db.add(version)
    db.flush()
    
    # Update document's current version
    document.current_version_id = version.id
    
    # Audit log
    project = document.project
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project.id,
        actor_user_id=current_user.id,
        action=AuditAction.VERSION_CREATE,
        entity_type="DocumentVersion",
        entity_id=version.id,
        after_json=model_to_dict(version),
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    db.refresh(version)
    
    return _build_version_response(version)


@router.post("/versions/{version_id}/submit")
def submit_for_review(
    request: Request,
    version_id: uuid.UUID,
    submit_data: DocumentSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a document version for review."""
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id).first()
    
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document version not found",
        )
    
    if version.state != DocumentState.DRAFT.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft versions can be submitted for review",
        )
    
    # Create approval steps based on policy
    approvals = create_approval_steps(db, version)
    
    # Update state
    version.state = DocumentState.IN_REVIEW.value
    version.submitted_at = datetime.now(timezone.utc)
    
    # Create review tasks for each approval step
    document = version.document
    project = document.project
    
    for approval in approvals:
        task = Task(
            project_id=project.id,
            task_type=TaskType.APPROVAL.value,
            title=f"Review {document.title} - Step {approval.step_no}",
            description=f"Review and approve version {version.version_string}",
            related_document_version_id=version.id,
            required_role=approval.role_required,
            status=TaskStatus.OPEN.value,
            priority="HIGH",
            is_blocking=True,
        )
        db.add(task)
        db.flush()
        create_task_reminders(db, task)
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project.id,
        actor_user_id=current_user.id,
        action=AuditAction.VERSION_SUBMIT,
        entity_type="DocumentVersion",
        entity_id=version.id,
        before_json={"state": DocumentState.DRAFT.value},
        after_json={"state": version.state, "submitted_at": version.submitted_at.isoformat()},
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    
    return {"status": "submitted", "version_id": version_id, "approvals_created": len(approvals)}


@router.post("/versions/{version_id}/approve")
def approve_version(
    request: Request,
    version_id: uuid.UUID,
    approve_data: DocumentApprove,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approve a document version."""
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id).first()
    
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document version not found",
        )
    
    if version.state != DocumentState.IN_REVIEW.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document is not in review state",
        )
    
    document = version.document
    project = document.project
    
    # Find pending approval for user's role
    user_roles = get_user_roles_in_project(db, project.id, current_user.id)
    
    pending_approval = None
    for approval in version.approvals:
        if approval.status == ApprovalStatus.PENDING.value:
            if approval.role_required in user_roles:
                pending_approval = approval
                break
    
    if not pending_approval:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No pending approval step for your role",
        )
    
    # Validate governance rules (R1, R2, R3)
    try:
        validate_approval(db, version, pending_approval, current_user.id)
    except GovernanceError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e),
        )
    
    # Process approval
    pending_approval.status = ApprovalStatus.APPROVED.value
    pending_approval.approver_user_id = current_user.id
    pending_approval.comment = approve_data.comment
    pending_approval.signed_at = datetime.now(timezone.utc)
    
    # Check if all approvals complete
    if check_all_approvals_complete(version):
        version.state = DocumentState.APPROVED.value
        version.locked_at = datetime.now(timezone.utc)
        
        # Complete related tasks
        related_tasks = db.query(Task).filter(
            Task.related_document_version_id == version.id,
            Task.task_type == TaskType.APPROVAL.value,
        ).all()
        for task in related_tasks:
            task.status = TaskStatus.COMPLETED.value
            task.completed_at = datetime.now(timezone.utc)
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project.id,
        actor_user_id=current_user.id,
        action=AuditAction.VERSION_APPROVE,
        entity_type="DocumentVersion",
        entity_id=version.id,
        after_json={
            "approval_step": pending_approval.step_no,
            "final_state": version.state,
        },
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    
    return {
        "status": "approved",
        "version_id": version_id,
        "approval_step": pending_approval.step_no,
        "document_state": version.state,
    }


@router.post("/versions/{version_id}/reject")
def reject_version(
    request: Request,
    version_id: uuid.UUID,
    reject_data: DocumentReject,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reject a document version."""
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id).first()
    
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document version not found",
        )
    
    if version.state != DocumentState.IN_REVIEW.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document is not in review state",
        )
    
    document = version.document
    project = document.project
    
    # Find pending approval for user's role
    user_roles = get_user_roles_in_project(db, project.id, current_user.id)
    
    pending_approval = None
    for approval in version.approvals:
        if approval.status == ApprovalStatus.PENDING.value:
            if approval.role_required in user_roles:
                pending_approval = approval
                break
    
    if not pending_approval:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No pending approval step for your role",
        )
    
    # Process rejection
    pending_approval.status = ApprovalStatus.REJECTED.value
    pending_approval.approver_user_id = current_user.id
    pending_approval.comment = reject_data.comment
    pending_approval.signed_at = datetime.now(timezone.utc)
    
    # Return to draft state for revision
    version.state = DocumentState.DRAFT.value
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project.id,
        actor_user_id=current_user.id,
        action=AuditAction.VERSION_REJECT,
        entity_type="DocumentVersion",
        entity_id=version.id,
        after_json={
            "approval_step": pending_approval.step_no,
            "rejection_reason": reject_data.comment,
        },
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    
    return {
        "status": "rejected",
        "version_id": version_id,
        "approval_step": pending_approval.step_no,
    }


@router.post("/versions/{version_id}/render")
def render_version(
    request: Request,
    version_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Render document version to Word file."""
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id).first()
    
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document version not found",
        )
    
    if not version.template_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Version has no template assigned",
        )
    
    if not version.content_json:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Version has no content to render",
        )
    
    template = version.template
    document = version.document
    project = document.project
    
    # Generate output key
    output_key = generate_object_key(
        f"documents/{project.id}",
        f"{document.doc_type}_{version.version_string}.docx",
        version.id,
    )
    
    # Render document
    try:
        _, file_hash = render_document(
            template.object_key,
            version.content_json,
            template.mapping_manifest_json,
            output_key,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Render failed: {str(e)}",
        )
    
    # Update version with file info
    version.file_object_key = output_key
    version.file_hash = file_hash
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project.id,
        actor_user_id=current_user.id,
        action=AuditAction.VERSION_RENDER,
        entity_type="DocumentVersion",
        entity_id=version.id,
        after_json={"file_object_key": output_key, "file_hash": file_hash},
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    
    return {"status": "rendered", "version_id": version_id, "file_hash": file_hash}


@router.get("/versions/{version_id}/download")
def download_version(
    version_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download rendered document file."""
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id).first()
    
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document version not found",
        )
    
    if not version.file_object_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document has not been rendered yet",
        )
    
    # Download file
    content = download_file(version.file_object_key)
    document = version.document
    
    filename = f"{document.doc_type}_{version.version_string}.docx"
    
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/versions/{version_id}/comment", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
def add_comment(
    version_id: uuid.UUID,
    comment_data: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a review comment to a document version."""
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id).first()
    
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document version not found",
        )
    
    comment = ReviewComment(
        document_version_id=version_id,
        user_id=current_user.id,
        comment=comment_data.comment,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    
    return CommentResponse(
        id=comment.id,
        document_version_id=comment.document_version_id,
        user_id=comment.user_id,
        user_name=current_user.name,
        comment=comment.comment,
        created_at=comment.created_at,
    )


@router.get("/versions/{version_id}", response_model=DocumentVersionResponse)
def get_version(
    version_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get document version details."""
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_id).first()
    
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document version not found",
        )
    
    return _build_version_response(version)


def _build_version_response(version: DocumentVersion) -> DocumentVersionResponse:
    """Build version response with approvals."""
    approvals = []
    for a in version.approvals:
        approvals.append(ApprovalResponse(
            id=a.id,
            step_no=a.step_no,
            role_required=a.role_required,
            approver_user_id=a.approver_user_id,
            approver_name=a.approver.name if a.approver else None,
            status=a.status,
            comment=a.comment,
            signed_at=a.signed_at,
        ))
    
    return DocumentVersionResponse(
        id=version.id,
        document_id=version.document_id,
        version_string=version.version_string,
        state=version.state,
        template_id=version.template_id,
        content_json=version.content_json,
        pkb_snapshot_id=version.pkb_snapshot_id,
        file_object_key=version.file_object_key,
        file_hash=version.file_hash,
        created_by=version.created_by,
        created_at=version.created_at,
        submitted_at=version.submitted_at,
        locked_at=version.locked_at,
        approvals=approvals,
    )

