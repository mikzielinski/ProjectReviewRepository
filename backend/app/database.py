"""Database module alias for backward compatibility."""
from app.db import get_db, SessionLocal, Base, engine

__all__ = ["get_db", "SessionLocal", "Base", "engine"]


