# StudySync Backend

FastAPI backend with hexagonal architecture for StudySync.

## Structure

```
app/
├── domain/          # Pure entities, business rules, ports
├── application/     # Use cases, service layer
├── infrastructure/  # SQLAlchemy, Redis, repositories
└── presentation/    # FastAPI routers, WebSocket handlers
```

## Quick Start

```bash
# Install dependencies
pip install -e ".[dev]"

# Run with hot reload
uvicorn app.main:app --reload --port 8000

# Run tests
pytest tests/ -v

# Lint
ruff check app/ tests/
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login, get tokens |
| GET | `/api/v1/auth/me` | Get current user |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| GET | `/health` | Health check |
