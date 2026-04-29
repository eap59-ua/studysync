# Prompt 4 — Integración backend de LiveKit (audio/vídeo)

> **Precondición:** Prompts 0-3 completados. 40 tests verdes, último commit `3500bcd`. Pomodoro server-authoritative funciona con rotación asíncrona y stats por usuario.

## Por qué este prompt es solo backend

LiveKit hace el heavy lifting de WebRTC: nosotros solo le firmamos tokens y le decimos quién puede conectarse a qué room. La UI (web React + Android Compose) viene en prompts posteriores. **No tocamos frontend en este prompt.**

Queremos el backend bulletproof antes de pelearnos con SDKs de cliente.

## Objetivo del slice

Implementar el endpoint que firma tokens de LiveKit para que un cliente autenticado y miembro del room pueda conectarse a la sala de audio/vídeo correspondiente. **Nada más.**

Fuera de scope:
- SDK web/Android (prompts 5 y 6)
- Webhooks de LiveKit (apuntamos al BACKLOG para fase post-MVP)
- Self-hosted LiveKit (usamos LiveKit Cloud free tier)
- Egress / grabación / transcripciones

## Decisiones técnicas — léelas antes de codificar

### LiveKit Cloud vs self-hosted

Decisión: **LiveKit Cloud** (free tier, 50 horas/mes). Razones:
- Beta con 5-50 testers cabe holgadamente en 50h/mes
- Eliminamos el dolor de configurar TURN servers, certificados, NAT traversal
- Migrar a self-hosted más adelante es cambiar la URL — el código del backend no cambia

El usuario debe crear cuenta en https://cloud.livekit.io (gratis), crear un proyecto, y obtener:
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_URL` (formato `wss://<project>.livekit.cloud`)

### Naming de rooms en LiveKit

Convención: el `room` name en LiveKit es `studysync-{room_id}` (con prefijo). Razones:
- Si en el futuro el usuario reusa el mismo proyecto LiveKit para otra app, no colisionan
- El UUID solo no comunica intención al ver el dashboard de LiveKit
- Documentar la convención en el código como constante

### Identity en LiveKit

`identity` del token = `user.id` (UUID string). LiveKit usa identity como clave de unicidad: si la misma identity intenta unirse dos veces, **expulsa la sesión anterior**. Esto es lo que queremos (evita duplicados si el usuario abre dos pestañas).

`name` del token = `user.display_name` — es lo que muestra LiveKit en sus UIs estándar.

### Permisos del token

Para todos los miembros del room:
- `canPublish: true` — puede emitir audio/vídeo
- `canSubscribe: true` — puede recibir audio/vídeo de otros
- `canPublishData: true` — útil para futuras señales (raise hand, react, etc.)

No diferenciamos roles por ahora. Owner y miembros normales tienen los mismos permisos LiveKit. Si en el futuro queremos "el owner puede mutear a otros", LiveKit tiene moderator permissions — fácil de añadir luego.

### TTL del token

Validez del token: **1 hora**. Si la sesión dura más, el cliente vuelve a pedir un token. Tokens más largos son riesgo innecesario.

### Verificación de membership

Antes de generar el token, el endpoint verifica:
1. El user está autenticado (auth dependency existente)
2. El room existe (404 si no)
3. El user es miembro del room (403 si no)

## Estructura a crear / modificar

```
backend/app/
├── application/
│   └── livekit_service.py             ← NUEVO
├── infrastructure/
│   └── livekit_client.py              ← NUEVO (thin wrapper sobre livekit-server-sdk)
├── presentation/
│   └── api/v1/
│       └── livekit_routes.py          ← NUEVO
└── main.py                            ← incluir router
```

### `infrastructure/livekit_client.py` — wrapper

Un módulo fino sobre `livekit.api.AccessToken` (paquete `livekit-api`, no `livekit-server-sdk` — verifica el nombre exacto en pyproject.toml; en pyproject.toml original puse `livekit-server-sdk`, pero el nombre del paquete Python correcto puede ser `livekit-api`. Si la importación falla, ajusta el dependency en pyproject.toml).

Expone:

```python
class LiveKitClient:
    def __init__(self, api_key: str, api_secret: str, url: str):
        ...

    def generate_join_token(
        self,
        *,
        identity: str,
        display_name: str,
        room_name: str,
        ttl_seconds: int = 3600,
    ) -> str:
        """Devuelve JWT firmado con grants canPublish/canSubscribe/canPublishData."""
```

Justificación: aislamos el SDK detrás de una interface propia. Si en el futuro cambiamos a self-hosted o a otro proveedor, solo se reescribe este archivo.

### `application/livekit_service.py`

```python
class LiveKitService:
    def __init__(self, livekit_client: LiveKitClient, room_repo: RoomRepository):
        ...

    async def issue_join_token(
        self,
        *,
        room_id: UUID,
        requesting_user_id: UUID,
        requesting_user_display_name: str,
    ) -> dict:
        """
        - Verifica que el room existe (lanza RoomNotFoundError si no)
        - Verifica que requesting_user_id es miembro (lanza NotRoomMemberError si no)
        - Genera token via LiveKit client
        - Devuelve {"token": "...", "url": "<wss://...>", "room_name": "studysync-{id}"}
        """
```

Constante en este archivo o en `domain/`:

```python
LIVEKIT_ROOM_PREFIX = "studysync-"

def livekit_room_name(room_id: UUID) -> str:
    return f"{LIVEKIT_ROOM_PREFIX}{room_id}"
```

### `presentation/api/v1/livekit_routes.py`

Un solo endpoint:

```
POST /api/v1/rooms/{room_id}/livekit-token
```

- Auth: `Depends(get_current_user)`
- Devuelve: `{"token": str, "url": str, "room_name": str}`
- Errores:
  - 401 si no auth
  - 403 si no miembro (`NotRoomMemberError`)
  - 404 si no existe el room (`RoomNotFoundError`)

Mapea las excepciones de dominio a `HTTPException` igual que ya haces en `room_routes.py`.

### Config

En `app/config.py` añade tres campos a las Settings:

```python
livekit_api_key: str = ""
livekit_api_secret: str = ""
livekit_url: str = ""
```

En `.env.example` añade los tres con valores placeholder y un comentario indicando dónde obtenerlos (https://cloud.livekit.io).

En `README.md` añade una sección "Configurar LiveKit" con los pasos para crear cuenta, sacar las keys y rellenar el `.env`.

## Tests — `backend/tests/integration/test_livekit.py`

Como en el resto, usar fixtures con DB SQLite in-memory + mocks. NO se necesita Redis aquí. Lo único que se mockea adicionalmente es el `LiveKitClient`.

Para tests, **inyecta un `LiveKitClient` fake** que en lugar de generar JWT real devuelva un dict con los argumentos recibidos. Así puedes verificar que el service está pasando los datos correctos al cliente sin depender de la firma real.

Tests mínimos (8+):

1. `test_livekit_token_unauthenticated` → 401
2. `test_livekit_token_as_member` → 200, response tiene `token`, `url`, `room_name`
3. `test_livekit_token_as_non_member` → 403
4. `test_livekit_token_for_nonexistent_room` → 404
5. `test_room_name_format` (unit, sin HTTP): verifica que `livekit_room_name(uuid)` devuelve `"studysync-{uuid}"`
6. `test_token_passes_correct_identity_to_client` — el LiveKitClient fake verifica que se le pasó `identity=user.id`
7. `test_token_passes_correct_room_name_to_client` — se le pasa `studysync-{room_id}`
8. `test_token_passes_display_name` — se le pasa el `display_name` del user

**Test opcional pero recomendado** (con LiveKit real, no mockeado):

9. `test_real_livekit_token_decodes` — usa el LiveKit SDK real con keys fake (`api_key="fake-key"`, `api_secret="fake-secret-32-chars-min-required-here"`), genera un token, y lo decodifica con el mismo SDK para verificar que las claims son correctas. Esto valida que estamos usando el SDK bien, no solo nuestro fake.

Si el SDK requiere secret >=32 chars, usa una constante en el test.

## Reglas duras

- **El secret de LiveKit nunca aparece en logs.** Si haces logging del token generado para debug, log solo los primeros 20 caracteres + "...".
- **No instancias `LiveKitClient` dentro del service.** Se inyecta vía DI (igual que `RoomRepository`). En `main.py` o donde armes el contenedor, construyes el cliente con las settings y se lo pasas al service.
- **No hardcodees el URL de LiveKit en el código.** Siempre desde Settings.
- **Si las settings de LiveKit están vacías al arrancar el servicio en producción, falla rápido** con un error claro. En dev/test pueden estar vacías.
- **No uses `livekit-api`/`livekit-server-sdk` directamente desde routes ni service** — solo desde `infrastructure/livekit_client.py`. Si te pillas haciendo `from livekit.api import AccessToken` en `livekit_service.py`, párate.

## Migraciones

No hay tablas nuevas. Sin migración Alembic.

## Orden de commits sugerido

1. `feat(infra): cliente LiveKit con generación de tokens JWT`
2. `feat(application): LiveKitService con verificación de membership`
3. `feat(presentation): endpoint POST /rooms/{id}/livekit-token`
4. `feat(config): variables LIVEKIT_API_KEY, _SECRET, _URL en Settings y .env.example`
5. `test(integration): cobertura de generación de token y permisos`

Cinco commits. Si encuentras razones para uno más (p.ej. un fix puntual), está bien — pero evita el mega-commit.

## Verificaciones del paquete LiveKit

Lo primero que debes hacer al entrar al prompt:

1. Comprobar el nombre exacto del paquete Python para LiveKit. En la lista que el ADR/scaffolding tiene puse `livekit-server-sdk`, pero el package oficial vigente es `livekit-api` (https://docs.livekit.io/server-sdk-python/). Si está mal en `pyproject.toml`, corrígelo y haz `uv pip install` o el comando equivalente del proyecto.
2. Comprobar el `import` correcto. En la versión actual es típicamente `from livekit.api import AccessToken, VideoGrants`.

Si hay discrepancia, **corrige `pyproject.toml` y deja constancia en el commit 1**.

## Gates antes de reportar

- `pytest tests/ -v` → **48+ verdes** (40 anteriores + 8+ nuevos)
- `ruff check` limpio
- Sin warnings nuevos
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` documentados en `.env.example`
- README contiene sección "Configurar LiveKit"

## Reporte final

1. Salida completa de pytest con conteo total
2. `git log --oneline -10`
3. Confirmación del nombre/versión exacta del paquete LiveKit que estás usando (importante para el siguiente prompt)
4. Cualquier cosa que descubras del SDK que sea sorprendente o no documentada (clase que cambió, método deprecated, etc.)
5. Una nota en `BACKLOG.md` añadiendo "Webhooks de LiveKit (`participant_joined`, `participant_left`) para tracking de presencia de audio independiente del WS — útil para detectar usuarios conectados al audio pero no al WS"

## No avances al Prompt 5 sin confirmación

El Prompt 5 es **el módulo de notes** (subir/listar apuntes con reseñas), o alternativamente el **frontend web con LiveKit funcionando** — lo decidiremos cuando reportes este. Por defecto seguiremos con notes (más backend) y dejaremos el frontend para una racha de prompts dedicada al final.

Para y reporta cuando termines.
