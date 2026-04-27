"""Integration tests for Pomodoro server-authoritative timer.

These tests use fakeredis and a mock ConnectionManager to avoid
the event loop conflicts with Starlette TestClient / aiosqlite.

For rotation tests, we call service._rotate() directly after setting
up Redis state, rather than waiting for asyncio.sleep to expire.
"""

import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import Optional
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import fakeredis.aioredis
import pytest
from httpx import AsyncClient

from app.application.pomodoro_service import PomodoroService
from app.domain.pomodoro import (
    FOCUS_SECONDS,
    LONG_BREAK_SECONDS,
    PHASES_PER_CYCLE,
    SHORT_BREAK_SECONDS,
    PomodoroState,
    is_focus,
    next_phase_index,
    phase_duration,
    phase_name,
)
from app.domain.room import Room


# ── Helpers ────────────────────────────────────────────────────

def make_frozen_clock(initial: datetime):
    """Return a callable clock that can be advanced manually."""
    current = [initial]

    def now():
        return current[0]

    def advance(seconds: float):
        current[0] += timedelta(seconds=seconds)

    return now, advance


def make_fake_room_repo(room: Room):
    """Create a mock RoomRepository that returns the given room."""
    repo = AsyncMock()
    repo.get_by_id.return_value = room
    return repo


def make_service(
    redis_client,
    room: Room,
    broadcast_log: list,
    connected_user_ids: list[UUID],
    clock_fn=None,
):
    """Build a PomodoroService wired with fakes."""
    if clock_fn is None:
        clock_fn = lambda: datetime.now(timezone.utc)

    async def fake_broadcast(room_id: UUID, message: dict):
        broadcast_log.append(message)

    def fake_get_connected(room_id: UUID) -> list[UUID]:
        return list(connected_user_ids)

    async def never_sleep(duration: float):
        """Block forever — rotation tasks are cancelled, we call _rotate manually."""
        await asyncio.Event().wait()

    return PomodoroService(
        redis_client=redis_client,
        room_repo=make_fake_room_repo(room),
        broadcast_fn=fake_broadcast,
        get_connected_user_ids=fake_get_connected,
        now=clock_fn,
        _sleep=never_sleep,
    )


# ── Domain pure function tests ───────────────────────────────

def test_phase_cycle_names():
    """Verify the full 8-phase cycle produces correct names."""
    expected = ["focus", "short_break", "focus", "short_break",
                "focus", "short_break", "focus", "long_break"]
    for i, name in enumerate(expected):
        assert phase_name(i) == name, f"Index {i}: expected {name}, got {phase_name(i)}"


def test_next_phase_wraps_around():
    """Index 7 → 0."""
    assert next_phase_index(7) == 0
    assert next_phase_index(0) == 1


def test_is_focus():
    """Even indices (except 7) are focus."""
    assert is_focus(0) is True
    assert is_focus(1) is False
    assert is_focus(6) is True
    assert is_focus(7) is False


# ── PomodoroService tests ────────────────────────────────────

@pytest.mark.asyncio
async def test_get_state_returns_none_when_idle():
    """No Pomodoro running → get_state returns None."""
    redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    room = Room(id=uuid4(), name="Test", subject="Test", owner_id=uuid4())
    broadcasts = []
    service = make_service(redis_client, room, broadcasts, [])

    result = await service.get_state(room.id)
    assert result is None


@pytest.mark.asyncio
async def test_start_as_owner_creates_redis_state():
    """Owner starts Pomodoro → state stored in Redis."""
    redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    owner_id = uuid4()
    room = Room(id=uuid4(), name="Test", subject="Test", owner_id=owner_id)
    broadcasts = []
    now_fn, _ = make_frozen_clock(datetime(2026, 4, 27, 12, 0, 0, tzinfo=timezone.utc))
    service = make_service(redis_client, room, broadcasts, [owner_id], clock_fn=now_fn)

    state = await service.start(room.id, owner_id)

    assert state.phase == "focus"
    assert state.phase_index == 0
    assert state.duration_seconds == FOCUS_SECONDS
    assert state.started_by == owner_id

    # Verify it's in Redis
    stored = await service.get_state(room.id)
    assert stored is not None
    assert stored.phase == "focus"


@pytest.mark.asyncio
async def test_start_as_non_owner_raises_permission_error():
    """Non-owner tries to start → PermissionError."""
    redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    owner_id = uuid4()
    other_id = uuid4()
    room = Room(id=uuid4(), name="Test", subject="Test", owner_id=owner_id)
    broadcasts = []
    service = make_service(redis_client, room, broadcasts, [])

    with pytest.raises(PermissionError, match="only the room owner"):
        await service.start(room.id, other_id)


@pytest.mark.asyncio
async def test_start_broadcasts_pomodoro_state():
    """Starting broadcasts a 'pomodoro.state' message with focus phase."""
    redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    owner_id = uuid4()
    room = Room(id=uuid4(), name="Test", subject="Test", owner_id=owner_id)
    broadcasts = []
    service = make_service(redis_client, room, broadcasts, [owner_id])

    await service.start(room.id, owner_id)

    assert len(broadcasts) == 1
    msg = broadcasts[0]
    assert msg["type"] == "pomodoro.state"
    assert msg["state"]["phase"] == "focus"


@pytest.mark.asyncio
async def test_get_state_calculates_seconds_remaining():
    """After 60s, remaining should be duration - 60."""
    redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    owner_id = uuid4()
    room = Room(id=uuid4(), name="Test", subject="Test", owner_id=owner_id)
    broadcasts = []
    now_fn, advance = make_frozen_clock(datetime(2026, 4, 27, 12, 0, 0, tzinfo=timezone.utc))
    service = make_service(redis_client, room, broadcasts, [owner_id], clock_fn=now_fn)

    await service.start(room.id, owner_id)
    advance(60)

    state = await service.get_state(room.id)
    remaining = state.seconds_remaining(now_fn())
    assert remaining == pytest.approx(FOCUS_SECONDS - 60, abs=1)


@pytest.mark.asyncio
async def test_rotate_focus_to_short_break():
    """After focus phase expires → rotate to short_break."""
    redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    owner_id = uuid4()
    room = Room(id=uuid4(), name="Test", subject="Test", owner_id=owner_id)
    broadcasts = []
    now_fn, advance = make_frozen_clock(datetime(2026, 4, 27, 12, 0, 0, tzinfo=timezone.utc))
    service = make_service(redis_client, room, broadcasts, [owner_id], clock_fn=now_fn)

    await service.start(room.id, owner_id)
    broadcasts.clear()

    # Simulate time passing and rotate
    advance(FOCUS_SECONDS)
    await service._rotate(room.id)

    state = await service.get_state(room.id)
    assert state.phase == "short_break"
    assert state.phase_index == 1
    assert state.duration_seconds == SHORT_BREAK_SECONDS

    # Verify broadcast
    assert len(broadcasts) == 1
    msg = broadcasts[0]
    assert msg["type"] == "pomodoro.phase_change"
    assert msg["from_phase"] == "focus"
    assert msg["to_phase"] == "short_break"


@pytest.mark.asyncio
async def test_rotate_through_full_cycle_reaches_long_break():
    """Simulate 7 rotations → 8th phase should be long_break (index 7)."""
    redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    owner_id = uuid4()
    room = Room(id=uuid4(), name="Test", subject="Test", owner_id=owner_id)
    broadcasts = []
    now_fn, advance = make_frozen_clock(datetime(2026, 4, 27, 12, 0, 0, tzinfo=timezone.utc))
    service = make_service(redis_client, room, broadcasts, [owner_id], clock_fn=now_fn)

    await service.start(room.id, owner_id)

    # Rotate 7 times (index 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7)
    for i in range(7):
        state = await service.get_state(room.id)
        advance(state.duration_seconds)
        await service._rotate(room.id)

    state = await service.get_state(room.id)
    assert state.phase == "long_break"
    assert state.phase_index == 7
    assert state.duration_seconds == LONG_BREAK_SECONDS


@pytest.mark.asyncio
async def test_rotate_after_long_break_resets_to_focus():
    """After long_break (index 7) → next is index 0 (focus)."""
    redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    owner_id = uuid4()
    room = Room(id=uuid4(), name="Test", subject="Test", owner_id=owner_id)
    broadcasts = []
    now_fn, advance = make_frozen_clock(datetime(2026, 4, 27, 12, 0, 0, tzinfo=timezone.utc))
    service = make_service(redis_client, room, broadcasts, [owner_id], clock_fn=now_fn)

    await service.start(room.id, owner_id)

    # Rotate through full cycle (7 rotations) to reach long_break
    for _ in range(7):
        state = await service.get_state(room.id)
        advance(state.duration_seconds)
        await service._rotate(room.id)

    # Now rotate once more: long_break → focus (index 0)
    state = await service.get_state(room.id)
    advance(state.duration_seconds)
    await service._rotate(room.id)

    state = await service.get_state(room.id)
    assert state.phase == "focus"
    assert state.phase_index == 0


@pytest.mark.asyncio
async def test_stop_as_owner_clears_redis_state():
    """Owner stops → Redis state deleted."""
    redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    owner_id = uuid4()
    room = Room(id=uuid4(), name="Test", subject="Test", owner_id=owner_id)
    broadcasts = []
    service = make_service(redis_client, room, broadcasts, [owner_id])

    await service.start(room.id, owner_id)
    broadcasts.clear()

    await service.stop(room.id, owner_id)

    state = await service.get_state(room.id)
    assert state is None

    # Verify broadcast
    assert any(m["type"] == "pomodoro.stopped" for m in broadcasts)


@pytest.mark.asyncio
async def test_stop_as_non_owner_raises_permission_error():
    """Non-owner tries to stop → PermissionError."""
    redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    owner_id = uuid4()
    other_id = uuid4()
    room = Room(id=uuid4(), name="Test", subject="Test", owner_id=owner_id)
    broadcasts = []
    service = make_service(redis_client, room, broadcasts, [owner_id])

    await service.start(room.id, owner_id)

    with pytest.raises(PermissionError, match="only the room owner"):
        await service.stop(room.id, other_id)


@pytest.mark.asyncio
async def test_focus_completion_increments_user_counters():
    """When focus completes, all connected users get their counter incremented."""
    redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    owner_id = uuid4()
    user2_id = uuid4()
    room = Room(id=uuid4(), name="Test", subject="Test", owner_id=owner_id)
    broadcasts = []
    now_fn, advance = make_frozen_clock(datetime(2026, 4, 27, 12, 0, 0, tzinfo=timezone.utc))
    service = make_service(
        redis_client, room, broadcasts, [owner_id, user2_id], clock_fn=now_fn
    )

    await service.start(room.id, owner_id)
    advance(FOCUS_SECONDS)
    await service._rotate(room.id)  # focus → short_break, should increment

    count1 = await service.get_user_pomodoros_completed(owner_id)
    count2 = await service.get_user_pomodoros_completed(user2_id)
    assert count1 == 1
    assert count2 == 1


@pytest.mark.asyncio
async def test_stop_does_not_increment_counters():
    """Manual stop during focus should NOT increment counters."""
    redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    owner_id = uuid4()
    room = Room(id=uuid4(), name="Test", subject="Test", owner_id=owner_id)
    broadcasts = []
    service = make_service(redis_client, room, broadcasts, [owner_id])

    await service.start(room.id, owner_id)
    await service.stop(room.id, owner_id)

    count = await service.get_user_pomodoros_completed(owner_id)
    assert count == 0


# ── REST stats endpoint tests ────────────────────────────────

@pytest.mark.asyncio
async def test_stats_endpoint_returns_zero_for_new_user(client: AsyncClient, auth_headers: dict):
    """GET /users/me/stats for a user with no Pomodoros returns 0."""
    from app.main import app
    from app.presentation.api.v1.user_routes import get_redis

    fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    app.dependency_overrides[get_redis] = lambda: fake_redis

    try:
        resp = await client.get("/api/v1/users/me/stats", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["pomodoros_completed"] == 0
    finally:
        app.dependency_overrides.pop(get_redis, None)


@pytest.mark.asyncio
async def test_stats_endpoint_returns_counter(client: AsyncClient, auth_headers: dict):
    """GET /users/me/stats after incrementing counter returns correct count."""
    from app.main import app
    from app.presentation.api.v1.user_routes import get_redis

    fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    app.dependency_overrides[get_redis] = lambda: fake_redis

    try:
        # First get the user ID from /me
        me_resp = await client.get("/api/v1/auth/me", headers=auth_headers)
        user_id = me_resp.json()["id"]

        # Set counter directly in fakeredis
        await fake_redis.set(f"user:{user_id}:pomodoros_completed", 5)

        resp = await client.get("/api/v1/users/me/stats", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["pomodoros_completed"] == 5
    finally:
        app.dependency_overrides.pop(get_redis, None)

