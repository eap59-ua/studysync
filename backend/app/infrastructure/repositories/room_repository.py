"""SQLAlchemy implementation of the RoomRepository port."""

from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.ports import RoomRepository
from app.domain.room import Room, RoomMember
from app.domain.user import User
from app.infrastructure.models import RoomMemberModel, RoomModel


class SqlAlchemyRoomRepository(RoomRepository):
    """Room repository implementation using SQLAlchemy."""

    def __init__(self, session: AsyncSession):
        self.session = session

    def _to_domain(self, model: RoomModel) -> Room:
        return Room(
            id=model.id,
            name=model.name,
            subject=model.subject,
            owner_id=model.owner_id,
            max_members=model.max_members,
            is_public=model.is_public,
            created_at=model.created_at,
        )

    async def create(self, room: Room) -> Room:
        model = RoomModel(
            id=room.id,
            name=room.name,
            subject=room.subject,
            owner_id=room.owner_id,
            max_members=room.max_members,
            is_public=room.is_public,
            created_at=room.created_at,
        )
        self.session.add(model)
        await self.session.commit()
        return self._to_domain(model)

    async def get_by_id(self, room_id: UUID) -> Optional[Room]:
        model = await self.session.get(RoomModel, room_id)
        if not model:
            return None
        return self._to_domain(model)

    async def get_room_with_members(self, room_id: UUID) -> Optional[tuple[Room, list[User]]]:
        stmt = (
            select(RoomModel)
            .where(RoomModel.id == room_id)
            .options(selectinload(RoomModel.members).selectinload(RoomMemberModel.user))
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        if not model:
            return None
        
        room = self._to_domain(model)
        users = [
            User(
                id=rm.user.id,
                email=rm.user.email,
                hashed_password=rm.user.hashed_password,
                display_name=rm.user.display_name,
                is_active=rm.user.is_active,
                created_at=rm.user.created_at,
            )
            for rm in model.members
        ]
        return room, users

    async def list_public(self, skip: int = 0, limit: int = 20) -> list[Room]:
        stmt = select(RoomModel).where(RoomModel.is_public == True).offset(skip).limit(limit)
        result = await self.session.execute(stmt)
        return [self._to_domain(m) for m in result.scalars().all()]

    async def add_member(self, room_member: RoomMember) -> None:
        model = RoomMemberModel(
            room_id=room_member.room_id,
            user_id=room_member.user_id,
            joined_at=room_member.joined_at,
        )
        self.session.add(model)
        await self.session.commit()

    async def remove_member(self, room_id: UUID, user_id: UUID) -> None:
        model = await self.session.get(RoomMemberModel, (room_id, user_id))
        if model:
            await self.session.delete(model)
            await self.session.commit()

    async def count_members(self, room_id: UUID) -> int:
        stmt = select(func.count()).select_from(RoomMemberModel).where(RoomMemberModel.room_id == room_id)
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def delete(self, room_id: UUID) -> None:
        model = await self.session.get(RoomModel, room_id)
        if model:
            await self.session.delete(model)
            await self.session.commit()

    async def update(self, room: Room) -> Room:
        model = await self.session.get(RoomModel, room.id)
        if model:
            model.name = room.name
            model.subject = room.subject
            model.owner_id = room.owner_id
            model.max_members = room.max_members
            model.is_public = room.is_public
            await self.session.commit()
        return room
