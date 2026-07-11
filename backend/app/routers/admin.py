"""Admin API: project type definitions and compliance controls library."""

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_active_user
from app.models import (
    ComplianceControl,
    ComplianceFramework,
    ProjectTypeDefinition,
    User,
)
from app.schemas.compliance_admin import (
    AdminPermissionsRead,
    ComplianceControlCreate,
    ComplianceControlRead,
    ComplianceControlUpdate,
    ComplianceFrameworkCreate,
    ComplianceFrameworkRead,
    ComplianceFrameworkUpdate,
    ProjectTypeDefinitionCreate,
    ProjectTypeDefinitionRead,
    ProjectTypeDefinitionUpdate,
)
from app.services.audit import AuditAction, log_action
from app.services.framework_access import (
    get_framework_by_code,
    is_framework_owner,
    is_org_admin,
    owned_frameworks_for_user,
    require_org_admin,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _framework_to_read(fw: ComplianceFramework, control_count: int = 0) -> ComplianceFrameworkRead:
    return ComplianceFrameworkRead(
        id=fw.id,
        code=fw.code,
        name=fw.name,
        version=fw.version,
        description=fw.description,
        source_url=fw.source_url,
        owner_user_id=fw.owner_user_id,
        owner_email=fw.owner_email,
        is_system=fw.is_system,
        is_active=fw.is_active,
        control_count=control_count,
    )


def _framework_snapshot(fw: ComplianceFramework) -> dict[str, Any]:
    return {
        "code": fw.code,
        "name": fw.name,
        "version": fw.version,
        "description": fw.description,
        "source_url": fw.source_url,
        "owner_user_id": str(fw.owner_user_id) if fw.owner_user_id else None,
        "owner_email": fw.owner_email,
        "is_system": fw.is_system,
        "is_active": fw.is_active,
    }


def _control_snapshot(ctrl: ComplianceControl) -> dict[str, Any]:
    return {
        "control_ref": ctrl.control_ref,
        "title": ctrl.title,
        "description": ctrl.description,
        "domain": ctrl.domain,
        "control_type": ctrl.control_type,
        "testing_frequency_days": ctrl.testing_frequency_days,
        "evidence_requirements_json": ctrl.evidence_requirements_json,
        "mapped_document_types_json": ctrl.mapped_document_types_json,
        "parent_control_id": str(ctrl.parent_control_id) if ctrl.parent_control_id else None,
        "sort_order": ctrl.sort_order,
        "is_active": ctrl.is_active,
    }


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


def _resolve_owner_user_id(db: Session, owner_email: Optional[str]) -> Optional[UUID]:
    if not owner_email:
        return None
    user = db.query(User).filter(User.email == owner_email.strip().lower()).first()
    return user.id if user else None


@router.get("/permissions", response_model=AdminPermissionsRead)
def get_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    owned = owned_frameworks_for_user(db, current_user)
    codes = [fw.code for fw in owned]
    admin = is_org_admin(current_user)
    return AdminPermissionsRead(
        is_admin=admin,
        owned_framework_codes=codes,
        can_manage_frameworks=admin or len(codes) > 0,
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
        result.append(_framework_to_read(fw, count))
    return result


@router.get("/my-frameworks", response_model=list[ComplianceFrameworkRead])
def list_my_frameworks(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    rows = owned_frameworks_for_user(db, current_user)
    result = []
    for fw in rows:
        count = db.query(ComplianceControl).filter(ComplianceControl.framework_id == fw.id, ComplianceControl.is_active.is_(True)).count()
        result.append(_framework_to_read(fw, count))
    return result


@router.post("/frameworks", response_model=ComplianceFrameworkRead, status_code=status.HTTP_201_CREATED)
def create_framework(
    payload: ComplianceFrameworkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_org_admin),
):
    code = payload.code.upper().replace(" ", "_")
    if db.query(ComplianceFramework).filter(ComplianceFramework.code == code).first():
        raise HTTPException(status_code=400, detail=f"Framework '{code}' already exists")

    owner_email = payload.owner_email.strip().lower() if payload.owner_email else None
    row = ComplianceFramework(
        code=code,
        name=payload.name,
        version=payload.version,
        description=payload.description,
        source_url=payload.source_url,
        owner_email=owner_email,
        owner_user_id=_resolve_owner_user_id(db, owner_email),
        is_system=False,
        is_active=True,
    )
    db.add(row)
    db.flush()
    log_action(
        db,
        current_user.id,
        AuditAction.FRAMEWORK_CREATE,
        "ComplianceFramework",
        row.id,
        after_json=_framework_snapshot(row),
    )
    db.commit()
    db.refresh(row)
    return _framework_to_read(row, 0)


@router.put("/frameworks/{code}", response_model=ComplianceFrameworkRead)
def update_framework(
    code: str,
    payload: ComplianceFrameworkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    fw = get_framework_by_code(db, code)
    if not fw:
        raise HTTPException(status_code=404, detail="Framework not found")
    if not is_framework_owner(current_user, fw.code, db):
        raise HTTPException(status_code=403, detail="Not authorized to update this framework")

    admin = is_org_admin(current_user)
    before = _framework_snapshot(fw)
    updates = payload.model_dump(exclude_unset=True)

    if not admin:
        allowed = {"description", "source_url"}
        disallowed = set(updates.keys()) - allowed
        if disallowed:
            raise HTTPException(
                status_code=403,
                detail=f"Framework owners may only update: {', '.join(sorted(allowed))}",
            )

    if "owner_email" in updates and admin:
        owner_email = updates["owner_email"]
        if owner_email:
            owner_email = owner_email.strip().lower()
        fw.owner_email = owner_email
        fw.owner_user_id = _resolve_owner_user_id(db, owner_email)
        updates.pop("owner_email")

    for field, value in updates.items():
        setattr(fw, field, value)

    log_action(
        db,
        current_user.id,
        AuditAction.FRAMEWORK_UPDATE,
        "ComplianceFramework",
        fw.id,
        before_json=before,
        after_json=_framework_snapshot(fw),
    )
    db.commit()
    db.refresh(fw)
    count = db.query(ComplianceControl).filter(ComplianceControl.framework_id == fw.id, ComplianceControl.is_active.is_(True)).count()
    return _framework_to_read(fw, count)


@router.delete("/frameworks/{code}", status_code=status.HTTP_204_NO_CONTENT)
def delete_framework(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_org_admin),
):
    fw = get_framework_by_code(db, code)
    if not fw:
        raise HTTPException(status_code=404, detail="Framework not found")
    before = _framework_snapshot(fw)
    fw.is_active = False
    log_action(
        db,
        current_user.id,
        AuditAction.FRAMEWORK_DELETE,
        "ComplianceFramework",
        fw.id,
        before_json=before,
        after_json=_framework_snapshot(fw),
    )
    db.commit()
    return None


@router.get("/controls", response_model=list[ComplianceControlRead])
def list_controls(
    framework_code: Optional[str] = None,
    domain: Optional[str] = None,
    flat: bool = False,
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

    if flat:
        return [_serialize_control(ctrl, fw.code) for ctrl, fw in rows]

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


@router.post("/frameworks/{code}/controls", response_model=ComplianceControlRead, status_code=status.HTTP_201_CREATED)
def create_control(
    code: str,
    payload: ComplianceControlCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    fw = get_framework_by_code(db, code)
    if not fw:
        raise HTTPException(status_code=404, detail="Framework not found")
    if not is_framework_owner(current_user, fw.code, db):
        raise HTTPException(status_code=403, detail="Not authorized to manage controls for this framework")

    control_ref = payload.control_ref.strip()
    if (
        db.query(ComplianceControl)
        .filter(ComplianceControl.framework_id == fw.id, ComplianceControl.control_ref == control_ref)
        .first()
    ):
        raise HTTPException(status_code=400, detail=f"Control ref '{control_ref}' already exists in this framework")

    if payload.parent_control_id:
        parent = (
            db.query(ComplianceControl)
            .filter(ComplianceControl.id == payload.parent_control_id, ComplianceControl.framework_id == fw.id)
            .first()
        )
        if not parent:
            raise HTTPException(status_code=400, detail="Parent control not found in this framework")

    max_sort = (
        db.query(ComplianceControl.sort_order)
        .filter(ComplianceControl.framework_id == fw.id)
        .order_by(ComplianceControl.sort_order.desc())
        .first()
    )
    sort_order = payload.sort_order if payload.sort_order is not None else ((max_sort[0] + 1) if max_sort else 0)

    row = ComplianceControl(
        framework_id=fw.id,
        parent_control_id=payload.parent_control_id,
        control_ref=control_ref,
        title=payload.title,
        description=payload.description,
        domain=payload.domain,
        control_type=payload.control_type,
        testing_frequency_days=payload.testing_frequency_days,
        evidence_requirements_json=payload.evidence_requirements_json,
        mapped_document_types_json=payload.mapped_document_types_json,
        sort_order=sort_order,
        is_active=True,
    )
    db.add(row)
    db.flush()
    log_action(
        db,
        current_user.id,
        AuditAction.CONTROL_CREATE,
        "ComplianceControl",
        row.id,
        after_json={**_control_snapshot(row), "framework_code": fw.code},
    )
    db.commit()
    db.refresh(row)
    return _serialize_control(row, fw.code)


@router.put("/frameworks/{code}/controls/{control_id}", response_model=ComplianceControlRead)
def update_control(
    code: str,
    control_id: UUID,
    payload: ComplianceControlUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    fw = get_framework_by_code(db, code)
    if not fw:
        raise HTTPException(status_code=404, detail="Framework not found")
    if not is_framework_owner(current_user, fw.code, db):
        raise HTTPException(status_code=403, detail="Not authorized to manage controls for this framework")

    ctrl = (
        db.query(ComplianceControl)
        .filter(ComplianceControl.id == control_id, ComplianceControl.framework_id == fw.id)
        .first()
    )
    if not ctrl:
        raise HTTPException(status_code=404, detail="Control not found")

    before = _control_snapshot(ctrl)
    updates = payload.model_dump(exclude_unset=True)

    if "control_ref" in updates:
        new_ref = updates["control_ref"].strip()
        existing = (
            db.query(ComplianceControl)
            .filter(
                ComplianceControl.framework_id == fw.id,
                ComplianceControl.control_ref == new_ref,
                ComplianceControl.id != control_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail=f"Control ref '{new_ref}' already exists")
        updates["control_ref"] = new_ref

    if "parent_control_id" in updates and updates["parent_control_id"]:
        parent = (
            db.query(ComplianceControl)
            .filter(ComplianceControl.id == updates["parent_control_id"], ComplianceControl.framework_id == fw.id)
            .first()
        )
        if not parent:
            raise HTTPException(status_code=400, detail="Parent control not found in this framework")

    for field, value in updates.items():
        setattr(ctrl, field, value)

    log_action(
        db,
        current_user.id,
        AuditAction.CONTROL_UPDATE,
        "ComplianceControl",
        ctrl.id,
        before_json=before,
        after_json={**_control_snapshot(ctrl), "framework_code": fw.code},
    )
    db.commit()
    db.refresh(ctrl)
    return _serialize_control(ctrl, fw.code)


@router.delete("/frameworks/{code}/controls/{control_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_control(
    code: str,
    control_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    fw = get_framework_by_code(db, code)
    if not fw:
        raise HTTPException(status_code=404, detail="Framework not found")
    if not is_framework_owner(current_user, fw.code, db):
        raise HTTPException(status_code=403, detail="Not authorized to manage controls for this framework")

    ctrl = (
        db.query(ComplianceControl)
        .filter(ComplianceControl.id == control_id, ComplianceControl.framework_id == fw.id)
        .first()
    )
    if not ctrl:
        raise HTTPException(status_code=404, detail="Control not found")

    before = _control_snapshot(ctrl)
    ctrl.is_active = False
    log_action(
        db,
        current_user.id,
        AuditAction.CONTROL_DELETE,
        "ComplianceControl",
        ctrl.id,
        before_json=before,
        after_json={**_control_snapshot(ctrl), "framework_code": fw.code},
    )
    db.commit()
    return None
