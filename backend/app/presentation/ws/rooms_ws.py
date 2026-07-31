"""WebSocket endpoints for room presence and Pomodoro commands."""

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.auth_service import AuthService
from app.application.pomodoro_service import PomodoroService
from app.application.room_service import RoomService
from app.domain.user import User
from app.infrastructure.database import get_session
from app.infrastructure.redis_client import get_redis_client
from app.infrastructure.repositories.room_repository import SqlAlchemyRoomRepository
from app.infrastructure.repositories.user_repository import SqlAlchemyUserRepository
from app.presentation.api.v1.auth_routes import UserResponse

logger = logging.getLogger(__name__)

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
                    pass

    async def broadcast_to_room_except(
        self, room_id: UUID, message: dict, *, exclude: WebSocket
    ):
        """Broadcast to all connections in a room except the excluded one."""
        if room_id in self.active_connections:
            websockets = list(self.active_connections[room_id])
            for connection in websockets:
                if connection is exclude:
                    continue
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

    def get_connected_users(self, room_id: UUID) -> list[User]:
        """Return distinct users connected to a room (one entry per user).

        A single user may hold several sockets at once (React StrictMode
        remounts the effect twice, and a reconnection may briefly overlap with
        the socket it replaces). Presence is a property of the user, not of the
        socket, so deduplication happens here.
        """
        distinct: dict[UUID, User] = {}
        for ws in self.active_connections.get(room_id, set()):
            user = self.connection_users.get(ws)
            if user and user.id not in distinct:
                distinct[user.id] = user
        return list(distinct.values())

    def get_connected_user_ids(self, room_id: UUID) -> list[UUID]:
        """Return UUIDs of the distinct users currently connected to a room."""
        return [user.id for user in self.get_connected_users(room_id)]

    def count_connected_users(self, room_id: UUID) -> int:
        """Return how many distinct users are connected to a room."""
        return len(self.get_connected_users(room_id))

    def is_user_connected(self, room_id: UUID, user_id: UUID) -> bool:
        """Return whether a user still holds at least one socket in a room."""
        return any(
            user is not None and user.id == user_id
            for user in (
                self.connection_users.get(ws)
                for ws in self.active_connections.get(room_id, set())
            )
        )


manager = ConnectionManager()


@router.websocket("/rooms/{room_id}")
async def room_websocket(
    websocket: WebSocket,
    room_id: UUID,
    token: str,
    session: AsyncSession = Depends(get_session),
):
    """WebSocket endpoint for real-time room updates."""
    # 1. Verify token
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

    user_data = UserResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        is_active=user.is_active,
    ).model_dump()

    current_count = manager.count_connected_users(room_id)

    # Send initial presence state to the newly connected user
    active_users = [
        UserResponse(
            id=str(u.id),
            email=u.email,
            display_name=u.display_name,
            is_active=u.is_active,
        ).model_dump()
        for u in manager.get_connected_users(room_id)
    ]

    await websocket.send_json(
        {
            "type": "presence_state",
            "members": active_users,
            "count": current_count,
        }
    )

    # Broadcast join to OTHER users (the joining user already got presence_state)
    await manager.broadcast_to_room_except(
        room_id,
        {
            "type": "user_joined",
            "user": user_data,
            "count": current_count,
        },
        exclude=websocket,
    )

    # 4. Build PomodoroService for this connection
    redis_client = get_redis_client()
    pomodoro_service = PomodoroService(
        redis_client=redis_client,
        room_repo=room_repo,
        broadcast_fn=manager.broadcast_to_room,
        get_connected_user_ids=manager.get_connected_user_ids,
    )

    # Send current pomodoro state if active
    pom_state = await pomodoro_service.get_state(room_id)
    if pom_state:
        await websocket.send_json(
            {
                "type": "pomodoro.state",
                "state": pom_state.to_dict(),
            }
        )

    # 5. Message loop
    try:
        while True:
            text_data = await websocket.receive_text()
            try:
                data = json.loads(text_data)
                msg_type = data.get("type")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

                elif msg_type == "pomodoro.start":
                    try:
                        await pomodoro_service.start(room_id, user.id)
                    except PermissionError as e:
                        await websocket.send_json(
                            {
                                "type": "error",
                                "message": str(e),
                            }
                        )
                    except ValueError as e:
                        await websocket.send_json(
                            {
                                "type": "error",
                                "message": str(e),
                            }
                        )

                elif msg_type == "pomodoro.stop":
                    try:
                        await pomodoro_service.stop(room_id, user.id)
                    except PermissionError as e:
                        await websocket.send_json(
                            {
                                "type": "error",
                                "message": str(e),
                            }
                        )
                    except ValueError as e:
                        await websocket.send_json(
                            {
                                "type": "error",
                                "message": str(e),
                            }
                        )

                # Unknown messages silently ignored
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)

        # Solo se anuncia la salida cuando el usuario no conserva ningún otro
        # socket abierto en el room: si tiene varios, cerrar uno no es salir.
        if not manager.is_user_connected(room_id, user.id):
            await manager.broadcast_to_room(
                room_id,
                {
                    "type": "user_left",
                    "user": user_data,
                    "count": manager.count_connected_users(room_id),
                },
            )

    await redis_client.aclose()
