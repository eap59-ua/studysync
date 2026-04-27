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

## Configurar LiveKit

El backend genera tokens para salas de videoconferencia usando LiveKit.

1. Crea una cuenta en [LiveKit Cloud](https://cloud.livekit.io) (Free tier de 50 horas/mes).
2. Crea un proyecto nuevo.
3. En la pestaña de Settings / Keys, genera un API Key y un API Secret.
4. Copia los valores y la URL (WebSocket) y actualiza el archivo `.env`:

```env
LIVEKIT_API_KEY=tu_api_key
LIVEKIT_API_SECRET=tu_api_secret
LIVEKIT_URL=wss://tu-proyecto.livekit.cloud
```
