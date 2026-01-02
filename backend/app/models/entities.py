from datetime import datetime

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Boolean,
    UniqueConstraint,
    Index,
    JSON,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PostgresUUID
import uuid
from sqlalchemy.orm import relationship

from app.core.enums import (
    RoleCode,
    TemplateStatus,
    DocumentState,
    ApprovalStatus,
    TaskStatus,
    ReminderStatus,
    GateStatus,
    GateType,
    GanttItemType,
    GanttItemStatus,
    EvidenceType,
    LinkedToType,
)
from app.db import Base


def utcnow():
    return datetime.utcnow()


class Org(Base):
    __tablename__ = "orgs"

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class User(Base):
    __tablename__ = "users"

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    auth_provider = Column(String, default="local", nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class Role(Base):
    __tablename__ = "roles"

    role_code = Column(String, primary_key=True)
    description = Column(String, nullable=False)


class ProjectFolder(Base):
    __tablename__ = "project_folders"

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    org_id = Column(PostgresUUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False)
    name = Column(String, nullable=False)
    parent_folder_id = Column(PostgresUUID(as_uuid=True), ForeignKey("project_folders.id"), nullable=True)
    created_by = Column(PostgresUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("org_id", "name", "parent_folder_id", name="uq_folder_org_name_parent"),)

    org = relationship("Org")
    parent_folder = relationship("ProjectFolder", remote_side=[id], backref="subfolders")
    creator = relationship("User")


class Project(Base):
    __tablename__ = "projects"

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    org_id = Column(PostgresUUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False)
    folder_id = Column(PostgresUUID(as_uuid=True), ForeignKey("project_folders.id"), nullable=True)
    key = Column(String, nullable=False)
    name = Column(String, nullable=False)
    status = Column(String, default="ACTIVE", nullable=False)
    retention_policy_json = Column(JSONB, nullable=True)
    raci_matrix_json = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("org_id", "key", name="uq_project_org_key"),)

    org = relationship("Org")
    folder = relationship("ProjectFolder")


class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(PostgresUUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    user_id = Column(PostgresUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    role_code = Column(String, nullable=False)  # Removed ForeignKey to allow custom roles from RACI
    is_temporary = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    invited_by = Column(PostgresUUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (
        Index("ix_project_member_project_user", "project_id", "user_id", unique=True),
        Index("ix_project_member_project_role", "project_id", "role_code"),
        Index("ix_project_member_expires_at", "expires_at"),
    )

    project = relationship("Project")
    user = relationship("User", foreign_keys=[user_id])
    inviter = relationship("User", foreign_keys=[invited_by])


class Template(Base):
    __tablename__ = "templates"

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    org_id = Column(PostgresUUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False)
    doc_type = Column(String, nullable=False)
    name = Column(String, nullable=False)
    version = Column(String, default="v1", nullable=False)
    object_key = Column(String, nullable=False)
    file_hash = Column(String, nullable=False)
    status = Column(String, default=TemplateStatus.DRAFT.value, nullable=False)
    mapping_manifest_json = Column(JSONB, nullable=False)
    created_by = Column(PostgresUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class Document(Base):
    __tablename__ = "documents"

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(PostgresUUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    doc_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    current_version_id = Column(PostgresUUID(as_uuid=True), ForeignKey("document_versions.id"), nullable=True)
    created_by = Column(PostgresUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    project = relationship("Project")
    creator = relationship("User")


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    document_id = Column(PostgresUUID(as_uuid=True), ForeignKey("documents.id"), nullable=False)
    version_string = Column(String, nullable=False)
    state = Column(String, default=DocumentState.DRAFT.value, nullable=False)
    template_id = Column(PostgresUUID(as_uuid=True), ForeignKey("templates.id"), nullable=True)
    content_json = Column(JSONB, nullable=True)
    pkb_snapshot_id = Column(PostgresUUID(as_uuid=True), ForeignKey("pkb_snapshots.id"), nullable=True)
    file_object_key = Column(String, nullable=True)
    file_hash = Column(String, nullable=True)
    created_by = Column(PostgresUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    submitted_at = Column(DateTime, nullable=True)
    locked_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_doc_version_document_state", "document_id", "state"),
        Index("ix_doc_version_document_version", "document_id", "version_string"),
    )

    document = relationship("Document", foreign_keys=[document_id], backref="versions")


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(Integer, primary_key=True, index=True)
    document_version_id = Column(Integer, ForeignKey("document_versions.id"), nullable=False)
    step_no = Column(Integer, nullable=False)
    role_required = Column(String, ForeignKey("roles.role_code"), nullable=False)
    approver_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default=ApprovalStatus.PENDING.value, nullable=False)
    comment = Column(Text, nullable=True)
    signed_at = Column(DateTime, nullable=True)
    evidence_hash = Column(String, nullable=True)

    __table_args__ = (Index("ix_approval_doc_version", "document_version_id"),)


class ReviewComment(Base):
    __tablename__ = "review_comments"

    id = Column(Integer, primary_key=True, index=True)
    document_version_id = Column(Integer, ForeignKey("document_versions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    comment = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(PostgresUUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    task_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    # RACI-related fields
    raci_stage = Column(String, nullable=True)  # Stage from RACI matrix
    raci_task_name = Column(String, nullable=True)  # Task name from RACI matrix
    # Assignment and review
    assigned_to_user_id = Column(PostgresUUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewer_id = Column(PostgresUUID(as_uuid=True), ForeignKey("users.id"), nullable=True)  # Person who reviews/verifies
    required_role = Column(String, nullable=True)
    # Time tracking
    estimated_time_hours = Column(Integer, nullable=True)  # Estimated time in hours
    actual_time_hours = Column(Integer, nullable=True)  # Actual time spent
    # Status and dates
    status = Column(String, default=TaskStatus.OPEN.value, nullable=False)
    priority = Column(String, default="NORMAL", nullable=False)
    due_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    verified_by = Column(PostgresUUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    # Relations
    related_document_version_id = Column(PostgresUUID(as_uuid=True), ForeignKey("document_versions.id"), nullable=True)
    related_gate_id = Column(PostgresUUID(as_uuid=True), ForeignKey("gates.id"), nullable=True)
    is_blocking = Column(Boolean, default=False, nullable=False)

    __table_args__ = (
        Index("ix_task_project_status", "project_id", "status"),
        Index("ix_task_assigned_status", "assigned_to_user_id", "status"),
        Index("ix_task_due_at", "due_at"),
        Index("ix_task_is_blocking", "is_blocking"),
    )


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    rule_code = Column(String, nullable=False)
    next_run_at = Column(DateTime, nullable=False)
    last_sent_at = Column(DateTime, nullable=True)
    status = Column(String, default=ReminderStatus.ACTIVE.value, nullable=False)

    __table_args__ = (
        Index("ix_reminder_next_run_at", "next_run_at"),
        Index("ix_reminder_status", "status"),
    )


class Escalation(Base):
    __tablename__ = "escalations"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    level = Column(Integer, nullable=False)
    escalated_to_role = Column(String, ForeignKey("roles.role_code"), nullable=False)
    escalated_to_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    triggered_at = Column(DateTime, default=utcnow, nullable=False)
    reason = Column(Text, nullable=True)


class Gate(Base):
    __tablename__ = "gates"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    gate_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    status = Column(String, default=GateStatus.OPEN.value, nullable=False)
    required_docs_json = Column(JSONB, nullable=True)
    required_tasks_json = Column(JSONB, nullable=True)
    required_approvals_json = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    closed_at = Column(DateTime, nullable=True)


class GanttItem(Base):
    __tablename__ = "gantt_items"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    item_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    owner_role = Column(String, ForeignKey("roles.role_code"), nullable=True)
    related_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    related_document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    related_document_version_id = Column(Integer, ForeignKey("document_versions.id"), nullable=True)
    related_gate_id = Column(Integer, ForeignKey("gates.id"), nullable=True)
    start_planned = Column(Date, nullable=True)
    end_planned = Column(Date, nullable=True)
    start_actual = Column(DateTime, nullable=True)
    end_actual = Column(DateTime, nullable=True)
    status = Column(String, default=GanttItemStatus.DRAFT.value, nullable=False)
    dependencies_json = Column(JSONB, nullable=True)
    is_blocking = Column(Boolean, default=False, nullable=False)


class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    evidence_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    object_key = Column(String, nullable=False)
    file_hash = Column(String, nullable=False)
    linked_to_type = Column(String, nullable=False)
    linked_to_id = Column(Integer, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class PKBSnapshot(Base):
    __tablename__ = "pkb_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    version_string = Column(String, nullable=False)
    source_files_json = Column(JSONB, nullable=True)
    extracted_json = Column(JSONB, nullable=True)
    hash = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    confirmed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    confirmed_at = Column(DateTime, nullable=True)


class AIRun(Base):
    __tablename__ = "ai_runs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    run_type = Column(String, nullable=False)
    model = Column(String, nullable=False)
    temperature = Column(String, nullable=False)
    prompt_version = Column(String, nullable=True)
    input_hash = Column(String, nullable=False)
    output_hash = Column(String, nullable=False)
    related_entity_type = Column(String, nullable=True)
    related_entity_id = Column(Integer, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    raw_request_json = Column(JSONB, nullable=True)
    raw_response_json = Column(JSONB, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    org_id = Column(PostgresUUID(as_uuid=True), ForeignKey("orgs.id"), nullable=True)
    project_id = Column(PostgresUUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    actor_user_id = Column(PostgresUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(PostgresUUID(as_uuid=True), nullable=False)
    before_json = Column(JSONB, nullable=True)
    after_json = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)

    # Relationships
    actor = relationship("User", foreign_keys=[actor_user_id], backref="audit_logs")

    __table_args__ = (
        Index("ix_audit_project_created", "project_id", "created_at"),
        Index("ix_audit_actor_created", "actor_user_id", "created_at"),
    )

