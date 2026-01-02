# Szybki Start - Uruchomienie Serwerów

## 🔧 Przygotowanie

### 1. Backend - Instalacja zależności

```bash
cd backend

# Utwórz virtual environment
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# lub venv\Scripts\activate  # Windows

# Zainstaluj zależności
pip install -r requirements.txt
```

### 2. Napraw Migracje

Baza danych oczekuje migracji, które nie istnieją w workspace. Oznacz bazę jako zsynchronizowaną:

```bash
cd backend
source venv/bin/activate
python3 -m alembic stamp head
```

Lub jeśli migracje już zostały wykonane wcześniej, sprawdź aktualną wersję:
```bash
python3 -m alembic current
```

### 3. Uruchom Backend

```bash
cd backend
source venv/bin/activate
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend będzie dostępny na: **http://localhost:8000**
- Health: http://localhost:8000/health
- API Docs: http://localhost:8000/docs

### 4. Frontend (jeśli istnieje)

```bash
cd frontend
npm install
npm run dev
```

## ✅ Status

- ✅ Naprawiono `alembic/env.py` (import z `app.db`)
- ✅ Naprawiono konflikty migracji (usunięto duplikat)
- ✅ Utworzono `requirements.txt`
- ⚠️ Wymagana instalacja zależności Python
- ⚠️ Wymagana naprawa migracji (stamp head)
- ✅ Połączenie z bazą danych działa

## 📋 Endpointy RACI

Po uruchomieniu backendu, macierz RACI będzie dostępna pod:

- `GET /projects/{project_id}/raci` - Pobierz macierz RACI (wszyscy członkowie)
- `POST /api/v1/projects/{project_id}/raci/activities` - Utwórz aktywność (tylko PM)
- `PATCH /api/v1/raci/activities/{activity_id}` - Zaktualizuj aktywność (tylko PM)
- `POST /api/v1/raci/activities/{activity_id}/assignments` - Dodaj przypisanie (tylko PM)
- `PATCH /api/v1/raci/assignments/{assignment_id}` - Zaktualizuj przypisanie (tylko PM)
- `DELETE /api/v1/raci/assignments/{assignment_id}` - Usuń przypisanie (tylko PM)

## 🚀 Gotowe do Uruchomienia!

Wykonaj kroki powyżej, aby uruchomić serwery.

