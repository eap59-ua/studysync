"""REST API routes for Room management."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.room_service import RoomService
from app.domain.user import User
from app.infrastructure.database import get_session
from app.infrastructure.repositories.room_repository import SqlAlchemyRoomRepository
from app.presentation.api.v1.auth_routes import UserResponse, get_current_user

router = APIRouter(prefix="/rooms", tags=["Rooms"])


# ── Request / Response schemas ────────────────────────────────

class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    subject: str = Field(min_length=1, max_length=100)
    max_members: int = Field(default=8, ge=2, le=20)
    is_public: bool = True


class RoomResponse(BaseModel):
    id: UUID
    name: str
    subject: str
    owner_id: UUID
    max_members: int
    is_public: bool

    model_config = {"from_attributes": True}


class RoomWithMembersResponse(RoomResponse):
    members: list[UserResponse]


def get_room_service(session: AsyncSession = Depends(get_session)) -> RoomService:
    repo = SqlAlchemyRoomRepository(session)
    return RoomService(repo)


# ── Routes ────────────────────────────────────────────────────

@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    body: RoomCreate,
    current_user: User = Depends(get_current_user),
    service: RoomService = Depends(get_room_service),
):
    try:
        room = await service.create_room(
            user=current_user,
            name=body.name,
            subject=body.subject,
            max_members=body.max_members,
            is_public=body.is_public,
        )
        return RoomResponse.model_validate(room)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


@router.get("/public", response_model=list[RoomResponse])
async def list_public_rooms(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    service: RoomService = Depends(get_room_service),
    _: User = Depends(get_current_user),
):
    rooms = await service.list_public_rooms(skip=skip, limit=limit)
    return [RoomResponse.model_validate(r) for r in rooms]


@router.get("/{room_id}", response_model=RoomWithMembersResponse)
async def get_room(
    room_id: UUID,
    service: RoomService = Depends(get_room_service),
    _: User = Depends(get_current_user),
):
    result = await service.get_room_with_members(room_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    
    room, members = result
    
    return RoomWithMembersResponse(
        id=room.id,
        name=room.name,
        subject=room.subject,
        owner_id=room.owner_id,
        max_members=room.max_members,
        is_public=room.is_public,
        members=[
            UserResponse(
                id=str(u.id), email=u.email, display_name=u.display_name, is_active=u.is_active
            )
            for u in members
        ],
    )


@router.post("/{room_id}/join", status_code=status.HTTP_200_OK)
async def join_room(
    room_id: UUID,
    current_user: User = Depends(get_current_user),
    service: RoomService = Depends(get_room_service),
):
    try:
        await service.join_room(user=current_user, room_id=room_id)
        return {"status": "joined"}
    except ValueError as e:
        msg = str(e)
        if "already joined" in msg or "room full" in msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg)
        if "room not found" in msg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


@router.post("/{room_id}/leave", status_code=status.HTTP_200_OK)
async def leave_room(
    room_id: UUID,
    current_user: User = Depends(get_current_user),
    service: RoomService = Depends(get_room_service),
):
    await service.leave_room(user=current_user, room_id=room_id)
    return {"status": "left"}
