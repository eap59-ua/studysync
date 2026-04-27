"""LiveKit application service."""

from uuid import UUID

from app.domain.ports import RoomRepository
from app.infrastructure.livekit_client import LiveKitClient

LIVEKIT_ROOM_PREFIX = "studysync-"


def livekit_room_name(room_id: UUID) -> str:
    """Get the LiveKit room name for a StudySync room ID."""
    return f"{LIVEKIT_ROOM_PREFIX}{room_id}"


class LiveKitService:
    """Service to issue LiveKit join tokens."""

    def __init__(self, livekit_client: LiveKitClient, room_repo: RoomRepository):
        self._client = livekit_client
        self._room_repo = room_repo

    async def issue_join_token(
        self,
        *,
        room_id: UUID,
        requesting_user_id: UUID,
        requesting_user_display_name: str,
    ) -> dict:
        """Issue a LiveKit token for an authenticated room member."""
        room_with_members = await self._room_repo.get_room_with_members(room_id)
        if not room_with_members:
            raise ValueError("Room not found")

        room, members = room_with_members
        
        is_member = any(m.id == requesting_user_id for m in members)
        if not is_member:
            raise PermissionError("User is not a member of this room")

        room_name = livekit_room_name(room_id)
        
        token = self._client.generate_join_token(
            identity=str(requesting_user_id),
            display_name=requesting_user_display_name,
            room_name=room_name,
        )

        return {
            "token": token,
            "url": self._client.url,
            "room_name": room_name,
        }
