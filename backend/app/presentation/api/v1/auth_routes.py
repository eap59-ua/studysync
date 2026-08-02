"""Authentication routes — register, login, me, refresh, demo."""

import random

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.auth_service import AuthService
from app.config import Settings, get_settings
from app.demo import demo_email
from app.infrastructure.database import get_session
from app.infrastructure.repositories.user_repository import SqlAlchemyUserRepository

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ── Request / Response schemas ────────────────────────────────


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    is_active: bool

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserResponse


class AccessTokenResponse(BaseModel):
    access_token: str


# ── Dependency: get current user from token ───────────────────


async def get_current_user(
    authorization: str | None = Header(None, alias="Authorization"),
    session: AsyncSession = Depends(get_session),
):
    """Extract and verify JWT from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token"
        )

    token = authorization.removeprefix("Bearer ")
    repo = SqlAlchemyUserRepository(session)
    service = AuthService(repo)

    try:
        return await service.verify_token(token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )


# ── Routes ────────────────────────────────────────────────────


@router.post(
    "/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
async def register(body: RegisterRequest, session: AsyncSession = Depends(get_session)):
    repo = SqlAlchemyUserRepository(session)
    service = AuthService(repo)
    try:
        user = await service.register(body.email, body.password, body.display_name)
        return UserResponse(
            id=str(user.id),
            email=user.email,
            display_name=user.display_name,
            is_active=user.is_active,
        )
    except ValueError as e:
        if "already registered" in str(e):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, session: AsyncSession = Depends(get_session)):
    repo = SqlAlchemyUserRepository(session)
    service = AuthService(repo)
    try:
        result = await service.login(body.email, body.password)
        user = result["user"]
        return TokenResponse(
            access_token=result["access_token"],
            refresh_token=result["refresh_token"],
            user=UserResponse(
                id=str(user.id),
                email=user.email,
                display_name=user.display_name,
                is_active=user.is_active,
            ),
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )


@router.post("/demo", response_model=TokenResponse)
async def demo_login(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    """Entra con una cuenta de demostración, sin credenciales.

    Existe para que quien abra la URL pública vea la aplicación funcionando en
    vez de una pantalla de registro. Fuera del modo demo el endpoint devuelve
    404: ni siquiera se anuncia su existencia.
    """
    if not settings.demo_mode_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    repo = SqlAlchemyUserRepository(session)

    # Se reparte al azar entre los asientos del pool para que dos visitantes
    # simultáneos sean usuarios distintos: con la misma cuenta la presencia los
    # contaría como una sola persona. Se recorren en orden aleatorio y se coge
    # el primero que exista, así la demo sigue funcionando aunque el sembrado
    # haya creado menos asientos de los configurados.
    seats = list(range(max(1, settings.demo_seats)))
    random.shuffle(seats)

    user = None
    for seat in seats:
        user = await repo.get_by_email(demo_email(seat))
        if user is not None:
            break

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "El modo demo está activado pero no hay datos sembrados. "
                "Ejecuta scripts/seed_demo.py contra esta base de datos."
            ),
        )

    result = AuthService(repo).issue_session(user)
    return TokenResponse(
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
        user=UserResponse(
            id=str(user.id),
            email=user.email,
            display_name=user.display_name,
            is_active=user.is_active,
        ),
    )


@router.get("/me", response_model=UserResponse)
async def me(current_user=Depends(get_current_user)):
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        display_name=current_user.display_name,
        is_active=current_user.is_active,
    )


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh(body: RefreshRequest, session: AsyncSession = Depends(get_session)):
    repo = SqlAlchemyUserRepository(session)
    service = AuthService(repo)
    try:
        result = await service.refresh(body.refresh_token)
        return AccessTokenResponse(access_token=result["access_token"])
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )
