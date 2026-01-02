"""Tasks API endpoints."""
import uuid
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.project import Project
from app.models.task import Task, TaskStatus, TaskType
from app.models.role import RoleCode
from app.schemas.task import TaskCreate, TaskResponse, TaskReassign
from app.services.audit import log_action, AuditAction, model_to_dict
from app.services.scheduler import create_task_reminders
from app.core.deps import get_current_user, ProjectAccess, get_client_info

router = APIRouter()


@router.get("/projects/{project_id}/tasks", response_model=List[TaskResponse])
def list_tasks(
    project_id: uuid.UUID,
    status_filter: Optional[str] = None,
    assigned_to_me: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project: Project = Depends(ProjectAccess()),
):
    """List tasks in a project."""
    query = db.query(Task).filter(Task.project_id == project_id)
    
    if status_filter:
        query = query.filter(Task.status == status_filter)
    
    if assigned_to_me:
        query = query.filter(Task.assigned_to_user_id == current_user.id)
    
    tasks = query.order_by(Task.due_at.asc().nullslast(), Task.created_at.desc()).all()
    
    return [_build_task_response(t) for t in tasks]


@router.post("/projects/{project_id}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    request: Request,
    project_id: uuid.UUID,
    task_data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project: Project = Depends(ProjectAccess()),
):
    """Create a new task."""
    # Validate task type
    valid_types = [t.value for t in TaskType]
    if task_data.task_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid task type. Must be one of: {valid_types}",
        )
    
    task = Task(
        project_id=project_id,
        task_type=task_data.task_type,
        title=task_data.title,
        description=task_data.description,
        related_document_version_id=task_data.related_document_version_id,
        related_gate_id=task_data.related_gate_id,
        assigned_to_user_id=task_data.assigned_to_user_id,
        required_role=task_data.required_role,
        status=TaskStatus.OPEN.value,
        priority=task_data.priority,
        due_at=task_data.due_at,
        is_blocking=task_data.is_blocking,
    )
    db.add(task)
    db.flush()
    
    # Create reminders
    create_task_reminders(db, task)
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project_id,
        actor_user_id=current_user.id,
        action=AuditAction.TASK_CREATE,
        entity_type="Task",
        entity_id=task.id,
        after_json=model_to_dict(task),
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    db.refresh(task)
    
    return _build_task_response(task)


@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get task details."""
    task = db.query(Task).filter(Task.id == task_id).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    
    return _build_task_response(task)


@router.post("/tasks/{task_id}/start")
def start_task(
    request: Request,
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start working on a task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    
    if task.status != TaskStatus.OPEN.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task must be in OPEN status to start",
        )
    
    before = {"status": task.status}
    task.status = TaskStatus.IN_PROGRESS.value
    
    # Assign to current user if not assigned
    if not task.assigned_to_user_id:
        task.assigned_to_user_id = current_user.id
    
    # Audit log
    project = task.project
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project.id,
        actor_user_id=current_user.id,
        action=AuditAction.TASK_START,
        entity_type="Task",
        entity_id=task.id,
        before_json=before,
        after_json={"status": task.status},
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    
    return {"status": "started", "task_id": task_id}


@router.post("/tasks/{task_id}/complete")
def complete_task(
    request: Request,
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a task as complete."""
    task = db.query(Task).filter(Task.id == task_id).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    
    if task.status not in [TaskStatus.OPEN.value, TaskStatus.IN_PROGRESS.value]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task cannot be completed from current status",
        )
    
    before = {"status": task.status}
    task.status = TaskStatus.COMPLETED.value
    task.completed_at = datetime.now(timezone.utc)
    
    # Audit log
    project = task.project
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project.id,
        actor_user_id=current_user.id,
        action=AuditAction.TASK_COMPLETE,
        entity_type="Task",
        entity_id=task.id,
        before_json=before,
        after_json={"status": task.status, "completed_at": task.completed_at.isoformat()},
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    
    return {"status": "completed", "task_id": task_id}


@router.post("/tasks/{task_id}/verify")
def verify_task(
    request: Request,
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify a completed task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    
    if task.status != TaskStatus.COMPLETED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task must be completed before verification",
        )
    
    # Cannot verify your own work
    if task.assigned_to_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot verify your own task",
        )
    
    before = {"status": task.status}
    task.status = TaskStatus.VERIFIED.value
    task.verified_at = datetime.now(timezone.utc)
    task.verified_by = current_user.id
    
    # Audit log
    project = task.project
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project.id,
        actor_user_id=current_user.id,
        action=AuditAction.TASK_VERIFY,
        entity_type="Task",
        entity_id=task.id,
        before_json=before,
        after_json={"status": task.status, "verified_at": task.verified_at.isoformat()},
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    
    return {"status": "verified", "task_id": task_id}


@router.post("/tasks/{task_id}/reassign")
def reassign_task(
    request: Request,
    task_id: uuid.UUID,
    reassign_data: TaskReassign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reassign a task to another user (Business Owner only)."""
    task = db.query(Task).filter(Task.id == task_id).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    
    # Check Business Owner role (replaces PM)
    from app.services.governance import check_user_has_role
    if not check_user_has_role(db, task.project_id, current_user.id, RoleCode.BUSINESS_OWNER.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Business Owner can reassign tasks",
        )
    
    before = {"assigned_to_user_id": str(task.assigned_to_user_id) if task.assigned_to_user_id else None}
    task.assigned_to_user_id = reassign_data.assigned_to_user_id
    
    # Audit log
    project = task.project
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project.id,
        actor_user_id=current_user.id,
        action=AuditAction.TASK_REASSIGN,
        entity_type="Task",
        entity_id=task.id,
        before_json=before,
        after_json={
            "assigned_to_user_id": str(reassign_data.assigned_to_user_id),
            "reason": reassign_data.reason,
        },
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    
    return {"status": "reassigned", "task_id": task_id}


def _build_task_response(task: Task) -> TaskResponse:
    """Build task response with assignee name."""
    return TaskResponse(
        id=task.id,
        project_id=task.project_id,
        task_type=task.task_type,
        title=task.title,
        description=task.description,
        related_document_version_id=task.related_document_version_id,
        related_gate_id=task.related_gate_id,
        assigned_to_user_id=task.assigned_to_user_id,
        assigned_to_name=task.assignee.name if task.assignee else None,
        required_role=task.required_role,
        status=task.status,
        priority=task.priority,
        due_at=task.due_at,
        created_at=task.created_at,
        completed_at=task.completed_at,
        verified_at=task.verified_at,
        is_blocking=task.is_blocking,
    )

