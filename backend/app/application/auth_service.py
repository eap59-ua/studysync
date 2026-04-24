"""Authentication service — handles registration, login, and token management."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings
from app.domain.ports import UserRepository
from app.domain.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    """Use cases for authentication."""

    def __init__(self, user_repo: UserRepository) -> None:
        self._user_repo = user_repo
        self._settings = get_settings()

    async def register(self, email: str, password: str, display_name: str) -> User:
        """Register a new user. Raises ValueError if email is taken."""
        existing = await self._user_repo.get_by_email(email)
        if existing:
            raise ValueError("Email already registered")

        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters")

        user = User(
            email=email,
            display_name=display_name,
            hashed_password=pwd_context.hash(password),
        )
        return await self._user_repo.create(user)

    async def login(self, email: str, password: str) -> dict:
        """Authenticate user and return tokens. Raises ValueError on failure."""
        user = await self._user_repo.get_by_email(email)
        if not user or not pwd_context.verify(password, user.hashed_password):
            raise ValueError("Invalid email or password")

        access_token = self._create_token(
            data={"sub": str(user.id)},
            expires_delta=timedelta(minutes=self._settings.access_token_expire_minutes),
        )
        refresh_token = self._create_token(
            data={"sub": str(user.id), "type": "refresh"},
            expires_delta=timedelta(days=self._settings.refresh_token_expire_days),
        )
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": user,
        }

    async def verify_token(self, token: str) -> User:
        """Verify JWT and return the user. Raises ValueError if invalid."""
        try:
            payload = jwt.decode(token, self._settings.jwt_secret, algorithms=["HS256"])
            user_id = UUID(payload["sub"])
        except (JWTError, KeyError, ValueError) as exc:
            raise ValueError("Invalid token") from exc

        user = await self._user_repo.get_by_id(user_id)
        if not user:
            raise ValueError("User not found")
        return user

    async def refresh(self, refresh_token: str) -> dict:
        """Generate new access token from a valid refresh token."""
        try:
            payload = jwt.decode(refresh_token, self._settings.jwt_secret, algorithms=["HS256"])
            if payload.get("type") != "refresh":
                raise ValueError("Not a refresh token")
            user_id = UUID(payload["sub"])
        except (JWTError, KeyError, ValueError) as exc:
            raise ValueError("Invalid refresh token") from exc

        user = await self._user_repo.get_by_id(user_id)
        if not user:
            raise ValueError("User not found")

        access_token = self._create_token(
            data={"sub": str(user.id)},
            expires_delta=timedelta(minutes=self._settings.access_token_expire_minutes),
        )
        return {"access_token": access_token}

    def _create_token(self, data: dict, expires_delta: timedelta) -> str:
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + expires_delta
        to_encode.update({"exp": expire})
        return jwt.encode(to_encode, self._settings.jwt_secret, algorithm="HS256")
