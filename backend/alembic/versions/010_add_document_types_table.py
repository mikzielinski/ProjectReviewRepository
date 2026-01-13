"""add_document_types_table

Revision ID: 010_add_document_types
Revises: 009_docver_pdf
Create Date: 2026-01-04 03:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '010_add_document_types'
down_revision: Union[str, None] = '009_docver_pdf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create document_types table
    op.create_table(
        'document_types',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('org_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('code', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('default_file_extension', sa.String(), nullable=False, server_default='docx'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['org_id'], ['orgs.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    )
    
    # Create indexes
    op.create_index('ix_document_type_code', 'document_types', ['code'], unique=True)
    op.create_index('ix_document_type_org_code', 'document_types', ['org_id', 'code'], unique=False)


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_document_type_org_code', table_name='document_types')
    op.drop_index('ix_document_type_code', table_name='document_types')
    
    # Drop table
    op.drop_table('document_types')

