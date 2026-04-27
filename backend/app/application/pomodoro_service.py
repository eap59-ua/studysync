"""PomodoroService — server-authoritative Pomodoro with Redis state and asyncio rotation."""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional
from uuid import UUID

import redis.asyncio as aioredis

from app.domain.pomodoro import (
    PHASES_PER_CYCLE,
    PomodoroState,
    is_focus,
    next_phase_index,
    phase_duration,
    phase_name,
)
from app.domain.ports import RoomRepository

logger = logging.getLogger(__name__)

REDIS_KEY_PREFIX = "pomodoro"
USER_COUNTER_PREFIX = "user"


class PomodoroService:
    """Server-authoritative Pomodoro timer backed by Redis."""

    def __init__(
        self,
        redis_client: aioredis.Redis,
        room_repo: RoomRepository,
        broadcast_fn: Callable[[UUID, dict], Awaitable[None]],
        get_connected_user_ids: Callable[[UUID], list[UUID]],
        now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
        _sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ):
        self._redis = redis_client
        self._room_repo = room_repo
        self._broadcast = broadcast_fn
        self._get_connected_user_ids = get_connected_user_ids
        self._now = now
        self._sleep = _sleep
        self._rotation_tasks: dict[UUID, asyncio.Task] = {}

    def _redis_key(self, room_id: UUID) -> str:
        return f"{REDIS_KEY_PREFIX}:{room_id}"

    def _user_counter_key(self, user_id: UUID) -> str:
        return f"{USER_COUNTER_PREFIX}:{user_id}:pomodoros_completed"

    async def start(self, room_id: UUID, requesting_user_id: UUID) -> PomodoroState:
        """Start a Pomodoro for a room. Only the owner can start."""
        room = await self._room_repo.get_by_id(room_id)
        if not room:
            raise ValueError("room not found")
        if room.owner_id != requesting_user_id:
            raise PermissionError("only the room owner can start the pomodoro")

        # Cancel any existing rotation task
        self._cancel_rotation(room_id)

        # Create initial state
        state = PomodoroState.initial(started_by=requesting_user_id, now=self._now())

        # Store in Redis with TTL
        key = self._redis_key(room_id)
        ttl = state.duration_seconds + 10
        await self._redis.set(key, json.dumps(state.to_dict()), ex=ttl)

        # Schedule rotation
        self._schedule_rotation(room_id, state.duration_seconds)

        # Broadcast
        await self._broadcast(room_id, {
            "type": "pomodoro.state",
            "state": state.to_dict(),
        })

        logger.info("pomodoro.started room_id=%s phase=focus", room_id)
        return state

    async def stop(self, room_id: UUID, requesting_user_id: UUID) -> None:
        """Stop the Pomodoro for a room. Only the owner can stop."""
        room = await self._room_repo.get_by_id(room_id)
        if not room:
            raise ValueError("room not found")
        if room.owner_id != requesting_user_id:
            raise PermissionError("only the room owner can stop the pomodoro")

        self._cancel_rotation(room_id)

        key = self._redis_key(room_id)
        await self._redis.delete(key)

        await self._broadcast(room_id, {"type": "pomodoro.stopped"})
        logger.info("pomodoro.stopped room_id=%s", room_id)

    async def get_state(self, room_id: UUID) -> Optional[PomodoroState]:
        """Read current Pomodoro state from Redis."""
        key = self._redis_key(room_id)
        raw = await self._redis.get(key)
        if not raw:
            return None

        state = PomodoroState.from_dict(json.loads(raw))
        return state

    async def _rotate(self, room_id: UUID) -> None:
        """Called when a phase expires. Advances to next phase."""
        key = self._redis_key(room_id)
        raw = await self._redis.get(key)
        if not raw:
            return

        old_state = PomodoroState.from_dict(json.loads(raw))
        from_phase = old_state.phase
        old_index = old_state.phase_index

        # If the completed phase was focus, increment pomodoro counters
        if is_focus(old_index):
            connected_ids = self._get_connected_user_ids(room_id)
            for uid in connected_ids:
                counter_key = self._user_counter_key(uid)
                await self._redis.incr(counter_key)
            logger.info(
                "pomodoro.focus_completed room_id=%s users_credited=%d",
                room_id, len(connected_ids),
            )

        # Calculate next phase
        new_index = next_phase_index(old_index)
        new_phase = phase_name(new_index)
        new_duration = phase_duration(new_index)
        now = self._now()

        new_state = PomodoroState(
            phase=new_phase,
            started_at=now,
            duration_seconds=new_duration,
            phase_index=new_index,
            started_by=old_state.started_by,
        )

        # Update Redis
        ttl = new_duration + 10
        await self._redis.set(key, json.dumps(new_state.to_dict()), ex=ttl)

        # Schedule next rotation
        self._schedule_rotation(room_id, new_duration)

        # Broadcast phase change
        await self._broadcast(room_id, {
            "type": "pomodoro.phase_change",
            "from_phase": from_phase,
            "to_phase": new_phase,
            "state": new_state.to_dict(),
        })

        logger.info(
            "pomodoro.phase_change room_id=%s from=%s to=%s index=%d",
            room_id, from_phase, new_phase, new_index,
        )

    def _schedule_rotation(self, room_id: UUID, delay_seconds: float) -> None:
        """Schedule an asyncio task that rotates after delay_seconds."""
        async def _wait_and_rotate():
            await self._sleep(delay_seconds)
            await self._rotate(room_id)

        task = asyncio.ensure_future(_wait_and_rotate())
        self._rotation_tasks[room_id] = task

    def _cancel_rotation(self, room_id: UUID) -> None:
        """Cancel any pending rotation task for a room."""
        task = self._rotation_tasks.pop(room_id, None)
        if task and not task.done():
            task.cancel()

    async def get_user_pomodoros_completed(self, user_id: UUID) -> int:
        """Get the lifetime Pomodoro count for a user."""
        key = self._user_counter_key(user_id)
        val = await self._redis.get(key)
        return int(val) if val else 0
