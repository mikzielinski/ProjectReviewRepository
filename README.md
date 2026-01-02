# DMS + SDLC Governance Platform

A comprehensive Document Management System with AI-assisted document creation, segregation of duties enforcement, signoff workflows, and project governance controls.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Backend       │────▶│   PostgreSQL    │
│   (React SPA)   │     │   (FastAPI)     │     │   Database      │
│   GitHub Pages  │     │   Docker        │     │   Docker        │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   MinIO         │
                        │   (S3 Storage)  │
                        └─────────────────┘
```

## Features

### Core Capabilities
- **Controlled Documentation**: PDD, SDD, TSS, Test Plans, Release Notes, etc.
- **Document Lifecycle**: DRAFT → IN_REVIEW → APPROVED → RELEASED → ARCHIVED
- **Segregation of Duties**: Enforced approval policies (R1-R3)
- **Tasks & Reminders**: APScheduler-based notifications and escalations
- **Evidence Vault**: Immutable storage with SHA-256 hashes
- **PKB (Progressive Knowledge Base)**: AI-extracted structured data from raw documents
- **AI Document Factory**: OpenAI-powered content generation with Word templates
- **PM Dashboard**: Single-pane project health view
- **Governance-Aware Gantt**: Timeline with approval gate blocking

### Governance Rules (Non-Negotiable)
- **R1**: Document author cannot be final approver
- **R2**: Reviewer cannot also be approver for same version
- **R3**: Temporary users (SME/Auditor) cannot approve documents
- **R4**: Approved versions are immutable
- **R5**: Evidence is immutable with hash verification
- **R6**: Full audit logging for all actions
- **R7**: AI output is always Draft with auto-created review tasks
- **R8**: Approval gates block downstream work
- **R9**: Reminders cannot be disabled by assignees

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for frontend development)
- Python 3.12+ (for backend development)

### Start with Docker Compose

```bash
cd infra
docker-compose up -d
```

This starts:
- API server on http://localhost:8000
- PostgreSQL on localhost:5432
- MinIO on http://localhost:9000 (Console: http://localhost:9001)

### Run Database Migrations

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
```

### Start Frontend (Development)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:3000

### Environment Variables

Create `.env` in `backend/`:

```env
DATABASE_URL=postgresql+psycopg://dms:dms_password@localhost:5432/dms
S3_ENDPOINT_URL=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=dms
JWT_SECRET=your-secret-key-change-in-production
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-4o
OPENAI_TEMPERATURE=0.2
```

## API Endpoints

### Authentication
- `POST /auth/login` - Login with email/password
- `POST /auth/register` - Register new user
- `GET /auth/me` - Get current user

### Projects
- `GET /projects` - List projects
- `POST /projects` - Create project
- `GET /projects/{id}` - Get project details
- `GET /projects/{id}/dashboard` - PM dashboard
- `GET /projects/{id}/gantt` - Gantt timeline

### Members
- `POST /projects/{id}/invite` - Invite member (supports temporary SME)
- `GET /projects/{id}/members` - List members
- `POST /projects/{id}/members/{id}/disable` - Disable member

### Documents
- `GET /projects/{id}/documents` - List documents
- `POST /projects/{id}/documents` - Create document
- `POST /documents/{id}/versions` - Create new version
- `POST /versions/{id}/submit` - Submit for review
- `POST /versions/{id}/approve` - Approve version
- `POST /versions/{id}/reject` - Reject version
- `POST /versions/{id}/render` - Render to Word
- `GET /versions/{id}/download` - Download rendered file

### Tasks
- `GET /projects/{id}/tasks` - List tasks
- `POST /projects/{id}/tasks` - Create task
- `POST /tasks/{id}/start` - Start task
- `POST /tasks/{id}/complete` - Complete task
- `POST /tasks/{id}/verify` - Verify task

### PKB
- `POST /projects/{id}/pkb/upload` - Upload source files for extraction
- `GET /projects/{id}/pkb` - List PKB snapshots
- `POST /projects/{id}/pkb/{id}/confirm` - Confirm PKB snapshot

### AI
- `POST /ai/documents/draft` - Create AI-generated document draft
- `POST /ai/impact/analyze` - Analyze version changes

### Evidence
- `POST /projects/{id}/evidence/upload` - Upload evidence
- `GET /projects/{id}/evidence` - List evidence

## Project Structure

```
ctl/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI routers
│   │   ├── core/         # Dependencies, auth
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   └── services/     # Business logic
│   ├── alembic/          # Database migrations
│   ├── tests/            # Pytest tests
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components
│   │   ├── lib/          # API client
│   │   └── store/        # Zustand store
│   └── package.json
└── infra/
    └── docker-compose.yml
```

## Testing

Run governance tests:

```bash
cd backend
pytest tests/ -v
```

## Deployment

### Backend (Docker)
```bash
cd backend
docker build -t dms-api .
docker run -p 8000:8000 --env-file .env dms-api
```

### Frontend (GitHub Pages)
```bash
cd frontend
npm run build
# Deploy dist/ folder to GitHub Pages
```

## License

Proprietary - All rights reserved.

