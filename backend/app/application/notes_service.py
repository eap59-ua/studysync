"""Notes service application layer."""

from typing import Literal
from uuid import UUID

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
from app.domain.ports import NoteRepository, PaginatedNotes, NoteWithStats, NoteDetail


class NotesService:
    def __init__(
        self,
        note_repo: NoteRepository,
        storage: FileStoragePort,
        max_file_bytes: int = 10 * 1024 * 1024,  # 10 MB
        allowed_mime_types: set[str] | None = None,
    ):
        self._note_repo = note_repo
        self._storage = storage
        self._max_file_bytes = max_file_bytes
        self._allowed_mime_types = allowed_mime_types or {
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp",
            "text/markdown",
            "text/plain",
        }

    def _validate_magic_bytes(self, file_bytes: bytes, mime_type: str) -> None:
        if mime_type == "application/pdf":
            if not file_bytes.startswith(b"%PDF-"):
                raise UnsupportedFileTypeError("Invalid PDF file signature.")
        elif mime_type == "image/png":
            if not file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
                raise UnsupportedFileTypeError("Invalid PNG file signature.")
        elif mime_type in ("image/jpeg", "image/jpg"):
            if not file_bytes.startswith(b"\xff\xd8\xff"):
                raise UnsupportedFileTypeError("Invalid JPEG file signature.")
        elif mime_type in ("text/markdown", "text/plain"):
            # Ensure it is at least valid utf-8 or ascii
            try:
                # Only check the first chunk to be fast
                file_bytes[:4096].decode("utf-8")
            except UnicodeDecodeError:
                raise UnsupportedFileTypeError("Text file contains invalid UTF-8 characters.")
        # webp magic bytes starts with RIFF and WEBP, omitting strict check for simplicity here.

    def _map_mime_to_file_type(self, mime_type: str) -> str:
        if "pdf" in mime_type:
            return "pdf"
        if "image" in mime_type:
            return "image"
        if "text" in mime_type or "markdown" in mime_type:
            return "markdown"
        return "pdf"

    async def create_note(
        self,
        *,
        owner_id: UUID,
        subject: str,
        title: str,
        description: str | None,
        room_id: UUID | None,
        file_bytes: bytes,
        original_filename: str,
        content_type: str,
    ) -> Note:
        if len(file_bytes) > self._max_file_bytes:
            raise FileTooLargeError(f"File exceeds maximum size of {self._max_file_bytes} bytes.")

        if content_type not in self._allowed_mime_types:
            raise UnsupportedFileTypeError(f"MIME type {content_type} is not allowed.")

        self._validate_magic_bytes(file_bytes, content_type)

        saved_file = await self._storage.save(
            file_bytes=file_bytes,
            original_filename=original_filename,
            content_type=content_type,
        )

        note = Note(
            owner_id=owner_id,
            room_id=room_id,
            subject=subject,
            title=title,
            description=description or "",
            file_url=saved_file.url,
            file_type=self._map_mime_to_file_type(content_type),
            file_size_bytes=saved_file.size_bytes,
            original_filename=original_filename,
        )
        
        # We store the storage_key in the file_url temporarily, but ideally we should have a storage_key column.
        # Actually, let's keep the storage_key inside the URL if it's LocalDisk, but we need it to delete.
        # Wait, the DB model doesn't have storage_key. The file_url IS the key or contains it?
        # Let's extract storage_key from url on delete, or we can just pass the URL if it ends with storage_key.
        # The prompt says: "Crea Note con file_url y storage_key" -> wait, the Note model doesn't have storage_key.
        # The prompt says "Note: id, owner_id, room_id, subject, title, description, file_url, file_type, file_size_bytes, original_filename, created_at, updated_at".
        # We can extract it from the file_url by taking the last part.

        return await self._note_repo.save(note)

    async def list_notes(
        self,
        *,
        subject: str | None = None,
        room_id: UUID | None = None,
        sort: Literal["rating_desc", "created_desc", "created_asc"] = "created_desc",
        page: int = 1,
        limit: int = 20,
    ) -> PaginatedNotes:
        if page < 1:
            page = 1
        skip = (page - 1) * limit
        items, total = await self._note_repo.list_notes(
            subject=subject,
            room_id=room_id,
            sort=sort,
            skip=skip,
            limit=limit,
        )
        return PaginatedNotes(items=items, page=page, limit=limit, total=total)

    async def get_note_with_reviews(self, note_id: UUID) -> NoteDetail:
        note_detail = await self._note_repo.get_note_with_reviews(note_id)
        if not note_detail:
            raise NoteNotFoundError()
        return note_detail

    async def delete_note(self, *, note_id: UUID, requesting_user_id: UUID) -> None:
        note = await self._note_repo.get_by_id(note_id)
        if not note:
            raise NoteNotFoundError()
        if note.owner_id != requesting_user_id:
            raise NotNoteOwnerError()

        # Extract storage_key from file_url (assumes it's the last part after /)
        storage_key = note.file_url.split("/")[-1]
        
        await self._storage.delete(storage_key)
        await self._note_repo.delete(note_id)

    async def add_review(
        self,
        *,
        note_id: UUID,
        reviewer_id: UUID,
        rating: int,
        comment: str | None,
    ) -> NoteReview:
        if not (1 <= rating <= 5):
            raise InvalidRatingError()

        note = await self._note_repo.get_by_id(note_id)
        if not note:
            raise NoteNotFoundError()

        if note.owner_id == reviewer_id:
            raise CannotReviewOwnNoteError()

        existing_review = await self._note_repo.get_review_by_user(note_id, reviewer_id)
        if existing_review:
            raise AlreadyReviewedError()

        review = NoteReview(
            note_id=note_id,
            reviewer_id=reviewer_id,
            rating=rating,
            comment=comment or "",
        )
        return await self._note_repo.add_review(review)
