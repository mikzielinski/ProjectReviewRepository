"""add task raci fields

Revision ID: 003_add_task_raci_fields
Revises: 002_add_raci_matrix
Create Date: 2025-01-01 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '003_add_task_raci_fields'
down_revision = '002_add_raci_matrix'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add RACI-related fields to tasks table
    op.add_column('tasks', sa.Column('raci_stage', sa.String(), nullable=True))
    op.add_column('tasks', sa.Column('raci_task_name', sa.String(), nullable=True))
    
    # Add reviewer field
    op.add_column('tasks', sa.Column('reviewer_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_task_reviewer', 'tasks', 'users', ['reviewer_id'], ['id'])
    
    # Add time tracking fields
    op.add_column('tasks', sa.Column('estimated_time_hours', sa.Integer(), nullable=True))
    op.add_column('tasks', sa.Column('actual_time_hours', sa.Integer(), nullable=True))


def downgrade() -> None:
    # Remove time tracking fields
    op.drop_column('tasks', 'actual_time_hours')
    op.drop_column('tasks', 'estimated_time_hours')
    
    # Remove reviewer field
    op.drop_constraint('fk_task_reviewer', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'reviewer_id')
    
    # Remove RACI-related fields
    op.drop_column('tasks', 'raci_task_name')
    op.drop_column('tasks', 'raci_stage')

