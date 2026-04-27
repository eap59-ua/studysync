"""Integration tests for LiveKit token generation endpoint."""

import pytest
from httpx import AsyncClient
from uuid import uuid4

from app.application.livekit_service import livekit_room_name
from app.main import app
from app.presentation.api.v1.livekit_routes import get_livekit_service
from app.infrastructure.livekit_client import LiveKitClient
from app.application.livekit_service import LiveKitService
from app.infrastructure.repositories.room_repository import SqlAlchemyRoomRepository
from app.infrastructure.database import get_session
from tests.integration.test_auth import register_user, login_user

# --- Test LiveKitClient Fake ---

class FakeLiveKitClient(LiveKitClient):
    """Fake client to inspect parameters without generating a real JWT."""
    
    def __init__(self):
        super().__init__("fake-key", "fake-secret", "wss://fake.livekit.cloud")
        self.last_identity = None
        self.last_display_name = None
        self.last_room_name = None
        self.last_ttl = None
        
    def generate_join_token(
        self,
        *,
        identity: str,
        display_name: str,
        room_name: str,
        ttl_seconds: int = 3600,
    ) -> str:
        self.last_identity = identity
        self.last_display_name = display_name
        self.last_room_name = room_name
        self.last_ttl = ttl_seconds
        return f"fake-jwt-for-{identity}-in-{room_name}"


# --- Tests ---

def test_room_name_format():
    """Unit test for room name formatting."""
    room_id = uuid4()
    assert livekit_room_name(room_id) == f"studysync-{room_id}"


@pytest.fixture
def fake_livekit_service(db_session):
    client = FakeLiveKitClient()
    repo = SqlAlchemyRoomRepository(db_session)
    return LiveKitService(livekit_client=client, room_repo=repo), client


@pytest.mark.asyncio
async def test_livekit_token_unauthenticated(client: AsyncClient):
    """Should return 401 if unauthenticated."""
    room_id = uuid4()
    resp = await client.post(f"/api/v1/rooms/{room_id}/livekit-token")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_livekit_token_for_nonexistent_room(client: AsyncClient, auth_headers: dict[str, str], fake_livekit_service):
    """Should return 404 if room does not exist."""
    service, _ = fake_livekit_service
    app.dependency_overrides[get_livekit_service] = lambda: service

    try:
        room_id = uuid4()
        resp = await client.post(f"/api/v1/rooms/{room_id}/livekit-token", headers=auth_headers)
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.pop(get_livekit_service, None)


@pytest.mark.asyncio
async def test_livekit_token_as_non_member(client: AsyncClient, auth_headers: dict[str, str], fake_livekit_service):
    """Should return 403 if user is not a member of the room."""
    service, _ = fake_livekit_service
    app.dependency_overrides[get_livekit_service] = lambda: service

    try:
        # Create room as user1 (owner)
        create_resp = await client.post("/api/v1/rooms", json={
            "name": "LiveKit Room",
            "subject": "Testing",
        }, headers=auth_headers)
        room_id = create_resp.json()["id"]

        # Register and login user2
        await register_user(client, "user2@example.com")
        login_resp = await login_user(client, "user2@example.com")
        user2_token = login_resp.json()["access_token"]
        user2_headers = {"Authorization": f"Bearer {user2_token}"}

        # user2 requests token without joining
        resp = await client.post(f"/api/v1/rooms/{room_id}/livekit-token", headers=user2_headers)
        assert resp.status_code == 403
        assert "not a member" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.pop(get_livekit_service, None)


@pytest.mark.asyncio
async def test_livekit_token_as_member(client: AsyncClient, auth_headers: dict[str, str], fake_livekit_service):
    """Should return 200 and valid data when member requests token."""
    service, fake_client = fake_livekit_service
    app.dependency_overrides[get_livekit_service] = lambda: service

    try:
        # Create room as user1
        create_resp = await client.post("/api/v1/rooms", json={
            "name": "LiveKit Room",
            "subject": "Testing",
        }, headers=auth_headers)
        room_id = create_resp.json()["id"]

        # Request token
        resp = await client.post(f"/api/v1/rooms/{room_id}/livekit-token", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()

        assert "token" in data
        assert data["url"] == "wss://fake.livekit.cloud"
        assert data["room_name"] == f"studysync-{room_id}"

        # Verify client got correct params (tests 6, 7, 8 from plan)
        # We need the user's ID to verify identity
        me_resp = await client.get("/api/v1/auth/me", headers=auth_headers)
        user_id = me_resp.json()["id"]
        user_display_name = me_resp.json()["display_name"]

        assert fake_client.last_identity == user_id
        assert fake_client.last_display_name == user_display_name
        assert fake_client.last_room_name == f"studysync-{room_id}"
        assert fake_client.last_ttl == 3600

    finally:
        app.dependency_overrides.pop(get_livekit_service, None)


@pytest.mark.asyncio
async def test_real_livekit_token_decodes():
    """Generate a token with real SDK and decode it to verify claims."""
    from livekit.api import AccessToken, TokenVerifier
    
    api_key = "fake-key"
    api_secret = "fake-secret-32-chars-min-required-here"  # Real SDK requires >= 32 chars
    
    client = LiveKitClient(api_key, api_secret, "wss://ignore.cloud")
    
    token = client.generate_join_token(
        identity="user-123",
        display_name="Test User",
        room_name="studysync-room1",
    )
    
    verifier = TokenVerifier(api_key, api_secret)
    claims = verifier.verify(token)
    
    assert claims.identity == "user-123"
    assert claims.name == "Test User"
    assert claims.video.room == "studysync-room1"
    assert claims.video.room_join is True
    assert claims.video.can_publish is True
    assert claims.video.can_subscribe is True
    assert claims.video.can_publish_data is True
