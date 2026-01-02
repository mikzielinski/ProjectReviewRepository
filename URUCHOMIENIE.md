# Instrukcja Uruchomienia Serwerów

## ✅ Stan Projektu

### Wykonane działania:
1. ✅ Naprawiono migracje
   - Poprawiono import w `alembic/env.py` (używa `app.db`)
   - Usunięto duplikat migracji `001_initial_migration.py`
   - Naprawiono konflikty multiple heads

2. ✅ Utworzono `requirements.txt`
   - Dodano wszystkie wymagane zależności Python

3. ✅ Przygotowano do uruchomienia
   - Połączenie z bazą działa
   - Backend gotowy do uruchomienia

## 🚀 Uruchomienie Backend

```bash
cd backend

# Utwórz środowisko wirtualne (jeśli nie istnieje)
python3 -m venv venv

# Aktywuj środowisko wirtualne
source venv/bin/activate

# Zainstaluj zależności
pip install -r requirements.txt

# Napraw migracje (jeśli baza oczekuje migracji, które nie istnieją)
python3 -m alembic stamp head

# Uruchom serwer
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 🌐 Endpointy

Po uruchomieniu backend będzie dostępny na:
- **API**: http://localhost:8000
- **Health Check**: http://localhost:8000/health
- **API Docs**: http://localhost:8000/docs

## ⚠️ Uwaga o Migracjach

Baza danych może oczekiwać migracji, które nie istnieją w tym workspace:
- `003_convert_to_uuid`
- `004_add_is_system_admin`
- `005_add_raci_matrix`

**Rozwiązanie**: Jeśli migracje zostały już wykonane wcześniej w bazie, użyj:
```bash
python3 -m alembic stamp head
```

To oznaczy bazę jako zsynchronizowaną z aktualnym stanem migracji.

## 📋 Frontend

Jeśli frontend istnieje:

```bash
cd frontend
npm install
npm run dev
```

Frontend będzie dostępny na http://localhost:5173 (domyślnie Vite) lub http://localhost:3000

## 🔧 Rozwiązywanie Problemów

### Problem: Błąd połączenia z bazą danych
- Sprawdź zmienne środowiskowe w `.env` (jeśli istnieje)
- Sprawdź `app/config.py` - domyślne ustawienia używają Neon DB

### Problem: Błąd importu modułów
- Upewnij się, że wszystkie zależności są zainstalowane: `pip install -r requirements.txt`
- Sprawdź, czy środowisko wirtualne jest aktywne

### Problem: Konflikty migracji
- Sprawdź stan migracji: `python3 -m alembic heads`
- Jeśli są multiple heads, usuń duplikaty z `alembic/versions/`
- Użyj `alembic stamp head` aby zsynchronizować bazę

## ✅ Weryfikacja

Po uruchomieniu sprawdź:
1. Health check: `curl http://localhost:8000/health`
2. API docs: Otwórz http://localhost:8000/docs w przeglądarce
3. Sprawdź logi serwera pod kątem błędów

