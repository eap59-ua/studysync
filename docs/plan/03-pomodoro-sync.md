# Prompt 3 — Pomodoro sincronizado (feature diferencial)

> **Precondición:** Prompts 0, 1, 2 completados. 23 tests verdes, commit `16c30bc` pusheado. ConnectionManager existe en `backend/app/presentation/ws/rooms_ws.py` y se usa para presencia. Auth funciona con header HTTP corregido.

## Por qué este prompt importa más que los otros

Esto es lo que diferencia a StudySync de "otra app de rooms con video". Si esto se desincroniza, falla, o flickea, el producto pierde su valor. Prioriza correctness sobre velocidad — vale la pena dedicar tiempo a tests de tiempo y rotación.

## Objetivo del slice

Implementar un Pomodoro **server-authoritative** que:

1. Lo arranca el owner del room
2. Se sincroniza para todos los miembros conectados al WebSocket en tiempo real
3. Rota automáticamente entre fases (focus → break → focus → ... → long break)
4. Mantiene estado en **Redis** (no en memoria) — así múltiples clientes ven lo mismo
5. Cuenta Pomodoros completados por usuario

Fuera de scope:
- UI del temporizador (es trabajo de frontend, prompt aparte)
- Configurar duración custom por room (usaremos defaults; configurable es post-MVP)
- Pomodoros pausables (sin pausa por ahora — start/stop binario)

## Diseño técnico — léelo antes de escribir código

### Fases y ciclo

```
Index 0: focus (1500s = 25min)
Index 1: short_break (300s = 5min)
Index 2: focus
Index 3: short_break
Index 4: focus
Index 5: short_break
Index 6: focus  (← cuarto focus completado)
Index 7: long_break (900s = 15min)
Index 8 → vuelve a 0
```

Total ciclo completo: 130 min. La función `next_phase(current_index)` debe ser determinística y testeable.

Constantes (defínelas en `domain/pomodoro.py`):

```python
FOCUS_SECONDS = 25 * 60
SHORT_BREAK_SECONDS = 5 * 60
LONG_BREAK_SECONDS = 15 * 60
PHASES_PER_CYCLE = 8
```

### Estado en Redis

**Key:** `pomodoro:{room_id}`

**Value (JSON serializado):**
```json
{
  "phase": "focus",
  "started_at": "2026-04-24T15:00:00Z",
  "duration_seconds": 1500,
  "phase_index": 0,
  "started_by": "<user_uuid>"
}
```

**TTL:** `duration_seconds + 10` (margen de gracia para evitar carreras durante la rotación).

`phase` es derivable de `phase_index`, pero lo guardamos también para legibilidad y por si en el futuro queremos fases custom.

### Source of truth y recovery

- Redis es **la única fuente de verdad** del estado actual.
- Cualquier consulta calcula `seconds_remaining = duration_seconds - (now - started_at)` server-side.
- Hay una **task asyncio in-memory** por room activo que duerme `duration_seconds` y luego rota.
- Si el backend reinicia, las tasks mueren pero el estado en Redis persiste. **Limitación documentada del MVP:** tras un reinicio, los timers no avanzan automáticamente; los clientes que pidan estado verán fase desfasada hasta que vuelvan a `start`. Apuntar como "Mejora pendiente: recovery on startup" en `BACKLOG.md`.

### Inyección de reloj para testing

El service recibe un parámetro `now: Callable[[], datetime]` con default `lambda: datetime.now(timezone.utc)`. **Todos los timestamps del service usan esta función**, no `datetime.now()` directo. Esto te permite tests deterministas sin freezegun.

### Privilegios

- **Solo el owner del room** puede arrancar o parar el pomodoro. Cualquier otro miembro recibe error.
- Decisión consciente: prevenir que alguien interrumpa el flow del grupo. Revisable post-MVP si los usuarios piden cooperativo.

### Conteo de Pomodoros completados

Cuando un focus termina (rotación de focus → break, NO al hacer stop manual), incrementamos:

```
INCR user:{user_id}:pomodoros_completed
```

Para todos los `user_id` que estén en `presence:room:{room_id}` en ese instante (los que están conectados al WS al final del focus).

Stop manual NO cuenta — solo focus completados naturalmente.

## Estructura a crear / modificar

```
backend/app/
├── domain/
│   └── pomodoro.py                    ← REVISAR: ya existe desde el scaffolding.
│                                         Asegúrate que tiene PomodoroSession con
│                                         next_phase(), is_focus(), etc.
├── application/
│   └── pomodoro_service.py            ← NUEVO
├── infrastructure/
│   └── redis_client.py                ← REVISAR/ampliar si hace falta
├── presentation/
│   ├── api/v1/
│   │   └── user_routes.py             ← NUEVO (solo /me/stats por ahora)
│   └── ws/
│       └── rooms_ws.py                ← MODIFICAR: handle messages "pomodoro.start" y "pomodoro.stop"
└── main.py                            ← incluir user_routes router
```

### `application/pomodoro_service.py` — interface

```python
class PomodoroService:
    def __init__(
        self,
        redis: Redis,
        room_repo: RoomRepository,
        connection_manager: ConnectionManager,  # de rooms_ws.py
        now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ): ...

    async def start(self, room_id: UUID, requesting_user_id: UUID) -> PomodoroState:
        """
        - Verifica que requesting_user_id es el owner del room (lanza PermissionError si no)
        - Cancela cualquier task de rotación previa para este room
        - Crea estado nuevo en Redis con phase_index=0, started_at=now(), duration=FOCUS_SECONDS
        - Programa task asyncio que rota tras duration
        - Broadcast "pomodoro.state" al room por WebSocket
        - Devuelve el PomodoroState
        """

    async def stop(self, room_id: UUID, requesting_user_id: UUID) -> None:
        """
        - Verifica owner
        - Cancela task de rotación
        - Borra clave Redis
        - Broadcast "pomodoro.stop" al room
        """

    async def get_state(self, room_id: UUID) -> PomodoroState | None:
        """Lee Redis, calcula seconds_remaining server-side. Devuelve None si no hay estado."""

    async def _rotate(self, room_id: UUID) -> None:
        """
        Llamado automáticamente por la task interna cuando expira la fase actual.
        - Lee estado actual de Redis
        - Si la fase que termina es 'focus': INCR pomodoros_completed para los usuarios
          presentes en ConnectionManager
        - Calcula next_phase
        - Actualiza Redis con nuevo started_at, phase, phase_index, duration
        - Programa siguiente task
        - Broadcast "pomodoro.phase_change" con from_phase, to_phase, nuevo state
        """
```

### Mensajes WebSocket — convención de nombres

Server → cliente:
- `pomodoro.state` — estado actual completo. Se envía al conectarse al WS y tras start.
- `pomodoro.phase_change` — al rotar de fase. Incluye `{from_phase, to_phase, state}`.
- `pomodoro.stopped` — cuando el owner hace stop.

Cliente → server (dentro del WS del room):
- `{"type": "pomodoro.start"}`
- `{"type": "pomodoro.stop"}`

El `rooms_ws.py` actual ya ignora silenciosamente mensajes desconocidos (lo dejaste así en Prompt 2). Ahora añade un `match` o `if` para estos dos types y delega a `PomodoroService.start/stop`.

### REST endpoint para stats

`GET /api/v1/users/me/stats` (auth required) → `{ "pomodoros_completed": <int> }`. Lee del contador Redis. Si la clave no existe, devuelve 0.

## Tests

Crea `backend/tests/integration/test_pomodoro.py`. Para Redis usa **fakeredis** (`pip install fakeredis` o añádelo a `pyproject.toml` como dev dep).

Importante: necesitarás un fixture `frozen_clock` que controle qué devuelve `now()`. Inyéctalo al construir el `PomodoroService`.

Tests mínimos (12+):

1. `test_get_state_returns_none_when_idle`
2. `test_start_as_owner_creates_redis_state`
3. `test_start_as_non_owner_raises_permission_error`
4. `test_start_broadcasts_pomodoro_state` (verifica que `connection_manager.broadcast` fue llamado con un mensaje "pomodoro.state" cuyo phase es focus)
5. `test_get_state_calculates_seconds_remaining` (con frozen clock, avanza 60s, verifica remaining = duration - 60)
6. `test_rotate_focus_to_short_break` (avanza tiempo manualmente o llama directamente a `_rotate`, verifica nuevo estado y broadcast de phase_change)
7. `test_rotate_through_full_cycle_reaches_long_break` (simula 7 rotaciones, verifica que la 8ª fase es long_break, índice 7)
8. `test_rotate_after_long_break_resets_to_focus` (índice 7 → siguiente debe ser índice 0, focus)
9. `test_stop_as_owner_clears_redis_state`
10. `test_stop_as_non_owner_raises_permission_error`
11. `test_focus_completion_increments_user_counters` (mete dos usuarios en ConnectionManager, simula rotación de focus, verifica `pomodoros_completed` incrementó para ambos)
12. `test_stats_endpoint_returns_counter`
13. `test_stats_endpoint_returns_zero_for_new_user`

Para los tests que necesitan integración del WS con el service, usa unit tests del service inyectando un `connection_manager` fake que captura los broadcasts. Igual que hiciste con los WS unit tests del Prompt 2, evitamos el conflicto de event loops aiosqlite/Starlette.

### Truco para testear las tasks de rotación sin esperar 25min

NO uses `asyncio.sleep(1500)` en tests. En su lugar:

- Para tests de rotación, **llama directamente a `service._rotate(room_id)`** después de manipular el estado de Redis para que parezca que el tiempo pasó (modifica `started_at` para que sea hace `duration` segundos).
- O más limpio: añade al service un parámetro opcional `_sleep: Callable[[float], Awaitable[None]] = asyncio.sleep`. En tests inyecta una función fake que no espera nada.

Documenta cualquiera de los dos approaches en un docstring del test para que el siguiente que toque esto entienda.

## Migraciones

No hay tablas nuevas — todo está en Redis. **No creas migraciones Alembic** en este prompt.

## Reglas duras

- **No metas la lógica del Pomodoro en `rooms_ws.py`.** El WebSocket solo recibe el mensaje y delega al service. Si te pillas escribiendo `if message["type"] == "pomodoro.start": redis.set(...)` en el handler, párate y mueve a service.
- **Cero `datetime.now()` desperdigado.** Todo pasa por `self._now()`.
- **No uses `time.sleep`.** Solo `asyncio.sleep`. Y no en código de producción que bloquee — solo dentro de tasks asyncio.
- **El service maneja errores con excepciones de dominio**, no con `HTTPException`. El mapeo a HTTP/WS lo hacen las capas de presentation/ws.
- **No persistas el contenido de mensajes WS en logs** — pueden contener UUIDs que correlacionan con usuarios reales. Logs estructurados con `event=pomodoro.started, room_id=<id>` está bien; volcar el JSON entero, no.

## Orden de commits sugerido

Cinco commits atómicos:

1. `feat(domain): pomodoro session entity con lógica de rotación de fases`
2. `feat(infra): cliente Redis con helpers para pomodoro state`
3. `feat(application): PomodoroService con start/stop/rotate y broadcast`
4. `feat(presentation): handler WS para pomodoro.start/stop y endpoint /me/stats`
5. `test(integration): cobertura completa de Pomodoro server-authoritative`

## Gates antes de reportar

- `pytest tests/ -v` → **35+ verdes** (23 anteriores + 12+ nuevos)
- Sin warnings nuevos en los tests
- Si añadiste `fakeredis`, está en `pyproject.toml` bajo `[project.optional-dependencies].dev`
- `ruff check` limpio

## Reporte final

1. Salida de pytest con conteo total
2. `git log --oneline -8` (últimos 8 commits)
3. Una nota corta confirmando que la limitación de "no recovery on backend restart" está documentada en `BACKLOG.md` (si no existe el archivo, crearlo)
4. Cualquier desviación del plan con razón

## No avances al Prompt 4 sin confirmación

El Prompt 4 (LiveKit video/audio) es solo después de que veamos el Pomodoro funcionando. **Para y reporta.**

Si en algún momento detectas que el comportamiento real difiere del descrito aquí (por ejemplo, descubres una race condition entre rotación y nuevo start), **para y pregunta** antes de improvisar.
