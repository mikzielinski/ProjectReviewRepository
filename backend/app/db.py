from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import logging

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

# Add connection timeout and better error handling
# pool_pre_ping=False to avoid connection attempts during import
logger.info("Creating database engine...")
try:
    # Parse database URL to add SSL mode if needed
    db_url = settings.database_url
    if "neon.tech" in db_url and "sslmode" not in db_url:
        # Add sslmode if not present for Neon
        separator = "&" if "?" in db_url else "?"
        db_url = f"{db_url}{separator}sslmode=require"
    
    engine = create_engine(
        db_url,
        pool_pre_ping=True,  # Enable pre-ping to check connections
        connect_args={
            "connect_timeout": 10,  # 10 second connection timeout
            "sslmode": "require" if "neon.tech" in db_url else None,
        },
        pool_timeout=10,  # 10 second pool timeout
        pool_recycle=3600,  # Recycle connections after 1 hour
        echo=False,  # Set to True for SQL query logging
    )
    logger.info("Database engine created successfully")
except Exception as e:
    logger.error(f"Error creating database engine: {e}")
    raise
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

