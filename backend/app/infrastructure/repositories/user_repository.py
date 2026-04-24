"""SQLAlchemy implementation of the UserRepository port."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.ports import UserRepository
from app.domain.user import User
from app.infrastructure.models import UserModel


class SqlAlchemyUserRepository(UserRepository):
    """Concrete adapter for user persistence using SQLAlchemy."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, user: User) -> User:
        db_user = UserModel(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            hashed_password=user.hashed_password,
            is_active=user.is_active,
        )
        self._session.add(db_user)
        await self._session.flush()
        return self._to_domain(db_user)

    async def get_by_id(self, user_id: UUID) -> User | None:
        result = await self._session.execute(
            select(UserModel).where(UserModel.id == user_id)
        )
        db_user = result.scalar_one_or_none()
        return self._to_domain(db_user) if db_user else None

    async def get_by_email(self, email: str) -> User | None:
        result = await self._session.execute(
            select(UserModel).where(UserModel.email == email)
        )
        db_user = result.scalar_one_or_none()
        return self._to_domain(db_user) if db_user else None

    @staticmethod
    def _to_domain(model: UserModel) -> User:
        return User(
            id=model.id,
            email=model.email,
            display_name=model.display_name,
            hashed_password=model.hashed_password,
            is_active=model.is_active,
            created_at=model.created_at,
        )
