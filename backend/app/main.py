from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session
import traceback
import logging

# Configure logging FIRST
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

logger.info("Starting application import...")

from app.db import Base, engine, SessionLocal
logger.info("✅ Database module imported")

from app.models import Role
logger.info("✅ Models imported")

from app.core.enums import RoleCode
logger.info("✅ Enums imported")

from app.routers import auth, projects, members, templates, documents, users, folders, document_types
logger.info("✅ Routers imported")

app = FastAPI(title="DMS Governance API", version="0.1.0")

# CORS middleware - must be added before exception handlers
# Get allowed origins from environment or use defaults
import os
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "https://mikzielinski.github.io",
    "https://mikzielinski.github.io/ProjectReviewRepository",
    "https://projectreviewrepository.onrender.com",
]

# Add custom origins from environment if set
if os.getenv("CORS_ORIGINS"):
    allowed_origins.extend(os.getenv("CORS_ORIGINS").split(","))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Exception handler for validation errors
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors with CORS headers."""
    origin = request.headers.get("origin")
    allowed_origins = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "https://mikzielinski.github.io",
        "https://mikzielinski.github.io/ProjectReviewRepository",
    ]
    if os.getenv("CORS_ORIGINS"):
        allowed_origins.extend(os.getenv("CORS_ORIGINS").split(","))
    
    headers = {}
    if origin in allowed_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    
    logger.error(f"Validation error: {exc.errors()}")
    print(f"VALIDATION ERROR: {exc.errors()}")
    try:
        body = await request.body()
        logger.error(f"Request body: {body}")
        print(f"Request body: {body}")
    except Exception as body_error:
        logger.error(f"Could not read request body: {body_error}")
        print(f"Could not read request body: {body_error}")
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
        headers=headers,
    )


# Exception handler to ensure CORS headers are always set
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler that ensures CORS headers are always set."""
    origin = request.headers.get("origin")
    allowed_origins = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "https://mikzielinski.github.io",
        "https://mikzielinski.github.io/ProjectReviewRepository",
    ]
    if os.getenv("CORS_ORIGINS"):
        allowed_origins.extend(os.getenv("CORS_ORIGINS").split(","))
    
    headers = {}
    if origin in allowed_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    
    # Log the error for debugging
    logger.error(f"Error: {exc}")
    logger.error(f"Error type: {type(exc)}")
    logger.error(f"Request method: {request.method}")
    logger.error(f"Request URL: {request.url}")
    logger.error(traceback.format_exc())
    # Also print to console for immediate visibility
    print(f"ERROR: {exc}")
    print(f"Error type: {type(exc)}")
    print(f"Request method: {request.method}")
    print(f"Request URL: {request.url}")
    traceback.print_exc()
    
    # Try to get request body if available (only for POST/PUT/PATCH)
    if request.method in ["POST", "PUT", "PATCH"]:
        try:
            body = await request.body()
            print(f"Request body: {body}")
        except Exception as body_error:
            print(f"Could not read request body: {body_error}")
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error", "error": str(exc), "error_type": str(type(exc).__name__)},
        headers=headers,
    )


def seed_roles():
    session: Session = SessionLocal()
    try:
        for role in RoleCode:
            existing = session.query(Role).filter(Role.role_code == role.value).first()
            if not existing:
                # Use role value as description if it's already a readable name
                description = role.value if ' ' in role.value else role.value.title()
                session.add(Role(role_code=role.value, description=description))
        session.commit()
    except Exception as e:
        logger.error(f"Error seeding roles: {e}")
        print(f"ERROR seeding roles: {e}")
        session.rollback()
    finally:
        session.close()


def seed_document_types():
    """Seed default document types if they don't exist."""
    from app.models import DocumentType, User, Org
    import uuid
    
    session: Session = SessionLocal()
    try:
        # Get first user as creator (or create a system user)
        creator = session.query(User).first()
        if not creator:
            logger.warning("No users found, skipping document type seeding")
            return
        
        # Default document types to create
        default_types = [
            {"code": "PDD", "name": "PDD", "description": "Product Design Document", "extension": "docx"},
            {"code": "SDD", "name": "SDD", "description": "System Design Document", "extension": "docx"},
            {"code": "TSS", "name": "TSS", "description": "Technical Specification Sheet", "extension": "docx"},
            {"code": "TEST_PLAN", "name": "Test Plan", "description": "Test Plan Document", "extension": "xlsx"},
            {"code": "RELEASE_NOTES", "name": "Release Notes", "description": "Release Notes Document", "extension": "docx"},
            # Project Data Mapping types
            {"code": "DATA_MAP_BPMN", "name": "Project Data Mapping - BPMN", "description": "Business Process Model and Notation for Project Data Mapping", "extension": "bpmn"},
            {"code": "DATA_MAP_BPMN20", "name": "Project Data Mapping - BPMN 2.0", "description": "BPMN 2.0 XML for Project Data Mapping", "extension": "bpmn20"},
            {"code": "DATA_MAP_UML", "name": "Project Data Mapping - UML", "description": "UML Diagram for Project Data Mapping", "extension": "uml"},
            {"code": "DATA_MAP_UML_XMI", "name": "Project Data Mapping - UML XMI", "description": "UML XMI Metadata Interchange for Project Data Mapping", "extension": "xmi"},
            {"code": "DATA_MAP_TOGAF", "name": "Project Data Mapping - TOGAF", "description": "TOGAF Architecture Framework for Project Data Mapping", "extension": "xml"},
            {"code": "DATA_MAP_ARCHIMATE", "name": "Project Data Mapping - ArchiMate", "description": "ArchiMate Model Exchange for Project Data Mapping", "extension": "archimate"},
            {"code": "DATA_MAP_ARCHI", "name": "Project Data Mapping - Archi", "description": "Archi Model File for Project Data Mapping", "extension": "archi"},
            {"code": "DATA_MAP_ERD", "name": "Project Data Mapping - ERD", "description": "Entity Relationship Diagram for Project Data Mapping", "extension": "xml"},
            {"code": "DATA_MAP_XSD", "name": "Project Data Mapping - XSD", "description": "XML Schema Definition for Project Data Mapping", "extension": "xsd"},
            {"code": "DATA_MAP_JSON_SCHEMA", "name": "Project Data Mapping - JSON Schema", "description": "JSON Schema for Project Data Mapping", "extension": "json"},
            {"code": "DATA_MAP_CSV_MAPPING", "name": "Project Data Mapping - CSV Mapping", "description": "CSV Field Mapping Document for Project Data Mapping", "extension": "csv"},
            {"code": "DATA_MAP_YAML_CONFIG", "name": "Project Data Mapping - YAML Config", "description": "YAML Configuration for Project Data Mapping", "extension": "yaml"},
            {"code": "DATA_MAP_DRAWIO", "name": "Project Data Mapping - Draw.io", "description": "Draw.io Diagram for Project Data Mapping", "extension": "drawio"},
            {"code": "DATA_MAP_VISIO", "name": "Project Data Mapping - Visio", "description": "Microsoft Visio Diagram for Project Data Mapping", "extension": "vsdx"},
        ]
        
        for dt in default_types:
            existing = session.query(DocumentType).filter(DocumentType.code == dt["code"]).first()
            if not existing:
                doc_type = DocumentType(
                    org_id=None,  # Global type
                    code=dt["code"],
                    name=dt["name"],
                    description=dt["description"],
                    default_file_extension=dt["extension"],
                    is_active=True,
                    created_by=creator.id
                )
                session.add(doc_type)
                logger.info(f"Created default document type: {dt['code']}")
        
        session.commit()
        logger.info("Document types seeded successfully")
    except Exception as e:
        logger.error(f"Error seeding document types: {e}")
        print(f"ERROR seeding document types: {e}")
        import traceback
        traceback.print_exc()
        session.rollback()
    finally:
        session.close()


# Include routers with /api/v1 prefix for frontend compatibility
app.include_router(auth.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(members.router, prefix="/api/v1")
app.include_router(folders.router, prefix="/api/v1")
app.include_router(templates.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(document_types.router, prefix="/api/v1")


@app.on_event("startup")
async def startup_event():
    """Initialize database and seed roles on startup."""
    logger.info("Startup event triggered")
    print("STARTUP: Event triggered - server is ready to accept requests")
    
    # Don't block startup - run initialization in background thread
    import threading
    
    def init_db():
        try:
            logger.info("Starting database initialization...")
            print("STARTUP: Creating database tables...")
            Base.metadata.create_all(bind=engine)
            logger.info("Database tables created/verified")
            print("STARTUP: Database tables created/verified")
        except Exception as e:
            logger.error(f"Error creating database tables: {e}")
            print(f"ERROR creating database tables: {e}")
            import traceback
            traceback.print_exc()
            return  # Don't continue if table creation fails
        
        try:
            logger.info("Seeding roles...")
            print("STARTUP: Seeding roles...")
            seed_roles()
            logger.info("Roles seeded successfully")
            print("STARTUP: Roles seeded successfully")
        except Exception as e:
            logger.error(f"Error seeding roles on startup: {e}")
            print(f"ERROR seeding roles on startup: {e}")
            import traceback
            traceback.print_exc()
        
        try:
            logger.info("Seeding document types...")
            print("STARTUP: Seeding document types...")
            seed_document_types()
            logger.info("Document types seeded successfully")
            print("STARTUP: Document types seeded successfully")
        except Exception as e:
            logger.error(f"Error seeding document types on startup: {e}")
            print(f"ERROR seeding document types on startup: {e}")
            import traceback
            traceback.print_exc()
    
    # Run in background thread to avoid blocking server startup
    thread = threading.Thread(target=init_db, daemon=True)
    thread.start()
    logger.info("Startup event completed - server ready")
    print("STARTUP: Event completed - server ready to accept requests")


@app.get("/health")
def health():
    return {"status": "ok"}

