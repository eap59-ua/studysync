# StudySync — Backlog & Known Limitations

## Known Limitations (MVP)

### Pomodoro: No recovery on backend restart

**Severity:** Medium  
**Component:** `PomodoroService` (asyncio rotation tasks)

When the backend process restarts, all in-memory asyncio tasks die. The Pomodoro state persists in Redis (TTL-protected), but the rotation tasks that advance phases are lost. After a restart:

- Clients that reconnect and call `get_state()` will see the last saved phase, but it won't auto-advance.
- The timer appears "frozen" until someone issues a new `pomodoro.start`.

**Mitigation for production:**
- On startup, scan Redis for `pomodoro:*` keys and re-schedule rotation tasks for any active timers, calculating the remaining delay from `started_at + duration - now`.
- Alternatively, use Redis keyspace notifications (pub/sub on key expiry) to trigger rotation externally.

**Priority:** Post-MVP. Acceptable for academic demo where restarts are rare.

---

---

## Deuda técnica detectada en la retoma (31 julio 2026)

Ver el detalle en [`docs/reports/00-inventario-retoma-2026-07-31.md`](docs/reports/00-inventario-retoma-2026-07-31.md).

### 🔴 Bloqueantes

- [ ] **`passlib` 1.7.4 incompatible con `bcrypt` ≥ 4.1.** `passlib` lee
      `bcrypt.__about__.__version__`, eliminado en bcrypt 4.1. Con `bcrypt` 5.x
      `/auth/register` devuelve 422 y caen 37 tests. Además `passlib` importa
      `crypt`, eliminado en Python 3.13, y no se mantiene desde 2020.
      *Parche:* pinear `bcrypt<4.1`. *Solución:* migrar a `pwdlib[bcrypt]`.
- [ ] **`npm install` falla en clon limpio.** `openapi-typescript@7` exige
      `typescript@^5` y el proyecto pinea `~6.0.2` → `ERESOLVE`. El CI no puede
      instalar. Bajar TypeScript a 5.x o esperar a `openapi-typescript@8`.
- [ ] **LiveKit muestra "Disconnected" en el E2E** — ver
      [`docs/reports/07-e2e-report.md`](docs/reports/07-e2e-report.md), BUG 2.

### 🟡 Importantes

- [ ] **`datetime.utcnow()` deprecado** en los modelos SQLAlchemy. Contradice la
      regla del proyecto de inyectar el reloj para testabilidad.
- [ ] **`ruff check` reporta 261 errores** acumulados. Nunca se ha corrido en CI.
- [ ] **El E2E puede dar falso verde**: el check de LiveKit está marcado como no
      crítico y no afecta al exit code.
- [ ] **No existe `CLAUDE.md` / `AGENTS.md`** en la raíz. Las reglas duras
      (hexagonal estricta, TDD en domain/application, commits en español,
      inyección de reloj) solo viven fuera del repo.

### 🟢 Menores

- [ ] Constantes de Starlette renombradas: `HTTP_422_UNPROCESSABLE_ENTITY` →
      `HTTP_422_UNPROCESSABLE_CONTENT`, `HTTP_413_REQUEST_ENTITY_TOO_LARGE` →
      `HTTP_413_CONTENT_TOO_LARGE`.
- [ ] Refresh token automático en el cliente axios (backlog del Prompt 6).

---

## Future Improvements

- [ ] Configurable Pomodoro durations per room
- [ ] Pausable Pomodoro (pause/resume instead of binary start/stop)
- [ ] Cooperative Pomodoro start (any member, not just owner)
- [ ] Pomodoro history/logs persisted in PostgreSQL
- [ ] Recovery on backend restart (see above)
- [ ] Webhooks de LiveKit (`participant_joined`, `participant_left`) para tracking de presencia de audio independiente del WS — útil para detectar usuarios conectados al audio pero no al WS
