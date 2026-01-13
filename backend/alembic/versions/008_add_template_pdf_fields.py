"""Add PDF and checkout fields to templates table.

Revision ID: 008_add_template_pdf_fields
Revises: 007_add_project_folders
Create Date: 2024-01-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '008_add_template_pdf_fields'
down_revision: Union[str, None] = '007_add_project_folders'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add PDF and checkout fields to templates table
    op.add_column('templates', sa.Column('pdf_object_key', sa.String(500), nullable=True))
    op.add_column('templates', sa.Column('pdf_hash', sa.String(64), nullable=True))
    op.add_column('templates', sa.Column('checked_out_by', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('templates', sa.Column('checked_out_at', sa.DateTime(timezone=True), nullable=True))
    
    # Add foreign key constraint for checked_out_by
    op.create_foreign_key(
        'fk_template_checked_out_by',
        'templates', 'users',
        ['checked_out_by'], ['id']
    )


def downgrade() -> None:
    # Remove foreign key constraint
    op.drop_constraint('fk_template_checked_out_by', 'templates', type_='foreignkey')
    
    # Remove columns
    op.drop_column('templates', 'checked_out_at')
    op.drop_column('templates', 'checked_out_by')
    op.drop_column('templates', 'pdf_hash')
    op.drop_column('templates', 'pdf_object_key')

