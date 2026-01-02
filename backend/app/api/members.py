"""Project members API endpoints."""
import uuid
from typing import List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.role import RoleCode
from app.schemas.member import MemberInvite, MemberResponse, MemberDisable
from app.services.auth import get_user_by_email, create_user, get_password_hash
from app.services.audit import log_action, AuditAction, model_to_dict
from app.core.deps import get_current_user, ProjectAccess, get_client_info

router = APIRouter()


@router.post("/projects/{project_id}/invite", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
def invite_member(
    request: Request,
    project_id: uuid.UUID,
    invite_data: MemberInvite,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project: Project = Depends(ProjectAccess(required_roles=[RoleCode.BUSINESS_OWNER.value, RoleCode.ORG_ADMIN.value])),
):
    """Invite a member to a project."""
    # Validate role code
    valid_roles = [r.value for r in RoleCode]
    if invite_data.role_code not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role code. Must be one of: {valid_roles}",
        )
    
    # Temporary users require expiry date
    if invite_data.is_temporary and not invite_data.expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Temporary users must have an expiry date",
        )
    
    # SME and AUDITOR must be temporary
    if invite_data.role_code in [RoleCode.SME.value, RoleCode.AUDITOR.value]:
        if not invite_data.is_temporary:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="SME and AUDITOR roles must be temporary",
            )
    
    # Get or create user
    user = get_user_by_email(db, invite_data.email)
    if not user:
        # Create user with random password (they'll need to reset)
        import secrets
        temp_password = secrets.token_urlsafe(16)
        user = User(
            email=invite_data.email,
            name=invite_data.name,
            password_hash=get_password_hash(temp_password),
            org_id=project.org_id,
            is_active=True,
            auth_provider="local",
        )
        db.add(user)
        db.flush()
    
    # Check if already a member
    existing = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user.id,
        ProjectMember.role_code == invite_data.role_code,
        ProjectMember.is_active == True,
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already has this role in the project",
        )
    
    # Create membership
    member = ProjectMember(
        project_id=project_id,
        user_id=user.id,
        role_code=invite_data.role_code,
        is_temporary=invite_data.is_temporary,
        expires_at=invite_data.expires_at,
        invited_by=current_user.id,
        is_active=True,
    )
    db.add(member)
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project_id,
        actor_user_id=current_user.id,
        action=AuditAction.MEMBER_INVITE,
        entity_type="ProjectMember",
        entity_id=member.id,
        after_json={
            "user_email": user.email,
            "role_code": invite_data.role_code,
            "is_temporary": invite_data.is_temporary,
            "expires_at": invite_data.expires_at.isoformat() if invite_data.expires_at else None,
        },
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    db.refresh(member)
    
    return MemberResponse(
        id=member.id,
        project_id=member.project_id,
        user_id=member.user_id,
        user_email=user.email,
        user_name=user.name,
        role_code=member.role_code,
        is_temporary=member.is_temporary,
        expires_at=member.expires_at,
        is_active=member.is_active,
        created_at=member.created_at,
    )


@router.get("/projects/{project_id}/members", response_model=List[MemberResponse])
def list_members(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    project: Project = Depends(ProjectAccess()),
):
    """List project members."""
    members = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
    ).all()
    
    result = []
    for member in members:
        result.append(MemberResponse(
            id=member.id,
            project_id=member.project_id,
            user_id=member.user_id,
            user_email=member.user.email,
            user_name=member.user.name,
            role_code=member.role_code,
            is_temporary=member.is_temporary,
            expires_at=member.expires_at,
            is_active=member.is_active,
            created_at=member.created_at,
        ))
    
    return result


@router.post("/projects/{project_id}/members/{member_id}/disable")
def disable_member(
    request: Request,
    project_id: uuid.UUID,
    member_id: uuid.UUID,
    disable_data: MemberDisable,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project: Project = Depends(ProjectAccess(required_roles=[RoleCode.BUSINESS_OWNER.value, RoleCode.ORG_ADMIN.value])),
):
    """Disable a project member."""
    member = db.query(ProjectMember).filter(
        ProjectMember.id == member_id,
        ProjectMember.project_id == project_id,
    ).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )
    
    if not member.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Member is already disabled",
        )
    
    before = {"is_active": True}
    member.is_active = False
    
    # Audit log
    client_info = get_client_info(request)
    log_action(
        db,
        org_id=project.org_id,
        project_id=project_id,
        actor_user_id=current_user.id,
        action=AuditAction.MEMBER_DISABLE,
        entity_type="ProjectMember",
        entity_id=member.id,
        before_json=before,
        after_json={
            "is_active": False,
            "reason": disable_data.reason,
        },
        ip=client_info["ip"],
        user_agent=client_info["user_agent"],
    )
    
    db.commit()
    
    return {"status": "disabled", "member_id": member_id}

