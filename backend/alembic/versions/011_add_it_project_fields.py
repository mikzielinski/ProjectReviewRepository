"""Add IT project profile fields to projects."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "011_it_project_fields"
down_revision: Union[str, None] = "010_add_document_types"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("projects", sa.Column("project_type", sa.String(length=32), server_default="IT", nullable=False))
    op.add_column("projects", sa.Column("compliance_settings_json", postgresql.JSONB(), nullable=True))
    op.add_column("projects", sa.Column("required_document_types_json", postgresql.JSONB(), nullable=True))
    op.add_column("projects", sa.Column("enable_4_eyes_principal", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("projects", sa.Column("tech_stack_json", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "tech_stack_json")
    op.drop_column("projects", "enable_4_eyes_principal")
    op.drop_column("projects", "required_document_types_json")
    op.drop_column("projects", "compliance_settings_json")
    op.drop_column("projects", "project_type")
    op.drop_column("projects", "description")
