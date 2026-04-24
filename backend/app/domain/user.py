"""User domain entity."""

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4


@dataclass
class User:
    """Core user entity — no ORM or framework dependencies."""

    id: UUID = field(default_factory=uuid4)
    email: str = ""
    display_name: str = ""
    hashed_password: str = ""
    is_active: bool = True
    created_at: datetime = field(default_factory=datetime.utcnow)

    def validate_email(self) -> bool:
        """Basic email validation."""
        return "@" in self.email and "." in self.email.split("@")[-1]
