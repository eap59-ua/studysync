"""Domain ports — abstract interfaces for infrastructure adapters."""
from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from app.domain.user import User
from app.domain.room import Room, RoomMember
from app.domain.note import Note, NoteReview
from dataclasses import dataclass


class UserRepository(ABC):
    """Port for user persistence."""

    @abstractmethod
    async def create(self, user: User) -> User:
        ...

    @abstractmethod
    async def get_by_id(self, user_id: UUID) -> User | None:
        ...

    @abstractmethod
    async def get_by_email(self, email: str) -> User | None:
        ...


class RoomRepository(ABC):
    """Port for room persistence."""

    @abstractmethod
    async def create(self, room: Room) -> Room:
        ...

    @abstractmethod
    async def get_by_id(self, room_id: UUID) -> Room | None:
        ...

    @abstractmethod
    async def get_room_with_members(self, room_id: UUID) -> tuple[Room, list[User]] | None:
        ...

    @abstractmethod
    async def list_public(self, skip: int = 0, limit: int = 20) -> list[Room]:
        ...

    @abstractmethod
    async def add_member(self, room_member: RoomMember) -> None:
        ...

    @abstractmethod
    async def remove_member(self, room_id: UUID, user_id: UUID) -> None:
        ...

    @abstractmethod
    async def count_members(self, room_id: UUID) -> int:
        ...

    @abstractmethod
    async def delete(self, room_id: UUID) -> None:
        ...

    @abstractmethod
    async def update(self, room: Room) -> Room:
        ...


class PaginatedNotes:
    def __init__(self, items: list['NoteWithStats'], page: int, limit: int, total: int):
        self.items = items
        self.page = page
        self.limit = limit
        self.total = total

@dataclass
class NoteWithStats:
    note: 'Note'
    owner: User
    rating_avg: float
    reviews_count: int

@dataclass
class NoteDetail:
    note: 'Note'
    owner: User
    rating_avg: float
    reviews_count: int
    reviews: list[tuple['NoteReview', User]]

class NoteRepository(ABC):
    """Port for note persistence."""

    @abstractmethod
    async def save(self, note: 'Note') -> 'Note':
        ...

    @abstractmethod
    async def get_by_id(self, note_id: UUID) -> 'Note' | None:
        ...

    @abstractmethod
    async def delete(self, note_id: UUID) -> None:
        ...

    @abstractmethod
    async def list_notes(
        self,
        *,
        subject: str | None = None,
        room_id: UUID | None = None,
        sort: str = "created_desc",
        skip: int = 0,
        limit: int = 20,
    ) -> tuple[list[NoteWithStats], int]:
        ...

    @abstractmethod
    async def get_note_with_reviews(self, note_id: UUID) -> NoteDetail | None:
        ...

    @abstractmethod
    async def add_review(self, review: 'NoteReview') -> 'NoteReview':
        ...

    @abstractmethod
    async def get_review_by_user(self, note_id: UUID, user_id: UUID) -> 'NoteReview' | None:
        ...
