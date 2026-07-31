# Inventario de retoma — 31 julio 2026

Estado del repo tras ~3 meses sin commits (último: `f68e3ea`, 29 abril 2026).
Verificación ejecutada en entorno Linux limpio (Python 3.12.13, Node 22.22.3).

---

## 1. Estado de git

- Rama: `main`, sin commits desde el 29 abril 2026.
- 6 ficheros modificados sin commitear (tocados el 1–2 junio).
- 12 ficheros sin trackear, incluyendo **`docs/plan/07-rooms-ws-livekit-ui.md`** (el plan del Prompt 7 nunca se commiteó, aunque el código sí).

```
 M backend/app/presentation/ws/rooms_ws.py
 M docker-compose.yml
 M web/src/components/rooms/RoomVideoGrid.tsx
 M web/src/hooks/useRoomPresence.ts
 M web/src/hooks/useWebSocket.ts
 M web/tests/hooks/useRoomPresence.test.tsx
?? backend/{check_db,e2e_livekit_test,e2e_playwright,e2e_test,test_login}.py
?? backend/test.db
?? docs/plan/07-rooms-ws-livekit-ui.md
?? e2e_api_test.ps1  e2e_browser_test.py  e2e_room_id.txt
?? e2e_user1_room.png  e2e_user2_room.png
```

---

## 2. Tests

### Backend — 67/67 verdes ✅ (con una pega)

```
67 passed, 210 warnings in 18.18s
```

**Pero con instalación limpia hoy fallan 5 tests + 32 errores.** Causa única y confirmada:

| Problema | Detalle |
|---|---|
| `bcrypt` 5.0.0 rompe `passlib` 1.7.4 | `passlib` lee `bcrypt.__about__.__version__`, atributo eliminado en bcrypt ≥ 4.1. El backend cae y `/auth/register` devuelve `422 {"detail":"password cannot be longer than 72 bytes..."}`. Como todos los tests dependen del fixture de registro/login, cascada de 37 fallos. |

Verificado: con `bcrypt==4.0.1` los **67 tests pasan sin tocar una línea de código**.

Warnings a limpiar (no bloqueantes):

- `datetime.utcnow()` deprecado — aparece en modelos SQLAlchemy. Contradice la regla dura del proyecto de *inyección de reloj*.
- `passlib` importa `crypt`, eliminado en Python 3.13 → bloquea futuras subidas de versión.
- Starlette: `HTTP_422_UNPROCESSABLE_ENTITY` y `HTTP_413_REQUEST_ENTITY_TOO_LARGE` renombrados.

### Frontend — 22/22 verdes ✅

```
Test Files  8 passed (8)
     Tests  22 passed (22)
```

Ejecutado **con los cambios sin commitear aplicados**. `tsc -b --noEmit` pasa limpio.

### Frontend — instalación limpia rota 🔴

`npm install` falla hoy en un clon nuevo:

```
npm error ERESOLVE could not resolve
npm error peer typescript@"^5.x" from openapi-typescript@7.13.0
npm error Found: typescript@6.0.3
```

El `node_modules` local funciona porque se instaló cuando resolvía. Un clon nuevo (o el CI) **no compila** sin `--legacy-peer-deps`. Además: el proyecto usa **npm** (`package-lock.json`), no pnpm.

### Frontend — lint roto por el refactor 🔴

`npx eslint .` → **3 errores, todos en `web/src/hooks/useWebSocket.ts`**, todos introducidos por el refactor sin commitear. La versión commiteada linta limpia.

| Línea | Regla | Problema |
|---|---|---|
| 26 | `react-hooks/refs` | `onMessageRef.current = onMessage` se asigna durante el render |
| 53 | `react-hooks/immutability` | `connect` se referencia dentro de su propio `useCallback` antes de declararse |
| 78 | `react-hooks/set-state-in-effect` | `setStatus("closed")` síncrono en el cuerpo del efecto |

---

## 3. Análisis de los cambios sin commitear

### `web/src/hooks/useRoomPresence.ts` — ✅ BUG FIX REAL, commitear

```diff
- const wsUrl = `${VITE_WS_BASE_URL}/api/v1/ws/rooms/${roomId}`;
+ const wsUrl = `${VITE_WS_BASE_URL}/ws/rooms/${roomId}`;
```

Verificado contra el backend: `rooms_ws.router` se declara con `prefix="/ws"` y `main.py` lo monta con `app.include_router(rooms_ws_router)` **sin** `prefix="/api/v1"` (a diferencia de los otros 5 routers). La URL commiteada estaba mal → el WebSocket nunca conectaba. Este one-liner es el fix que desbloqueó el E2E.

### `web/src/hooks/useWebSocket.ts` — ✅ commitear, pero arreglando lint

Sustituye `partysocket` por `WebSocket` nativo + reconexión con backoff exponencial (5 reintentos, base 1 s). Decisión **correcta**: `partysocket` está diseñado para PartyKit (host + room), no para un endpoint arbitrario de Starlette; el código commiteado tiene 15 líneas de comentarios de duda del propio agente que lo escribió, señal de que nunca convenció.

Mejoras añadidas: `onMessageRef` evita reconectar en cada render, `send` comprueba `readyState` en vez de estado de React.

**Antes de commitear:** arreglar los 3 errores de lint y eliminar `partysocket` de `package.json` (queda huérfano).

### `backend/app/presentation/ws/rooms_ws.py` — 🟡 commitear con fix

Añade `broadcast_to_room_except()` y un mensaje `presence_state` inicial al recién conectado. La idea es correcta (antes, el que entraba no veía a los que ya estaban), pero **la implementación tiene un bug confirmado en las capturas** — ver sección 4.

### `web/src/components/rooms/RoomVideoGrid.tsx` — ✅ commitear tal cual

Extrae `e.response.data.detail` del error de Axios (antes mostraba el genérico `e.message`) y sustituye el bloque de error por un empty state decente. Cambio limpio.

### `docker-compose.yml` — ⚠️ NO commitear

```diff
- "5432:5432"  →  "5434:5432"
- "6379:6379"  →  "6381:6379"
```

Es un workaround para colisión de puertos en la máquina local (probablemente otro Postgres/Redis corriendo). No debe ir a `main`: rompe el `.env.example`, el CI y a cualquiera que clone. Va a `docker-compose.override.yml`, **que ya está en `.gitignore`**.

---

## 4. El E2E del Prompt 7: ejecutado, y NO pasó limpio

Las capturas `e2e_user1_room.png` / `e2e_user2_room.png` son evidencia real de ejecución (2 usuarios, room "E2E Test Room"). Lo que muestran:

✅ **Funciona:** badge "Estado: Conectado" en ambos; cada usuario ve al otro en la lista de miembros; la sala de vídeo renderiza.

🔴 **BUG 1 — Miembros duplicados.** user1 ve `Conectados (3)` con *User One* repetido. user2 ve `Conectados (4)` con *User One* ×2 y *User Two* ×2.

Causa raíz (dos factores que se combinan):

1. `presence_state` se construye iterando **conexiones** (`for ws in manager.active_connections[room_id]`), no usuarios distintos. Dos sockets del mismo usuario → dos entradas.
2. `main.tsx` usa `<StrictMode>`, que en React 19 monta el efecto dos veces en desarrollo → **dos WebSockets por usuario**.
3. `useRoomPresence` deduplica en `user_joined` (`m.find(u => u.id === ...)`) pero en `presence_state` hace `setMembers(msg.members)` en bruto, sin deduplicar.

Además `count` es `len(active_connections)` — cuenta sockets, no usuarios. Debería usar `len(set(user_ids))`.

🔴 **BUG 2 — LiveKit desconectado.** Toast "Disconnected" en ambas capturas y botón "Start Audio" pendiente en user2. El grid renderiza pero la sala no queda conectada. El propio script marca este check como no-crítico (`video_grid_no_error = True  # Don't fail for this`), así que el E2E podría haber salido con exit 0 pese al fallo.

---

## 5. Scripts E2E: clasificación

| Fichero | Veredicto |
|---|---|
| `e2e_browser_test.py` (242 líneas) | **Guardar** → `scripts/e2e/browser_two_users.py`. Playwright, 2 contextos, asserts sobre badge WS + member list + video grid, screenshots y exit code. Es el único con valor real. |
| `backend/e2e_test.py` (151) | **Guardar** → `scripts/e2e/seed_two_users.py`. Registra 2 usuarios y crea/join room; es el *setup* que necesita el anterior. |
| `backend/e2e_livekit_test.py` (58) | **Guardar** → `scripts/e2e/check_livekit_token.py`. Útil ahora que hay un bug de LiveKit abierto. |
| `backend/e2e_playwright.py` (93) | **Borrar.** Versión anterior y peor de `e2e_browser_test.py`. |
| `e2e_api_test.ps1` (127) | **Borrar.** Duplica `e2e_test.py` en PowerShell; ata el proyecto a Windows. |
| `backend/test_login.py` (5) | **Borrar.** Scratch. Además `test_*.py` en la raíz del backend lo recoge pytest por error. |
| `backend/check_db.py` (12) | **Borrar.** Scratch contra un SQLite que no debería existir. |
| `backend/test.db` | **Borrar + gitignorear.** No está cubierto por `.gitignore`. |
| `e2e_room_id.txt` | **Borrar + gitignorear.** Artefacto de ejecución (UTF-16). |
| `e2e_user1_room.png`, `e2e_user2_room.png` | **Mover** → `docs/evidence/prompt-07/`. |

---

## 6. Plan de commits propuesto

Seis commits atómicos, en este orden:

**1.** `fix(web): corregir URL del WebSocket de rooms (sin prefijo /api/v1)`
> `web/src/hooks/useRoomPresence.ts`
> El fix aislado y de mayor valor. Va primero para que quede documentado como tal.

**2.** `refactor(web): sustituir partysocket por WebSocket nativo con reconexión exponencial`
> `web/src/hooks/useWebSocket.ts` (+ fixes de lint), `web/tests/hooks/useRoomPresence.test.tsx`, `web/package.json` (quitar `partysocket`)
> Código + tests en el mismo commit: los tests mockeaban `partysocket` y sin el refactor no compilan.

**3.** `feat(ws): enviar presence_state inicial al conectar y broadcast excluyente`
> `backend/app/presentation/ws/rooms_ws.py`
> Incluye el fix del BUG 1 (deduplicar por `user_id` y contar usuarios distintos) + tests unitarios nuevos del `ConnectionManager`.

**4.** `feat(web): empty state y detalle de error en RoomVideoGrid`
> `web/src/components/rooms/RoomVideoGrid.tsx`

**5.** `chore: añadir scripts E2E y limpiar artefactos de prueba`
> Crear `scripts/e2e/` con los 3 scripts útiles + `README.md`
> Borrar los 6 ficheros scratch
> `.gitignore`: añadir `*.db`, `e2e_*.txt`, `**/e2e_*.png`

**6.** `docs: plan del Prompt 7 y evidencia del E2E`
> `docs/plan/07-rooms-ws-livekit-ui.md` (nunca commiteado)
> `docs/evidence/prompt-07/user1_room.png`, `user2_room.png`
> `docs/reports/07-e2e-report.md` (Prioridad 2)
> `docs/reports/00-inventario-retoma-2026-07-31.md` (este documento)

**Fuera de los commits:** `docker-compose.yml` se revierte con `git checkout -- docker-compose.yml` y los puertos locales pasan a `docker-compose.override.yml`.

---

## 7. Deuda técnica descubierta (para BACKLOG.md)

| # | Problema | Prioridad |
|---|---|---|
| 1 | `passlib` 1.7.4 sin mantenimiento desde 2020, incompatible con bcrypt ≥ 4.1 e importa `crypt` (eliminado en Py 3.13). Pinear `bcrypt<4.1` es un parche; migrar a `pwdlib[bcrypt]` es la solución. | **Alta** — bloquea `pip install` limpio |
| 2 | `openapi-typescript@7` exige `typescript@^5` pero el proyecto pinea `~6.0.2`. Clon nuevo / CI no instala. | **Alta** — el CI está roto |
| 3 | BUG 1: presencia duplicada (`presence_state` por socket + StrictMode) | **Alta** |
| 4 | BUG 2: LiveKit muestra "Disconnected" | **Alta** |
| 5 | `datetime.utcnow()` deprecado — viola la regla de inyección de reloj | Media |
| 6 | Constantes de Starlette renombradas (422/413) | Baja |
| 7 | El E2E marca el fallo de vídeo como no-crítico → puede dar falso verde | Media |
| 8 | No existe `CLAUDE.md` / `AGENTS.md` en la raíz. Las reglas duras del proyecto solo viven en la cabeza del autor. | Media |
