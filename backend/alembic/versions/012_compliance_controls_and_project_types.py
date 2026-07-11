"""Add project categories, type definitions, and compliance controls library."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "012_compliance_controls"
down_revision: Union[str, None] = "011_it_project_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_type_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(32), nullable=False, server_default="DEVELOPMENT"),
        sa.Column("default_compliance_settings_json", postgresql.JSONB(), nullable=True),
        sa.Column("default_required_document_types_json", postgresql.JSONB(), nullable=True),
        sa.Column("default_template_doc_types_json", postgresql.JSONB(), nullable=True),
        sa.Column("default_control_framework_codes_json", postgresql.JSONB(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.UniqueConstraint("org_id", "code", name="uq_project_type_def_org_code"),
    )
    op.create_index("ix_project_type_def_code", "project_type_definitions", ["code"])

    op.add_column("projects", sa.Column("project_category", sa.String(32), server_default="DEVELOPMENT", nullable=False))
    op.add_column("projects", sa.Column("project_type_definition_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_projects_type_definition",
        "projects",
        "project_type_definitions",
        ["project_type_definition_id"],
        ["id"],
    )

    op.create_table(
        "compliance_frameworks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("version", sa.String(32), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_url", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_compliance_framework_code", "compliance_frameworks", ["code"], unique=True)

    op.create_table(
        "compliance_controls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("framework_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("parent_control_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("control_ref", sa.String(64), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("domain", sa.String(128), nullable=True),
        sa.Column("control_type", sa.String(32), nullable=True),
        sa.Column("testing_frequency_days", sa.Integer(), nullable=True),
        sa.Column("evidence_requirements_json", postgresql.JSONB(), nullable=True),
        sa.Column("mapped_document_types_json", postgresql.JSONB(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["framework_id"], ["compliance_frameworks.id"]),
        sa.ForeignKeyConstraint(["parent_control_id"], ["compliance_controls.id"]),
        sa.UniqueConstraint("framework_id", "control_ref", name="uq_framework_control_ref"),
    )
    op.create_index("ix_control_framework_domain", "compliance_controls", ["framework_id", "domain"])

    op.create_table(
        "project_control_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("control_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("control_owner_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("assignee_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="NOT_STARTED"),
        sa.Column("is_applicable", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("implementation_notes", sa.Text(), nullable=True),
        sa.Column("evidence_links_json", postgresql.JSONB(), nullable=True),
        sa.Column("review_frequency_days", sa.Integer(), nullable=True),
        sa.Column("next_review_at", sa.DateTime(), nullable=True),
        sa.Column("last_tested_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["control_id"], ["compliance_controls.id"]),
        sa.ForeignKeyConstraint(["control_owner_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["assignee_user_id"], ["users.id"]),
        sa.UniqueConstraint("project_id", "control_id", name="uq_project_control"),
    )
    op.create_index("ix_project_control_next_review", "project_control_assignments", ["project_id", "next_review_at"])

    op.execute("UPDATE projects SET project_category = 'COMPLIANCE' WHERE key LIKE 'DEMO-%'")


def downgrade() -> None:
    op.drop_index("ix_project_control_next_review", table_name="project_control_assignments")
    op.drop_table("project_control_assignments")
    op.drop_index("ix_control_framework_domain", table_name="compliance_controls")
    op.drop_table("compliance_controls")
    op.drop_index("ix_compliance_framework_code", table_name="compliance_frameworks")
    op.drop_table("compliance_frameworks")
    op.drop_constraint("fk_projects_type_definition", "projects", type_="foreignkey")
    op.drop_column("projects", "project_type_definition_id")
    op.drop_column("projects", "project_category")
    op.drop_index("ix_project_type_def_code", table_name="project_type_definitions")
    op.drop_table("project_type_definitions")
