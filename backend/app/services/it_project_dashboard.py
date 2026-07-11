"""IT project portfolio dashboard — PM single-pane view."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.enums import DocumentState, TaskStatus
from app.models import Document, DocumentVersion, Project, ProjectMember, Task
from app.schemas.projects import ItPortfolioDashboard, ItProjectSummary
from app.services.compliance import get_active_compliance_standards


def _project_ids_for_user(db: Session, user_id: UUID) -> list[UUID]:
    memberships = (
        db.query(ProjectMember)
        .filter(ProjectMember.user_id == user_id)
        .filter(
            (ProjectMember.expires_at.is_(None)) | (ProjectMember.expires_at > datetime.now(timezone.utc))
        )
        .all()
    )
    return [m.project_id for m in memberships]


def _governance_score(
    docs_total: int,
    docs_approved: int,
    open_tasks: int,
    required_missing: int,
) -> float:
    if docs_total == 0 and required_missing > 0:
        return 0.0
    doc_ratio = docs_approved / docs_total if docs_total else 0.5
    task_penalty = min(0.3, open_tasks * 0.03)
    gap_penalty = min(0.4, required_missing * 0.08)
    return round(max(0.0, min(1.0, doc_ratio - task_penalty - gap_penalty)) * 100, 1)


def build_project_summary(db: Session, project: Project) -> ItProjectSummary:
    documents = db.query(Document).filter(Document.project_id == project.id).all()
    doc_ids = [d.id for d in documents]
    versions: list[DocumentVersion] = []
    if doc_ids:
        versions = db.query(DocumentVersion).filter(DocumentVersion.document_id.in_(doc_ids)).all()

    current_states: dict[UUID, str] = {}
    for doc in documents:
        if doc.current_version_id:
            ver = next((v for v in versions if v.id == doc.current_version_id), None)
            if ver:
                current_states[doc.id] = ver.state

    docs_approved = sum(1 for s in current_states.values() if s == DocumentState.APPROVED.value)
    docs_in_review = sum(1 for s in current_states.values() if s == DocumentState.IN_REVIEW.value)
    docs_draft = sum(1 for s in current_states.values() if s == DocumentState.DRAFT.value)

    closed_statuses = [TaskStatus.COMPLETED.value, TaskStatus.CLOSED.value, TaskStatus.VERIFIED.value]
    open_tasks = (
        db.query(Task)
        .filter(Task.project_id == project.id, Task.status.notin_(closed_statuses))
        .count()
    )
    overdue_tasks = (
        db.query(Task)
        .filter(
            Task.project_id == project.id,
            Task.status.notin_(closed_statuses),
            Task.due_at.isnot(None),
            Task.due_at < datetime.now(timezone.utc),
        )
        .count()
    )

    required = project.required_document_types_json or []
    existing_types = {d.doc_type for d in documents}
    required_codes = {r.get("document_type_code") or r.get("doc_type") for r in required if isinstance(r, dict)}
    required_codes.discard(None)
    required_missing = len(required_codes - existing_types) if required_codes else 0

    compliance = get_active_compliance_standards(project.compliance_settings_json)
    tech = project.tech_stack_json or []
    if isinstance(tech, dict):
        tech = tech.get("items", [])

    return ItProjectSummary(
        project_id=project.id,
        key=project.key,
        name=project.name,
        project_type=getattr(project, "project_type", None) or "IT",
        status=project.status,
        compliance_standards=compliance,
        documents_total=len(documents),
        documents_approved=docs_approved,
        documents_in_review=docs_in_review,
        documents_draft=docs_draft,
        open_tasks=open_tasks,
        overdue_tasks=overdue_tasks,
        required_docs_missing=required_missing,
        governance_score=_governance_score(len(documents), docs_approved, open_tasks, required_missing),
        tech_stack=[str(t) for t in tech][:8],
    )


def build_it_portfolio(db: Session, user_id: UUID) -> ItPortfolioDashboard:
    project_ids = _project_ids_for_user(db, user_id)
    projects = db.query(Project).filter(Project.id.in_(project_ids)).all() if project_ids else []
    summaries = [build_project_summary(db, p) for p in projects]

    return ItPortfolioDashboard(
        total_projects=len(summaries),
        active_projects=sum(1 for s in summaries if s.status == "ACTIVE"),
        open_tasks=sum(s.open_tasks for s in summaries),
        documents_in_review=sum(s.documents_in_review for s in summaries),
        compliance_gaps=sum(s.required_docs_missing for s in summaries),
        projects=sorted(summaries, key=lambda s: s.governance_score),
    )
