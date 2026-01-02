# Status Systemu - Sprawdzenie

## 🔍 Stan Systemu

### Backend
- **Status**: ❌ Nie działa (port 8000 nie odpowiada)
- **Endpoint**: `http://localhost:8000`
- **Health Check**: Nie odpowiada

### Baza Danych
- **Typ**: PostgreSQL (Neon DB)
- **Migracje**: Wykonane (003_convert_to_uuid)

### Frontend
- **Status**: Nieznany
- **Port**: 5173 (domyślnie)

---

## 👤 Dane Użytkownika

### Informacje o logowaniu:

**Endpoint logowania**: `POST /api/v1/auth/login`

**Uwaga**: W wersji v1 endpoint akceptuje **dowolne hasło** dla istniejących użytkowników (linia 49-52 w `backend/app/api/v1/auth.py`).

### Przykładowe dane użytkownika:

Zgodnie z dokumentacją (`QUICKSTART.md`), możesz utworzyć użytkownika:

```sql
INSERT INTO users (email, name, is_active, auth_provider, org_id) 
VALUES ('admin@example.com', 'System Administrator', true, 'local', <org_id>);
```

**Lub użyj istniejącego użytkownika** (jeśli został już utworzony).

### Sprawdzenie użytkowników w bazie:

```sql
SELECT id, email, name, is_active, is_system_admin, org_id 
FROM users;
```

---

## 🔧 Naprawione Problemy

1. ✅ **Model ProjectMember** - dodano pole `is_active` (domyślnie `True`)
2. ✅ **Tworzenie projektu** - ustawiono `is_active=True` przy dodawaniu użytkownika jako PM
3. ✅ **Migracja UUID** - wykonana (003_convert_to_uuid)

---

## ⚠️ Znane Problemy

1. **Backend nie działa** - wymaga restartu
2. **Projekty nie są widoczne** - prawdopodobnie problem z:
   - Brakiem wpisów w `project_members` z `is_active=True`
   - Backend nie działa, więc nie można sprawdzić

---

## 🚀 Następne Kroki

1. **Uruchom backend**:
   ```bash
   cd backend
   source venv/bin/activate
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Sprawdź użytkowników w bazie**:
   ```sql
   SELECT * FROM users;
   ```

3. **Sprawdź projekty i członków**:
   ```sql
   SELECT p.id, p.name, p.key, pm.user_id, pm.is_active 
   FROM projects p 
   LEFT JOIN project_members pm ON p.id = pm.project_id;
   ```

4. **Napraw brakujące `is_active`** (jeśli potrzeba):
   ```sql
   UPDATE project_members 
   SET is_active = true 
   WHERE is_active IS NULL OR is_active = false;
   ```

---

## 📝 Przypomnienie: Dane Logowania

**Jeśli masz użytkownika w bazie:**
- **Email**: (sprawdź w bazie: `SELECT email FROM users;`)
- **Hasło**: Dowolne (w wersji v1)

**Jeśli nie masz użytkownika:**
- Utwórz go w bazie (SQL powyżej)
- Lub użyj endpointu rejestracji (jeśli dostępny)

