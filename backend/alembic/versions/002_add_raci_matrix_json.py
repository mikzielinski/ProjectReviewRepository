"""add raci_matrix_json to projects

Revision ID: 002_add_raci_matrix
Revises: 001_initial_schema
Create Date: 2025-01-01 19:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002_add_raci_matrix'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('raci_matrix_json', postgresql.JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'raci_matrix_json')

