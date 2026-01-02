"""Projects API endpoints."""
import uuid
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.project import Project, ProjectStatus
from app.models.project_member import ProjectMember
from app.models.document import Document
from app.models.document_version import DocumentVersion, DocumentState
from app.models.task import Task, TaskStatus
from app.models.approval import Approval, ApprovalStatus
from app.models.role import RoleCode
from app.schemas.project import (
    ProjectCreate, ProjectUpdate, ProjectResponse, ProjectDashboard,
    HealthStrip, TaskSummary, DocSummary, RiskRadar
)
from app.services.audit import log_action, AuditAction, model_to_dict
from app.core.deps import get_current_user, ProjectAccess, get_client_info

router = APIRouter()


@router.get("", response_model=List[ProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status_filter: Optional[str] = None,
):
    """List projects the current user has access to."""
    # Get projects where user is a member
    member_project_ids = db.query(ProjectMember.project_id).filter(
        ProjectMember.user_id == current_user.id,
        ProjectMember.is_active == True,
    ).subquery()
    
    query = db.query(Project).filter(
        Project.id.in_(member_project_ids)
    )
    
    if status_filter:
        query = query.filter(Project.status == status_filter)
    
    projects = query.order_by(Project.created_at.desc()).all()
    return [ProjectResponse.model_validate(p) for p in projects]


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    request: Request,
    project_data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new project."""
    if not current_user.org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to an organization",
        )
    
    # Check key uniqueness within org
    existing = db.query(Project).filter(
        Project.org_id == current_user.org_id,
        Project.key == project_data.key,
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Project key '{project_data.key}' already exists in this organization",
        )
    
    # Create project
    project = Project(
        org_id=current_user.org_id,
        key=project_data.key,
        name=project_data.name,
        status=ProjectStatus.ACTIVE.value,
        retention_policy_json=project_data.retention_policy_json,
        approval_policies_json=project_data.approval_policies_json,
        escalation_chain_json=project_data.escalation_chain_json,
    )
    db.add(project)
    db.flush()
    
    # Add creator as Business Owner (replaces PM)
    pm_member = ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        role_code=RoleCode.BUSINESS_OWNER.value,
        is_temporary=False,
        invited_by=current_user.id,
    )
    db.add(pm_member)
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=current_user.org_id,
        project_id=project.id,
        actor_user_id=current_user.id,
        action=AuditAction.PROJECT_CREATE,
        entity_type="Project",
        entity_id=project.id,
        after_json=model_to_dict(project),
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    db.refresh(project)
    
    return ProjectResponse.model_validate(project)


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: uuid.UUID,
    project: Project = Depends(ProjectAccess()),
):
    """Get project details."""
    return ProjectResponse.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    request: Request,
    project_id: uuid.UUID,
    update_data: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project: Project = Depends(ProjectAccess(required_roles=[RoleCode.BUSINESS_OWNER.value, RoleCode.ORG_ADMIN.value])),
):
    """Update project settings."""
    before = model_to_dict(project)
    
    if update_data.name is not None:
        project.name = update_data.name
    if update_data.status is not None:
        project.status = update_data.status
    if update_data.retention_policy_json is not None:
        project.retention_policy_json = update_data.retention_policy_json
    if update_data.approval_policies_json is not None:
        project.approval_policies_json = update_data.approval_policies_json
    if update_data.escalation_chain_json is not None:
        project.escalation_chain_json = update_data.escalation_chain_json
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project.id,
        actor_user_id=current_user.id,
        action=AuditAction.PROJECT_UPDATE,
        entity_type="Project",
        entity_id=project.id,
        before_json=before,
        after_json=model_to_dict(project),
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    db.refresh(project)
    
    return ProjectResponse.model_validate(project)


@router.get("/{project_id}/dashboard", response_model=ProjectDashboard)
def get_project_dashboard(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    project: Project = Depends(ProjectAccess()),
):
    """Get Business Owner dashboard for a project."""
    now = datetime.now(timezone.utc)
    
    # Get documents
    docs = db.query(Document).filter(Document.project_id == project_id).all()
    
    # Count approved docs
    approved_count = 0
    doc_summaries = []
    for doc in docs:
        current_version = doc.current_version
        current_state = current_version.state if current_version else None
        
        if current_state == DocumentState.APPROVED.value:
            approved_count += 1
        
        pending_approvals = 0
        if current_version:
            pending_approvals = db.query(Approval).filter(
                Approval.document_version_id == current_version.id,
                Approval.status == ApprovalStatus.PENDING.value,
            ).count()
        
        doc_summaries.append(DocSummary(
            id=doc.id,
            title=doc.title,
            doc_type=doc.doc_type,
            current_state=current_state,
            pending_approvals=pending_approvals,
        ))
    
    # Get tasks
    tasks = db.query(Task).filter(Task.project_id == project_id).all()
    
    overdue_tasks = []
    blocking_tasks = []
    awaiting_approval_tasks = []
    
    for task in tasks:
        if task.status in [TaskStatus.COMPLETED.value, TaskStatus.CLOSED.value, TaskStatus.VERIFIED.value]:
            continue
        
        task_summary = TaskSummary(
            id=task.id,
            title=task.title,
            status=task.status,
            due_at=task.due_at,
            assigned_to_name=task.assignee.name if task.assignee else None,
            is_blocking=task.is_blocking,
        )
        
        if task.due_at and task.due_at < now:
            overdue_tasks.append(task_summary)
        
        if task.is_blocking:
            blocking_tasks.append(task_summary)
        
        if task.task_type == "APPROVAL":
            awaiting_approval_tasks.append(task_summary)
    
    # Calculate health
    overdue_count = len(overdue_tasks)
    blockers_count = len(blocking_tasks)
    
    if blockers_count > 0 or overdue_count > 3:
        overall_status = "red"
    elif overdue_count > 0:
        overall_status = "amber"
    else:
        overall_status = "green"
    
    release_readiness = "BLOCKED" if blockers_count > 0 else "READY"
    
    # Risk radar (placeholder - would need risk register integration)
    risk_radar = RiskRadar(
        open_risks_count=0,
        failed_tests_count=0,
        open_defects_count=0,
    )
    
    return ProjectDashboard(
        health=HealthStrip(
            overall_status=overall_status,
            docs_approved_count=approved_count,
            docs_total_count=len(docs),
            overdue_tasks_count=overdue_count,
            blockers_count=blockers_count,
            release_readiness=release_readiness,
        ),
        overdue_tasks=overdue_tasks[:10],
        blocking_tasks=blocking_tasks[:10],
        awaiting_approval_tasks=awaiting_approval_tasks[:10],
        sme_tasks_nearing_expiry=[],  # TODO: Implement SME expiry tracking
        documents=doc_summaries,
        risk_radar=risk_radar,
    )

