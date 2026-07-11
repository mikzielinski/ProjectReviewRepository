"""Seed compliance frameworks, controls, and project type definitions."""

from __future__ import annotations

import logging
import os

from sqlalchemy.orm import Session

from app.data.controls_library import CONTROLS, FRAMEWORKS, PROJECT_TYPE_DEFINITIONS
from app.models import ComplianceControl, ComplianceFramework, ProjectTypeDefinition, User

logger = logging.getLogger(__name__)


def _framework_owner_email(code: str) -> str | None:
    env_key = f"FRAMEWORK_OWNER_{code.upper()}"
    value = os.getenv(env_key)
    if value:
        return value.strip().lower()
    if code.upper() == "ISO27001":
        return os.getenv("FRAMEWORK_OWNER_ISO27001", "mikzielinski@gmail.com").strip().lower()
    if code.upper() == "SOC2":
        return os.getenv("FRAMEWORK_OWNER_SOC2", "dawid@test.com").strip().lower()
    return None


def _resolve_owner_user_id(db: Session, owner_email: str | None):
    if not owner_email:
        return None
    user = db.query(User).filter(User.email == owner_email).first()
    return user.id if user else None


def _doc_list(codes: list[str]) -> list[dict[str, str]]:
    return [{"document_type_code": c, "document_type_name": c.replace("_", " ")} for c in codes]


def update_control_descriptions(db: Session) -> int:
    """Backfill descriptions on existing compliance_controls rows from the library."""
    updated = 0
    for spec in FRAMEWORKS:
        fw = db.query(ComplianceFramework).filter(ComplianceFramework.code == spec["code"]).first()
        if not fw:
            continue
        for ctrl in CONTROLS.get(spec["code"], []):
            description = ctrl.get("description")
            if not description:
                continue
            existing = (
                db.query(ComplianceControl)
                .filter(
                    ComplianceControl.framework_id == fw.id,
                    ComplianceControl.control_ref == ctrl["ref"],
                )
                .first()
            )
            if existing and not existing.description:
                existing.description = description
                updated += 1
    if updated:
        db.commit()
    return updated


def seed_compliance_library(db: Session) -> tuple[int, int]:
    """Seed frameworks and controls. Returns (frameworks_added, controls_added)."""
    fw_added = 0
    ctrl_added = 0
    desc_updated = 0
    ref_to_id: dict[str, dict[str, object]] = {}

    for spec in FRAMEWORKS:
        fw = db.query(ComplianceFramework).filter(ComplianceFramework.code == spec["code"]).first()
        owner_email = _framework_owner_email(spec["code"])
        if not fw:
            fw = ComplianceFramework(
                **spec,
                is_system=True,
                owner_email=owner_email,
                owner_user_id=_resolve_owner_user_id(db, owner_email),
            )
            db.add(fw)
            db.flush()
            fw_added += 1
        else:
            if owner_email and not fw.owner_email:
                fw.owner_email = owner_email
                fw.owner_user_id = _resolve_owner_user_id(db, owner_email)
        ref_to_id[spec["code"]] = {}

        for idx, ctrl in enumerate(CONTROLS.get(spec["code"], [])):
            existing = (
                db.query(ComplianceControl)
                .filter(
                    ComplianceControl.framework_id == fw.id,
                    ComplianceControl.control_ref == ctrl["ref"],
                )
                .first()
            )
            if existing:
                ref_to_id[spec["code"]][ctrl["ref"]] = existing.id
                if ctrl.get("description") and not existing.description:
                    existing.description = ctrl["description"]
                    desc_updated += 1
                continue

            parent_id = None
            parent_ref = ctrl.get("parent")
            if parent_ref and parent_ref in ref_to_id.get(spec["code"], {}):
                parent_id = ref_to_id[spec["code"]][parent_ref]

            row = ComplianceControl(
                framework_id=fw.id,
                parent_control_id=parent_id,
                control_ref=ctrl["ref"],
                title=ctrl["title"],
                description=ctrl.get("description"),
                domain=ctrl.get("domain"),
                control_type=ctrl.get("type"),
                testing_frequency_days=ctrl.get("freq"),
                mapped_document_types_json=ctrl.get("docs", []),
                evidence_requirements_json=ctrl.get("evidence", ["Policy document", "Test evidence", "Audit log sample"]),
                sort_order=idx,
            )
            db.add(row)
            db.flush()
            ref_to_id[spec["code"]][ctrl["ref"]] = row.id
            ctrl_added += 1

    if fw_added or ctrl_added or desc_updated:
        db.commit()
    return fw_added, ctrl_added


def seed_project_type_definitions(db: Session) -> int:
    creator = db.query(User).filter(User.is_active.is_(True)).first()
    if not creator:
        return 0

    added = 0
    for spec in PROJECT_TYPE_DEFINITIONS:
        existing = (
            db.query(ProjectTypeDefinition)
            .filter(ProjectTypeDefinition.org_id.is_(None), ProjectTypeDefinition.code == spec["code"])
            .first()
        )
        if existing:
            continue

        compliance = {
            "hipaa": False,
            "sox": False,
            "gxp": False,
            "gisc": True,
            "iso27001": False,
            "soc2": False,
            "iso42001": False,
            "knf": False,
            "eu_ai_act": False,
        }
        compliance.update(spec.get("compliance", {}))

        db.add(
            ProjectTypeDefinition(
                org_id=None,
                code=spec["code"],
                name=spec["name"],
                description=spec.get("description"),
                category=spec["category"],
                default_compliance_settings_json=compliance,
                default_required_document_types_json=_doc_list(spec.get("docs", [])),
                default_template_doc_types_json=spec.get("templates", []),
                default_control_framework_codes_json=spec.get("frameworks", []),
                created_by=creator.id,
            )
        )
        added += 1

    if added:
        db.commit()
    return added
