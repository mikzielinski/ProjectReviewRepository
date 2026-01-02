# Instrukcje Uruchomienia

## Problem

Backend wymaga zainstalowanych zależności (uvicorn, fastapi, itp.), które nie są dostępne w systemowym Pythonie.

## Rozwiązanie

### 1. Utwórz i aktywuj virtual environment

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Na macOS/Linux
# lub
venv\Scripts\activate  # Na Windows
```

### 2. Zainstaluj zależności

```bash
pip install -r requirements.txt
# lub jeśli nie ma requirements.txt:
pip install fastapi uvicorn sqlalchemy psycopg python-dotenv pydantic-settings alembic
```

### 3. Wykonaj migracje

```bash
# Najpierw napraw problem z migracjami (baza oczekuje migracji, które nie istnieją)
python3 -m alembic stamp head  # Oznacz jako zsynchronizowaną
# lub
python3 -m alembic upgrade head  # Jeśli migracje istnieją
```

### 4. Uruchom backend

```bash
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Uruchom frontend (jeśli istnieje)

```bash
cd frontend
npm install
npm run dev
```

## Status

- ⚠️ Wymagana instalacja zależności Python
- ⚠️ Wymagana naprawa migracji
- ✅ Połączenie z bazą danych działa
- ❌ Backend nie uruchomiony (brak uvicorn)
- ❌ Frontend nie znaleziony

## Szybki Start

```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn sqlalchemy psycopg python-dotenv pydantic-settings alembic
python3 -m alembic stamp head  # Napraw migracje
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (w osobnym terminalu)
cd frontend
npm install
npm run dev
```

