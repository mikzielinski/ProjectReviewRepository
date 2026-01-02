"""update default roles

Revision ID: 005_update_default_roles
Revises: 004_remove_role_fk
Create Date: 2025-01-01 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '005_update_default_roles'
down_revision = '004_remove_role_fk'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # First, update all foreign key references in other tables
    # Update project_members
    op.execute("UPDATE project_members SET role_code = 'QA Officer' WHERE role_code = 'QA'")
    op.execute("UPDATE project_members SET role_code = 'Auditor' WHERE role_code = 'AUDITOR'")
    op.execute("UPDATE project_members SET role_code = 'Architect' WHERE role_code = 'ARCHITECT'")
    op.execute("UPDATE project_members SET role_code = 'Business Owner' WHERE role_code = 'BUSINESS_OWNER'")
    op.execute("UPDATE project_members SET role_code = 'Release Manager' WHERE role_code = 'RELEASE_MANAGER'")
    
    # Update approvals table if it exists and has role_required column
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approvals' AND column_name = 'role_required') THEN
                UPDATE approvals SET role_required = 'Architect' WHERE role_required = 'ARCHITECT';
                UPDATE approvals SET role_required = 'Business Owner' WHERE role_required = 'BUSINESS_OWNER';
                UPDATE approvals SET role_required = 'QA Officer' WHERE role_required = 'QA';
                UPDATE approvals SET role_required = 'Release Manager' WHERE role_required = 'RELEASE_MANAGER';
                UPDATE approvals SET role_required = 'Auditor' WHERE role_required = 'AUDITOR';
            END IF;
        END $$;
    """)
    
    # Update tasks table if it exists and has required_role column
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'required_role') THEN
                UPDATE tasks SET required_role = 'Architect' WHERE required_role = 'ARCHITECT';
                UPDATE tasks SET required_role = 'Business Owner' WHERE required_role = 'BUSINESS_OWNER';
                UPDATE tasks SET required_role = 'QA Officer' WHERE required_role = 'QA';
                UPDATE tasks SET required_role = 'Release Manager' WHERE required_role = 'RELEASE_MANAGER';
                UPDATE tasks SET required_role = 'Auditor' WHERE required_role = 'AUDITOR';
            END IF;
        END $$;
    """)
    
    # Update escalations table if it exists and has escalated_to_role column
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'escalations' AND column_name = 'escalated_to_role') THEN
                UPDATE escalations SET escalated_to_role = 'Architect' WHERE escalated_to_role = 'ARCHITECT';
                UPDATE escalations SET escalated_to_role = 'Business Owner' WHERE escalated_to_role = 'BUSINESS_OWNER';
                UPDATE escalations SET escalated_to_role = 'QA Officer' WHERE escalated_to_role = 'QA';
                UPDATE escalations SET escalated_to_role = 'Release Manager' WHERE escalated_to_role = 'RELEASE_MANAGER';
                UPDATE escalations SET escalated_to_role = 'Auditor' WHERE escalated_to_role = 'AUDITOR';
            END IF;
        END $$;
    """)
    
    # Update gates table if it exists and has owner_role column
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gates' AND column_name = 'owner_role') THEN
                UPDATE gates SET owner_role = 'Architect' WHERE owner_role = 'ARCHITECT';
                UPDATE gates SET owner_role = 'Business Owner' WHERE owner_role = 'BUSINESS_OWNER';
                UPDATE gates SET owner_role = 'QA Officer' WHERE owner_role = 'QA';
                UPDATE gates SET owner_role = 'Release Manager' WHERE owner_role = 'RELEASE_MANAGER';
                UPDATE gates SET owner_role = 'Auditor' WHERE owner_role = 'AUDITOR';
            END IF;
        END $$;
    """)
    
    # Now update roles table - create new roles if they don't exist, then update old ones
    # QA -> QA Officer
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM roles WHERE role_code = 'QA Officer') THEN
                IF EXISTS (SELECT 1 FROM roles WHERE role_code = 'QA') THEN
                    UPDATE roles SET role_code = 'QA Officer', description = 'Quality Assurance Officer' WHERE role_code = 'QA';
                ELSE
                    INSERT INTO roles (role_code, description) VALUES ('QA Officer', 'Quality Assurance Officer');
                END IF;
            END IF;
        END $$;
    """)
    
    # AUDITOR -> Auditor
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM roles WHERE role_code = 'Auditor') THEN
                IF EXISTS (SELECT 1 FROM roles WHERE role_code = 'AUDITOR') THEN
                    UPDATE roles SET role_code = 'Auditor', description = 'Auditor responsible for compliance and reviews' WHERE role_code = 'AUDITOR';
                ELSE
                    INSERT INTO roles (role_code, description) VALUES ('Auditor', 'Auditor responsible for compliance and reviews');
                END IF;
            END IF;
        END $$;
    """)
    
    # ARCHITECT -> Architect
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM roles WHERE role_code = 'Architect') THEN
                IF EXISTS (SELECT 1 FROM roles WHERE role_code = 'ARCHITECT') THEN
                    UPDATE roles SET role_code = 'Architect', description = 'Solution/Technical Architect' WHERE role_code = 'ARCHITECT';
                ELSE
                    INSERT INTO roles (role_code, description) VALUES ('Architect', 'Solution/Technical Architect');
                END IF;
            END IF;
        END $$;
    """)
    
    # BUSINESS_OWNER -> Business Owner
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM roles WHERE role_code = 'Business Owner') THEN
                IF EXISTS (SELECT 1 FROM roles WHERE role_code = 'BUSINESS_OWNER') THEN
                    UPDATE roles SET role_code = 'Business Owner', description = 'Business Owner responsible for requirements and sign-off' WHERE role_code = 'BUSINESS_OWNER';
                ELSE
                    INSERT INTO roles (role_code, description) VALUES ('Business Owner', 'Business Owner responsible for requirements and sign-off');
                END IF;
            END IF;
        END $$;
    """)
    
    # RELEASE_MANAGER -> Release Manager
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM roles WHERE role_code = 'Release Manager') THEN
                IF EXISTS (SELECT 1 FROM roles WHERE role_code = 'RELEASE_MANAGER') THEN
                    UPDATE roles SET role_code = 'Release Manager', description = 'Release Manager responsible for deployment coordination' WHERE role_code = 'RELEASE_MANAGER';
                ELSE
                    INSERT INTO roles (role_code, description) VALUES ('Release Manager', 'Release Manager responsible for deployment coordination');
                END IF;
            END IF;
        END $$;
    """)
    
    # Delete old roles only if they exist and are not referenced
    op.execute("DELETE FROM roles WHERE role_code = 'QA' AND NOT EXISTS (SELECT 1 FROM project_members WHERE role_code = 'QA')")
    op.execute("DELETE FROM roles WHERE role_code = 'AUDITOR' AND NOT EXISTS (SELECT 1 FROM project_members WHERE role_code = 'AUDITOR')")
    op.execute("DELETE FROM roles WHERE role_code = 'ARCHITECT' AND NOT EXISTS (SELECT 1 FROM project_members WHERE role_code = 'ARCHITECT')")
    op.execute("DELETE FROM roles WHERE role_code = 'BUSINESS_OWNER' AND NOT EXISTS (SELECT 1 FROM project_members WHERE role_code = 'BUSINESS_OWNER')")
    op.execute("DELETE FROM roles WHERE role_code = 'RELEASE_MANAGER' AND NOT EXISTS (SELECT 1 FROM project_members WHERE role_code = 'RELEASE_MANAGER')")
    
    # Delete PM and DEV roles (only if they exist and are not referenced)
    op.execute("DELETE FROM roles WHERE role_code IN ('PM', 'DEV') AND NOT EXISTS (SELECT 1 FROM project_members WHERE role_code IN ('PM', 'DEV'))")
    
    # Note: We don't delete project_members with PM or DEV roles
    # They might be used in RACI matrix, so we just remove them from roles table
    # The role_code in project_members can still be 'PM' or 'DEV' even if not in roles table


def downgrade() -> None:
    # Revert role names
    op.execute("UPDATE roles SET role_code = 'QA', description = 'Quality Assurance' WHERE role_code = 'QA Officer'")
    op.execute("UPDATE roles SET role_code = 'AUDITOR', description = 'Auditor' WHERE role_code = 'Auditor'")
    op.execute("UPDATE roles SET role_code = 'ARCHITECT', description = 'Architect' WHERE role_code = 'Architect'")
    op.execute("UPDATE roles SET role_code = 'BUSINESS_OWNER', description = 'Business Owner' WHERE role_code = 'Business Owner'")
    op.execute("UPDATE roles SET role_code = 'RELEASE_MANAGER', description = 'Release Manager' WHERE role_code = 'Release Manager'")
    
    # Re-add PM and DEV roles
    op.execute("INSERT INTO roles (role_code, description) VALUES ('PM', 'Project Manager'), ('DEV', 'Developer') ON CONFLICT DO NOTHING")
    
    # Revert project_members
    op.execute("UPDATE project_members SET role_code = 'QA' WHERE role_code = 'QA Officer'")
    op.execute("UPDATE project_members SET role_code = 'AUDITOR' WHERE role_code = 'Auditor'")
    op.execute("UPDATE project_members SET role_code = 'ARCHITECT' WHERE role_code = 'Architect'")
    op.execute("UPDATE project_members SET role_code = 'BUSINESS_OWNER' WHERE role_code = 'Business Owner'")
    op.execute("UPDATE project_members SET role_code = 'RELEASE_MANAGER' WHERE role_code = 'Release Manager'")

