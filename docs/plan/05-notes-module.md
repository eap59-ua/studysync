# Prompt 5 — Módulo de Notes (apuntes con reseñas)

> **Precondición:** Prompts 0-4 completados. 46 tests verdes, último commit `12e42e8`. LiveKit backend funciona y los descubrimientos del SDK están documentados.

## Por qué este prompt cierra el backend del MVP

Tras este prompt el backend de StudySync queda **completo** para el MVP: auth + rooms + pomodoro + video + notes. El siguiente paso será frontend (Prompts 6-8), donde por fin haremos UI.

Esto significa: pon el listón alto en este prompt. Tests rigurosos, capas limpias, errores bien mapeados. Lo que dejes aquí lo va a consumir el frontend tal cual.

## Objetivo del slice

Implementar:
1. Subida de apuntes (PDF, imagen, markdown) asociados a una asignatura — opcionalmente a un room concreto
2. Listado con filtros y orden por rating
3. Reseñas por compañeros (rating 1-5 + comentario)
4. Cálculo de rating medio on-demand

**Fuera de scope:**
- OCR de PDFs (post-MVP)
- Versionado de apuntes (post-MVP)
- Comentarios anidados / threads (sobreingeniería)
- Notificaciones cuando alguien reseña tu apunte (post-MVP)
- Frontend (prompts 6-8)

## Diseño técnico — léelo antes de codificar

### Modelo de datos

**Note:**
- `id` (UUID)
- `owner_id` (FK → User)
- `room_id` (FK → Room, **nullable** — un apunte puede ser "global de la asignatura" sin estar atado a un room concreto)
- `subject` (str ≤ 100, ej "Cálculo II", "Programación Web")
- `title` (str ≤ 200)
- `description` (str ≤ 2000, opcional)
- `file_url` (str — URL/ruta donde el storage devolvió el archivo)
- `file_type` (enum: `pdf` | `image` | `markdown`)
- `file_size_bytes` (int)
- `original_filename` (str — para mostrar al descargar)
- `created_at`, `updated_at`

**NoteReview:**
- `id` (UUID)
- `note_id` (FK → Note, ondelete CASCADE)
- `reviewer_id` (FK → User, ondelete CASCADE)
- `rating` (int, 1-5)
- `comment` (str ≤ 500, opcional)
- `created_at`

**Constraint dura:** `UNIQUE(note_id, reviewer_id)` — un usuario solo puede reseñar un apunte una vez. Para editar, hace UPDATE de su review existente (no creamos endpoint UPDATE en este prompt; el usuario borra y vuelve a postear).

### Storage abstraction (decisión clave del prompt)

Definimos un puerto `FileStoragePort` en `application/ports.py` y dos adapters concretos:

```python
class FileStoragePort(ABC):
    @abstractmethod
    async def save(
        self,
        *,
        file_bytes: bytes,
        original_filename: str,
        content_type: str,
    ) -> SavedFile:
        """Devuelve SavedFile(url, size_bytes, content_type, storage_key)."""

    @abstractmethod
    async def delete(self, storage_key: str) -> None:
        """Borra el archivo asociado."""

    @abstractmethod
    async def open_stream(self, storage_key: str) -> AsyncIterator[bytes]:
        """Devuelve el contenido del archivo en streaming (para descargas)."""
```

**Adapters:**
- `InMemoryFileStorage` — para tests. Guarda en un dict `{storage_key: bytes}`.
- `LocalDiskFileStorage` — para dev. Guarda en `./uploads/<storage_key>`. URL devuelta es relativa al servidor.

**S3-compatible (Supabase, MinIO, AWS) está documentado en ADR como mejora post-MVP.** No lo implementamos en este prompt — solo añadimos un comentario en `LocalDiskFileStorage` indicando "// TODO: S3-compatible adapter using boto3 / aiobotocore for production" para que quede claro a futuros lectores.

`storage_key` es un UUID4 random + extensión (ej: `7c9e6679-7425-40de-944b-e07fc1f90ae7.pdf`). Nunca confiamos en el nombre original del usuario para construir paths — riesgo de path traversal.

### Constraints del archivo

Estas las verifica el endpoint **antes** de pasar a storage:

- **Tamaño máximo:** 10 MB. Si excede → 413 Payload Too Large.
- **MIME types permitidos:**
  - `application/pdf`
  - `image/jpeg`, `image/png`, `image/webp`
  - `text/markdown`, `text/plain` (markdown puede venir como text/plain)
- **Detección del tipo:** usa la cabecera `Content-Type` del request, pero **NUNCA confíes en ella sola**. Verifica también con `python-magic` o examinando los magic bytes del archivo. Si no instalas python-magic, al menos verifica los primeros bytes:
  - PDF: `%PDF-`
  - PNG: `\x89PNG\r\n\x1a\n`
  - JPEG: `\xff\xd8\xff`
- **Mapping a `file_type`:**
  - `application/pdf` → `pdf`
  - `image/*` → `image`
  - `text/*` → `markdown`

### Cálculo de rating

`rating_avg` y `reviews_count` se **calculan on-demand** en el service (`SELECT AVG(rating), COUNT(*) FROM note_reviews WHERE note_id = ...`). NO se denormalizan en la tabla `notes` por ahora.

Si en el futuro listar 1000 apuntes ordenados por rating es lento, añadiremos campos cacheados con triggers/jobs. Premature optimization is the root of all evil — apuntar como BACKLOG.

### Ordenación y paginación en list

`GET /api/v1/notes?subject=&room_id=&sort=&page=&limit=`

- `subject` (filtro opcional)
- `room_id` (filtro opcional)
- `sort` (`rating_desc` | `created_desc` | `created_asc`, default `created_desc`)
- `page` (default 1)
- `limit` (default 20, max 100)

Devuelve:
```json
{
  "items": [{...note con rating_avg, reviews_count y datos del owner...}],
  "page": 1,
  "limit": 20,
  "total": 42
}
```

## Estructura a crear / modificar

```
backend/app/
├── domain/
│   └── note.py                        ← REVISAR: ya existe desde scaffolding (entidades Note, NoteReview)
├── application/
│   ├── ports.py                       ← AÑADIR FileStoragePort
│   └── notes_service.py               ← NUEVO
├── infrastructure/
│   ├── models.py                      ← AÑADIR NoteModel, NoteReviewModel
│   ├── repositories/
│   │   └── note_repository.py         ← NUEVO (incluye queries de listado con AVG/COUNT)
│   └── storage/
│       ├── __init__.py
│       ├── in_memory_storage.py       ← NUEVO
│       └── local_disk_storage.py      ← NUEVO
├── presentation/
│   └── api/v1/
│       └── notes_routes.py            ← NUEVO (POST upload + REST CRUD)
└── main.py                            ← incluir router

backend/uploads/                       ← directorio para LocalDiskFileStorage
                                         (añadir a .gitignore)
```

### `application/notes_service.py` — interface

```python
class NotesService:
    def __init__(
        self,
        note_repo: NoteRepository,
        storage: FileStoragePort,
        max_file_bytes: int = 10 * 1024 * 1024,  # 10 MB
        allowed_mime_types: set[str] = ...,
    ): ...

    async def create_note(
        self,
        *,
        owner_id: UUID,
        subject: str,
        title: str,
        description: str | None,
        room_id: UUID | None,
        file_bytes: bytes,
        original_filename: str,
        content_type: str,
    ) -> Note:
        """
        - Valida tamaño (lanza FileTooLargeError)
        - Valida MIME (lanza UnsupportedFileTypeError)
        - Verifica magic bytes (lanza UnsupportedFileTypeError si no concuerdan)
        - Llama storage.save()
        - Crea Note con file_url y storage_key
        - Persiste con note_repo.save()
        """

    async def list_notes(
        self,
        *,
        subject: str | None,
        room_id: UUID | None,
        sort: Literal["rating_desc", "created_desc", "created_asc"] = "created_desc",
        page: int = 1,
        limit: int = 20,
    ) -> PaginatedNotes:
        """Devuelve notas con rating_avg y reviews_count calculados."""

    async def get_note_with_reviews(self, note_id: UUID) -> NoteDetail:
        """Devuelve la nota con todas sus reviews y agregados."""

    async def delete_note(self, *, note_id: UUID, requesting_user_id: UUID) -> None:
        """
        - Verifica que requesting_user_id es el owner (lanza NotNoteOwnerError si no)
        - Borra del storage
        - Borra de la DB (CASCADE borra reviews)
        """

    async def add_review(
        self,
        *,
        note_id: UUID,
        reviewer_id: UUID,
        rating: int,
        comment: str | None,
    ) -> NoteReview:
        """
        - Valida rating en [1, 5] (lanza InvalidRatingError)
        - Verifica que la nota existe (lanza NoteNotFoundError)
        - Verifica que el reviewer NO es el owner (lanza CannotReviewOwnNoteError)
        - Verifica que el reviewer no ha reseñado antes (lanza AlreadyReviewedError)
        - Persiste
        """
```

### `presentation/api/v1/notes_routes.py` — endpoints

```
POST   /api/v1/notes                     # multipart/form-data: file + form fields
GET    /api/v1/notes                     # list paginado con filtros y sort
GET    /api/v1/notes/{note_id}           # detail con reviews
DELETE /api/v1/notes/{note_id}           # solo owner
POST   /api/v1/notes/{note_id}/reviews   # reseñar (no se puede reseñar dos veces)
```

Mapeo de errores a HTTP:
- `FileTooLargeError` → 413
- `UnsupportedFileTypeError` → 415 Unsupported Media Type
- `InvalidRatingError` → 422
- `NoteNotFoundError` → 404
- `NotNoteOwnerError` → 403
- `CannotReviewOwnNoteError` → 403
- `AlreadyReviewedError` → 409

Para el endpoint POST /notes, FastAPI necesita `UploadFile`:

```python
@router.post("", status_code=201, response_model=NoteResponse)
async def create_note(
    subject: str = Form(..., max_length=100),
    title: str = Form(..., max_length=200),
    description: str | None = Form(None, max_length=2000),
    room_id: UUID | None = Form(None),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    service: NotesService = Depends(get_notes_service),
):
    file_bytes = await file.read()
    note = await service.create_note(
        owner_id=user.id,
        subject=subject,
        title=title,
        description=description,
        room_id=room_id,
        file_bytes=file_bytes,
        original_filename=file.filename or "unnamed",
        content_type=file.content_type or "application/octet-stream",
    )
    return note
```

Importante: `await file.read()` carga todo el archivo en memoria. Para 10 MB max es aceptable. Si en el futuro queremos archivos de cientos de MB, hay que cambiar a streaming — apuntar al BACKLOG.

## Migración Alembic

```bash
alembic revision --autogenerate -m "create notes and note_reviews tables"
```

Revisa el archivo generado para asegurarte de:
- `notes.room_id` con `ondelete=SET NULL` (si se borra el room, las notas no se pierden — quedan globales de la asignatura)
- `notes.owner_id` con `ondelete=CASCADE` (si se borra el user, sus notas también)
- `note_reviews.note_id` y `note_reviews.reviewer_id` con `ondelete=CASCADE`
- Constraint `UNIQUE (note_id, reviewer_id)` en `note_reviews`
- Constraint `CHECK (rating BETWEEN 1 AND 5)` en `note_reviews`
- Índices en `notes(subject)`, `notes(room_id)`, `notes(created_at DESC)`, `note_reviews(note_id)`

## Tests — `backend/tests/integration/test_notes.py`

Usa el `InMemoryFileStorage` para tests (no toques disco). Crea un fixture `notes_service` que inyecte el storage in-memory.

Tests mínimos (15+):

### Upload y validación de archivo

1. `test_create_note_unauthenticated` → 401
2. `test_create_note_with_valid_pdf` → 201, devuelve note con file_url
3. `test_create_note_with_valid_image` → 201
4. `test_create_note_with_text_file_as_markdown` → 201, file_type = "markdown"
5. `test_create_note_with_invalid_mime_type` (ej: zip) → 415
6. `test_create_note_with_oversized_file` (>10MB simulado con bytes generados) → 413
7. `test_create_note_with_pdf_having_wrong_magic_bytes` (content_type=pdf pero bytes son texto) → 415
8. `test_create_note_can_have_null_room_id` → 201, room_id es null en respuesta

### Listado y filtros

9. `test_list_notes_filters_by_subject`
10. `test_list_notes_sort_by_rating_desc` (crea 3 notas con reviews diferentes, verifica orden)
11. `test_list_notes_pagination` (crea 25 notas, verifica que page=1 devuelve 20 + total=25)

### Detail

12. `test_get_note_returns_reviews_and_avg_rating`
13. `test_get_note_not_found` → 404

### Delete

14. `test_delete_note_as_owner_removes_from_db_and_storage` (verifica que el storage también se limpió)
15. `test_delete_note_as_non_owner` → 403

### Reviews

16. `test_review_note_ok` → 201
17. `test_review_own_note_fails` → 403
18. `test_review_twice_fails` → 409
19. `test_review_with_invalid_rating` (0 o 6) → 422

### Storage abstraction (unit tests, no requiere servidor)

20. `test_in_memory_storage_save_returns_url_and_key` (test del adapter directamente)
21. `test_in_memory_storage_delete_removes_file`

## Reglas duras

- **El storage NUNCA confía en filenames del usuario.** Siempre se genera un `storage_key` UUID4 + extension validada. Si alguien sube `../../etc/passwd`, lo guardas como `<uuid>.txt` y el filename original se preserva solo como metadata.
- **El service nunca importa `Storage` concreto** — solo el puerto. Si te pillas haciendo `from app.infrastructure.storage.local_disk_storage import LocalDiskFileStorage` en `notes_service.py`, párate.
- **No metas la lógica de validación de MIME en el route handler.** La validación va en el service. El handler solo recibe el archivo y se lo pasa al service.
- **Magic bytes verification es obligatoria.** Si decides no implementarla por simplicidad, tiene que estar como TODO + entry en BACKLOG con razón. Pero hazla — es la primera línea de defensa contra abuso.
- **No persistas archivos en `/tmp` ni rutas absolutas hardcodeadas.** El path raíz del storage local viene de `Settings`.
- **Streaming/chunked upload está fuera de scope** — leemos el archivo completo en memoria. Justificación: 10MB max, MVP, OK por ahora.

## Orden de commits sugerido

Seis commits atómicos:

1. `feat(domain): entidades Note y NoteReview con value objects de rating y file metadata`
2. `feat(application): FileStoragePort y errores de dominio del módulo notes`
3. `feat(infra): adapters InMemoryFileStorage y LocalDiskFileStorage`
4. `feat(infra): NoteRepository con queries de listado paginado y agregados`
5. `feat(prisma): no aplica — usa Alembic`
   → renombra a: `feat(infra): migración Alembic para tablas notes y note_reviews`
6. `feat(application): NotesService con upload, listado, reviews y borrado`
7. `feat(presentation): endpoints REST de notes con multipart upload`
8. `test(integration): cobertura completa del módulo de notes (20+ tests)`

Son 7 commits (el 5 corregido). Ajusta si encuentras razones lógicas para fusionar/dividir.

## Gates antes de reportar

- `pytest tests/ -v` → **66+ verdes** (46 anteriores + 20+ nuevos)
- `ruff check` limpio
- Sin warnings nuevos
- `uploads/` añadido a `.gitignore`
- Settings tienen `uploads_dir: str = "./uploads"` por defecto
- Migración Alembic aplica limpia: `alembic upgrade head` en una DB de prueba

## Reporte final

1. Salida de pytest con conteo total
2. `git log --oneline -12`
3. Confirmar que `uploads/` está en `.gitignore`
4. Output de `alembic current` y `alembic history` mostrando la migración aplicada
5. Cualquier desviación con razón

## No avances al Prompt 6 sin confirmación

El Prompt 6 será **el primer prompt de frontend web**: scaffolding del cliente React + tRPC consumer (o axios/fetch directo, lo decidiremos), conexión al backend via auth. Lo escribiré tras tu reporte.

Para y reporta cuando termines.
