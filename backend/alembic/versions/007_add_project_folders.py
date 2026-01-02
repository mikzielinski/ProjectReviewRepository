"""add project folders

Revision ID: 007_add_project_folders
Revises: 006_remove_role_fk_tasks
Create Date: 2025-01-01 23:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '007_add_project_folders'
down_revision = '006_remove_role_fk_tasks'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if project_folders table exists
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)
    tables = inspector.get_table_names()
    
    # Create project_folders table only if it doesn't exist
    if 'project_folders' not in tables:
        op.create_table(
            'project_folders',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('org_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('parent_folder_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(['org_id'], ['orgs.id']),
            sa.ForeignKeyConstraint(['parent_folder_id'], ['project_folders.id']),
            sa.ForeignKeyConstraint(['created_by'], ['users.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_project_folders_id', 'project_folders', ['id'], unique=False)
        op.create_index('ix_project_folders_org_id', 'project_folders', ['org_id'], unique=False)
    
    # Check if folder_id column exists in projects table
    projects_columns = [col['name'] for col in inspector.get_columns('projects')]
    
    # Add folder_id to projects table only if it doesn't exist
    if 'folder_id' not in projects_columns:
        op.add_column('projects', sa.Column('folder_id', postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key('projects_folder_id_fkey', 'projects', 'project_folders', ['folder_id'], ['id'])
        op.create_index('ix_projects_folder_id', 'projects', ['folder_id'], unique=False)


def downgrade() -> None:
    # Remove folder_id from projects
    op.drop_index('ix_projects_folder_id', table_name='projects')
    op.drop_constraint('projects_folder_id_fkey', 'projects', type_='foreignkey')
    op.drop_column('projects', 'folder_id')
    
    # Drop project_folders table
    op.drop_index('ix_project_folders_org_id', table_name='project_folders')
    op.drop_index('ix_project_folders_id', table_name='project_folders')
    op.drop_table('project_folders')

