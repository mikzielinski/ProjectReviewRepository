"""PKB (Progressive Knowledge Base) API endpoints."""
import uuid
import hashlib
import json
from typing import List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.project import Project
from app.models.pkb_snapshot import PKBSnapshot
from app.models.task import Task, TaskStatus, TaskType
from app.models.role import RoleCode
from app.schemas.pkb import PKBSnapshotResponse, PKBConfirm
from app.services.storage import upload_file, generate_object_key
from app.services.audit import log_action, AuditAction
from app.services.ai_provider import get_ai_provider, log_ai_run
from app.services.scheduler import create_task_reminders
from app.core.deps import get_current_user, ProjectAccess, get_client_info

router = APIRouter()


@router.post("/projects/{project_id}/pkb/upload", response_model=PKBSnapshotResponse, status_code=status.HTTP_201_CREATED)
async def upload_pkb_sources(
    request: Request,
    project_id: uuid.UUID,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project: Project = Depends(ProjectAccess()),
):
    """Upload source files for PKB extraction."""
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one file is required",
        )
    
    # Store source files and extract content
    source_files_info = []
    files_content = []
    
    for file in files:
        content = await file.read()
        
        # Store source file
        object_key = generate_object_key(
            f"pkb/{project_id}/sources",
            file.filename,
        )
        upload_file(content, object_key)
        
        # Try to extract text content
        text_content = ""
        try:
            text_content = content.decode('utf-8')
        except UnicodeDecodeError:
            # Binary file - could add PDF extraction later
            text_content = f"[Binary file: {file.filename}]"
        
        source_files_info.append({
            "filename": file.filename,
            "object_key": object_key,
            "size": len(content),
        })
        files_content.append({
            "filename": file.filename,
            "content": text_content,
        })
    
    # Extract PKB using AI
    ai_provider = get_ai_provider()
    try:
        extracted_json = ai_provider.extract_pkb(files_content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI extraction failed: {str(e)}",
        )
    
    # Determine version string
    existing_count = db.query(PKBSnapshot).filter(
        PKBSnapshot.project_id == project_id
    ).count()
    version_string = f"v{existing_count + 1}.0"
    
    # Compute hash
    content_hash = hashlib.sha256(
        json.dumps(extracted_json, sort_keys=True).encode()
    ).hexdigest()
    
    # Create PKB snapshot
    snapshot = PKBSnapshot(
        project_id=project_id,
        version_string=version_string,
        source_files_json=source_files_info,
        extracted_json=extracted_json,
        hash=content_hash,
    )
    db.add(snapshot)
    db.flush()
    
    # Log AI run
    log_ai_run(
        db,
        project_id=project_id,
        run_type="PKB_EXTRACTION",
        input_data={"files": [f["filename"] for f in source_files_info]},
        output_data=extracted_json,
        created_by=current_user.id,
        related_entity_type="PKBSnapshot",
        related_entity_id=snapshot.id,
    )
    
    # Create confirmation task
    task = Task(
        project_id=project_id,
        task_type=TaskType.PKB_CONFIRMATION.value,
        title=f"Confirm PKB snapshot {version_string}",
        description="Review and confirm the extracted PKB data before using in documents",
        required_role=RoleCode.ARCHITECT.value,
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
        project_id=project_id,
        actor_user_id=current_user.id,
        action=AuditAction.PKB_UPLOAD,
        entity_type="PKBSnapshot",
        entity_id=snapshot.id,
        after_json={
            "version_string": version_string,
            "source_files": [f["filename"] for f in source_files_info],
            "hash": content_hash,
        },
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    db.refresh(snapshot)
    
    return PKBSnapshotResponse.model_validate(snapshot)


@router.get("/projects/{project_id}/pkb", response_model=List[PKBSnapshotResponse])
def list_pkb_snapshots(
    project_id: uuid.UUID,
    confirmed_only: bool = False,
    db: Session = Depends(get_db),
    project: Project = Depends(ProjectAccess()),
):
    """List PKB snapshots for a project."""
    query = db.query(PKBSnapshot).filter(PKBSnapshot.project_id == project_id)
    
    if confirmed_only:
        query = query.filter(PKBSnapshot.confirmed_at.isnot(None))
    
    snapshots = query.order_by(PKBSnapshot.created_at.desc()).all()
    return [PKBSnapshotResponse.model_validate(s) for s in snapshots]


@router.get("/projects/{project_id}/pkb/{snapshot_id}", response_model=PKBSnapshotResponse)
def get_pkb_snapshot(
    project_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    db: Session = Depends(get_db),
    project: Project = Depends(ProjectAccess()),
):
    """Get PKB snapshot details."""
    snapshot = db.query(PKBSnapshot).filter(
        PKBSnapshot.id == snapshot_id,
        PKBSnapshot.project_id == project_id,
    ).first()
    
    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PKB snapshot not found",
        )
    
    return PKBSnapshotResponse.model_validate(snapshot)


@router.post("/projects/{project_id}/pkb/{snapshot_id}/confirm")
def confirm_pkb_snapshot(
    request: Request,
    project_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    confirm_data: PKBConfirm,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project: Project = Depends(ProjectAccess()),
):
    """Confirm a PKB snapshot for use in documents."""
    snapshot = db.query(PKBSnapshot).filter(
        PKBSnapshot.id == snapshot_id,
        PKBSnapshot.project_id == project_id,
    ).first()
    
    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PKB snapshot not found",
        )
    
    if snapshot.confirmed_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PKB snapshot already confirmed",
        )
    
    # Confirm the snapshot
    snapshot.confirmed_by = current_user.id
    snapshot.confirmed_at = datetime.now(timezone.utc)
    
    # Complete related PKB confirmation task
    confirmation_task = db.query(Task).filter(
        Task.project_id == project_id,
        Task.task_type == TaskType.PKB_CONFIRMATION.value,
        Task.status.in_([TaskStatus.OPEN.value, TaskStatus.IN_PROGRESS.value]),
    ).first()
    
    if confirmation_task:
        confirmation_task.status = TaskStatus.COMPLETED.value
        confirmation_task.completed_at = datetime.now(timezone.utc)
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project_id,
        actor_user_id=current_user.id,
        action=AuditAction.PKB_CONFIRM,
        entity_type="PKBSnapshot",
        entity_id=snapshot.id,
        before_json={"confirmed_at": None},
        after_json={
            "confirmed_at": snapshot.confirmed_at.isoformat(),
            "confirmed_by": str(current_user.id),
            "comment": confirm_data.comment,
        },
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    
    return {
        "status": "confirmed",
        "snapshot_id": snapshot_id,
        "confirmed_at": snapshot.confirmed_at.isoformat(),
    }

