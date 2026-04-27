"""REST API endpoints for notes."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.notes_service import NotesService
from app.application.ports import FileStoragePort
from app.domain.note import Note, NoteReview
from app.domain.notes_errors import (
    AlreadyReviewedError,
    CannotReviewOwnNoteError,
    FileTooLargeError,
    InvalidRatingError,
    NoteNotFoundError,
    NotNoteOwnerError,
    UnsupportedFileTypeError,
)
from app.domain.ports import NoteRepository
from app.domain.user import User
from app.infrastructure.database import get_session
from app.infrastructure.repositories.note_repository import SqlAlchemyNoteRepository
from app.infrastructure.storage.local_disk_storage import LocalDiskFileStorage
from app.presentation.api.v1.auth_routes import get_current_user
from app.config import get_settings


router = APIRouter(prefix="/notes", tags=["notes"])

# --- Dependencies ---

def get_note_repository(session: AsyncSession = Depends(get_session)) -> NoteRepository:
    return SqlAlchemyNoteRepository(session)


def get_file_storage() -> FileStoragePort:
    settings = get_settings()
    # In a real app, you might inject this differently or use a factory
    return LocalDiskFileStorage(base_dir=settings.uploads_dir, base_url="http://localhost:8000/uploads")


def get_notes_service(
    repo: NoteRepository = Depends(get_note_repository),
    storage: FileStoragePort = Depends(get_file_storage),
) -> NotesService:
    return NotesService(note_repo=repo, storage=storage)


# --- Schemas ---

class NoteResponse(BaseModel):
    id: UUID
    owner_id: UUID
    room_id: UUID | None
    subject: str
    title: str
    description: str
    file_url: str
    file_type: str
    file_size_bytes: int
    original_filename: str

class UserResponse(BaseModel):
    id: UUID
    display_name: str

class NoteWithStatsResponse(BaseModel):
    note: NoteResponse
    owner: UserResponse
    rating_avg: float
    reviews_count: int

class PaginatedNotesResponse(BaseModel):
    items: list[NoteWithStatsResponse]
    page: int
    limit: int
    total: int

class NoteReviewResponse(BaseModel):
    id: UUID
    reviewer_id: UUID
    rating: int
    comment: str
    reviewer: UserResponse

class NoteDetailResponse(BaseModel):
    note: NoteResponse
    owner: UserResponse
    rating_avg: float
    reviews_count: int
    reviews: list[NoteReviewResponse]

class AddReviewRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = Field(None, max_length=500)


# --- Endpoints ---

@router.post("", status_code=status.HTTP_201_CREATED, response_model=NoteResponse)
async def create_note(
    subject: str = Form(..., max_length=100),
    title: str = Form(..., max_length=200),
    description: str | None = Form(None, max_length=2000),
    room_id: UUID | None = Form(None),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    service: NotesService = Depends(get_notes_service),
):
    try:
        file_bytes = await file.read()
        note = await service.create_note(
            owner_id=user.id,
            subject=subject,
            title=title,
            description=description,
            room_id=room_id,
            file_bytes=file_bytes,
            original_filename=file.filename or "unnamed",
            content_type=file.content_type or "application/octet-stream",
        )
        return NoteResponse(
            id=note.id,
            owner_id=note.owner_id,
            room_id=note.room_id,
            subject=note.subject,
            title=note.title,
            description=note.description,
            file_url=note.file_url,
            file_type=note.file_type,
            file_size_bytes=note.file_size_bytes,
            original_filename=note.original_filename,
        )
    except FileTooLargeError as e:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(e))
    except UnsupportedFileTypeError as e:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(e))


@router.get("", response_model=PaginatedNotesResponse)
async def list_notes(
    subject: str | None = Query(None),
    room_id: UUID | None = Query(None),
    sort: Literal["rating_desc", "created_desc", "created_asc"] = Query("created_desc"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    service: NotesService = Depends(get_notes_service),
):
    paginated = await service.list_notes(
        subject=subject,
        room_id=room_id,
        sort=sort,
        page=page,
        limit=limit,
    )
    
    items = []
    for item in paginated.items:
        items.append(NoteWithStatsResponse(
            note=NoteResponse(
                id=item.note.id,
                owner_id=item.note.owner_id,
                room_id=item.note.room_id,
                subject=item.note.subject,
                title=item.note.title,
                description=item.note.description,
                file_url=item.note.file_url,
                file_type=item.note.file_type,
                file_size_bytes=item.note.file_size_bytes,
                original_filename=item.note.original_filename,
            ),
            owner=UserResponse(id=item.owner.id, display_name=item.owner.display_name),
            rating_avg=item.rating_avg,
            reviews_count=item.reviews_count,
        ))
    
    return PaginatedNotesResponse(
        items=items,
        page=paginated.page,
        limit=paginated.limit,
        total=paginated.total,
    )


@router.get("/{note_id}", response_model=NoteDetailResponse)
async def get_note(
    note_id: UUID,
    service: NotesService = Depends(get_notes_service),
):
    try:
        detail = await service.get_note_with_reviews(note_id)
        
        reviews = []
        for review, reviewer in detail.reviews:
            reviews.append(NoteReviewResponse(
                id=review.id,
                reviewer_id=review.reviewer_id,
                rating=review.rating,
                comment=review.comment,
                reviewer=UserResponse(id=reviewer.id, display_name=reviewer.display_name),
            ))
            
        return NoteDetailResponse(
            note=NoteResponse(
                id=detail.note.id,
                owner_id=detail.note.owner_id,
                room_id=detail.note.room_id,
                subject=detail.note.subject,
                title=detail.note.title,
                description=detail.note.description,
                file_url=detail.note.file_url,
                file_type=detail.note.file_type,
                file_size_bytes=detail.note.file_size_bytes,
                original_filename=detail.note.original_filename,
            ),
            owner=UserResponse(id=detail.owner.id, display_name=detail.owner.display_name),
            rating_avg=detail.rating_avg,
            reviews_count=detail.reviews_count,
            reviews=reviews,
        )
    except NoteNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: UUID,
    user: User = Depends(get_current_user),
    service: NotesService = Depends(get_notes_service),
):
    try:
        await service.delete_note(note_id=note_id, requesting_user_id=user.id)
    except NoteNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    except NotNoteOwnerError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the owner of the note")


@router.post("/{note_id}/reviews", status_code=status.HTTP_201_CREATED, response_model=NoteReviewResponse)
async def add_review(
    note_id: UUID,
    request: AddReviewRequest,
    user: User = Depends(get_current_user),
    service: NotesService = Depends(get_notes_service),
):
    try:
        review = await service.add_review(
            note_id=note_id,
            reviewer_id=user.id,
            rating=request.rating,
            comment=request.comment,
        )
        return NoteReviewResponse(
            id=review.id,
            reviewer_id=review.reviewer_id,
            rating=review.rating,
            comment=review.comment,
            reviewer=UserResponse(id=user.id, display_name=user.display_name),
        )
    except InvalidRatingError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid rating")
    except NoteNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    except CannotReviewOwnNoteError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot review own note")
    except AlreadyReviewedError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already reviewed this note")
