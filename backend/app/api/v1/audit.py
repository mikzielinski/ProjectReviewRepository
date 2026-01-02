"""
Audit endpoints
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.audit_log import AuditLog

router = APIRouter()


@router.get("/projects/{project_id}/audit")
async def get_audit_log(
    project_id: int,
    limit: int = Query(100, le=1000),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get audit log for a project"""
    logs = db.query(AuditLog).filter(
        AuditLog.project_id == project_id
    ).order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    
    return logs

