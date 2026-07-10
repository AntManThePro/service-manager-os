# Hood Boss Service Manager OS

A full-stack operations cockpit for Buda leadership work.

## Your requested changes are included

- Hood Boss branding replaces the NEXUS application brand.
- Subtitle is exactly: `Buda Operations * Leadership Cockpit * Built for Anthony`
- Footer includes: `I = Nexus / AntManThePro`
- All edits are password protected.
- Existing records can be edited and deleted after unlocking.
- Thursday includes Friday morning meeting preparation and follow-up ownership.
- Every other Wednesday automatically adds the machine maintenance / repair / readiness block.
- `Buda` is used throughout the app.

## Stack

- Frontend: responsive HTML, CSS, JavaScript PWA shell
- Backend: FastAPI
- Database: SQLite by default; configurable through `DATABASE_URL`
- Auth: first-run password setup, scrypt password hashing, signed time-limited JWT tokens
- Deployment: Docker Compose
- Testing: Pytest and GitHub Actions CI

## Run with Docker

1. Copy the environment file:

```bash
cp .env.example .env
```

2. Replace `JWT_SECRET` in `.env` with a long random secret.

3. Start the application:

```bash
docker compose up --build
```

4. Open:

```text
http://localhost:8000
```

5. On first launch, tap **Unlock editing** and create your edit password.

The database persists in the Docker volume `hood_boss_data`.

## Run with Python

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend
uvicorn main:app --reload --port 8000
```

On Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
cd backend
uvicorn main:app --reload --port 8000
```

## Architecture

```text
Browser / PWA
      |
      | HTTPS + JSON
      v
FastAPI application
      |
      +-- Auth API
      +-- Entries CRUD API
      +-- Mission task state API
      |
      v
SQLite now
PostgreSQL-ready via DATABASE_URL
```

## Security notes

The first-run setup stores only an scrypt password hash. The original password is never stored. Successful login returns a time-limited signed token. Every create, update, delete, and task-completion request requires that token.

For a public deployment, use HTTPS, a strong `JWT_SECRET`, backups, and a managed PostgreSQL database.
