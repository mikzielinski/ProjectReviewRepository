from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db import get_db
from app.dependencies import get_current_active_user
from app.schemas import (
    DocumentCreate,
    DocumentRead,
    DocumentVersionCreate,
    DocumentVersionRead,
)
from app.models import Document, DocumentVersion, Project, ProjectMember, AuditLog, User
from app.core.enums import DocumentState
from app.services.audit import log_action, AuditAction, action_label

router = APIRouter(tags=["documents"])


def _get_client_info(request: Request) -> tuple[str | None, str | None]:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return client_ip, user_agent


def _verify_project_member(db: Session, project_uuid: UUID, user_id: UUID) -> Project:
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_uuid,
        ProjectMember.user_id == user_id,
        (ProjectMember.expires_at.is_(None) | (ProjectMember.expires_at > datetime.utcnow()))
    ).first()
    if not member:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You must be a member of this project",
        )
    return project


def _get_document_with_access(
    db: Session, doc_uuid: UUID, user_id: UUID
) -> tuple[Document, Project]:
    document = db.query(Document).filter(Document.id == doc_uuid).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    project = _verify_project_member(db, document.project_id, user_id)
    return document, project


def _resolve_user_ids(json_data, db_session: Session):
    if not json_data or not isinstance(json_data, dict):
        return json_data
    resolved = json_data.copy()
    if "created_by" in resolved and resolved["created_by"]:
        try:
            user_id = (
                UUID(str(resolved["created_by"]))
                if not isinstance(resolved["created_by"], UUID)
                else resolved["created_by"]
            )
            user = db_session.query(User).filter(User.id == user_id).first()
            if user:
                resolved["created_by_user_id"] = str(user.id)
                resolved["created_by_name"] = getattr(user, "name", None) or user.email
        except (ValueError, TypeError):
            pass
    return resolved


def _build_audit_log_entries(db: Session, audit_logs: list[AuditLog]) -> list[dict]:
    log_entries = []
    for log in audit_logs:
        actor = db.query(User).filter(User.id == log.actor_user_id).first()
        actor_name = None
        actor_email = None
        if actor:
            actor_name = getattr(actor, "name", None) or actor.email
            actor_email = actor.email

        log_entries.append({
            "id": str(log.id),
            "action": log.action,
            "actor_user_id": str(log.actor_user_id),
            "actor_name": actor_name,
            "actor_email": actor_email,
            "created_at": log.created_at.isoformat() if log.created_at else None,
            "before_json": _resolve_user_ids(log.before_json, db),
            "after_json": _resolve_user_ids(log.after_json, db),
            "ip": log.ip,
            "user_agent": log.user_agent,
        })
    return log_entries


@router.get("/projects/{project_id}/documents", response_model=list[DocumentRead])
def list_documents(
    project_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)
):
    from uuid import UUID
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    # Load documents with current_version using join
    documents = db.query(Document).filter(Document.project_id == project_uuid).all()
    # Get current_version for each document
    result = []
    for doc in documents:
        current_version_state = None
        if doc.current_version_id:
            current_version = db.query(DocumentVersion).filter(DocumentVersion.id == doc.current_version_id).first()
            if current_version:
                current_version_state = current_version.state
        doc_dict = {
            "id": doc.id,
            "project_id": doc.project_id,
            "doc_type": doc.doc_type,
            "title": doc.title,
            "current_version_id": doc.current_version_id,
            "current_version_state": current_version_state,
            "created_by": doc.created_by,
            "created_at": doc.created_at
        }
        result.append(DocumentRead(**doc_dict))
    return result


@router.post("/projects/{project_id}/documents", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
def create_document(
    request: Request,
    project_id: str,
    payload: DocumentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    from uuid import UUID
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    
    if payload.project_id != project_uuid:
        raise HTTPException(status_code=400, detail="Project mismatch")
    
    # HIPAA/GxP/GIS Compliance: Verify user has access to project
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if user is a member of the project
    project = _verify_project_member(db, project_uuid, current_user.id)
    
    document = Document(
        project_id=project_uuid,
        doc_type=payload.doc_type,
        title=payload.title,
        created_by=current_user.id,
    )
    db.add(document)
    db.flush()  # Flush to get document.id
    
    # Automatically create version 1.0
    version = DocumentVersion(
        document_id=document.id,
        version_string="1.0",
        state=DocumentState.DRAFT.value,
        template_id=None,
        content_json={},
        pkb_snapshot_id=None,
        created_by=current_user.id,
    )
    db.add(version)
    db.flush()  # Flush to get version.id
    
    # Set as current version
    document.current_version_id = version.id
    
    client_ip, user_agent = _get_client_info(request)
    log_action(
        db,
        actor_user_id=current_user.id,
        action=AuditAction.DOCUMENT_CREATE,
        entity_type="Document",
        entity_id=document.id,
        org_id=project.org_id,
        project_id=project_uuid,
        after_json={
            "doc_type": payload.doc_type,
            "title": payload.title,
            "version_string": "1.0",
            "state": DocumentState.DRAFT.value,
            "created_by": str(current_user.id),
        },
        ip=client_ip,
        user_agent=user_agent,
    )
    log_action(
        db,
        actor_user_id=current_user.id,
        action=AuditAction.VERSION_CREATE,
        entity_type="DocumentVersion",
        entity_id=version.id,
        org_id=project.org_id,
        project_id=project_uuid,
        after_json={
            "document_id": str(document.id),
            "version_string": "1.0",
            "state": DocumentState.DRAFT.value,
            "created_by": str(current_user.id),
        },
        ip=client_ip,
        user_agent=user_agent,
    )
    
    db.commit()
    db.refresh(document)
    return document


@router.get("/documents/{document_id}", response_model=DocumentRead)
def get_document(
    request: Request,
    document_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    try:
        doc_uuid = UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document ID format")

    document, project = _get_document_with_access(db, doc_uuid, current_user.id)

    client_ip, user_agent = _get_client_info(request)
    log_action(
        db,
        actor_user_id=current_user.id,
        action=AuditAction.DOCUMENT_VIEW,
        entity_type="Document",
        entity_id=document.id,
        org_id=project.org_id,
        project_id=project.id,
        after_json={"title": document.title, "action": "view"},
        ip=client_ip,
        user_agent=user_agent,
    )
    db.commit()

    return document


@router.post(
    "/documents/{document_id}/versions",
    response_model=DocumentVersionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_version(
    request: Request,
    document_id: str,
    payload: DocumentVersionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    try:
        doc_uuid = UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document ID format")

    document, project = _get_document_with_access(db, doc_uuid, current_user.id)
    
    existing_count = db.query(DocumentVersion).filter(DocumentVersion.document_id == doc_uuid).count()
    version_string = payload.version_string or f"v{existing_count + 1}"
    
    version = DocumentVersion(
        document_id=doc_uuid,
        version_string=version_string,
        state=DocumentState.DRAFT.value,
        template_id=payload.template_id,
        content_json=payload.content_json or {},
        pkb_snapshot_id=payload.pkb_snapshot_id if payload.pkb_snapshot_id else None,
        created_by=current_user.id,
    )
    db.add(version)
    db.flush()

    document.current_version_id = version.id
    db.add(document)

    client_ip, user_agent = _get_client_info(request)
    log_action(
        db,
        actor_user_id=current_user.id,
        action=AuditAction.VERSION_CREATE,
        entity_type="DocumentVersion",
        entity_id=version.id,
        org_id=project.org_id,
        project_id=project.id,
        after_json={
            "document_id": str(document.id),
            "version_string": version_string,
            "state": DocumentState.DRAFT.value,
            "created_by": str(current_user.id),
        },
        ip=client_ip,
        user_agent=user_agent,
    )

    db.commit()
    db.refresh(version)
    return version


@router.get("/documents/{document_id}/versions", response_model=list[DocumentVersionRead])
def list_versions(
    document_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)
):
    from uuid import UUID
    try:
        doc_uuid = UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document ID format")
    document = db.query(Document).filter(Document.id == doc_uuid).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    from app.models import Template
    versions = db.query(DocumentVersion).filter(DocumentVersion.document_id == doc_uuid).order_by(DocumentVersion.created_at.desc()).all()
    # Convert to dicts and add template info
    result = []
    for version in versions:
        version_dict = {
            "id": str(version.id),
            "document_id": str(version.document_id),
            "version_string": version.version_string,
            "state": version.state,
            "template_id": str(version.template_id) if version.template_id else None,
            "content_json": version.content_json,
            "pkb_snapshot_id": str(version.pkb_snapshot_id) if version.pkb_snapshot_id else None,
            "file_object_key": version.file_object_key,
            "file_hash": version.file_hash,
            "created_by": str(version.created_by),
            "created_at": version.created_at,
            "submitted_at": version.submitted_at,
            "locked_at": version.locked_at,
        }
        if version.template_id:
            template = db.query(Template).filter(Template.id == version.template_id).first()
            if template:
                version_dict["template"] = {
                    "id": str(template.id),
                    "doc_type": template.doc_type,
                    "name": template.name,
                    "object_key": template.object_key,
                    "file_hash": template.file_hash,
                }
        result.append(version_dict)
    return result


@router.get("/versions/{version_id}", response_model=DocumentVersionRead)
def get_version(
    version_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)
):
    from uuid import UUID
    from app.models import Template
    try:
        version_uuid = UUID(version_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid version ID format")
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_uuid).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    
    # Convert to dict and add template info
    version_dict = {
        "id": str(version.id),
        "document_id": str(version.document_id),
        "version_string": version.version_string,
        "state": version.state,
        "template_id": str(version.template_id) if version.template_id else None,
        "content_json": version.content_json,
        "pkb_snapshot_id": str(version.pkb_snapshot_id) if version.pkb_snapshot_id else None,
        "file_object_key": version.file_object_key,
        "file_hash": version.file_hash,
        "created_by": str(version.created_by),
        "created_at": version.created_at,
        "submitted_at": version.submitted_at,
        "locked_at": version.locked_at,
    }
    if version.template_id:
        template = db.query(Template).filter(Template.id == version.template_id).first()
        if template:
            version_dict["template"] = {
                "id": str(template.id),
                "doc_type": template.doc_type,
                "name": template.name,
                "object_key": template.object_key,
                "file_hash": template.file_hash,
            }
    return version_dict


@router.put("/versions/{version_id}", response_model=DocumentVersionRead)
def update_version(
    request: Request,
    version_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user)
):
    from uuid import UUID
    try:
        version_uuid = UUID(version_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid version ID format")
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_uuid).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    
    if version.state != DocumentState.DRAFT.value:
        raise HTTPException(status_code=400, detail="Only DRAFT versions can be edited")
    
    document, project = _get_document_with_access(db, version.document_id, current_user.id)
    before_json = {
        "version_string": version.version_string,
        "state": version.state,
        "template_id": str(version.template_id) if version.template_id else None,
    }

    if "content_json" in payload:
        version.content_json = payload["content_json"]
    if "template_id" in payload:
        template_id = payload["template_id"]
        if template_id:
            try:
                version.template_id = UUID(template_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid template ID format")
        else:
            version.template_id = None
    submitted = False
    if "state" in payload:
        version.state = payload["state"]
        if payload["state"] == DocumentState.IN_REVIEW.value:
            version.submitted_at = datetime.utcnow()
            version.locked_at = datetime.utcnow()
            submitted = True

    client_ip, user_agent = _get_client_info(request)
    log_action(
        db,
        actor_user_id=current_user.id,
        action=AuditAction.VERSION_SUBMIT if submitted else AuditAction.VERSION_UPDATE,
        entity_type="DocumentVersion",
        entity_id=version.id,
        org_id=project.org_id,
        project_id=project.id,
        before_json=before_json,
        after_json={
            "document_id": str(document.id),
            "version_string": version.version_string,
            "state": version.state,
            "template_id": str(version.template_id) if version.template_id else None,
        },
        ip=client_ip,
        user_agent=user_agent,
    )

    db.add(version)
    db.commit()
    db.refresh(version)
    return version


@router.put("/documents/{document_id}", response_model=DocumentRead)
def update_document(
    request: Request,
    document_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user)
):
    try:
        doc_uuid = UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document ID format")

    document, project = _get_document_with_access(db, doc_uuid, current_user.id)
    before_json = {"title": document.title, "doc_type": document.doc_type}

    if "title" in payload:
        document.title = payload["title"]
    if "doc_type" in payload:
        document.doc_type = payload["doc_type"]

    client_ip, user_agent = _get_client_info(request)
    log_action(
        db,
        actor_user_id=current_user.id,
        action=AuditAction.DOCUMENT_UPDATE,
        entity_type="Document",
        entity_id=document.id,
        org_id=project.org_id,
        project_id=project.id,
        before_json=before_json,
        after_json={"title": document.title, "doc_type": document.doc_type},
        ip=client_ip,
        user_agent=user_agent,
    )

    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.post("/versions/{version_id}/submit", response_model=DocumentVersionRead)
def submit_version(
    request: Request,
    version_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    try:
        version_uuid = UUID(version_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid version ID format")
    version = db.query(DocumentVersion).filter(DocumentVersion.id == version_uuid).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    document, project = _get_document_with_access(db, version.document_id, current_user.id)
    before_json = {"state": version.state, "version_string": version.version_string}

    version.state = DocumentState.IN_REVIEW.value
    version.submitted_at = datetime.utcnow()
    version.locked_at = datetime.utcnow()

    client_ip, user_agent = _get_client_info(request)
    log_action(
        db,
        actor_user_id=current_user.id,
        action=AuditAction.VERSION_SUBMIT,
        entity_type="DocumentVersion",
        entity_id=version.id,
        org_id=project.org_id,
        project_id=project.id,
        before_json=before_json,
        after_json={
            "document_id": str(document.id),
            "state": version.state,
            "version_string": version.version_string,
        },
        ip=client_ip,
        user_agent=user_agent,
    )

    db.add(version)
    db.commit()
    db.refresh(version)
    return version


@router.get("/documents/{document_id}/audit-log")
def get_document_audit_log(
    document_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    try:
        doc_uuid = UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document ID format")

    document, _project = _get_document_with_access(db, doc_uuid, current_user.id)
    version_ids = [
        v.id for v in db.query(DocumentVersion).filter(DocumentVersion.document_id == doc_uuid).all()
    ]

    entity_filters = [
        (AuditLog.entity_type == "Document") & (AuditLog.entity_id == doc_uuid),
    ]
    if version_ids:
        entity_filters.append(
            (AuditLog.entity_type == "DocumentVersion") & (AuditLog.entity_id.in_(version_ids))
        )

    audit_logs = (
        db.query(AuditLog)
        .filter(or_(*entity_filters))
        .order_by(AuditLog.created_at.desc())
        .all()
    )

    log_entries = _build_audit_log_entries(db, audit_logs)
    for entry in log_entries:
        entry["action_label"] = action_label(entry["action"])

    return {
        "document_id": str(document.id),
        "document_title": document.title,
        "total_entries": len(log_entries),
        "entries": log_entries,
    }


