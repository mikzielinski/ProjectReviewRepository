from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
import logging

from app.db import get_db
from app.dependencies import get_current_active_user
from app.schemas import ProjectCreate, ProjectRead, ProjectUpdate
from app.schemas.tasks import GenerateTasksFromRACIRequest, TaskRead
from app.models import Project, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/my-projects", response_model=list[ProjectRead])
def list_my_projects(db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """List projects where current user is a member"""
    try:
        from app.models import ProjectMember
        from datetime import datetime, timezone
        from sqlalchemy import or_
        
        logger.info(f"Loading projects for user {current_user.id} ({current_user.email})")
        
        # Get projects where user is a member
        memberships = db.query(ProjectMember).filter(
            ProjectMember.user_id == current_user.id
        ).filter(
            or_(
                ProjectMember.expires_at.is_(None),
                ProjectMember.expires_at > datetime.now(timezone.utc)
            )
        ).all()
        
        logger.info(f"Found {len(memberships)} project memberships for user {current_user.id}")
        
        project_ids = [m.project_id for m in memberships]
        if not project_ids:
            logger.info(f"No active project memberships for user {current_user.id}")
            return []
        
        projects = db.query(Project).filter(Project.id.in_(project_ids)).all()
        logger.info(f"Found {len(projects)} projects for user {current_user.id}")
        
        result = []
        for p in projects:
            try:
                project_read = ProjectRead.model_validate(p)
                result.append(project_read)
            except Exception as e:
                logger.warning(f"Error validating project {p.id}: {e}")
                import traceback
                logger.warning(traceback.format_exc())
                try:
                    project_read = ProjectRead(
                        id=p.id,
                        org_id=p.org_id,
                        folder_id=getattr(p, 'folder_id', None),
                        key=p.key,
                        name=p.name,
                        status=p.status,
                        retention_policy_json=getattr(p, 'retention_policy_json', None),
                        raci_matrix_json=getattr(p, 'raci_matrix_json', None),
                        created_at=p.created_at
                    )
                    result.append(project_read)
                except Exception as e2:
                    logger.error(f"Failed to create ProjectRead for {p.id}: {e2}")
                    continue
        
        logger.info(f"Returning {len(result)} projects for user {current_user.id}")
        return result
    except Exception as e:
        logger.error(f"Error in list_my_projects: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error loading projects: {str(e)}")


@router.get("/my-tasks")
def list_my_tasks(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
    status: Optional[str] = None,
):
    """List tasks assigned to current user"""
    from app.models.entities import Task
    from app.core.enums import TaskStatus
    
    logger.info(f"Loading tasks for user {current_user.id} ({current_user.email})")
    
    query = db.query(Task).filter(Task.assigned_to_user_id == current_user.id)
    
    if status and status != "all":
        query = query.filter(Task.status == status)
    
    tasks = query.order_by(Task.created_at.desc()).all()
    logger.info(f"Found {len(tasks)} tasks for user {current_user.id}")
    
    result = []
    for task in tasks:
        try:
            # Get assigned user name
            assigned_to_name = None
            if task.assigned_to_user_id:
                assigned_user = db.query(User).filter(User.id == task.assigned_to_user_id).first()
                if assigned_user:
                    assigned_to_name = assigned_user.name
            
            # Get reviewer name
            reviewer_name = None
            if getattr(task, 'reviewer_id', None):
                reviewer = db.query(User).filter(User.id == task.reviewer_id).first()
                if reviewer:
                    reviewer_name = reviewer.name
            
            # Get project name
            project = db.query(Project).filter(Project.id == task.project_id).first()
            project_name = project.name if project else None
            
            task_dict = {
                "id": str(task.id),
                "project_id": task.project_id,
                "task_type": task.task_type,
                "title": task.title,
                "description": getattr(task, 'description', None),
                "raci_stage": getattr(task, 'raci_stage', None),
                "raci_task_name": getattr(task, 'raci_task_name', None),
                "assigned_to_user_id": task.assigned_to_user_id,
                "assigned_to_name": assigned_to_name,
                "reviewer_id": getattr(task, 'reviewer_id', None),
                "reviewer_name": reviewer_name,
                "required_role": getattr(task, 'required_role', None),
                "estimated_time_hours": getattr(task, 'estimated_time_hours', None),
                "actual_time_hours": getattr(task, 'actual_time_hours', None),
                "status": task.status,
                "priority": task.priority,
                "due_at": getattr(task, 'due_at', None),
                "created_at": task.created_at,
                "completed_at": getattr(task, 'completed_at', None),
                "verified_at": getattr(task, 'verified_at', None),
                "verified_by": getattr(task, 'verified_by', None),
                "is_blocking": getattr(task, 'is_blocking', False)
            }
            task_read = TaskRead.model_validate(task_dict)
            task_read_dict = task_read.model_dump()
            task_read_dict["project_name"] = project_name
            result.append(task_read_dict)
        except Exception as e:
            logger.error(f"Error converting task {task.id}: {e}")
            continue
    
    return result


@router.get("", response_model=list[ProjectRead])
def list_projects(db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """List all projects (for admin)"""
    try:
        projects = db.query(Project).all()
        result = []
        for p in projects:
            try:
                # Try to use model_validate directly from SQLAlchemy object
                # This works because ProjectRead has from_attributes=True
                project_read = ProjectRead.model_validate(p)
                result.append(project_read)
            except Exception as e:
                # If model_validate fails (e.g., missing column), create manually
                import traceback
                print(f"Error converting project {p.id} with model_validate: {e}")
                try:
                    # Manual construction with safe attribute access
                    project_read = ProjectRead(
                        id=p.id,
                        org_id=p.org_id,
                        folder_id=getattr(p, 'folder_id', None),
                        key=p.key,
                        name=p.name,
                        status=p.status,
                        retention_policy_json=getattr(p, 'retention_policy_json', None),
                        raci_matrix_json=getattr(p, 'raci_matrix_json', None),
                        created_at=p.created_at
                    )
                    result.append(project_read)
                except Exception as e2:
                    print(f"Failed to create ProjectRead for {p.id}: {e2}")
                    print(traceback.format_exc())
                    # Skip this project if we can't convert it
                    continue
        return result
    except Exception as e:
        import traceback
        error_msg = f"Error listing projects: {str(e)}"
        print(error_msg)
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=error_msg)


@router.post("", response_model=ProjectRead)
def create_project(
    payload: ProjectCreate, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)
):
    from app.models import Org
    # Get or create default org if org_id not provided
    if not payload.org_id:
        default_org = db.query(Org).first()
        if not default_org:
            import uuid
            default_org = Org(id=uuid.uuid4(), name="Default Organization")
            db.add(default_org)
            db.commit()
            db.refresh(default_org)
        org_id = default_org.id
    else:
        org_id = payload.org_id
    
    # Validate folder_id if provided
    folder_id = payload.folder_id
    if folder_id:
        from app.models import ProjectFolder
        folder = db.query(ProjectFolder).filter(ProjectFolder.id == folder_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        if folder.org_id != org_id:
            raise HTTPException(status_code=400, detail="Folder belongs to different organization")
    
    project = Project(
        org_id=org_id,
        folder_id=folder_id,
        key=payload.key,
        name=payload.name,
        status=payload.status or "ACTIVE",
        retention_policy_json=payload.retention_policy_json
    )
    db.add(project)
    db.flush()  # Flush to get project.id
    
    # Automatically add creator as Business Owner member
    from app.models import ProjectMember
    from app.core.enums import RoleCode
    
    creator_member = ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        role_code=RoleCode.BUSINESS_OWNER.value,
        is_temporary=False,
        expires_at=None,
        invited_by=current_user.id
    )
    db.add(creator_member)
    
    db.commit()
    db.refresh(project)
    
    logger.info(f"Created project {project.id} and added creator {current_user.id} as member")
    return project


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)
):
    from uuid import UUID
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    from uuid import UUID
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update fields if provided
    if payload.name is not None:
        project.name = payload.name
    if payload.status is not None:
        project.status = payload.status
    if payload.retention_policy_json is not None:
        project.retention_policy_json = payload.retention_policy_json
    
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    from uuid import UUID
    from app.models import ProjectMember
    from app.models.entities import Task
    
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Delete related records first (if cascade doesn't handle it)
    # Delete project members
    db.query(ProjectMember).filter(ProjectMember.project_id == project_uuid).delete()
    
    # Delete tasks
    db.query(Task).filter(Task.project_id == project_uuid).delete()
    
    # Delete project
    db.delete(project)
    db.commit()
    
    logger.info(f"Project {project_uuid} deleted by user {current_user.id}")
    return None


@router.get("/{project_id}/raci", response_model=dict)
def get_project_raci(
    project_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)
):
    """Get RACI matrix for a project"""
    from uuid import UUID
    from app.models import ProjectMember, User
    from app.schemas.auth import UserRead
    
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    team_members_dict = _get_team_members_dict(project_uuid, db)
    
    # Get stored RACI matrix or return default
    if project.raci_matrix_json:
        raci_matrix = project.raci_matrix_json.copy()
        # Ensure role_assignments exists
        if "role_assignments" not in raci_matrix:
            raci_matrix["role_assignments"] = {}
        return {
            "project_id": str(project_uuid),
            "raci_matrix": raci_matrix,
            "team_members": team_members_dict
        }
    
    # Return default RACI matrix if not set
    default_raci = _get_default_raci_matrix()
    default_raci["role_assignments"] = {}
    return {
        "project_id": str(project_uuid),
        "raci_matrix": default_raci,  # This is already { "stages": [...], "role_assignments": {} }
        "team_members": team_members_dict
    }


def _get_team_members_dict(project_uuid, db):
    """Get team members as dict for RACI matrix"""
    from datetime import datetime
    from sqlalchemy import or_
    from app.models import ProjectMember, User
    from app.schemas.auth import UserRead
    
    members = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_uuid
    ).filter(
        or_(
            ProjectMember.expires_at.is_(None),
            ProjectMember.expires_at > datetime.utcnow()
        )
    ).all()
    
    result = {}
    for member in members:
        user = db.query(User).filter(User.id == member.user_id).first()
        if user:
            result[member.role_code] = {
                "user": UserRead.model_validate(user),
                "role_code": member.role_code,
                "is_temporary": member.is_temporary,
                "expires_at": member.expires_at.isoformat() if member.expires_at else None
            }
    return result


def _get_default_raci_matrix():
    """Get default RACI matrix structure"""
    return {
        "stages": [
            {
                "stage": "Discovery",
                "tasks": [
                    {
                        "task": "Automation Brief",
                        "roles": {
                            "Process Owner": "A",
                            "SME": "A",
                            "Business Analyst": "A",
                            "Project Manager": "A"
                        }
                    },
                    {
                        "task": "TG 1",
                        "roles": {
                            "Process Owner": "R",
                            "App Owner": "R",
                            "Project Manager": "R",
                            "Solution Architect": "R"
                        }
                    }
                ]
            },
            {
                "stage": "Design",
                "tasks": [
                    {
                        "task": "PDD",
                        "roles": {
                            "Process Owner": "A",
                            "SME": "A",
                            "Business Analyst": "R",
                            "Project Manager": "A",
                            "Junior Developer": "I",
                            "Regular Developer": "I",
                            "Senior Developer": "I",
                            "Solution Architect": "I"
                        }
                    },
                    {
                        "task": "SDD",
                        "roles": {
                            "App Owner": "I",
                            "Project Manager": "A",
                            "Junior Developer": "I",
                            "Regular Developer": "R",
                            "Senior Developer": "R",
                            "Solution Architect": "A"
                        }
                    },
                    {
                        "task": "Development Infra Set-up",
                        "roles": {
                            "Process Owner": "I",
                            "App Owner": "R",
                            "Project Manager": "A",
                            "Junior Developer": "I",
                            "Regular Developer": "I",
                            "Solution Architect": "R"
                        }
                    },
                    {
                        "task": "TG2",
                        "roles": {
                            "Project Manager": "A",
                            "Junior Developer": "R",
                            "Regular Developer": "R",
                            "Senior Developer": "A",
                            "Solution Architect": "A"
                        }
                    },
                    {
                        "task": "UAT/Prod Infra Set-up",
                        "roles": {
                            "App Owner": "R",
                            "Project Manager": "A",
                            "Junior Developer": "I",
                            "Regular Developer": "I",
                            "Solution Architect": "R",
                            "Operator": "I"
                        }
                    }
                ]
            },
            {
                "stage": "Implementation",
                "tasks": [
                    {
                        "task": "Configuration",
                        "roles": {
                            "Project Manager": "R",
                            "Junior Developer": "A",
                            "Regular Developer": "A",
                            "Senior Developer": "A",
                            "Solution Architect": "R"
                        }
                    },
                    {
                        "task": "Unit Testing",
                        "roles": {
                            "Junior Developer": "R",
                            "Regular Developer": "R",
                            "Senior Developer": "A",
                            "Solution Architect": "A",
                            "Operator": "I"
                        }
                    },
                    {
                        "task": "UAT/TG3",
                        "roles": {
                            "Process Owner": "R",
                            "App Owner": "I",
                            "SME": "R",
                            "Business Analyst": "R",
                            "Project Manager": "A",
                            "Junior Developer": "A",
                            "Regular Developer": "A",
                            "Senior Developer": "A",
                            "Solution Architect": "A"
                        }
                    }
                ]
            },
            {
                "stage": "Run",
                "tasks": [
                    {
                        "task": "Robot Monitoring",
                        "roles": {
                            "Solution Architect": "I",
                            "Operator": "A"
                        }
                    },
                    {
                        "task": "Incident Mngt",
                        "roles": {
                            "Solution Architect": "I",
                            "Operator": "A"
                        }
                    },
                    {
                        "task": "Application Change Control",
                        "roles": {
                            "Process Owner": "R",
                            "App Owner": "R",
                            "SME": "R",
                            "Business Analyst": "A",
                            "Solution Architect": "I",
                            "Operator": "I"
                        }
                    }
                ]
            }
        ]
    }


@router.put("/{project_id}/raci", response_model=dict)
def update_project_raci(
    project_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Update RACI matrix for a project"""
    from uuid import UUID
    
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Validate RACI structure
    if "raci_matrix_json" not in payload:
        raise HTTPException(status_code=400, detail="raci_matrix_json is required")
    
    project.raci_matrix_json = payload["raci_matrix_json"]
    db.add(project)
    db.commit()
    db.refresh(project)
    
    return {
        "project_id": str(project_uuid),
        "raci_matrix": project.raci_matrix_json,
        "team_members": _get_team_members_dict(project_uuid, db)
    }


@router.put("/{project_id}/raci/task-status", response_model=dict)
def update_raci_task_status(
    project_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Update status and progress of a task in RACI matrix"""
    from uuid import UUID
    
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    stage_name = payload.get("stage")
    task_name = payload.get("task")
    status = payload.get("status")  # 'not_started' | 'in_progress' | 'completed' | 'blocked'
    progress = payload.get("progress", 0)  # 0-100
    due_date = payload.get("due_date")  # ISO date string or None
    
    if not stage_name or not task_name:
        raise HTTPException(status_code=400, detail="stage and task are required")
    
    # Get current RACI matrix
    raci_matrix = project.raci_matrix_json or _get_default_raci_matrix()
    
    # Find and update the task
    task_found = False
    for stage in raci_matrix.get("stages", []):
        if stage.get("stage") == stage_name:
            for task in stage.get("tasks", []):
                if task.get("task") == task_name:
                    task["status"] = status
                    task["progress"] = max(0, min(100, progress))
                    if due_date:
                        task["due_date"] = due_date
                    elif "due_date" in task and due_date is None:
                        del task["due_date"]
                    task_found = True
                    break
            if task_found:
                break
    
    if not task_found:
        raise HTTPException(status_code=404, detail="Task not found in RACI matrix")
    
    # Save updated RACI matrix
    project.raci_matrix_json = raci_matrix
    db.add(project)
    db.commit()
    db.refresh(project)
    
    return {
        "project_id": str(project_uuid),
        "stage": stage_name,
        "task": task_name,
        "status": status,
        "progress": progress,
        "due_date": due_date
    }


@router.post("/{project_id}/raci/escalate", response_model=dict)
def escalate_raci_task(
    project_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Escalate a task in RACI matrix to accountable/responsible roles"""
    from uuid import UUID
    from datetime import datetime
    
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    stage_name = payload.get("stage")
    task_name = payload.get("task")
    reason = payload.get("reason", "")
    level = payload.get("level", 1)  # Escalation level
    
    if not stage_name or not task_name:
        raise HTTPException(status_code=400, detail="stage and task are required")
    
    # Get current RACI matrix
    raci_matrix = project.raci_matrix_json or _get_default_raci_matrix()
    
    # Find the task
    task = None
    for stage in raci_matrix.get("stages", []):
        if stage.get("stage") == stage_name:
            for t in stage.get("tasks", []):
                if t.get("task") == task_name:
                    task = t
                    break
            if task:
                break
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found in RACI matrix")
    
    # Find roles with R (Responsible) or A (Accountable)
    escalated_roles = []
    for role, raci_value in task.get("roles", {}).items():
        if raci_value in ["R", "A"]:
            escalated_roles.append({
                "role": role,
                "raci_type": raci_value,
                "level": level
            })
    
    if not escalated_roles:
        raise HTTPException(
            status_code=400,
            detail="No Responsible (R) or Accountable (A) roles found for this task"
        )
    
    # Initialize escalations array if not exists
    if "escalations" not in task:
        task["escalations"] = []
    
    # Add escalation record
    escalation = {
        "level": level,
        "escalated_to_roles": [r["role"] for r in escalated_roles],
        "triggered_at": datetime.utcnow().isoformat(),
        "triggered_by": str(current_user.id),
        "reason": reason
    }
    task["escalations"].append(escalation)
    task["escalated"] = True
    
    # Save updated RACI matrix
    project.raci_matrix_json = raci_matrix
    db.add(project)
    db.commit()
    db.refresh(project)
    
    # Get team members for notification
    team_members = _get_team_members_dict(project_uuid, db)
    
    return {
        "project_id": str(project_uuid),
        "stage": stage_name,
        "task": task_name,
        "escalation": escalation,
        "escalated_to_roles": escalated_roles,
        "team_members": team_members
    }


# Tasks endpoints
@router.get("/{project_id}/tasks", response_model=list[TaskRead])
def list_project_tasks(
    project_id: str,
    stage: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """List tasks for a project with optional filters"""
    from uuid import UUID
    from app.models.entities import Task, User
    from app.schemas.tasks import TaskRead
    import logging
    
    logger = logging.getLogger(__name__)
    
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    
    # Check if project exists
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Debug: Check all tasks in database for this project
    # Use expire_all to ensure we get fresh data from database
    db.expire_all()
    all_tasks = db.query(Task).filter(Task.project_id == project_uuid).all()
    logger.info(f"DEBUG: Found {len(all_tasks)} tasks in database for project {project_id}")
    print(f"DEBUG: Found {len(all_tasks)} tasks in database for project {project_id}")
    print(f"DEBUG: Project UUID: {project_uuid}")
    if all_tasks:
        print(f"DEBUG: First task ID: {all_tasks[0].id}, title: {all_tasks[0].title}, project_id: {all_tasks[0].project_id}")
    else:
        # Try to find any tasks at all
        any_tasks = db.query(Task).limit(5).all()
        print(f"DEBUG: No tasks found for this project. Total tasks in database: {db.query(Task).count()}")
        if any_tasks:
            print(f"DEBUG: Sample task project_id: {any_tasks[0].project_id}")
    
    query = db.query(Task).filter(Task.project_id == project_uuid)
    
    if stage:
        query = query.filter(Task.raci_stage == stage)
    
    if status:
        query = query.filter(Task.status == status)
    
    tasks = query.order_by(Task.created_at.desc()).all()
    
    logger.info(f"Found {len(tasks)} tasks for project {project_id}")
    print(f"Found {len(tasks)} tasks for project {project_id}")
    print(f"Task IDs: {[str(t.id) for t in tasks]}")
    print(f"First task (if any): {tasks[0].__dict__ if tasks else 'None'}")
    
    result = []
    for task in tasks:
        # Handle missing columns gracefully
        raci_stage = getattr(task, 'raci_stage', None)
        raci_task_name = getattr(task, 'raci_task_name', None)
        reviewer_id = getattr(task, 'reviewer_id', None)
        estimated_time_hours = getattr(task, 'estimated_time_hours', None)
        actual_time_hours = getattr(task, 'actual_time_hours', None)
        assigned_user = None
        reviewer_user = None
        if task.assigned_to_user_id:
            assigned_user = db.query(User).filter(User.id == task.assigned_to_user_id).first()
        if reviewer_id:  # Use the variable from getattr, not task.reviewer_id directly
            reviewer_user = db.query(User).filter(User.id == reviewer_id).first()
        
        try:
            task_data = {
                "id": str(task.id),  # Convert to string for compatibility
                "project_id": task.project_id,
                "task_type": task.task_type,
                "title": task.title,
                "description": task.description,
                "raci_stage": raci_stage,
                "raci_task_name": raci_task_name,
                "assigned_to_user_id": task.assigned_to_user_id,
                "assigned_to_name": assigned_user.name if assigned_user else None,
                "reviewer_id": reviewer_id,
                "reviewer_name": reviewer_user.name if reviewer_user else None,
                "required_role": task.required_role,
                "estimated_time_hours": estimated_time_hours,
                "actual_time_hours": actual_time_hours,
                "status": task.status,
                "priority": task.priority,
                "due_at": task.due_at,
                "created_at": task.created_at,
                "completed_at": task.completed_at,
                "verified_at": task.verified_at,
                "verified_by": task.verified_by,
                "is_blocking": task.is_blocking
            }
            
            try:
                task_read = TaskRead(**task_data)
                # Convert to dict for JSON serialization
                task_dict = task_read.model_dump()
                result.append(task_dict)
                logger.debug(f"Task {task.id} serialized successfully")
            except Exception as serialize_error:
                logger.error(f"Error serializing task {task.id}: {serialize_error}")
                print(f"ERROR serializing task {task.id}: {serialize_error}")
                print(f"Task data: {task_data}")
                traceback.print_exc()
                # Try to return raw dict instead
                result.append(task_data)
        except Exception as e:
            # Log error but continue processing other tasks
            logger.error(f"Error processing task {task.id}: {str(e)}", exc_info=True)
            print(f"ERROR processing task {task.id}: {str(e)}")
            traceback.print_exc()
            continue
    
    logger.info(f"Returning {len(result)} tasks")
    print(f"Returning {len(result)} tasks")
    print(f"First task (if any): {result[0] if result else 'None'}")
    return result


@router.post("/{project_id}/tasks", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_project_task(
    project_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Create a new task for a project"""
    from uuid import UUID
    from app.models.entities import Task
    from app.core.enums import TaskStatus
    
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Validate assigned user if provided
    assigned_to_user_id = None
    if payload.get("assigned_to_user_id"):
        try:
            from app.models.entities import User
            user_uuid = UUID(payload["assigned_to_user_id"])
            user = db.query(User).filter(User.id == user_uuid).first()
            if user:
                assigned_to_user_id = user_uuid
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"User with ID {payload['assigned_to_user_id']} not found"
                )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid user ID format: {payload['assigned_to_user_id']}"
            )
    
    # Validate reviewer if provided
    reviewer_id = None
    if payload.get("reviewer_id"):
        try:
            from app.models.entities import User
            reviewer_uuid = UUID(payload["reviewer_id"])
            reviewer = db.query(User).filter(User.id == reviewer_uuid).first()
            if reviewer:
                reviewer_id = reviewer_uuid
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Reviewer with ID {payload['reviewer_id']} not found"
                )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid reviewer ID format: {payload['reviewer_id']}"
            )
    
    task = Task(
        project_id=project_uuid,
        task_type=payload.get("task_type", "GENERAL"),
        title=payload.get("title"),
        description=payload.get("description"),
        raci_stage=payload.get("raci_stage"),  # Can be None - task without RACI assignment
        raci_task_name=payload.get("raci_task_name"),  # Can be None - task without RACI assignment
        assigned_to_user_id=assigned_to_user_id,  # Can be None - unassigned task
        reviewer_id=reviewer_id,  # Can be None
        required_role=payload.get("required_role"),
        estimated_time_hours=payload.get("estimated_time_hours"),
        due_at=datetime.fromisoformat(payload["due_at"]) if payload.get("due_at") else None,
        priority=payload.get("priority", "NORMAL"),
        status=TaskStatus.OPEN.value,
        is_blocking=payload.get("is_blocking", False)
    )
    
    db.add(task)
    db.commit()
    db.refresh(task)
    
    return {
        "id": str(task.id),
        "title": task.title,
        "status": task.status
    }


@router.put("/{project_id}/tasks/{task_id}", response_model=dict)
def update_project_task(
    project_id: str,
    task_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Update a task"""
    from uuid import UUID
    from app.models.entities import Task
    from app.core.enums import TaskStatus
    
    try:
        project_uuid = UUID(project_id)
        task_uuid = UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")
    
    task = db.query(Task).filter(Task.id == task_uuid, Task.project_id == project_uuid).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if "title" in payload:
        task.title = payload["title"]
    if "description" in payload:
        task.description = payload["description"]
    if "status" in payload:
        old_status = task.status
        task.status = payload["status"]
        if payload["status"] == TaskStatus.COMPLETED.value:
            task.completed_at = datetime.utcnow()
            
            # Auto-trigger next task in sequence: Creation → Review → Approval
            # Check if this task is part of a RACI sequence
            if task.raci_stage and task.raci_task_name:
                base_task_name = task.raci_task_name
                
                # Determine current task type from title
                if task.title.endswith(" Creation"):
                    # Creation completed → trigger Review
                    review_title = f"{base_task_name} Review"
                    review_task = db.query(Task).filter(
                        Task.project_id == project_uuid,
                        Task.raci_stage == task.raci_stage,
                        Task.raci_task_name == base_task_name,
                        Task.title == review_title,
                        Task.status == TaskStatus.OPEN.value
                    ).first()
                    
                    if review_task:
                        review_task.status = TaskStatus.IN_PROGRESS.value
                        logger.info(f"Auto-triggered Review task: {review_title}")
                
                elif task.title.endswith(" Review"):
                    # Review completed → trigger Approval
                    approval_title = f"{base_task_name} Approval"
                    approval_task = db.query(Task).filter(
                        Task.project_id == project_uuid,
                        Task.raci_stage == task.raci_stage,
                        Task.raci_task_name == base_task_name,
                        Task.title == approval_title,
                        Task.status == TaskStatus.OPEN.value
                    ).first()
                    
                    if approval_task:
                        approval_task.status = TaskStatus.IN_PROGRESS.value
                        logger.info(f"Auto-triggered Approval task: {approval_title}")
    if "assigned_to_user_id" in payload:
        if payload["assigned_to_user_id"]:
            try:
                from app.models.entities import User
                user_uuid = UUID(payload["assigned_to_user_id"])
                user = db.query(User).filter(User.id == user_uuid).first()
                if user:
                    task.assigned_to_user_id = user_uuid
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"User with ID {payload['assigned_to_user_id']} not found"
                    )
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid user ID format: {payload['assigned_to_user_id']}"
                )
        else:
            task.assigned_to_user_id = None
    
    if "reviewer_id" in payload:
        if payload["reviewer_id"]:
            try:
                from app.models.entities import User
                reviewer_uuid = UUID(payload["reviewer_id"])
                reviewer = db.query(User).filter(User.id == reviewer_uuid).first()
                if reviewer:
                    task.reviewer_id = reviewer_uuid
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Reviewer with ID {payload['reviewer_id']} not found"
                    )
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid reviewer ID format: {payload['reviewer_id']}"
                )
        else:
            task.reviewer_id = None
    if "estimated_time_hours" in payload:
        task.estimated_time_hours = payload["estimated_time_hours"]
    if "actual_time_hours" in payload:
        task.actual_time_hours = payload["actual_time_hours"]
    if "due_at" in payload:
        task.due_at = datetime.fromisoformat(payload["due_at"]) if payload["due_at"] else None
    if "priority" in payload:
        task.priority = payload["priority"]
    if "is_blocking" in payload:
        task.is_blocking = payload["is_blocking"]
    
    db.commit()
    db.refresh(task)
    
    return {"id": str(task.id), "status": "updated"}


@router.delete("/{project_id}/tasks/{task_id}", response_model=dict)
def delete_project_task(
    project_id: str,
    task_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Delete a task"""
    from uuid import UUID
    from app.models.entities import Task
    
    try:
        project_uuid = UUID(project_id)
        task_uuid = UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")
    
    task = db.query(Task).filter(Task.id == task_uuid, Task.project_id == project_uuid).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    db.delete(task)
    db.commit()
    
    return {"id": str(task_uuid), "status": "deleted"}


@router.post("/{project_id}/tasks/fix-raci-tasks", response_model=dict)
def fix_existing_raci_tasks(
    project_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Fix existing RACI-generated tasks to match new naming and type rules, and remove duplicates"""
    from uuid import UUID
    from app.models.entities import Task, Project
    from app.core.enums import TaskStatus
    from sqlalchemy import func
    
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get RACI matrix
    raci_matrix = project.raci_matrix_json or _get_default_raci_matrix()
    if not raci_matrix or "stages" not in raci_matrix:
        raise HTTPException(
            status_code=400,
            detail="RACI matrix not configured for this project"
        )
    
    # First, remove duplicates - keep the oldest task for each stage/task/role combination
    # Also check by title to catch duplicates with same title but different RACI fields
    duplicate_count = 0
    
    # Method 1: Remove duplicates by stage/task/role combination
    duplicates_by_raci = db.query(
        Task.raci_stage,
        Task.raci_task_name,
        Task.required_role
    ).filter(
        Task.project_id == project_uuid,
        Task.raci_stage.isnot(None),
        Task.raci_task_name.isnot(None),
        Task.required_role.isnot(None)
    ).group_by(
        Task.raci_stage,
        Task.raci_task_name,
        Task.required_role
    ).having(
        func.count(Task.id) > 1
    ).all()
    
    for dup in duplicates_by_raci:
        # Find all tasks with this combination
        duplicate_tasks = db.query(Task).filter(
            Task.project_id == project_uuid,
            Task.raci_stage == dup.raci_stage,
            Task.raci_task_name == dup.raci_task_name,
            Task.required_role == dup.required_role
        ).order_by(Task.created_at).all()
        
        # Keep the first (oldest) one, delete the rest
        if len(duplicate_tasks) > 1:
            for task_to_delete in duplicate_tasks[1:]:
                db.delete(task_to_delete)
                duplicate_count += 1
    
    # Method 2: Remove duplicates by title (in case titles match but RACI fields differ)
    duplicates_by_title = db.query(
        Task.title
    ).filter(
        Task.project_id == project_uuid,
        Task.raci_stage.isnot(None),
        Task.raci_task_name.isnot(None)
    ).group_by(
        Task.title
    ).having(
        func.count(Task.id) > 1
    ).all()
    
    for dup_title in duplicates_by_title:
        duplicate_tasks = db.query(Task).filter(
            Task.project_id == project_uuid,
            Task.title == dup_title.title
        ).order_by(Task.created_at).all()
        
        # Keep the first (oldest) one, delete the rest
        if len(duplicate_tasks) > 1:
            for task_to_delete in duplicate_tasks[1:]:
                db.delete(task_to_delete)
                duplicate_count += 1
    
    if duplicate_count > 0:
        db.commit()
        logger.info(f"Removed {duplicate_count} duplicate task(s)")
    
    # Get all existing tasks for this project that have RACI data (after removing duplicates)
    existing_tasks = db.query(Task).filter(
        Task.project_id == project_uuid,
        Task.raci_stage.isnot(None),
        Task.raci_task_name.isnot(None),
        Task.required_role.isnot(None)
    ).all()
    
    updated_count = 0
    skipped_count = 0
    
    # Build a mapping of stage/task/role to RACI value
    raci_mapping = {}
    for stage in raci_matrix.get("stages", []):
        stage_name = stage.get("stage")
        for raci_task in stage.get("tasks", []):
            task_name = raci_task.get("task")
            roles = raci_task.get("roles", {})
            for role, raci_value in roles.items():
                key = (stage_name, task_name, role)
                raci_mapping[key] = raci_value
    
    # Update each task
    for task in existing_tasks:
        key = (task.raci_stage, task.raci_task_name, task.required_role)
        raci_value = raci_mapping.get(key)
        
        if not raci_value:
            skipped_count += 1
            continue
        
        # Generate new title and type based on RACI role
        task_prefix = ""  # Can be made configurable if needed
        task_name = task.raci_task_name
        
        if raci_value == "A":
            # Accountable → Approval task
            new_title = f"{task_prefix}{task_name} Approval" if task_prefix else f"{task_name} Approval"
            new_task_type = "APPROVAL"
            new_description = f"Final approval/sign-off for {task_name} in {task.raci_stage} stage. Accountable role: {task.required_role}"
        elif raci_value == "R":
            # Responsible → Creation task
            # Check if task_name matches "TG (TG X)" pattern and convert to "TG X Trial"
            import re
            tg_match = re.match(r'TG\s*\(TG\s*(\d+)\)', task_name, re.IGNORECASE)
            if tg_match:
                tg_number = tg_match.group(1)
                new_title = f"{task_prefix}TG {tg_number} Trial" if task_prefix else f"TG {tg_number} Trial"
            else:
                new_title = f"{task_prefix}{task_name} Creation" if task_prefix else f"{task_name} Creation"
            new_task_type = "DEVELOPMENT"
            new_description = f"Create {task_name} in {task.raci_stage} stage. Responsible role: {task.required_role}"
        elif raci_value == "C":
            # Consulted → Review task
            new_title = f"{task_prefix}{task_name} Review" if task_prefix else f"{task_name} Review"
            new_task_type = "REVIEW"
            new_description = f"Review and provide input for {task_name} in {task.raci_stage} stage. Consulted role: {task.required_role}"
        elif raci_value == "I":
            # Informed → Information task
            new_title = f"{task_prefix}{task_name} Information" if task_prefix else f"{task_name} Information"
            new_task_type = "GENERAL"
            new_description = f"Information/visibility for {task_name} in {task.raci_stage} stage. Informed role: {task.required_role}"
        else:
            skipped_count += 1
            continue
        
        # Update task
        task.title = new_title
        task.task_type = new_task_type
        task.description = new_description
        task.is_blocking = (raci_value == "A")
        
        updated_count += 1
    
    db.commit()
    
    return {
        "project_id": str(project_uuid),
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "duplicate_count": duplicate_count,
        "message": f"Removed {duplicate_count} duplicate(s), updated {updated_count} task(s), skipped {skipped_count} task(s)"
    }


@router.post("/{project_id}/tasks/generate-from-raci", response_model=dict)
def generate_tasks_from_raci(
    project_id: str,
    payload: GenerateTasksFromRACIRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Generate tasks automatically from RACI matrix"""
    from uuid import UUID
    from app.models.entities import Task, User
    from app.core.enums import TaskStatus
    import logging
    import traceback
    
    logger = logging.getLogger(__name__)
    
    logger.info("=" * 80)
    logger.info(f"GENERATE TASKS FROM RACI - ENTRY POINT")
    logger.info(f"project_id={project_id}")
    logger.info(f"payload={payload}")
    logger.info(f"payload type={type(payload)}")
    print("=" * 80)
    print(f"GENERATE TASKS FROM RACI - ENTRY POINT")
    print(f"project_id={project_id}")
    print(f"payload={payload}")
    print(f"payload type={type(payload)}")
    
    try:
        logger.info(f"Generate tasks request: project_id={project_id}, payload={payload}")
        print(f"GENERATE TASKS REQUEST: project_id={project_id}, payload={payload}")
        print(f"Payload type: {type(payload)}, task_type={payload.task_type}, task_prefix={payload.task_prefix}, priority={payload.priority}")
        
        try:
            project_uuid = UUID(project_id)
        except ValueError as e:
            logger.error(f"Invalid project ID format: {project_id}, error: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Invalid project ID format: {project_id}")
        
        project = db.query(Project).filter(Project.id == project_uuid).first()
        if not project:
            logger.error(f"Project not found: {project_id}")
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get RACI matrix - use default if not configured
        raci_matrix = project.raci_matrix_json or _get_default_raci_matrix()
        if not raci_matrix or "stages" not in raci_matrix:
            logger.error(f"RACI matrix not configured for project: {project_id} and default is also invalid")
            raise HTTPException(
                status_code=400,
                detail="RACI matrix not configured for this project"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in generate_tasks_from_raci: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
    
    # Get team members mapping
    team_members = _get_team_members_dict(project_uuid, db)
    
    # Get role assignments from RACI
    role_assignments = raci_matrix.get("role_assignments", {})
    
    # Task type from payload or default
    task_type = payload.task_type
    task_prefix = payload.task_prefix
    
    created_tasks = []
    skipped_tasks = []
    
    # Iterate through all stages and tasks
    for stage in raci_matrix.get("stages", []):
        stage_name = stage.get("stage")
        for raci_task in stage.get("tasks", []):
            task_name = raci_task.get("task")
            roles = raci_task.get("roles", {})
            
            # Find roles with R (Responsible), A (Accountable), or C (Consulted)
            # High-Level Rule Mapping:
            # R (Responsible) → creates / executes → "Creation" task
            # A (Accountable) → final approval / sign-off → "Approval" task
            # C (Consulted) → reviews, gives input → "Review" task
            # I (Informed) → visibility only → NO TASK (people are just informed about updates/approvals/rejects)
            responsible_roles = []
            for role, raci_value in roles.items():
                if raci_value in ["R", "A", "C"]:  # Skip "I" - no tasks for Informed
                    # Get assigned user for this role
                    user_id = None
                    if role in role_assignments:
                        user_id = role_assignments[role]
                    elif role in team_members:
                        # team_members is a dict with role_code as key, value has "user" object
                        user_obj = team_members[role].get("user")
                        if user_obj and hasattr(user_obj, "id"):
                            user_id = str(user_obj.id)
                        elif isinstance(user_obj, dict) and "id" in user_obj:
                            user_id = str(user_obj["id"])
                    
                    responsible_roles.append({
                        "role": role,
                        "raci_value": raci_value,
                        "user_id": user_id
                    })
            
            # Sort roles to ensure correct order: R (Creation) first, then C (Review), then A (Approval)
            # This ensures Creation is always before Approval when generating automatically
            def get_raci_priority(raci_value):
                if raci_value == "R":
                    return 1  # Creation first
                elif raci_value == "C":
                    return 2  # Review second
                elif raci_value == "A":
                    return 3  # Approval last
                return 99
            
            responsible_roles.sort(key=lambda x: get_raci_priority(x["raci_value"]))
            
            # Create tasks for each role (in sorted order: Creation → Review → Approval)
            for role_info in responsible_roles:
                role = role_info["role"]
                user_id = role_info["user_id"]
                raci_value = role_info["raci_value"]
                
                # Generate task title and type based on RACI role FIRST
                # Formal naming: Creation, Review, Approval
                # R (Responsible) → "SDD Creation"
                # A (Accountable) → "SDD Approval"
                # C (Consulted) → "SDD Review"
                # I (Informed) → NO TASK (people are just informed about updates/approvals/rejects)
                if raci_value == "A":
                    # Accountable → Approval task
                    task_title = f"{task_prefix}{task_name} Approval" if task_prefix else f"{task_name} Approval"
                    task_type_for_role = "APPROVAL"
                    task_description = f"Final approval/sign-off for {task_name} in {stage_name} stage. Accountable role: {role}"
                elif raci_value == "R":
                    # Responsible → Creation task
                    # Check if task_name matches "TG (TG X)" pattern and convert to "TG X Trial"
                    import re
                    tg_match = re.match(r'TG\s*\(TG\s*(\d+)\)', task_name, re.IGNORECASE)
                    if tg_match:
                        tg_number = tg_match.group(1)
                        task_title = f"{task_prefix}TG {tg_number} Trial" if task_prefix else f"TG {tg_number} Trial"
                    else:
                        task_title = f"{task_prefix}{task_name} Creation" if task_prefix else f"{task_name} Creation"
                    task_type_for_role = "DEVELOPMENT"
                    task_description = f"Create {task_name} in {stage_name} stage. Responsible role: {role}"
                elif raci_value == "C":
                    # Consulted → Review task
                    task_title = f"{task_prefix}{task_name} Review" if task_prefix else f"{task_name} Review"
                    task_type_for_role = "REVIEW"
                    task_description = f"Review and provide input for {task_name} in {stage_name} stage. Consulted role: {role}"
                else:
                    # Fallback
                    task_title = f"{task_prefix}{task_name} - {role}" if task_prefix else f"{task_name} - {role}"
                    task_type_for_role = task_type
                    task_description = f"Auto-generated task for {stage_name} / {task_name} - Role: {role} ({raci_value})"
                
                # Check if task already exists - by RACI fields AND by title (to catch duplicates)
                existing_by_raci = db.query(Task).filter(
                    Task.project_id == project_uuid,
                    Task.raci_stage == stage_name,
                    Task.raci_task_name == task_name,
                    Task.required_role == role
                ).first()
                
                existing_by_title = db.query(Task).filter(
                    Task.project_id == project_uuid,
                    Task.title == task_title
                ).first()
                
                if existing_by_raci or existing_by_title:
                    skipped_tasks.append({
                        "stage": stage_name,
                        "task": task_name,
                        "role": role,
                        "reason": "Task already exists"
                    })
                    continue
                
                # Convert user_id to UUID if available and verify user exists
                assigned_user_id = None
                if user_id:
                    try:
                        user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
                        # Verify user exists in database
                        user_exists = db.query(User).filter(User.id == user_uuid).first()
                        if user_exists:
                            assigned_user_id = user_uuid
                        else:
                            logger.warning(f"User {user_uuid} not found, creating task without assignment")
                            print(f"WARNING: User {user_uuid} not found, creating task without assignment")
                    except (ValueError, TypeError) as e:
                        # Invalid UUID, skip assignment
                        logger.warning(f"Invalid user_id format: {user_id}, error: {e}")
                        print(f"WARNING: Invalid user_id format: {user_id}, error: {e}")
                        assigned_user_id = None
                
                # Create task - simplified without savepoints for better performance
                try:
                    task = Task(
                        project_id=project_uuid,
                        task_type=task_type_for_role,  # Use role-specific task type
                        title=task_title,  # Use role-specific title (e.g., "SDD Approval")
                        description=task_description,  # Use role-specific description
                        raci_stage=stage_name,
                        raci_task_name=task_name,
                        assigned_to_user_id=assigned_user_id,  # Can be None
                        required_role=role,
                        status=TaskStatus.OPEN.value,
                        priority=payload.priority,
                        is_blocking=raci_value == "A"  # Accountable tasks are blocking
                    )
                    
                    db.add(task)
                    # Don't flush here - batch all adds and flush/commit at the end
                    logger.debug(f"Task added to session: {task_title}")
                    
                    created_tasks.append({
                        "title": task_title,
                        "stage": stage_name,
                        "task": task_name,
                        "role": role
                    })
                except Exception as task_error:
                    logger.error(f"Error creating task: {task_error}")
                    print(f"ERROR creating task: {task_error}")
                    traceback.print_exc()
                    skipped_tasks.append({
                        "stage": stage_name,
                        "task": task_name,
                        "role": role,
                        "reason": f"Error creating task: {str(task_error)}"
                    })
                    continue
    
    logger.info(f"Flushing and committing {len(created_tasks)} tasks to database")
    print(f"Flushing and committing {len(created_tasks)} tasks to database")
    try:
        db.flush()  # Flush to get IDs (if needed later)
        db.commit()  # Commit all tasks at once
        logger.info("Tasks committed successfully")
        print("Tasks committed successfully")
        
        # Skip verification to speed up response - tasks are already committed
        # Verification can be done in a separate query if needed
    except Exception as commit_error:
        logger.error(f"Error committing tasks: {commit_error}")
        print(f"ERROR committing tasks: {commit_error}")
        traceback.print_exc()
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to commit tasks: {str(commit_error)}")
    
    result = {
        "project_id": str(project_uuid),
        "created_count": len(created_tasks),
        "skipped_count": len(skipped_tasks),
        "created_tasks": created_tasks,
        "skipped_tasks": skipped_tasks
    }
    
    logger.info(f"Generate tasks result: created={len(created_tasks)}, skipped={len(skipped_tasks)}")
    print(f"GENERATE TASKS RESULT: created={len(created_tasks)}, skipped={len(skipped_tasks)}")
    print(f"Created tasks: {created_tasks}")
    print(f"Skipped tasks: {skipped_tasks}")
    
    return result


@router.post("/{project_id}/tasks/{task_id}/review", response_model=dict)
def review_task(
    project_id: str,
    task_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Review a task (approve, reject, request changes)"""
    from uuid import UUID
    from app.models.entities import Task
    from app.core.enums import TaskStatus
    
    try:
        project_uuid = UUID(project_id)
        task_uuid = UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")
    
    task = db.query(Task).filter(Task.id == task_uuid, Task.project_id == project_uuid).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    action = payload.get("action")  # "APPROVE", "REJECT", "REQUEST_CHANGES"
    
    if action == "APPROVE":
        task.status = TaskStatus.VERIFIED.value
        task.verified_at = datetime.utcnow()
        task.verified_by = current_user.id
        # Move to reviewer if exists
        if task.reviewer_id:
            task.assigned_to_user_id = task.reviewer_id
            task.reviewer_id = None
    elif action == "REJECT":
        task.status = TaskStatus.BLOCKED.value
    elif action == "REQUEST_CHANGES":
        task.status = TaskStatus.OPEN.value
    
    db.commit()
    db.refresh(task)
    
    return {"id": str(task.id), "status": task.status, "action": action}

