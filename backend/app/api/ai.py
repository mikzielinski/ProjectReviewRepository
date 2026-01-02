"""AI API endpoints."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.project import Project
from app.models.document import Document
from app.models.document_version import DocumentVersion, DocumentState
from app.models.template import Template, TemplateStatus
from app.models.pkb_snapshot import PKBSnapshot
from app.models.task import Task, TaskStatus, TaskType
from app.models.role import RoleCode
from app.schemas.ai import AIDocumentDraft, AIImpactAnalysis
from app.services.audit import log_action, AuditAction
from app.services.ai_provider import get_ai_provider, log_ai_run
from app.services.scheduler import create_task_reminders
from app.core.deps import get_current_user, get_client_info

router = APIRouter()


@router.post("/documents/draft")
def create_ai_document_draft(
    request: Request,
    draft_request: AIDocumentDraft,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a document draft using AI."""
    # Verify project access
    project = db.query(Project).filter(Project.id == draft_request.project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    
    # Verify template
    template = db.query(Template).filter(
        Template.id == draft_request.template_id,
        Template.status == TemplateStatus.APPROVED.value,
    ).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found or not approved",
        )
    
    # Verify doc type matches
    if template.doc_type != draft_request.doc_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Template doc_type ({template.doc_type}) does not match requested doc_type ({draft_request.doc_type})",
        )
    
    # Get PKB snapshot if specified
    pkb_data = None
    if draft_request.pkb_snapshot_id:
        pkb_snapshot = db.query(PKBSnapshot).filter(
            PKBSnapshot.id == draft_request.pkb_snapshot_id,
            PKBSnapshot.project_id == project.id,
        ).first()
        
        if not pkb_snapshot:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="PKB snapshot not found",
            )
        
        # Check if confirmed (can be made configurable)
        if not pkb_snapshot.confirmed_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="PKB snapshot must be confirmed before use",
            )
        
        pkb_data = pkb_snapshot.extracted_json
    
    # Get prior documents if specified
    prior_docs_data = []
    if draft_request.prior_doc_version_ids:
        for version_id in draft_request.prior_doc_version_ids:
            version = db.query(DocumentVersion).filter(
                DocumentVersion.id == version_id,
                DocumentVersion.state == DocumentState.APPROVED.value,
            ).first()
            if version and version.content_json:
                prior_docs_data.append({
                    "doc_type": version.document.doc_type,
                    "title": version.document.title,
                    "content": version.content_json,
                })
    
    # Build schema from template manifest
    manifest = template.mapping_manifest_json
    schema = {
        "doc_type": manifest.get("doc_type"),
        "fields": manifest.get("fields", []),
    }
    
    # Build context
    context = {}
    if pkb_data:
        context["pkb"] = pkb_data
    if prior_docs_data:
        context["prior_documents"] = prior_docs_data
    
    # Call AI provider
    ai_provider = get_ai_provider()
    try:
        content_json = ai_provider.generate(
            prompt=f"Generate {draft_request.doc_type} document content",
            schema=schema,
            context=context,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI generation failed: {str(e)}",
        )
    
    # Create or get document
    document = db.query(Document).filter(
        Document.project_id == project.id,
        Document.doc_type == draft_request.doc_type,
    ).first()
    
    if not document:
        document = Document(
            project_id=project.id,
            doc_type=draft_request.doc_type,
            title=f"{draft_request.doc_type} Document",
            created_by=current_user.id,
        )
        db.add(document)
        db.flush()
    
    # Determine version string
    existing_versions = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document.id
    ).count()
    version_string = f"v{existing_versions + 1}.0"
    
    # Create document version (R7: AI output is always Draft)
    version = DocumentVersion(
        document_id=document.id,
        version_string=version_string,
        state=DocumentState.DRAFT.value,
        template_id=template.id,
        content_json=content_json,
        pkb_snapshot_id=draft_request.pkb_snapshot_id,
        created_by=current_user.id,
    )
    db.add(version)
    db.flush()
    
    # Update document current version
    document.current_version_id = version.id
    
    # Log AI run
    log_ai_run(
        db,
        project_id=project.id,
        run_type="DOCUMENT_DRAFT",
        input_data={
            "doc_type": draft_request.doc_type,
            "template_id": str(template.id),
            "pkb_snapshot_id": str(draft_request.pkb_snapshot_id) if draft_request.pkb_snapshot_id else None,
        },
        output_data=content_json,
        created_by=current_user.id,
        related_entity_type="DocumentVersion",
        related_entity_id=version.id,
    )
    
    # R7: Auto-create review task
    review_task = Task(
        project_id=project.id,
        task_type=TaskType.REVIEW.value,
        title=f"Review AI-generated {draft_request.doc_type}",
        description=f"Review AI-generated content for {document.title}",
        related_document_version_id=version.id,
        required_role=RoleCode.ARCHITECT.value,  # Can be configurable
        status=TaskStatus.OPEN.value,
        priority="HIGH",
        is_blocking=True,
    )
    db.add(review_task)
    db.flush()
    create_task_reminders(db, review_task)
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project.id,
        actor_user_id=current_user.id,
        action=AuditAction.AI_RUN,
        entity_type="DocumentVersion",
        entity_id=version.id,
        after_json={
            "run_type": "DOCUMENT_DRAFT",
            "doc_type": draft_request.doc_type,
            "version_string": version_string,
        },
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    
    return {
        "status": "created",
        "document_id": str(document.id),
        "version_id": str(version.id),
        "version_string": version_string,
        "review_task_id": str(review_task.id),
    }


@router.post("/impact/analyze")
def analyze_impact(
    request: Request,
    analysis_request: AIImpactAnalysis,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Analyze impact of changes between document versions."""
    # Get new version
    new_version = db.query(DocumentVersion).filter(
        DocumentVersion.id == analysis_request.document_version_id,
    ).first()
    
    if not new_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="New document version not found",
        )
    
    # Get previous version
    previous_version = db.query(DocumentVersion).filter(
        DocumentVersion.id == analysis_request.previous_version_id,
    ).first()
    
    if not previous_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Previous document version not found",
        )
    
    # Get PKB if available
    pkb_data = None
    if new_version.pkb_snapshot:
        pkb_data = new_version.pkb_snapshot.extracted_json
    
    # Call AI provider
    ai_provider = get_ai_provider()
    try:
        impact_analysis = ai_provider.analyze_impact(
            previous_content=previous_version.content_json or {},
            new_content=new_version.content_json or {},
            pkb=pkb_data,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI analysis failed: {str(e)}",
        )
    
    # Log AI run
    project = new_version.document.project
    log_ai_run(
        db,
        project_id=project.id,
        run_type="IMPACT_ANALYSIS",
        input_data={
            "new_version_id": str(new_version.id),
            "previous_version_id": str(previous_version.id),
        },
        output_data=impact_analysis,
        created_by=current_user.id,
        related_entity_type="DocumentVersion",
        related_entity_id=new_version.id,
    )
    
    db.commit()
    
    return {
        "status": "analyzed",
        "document_id": str(new_version.document_id),
        "new_version_id": str(new_version.id),
        "previous_version_id": str(previous_version.id),
        "impact_analysis": impact_analysis,
    }

