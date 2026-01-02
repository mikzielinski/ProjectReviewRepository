"""remove role fk from project_members

Revision ID: 004_remove_role_fk
Revises: 003_add_task_raci_fields
Create Date: 2025-01-01 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '004_remove_role_fk'
down_revision = '003_add_task_raci_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop foreign key constraint from project_members.role_code
    # This allows custom roles from RACI matrix that may not exist in roles table
    # Find and drop the constraint by querying the database
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    
    # Get all foreign key constraints on project_members table
    fks = inspector.get_foreign_keys('project_members')
    for fk in fks:
        # Check if this FK is for role_code column
        if 'role_code' in fk['constrained_columns']:
            constraint_name = fk['name']
            op.drop_constraint(constraint_name, 'project_members', type_='foreignkey')
            break


def downgrade() -> None:
    # Re-add foreign key constraint (if needed)
    op.create_foreign_key(
        'project_members_role_code_fkey',
        'project_members',
        'roles',
        ['role_code'],
        ['role_code']
    )

