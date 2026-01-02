"""Initial schema with all core tables.

Revision ID: 001_initial
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = '0001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create orgs table
    op.create_table(
        'orgs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # Create users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('org_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('auth_provider', sa.String(50), nullable=False, default='local'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['org_id'], ['orgs.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email')
    )

    # Create roles table
    op.create_table(
        'roles',
        sa.Column('role_code', sa.String(50), nullable=False),
        sa.Column('description', sa.String(255), nullable=False),
        sa.PrimaryKeyConstraint('role_code')
    )

    # Insert default roles
    op.execute("""
        INSERT INTO roles (role_code, description) VALUES
        ('ORG_ADMIN', 'Organization Administrator with full access'),
        ('BUSINESS_OWNER', 'Business Owner responsible for requirements and sign-off'),
        ('ARCHITECT', 'Solution/Technical Architect'),
        ('DEV', 'Developer'),
        ('QA', 'Quality Assurance Engineer'),
        ('PM', 'Project Manager'),
        ('RELEASE_MANAGER', 'Release Manager responsible for deployments'),
        ('SME', 'Subject Matter Expert (temporary access)'),
        ('AUDITOR', 'Auditor with read-only access (temporary)')
    """)

    # Create projects table
    op.create_table(
        'projects',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('org_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('key', sa.String(50), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, default='ACTIVE'),
        sa.Column('retention_policy_json', postgresql.JSONB, nullable=True),
        sa.Column('approval_policies_json', postgresql.JSONB, nullable=True),
        sa.Column('escalation_chain_json', postgresql.JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['org_id'], ['orgs.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('org_id', 'key', name='uq_project_org_key')
    )

    # Create project_members table
    op.create_table(
        'project_members',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('role_code', sa.String(50), nullable=False),
        sa.Column('is_temporary', sa.Boolean(), nullable=False, default=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('invited_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['role_code'], ['roles.role_code']),
        sa.ForeignKeyConstraint(['invited_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_project_member_project_user', 'project_members', ['project_id', 'user_id'])
    op.create_index('ix_project_member_project_role', 'project_members', ['project_id', 'role_code'])
    op.create_index('ix_project_member_expires', 'project_members', ['expires_at'])

    # Create templates table
    op.create_table(
        'templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('org_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('doc_type', sa.String(50), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('version', sa.String(50), nullable=False),
        sa.Column('object_key', sa.String(500), nullable=False),
        sa.Column('file_hash', sa.String(64), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, default='DRAFT'),
        sa.Column('mapping_manifest_json', postgresql.JSONB, nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['org_id'], ['orgs.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )

    # Create pkb_snapshots table (needed before documents)
    op.create_table(
        'pkb_snapshots',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('version_string', sa.String(50), nullable=False),
        sa.Column('source_files_json', postgresql.JSONB, nullable=True),
        sa.Column('extracted_json', postgresql.JSONB, nullable=True),
        sa.Column('hash', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('confirmed_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.ForeignKeyConstraint(['confirmed_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )

    # Create documents table
    op.create_table(
        'documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('doc_type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('current_version_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )

    # Create document_versions table
    op.create_table(
        'document_versions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('version_string', sa.String(50), nullable=False),
        sa.Column('state', sa.String(20), nullable=False, default='DRAFT'),
        sa.Column('template_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('content_json', postgresql.JSONB, nullable=True),
        sa.Column('pkb_snapshot_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('file_object_key', sa.String(500), nullable=True),
        sa.Column('file_hash', sa.String(64), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('locked_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id']),
        sa.ForeignKeyConstraint(['template_id'], ['templates.id']),
        sa.ForeignKeyConstraint(['pkb_snapshot_id'], ['pkb_snapshots.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_docver_document_version', 'document_versions', ['document_id', 'version_string'])
    op.create_index('ix_docver_document_state', 'document_versions', ['document_id', 'state'])

    # Add FK from documents to document_versions
    op.create_foreign_key(
        'fk_document_current_version',
        'documents', 'document_versions',
        ['current_version_id'], ['id']
    )

    # Create approvals table
    op.create_table(
        'approvals',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('document_version_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('step_no', sa.Integer(), nullable=False),
        sa.Column('role_required', sa.String(50), nullable=False),
        sa.Column('approver_user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, default='PENDING'),
        sa.Column('comment', sa.String(2000), nullable=True),
        sa.Column('signed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('evidence_hash', sa.String(64), nullable=True),
        sa.ForeignKeyConstraint(['document_version_id'], ['document_versions.id']),
        sa.ForeignKeyConstraint(['role_required'], ['roles.role_code']),
        sa.ForeignKeyConstraint(['approver_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_approval_docver', 'approvals', ['document_version_id'])
    op.create_index('ix_approval_status', 'approvals', ['status'])

    # Create review_comments table
    op.create_table(
        'review_comments',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('document_version_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('comment', sa.String(5000), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['document_version_id'], ['document_versions.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )

    # Create gates table
    op.create_table(
        'gates',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('gate_type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, default='OPEN'),
        sa.Column('required_docs_json', postgresql.JSONB, nullable=True),
        sa.Column('required_tasks_json', postgresql.JSONB, nullable=True),
        sa.Column('required_approvals_json', postgresql.JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.PrimaryKeyConstraint('id')
    )

    # Create tasks table
    op.create_table(
        'tasks',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('task_type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', sa.String(5000), nullable=True),
        sa.Column('related_document_version_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('related_gate_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('assigned_to_user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('required_role', sa.String(50), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, default='OPEN'),
        sa.Column('priority', sa.String(20), nullable=False, default='MEDIUM'),
        sa.Column('due_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verified_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('is_blocking', sa.Boolean(), nullable=False, default=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.ForeignKeyConstraint(['related_document_version_id'], ['document_versions.id']),
        sa.ForeignKeyConstraint(['related_gate_id'], ['gates.id']),
        sa.ForeignKeyConstraint(['assigned_to_user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['required_role'], ['roles.role_code']),
        sa.ForeignKeyConstraint(['verified_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_task_project_status', 'tasks', ['project_id', 'status'])
    op.create_index('ix_task_assigned_status', 'tasks', ['assigned_to_user_id', 'status'])
    op.create_index('ix_task_due', 'tasks', ['due_at'])
    op.create_index('ix_task_blocking', 'tasks', ['is_blocking'])

    # Create reminders table
    op.create_table(
        'reminders',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('rule_code', sa.String(50), nullable=False),
        sa.Column('next_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, default='ACTIVE'),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_reminder_next_run', 'reminders', ['next_run_at'])
    op.create_index('ix_reminder_status', 'reminders', ['status'])

    # Create escalations table
    op.create_table(
        'escalations',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('level', sa.Integer(), nullable=False),
        sa.Column('escalated_to_role', sa.String(50), nullable=False),
        sa.Column('escalated_to_user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('triggered_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('reason', sa.String(1000), nullable=False),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id']),
        sa.ForeignKeyConstraint(['escalated_to_role'], ['roles.role_code']),
        sa.ForeignKeyConstraint(['escalated_to_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )

    # Create gantt_items table
    op.create_table(
        'gantt_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('item_type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('owner_role', sa.String(50), nullable=True),
        sa.Column('related_task_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('related_document_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('related_document_version_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('related_gate_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('start_planned', sa.Date(), nullable=True),
        sa.Column('end_planned', sa.Date(), nullable=True),
        sa.Column('start_actual', sa.DateTime(timezone=True), nullable=True),
        sa.Column('end_actual', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, default='DRAFT'),
        sa.Column('dependencies_json', postgresql.JSONB, nullable=True),
        sa.Column('is_blocking', sa.Boolean(), nullable=False, default=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.ForeignKeyConstraint(['owner_role'], ['roles.role_code']),
        sa.ForeignKeyConstraint(['related_task_id'], ['tasks.id']),
        sa.ForeignKeyConstraint(['related_document_id'], ['documents.id']),
        sa.ForeignKeyConstraint(['related_document_version_id'], ['document_versions.id']),
        sa.ForeignKeyConstraint(['related_gate_id'], ['gates.id']),
        sa.PrimaryKeyConstraint('id')
    )

    # Create evidence table
    op.create_table(
        'evidence',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('evidence_type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('object_key', sa.String(500), nullable=False),
        sa.Column('file_hash', sa.String(64), nullable=False),
        sa.Column('linked_to_type', sa.String(50), nullable=False),
        sa.Column('linked_to_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )

    # Create ai_runs table
    op.create_table(
        'ai_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('run_type', sa.String(50), nullable=False),
        sa.Column('model', sa.String(100), nullable=False),
        sa.Column('temperature', sa.Float(), nullable=False),
        sa.Column('prompt_version', sa.String(50), nullable=False),
        sa.Column('input_hash', sa.String(64), nullable=False),
        sa.Column('output_hash', sa.String(64), nullable=False),
        sa.Column('related_entity_type', sa.String(50), nullable=True),
        sa.Column('related_entity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('raw_request_json', postgresql.JSONB, nullable=True),
        sa.Column('raw_response_json', postgresql.JSONB, nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )

    # Create audit_log table
    op.create_table(
        'audit_log',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('org_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('actor_user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('entity_type', sa.String(100), nullable=False),
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('before_json', postgresql.JSONB, nullable=True),
        sa.Column('after_json', postgresql.JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('ip', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.ForeignKeyConstraint(['org_id'], ['orgs.id']),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.ForeignKeyConstraint(['actor_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_audit_project_created', 'audit_log', ['project_id', 'created_at'])
    op.create_index('ix_audit_actor_created', 'audit_log', ['actor_user_id', 'created_at'])


def downgrade() -> None:
    op.drop_table('audit_log')
    op.drop_table('ai_runs')
    op.drop_table('evidence')
    op.drop_table('gantt_items')
    op.drop_table('escalations')
    op.drop_table('reminders')
    op.drop_table('tasks')
    op.drop_table('gates')
    op.drop_table('review_comments')
    op.drop_table('approvals')
    op.drop_constraint('fk_document_current_version', 'documents', type_='foreignkey')
    op.drop_table('document_versions')
    op.drop_table('documents')
    op.drop_table('pkb_snapshots')
    op.drop_table('templates')
    op.drop_table('project_members')
    op.drop_table('projects')
    op.drop_table('roles')
    op.drop_table('users')
    op.drop_table('orgs')

