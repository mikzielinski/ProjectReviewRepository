# Quick Start Guide

## Option 1: Using Docker Compose (Recommended)

### Prerequisites
- Docker and Docker Compose installed
- PostgreSQL and MinIO will run in containers

### Steps

1. **Start all services:**
   ```bash
   chmod +x start-with-docker.sh
   ./start-with-docker.sh
   ```

   Or manually:
   ```bash
   cd infra
   docker-compose up -d
   ```

2. **Run migrations and seed data:**
   ```bash
   docker exec -it dms_api alembic upgrade head
   docker exec -it dms_api python scripts/seed_roles.py
   ```

3. **Start frontend (in a new terminal):**
   ```bash
   chmod +x start-frontend.sh
   ./start-frontend.sh
   ```

   Or manually:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Access the application:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs
   - MinIO Console: http://localhost:9001 (minioadmin/minioadmin123)

---

## Option 2: Local Development (Without Docker)

### Prerequisites
- Python 3.11+
- PostgreSQL 15 installed and running locally
- MinIO installed locally OR use Docker just for MinIO
- Node.js 18+

### Steps

1. **Set up PostgreSQL:**
   ```bash
   # Create database
   createdb dms
   # Or using psql:
   psql -U postgres -c "CREATE DATABASE dms;"
   ```

2. **Set up MinIO (or use Docker for MinIO only):**
   ```bash
   # Option A: Use Docker for MinIO only
   docker run -d -p 9000:9000 -p 9001:9001 \
     -e MINIO_ROOT_USER=minioadmin \
     -e MINIO_ROOT_PASSWORD=minioadmin123 \
     minio/minio server /data --console-address ":9001"
   
   # Option B: Install MinIO locally
   # Follow: https://min.io/docs/minio/container/index.html
   ```

3. **Configure backend:**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your local PostgreSQL and MinIO settings:
   # DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/dms
   # S3_ENDPOINT_URL=http://localhost:9000
   ```

4. **Start backend:**
   ```bash
   chmod +x start-backend.sh
   ./start-backend.sh
   ```

   Or manually:
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   alembic upgrade head
   python scripts/seed_roles.py
   uvicorn main:app --reload
   ```

5. **Start frontend (in a new terminal):**
   ```bash
   chmod +x start-frontend.sh
   ./start-frontend.sh
   ```

   Or manually:
   ```bash
   cd frontend
   npm install
   # Create .env file with: VITE_API_URL=http://localhost:8000/api/v1
   npm run dev
   ```

---

## Testing the API

### 1. Create a test user (via API or directly in DB)

Using psql:
```sql
INSERT INTO users (email, name, is_active, auth_provider) 
VALUES ('test@example.com', 'Test User', true, 'local');
```

### 2. Login (Note: Password auth needs to be implemented)
Currently, the login endpoint expects a password but doesn't verify it yet. You may need to:
- Implement password hashing in the User model
- Or modify the login endpoint for testing

### 3. Test endpoints via API docs
Visit http://localhost:8000/docs and use the interactive Swagger UI

### 4. Create test data:
```bash
# Create organization
curl -X POST "http://localhost:8000/api/v1/projects" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"org_id": 1, "key": "TEST", "name": "Test Project"}'
```

---

## Troubleshooting

### Database connection errors
- Check PostgreSQL is running: `pg_isready` or `docker ps`
- Verify DATABASE_URL in .env matches your setup

### MinIO connection errors
- Check MinIO is running: `curl http://localhost:9000/minio/health/live`
- Verify S3_ENDPOINT_URL in .env

### Port already in use
- Backend (8000): Change port in docker-compose.yml or uvicorn command
- Frontend (5173): Change port in vite.config.ts
- PostgreSQL (5432): Change port in docker-compose.yml or PostgreSQL config
- MinIO (9000/9001): Change ports in docker-compose.yml

### Migration errors
- Reset database: `alembic downgrade base && alembic upgrade head`
- Or drop and recreate database

### Frontend can't connect to backend
- Check VITE_API_URL in frontend/.env
- Check CORS settings in backend/app/core/config.py
- Verify backend is running on the correct port

---

## Development Tips

1. **Backend auto-reloads** when using `--reload` flag (default in docker-compose)
2. **Frontend hot-reloads** automatically with Vite
3. **Database migrations**: Create new with `alembic revision --autogenerate -m "description"`
4. **View logs**: `docker-compose logs -f api` or check terminal output

---

## Next Steps

1. Implement password authentication properly
2. Create test users and projects
3. Test document workflow (create → submit → approve)
4. Test template upload and rendering
5. Continue with Phase 2 implementation

