# Deployment Guide - Frontend & Backend

This guide explains how to deploy both the frontend (GitHub Pages) and backend (Railway/Render) together.

## Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│   GitHub Pages      │────────▶│   Backend Service   │
│   (Frontend - React)│  API    │   (Railway/Render)  │
│   Static Hosting    │         │   (FastAPI)         │
└─────────────────────┘         └─────────────────────┘
```

## Important Note

**GitHub Pages can only host static files** (HTML, CSS, JavaScript). It cannot run Python/FastAPI backends. Therefore:
- **Frontend** → Deployed to GitHub Pages (automatic via GitHub Actions)
- **Backend** → Deployed to Railway or Render (supports Python/FastAPI)

## Option 1: Deploy Backend to Railway (Recommended)

### Setup Railway

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository: `mikzielinski/ProjectReviewRepository`
   - Railway will detect the `railway.json` configuration

3. **Configure Environment Variables**
   - In Railway project, go to **Variables** tab
   - Add these variables:
     ```
     DATABASE_URL=postgresql://user:pass@host:port/dbname
     MINIO_ENDPOINT=your-minio-endpoint
     MINIO_ACCESS_KEY=your-access-key
     MINIO_SECRET_KEY=your-secret-key
     JWT_SECRET_KEY=your-jwt-secret
     OPENAI_API_KEY=your-openai-key
     PORT=8000
     ```

4. **Get Railway Credentials**
   - Go to Railway project settings
   - Generate a new token
   - Copy the Project ID

5. **Add GitHub Secrets**
   - Go to your GitHub repo: **Settings** → **Secrets and variables** → **Actions**
   - Add these secrets:
     - `RAILWAY_TOKEN`: Your Railway token
     - `RAILWAY_PROJECT_ID`: Your Railway project ID
     - `BACKEND_URL`: Your Railway backend URL (e.g., `https://your-app.railway.app/api/v1`)

6. **Deploy**
   - Railway will automatically deploy when you push to `main`
   - Or manually deploy from Railway dashboard

### Update Frontend API URL

The frontend will automatically use the `BACKEND_URL` secret if set. Otherwise, update it manually:

1. In GitHub repo: **Settings** → **Secrets** → **Actions**
2. Add secret: `VITE_API_URL` = `https://your-app.railway.app/api/v1`

## Option 2: Deploy Backend to Render

### Setup Render

1. **Create Render Account**
   - Go to [render.com](https://render.com)
   - Sign up with GitHub

2. **Create New Web Service**
   - Click "New" → "Web Service"
   - Connect your GitHub repository
   - Render will detect `render.yaml` configuration

3. **Configure Environment Variables**
   - In Render dashboard, go to **Environment** tab
   - Add the same variables as Railway (see above)

4. **Deploy**
   - Render will automatically deploy on push to `main`
   - Get your backend URL (e.g., `https://your-app.onrender.com`)

5. **Update Frontend**
   - Add GitHub secret: `VITE_API_URL` = `https://your-app.onrender.com/api/v1`

## Option 3: Deploy Backend Manually (Any Python Hosting)

If you prefer to deploy the backend elsewhere:

1. **Deploy your backend** to any Python hosting service (Heroku, Fly.io, DigitalOcean, etc.)
2. **Get your backend URL** (e.g., `https://your-backend.com`)
3. **Add GitHub secret**: `VITE_API_URL` = `https://your-backend.com/api/v1`

## Frontend Deployment (GitHub Pages)

The frontend is automatically deployed to GitHub Pages:

1. **Enable GitHub Pages**
   - Go to: `https://github.com/mikzielinski/ProjectReviewRepository/settings/pages`
   - Under **Source**, select **GitHub Actions**
   - Save

2. **Deploy**
   - Push to `main` branch
   - GitHub Actions will automatically build and deploy
   - Your site will be at: `https://mikzielinski.github.io/ProjectReviewRepository/`

## Complete Setup Checklist

- [ ] Railway/Render account created
- [ ] Backend deployed to Railway/Render
- [ ] Backend URL obtained
- [ ] GitHub secret `VITE_API_URL` set to backend URL
- [ ] GitHub secret `BACKEND_URL` set (optional, for workflow)
- [ ] GitHub Pages enabled (Settings → Pages → GitHub Actions)
- [ ] Frontend workflow runs successfully
- [ ] Test the deployed application

## Testing Deployment

1. **Frontend**: Visit `https://mikzielinski.github.io/ProjectReviewRepository/`
2. **Backend**: Test API endpoint: `https://your-backend-url.com/api/v1/health` (if you have a health endpoint)
3. **Integration**: Try logging in or making API calls from the frontend

## Troubleshooting

### Frontend can't connect to backend
- Check that `VITE_API_URL` secret is set correctly
- Verify backend is running and accessible
- Check CORS settings in backend (should allow GitHub Pages domain)

### Backend deployment fails
- Check environment variables are set correctly
- Verify database connection string
- Check build logs in Railway/Render dashboard

### CORS errors
- Update backend CORS settings to include:
  - `https://mikzielinski.github.io`
  - `https://mikzielinski.github.io/ProjectReviewRepository`

## Local Development

For local development, both services run locally:

```bash
# Terminal 1: Backend
cd backend
uvicorn app.main:app --reload

# Terminal 2: Frontend
cd frontend
npm run dev
```

The frontend will use `http://localhost:8000/api/v1` automatically when running locally.
