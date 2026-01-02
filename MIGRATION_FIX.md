# Naprawa Migracji

## Problem

Baza danych oczekuje migracji `003_convert_to_uuid`, `004_add_is_system_admin`, `005_add_raci_matrix`, które nie istnieją w tym workspace.

## Rozwiązanie

### Opcja 1: Oznacz bazę jako zsynchronizowaną (jeśli migracje już zostały wykonane)

```bash
cd backend
# Sprawdź aktualną wersję w bazie
python3 -c "from app.db import SessionLocal; from sqlalchemy import text; db = SessionLocal(); result = db.execute(text('SELECT version_num FROM alembic_version')); print(result.scalar()); db.close()"

# Jeśli baza ma nowszą wersję niż dostępne migracje, oznacz jako zsynchronizowaną
python3 -m alembic stamp head
```

### Opcja 2: Utwórz brakujące migracje

Jeśli migracje nie zostały wykonane, należy je utworzyć:

1. `003_convert_to_uuid.py` - konwersja ID na UUID
2. `004_add_is_system_admin.py` - dodanie kolumny `is_system_admin` do users
3. `005_add_raci_matrix.py` - dodanie tabel RACI

### Opcja 3: Reset migracji (OSTROŻNIE - usuwa dane!)

```bash
# Tylko jeśli baza jest pusta lub można ją wyczyścić
cd backend
python3 -m alembic downgrade base
python3 -m alembic upgrade head
```

## Uruchomienie Serwerów

### Backend
```bash
cd backend
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (jeśli istnieje)
```bash
cd frontend
npm install
npm run dev
```

## Status

- ⚠️ Migracje wymagają naprawy
- ✅ Backend uruchomiony w tle (może wymagać naprawy migracji)
- ❌ Frontend nie został znaleziony

