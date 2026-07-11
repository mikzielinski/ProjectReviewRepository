from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID

from app.db import get_db
from app.dependencies import get_current_active_user
from app.models import Project, User
from app.schemas.projects import ItPortfolioDashboard, ItProjectSummary
from app.services.it_project_dashboard import build_it_portfolio, build_project_summary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/it-portfolio", response_model=ItPortfolioDashboard)
def it_portfolio(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """PM dashboard — IT project portfolio with governance scores and compliance gaps."""
    return build_it_portfolio(db, current_user.id)


@router.get("/it-portfolio/{project_id}", response_model=ItProjectSummary)
def it_project_overview(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Project not found")
    return build_project_summary(db, project)
