"""Seed demonstracyjnych projektów IT — po jednym na każdy standard compliance."""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.enums import RoleCode
from app.models import Org, Project, ProjectMember, User

logger = logging.getLogger(__name__)

_DEFAULT_RACI = {
    "stages": [
        {"name": "Discovery", "tasks": []},
        {"name": "Design", "tasks": []},
        {"name": "Implementation", "tasks": []},
    ]
}

_BASE_COMPLIANCE = {
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


def _docs(*codes: str) -> list[dict[str, str]]:
    names = {
        "PDD": "Product Design Document",
        "SDD": "System Design Document",
        "TSS": "Technical Specification Sheet",
        "TEST_PLAN": "Test Plan",
        "RISK_ASSESSMENT": "Risk Assessment",
        "COMPLIANCE_REPORT": "Compliance Report",
        "SOP": "Standard Operating Procedure",
        "CHANGE_CONTROL": "Change Control",
    }
    return [
        {"document_type_code": code, "document_type_name": names.get(code, code)}
        for code in codes
    ]


EXAMPLE_PROJECTS: list[dict[str, Any]] = [
    {
        "key": "DEMO-ISO27",
        "name": "Przykład: ISMS — ISO/IEC 27001",
        "description": "Zarządzanie bezpieczeństwem informacji (ISMS): SoA, ocena ryzyka, kontrola dostępu i ciągłość działania.",
        "project_type": "SECURITY",
        "compliance": {"iso27001": True},
        "tech_stack_json": ["Azure", "Entra ID", "Defender", "PostgreSQL", "Key Vault"],
        "required_document_types_json": _docs("SDD", "RISK_ASSESSMENT", "COMPLIANCE_REPORT", "SOP"),
    },
    {
        "key": "DEMO-SOC2",
        "name": "Przykład: SaaS Platform — SOC 2 Type II",
        "description": "Platforma SaaS w modelu multi-tenant — TSC: Security, Availability, Confidentiality.",
        "project_type": "IT",
        "compliance": {"soc2": True},
        "tech_stack_json": ["AWS", "Kubernetes", "Terraform", "Datadog", "Okta"],
        "required_document_types_json": _docs("SDD", "TSS", "TEST_PLAN", "COMPLIANCE_REPORT"),
    },
    {
        "key": "DEMO-SOX",
        "name": "Przykład: ERP Finance — SOX ITGC",
        "description": "System finansowo-księgowy objęty SOX — kontrola dostępu, change management, separacja obowiązków.",
        "project_type": "IT",
        "compliance": {"sox": True},
        "tech_stack_json": ["SAP S/4HANA", "Oracle DB", "ServiceNow", "Splunk"],
        "required_document_types_json": _docs("SDD", "CHANGE_CONTROL", "COMPLIANCE_REPORT", "SOP"),
    },
    {
        "key": "DEMO-ISO42",
        "name": "Przykład: AI Copilot — ISO/IEC 42001",
        "description": "System AI generatywnej — AIMMS, ocena ryzyka modelu, nadzór nad danymi treningowymi i MLOps.",
        "project_type": "DATA",
        "compliance": {"iso42001": True, "eu_ai_act": True},
        "tech_stack_json": ["Python", "LangChain", "Azure OpenAI", "MLflow", "Vector DB"],
        "required_document_types_json": _docs("PDD", "SDD", "RISK_ASSESSMENT", "COMPLIANCE_REPORT"),
    },
    {
        "key": "DEMO-KNF",
        "name": "Przykład: Core Banking — KNF / DORA",
        "description": "System bankowy — cyberbezpieczeństwo, odporność operacyjna i raportowanie zgodne z DORA/KNF.",
        "project_type": "SECURITY",
        "compliance": {"knf": True, "iso27001": True},
        "tech_stack_json": ["Java", "Kafka", "Oracle", "HashiCorp Vault", "Prometheus"],
        "required_document_types_json": _docs("SDD", "RISK_ASSESSMENT", "COMPLIANCE_REPORT", "SOP"),
    },
    {
        "key": "DEMO-EUAI",
        "name": "Przykład: HR Screening — EU AI Act (wysokie ryzyko)",
        "description": "System AI do selekcji kandydatów — klasyfikacja wysokiego ryzyka, dokumentacja techniczna, nadzór ludzki.",
        "project_type": "DATA",
        "compliance": {"eu_ai_act": True},
        "tech_stack_json": ["Python", "FastAPI", "scikit-learn", "PostgreSQL", "Grafana"],
        "required_document_types_json": _docs("PDD", "SDD", "RISK_ASSESSMENT", "TEST_PLAN"),
    },
    {
        "key": "DEMO-HIPAA",
        "name": "Przykład: EHR Portal — HIPAA",
        "description": "Portal pacjenta i integracja EHR — PHI, BAA, szyfrowanie i audit trail zgodnie z HIPAA Security Rule.",
        "project_type": "IT",
        "compliance": {"hipaa": True},
        "tech_stack_json": ["React", "Node.js", "HL7 FHIR", "AWS HIPAA", "PostgreSQL"],
        "required_document_types_json": _docs("PDD", "SDD", "RISK_ASSESSMENT", "COMPLIANCE_REPORT"),
    },
    {
        "key": "DEMO-GXP",
        "name": "Przykład: LIMS — GxP (GMP)",
        "description": "Laboratory Information Management System — walidacja CSV, ALCOA+, change control w środowisku GMP.",
        "project_type": "IT",
        "compliance": {"gxp": True},
        "tech_stack_json": [".NET", "SQL Server", "LabWare", "Active Directory"],
        "required_document_types_json": _docs("PDD", "SDD", "TEST_PLAN", "SOP", "CHANGE_CONTROL"),
    },
]


def _compliance_settings(flags: dict[str, bool]) -> dict[str, bool]:
    settings = dict(_BASE_COMPLIANCE)
    settings.update(flags)
    return settings


def seed_example_projects(db: Session, owner_emails: Optional[list] = None) -> int:
    """
    Create demo projects (keys DEMO-*) if they do not exist yet.
    Grants Business Owner membership to bootstrap owner emails.
    """
    if owner_emails is None:
        import os

        raw = os.getenv("PROJECT_ACCESS_BOOTSTRAP_EMAILS", "mikzielinski@gmail.com,dawid@test.com")
        owner_emails = [e.strip().lower() for e in raw.split(",") if e.strip()]

    owners = db.query(User).filter(User.email.in_(owner_emails), User.is_active.is_(True)).all()
    if not owners:
        logger.warning("No owner users found for example project seeding")
        return 0

    org = db.query(Org).first()
    if not org:
        org = Org(name="Default Organization")
        db.add(org)
        db.flush()

    created = 0
    for spec in EXAMPLE_PROJECTS:
        existing = db.query(Project).filter(Project.org_id == org.id, Project.key == spec["key"]).first()
        if existing:
            continue

        project = Project(
            org_id=org.id,
            key=spec["key"],
            name=spec["name"],
            description=spec["description"],
        project_type=spec["project_type"],
        project_category="COMPLIANCE",
        status="ACTIVE",
            compliance_settings_json=_compliance_settings(spec["compliance"]),
            required_document_types_json=spec["required_document_types_json"],
            tech_stack_json=spec["tech_stack_json"],
            enable_4_eyes_principal=True,
            raci_matrix_json=_DEFAULT_RACI,
        )
        db.add(project)
        db.flush()

        for owner in owners:
            db.add(
                ProjectMember(
                    project_id=project.id,
                    user_id=owner.id,
                    role_code=RoleCode.BUSINESS_OWNER.value,
                    is_temporary=False,
                    expires_at=None,
                    invited_by=owner.id,
                )
            )

        try:
            from app.services.project_controls_sync import sync_controls_for_project

            sync_controls_for_project(db, project, owners[0].id)
        except Exception as e:
            logger.warning("Control sync failed for %s: %s", spec["key"], e)

        created += 1
        logger.info("Created example project %s (%s)", spec["key"], spec["name"])

    if created:
        db.commit()
    return created
