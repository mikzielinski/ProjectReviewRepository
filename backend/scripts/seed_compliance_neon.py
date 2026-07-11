#!/usr/bin/env python3
"""Seed compliance frameworks, controls, and project type definitions (idempotent)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import SessionLocal
from app.services.seed_compliance_library import seed_compliance_library, seed_project_type_definitions


def main() -> None:
    session = SessionLocal()
    try:
        fw, ctrl = seed_compliance_library(session)
        types = seed_project_type_definitions(session)
        print(f"Done: +{fw} frameworks, +{ctrl} controls, +{types} project types")
    finally:
        session.close()


if __name__ == "__main__":
    main()
