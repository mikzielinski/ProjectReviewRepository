from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.db import get_db
from app.dependencies import get_current_active_user
from app.models import User
from app.schemas.auth import UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=List[UserRead])
def list_users(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """List all users (only for system admins or for listing project members)"""
    # For now, allow all authenticated users to see the list
    # In production, you might want to restrict this to system admins only
    users = db.query(User).filter(User.is_active == True).all()
    return users


@router.get("/{user_id}", response_model=UserRead)
def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Get user by ID"""
    try:
        user_uuid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    
    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

