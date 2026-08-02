"""Siembra y resetea los datos de la demostración pública.

Una aplicación vacía parece rota aunque funcione perfectamente: quien entra
desde un CV tiene que encontrarse una sala con gente, apuntes valorados y el
contador de pomodoros con algo dentro.

Uso:

    python scripts/seed_demo.py            # siembra lo que falte (idempotente)
    python scripts/seed_demo.py --reset    # borra la demo y la vuelve a sembrar
    python scripts/seed_demo.py --status   # solo informa de lo que hay

Lee la misma configuración que el backend, así que para sembrar producción basta
con exportar DATABASE_URL y REDIS_URL apuntando a los servicios gestionados.
Requiere que las migraciones estén aplicadas (`alembic upgrade head`).
"""

import argparse
import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import redis.asyncio as aioredis  # noqa: E402
from sqlalchemy import delete, func, select  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.application.auth_service import password_hash  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.demo import (  # noqa: E402
    DEMO_PASSWORD,
    DEMO_ROOM_NAME,
    DEMO_ROOM_SUBJECT,
    demo_display_name,
    demo_email,
)
from app.infrastructure.models import (  # noqa: E402
    NoteModel,
    NoteReviewModel,
    RoomMemberModel,
    RoomModel,
    UserModel,
)

# Los apuntes no llevan fichero real: sembrar binarios complicaría el script y
# el disco de Render es efímero de todos modos. La ficha se ve completa y la
# descarga es lo único que no funciona en los sembrados.
DEMO_NOTES = [
    {
        "subject": "Cálculo II",
        "title": "Integrales por partes — resumen del tema 3",
        "description": "Los cinco casos típicos con un ejemplo resuelto de cada uno.",
        "filename": "integrales-por-partes.pdf",
        "size": 486_912,
        "seat": 0,
        "reviews": [
            (1, 5, "Justo lo que necesitaba para el parcial."),
            (2, 4, "Claro y al grano."),
        ],
    },
    {
        "subject": "Cálculo II",
        "title": "Series numéricas: criterios de convergencia",
        "description": "Tabla comparativa de los criterios y cuándo aplica cada uno.",
        "filename": "series-convergencia.pdf",
        "size": 331_776,
        "seat": 1,
        "reviews": [
            (0, 5, "La tabla resumen vale ella sola."),
            (3, 5, "Me salvó el examen."),
        ],
    },
    {
        "subject": "Álgebra Lineal",
        "title": "Diagonalización paso a paso",
        "description": "Con los errores más habituales señalados en rojo.",
        "filename": "diagonalizacion.pdf",
        "size": 654_336,
        "seat": 2,
        "reviews": [(0, 4, "Muy útil, aunque le faltan ejercicios.")],
    },
    {
        "subject": "Física I",
        "title": "Formulario de cinemática y dinámica",
        "description": "Una cara. Todo lo que entra en el primer parcial.",
        "filename": "formulario-fisica.md",
        "size": 12_288,
        "seat": 3,
        "reviews": [],
    },
]

# Pomodoros ya completados por cada asiento. Un contador a cero hace pensar que
# la funcionalidad no va.
DEMO_POMODOROS = [12, 7, 23, 4]


def counter_key(user_id: uuid.UUID) -> str:
    return f"user:{user_id}:pomodoros_completed"


async def get_demo_users(session: AsyncSession, seats: int) -> list[UserModel]:
    emails = [demo_email(s) for s in range(seats)]
    result = await session.execute(select(UserModel).where(UserModel.email.in_(emails)))
    users = {u.email: u for u in result.scalars()}
    return [users[e] for e in emails if e in users]


async def wipe(session: AsyncSession, redis: aioredis.Redis, seats: int) -> None:
    """Borra la demo. El orden importa: las claves foráneas no perdonan."""
    users = await get_demo_users(session, seats)
    if not users:
        print("  nada que borrar")
        return

    user_ids = [u.id for u in users]

    await session.execute(
        delete(NoteReviewModel).where(NoteReviewModel.reviewer_id.in_(user_ids))
    )
    note_ids = (
        (
            await session.execute(
                select(NoteModel.id).where(NoteModel.owner_id.in_(user_ids))
            )
        )
        .scalars()
        .all()
    )
    if note_ids:
        await session.execute(
            delete(NoteReviewModel).where(NoteReviewModel.note_id.in_(note_ids))
        )
        await session.execute(delete(NoteModel).where(NoteModel.id.in_(note_ids)))

    room_ids = (
        (
            await session.execute(
                select(RoomModel.id).where(RoomModel.owner_id.in_(user_ids))
            )
        )
        .scalars()
        .all()
    )
    if room_ids:
        await session.execute(
            delete(RoomMemberModel).where(RoomMemberModel.room_id.in_(room_ids))
        )
        await session.execute(delete(RoomModel).where(RoomModel.id.in_(room_ids)))

    await session.execute(
        delete(RoomMemberModel).where(RoomMemberModel.user_id.in_(user_ids))
    )
    await session.execute(delete(UserModel).where(UserModel.id.in_(user_ids)))
    await session.commit()

    for uid in user_ids:
        await redis.delete(counter_key(uid))

    print(f"  borrados {len(users)} usuarios de demo y sus datos")


async def seed(session: AsyncSession, redis: aioredis.Redis, seats: int) -> None:
    # ── Cuentas ──────────────────────────────────────────────
    hashed = password_hash.hash(DEMO_PASSWORD)
    users: list[UserModel] = []
    for seat in range(seats):
        email = demo_email(seat)
        existing = (
            await session.execute(select(UserModel).where(UserModel.email == email))
        ).scalar_one_or_none()
        if existing:
            users.append(existing)
            continue
        user = UserModel(
            id=uuid.uuid4(),
            email=email,
            display_name=demo_display_name(seat),
            hashed_password=hashed,
            is_active=True,
        )
        session.add(user)
        users.append(user)
    await session.commit()
    print(f"  {len(users)} cuentas de demo")

    # ── Sala pública ─────────────────────────────────────────
    room = (
        await session.execute(select(RoomModel).where(RoomModel.name == DEMO_ROOM_NAME))
    ).scalar_one_or_none()
    if room is None:
        room = RoomModel(
            id=uuid.uuid4(),
            name=DEMO_ROOM_NAME,
            subject=DEMO_ROOM_SUBJECT,
            owner_id=users[0].id,
            max_members=8,
            is_public=True,
        )
        session.add(room)
        await session.commit()

    # Todos dentro: una sala vacía no demuestra nada. El owner es el asiento 0,
    # así que es quien verá los botones de Iniciar/Parar del Pomodoro.
    for user in users:
        exists = (
            await session.execute(
                select(RoomMemberModel).where(
                    RoomMemberModel.room_id == room.id,
                    RoomMemberModel.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if exists is None:
            session.add(RoomMemberModel(room_id=room.id, user_id=user.id))
    await session.commit()
    print(f"  sala «{room.name}» con {len(users)} miembros")

    # ── Apuntes con reseñas ──────────────────────────────────
    created_notes = 0
    for spec in DEMO_NOTES:
        owner = users[spec["seat"] % len(users)]
        existing = (
            await session.execute(
                select(NoteModel).where(NoteModel.title == spec["title"])
            )
        ).scalar_one_or_none()
        if existing is not None:
            continue

        note = NoteModel(
            id=uuid.uuid4(),
            owner_id=owner.id,
            room_id=room.id,
            subject=spec["subject"],
            title=spec["title"],
            description=spec["description"],
            file_url=f"/uploads/demo/{spec['filename']}",
            file_type=spec["filename"].rsplit(".", 1)[-1],
            file_size_bytes=spec["size"],
            original_filename=spec["filename"],
        )
        session.add(note)
        await session.flush()

        for seat, rating, comment in spec["reviews"]:
            reviewer = users[seat % len(users)]
            if reviewer.id == owner.id:
                continue  # el backend rechaza valorar lo propio
            session.add(
                NoteReviewModel(
                    id=uuid.uuid4(),
                    note_id=note.id,
                    reviewer_id=reviewer.id,
                    rating=rating,
                    comment=comment,
                )
            )
        created_notes += 1
    await session.commit()
    print(f"  {created_notes} apuntes nuevos con sus reseñas")

    # ── Contador de pomodoros ────────────────────────────────
    for seat, user in enumerate(users):
        await redis.set(
            counter_key(user.id), DEMO_POMODOROS[seat % len(DEMO_POMODOROS)]
        )
    print(f"  contadores de pomodoro sembrados ({DEMO_POMODOROS[: len(users)]})")


async def status(session: AsyncSession, redis: aioredis.Redis, seats: int) -> None:
    users = await get_demo_users(session, seats)
    print(f"  cuentas de demo: {len(users)}/{seats}")
    if not users:
        return
    rooms = (
        await session.execute(
            select(func.count())
            .select_from(RoomModel)
            .where(RoomModel.name == DEMO_ROOM_NAME)
        )
    ).scalar_one()
    notes = (
        await session.execute(
            select(func.count())
            .select_from(NoteModel)
            .where(NoteModel.owner_id.in_([u.id for u in users]))
        )
    ).scalar_one()
    print(f"  sala de demo: {rooms}")
    print(f"  apuntes: {notes}")
    for user in users:
        value = await redis.get(counter_key(user.id))
        print(f"  {user.email}: {int(value) if value else 0} pomodoros")


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Siembra los datos de la demo pública."
    )
    parser.add_argument(
        "--reset", action="store_true", help="borra la demo antes de sembrar"
    )
    parser.add_argument(
        "--status", action="store_true", help="solo informa, no escribe"
    )
    args = parser.parse_args()

    settings = get_settings()
    seats = settings.demo_seats

    print(f"Base de datos: {settings.database_url.split('@')[-1]}")
    print(f"Asientos de demo: {seats}\n")

    engine = create_async_engine(settings.database_url, echo=False)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    redis = aioredis.from_url(settings.redis_url)

    try:
        async with maker() as session:
            if args.status:
                print("Estado:")
                await status(session, redis, seats)
                return
            if args.reset:
                print("Borrando:")
                await wipe(session, redis, seats)
            print("Sembrando:")
            await seed(session, redis, seats)
            print("\nEstado final:")
            await status(session, redis, seats)
    finally:
        await redis.aclose()
        await engine.dispose()

    print("\nListo. El botón «Entrar como invitado» ya tiene con qué trabajar.")


if __name__ == "__main__":
    asyncio.run(main())
