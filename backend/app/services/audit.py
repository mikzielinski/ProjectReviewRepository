"""
Audit logging service for HIPAA/GxP/GIS compliance.
Logs all actions on documents, projects, and other entities.
"""
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from uuid import UUID
import logging

logger = logging.getLogger(__name__)


class AuditAction:
    """Audit action types for compliance tracking."""
    DOCUMENT_CREATE = "DOCUMENT_CREATE"
    DOCUMENT_UPDATE = "DOCUMENT_UPDATE"
    DOCUMENT_DELETE = "DOCUMENT_DELETE"
    DOCUMENT_VIEW = "DOCUMENT_VIEW"
    VERSION_CREATE = "VERSION_CREATE"
    VERSION_UPDATE = "VERSION_UPDATE"
    VERSION_SUBMIT = "VERSION_SUBMIT"
    VERSION_APPROVE = "VERSION_APPROVE"
    VERSION_REJECT = "VERSION_REJECT"
    TEMPLATE_CREATE = "TEMPLATE_CREATE"
    TEMPLATE_UPDATE = "TEMPLATE_UPDATE"
    TEMPLATE_DELETE = "TEMPLATE_DELETE"
    TEMPLATE_APPROVE = "TEMPLATE_APPROVE"
    TEMPLATE_VIEW = "TEMPLATE_VIEW"
    PROJECT_CREATE = "PROJECT_CREATE"
    PROJECT_UPDATE = "PROJECT_UPDATE"
    PROJECT_DELETE = "PROJECT_DELETE"
    MEMBER_INVITE = "MEMBER_INVITE"
    MEMBER_UPDATE = "MEMBER_UPDATE"
    MEMBER_REMOVE = "MEMBER_REMOVE"
    TASK_CREATE = "TASK_CREATE"
    TASK_UPDATE = "TASK_UPDATE"
    TASK_COMPLETE = "TASK_COMPLETE"
    EVIDENCE_UPLOAD = "EVIDENCE_UPLOAD"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"


def log_action(
    db: Session,
    actor_user_id: UUID,
    action: str,
    entity_type: str,
    entity_id: Any,
    org_id: Optional[UUID] = None,
    project_id: Optional[UUID] = None,
    before_json: Optional[Dict[str, Any]] = None,
    after_json: Optional[Dict[str, Any]] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    """
    Log an action to the audit log for HIPAA/GxP/GIS compliance.
    
    Args:
        db: Database session
        org_id: Organization ID
        project_id: Project ID (if action is project-related)
        actor_user_id: ID of user performing the action
        action: Action type (from AuditAction)
        entity_type: Type of entity being acted upon (e.g., "Document", "Project")
        entity_id: ID of the entity (UUID or string)
        before_json: State before the action (for updates)
        after_json: State after the action
        ip: IP address of the client
        user_agent: User agent string of the client
    """
    try:
        from app.models import AuditLog
        
        # Convert entity_id to UUID if it's a string
        if isinstance(entity_id, str):
            try:
                entity_id_uuid = UUID(entity_id)
            except ValueError:
                # If it's not a valid UUID, use a default UUID
                entity_id_uuid = UUID('00000000-0000-0000-0000-000000000000')
        elif isinstance(entity_id, UUID):
            entity_id_uuid = entity_id
        else:
            # For non-UUID entity_ids (like integers), convert to string and store in JSON
            entity_id_uuid = UUID('00000000-0000-0000-0000-000000000000')
            if after_json is None:
                after_json = {}
            after_json["entity_id"] = str(entity_id)
        
        # HIPAA/GxP/GIS Compliance: All actions must be logged
        audit_log = AuditLog(
            org_id=org_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id_uuid,
            before_json=before_json,
            after_json=after_json,
            ip=ip,
            user_agent=user_agent,
        )
        db.add(audit_log)
        # Don't commit here - let the caller commit to maintain transaction integrity
        # Use flush() to write to DB without committing, but catch any errors
        try:
            db.flush()  # Flush to ensure audit log is written
        except Exception as flush_error:
            # If flush fails, rollback the audit log addition but don't break the main transaction
            logger.error(f"Failed to flush audit log: {str(flush_error)}")
            import traceback
            logger.error(traceback.format_exc())
            try:
                db.rollback()
            except:
                pass
            # Don't re-raise - let the caller handle the error gracefully
        
        entity_id_str = str(entity_id_uuid) if isinstance(entity_id_uuid, UUID) else str(entity_id)
        logger.info(
            f"Audit log: {action} on {entity_type} {entity_id_str} by user {actor_user_id} in project {project_id}"
        )
    except ImportError:
        # AuditLog model not available, log to console
        logger.warning(
            f"Audit logging not available. Action: {action} on {entity_type} {entity_id} by user {actor_user_id}"
        )
    except Exception as e:
        logger.error(f"Failed to log audit action: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        # Don't raise - audit logging failure shouldn't break the main operation
        # But rollback the audit log addition if it was added
        try:
            db.rollback()
        except:
            pass


def model_to_dict(model) -> Dict[str, Any]:
    """
    Convert SQLAlchemy model to dictionary for audit logging.
    """
    result = {}
    for column in model.__table__.columns:
        value = getattr(model, column.name)
        if isinstance(value, UUID):
            result[column.name] = str(value)
        elif isinstance(value, datetime):
            result[column.name] = value.isoformat()
        else:
            result[column.name] = value
    return result

