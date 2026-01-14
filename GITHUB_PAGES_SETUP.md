# Konfiguracja GitHub Pages

## ✅ Co już jest gotowe:

1. **Workflow GitHub Actions** - `.github/workflows/deploy.yml` jest skonfigurowany
2. **Vite config** - `base: '/ProjectReviewRepository/'` jest ustawiony
3. **API service** - używa zmiennej środowiskowej `VITE_API_URL`

## 📋 Kroki do ustawienia GitHub Pages:

### 1. Przejdź do ustawień repozytorium na GitHub:

1. Otwórz repozytorium: `https://github.com/mikzielinski/ProjectReviewRepository`
2. Kliknij **Settings** (na górze repozytorium)
3. W menu po lewej stronie znajdź **Pages** (w sekcji "Code and automation")

### 2. Skonfiguruj źródło GitHub Pages:

1. W sekcji **Source** wybierz:
   - **Source**: `GitHub Actions` (NIE "Deploy from a branch")
   
2. **WAŻNE**: Nie wybieraj "Deploy from a branch" - użyjemy GitHub Actions!

3. Kliknij **Save**

### 3. Sprawdź, czy workflow działa:

1. Przejdź do zakładki **Actions** w repozytorium
2. Sprawdź, czy workflow "Deploy to GitHub Pages" się uruchomił
3. Poczekaj, aż build się zakończy (zielony checkmark)

### 4. Adres Twojej strony:

Po udanym wdrożeniu strona będzie dostępna pod adresem:
```
https://mikzielinski.github.io/ProjectReviewRepository/
```

## ⚙️ Opcjonalnie: Ustawienie zmiennej środowiskowej dla API

Jeśli masz backend wdrożony (np. na Railway/Render), możesz ustawić URL do API:

1. W repozytorium: **Settings** → **Secrets and variables** → **Actions**
2. Kliknij **New repository secret**
3. Nazwa: `VITE_API_URL`
4. Wartość: URL do Twojego backendu (np. `https://your-backend.railway.app/api/v1`)
5. Kliknij **Add secret**

**Uwaga**: Jeśli nie ustawisz tego sekretu, aplikacja użyje domyślnej wartości: `http://localhost:8000/api/v1`

## 🔍 Rozwiązywanie problemów:

### Jeśli widzisz 404:
- Upewnij się, że **Source** w GitHub Pages jest ustawiony na **GitHub Actions** (nie na branch)
- Sprawdź, czy workflow w Actions zakończył się sukcesem
- Poczekaj 2-5 minut po zakończeniu workflow (propagacja DNS)

### Jeśli workflow się nie uruchomił:
- Upewnij się, że plik `.github/workflows/deploy.yml` jest w repozytorium
- Sprawdź, czy jest w branchu `main`
- Możesz ręcznie uruchomić workflow: **Actions** → **Deploy to GitHub Pages** → **Run workflow**

### Jeśli build się nie powiódł:
- Sprawdź logi w **Actions** → kliknij na failed workflow → **build** job
- Sprawdź, czy są błędy TypeScript lub brakujące zależności

## 📝 Notatki:

- Pierwsze wdrożenie może zająć 5-10 minut
- GitHub Pages jest darmowy dla publicznych repozytoriów
- Build jest uruchamiany automatycznie przy każdym pushu do `main`
- Możesz też ręcznie uruchomić workflow w zakładce Actions

