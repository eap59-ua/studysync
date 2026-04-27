"""StudySync FastAPI application factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.presentation.api.v1.auth_routes import router as auth_router
from app.presentation.api.v1.livekit_routes import router as livekit_router
from app.presentation.api.v1.room_routes import router as room_router
from app.presentation.api.v1.user_routes import router as user_router
from app.presentation.api.v1.notes_routes import router as notes_router
from app.presentation.ws.rooms_ws import router as rooms_ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown lifecycle."""
    # Startup: could init DB pool, Redis, etc.
    yield
    # Shutdown: cleanup resources


settings = get_settings()

app = FastAPI(
    title="StudySync API",
    description="Collaborative study platform — rooms, Pomodoro, notes, recommendations",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────
app.include_router(auth_router, prefix="/api/v1")
app.include_router(room_router, prefix="/api/v1")
app.include_router(user_router, prefix="/api/v1")
app.include_router(livekit_router, prefix="/api/v1")
app.include_router(notes_router, prefix="/api/v1")
app.include_router(rooms_ws_router)


# ── Health check ──────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health():
    return {"status": "ok", "service": "studysync-backend"}
