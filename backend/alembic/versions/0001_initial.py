"""initial schema"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "orgs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_orgs_id"), "orgs", ["id"], unique=False)

    op.create_table(
        "roles",
        sa.Column("role_code", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("role_code"),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("auth_provider", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)

    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("retention_policy_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", "key", name="uq_project_org_key"),
    )
    op.create_index(op.f("ix_projects_id"), "projects", ["id"], unique=False)

    op.create_table(
        "templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("doc_type", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("version", sa.String(), nullable=False),
        sa.Column("object_key", sa.String(), nullable=False),
        sa.Column("file_hash", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("mapping_manifest_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_templates_id"), "templates", ["id"], unique=False)

    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("doc_type", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("current_version_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_documents_id"), "documents", ["id"], unique=False)

    op.create_table(
        "project_members",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role_code", sa.String(), nullable=False),
        sa.Column("is_temporary", sa.Boolean(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("invited_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["invited_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["role_code"], ["roles.role_code"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_project_member_project_role", "project_members", ["project_id", "role_code"], unique=False
    )
    op.create_index(
        "ix_project_member_project_user", "project_members", ["project_id", "user_id"], unique=True
    )
    op.create_index("ix_project_member_expires_at", "project_members", ["expires_at"], unique=False)
    op.create_index(op.f("ix_project_members_id"), "project_members", ["id"], unique=False)

    op.create_table(
        "pkb_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("version_string", sa.String(), nullable=False),
        sa.Column("source_files_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("extracted_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("hash", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("confirmed_by", sa.Integer(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["confirmed_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_pkb_snapshots_id"), "pkb_snapshots", ["id"], unique=False)

    op.create_table(
        "document_versions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("version_string", sa.String(), nullable=False),
        sa.Column("state", sa.String(), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.Column("content_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("pkb_snapshot_id", sa.Integer(), nullable=True),
        sa.Column("file_object_key", sa.String(), nullable=True),
        sa.Column("file_hash", sa.String(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("locked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"]),
        sa.ForeignKeyConstraint(["pkb_snapshot_id"], ["pkb_snapshots.id"]),
        sa.ForeignKeyConstraint(["template_id"], ["templates.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_doc_version_document_state", "document_versions", ["document_id", "state"], unique=False
    )
    op.create_index(
        "ix_doc_version_document_version",
        "document_versions",
        ["document_id", "version_string"],
        unique=False,
    )
    op.create_index(op.f("ix_document_versions_id"), "document_versions", ["id"], unique=False)

    op.create_table(
        "approvals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_version_id", sa.Integer(), nullable=False),
        sa.Column("step_no", sa.Integer(), nullable=False),
        sa.Column("role_required", sa.String(), nullable=False),
        sa.Column("approver_user_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("signed_at", sa.DateTime(), nullable=True),
        sa.Column("evidence_hash", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["approver_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["document_version_id"], ["document_versions.id"]),
        sa.ForeignKeyConstraint(["role_required"], ["roles.role_code"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_approval_doc_version", "approvals", ["document_version_id"], unique=False)
    op.create_index(op.f("ix_approvals_id"), "approvals", ["id"], unique=False)

    op.create_table(
        "review_comments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_version_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["document_version_id"], ["document_versions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_review_comments_id"), "review_comments", ["id"], unique=False)

    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("task_type", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("related_document_version_id", sa.Integer(), nullable=True),
        sa.Column("related_gate_id", sa.Integer(), nullable=True),
        sa.Column("assigned_to_user_id", sa.Integer(), nullable=True),
        sa.Column("required_role", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("priority", sa.String(), nullable=False),
        sa.Column("due_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("verified_by", sa.Integer(), nullable=True),
        sa.Column("is_blocking", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["related_document_version_id"], ["document_versions.id"]),
        sa.ForeignKeyConstraint(["required_role"], ["roles.role_code"]),
        sa.ForeignKeyConstraint(["verified_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_assigned_status", "tasks", ["assigned_to_user_id", "status"], unique=False)
    op.create_index("ix_task_due_at", "tasks", ["due_at"], unique=False)
    op.create_index("ix_task_is_blocking", "tasks", ["is_blocking"], unique=False)
    op.create_index("ix_task_project_status", "tasks", ["project_id", "status"], unique=False)
    op.create_index(op.f("ix_tasks_id"), "tasks", ["id"], unique=False)

    op.create_table(
        "reminders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("rule_code", sa.String(), nullable=False),
        sa.Column("next_run_at", sa.DateTime(), nullable=False),
        sa.Column("last_sent_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reminder_next_run_at", "reminders", ["next_run_at"], unique=False)
    op.create_index("ix_reminder_status", "reminders", ["status"], unique=False)
    op.create_index(op.f("ix_reminders_id"), "reminders", ["id"], unique=False)

    op.create_table(
        "escalations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("escalated_to_role", sa.String(), nullable=False),
        sa.Column("escalated_to_user_id", sa.Integer(), nullable=True),
        sa.Column("triggered_at", sa.DateTime(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["escalated_to_role"], ["roles.role_code"]),
        sa.ForeignKeyConstraint(["escalated_to_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_escalations_id"), "escalations", ["id"], unique=False)

    op.create_table(
        "gates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("gate_type", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("required_docs_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("required_tasks_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("required_approvals_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_gates_id"), "gates", ["id"], unique=False)

    op.create_table(
        "gantt_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("item_type", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("owner_role", sa.String(), nullable=True),
        sa.Column("related_task_id", sa.Integer(), nullable=True),
        sa.Column("related_document_id", sa.Integer(), nullable=True),
        sa.Column("related_document_version_id", sa.Integer(), nullable=True),
        sa.Column("related_gate_id", sa.Integer(), nullable=True),
        sa.Column("start_planned", sa.Date(), nullable=True),
        sa.Column("end_planned", sa.Date(), nullable=True),
        sa.Column("start_actual", sa.DateTime(), nullable=True),
        sa.Column("end_actual", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("dependencies_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_blocking", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["owner_role"], ["roles.role_code"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["related_document_id"], ["documents.id"]),
        sa.ForeignKeyConstraint(["related_document_version_id"], ["document_versions.id"]),
        sa.ForeignKeyConstraint(["related_gate_id"], ["gates.id"]),
        sa.ForeignKeyConstraint(["related_task_id"], ["tasks.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_gantt_items_id"), "gantt_items", ["id"], unique=False)

    op.create_table(
        "evidence",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("evidence_type", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("object_key", sa.String(), nullable=False),
        sa.Column("file_hash", sa.String(), nullable=False),
        sa.Column("linked_to_type", sa.String(), nullable=False),
        sa.Column("linked_to_id", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_evidence_id"), "evidence", ["id"], unique=False)

    op.create_table(
        "ai_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("run_type", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("temperature", sa.String(), nullable=False),
        sa.Column("prompt_version", sa.String(), nullable=True),
        sa.Column("input_hash", sa.String(), nullable=False),
        sa.Column("output_hash", sa.String(), nullable=False),
        sa.Column("related_entity_type", sa.String(), nullable=True),
        sa.Column("related_entity_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("raw_request_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("raw_response_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ai_runs_id"), "ai_runs", ["id"], unique=False)

    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("actor_user_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("before_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("ip", sa.String(), nullable=True),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_actor_created", "audit_log", ["actor_user_id", "created_at"], unique=False)
    op.create_index("ix_audit_project_created", "audit_log", ["project_id", "created_at"], unique=False)
    op.create_index(op.f("ix_audit_log_id"), "audit_log", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_log_id"), table_name="audit_log")
    op.drop_index("ix_audit_project_created", table_name="audit_log")
    op.drop_index("ix_audit_actor_created", table_name="audit_log")
    op.drop_table("audit_log")
    op.drop_index(op.f("ix_ai_runs_id"), table_name="ai_runs")
    op.drop_table("ai_runs")
    op.drop_index(op.f("ix_evidence_id"), table_name="evidence")
    op.drop_table("evidence")
    op.drop_index(op.f("ix_gantt_items_id"), table_name="gantt_items")
    op.drop_table("gantt_items")
    op.drop_index(op.f("ix_gates_id"), table_name="gates")
    op.drop_table("gates")
    op.drop_index(op.f("ix_escalations_id"), table_name="escalations")
    op.drop_table("escalations")
    op.drop_index(op.f("ix_reminders_id"), table_name="reminders")
    op.drop_index("ix_reminder_status", table_name="reminders")
    op.drop_index("ix_reminder_next_run_at", table_name="reminders")
    op.drop_table("reminders")
    op.drop_index(op.f("ix_tasks_id"), table_name="tasks")
    op.drop_index("ix_task_project_status", table_name="tasks")
    op.drop_index("ix_task_is_blocking", table_name="tasks")
    op.drop_index("ix_task_due_at", table_name="tasks")
    op.drop_index("ix_task_assigned_status", table_name="tasks")
    op.drop_table("tasks")
    op.drop_index(op.f("ix_review_comments_id"), table_name="review_comments")
    op.drop_table("review_comments")
    op.drop_index(op.f("ix_approvals_id"), table_name="approvals")
    op.drop_index("ix_approval_doc_version", table_name="approvals")
    op.drop_table("approvals")
    op.drop_index(op.f("ix_document_versions_id"), table_name="document_versions")
    op.drop_index("ix_doc_version_document_version", table_name="document_versions")
    op.drop_index("ix_doc_version_document_state", table_name="document_versions")
    op.drop_table("document_versions")
    op.drop_index(op.f("ix_pkb_snapshots_id"), table_name="pkb_snapshots")
    op.drop_table("pkb_snapshots")
    op.drop_index(op.f("ix_project_members_id"), table_name="project_members")
    op.drop_index("ix_project_member_expires_at", table_name="project_members")
    op.drop_index("ix_project_member_project_user", table_name="project_members")
    op.drop_index("ix_project_member_project_role", table_name="project_members")
    op.drop_table("project_members")
    op.drop_index(op.f("ix_documents_id"), table_name="documents")
    op.drop_table("documents")
    op.drop_index(op.f("ix_templates_id"), table_name="templates")
    op.drop_table("templates")
    op.drop_index(op.f("ix_projects_id"), table_name="projects")
    op.drop_table("projects")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    op.drop_table("roles")
    op.drop_index(op.f("ix_orgs_id"), table_name="orgs")
    op.drop_table("orgs")

