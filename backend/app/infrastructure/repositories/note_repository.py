"""SQLAlchemy implementation of the NoteRepository port."""

from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.note import Note, NoteReview
from app.domain.ports import NoteRepository, NoteWithStats, NoteDetail
from app.domain.user import User
from app.infrastructure.models import NoteModel, NoteReviewModel, UserModel


class SqlAlchemyNoteRepository(NoteRepository):
    """Note repository implementation using SQLAlchemy."""

    def __init__(self, session: AsyncSession):
        self.session = session

    def _to_domain_note(self, model: NoteModel) -> Note:
        return Note(
            id=model.id,
            owner_id=model.owner_id,
            room_id=model.room_id,
            subject=model.subject,
            title=model.title,
            description=model.description,
            file_url=model.file_url,
            file_type=model.file_type,
            file_size_bytes=model.file_size_bytes,
            original_filename=model.original_filename,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    def _to_domain_review(self, model: NoteReviewModel) -> NoteReview:
        return NoteReview(
            id=model.id,
            note_id=model.note_id,
            reviewer_id=model.reviewer_id,
            rating=model.rating,
            comment=model.comment,
            created_at=model.created_at,
        )

    def _to_domain_user(self, model: UserModel) -> User:
        return User(
            id=model.id,
            email=model.email,
            hashed_password=model.hashed_password,
            display_name=model.display_name,
            is_active=model.is_active,
            created_at=model.created_at,
        )

    async def save(self, note: Note) -> Note:
        model = await self.session.get(NoteModel, note.id)
        if model:
            model.owner_id = note.owner_id
            model.room_id = note.room_id
            model.subject = note.subject
            model.title = note.title
            model.description = note.description
            model.file_url = note.file_url
            model.file_type = note.file_type
            model.file_size_bytes = note.file_size_bytes
            model.original_filename = note.original_filename
            model.created_at = note.created_at
            model.updated_at = note.updated_at
        else:
            model = NoteModel(
                id=note.id,
                owner_id=note.owner_id,
                room_id=note.room_id,
                subject=note.subject,
                title=note.title,
                description=note.description,
                file_url=note.file_url,
                file_type=note.file_type,
                file_size_bytes=note.file_size_bytes,
                original_filename=note.original_filename,
                created_at=note.created_at,
                updated_at=note.updated_at,
            )
            self.session.add(model)
        await self.session.commit()
        return self._to_domain_note(model)

    async def get_by_id(self, note_id: UUID) -> Optional[Note]:
        model = await self.session.get(NoteModel, note_id)
        if not model:
            return None
        return self._to_domain_note(model)

    async def delete(self, note_id: UUID) -> None:
        model = await self.session.get(NoteModel, note_id)
        if model:
            await self.session.delete(model)
            await self.session.commit()

    async def list_notes(
        self,
        *,
        subject: str | None = None,
        room_id: UUID | None = None,
        sort: str = "created_desc",
        skip: int = 0,
        limit: int = 20,
    ) -> tuple[list[NoteWithStats], int]:
        
        # Subquery for ratings
        reviews_sq = (
            select(
                NoteReviewModel.note_id,
                func.avg(NoteReviewModel.rating).label("rating_avg"),
                func.count(NoteReviewModel.id).label("reviews_count")
            )
            .group_by(NoteReviewModel.note_id)
            .subquery()
        )

        # Base query joining user and subquery
        stmt = (
            select(NoteModel, UserModel, reviews_sq.c.rating_avg, reviews_sq.c.reviews_count)
            .join(UserModel, NoteModel.owner_id == UserModel.id)
            .outerjoin(reviews_sq, NoteModel.id == reviews_sq.c.note_id)
        )

        # Filters
        if subject:
            stmt = stmt.where(NoteModel.subject == subject)
        if room_id:
            stmt = stmt.where(NoteModel.room_id == room_id)

        # Sorting
        if sort == "rating_desc":
            # Treat NULLs as 0 for sorting
            stmt = stmt.order_by(func.coalesce(reviews_sq.c.rating_avg, 0).desc(), NoteModel.created_at.desc())
        elif sort == "created_asc":
            stmt = stmt.order_by(NoteModel.created_at.asc())
        else:  # default created_desc
            stmt = stmt.order_by(NoteModel.created_at.desc())

        # Count total
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = await self.session.scalar(count_stmt) or 0

        # Pagination
        stmt = stmt.offset(skip).limit(limit)

        result = await self.session.execute(stmt)
        rows = result.all()

        items = []
        for note_model, user_model, avg_rating, count in rows:
            items.append(NoteWithStats(
                note=self._to_domain_note(note_model),
                owner=self._to_domain_user(user_model),
                rating_avg=float(avg_rating) if avg_rating is not None else 0.0,
                reviews_count=count or 0,
            ))

        return items, total

    async def get_note_with_reviews(self, note_id: UUID) -> Optional[NoteDetail]:
        # Query note and owner
        note_stmt = (
            select(NoteModel, UserModel)
            .join(UserModel, NoteModel.owner_id == UserModel.id)
            .where(NoteModel.id == note_id)
        )
        result = await self.session.execute(note_stmt)
        row = result.first()
        if not row:
            return None
            
        note_model, owner_model = row

        # Query reviews and their authors
        reviews_stmt = (
            select(NoteReviewModel, UserModel)
            .join(UserModel, NoteReviewModel.reviewer_id == UserModel.id)
            .where(NoteReviewModel.note_id == note_id)
            .order_by(NoteReviewModel.created_at.desc())
        )
        reviews_result = await self.session.execute(reviews_stmt)
        reviews_rows = reviews_result.all()

        reviews_list = []
        total_rating = 0
        for review_model, reviewer_model in reviews_rows:
            total_rating += review_model.rating
            reviews_list.append((
                self._to_domain_review(review_model),
                self._to_domain_user(reviewer_model)
            ))
            
        count = len(reviews_list)
        avg = total_rating / count if count > 0 else 0.0

        return NoteDetail(
            note=self._to_domain_note(note_model),
            owner=self._to_domain_user(owner_model),
            rating_avg=avg,
            reviews_count=count,
            reviews=reviews_list
        )

    async def add_review(self, review: NoteReview) -> NoteReview:
        model = await self.session.get(NoteReviewModel, review.id)
        if model:
            model.rating = review.rating
            model.comment = review.comment
        else:
            model = NoteReviewModel(
                id=review.id,
                note_id=review.note_id,
                reviewer_id=review.reviewer_id,
                rating=review.rating,
                comment=review.comment,
                created_at=review.created_at,
            )
            self.session.add(model)
        await self.session.commit()
        return self._to_domain_review(model)

    async def get_review_by_user(self, note_id: UUID, user_id: UUID) -> Optional[NoteReview]:
        stmt = select(NoteReviewModel).where(
            NoteReviewModel.note_id == note_id,
            NoteReviewModel.reviewer_id == user_id
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        if not model:
            return None
        return self._to_domain_review(model)
