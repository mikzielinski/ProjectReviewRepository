# Status Serwerów

## Backend (FastAPI)

### Uruchomienie
```bash
cd backend
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Status
- ✅ Serwer uruchomiony w tle
- 🌐 URL: http://localhost:8000
- 📚 API Docs: http://localhost:8000/docs
- ❤️ Health Check: http://localhost:8000/health

### Migracje
- ⚠️ Wykonano stamp do wersji `001_initial`
- ⚠️ Jeśli baza oczekuje nowszych migracji (np. `003_convert_to_uuid`, `004_add_is_system_admin`, `005_add_raci_matrix`), należy je utworzyć lub oznaczyć bazę jako zsynchronizowaną

## Frontend

Frontend nie został znaleziony w workspace. Jeśli istnieje:

```bash
cd frontend
npm install
npm run dev
```

## Uwagi

1. **Migracje**: Jeśli baza danych oczekuje migracji, które nie istnieją w workspace, można:
   - Utworzyć brakujące migracje
   - Oznaczyć bazę jako zsynchronizowaną: `alembic stamp head`
   - Usunąć wpisy z tabeli `alembic_version` w bazie

2. **Backend**: Serwer powinien być dostępny na porcie 8000. Sprawdź logi, jeśli nie odpowiada.

3. **Baza danych**: Upewnij się, że baza danych jest dostępna i połączenie działa.

