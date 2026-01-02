# Instrukcja Uruchomienia Serwerów

## Backend (FastAPI)

### 1. Wykonaj migracje
```bash
cd backend
python3 -m alembic upgrade head
```

### 2. Uruchom serwer
```bash
cd backend
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend będzie dostępny na: `http://localhost:8000`

## Frontend

Jeśli frontend istnieje:

```bash
cd frontend
npm install
npm run dev
```

Frontend będzie dostępny na: `http://localhost:5173` (lub inny port w zależności od konfiguracji)

## Status

- ✅ Backend uruchomiony w tle na porcie 8000
- ⚠️ Migracje wymagają naprawy (multiple heads)
- ⚠️ Frontend nie został znaleziony w workspace

## Naprawa Migracji

Jeśli nadal występuje problem z multiple heads, wykonaj:

```bash
cd backend
python3 -m alembic merge -m "merge_heads" heads
python3 -m alembic upgrade head
```

