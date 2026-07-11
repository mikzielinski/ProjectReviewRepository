"""Add framework ownership columns for admin and framework owner roles."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "013_framework_ownership"
down_revision: Union[str, None] = "012_compliance_controls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "compliance_frameworks",
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "compliance_frameworks",
        sa.Column("owner_email", sa.String(), nullable=True),
    )
    op.add_column(
        "compliance_frameworks",
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_foreign_key(
        "fk_compliance_frameworks_owner_user",
        "compliance_frameworks",
        "users",
        ["owner_user_id"],
        ["id"],
    )
    op.create_index(
        "ix_compliance_frameworks_owner_user_id",
        "compliance_frameworks",
        ["owner_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_compliance_frameworks_owner_user_id", table_name="compliance_frameworks")
    op.drop_constraint("fk_compliance_frameworks_owner_user", "compliance_frameworks", type_="foreignkey")
    op.drop_column("compliance_frameworks", "is_system")
    op.drop_column("compliance_frameworks", "owner_email")
    op.drop_column("compliance_frameworks", "owner_user_id")
