"""Integration tests for Notes module."""

import pytest
from httpx import AsyncClient
from uuid import uuid4

from app.application.notes_service import NotesService
from app.infrastructure.storage.in_memory_storage import InMemoryFileStorage
from app.infrastructure.repositories.note_repository import SqlAlchemyNoteRepository
from app.main import app
from app.presentation.api.v1.notes_routes import get_notes_service
from tests.integration.test_auth import register_user, login_user

# --- Fixtures ---

@pytest.fixture
def memory_storage():
    return InMemoryFileStorage()

@pytest.fixture
def override_notes_service(db_session, memory_storage):
    repo = SqlAlchemyNoteRepository(db_session)
    service = NotesService(note_repo=repo, storage=memory_storage)
    app.dependency_overrides[get_notes_service] = lambda: service
    yield service
    app.dependency_overrides.pop(get_notes_service, None)

# --- Upload Tests ---

@pytest.mark.asyncio
async def test_create_note_unauthenticated(client: AsyncClient):
    resp = await client.post("/api/v1/notes", data={"subject": "Math", "title": "Test"}, files={"file": ("test.pdf", b"%PDF-test", "application/pdf")})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_note_with_valid_pdf(client: AsyncClient, auth_headers: dict[str, str], override_notes_service):
    files = {"file": ("notes.pdf", b"%PDF-1.4...", "application/pdf")}
    data = {"subject": "Calculus", "title": "Derivatives"}
    
    resp = await client.post("/api/v1/notes", data=data, files=files, headers=auth_headers)
    assert resp.status_code == 201
    json = resp.json()
    assert json["subject"] == "Calculus"
    assert json["file_type"] == "pdf"
    assert "url" not in json  # it's file_url
    assert json["file_url"].startswith("http://testserver/uploads/")


@pytest.mark.asyncio
async def test_create_note_with_valid_image(client: AsyncClient, auth_headers: dict[str, str], override_notes_service):
    files = {"file": ("diagram.png", b"\x89PNG\r\n\x1a\n...", "image/png")}
    data = {"subject": "Physics", "title": "Forces"}
    
    resp = await client.post("/api/v1/notes", data=data, files=files, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["file_type"] == "image"


@pytest.mark.asyncio
async def test_create_note_with_text_file_as_markdown(client: AsyncClient, auth_headers: dict[str, str], override_notes_service):
    files = {"file": ("notes.txt", b"Hello world", "text/plain")}
    data = {"subject": "Programming", "title": "Intro"}
    
    resp = await client.post("/api/v1/notes", data=data, files=files, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["file_type"] == "markdown"


@pytest.mark.asyncio
async def test_create_note_with_invalid_mime_type(client: AsyncClient, auth_headers: dict[str, str], override_notes_service):
    files = {"file": ("notes.zip", b"PK\x03\x04", "application/zip")}
    data = {"subject": "Bad", "title": "File"}
    
    resp = await client.post("/api/v1/notes", data=data, files=files, headers=auth_headers)
    assert resp.status_code == 415


@pytest.mark.asyncio
async def test_create_note_with_oversized_file(client: AsyncClient, auth_headers: dict[str, str], override_notes_service):
    # Set max size to 10 bytes for test
    override_notes_service._max_file_bytes = 10
    
    files = {"file": ("big.pdf", b"%PDF-1.4... too big", "application/pdf")}
    data = {"subject": "Too", "title": "Big"}
    
    resp = await client.post("/api/v1/notes", data=data, files=files, headers=auth_headers)
    assert resp.status_code == 413


@pytest.mark.asyncio
async def test_create_note_with_pdf_having_wrong_magic_bytes(client: AsyncClient, auth_headers: dict[str, str], override_notes_service):
    # MIME says PDF, but bytes say "Not a PDF"
    files = {"file": ("fake.pdf", b"Not a PDF", "application/pdf")}
    data = {"subject": "Fake", "title": "PDF"}
    
    resp = await client.post("/api/v1/notes", data=data, files=files, headers=auth_headers)
    assert resp.status_code == 415


@pytest.mark.asyncio
async def test_create_note_can_have_null_room_id(client: AsyncClient, auth_headers: dict[str, str], override_notes_service):
    files = {"file": ("notes.txt", b"Hello world", "text/plain")}
    data = {"subject": "Programming", "title": "Intro"}
    
    resp = await client.post("/api/v1/notes", data=data, files=files, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["room_id"] is None


# --- List & Filters ---

@pytest.fixture
async def sample_notes(client: AsyncClient, auth_headers: dict[str, str], override_notes_service):
    notes = []
    for i in range(3):
        resp = await client.post(
            "/api/v1/notes",
            data={"subject": f"Subj{i}", "title": f"Title {i}"},
            files={"file": ("notes.txt", b"Hello", "text/plain")},
            headers=auth_headers
        )
        notes.append(resp.json())
    return notes


@pytest.mark.asyncio
async def test_list_notes_filters_by_subject(client: AsyncClient, auth_headers: dict[str, str], sample_notes):
    resp = await client.get("/api/v1/notes?subject=Subj1", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["note"]["subject"] == "Subj1"


@pytest.mark.asyncio
async def test_list_notes_sort_by_rating_desc(client: AsyncClient, auth_headers: dict[str, str], sample_notes):
    # Create another user to leave reviews
    await register_user(client, "reviewer@example.com")
    rev_resp = await login_user(client, "reviewer@example.com")
    rev_token = rev_resp.json()["access_token"]
    rev_headers = {"Authorization": f"Bearer {rev_token}"}

    # Review Note 0 with 1 star
    await client.post(f"/api/v1/notes/{sample_notes[0]['id']}/reviews", json={"rating": 1}, headers=rev_headers)
    # Review Note 2 with 5 stars
    await client.post(f"/api/v1/notes/{sample_notes[2]['id']}/reviews", json={"rating": 5}, headers=rev_headers)
    # Note 1 has no reviews (0 avg)

    resp = await client.get("/api/v1/notes?sort=rating_desc", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    
    # We have other notes in the DB potentially from other tests, so we filter our sample notes
    sample_ids = [n["id"] for n in sample_notes]
    filtered_items = [i for i in items if i["note"]["id"] in sample_ids]
    
    assert len(filtered_items) >= 3
    assert filtered_items[0]["note"]["id"] == sample_notes[2]["id"]  # 5 stars
    assert filtered_items[1]["note"]["id"] == sample_notes[0]["id"]  # 1 star
    assert filtered_items[2]["note"]["id"] == sample_notes[1]["id"]  # 0 stars


@pytest.mark.asyncio
async def test_list_notes_pagination(client: AsyncClient, auth_headers: dict[str, str], override_notes_service):
    # Create 25 notes
    for i in range(25):
        await client.post(
            "/api/v1/notes",
            data={"subject": "Pagination", "title": f"Note {i}"},
            files={"file": ("notes.txt", b"Hello", "text/plain")},
            headers=auth_headers
        )
        
    resp = await client.get("/api/v1/notes?subject=Pagination&limit=20&page=1", headers=auth_headers)
    data = resp.json()
    assert len(data["items"]) == 20
    assert data["total"] == 25
    assert data["page"] == 1


# --- Detail ---

@pytest.mark.asyncio
async def test_get_note_returns_reviews_and_avg_rating(client: AsyncClient, auth_headers: dict[str, str], sample_notes):
    await register_user(client, "detail_rev@example.com")
    rev_resp = await login_user(client, "detail_rev@example.com")
    rev_headers = {"Authorization": f"Bearer {rev_resp.json()['access_token']}"}

    note_id = sample_notes[1]["id"]
    await client.post(f"/api/v1/notes/{note_id}/reviews", json={"rating": 4, "comment": "Good"}, headers=rev_headers)

    resp = await client.get(f"/api/v1/notes/{note_id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    
    assert data["rating_avg"] == 4.0
    assert data["reviews_count"] == 1
    assert len(data["reviews"]) == 1
    assert data["reviews"][0]["comment"] == "Good"


@pytest.mark.asyncio
async def test_get_note_not_found(client: AsyncClient, auth_headers: dict[str, str], override_notes_service):
    resp = await client.get(f"/api/v1/notes/{uuid4()}", headers=auth_headers)
    assert resp.status_code == 404


# --- Delete ---

@pytest.mark.asyncio
async def test_delete_note_as_owner_removes_from_db_and_storage(client: AsyncClient, auth_headers: dict[str, str], memory_storage, override_notes_service):
    # Create
    create_resp = await client.post(
        "/api/v1/notes",
        data={"subject": "DeleteMe", "title": "Del"},
        files={"file": ("notes.txt", b"Bye", "text/plain")},
        headers=auth_headers
    )
    note_id = create_resp.json()["id"]
    file_url = create_resp.json()["file_url"]
    storage_key = file_url.split("/")[-1]
    
    # Assert exists in storage
    assert storage_key in memory_storage._storage
    
    # Delete
    del_resp = await client.delete(f"/api/v1/notes/{note_id}", headers=auth_headers)
    assert del_resp.status_code == 204
    
    # Assert removed from DB
    get_resp = await client.get(f"/api/v1/notes/{note_id}", headers=auth_headers)
    assert get_resp.status_code == 404
    
    # Assert removed from storage
    assert storage_key not in memory_storage._storage


@pytest.mark.asyncio
async def test_delete_note_as_non_owner(client: AsyncClient, auth_headers: dict[str, str], sample_notes):
    await register_user(client, "hacker@example.com")
    hack_resp = await login_user(client, "hacker@example.com")
    hack_headers = {"Authorization": f"Bearer {hack_resp.json()['access_token']}"}

    resp = await client.delete(f"/api/v1/notes/{sample_notes[0]['id']}", headers=hack_headers)
    assert resp.status_code == 403


# --- Reviews ---

@pytest.mark.asyncio
async def test_review_note_ok(client: AsyncClient, auth_headers: dict[str, str], sample_notes):
    await register_user(client, "revok@example.com")
    rev_resp = await login_user(client, "revok@example.com")
    rev_headers = {"Authorization": f"Bearer {rev_resp.json()['access_token']}"}

    resp = await client.post(f"/api/v1/notes/{sample_notes[0]['id']}/reviews", json={"rating": 5}, headers=rev_headers)
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_review_own_note_fails(client: AsyncClient, auth_headers: dict[str, str], sample_notes):
    resp = await client.post(f"/api/v1/notes/{sample_notes[0]['id']}/reviews", json={"rating": 5}, headers=auth_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_review_twice_fails(client: AsyncClient, auth_headers: dict[str, str], sample_notes):
    await register_user(client, "revtwice@example.com")
    rev_resp = await login_user(client, "revtwice@example.com")
    rev_headers = {"Authorization": f"Bearer {rev_resp.json()['access_token']}"}

    await client.post(f"/api/v1/notes/{sample_notes[0]['id']}/reviews", json={"rating": 5}, headers=rev_headers)
    resp = await client.post(f"/api/v1/notes/{sample_notes[0]['id']}/reviews", json={"rating": 4}, headers=rev_headers)
    
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_review_with_invalid_rating(client: AsyncClient, auth_headers: dict[str, str], sample_notes):
    await register_user(client, "revinv@example.com")
    rev_resp = await login_user(client, "revinv@example.com")
    rev_headers = {"Authorization": f"Bearer {rev_resp.json()['access_token']}"}

    resp = await client.post(f"/api/v1/notes/{sample_notes[0]['id']}/reviews", json={"rating": 6}, headers=rev_headers)
    assert resp.status_code == 422


# --- Storage Unit Tests ---

@pytest.mark.asyncio
async def test_in_memory_storage_save_returns_url_and_key():
    storage = InMemoryFileStorage()
    saved = await storage.save(file_bytes=b"test", original_filename="test.txt", content_type="text/plain")
    
    assert saved.url.endswith(saved.storage_key)
    assert saved.size_bytes == 4
    assert saved.storage_key in storage._storage


@pytest.mark.asyncio
async def test_in_memory_storage_delete_removes_file():
    storage = InMemoryFileStorage()
    saved = await storage.save(file_bytes=b"test", original_filename="test.txt", content_type="text/plain")
    
    assert saved.storage_key in storage._storage
    await storage.delete(saved.storage_key)
    assert saved.storage_key not in storage._storage
