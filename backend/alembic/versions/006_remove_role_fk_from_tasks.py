"""remove role fk from tasks

Revision ID: 006_remove_role_fk_tasks
Revises: 005_update_default_roles
Create Date: 2025-01-01 22:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '006_remove_role_fk_tasks'
down_revision = '005_update_default_roles'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop foreign key constraint from tasks.required_role
    # This allows custom roles from RACI matrix that may not exist in roles table
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    
    # Get all foreign key constraints on tasks table
    fks = inspector.get_foreign_keys('tasks')
    for fk in fks:
        # Check if this FK is for required_role column
        if 'required_role' in fk['constrained_columns']:
            constraint_name = fk['name']
            op.drop_constraint(constraint_name, 'tasks', type_='foreignkey')
            break


def downgrade() -> None:
    # Re-add foreign key constraint (if needed)
    op.create_foreign_key(
        'tasks_required_role_fkey',
        'tasks',
        'roles',
        ['required_role'],
        ['role_code']
    )

