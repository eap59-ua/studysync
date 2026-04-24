"""Room domain entity."""

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4


@dataclass
class Room:
    """Virtual study room."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    subject: str = ""
    owner_id: UUID = field(default_factory=uuid4)
    max_members: int = 8
    is_public: bool = True
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class RoomMember:
    """Association between a user and a room."""

    room_id: UUID = field(default_factory=uuid4)
    user_id: UUID = field(default_factory=uuid4)
    joined_at: datetime = field(default_factory=datetime.utcnow)
