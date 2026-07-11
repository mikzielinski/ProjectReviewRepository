"""Admin API: project type definitions and compliance controls library."""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_active_user
from app.models import (
    ComplianceControl,
    ComplianceFramework,
    Project,
    ProjectControlAssignment,
    ProjectMember,
    ProjectTypeDefinition,
    User,
)
from app.schemas.compliance_admin import (
    ComplianceControlRead,
    ComplianceFrameworkRead,
    ProjectControlAssignmentRead,
    ProjectControlAssignmentUpdate,
    ProjectTypeDefinitionCreate,
    ProjectTypeDefinitionRead,
    ProjectTypeDefinitionUpdate,
)
from app.services.audit import AuditAction, log_action

router = APIRouter(prefix="/admin", tags=["admin"])


def _serialize_control(ctrl: ComplianceControl, fw_code: Optional[str] = None, sub: Optional[list] = None) -> ComplianceControlRead:
    return ComplianceControlRead(
        id=ctrl.id,
        framework_id=ctrl.framework_id,
        framework_code=fw_code,
        parent_control_id=ctrl.parent_control_id,
        control_ref=ctrl.control_ref,
        title=ctrl.title,
        description=ctrl.description,
        domain=ctrl.domain,
        control_type=ctrl.control_type,
        testing_frequency_days=ctrl.testing_frequency_days,
        evidence_requirements_json=ctrl.evidence_requirements_json,
        mapped_document_types_json=ctrl.mapped_document_types_json,
        sort_order=ctrl.sort_order,
        is_active=ctrl.is_active,
        sub_controls=sub or [],
    )


@router.get("/project-types", response_model=list[ProjectTypeDefinitionRead])
def list_project_types(
    category: Optional[str] = Query(None, description="DEVELOPMENT | COMPLIANCE"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    q = db.query(ProjectTypeDefinition).filter(ProjectTypeDefinition.is_active.is_(True))
    if category:
        q = q.filter(ProjectTypeDefinition.category == category.upper())
    return q.order_by(ProjectTypeDefinition.category, ProjectTypeDefinition.name).all()


@router.post("/project-types", response_model=ProjectTypeDefinitionRead, status_code=status.HTTP_201_CREATED)
def create_project_type(
    payload: ProjectTypeDefinitionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    code = payload.code.upper().replace(" ", "_")
    if db.query(ProjectTypeDefinition).filter(ProjectTypeDefinition.code == code).first():
        raise HTTPException(status_code=400, detail=f"Project type '{code}' already exists")

    row = ProjectTypeDefinition(
        org_id=None,
        code=code,
        name=payload.name,
        description=payload.description,
        category=payload.category.upper(),
        default_compliance_settings_json=payload.default_compliance_settings_json,
        default_required_document_types_json=payload.default_required_document_types_json,
        default_template_doc_types_json=payload.default_template_doc_types_json,
        default_control_framework_codes_json=payload.default_control_framework_codes_json,
        created_by=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    log_action(db, current_user.id, AuditAction.PROJECT_CREATE, "ProjectTypeDefinition", row.id, after_json={"code": code})
    db.commit()
    return row


@router.put("/project-types/{type_id}", response_model=ProjectTypeDefinitionRead)
def update_project_type(
    type_id: UUID,
    payload: ProjectTypeDefinitionUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    row = db.query(ProjectTypeDefinition).filter(ProjectTypeDefinition.id == type_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Project type not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.get("/frameworks", response_model=list[ComplianceFrameworkRead])
def list_frameworks(db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    rows = db.query(ComplianceFramework).filter(ComplianceFramework.is_active.is_(True)).order_by(ComplianceFramework.code).all()
    result = []
    for fw in rows:
        count = db.query(ComplianceControl).filter(ComplianceControl.framework_id == fw.id, ComplianceControl.is_active.is_(True)).count()
        result.append(
            ComplianceFrameworkRead(
                id=fw.id,
                code=fw.code,
                name=fw.name,
                version=fw.version,
                description=fw.description,
                source_url=fw.source_url,
                is_active=fw.is_active,
                control_count=count,
            )
        )
    return result


@router.get("/controls", response_model=list[ComplianceControlRead])
def list_controls(
    framework_code: Optional[str] = None,
    domain: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    q = db.query(ComplianceControl, ComplianceFramework).join(
        ComplianceFramework, ComplianceFramework.id == ComplianceControl.framework_id
    ).filter(ComplianceControl.is_active.is_(True))
    if framework_code:
        q = q.filter(ComplianceFramework.code == framework_code.upper())
    if domain:
        q = q.filter(ComplianceControl.domain.ilike(f"%{domain}%"))
    rows = q.order_by(ComplianceFramework.code, ComplianceControl.sort_order).all()

    by_parent: dict = {}
    ctrl_map: dict[UUID, tuple] = {}
    for ctrl, fw in rows:
        ctrl_map[ctrl.id] = (ctrl, fw.code)
        by_parent.setdefault(ctrl.parent_control_id, []).append(ctrl.id)

    def build(ctrl_id: UUID) -> ComplianceControlRead:
        ctrl, fw_code = ctrl_map[ctrl_id]
        subs = [_serialize_control(ctrl_map[cid][0], fw_code) for cid in by_parent.get(ctrl_id, [])]
        return _serialize_control(ctrl, fw_code, subs)

    roots = [cid for cid, (c, _) in ctrl_map.items() if c.parent_control_id is None]
    return [build(cid) for cid in roots]


@router.get("/controls/{control_id}", response_model=ComplianceControlRead)
def get_control(control_id: UUID, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    row = (
        db.query(ComplianceControl, ComplianceFramework)
        .join(ComplianceFramework, ComplianceFramework.id == ComplianceControl.framework_id)
        .filter(ComplianceControl.id == control_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Control not found")
    ctrl, fw = row
    subs = db.query(ComplianceControl).filter(ComplianceControl.parent_control_id == ctrl.id).all()
    return _serialize_control(ctrl, fw.code, [_serialize_control(s, fw.code) for s in subs])
