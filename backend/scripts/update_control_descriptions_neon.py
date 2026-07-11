#!/usr/bin/env python3
"""Backfill compliance_controls.description from controls_library (idempotent)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import SessionLocal
from app.services.seed_compliance_library import update_control_descriptions


def main() -> None:
    session = SessionLocal()
    try:
        updated = update_control_descriptions(session)
        print(f"Done: updated {updated} control descriptions")
    finally:
        session.close()


if __name__ == "__main__":
    main()
