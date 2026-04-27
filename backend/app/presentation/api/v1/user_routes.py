"""User-related REST endpoints (stats, etc.)."""

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.domain.user import User
from app.infrastructure.redis_client import get_redis_client
from app.presentation.api.v1.auth_routes import get_current_user

router = APIRouter(prefix="/users", tags=["Users"])


class UserStatsResponse(BaseModel):
    pomodoros_completed: int


def get_redis() -> aioredis.Redis:
    """Dependency for Redis client — overrideable in tests."""
    return get_redis_client()


@router.get("/me/stats", response_model=UserStatsResponse)
async def get_my_stats(
    current_user: User = Depends(get_current_user),
    redis_client: aioredis.Redis = Depends(get_redis),
):
    """Get the current user's Pomodoro stats from Redis."""
    try:
        key = f"user:{current_user.id}:pomodoros_completed"
        val = await redis_client.get(key)
        count = int(val) if val else 0
        return UserStatsResponse(pomodoros_completed=count)
    finally:
        await redis_client.aclose()
