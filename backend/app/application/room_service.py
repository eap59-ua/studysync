"""Room application service."""

from typing import Optional
from uuid import UUID

from app.domain.ports import RoomRepository
from app.domain.room import Room, RoomMember
from app.domain.user import User


class RoomService:
    """Service for handling room business logic."""

    def __init__(self, room_repo: RoomRepository):
        self.room_repo = room_repo

    async def create_room(
        self, user: User, name: str, subject: str, max_members: int = 8, is_public: bool = True
    ) -> Room:
        """Create a new room and add the creator as the first member."""
        if not (2 <= max_members <= 20):
            raise ValueError("max_members must be between 2 and 20")

        room = Room(
            name=name,
            subject=subject,
            owner_id=user.id,
            max_members=max_members,
            is_public=is_public,
        )
        created_room = await self.room_repo.create(room)

        # Add owner as first member
        member = RoomMember(room_id=created_room.id, user_id=user.id)
        await self.room_repo.add_member(member)

        return created_room

    async def list_public_rooms(self, skip: int = 0, limit: int = 20) -> list[Room]:
        """List public rooms with pagination."""
        return await self.room_repo.list_public(skip=skip, limit=limit)

    async def join_room(self, user: User, room_id: UUID) -> None:
        """Join a room, checking capacity limits."""
        room = await self.room_repo.get_by_id(room_id)
        if not room:
            raise ValueError("room not found")

        room_with_members = await self.room_repo.get_room_with_members(room_id)
        if not room_with_members:
            raise ValueError("room not found")
        
        _, members = room_with_members
        if any(m.id == user.id for m in members):
            raise ValueError("already joined")

        if len(members) >= room.max_members:
            raise ValueError("room full")

        member = RoomMember(room_id=room_id, user_id=user.id)
        await self.room_repo.add_member(member)

    async def leave_room(self, user: User, room_id: UUID) -> None:
        """Leave a room. Transfer ownership or delete if empty."""
        room_with_members = await self.room_repo.get_room_with_members(room_id)
        if not room_with_members:
            return

        room, members = room_with_members
        
        # Check if user is actually in the room
        if not any(m.id == user.id for m in members):
            return

        await self.room_repo.remove_member(room_id, user.id)

        # If it was the last member, delete the room
        if len(members) == 1:
            await self.room_repo.delete(room_id)
            return

        # If owner left but there are others, transfer ownership to the oldest member
        if room.owner_id == user.id:
            # Re-fetch members to get the new list without the leaving user, 
            # but since we already have the list we can just filter it and sort
            # In a real app we'd sort by joined_at. We'll pick the first available.
            remaining = [m for m in members if m.id != user.id]
            if remaining:
                room.owner_id = remaining[0].id
                await self.room_repo.update(room)

    async def get_room_with_members(self, room_id: UUID) -> Optional[tuple[Room, list[User]]]:
        """Get room details along with its member list."""
        return await self.room_repo.get_room_with_members(room_id)

    async def get_room(self, room_id: UUID) -> Optional[Room]:
        """Get just the room entity."""
        return await self.room_repo.get_by_id(room_id)
