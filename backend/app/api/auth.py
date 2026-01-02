"""Authentication API endpoints."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.db import get_db, SessionLocal
from app.models.user import User
from app.models.org import Org
from app.schemas.auth import LoginRequest, Token, UserCreate, UserResponse
from app.services.auth import (
    authenticate_user,
    create_access_token,
    create_user,
    get_user_by_email,
)
from app.services.audit import log_action, AuditAction
from app.core.deps import get_current_user, get_client_info

router = APIRouter()


@router.post("/login", response_model=Token)
def login(
    request: Request,
    login_data: LoginRequest,
    db: Session = Depends(get_db),
):
    """Authenticate user and return JWT token."""
    user = authenticate_user(db, login_data.email, login_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    
    access_token = create_access_token(user.id, user.org_id)
    
    # Log successful login (don't let audit log failure break login)
    # Use separate session for audit log to avoid transaction conflicts
    if user.org_id:
        try:
            client_info = get_client_info(request)
            
            # Use separate session for audit logging
            audit_db = SessionLocal()
            try:
                log_action(
                    audit_db,
                    org_id=user.org_id,
                    actor_user_id=user.id,
                    action=AuditAction.LOGIN,
                    entity_type="User",
                    entity_id=user.id,
                    ip=client_info["ip"],
                    user_agent=client_info["user_agent"],
                )
                audit_db.commit()
            except Exception as audit_error:
                # Log error but don't break login
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to log login audit: {str(audit_error)}")
                import traceback
                logger.error(traceback.format_exc())
                audit_db.rollback()
            finally:
                audit_db.close()
        except Exception as e:
            # Even if audit setup fails, don't break login
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to setup audit log for login: {str(e)}")
    
    return Token(access_token=access_token)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(
    user_data: UserCreate,
    db: Session = Depends(get_db),
):
    """Register a new user."""
    # Check if email already exists
    existing = get_user_by_email(db, user_data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    
    # If org_id provided, verify it exists
    org_id = user_data.org_id
    if org_id:
        org = db.query(Org).filter(Org.id == org_id).first()
        if not org:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organization not found",
            )
    
    user = create_user(
        db,
        email=user_data.email,
        name=user_data.name,
        password=user_data.password,
        org_id=org_id,
    )
    
    return UserResponse.model_validate(user)


@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: User = Depends(get_current_user),
):
    """Get current authenticated user info."""
    return UserResponse.model_validate(current_user)


@router.post("/org", status_code=status.HTTP_201_CREATED)
def create_org(
    name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new organization (for initial setup)."""
    if current_user.org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already belongs to an organization",
        )
    
    org = Org(name=name)
    db.add(org)
    db.commit()
    db.refresh(org)
    
    # Update user's org
    current_user.org_id = org.id
    db.commit()
    
    return {
        "id": org.id,
        "name": org.name,
        "created_at": org.created_at,
    }

