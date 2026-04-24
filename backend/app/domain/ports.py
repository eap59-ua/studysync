"""Domain ports — abstract interfaces for infrastructure adapters."""

from abc import ABC, abstractmethod
from uuid import UUID

from app.domain.user import User


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
    """Port for room persistence — to be implemented in Phase 2."""

    ...


class NoteRepository(ABC):
    """Port for note persistence — to be implemented in Phase 5."""

    ...
