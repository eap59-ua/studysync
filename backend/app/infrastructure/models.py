"""SQLAlchemy ORM models — maps domain entities to database tables."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database import Base


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    owned_rooms = relationship("RoomModel", back_populates="owner", lazy="selectin")
    room_memberships = relationship("RoomMemberModel", back_populates="user", lazy="selectin")


class RoomModel(Base):
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    max_members: Mapped[int] = mapped_column(Integer, default=8)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    owner = relationship("UserModel", back_populates="owned_rooms", lazy="selectin")
    members = relationship("RoomMemberModel", back_populates="room", lazy="selectin")


class RoomMemberModel(Base):
    __tablename__ = "room_members"

    room_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("rooms.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    room = relationship("RoomModel", back_populates="members")
    user = relationship("UserModel", back_populates="room_memberships")


from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid, func, UniqueConstraint, CheckConstraint

class NoteModel(Base):
    __tablename__ = "notes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    room_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True)
    subject: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    file_url: Mapped[str] = mapped_column(String(500), default="")
    file_type: Mapped[str] = mapped_column(String(20), default="pdf")
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    original_filename: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    reviews = relationship("NoteReviewModel", back_populates="note", lazy="selectin", cascade="all, delete-orphan")


class NoteReviewModel(Base):
    __tablename__ = "note_reviews"
    __table_args__ = (
        UniqueConstraint("note_id", "reviewer_id", name="uq_note_reviewer"),
        CheckConstraint("rating BETWEEN 1 AND 5", name="chk_rating_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    note_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("notes.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    note = relationship("NoteModel", back_populates="reviews")
