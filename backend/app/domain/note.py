"""Note domain entity."""

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4


@dataclass
class Note:
    """Study note uploaded by a user."""

    id: UUID = field(default_factory=uuid4)
    owner_id: UUID = field(default_factory=uuid4)
    room_id: UUID | None = None
    subject: str = ""
    title: str = ""
    description: str = ""
    file_url: str = ""
    file_type: str = "pdf"  # pdf | image | markdown
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class NoteReview:
    """Peer review of a study note."""

    id: UUID = field(default_factory=uuid4)
    note_id: UUID = field(default_factory=uuid4)
    reviewer_id: UUID = field(default_factory=uuid4)
    rating: int = 5  # 1-5
    comment: str = ""
    created_at: datetime = field(default_factory=datetime.utcnow)

    def validate_rating(self) -> bool:
        return 1 <= self.rating <= 5
