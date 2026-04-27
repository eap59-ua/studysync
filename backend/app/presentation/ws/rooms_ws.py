"""WebSocket endpoints for room presence."""

import asyncio
import json
from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.auth_service import AuthService
from app.application.room_service import RoomService
from app.domain.user import User
from app.infrastructure.database import get_session
from app.infrastructure.repositories.room_repository import SqlAlchemyRoomRepository
from app.infrastructure.repositories.user_repository import SqlAlchemyUserRepository
from app.presentation.api.v1.auth_routes import UserResponse

router = APIRouter(prefix="/ws", tags=["WebSockets"])


class ConnectionManager:
    """Manages active WebSocket connections for rooms."""

    def __init__(self):
        # room_id -> set of WebSockets
        self.active_connections: dict[UUID, set[WebSocket]] = {}
        # websocket -> User mapping for quick lookup
        self.connection_users: dict[WebSocket, User] = {}

    async def connect(self, websocket: WebSocket, room_id: UUID, user: User):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = set()
        self.active_connections[room_id].add(websocket)
        self.connection_users[websocket] = user

    def disconnect(self, websocket: WebSocket, room_id: UUID):
        if room_id in self.active_connections:
            self.active_connections[room_id].discard(websocket)
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
        self.connection_users.pop(websocket, None)

    async def broadcast_to_room(self, room_id: UUID, message: dict):
        if room_id in self.active_connections:
            websockets = list(self.active_connections[room_id])
            for connection in websockets:
                try:
                    await connection.send_json(message)
                except Exception:
                    # If sending fails, we just ignore it. 
                    # The disconnect will be handled by the read loop.
                    pass


manager = ConnectionManager()


@router.websocket("/rooms/{room_id}")
async def room_websocket(
    websocket: WebSocket,
    room_id: UUID,
    token: str,
    session: AsyncSession = Depends(get_session),
):
    """WebSocket endpoint for real-time room updates."""
    # 1. Verify token manually since this is a WS endpoint
    user_repo = SqlAlchemyUserRepository(session)
    auth_service = AuthService(user_repo)
    try:
        user = await auth_service.verify_token(token)
    except ValueError:
        await websocket.close(code=4401, reason="Invalid token")
        return

    # 2. Verify room membership
    room_repo = SqlAlchemyRoomRepository(session)
    room_service = RoomService(room_repo)
    
    room_with_members = await room_service.get_room_with_members(room_id)
    if not room_with_members:
        await websocket.close(code=4404, reason="Room not found")
        return
        
    _, members = room_with_members
    if not any(m.id == user.id for m in members):
        await websocket.close(code=4403, reason="Not a member of this room")
        return

    # 3. Accept connection
    await manager.connect(websocket, room_id, user)
    
    # Pre-compute UserResponse dictionary to broadcast
    user_data = UserResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        is_active=user.is_active,
    ).model_dump()
    
    current_count = len(manager.active_connections.get(room_id, []))
    
    # Broadcast join
    await manager.broadcast_to_room(
        room_id,
        {
            "type": "user_joined",
            "user": user_data,
            "count": current_count,
        }
    )

    # 4. Message loop
    try:
        while True:
            text_data = await websocket.receive_text()
            try:
                data = json.loads(text_data)
                msg_type = data.get("type")
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                # Ignore unknown messages as requested
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
        current_count = len(manager.active_connections.get(room_id, []))
        
        # Broadcast leave
        await manager.broadcast_to_room(
            room_id,
            {
                "type": "user_left",
                "user": user_data,
                "count": current_count,
            }
        )
