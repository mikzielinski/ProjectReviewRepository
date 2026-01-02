"""Audit log API endpoints."""
import uuid
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.project import Project
from app.models.audit_log import AuditLog
from app.schemas.audit import AuditLogResponse, AuditLogListResponse
from app.core.deps import get_current_user, ProjectAccess

router = APIRouter()


@router.get("/projects/{project_id}/audit", response_model=AuditLogListResponse)
def get_project_audit_log(
    project_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action_filter: Optional[str] = None,
    entity_type_filter: Optional[str] = None,
    actor_filter: Optional[uuid.UUID] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    project: Project = Depends(ProjectAccess()),
):
    """Get audit log for a project with filtering and pagination."""
    query = db.query(AuditLog).filter(AuditLog.project_id == project_id)
    
    if action_filter:
        query = query.filter(AuditLog.action == action_filter)
    if entity_type_filter:
        query = query.filter(AuditLog.entity_type == entity_type_filter)
    if actor_filter:
        query = query.filter(AuditLog.actor_user_id == actor_filter)
    if start_date:
        query = query.filter(AuditLog.created_at >= start_date)
    if end_date:
        query = query.filter(AuditLog.created_at <= end_date)
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    offset = (page - 1) * page_size
    logs = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size).all()
    
    # Build response with actor names
    items = []
    for log in logs:
        items.append(AuditLogResponse(
            id=log.id,
            org_id=log.org_id,
            project_id=log.project_id,
            actor_user_id=log.actor_user_id,
            actor_name=log.actor.name if log.actor else None,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            before_json=log.before_json,
            after_json=log.after_json,
            created_at=log.created_at,
            ip=log.ip,
        ))
    
    return AuditLogListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/projects/{project_id}/export")
def export_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project: Project = Depends(ProjectAccess()),
):
    """Export project data as ZIP archive."""
    import io
    import json
    import zipfile
    from fastapi.responses import StreamingResponse
    
    from app.models.document import Document
    from app.models.document_version import DocumentVersion
    from app.models.pkb_snapshot import PKBSnapshot
    from app.models.task import Task
    from app.models.evidence import Evidence
    
    # Create ZIP in memory
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Export project metadata
        project_data = {
            "id": str(project.id),
            "key": project.key,
            "name": project.name,
            "status": project.status,
            "created_at": project.created_at.isoformat(),
        }
        zip_file.writestr("project.json", json.dumps(project_data, indent=2))
        
        # Export documents
        documents = db.query(Document).filter(Document.project_id == project_id).all()
        docs_data = []
        for doc in documents:
            doc_data = {
                "id": str(doc.id),
                "doc_type": doc.doc_type,
                "title": doc.title,
                "created_at": doc.created_at.isoformat(),
                "versions": [],
            }
            
            for version in doc.versions:
                version_data = {
                    "id": str(version.id),
                    "version_string": version.version_string,
                    "state": version.state,
                    "content_json": version.content_json,
                    "created_at": version.created_at.isoformat(),
                }
                doc_data["versions"].append(version_data)
            
            docs_data.append(doc_data)
        
        zip_file.writestr("documents.json", json.dumps(docs_data, indent=2))
        
        # Export PKB snapshots
        pkb_snapshots = db.query(PKBSnapshot).filter(PKBSnapshot.project_id == project_id).all()
        pkb_data = []
        for snapshot in pkb_snapshots:
            pkb_data.append({
                "id": str(snapshot.id),
                "version_string": snapshot.version_string,
                "extracted_json": snapshot.extracted_json,
                "confirmed_at": snapshot.confirmed_at.isoformat() if snapshot.confirmed_at else None,
                "created_at": snapshot.created_at.isoformat(),
            })
        zip_file.writestr("pkb_snapshots.json", json.dumps(pkb_data, indent=2))
        
        # Export audit log
        audit_logs = db.query(AuditLog).filter(AuditLog.project_id == project_id).all()
        audit_data = []
        for log in audit_logs:
            audit_data.append({
                "id": str(log.id),
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": str(log.entity_id),
                "actor_user_id": str(log.actor_user_id),
                "before_json": log.before_json,
                "after_json": log.after_json,
                "created_at": log.created_at.isoformat(),
            })
        zip_file.writestr("audit_log.json", json.dumps(audit_data, indent=2))
        
        # Export tasks
        tasks = db.query(Task).filter(Task.project_id == project_id).all()
        tasks_data = []
        for task in tasks:
            tasks_data.append({
                "id": str(task.id),
                "title": task.title,
                "task_type": task.task_type,
                "status": task.status,
                "created_at": task.created_at.isoformat(),
                "completed_at": task.completed_at.isoformat() if task.completed_at else None,
            })
        zip_file.writestr("tasks.json", json.dumps(tasks_data, indent=2))
    
    zip_buffer.seek(0)
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="project_{project.key}_export.zip"'},
    )

