from datetime import datetime, timezone
import traceback

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db import get_db
from app.dependencies import get_current_active_user
from app.schemas import ProjectMemberInvite, ProjectMemberRead
from app.models import ProjectMember, Project

router = APIRouter(prefix="/projects/{project_id}/members", tags=["members"])


@router.get("", response_model=list[ProjectMemberRead])
def list_members(
    project_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)
):
    from uuid import UUID
    from app.models import User
    from app.schemas.auth import UserRead
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    
    try:
        # Filter out expired members
        from datetime import datetime
        members = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_uuid
        ).filter(
            or_(
                ProjectMember.expires_at.is_(None),
                ProjectMember.expires_at > datetime.now(timezone.utc)
            )
        ).all()
        
        # Include user details in response
        result = []
        for member in members:
            try:
                user = db.query(User).filter(User.id == member.user_id).first()
                if user:
                    try:
                        user_data = UserRead.model_validate(user)
                    except Exception as user_validate_error:
                        logger.error(f"Error validating user {user.id} for member {member.id}: {str(user_validate_error)}", exc_info=True)
                        user_data = None
                else:
                    user_data = None
                
                try:
                    result.append(ProjectMemberRead(
                        id=member.id,
                        project_id=member.project_id,
                        user_id=member.user_id,
                        role_code=member.role_code,
                        is_temporary=member.is_temporary,
                        expires_at=member.expires_at,
                        invited_by=member.invited_by,
                        created_at=member.created_at,
                        user=user_data
                    ))
                except Exception as read_error:
                    logger.error(f"Error creating ProjectMemberRead for member {member.id}: {str(read_error)}", exc_info=True)
                    # Still add member without user data
                    result.append(ProjectMemberRead(
                        id=member.id,
                        project_id=member.project_id,
                        user_id=member.user_id,
                        role_code=member.role_code,
                        is_temporary=member.is_temporary,
                        expires_at=member.expires_at,
                        invited_by=member.invited_by,
                        created_at=member.created_at,
                        user=None
                    ))
            except Exception as e:
                # Log error but continue processing other members
                logger.error(f"Error processing member {member.id}: {str(e)}", exc_info=True)
                # Still add member without user data
                try:
                    result.append(ProjectMemberRead(
                        id=member.id,
                        project_id=member.project_id,
                        user_id=member.user_id,
                        role_code=member.role_code,
                        is_temporary=member.is_temporary,
                        expires_at=member.expires_at,
                        invited_by=member.invited_by,
                        created_at=member.created_at,
                        user=None
                    ))
                except Exception as final_error:
                    logger.error(f"Error creating ProjectMemberRead (fallback) for member {member.id}: {str(final_error)}", exc_info=True)
                    # Skip this member if we can't even create a basic response
                    continue
        
        return result
    except Exception as e:
        logger.error(f"Error in list_members for project {project_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list members: {str(e)}"
        )


@router.post("", response_model=ProjectMemberRead, status_code=status.HTTP_201_CREATED)
def invite_member(
    project_id: str,
    payload: ProjectMemberInvite,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    from uuid import UUID
    from app.models import User
    from app.schemas.auth import UserRead
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Log incoming request
        logger.info(f"Invite member request: project_id={project_id}, payload={payload.model_dump()}, current_user={current_user.email if current_user else 'None'}")
        print(f"INVITE MEMBER: project_id={project_id}, payload={payload.model_dump()}, current_user={current_user.email if current_user else 'None'}")
        
        try:
            project_uuid = UUID(project_id)
        except ValueError:
            logger.error(f"Invalid project ID format: {project_id}")
            print(f"ERROR: Invalid project ID format: {project_id}")
            raise HTTPException(status_code=400, detail="Invalid project ID format")
    
        project = db.query(Project).filter(Project.id == project_uuid).first()
        if not project:
            logger.error(f"Project not found: {project_uuid}")
            print(f"ERROR: Project not found: {project_uuid}")
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Validate user exists
        user = db.query(User).filter(User.id == payload.user_id).first()
        if not user:
            logger.error(f"User not found: {payload.user_id}")
            print(f"ERROR: User not found: {payload.user_id}")
            raise HTTPException(status_code=404, detail="User not found")
        
        # Check if user is already a member
        existing = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_uuid,
            ProjectMember.user_id == payload.user_id
        ).first()
        if existing:
            # Check if expired
            # Ensure both datetimes are timezone-aware for comparison
            now = datetime.now(timezone.utc)
            expires_at = existing.expires_at
            # If expires_at is naive, make it aware; if already aware, keep it
            if expires_at:
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                if expires_at < now:
                    # Reactivate expired member
                    try:
                        existing.role_code = payload.role_code
                        existing.is_temporary = payload.is_temporary
                        existing.expires_at = payload.expires_at if payload.is_temporary and payload.expires_at else None
                        existing.invited_by = current_user.id
                        db.add(existing)
                        db.commit()
                        db.refresh(existing)
                        try:
                            user_data = UserRead.model_validate(user)
                        except Exception as user_error:
                            import logging
                            logger = logging.getLogger(__name__)
                            logger.error(f"Error validating user data in reactivate: {str(user_error)}", exc_info=True)
                            user_data = None
                        return ProjectMemberRead(
                            id=existing.id,
                            project_id=existing.project_id,
                            user_id=existing.user_id,
                            role_code=existing.role_code,
                            is_temporary=existing.is_temporary,
                            expires_at=existing.expires_at,
                            invited_by=existing.invited_by,
                            created_at=existing.created_at,
                            user=user_data
                        )
                    except Exception as reactivate_error:
                        db.rollback()
                        import logging
                        logger = logging.getLogger(__name__)
                        logger.error(f"Error reactivating member: {str(reactivate_error)}", exc_info=True)
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=f"Failed to reactivate member: {str(reactivate_error)}"
                        )
            else:
                raise HTTPException(status_code=400, detail="User is already a member of this project")
        
        if payload.is_temporary and payload.expires_at is None:
            raise HTTPException(status_code=400, detail="Temporary members require expires_at")
        
        try:
            membership = ProjectMember(
                project_id=project_uuid,
                user_id=payload.user_id,
                role_code=payload.role_code,
                is_temporary=payload.is_temporary,
                expires_at=payload.expires_at if payload.is_temporary else None,
                invited_by=current_user.id,
            )
            db.add(membership)
            db.commit()
            db.refresh(membership)
            
            # Include user details in response
            try:
                user_data = UserRead.model_validate(user)
            except Exception as user_error:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error validating user data: {str(user_error)}", exc_info=True)
                user_data = None
            
            try:
                return ProjectMemberRead(
                    id=membership.id,
                    project_id=membership.project_id,
                    user_id=membership.user_id,
                    role_code=membership.role_code,
                    is_temporary=membership.is_temporary,
                    expires_at=membership.expires_at,
                    invited_by=membership.invited_by,
                    created_at=membership.created_at,
                    user=user_data
                )
            except Exception as read_error:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error creating ProjectMemberRead: {str(read_error)}", exc_info=True)
                # Return basic response even if serialization fails
                return ProjectMemberRead(
                id=membership.id,
                project_id=membership.project_id,
                user_id=membership.user_id,
                role_code=membership.role_code,
                is_temporary=membership.is_temporary,
                expires_at=membership.expires_at,
                invited_by=membership.invited_by,
                created_at=membership.created_at,
                user=None
                )
        except HTTPException:
            # Re-raise HTTP exceptions as-is
            raise
        except Exception as e:
            db.rollback()
            logger.error(f"Error creating membership for role '{payload.role_code}': {str(e)}", exc_info=True)
            logger.error(f"Error type: {type(e).__name__}")
            logger.error(f"Payload: {payload.model_dump()}")
            logger.error(f"Project ID: {project_id}")
            logger.error(f"Current user: {current_user.email if current_user else 'None'}")
            print(f"ERROR creating membership: {str(e)}")
            print(f"Error type: {type(e).__name__}")
            print(f"Payload: {payload.model_dump()}")
            print(f"Project ID: {project_id}")
            print(f"Current user: {current_user.email if current_user else 'None'}")
            traceback.print_exc()
            
            # Check if it's a unique constraint error
            error_str = str(e).lower()
            if 'unique' in error_str or 'duplicate' in error_str:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"User is already a member of this project with a different role or status."
                )
            # Check if it's a foreign key constraint error (role doesn't exist)
            if 'foreign key' in error_str or 'role' in error_str:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid role code: {payload.role_code}. Role must exist in the roles table or be a custom role."
                )
            # Return more detailed error for debugging
            error_detail = f"Failed to create membership: {str(e)}"
            if hasattr(e, '__cause__') and e.__cause__:
                error_detail += f" (Cause: {str(e.__cause__)})"
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error_detail
            )
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Unexpected error in invite_member: {str(e)}", exc_info=True)
        print(f"UNEXPECTED ERROR in invite_member: {str(e)}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error: {str(e)}"
        )


@router.put("/{member_id}", response_model=ProjectMemberRead)
def update_member(
    project_id: str,
    member_id: str,
    payload: ProjectMemberInvite,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Update member role"""
    from uuid import UUID
    from app.models import User
    from app.schemas.auth import UserRead
    
    try:
        project_uuid = UUID(project_id)
        member_uuid = UUID(member_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")
    
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_uuid, ProjectMember.id == member_uuid)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Update role
    membership.role_code = payload.role_code
    membership.is_temporary = payload.is_temporary
    if payload.is_temporary:
        membership.expires_at = payload.expires_at
    else:
        membership.expires_at = None
    
    db.add(membership)
    db.commit()
    db.refresh(membership)
    
    # Include user details
    user = db.query(User).filter(User.id == membership.user_id).first()
    user_data = UserRead.model_validate(user) if user else None
    return ProjectMemberRead(
        id=membership.id,
        project_id=membership.project_id,
        user_id=membership.user_id,
        role_code=membership.role_code,
        is_temporary=membership.is_temporary,
        expires_at=membership.expires_at,
        invited_by=membership.invited_by,
        created_at=membership.created_at,
        user=user_data
    )


@router.post("/{member_id}/disable", response_model=ProjectMemberRead)
def disable_member(
    project_id: str,
    member_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    from uuid import UUID
    from app.models import User
    from app.schemas.auth import UserRead
    
    try:
        project_uuid = UUID(project_id)
        member_uuid = UUID(member_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")
    
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_uuid, ProjectMember.id == member_uuid)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Set expiration to now to disable
    membership.expires_at = datetime.now(timezone.utc)
    db.add(membership)
    db.commit()
    db.refresh(membership)
    
    # Include user details
    user = db.query(User).filter(User.id == membership.user_id).first()
    user_data = UserRead.model_validate(user) if user else None
    return ProjectMemberRead(
        id=membership.id,
        project_id=membership.project_id,
        user_id=membership.user_id,
        role_code=membership.role_code,
        is_temporary=membership.is_temporary,
        expires_at=membership.expires_at,
        invited_by=membership.invited_by,
        created_at=membership.created_at,
        user=user_data
    )

