"""Integration tests for authentication endpoints."""

import pytest
from httpx import AsyncClient


# ── Helper ────────────────────────────────────────────────────

async def register_user(client: AsyncClient, email: str = "test@example.com") -> dict:
    """Helper to register a user and return the response JSON."""
    resp = await client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "securepass123",
        "display_name": "Test User",
    })
    return resp


async def login_user(client: AsyncClient, email: str = "test@example.com") -> dict:
    """Helper to login and return the response JSON."""
    resp = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "securepass123",
    })
    return resp


# ── Registration Tests ────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_ok(client: AsyncClient):
    """Successful registration returns 201 with user data (no password)."""
    resp = await register_user(client)
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "test@example.com"
    assert data["display_name"] == "Test User"
    assert data["is_active"] is True
    assert "id" in data
    # Must NOT leak password
    assert "password" not in data
    assert "hashed_password" not in data


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    """Registering the same email twice returns 409 Conflict."""
    await register_user(client)
    resp = await register_user(client)  # same email
    assert resp.status_code == 409
    assert "already registered" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_password_too_short(client: AsyncClient):
    """Password shorter than 8 chars returns 422."""
    resp = await client.post("/api/v1/auth/register", json={
        "email": "short@example.com",
        "password": "123",
        "display_name": "Short Pass",
    })
    assert resp.status_code == 422


# ── Login Tests ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_ok(client: AsyncClient):
    """Successful login returns tokens and user info."""
    await register_user(client)
    resp = await login_user(client)
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "test@example.com"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    """Wrong password returns 401."""
    await register_user(client)
    resp = await client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_user(client: AsyncClient):
    """Login with non-existent email returns 401."""
    resp = await client.post("/api/v1/auth/login", json={
        "email": "nobody@example.com",
        "password": "doesntmatter",
    })
    assert resp.status_code == 401


# ── /me Endpoint Tests ────────────────────────────────────────

@pytest.mark.asyncio
async def test_me_with_valid_token(client: AsyncClient):
    """GET /me with valid Bearer token returns user info."""
    await register_user(client)
    login_resp = await login_user(client)
    token = login_resp.json()["access_token"]

    resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "test@example.com"
    assert data["display_name"] == "Test User"


@pytest.mark.asyncio
async def test_me_without_token(client: AsyncClient):
    """GET /me without Authorization header returns 401."""
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_with_invalid_token(client: AsyncClient):
    """GET /me with garbage token returns 401."""
    resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer this.is.garbage"},
    )
    assert resp.status_code == 401


# ── Refresh Token Tests ──────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_with_valid_token(client: AsyncClient):
    """POST /refresh with valid refresh token returns new access token."""
    await register_user(client)
    login_resp = await login_user(client)
    refresh_token = login_resp.json()["refresh_token"]

    resp = await client.post("/api/v1/auth/refresh", json={
        "refresh_token": refresh_token,
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_refresh_with_invalid_token(client: AsyncClient):
    """POST /refresh with invalid token returns 401."""
    resp = await client.post("/api/v1/auth/refresh", json={
        "refresh_token": "invalid.refresh.token",
    })
    assert resp.status_code == 401
