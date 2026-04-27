"""LiveKit routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.livekit_service import LiveKitService
from app.config import get_settings
from app.domain.user import User
from app.infrastructure.database import get_session
from app.infrastructure.livekit_client import LiveKitClient
from app.infrastructure.repositories.room_repository import SqlAlchemyRoomRepository
from app.presentation.api.v1.auth_routes import get_current_user

router = APIRouter(prefix="/rooms", tags=["LiveKit"])


class LiveKitTokenResponse(BaseModel):
    token: str
    url: str
    room_name: str


def get_livekit_service(session: AsyncSession = Depends(get_session)) -> LiveKitService:
    settings = get_settings()
    if not settings.livekit_api_key or not settings.livekit_api_secret or not settings.livekit_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="LiveKit is not configured on this server.",
        )
        
    client = LiveKitClient(
        api_key=settings.livekit_api_key,
        api_secret=settings.livekit_api_secret,
        url=settings.livekit_url,
    )
    repo = SqlAlchemyRoomRepository(session)
    return LiveKitService(livekit_client=client, room_repo=repo)


@router.post("/{room_id}/livekit-token", response_model=LiveKitTokenResponse)
async def create_livekit_token(
    room_id: UUID,
    current_user: User = Depends(get_current_user),
    service: LiveKitService = Depends(get_livekit_service),
):
    """Generate a LiveKit token to join the room's audio/video session."""
    try:
        data = await service.issue_join_token(
            room_id=room_id,
            requesting_user_id=current_user.id,
            requesting_user_display_name=current_user.display_name,
        )
        return LiveKitTokenResponse(**data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
