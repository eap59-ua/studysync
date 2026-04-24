"""Redis client for ephemeral state (Pomodoro, presence)."""

import redis.asyncio as redis

from app.config import get_settings


def get_redis_client() -> redis.Redis:
    """Create an async Redis client."""
    settings = get_settings()
    return redis.from_url(settings.redis_url, decode_responses=True)
