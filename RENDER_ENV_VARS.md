# Render Environment Variables Configuration

This document lists all required environment variables that need to be configured in the Render Dashboard for the backend to work properly.

## Required Environment Variables

Add the following environment variables in the Render Dashboard (Environment tab):

1. **DATABASE_URL** (already added)
   - Value: `postgresql+psycopg://neondb_owner:npg_YOx9WSbZL7Xn@ep-proud-smoke-agcia2cv-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require`

2. **JWT_SECRET**
   - Value: `super-secret-jwt-key-change-in-production`
   - Description: Secret key for JWT token generation

3. **S3_ENDPOINT_URL**
   - Value: `http://localhost:9000`
   - ⚠️ **NOTE**: This points to localhost and will NOT work on Render. You need to:
     - Either set up an external S3-compatible storage (e.g., AWS S3, DigitalOcean Spaces, Cloudflare R2)
     - Or update this value with the actual S3 endpoint URL

4. **S3_ACCESS_KEY**
   - Value: `minioadmin`
   - Description: S3 access key (change this for production!)

5. **S3_SECRET_KEY**
   - Value: `minioadmin`
   - Description: S3 secret key (change this for production!)

6. **S3_BUCKET**
   - Value: `dms`
   - Description: S3 bucket name

7. **OPENAI_API_KEY** (Optional)
   - Value: Leave empty or provide your OpenAI API key if you want to use AI features
   - Description: OpenAI API key for AI-powered features

## Important Notes

- **S3 Storage**: The current S3 configuration points to localhost (MinIO running locally). For Render deployment, you need to:
  1. Set up an external S3-compatible storage service
  2. Update `S3_ENDPOINT_URL` with the service URL
  3. Update `S3_ACCESS_KEY` and `S3_SECRET_KEY` with production credentials
  4. Create the bucket specified in `S3_BUCKET`

- **JWT_SECRET**: The default value should be changed to a strong, random string in production.

- **Database**: The DATABASE_URL is already configured and points to a Neon PostgreSQL database.

## Steps to Add Variables in Render Dashboard

1. Go to your Render service dashboard
2. Navigate to the "Environment" tab
3. Click "Edit" button
4. Click "Add" → "New variable"
5. Enter the Key and Value for each variable
6. Click "Save, rebuild, and deploy" after adding all variables

