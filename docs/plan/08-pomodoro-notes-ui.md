# Prompt 8 — Pomodoro UI + Notes UI + refresh token + polish

> **Precondición:** Prompt 7 cerrado y repo limpio (commits `9ef2820`…`dc3aa62`, 31 julio 2026).
> Estado verificado: backend 74 tests verdes, web 24 tests verdes, `ruff check` y `eslint` en verde,
> `npm ci` y `pip install -e ".[dev]"` funcionando en clon limpio.
>
> **Cinco bloques, EN ESTE ORDEN.** El bloque 0 es un bloqueo real: no montes el Pomodoro sobre
> una `RoomDetailPage` que ya tiene un fallo visible. Cierra cada bloque con su commit antes de
> pasar al siguiente.

---

## Cambios de contexto desde el Prompt 7 — léelos antes de nada

Tres cosas cambiaron y los planes anteriores están desactualizados en ellas:

1. **El gestor de paquetes es `npm`, no `pnpm`.** Los planes 06 y 07 dicen `pnpm`; es incorrecto,
   el repo tiene `package-lock.json`. Usa `npm run test`, `npm run lint`, `npm run typecheck`.
2. **`openapi-typescript` ya no es una dependencia.** `npm run gen:api-types` lo invoca vía `npx`
   porque su peer `typescript@^5` chocaba con el `~6.0.2` del proyecto. Sigue funcionando igual,
   pero necesita el backend levantado.
3. **La presencia se deduplica por usuario, no por socket.** `useRoomPresence` ya entrega una
   lista sin repetidos aunque StrictMode abra dos WebSockets. No reintroduzcas lógica que asuma
   un socket por persona.

**Reglas duras que aplican a todo el prompt:**

- Arquitectura hexagonal: `domain` no importa nada externo, `application` solo puertos.
- TDD en `domain` y `application`. Test primero, cobertura ≥ 80 %.
- Commits atómicos en español, Conventional Commits. **RED y GREEN nunca en commits distintos**:
  el test y el código que lo hace pasar van juntos.
- Nada de `datetime.now()` suelto: reloj inyectado.
- Nombres de clases y funciones en inglés; comentarios y commits en español.

---

## Objetivo del slice

Al terminar, un usuario autenticado puede:

1. Ver y controlar el **Pomodoro sincronizado** dentro de un room, con el mismo tiempo que el resto
2. Ver su contador personal de pomodoros completados
3. **Subir apuntes** (PDF, imagen, markdown) desde el navegador
4. **Listar y filtrar** apuntes por asignatura, ordenados por valoración
5. **Ver el detalle** de un apunte con sus reseñas y **dejar la suya**
6. Seguir navegando sin que la sesión caduque a mitad (**refresh token automático**)

**Fuera de scope:** compartir pantalla, chat de texto, edición de apuntes, notificaciones push,
Pomodoro configurable por room (está en BACKLOG), mobile.

---

## Bloque 0 — Desbloquear LiveKit

**No escribas una línea de Pomodoro hasta cerrar esto.** El E2E del Prompt 7 dejó ambas capturas
con el toast "Disconnected" sobre el grid de vídeo (ver `docs/reports/07-e2e-report.md`, BUG 2).
El Pomodoro se monta en la misma pantalla: si arrancas con ese fallo presente, cualquier problema
nuevo va a ser indistinguible del viejo.

### Diagnóstico, en este orden y parando en cuanto uno dé positivo

**1. ¿El backend emite un token válido?**

```bash
docker compose up -d
cd backend && uvicorn app.main:app --reload
python scripts/e2e/seed_two_users.py
python scripts/e2e/check_livekit_token.py
```

Si falla aquí, el problema está en `backend/.env`: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
`LIVEKIT_URL`. Comprueba que las credenciales siguen vivas — LiveKit Cloud caduca los proyectos
gratuitos por inactividad, y el proyecto lleva tres meses parado. **Esta es la hipótesis más
probable después de la 3.**

**2. ¿El cliente apunta al sitio correcto?**

`web/.env` solo define `VITE_API_BASE_URL` y `VITE_WS_BASE_URL`. Verifica de dónde saca
`RoomVideoGrid` la URL del servidor LiveKit: si viene del backend en la respuesta del token, bien;
si espera un `VITE_LIVEKIT_URL` que no existe, ahí está el fallo.

**3. ¿Es un artefacto del E2E headless y no un bug?**

`scripts/e2e/browser_two_users.py` crea los contextos así:

```python
ctx1 = await browser.new_context()
```

Chromium headless **deniega cámara y micrófono por defecto**, y LiveKit no puede publicar tracks.
Eso explica el tile gris con icono de avatar y el botón "Start Audio" pendiente. Prueba:

```python
ctx1 = await browser.new_context(permissions=["camera", "microphone"])
```

y lanza Chromium con `args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]`.

**Si esto lo arregla, no había bug de producto: el bug estaba en el test.** Documenta eso tal cual
en el informe, no lo maquilles.

**4. Reproduce a mano.** Dos navegadores reales, dos cuentas, mismo room. Los navegadores reales sí
piden permisos. Si a mano funciona y headless no, confirmado que es la 3.

### Cierre del bloque

- Haz crítico el check de vídeo en `browser_two_users.py`: quita el
  `results["video_grid_no_error"] = True  # Don't fail for this` e inclúyelo en `critical_pass`.
  Un E2E que no falla con el vídeo caído no es una puerta de calidad.
- Actualiza `docs/reports/07-e2e-report.md`: marca el BUG 2 como cerrado con la causa real, y
  sustituye las capturas de `docs/evidence/prompt-07/` por las nuevas.
- Marca la casilla en `BACKLOG.md`.

Commit: `fix(e2e): <la causa que hayas encontrado>` y `docs: cerrar BUG 2 del informe E2E`.

---

## Bloque 1 — Pomodoro UI sincronizado

### El contrato que ya existe: no lo reinventes

El backend es **server-authoritative** y está terminado. El cliente **no calcula fases, no decide
transiciones y no persiste nada**: solo renderiza lo que llega y hace la cuenta atrás visual.

**Mensajes que el cliente ENVÍA** por el WebSocket ya abierto en `useRoomPresence`:

| Mensaje | Quién puede |
|---|---|
| `{"type": "pomodoro.start"}` | Solo el owner del room (el backend devuelve `error` si no) |
| `{"type": "pomodoro.stop"}` | Solo el owner |

**Mensajes que el cliente RECIBE:**

```jsonc
// Al conectar, si hay un pomodoro activo; y al arrancar uno
{ "type": "pomodoro.state", "state": { ... } }

// Al cambiar de fase automáticamente
{ "type": "pomodoro.phase_change",
  "from_phase": "focus", "to_phase": "short_break", "state": { ... } }

// Al pararlo
{ "type": "pomodoro.stopped" }

// Si intentas start/stop sin ser owner
{ "type": "error", "message": "only the room owner can start the pomodoro" }
```

**Forma de `state`** (`PomodoroState.to_dict()` en `app/domain/pomodoro.py`):

```typescript
type PomodoroPhase = "focus" | "short_break" | "long_break";

interface PomodoroState {
  phase: PomodoroPhase;
  started_at: string;        // ISO 8601, hora del SERVIDOR
  duration_seconds: number;  // 1500 focus | 300 short_break | 900 long_break
  phase_index: number;       // 0-7
  started_by: string;        // UUID
}
```

El ciclo son **8 fases**: índices pares 0/2/4/6 son `focus`, impares 1/3/5 son `short_break`,
el 7 es `long_break`, y después vuelve al 0.

### El punto delicado: la cuenta atrás

`seconds_remaining = duration_seconds - (ahora - started_at)`.

`started_at` viene del **reloj del servidor** y el navegador puede ir desfasado. Dos clientes con
relojes distintos verían números distintos, que es exactamente lo que este feature promete evitar.

Resuélvelo calculando **una sola vez** el offset entre relojes al recibir el primer
`pomodoro.state`, y aplicándolo en cada tick:

```typescript
// useRoomPomodoro.ts
const serverOffsetRef = useRef(0); // ms que el servidor va por delante del cliente

// al recibir pomodoro.state / phase_change:
serverOffsetRef.current = new Date(state.started_at).getTime() - Date.now();
// ⚠️ solo válido si el mensaje llega recién emitido; para phase_change lo es.

const remaining = Math.max(
  0,
  state.duration_seconds * 1000 - (Date.now() + serverOffsetRef.current - startedAtMs)
) / 1000;
```

Reglas del temporizador:

- `setInterval` de **1000 ms**, no de 100. No hace falta más resolución y ahorra renders.
- Cuando llegue a 0, **no cambies de fase por tu cuenta**. Muestra `00:00` y espera el
  `pomodoro.phase_change` del servidor. Si tarda un segundo, se ve un segundo de `00:00`: correcto.
- Limpia el intervalo en el cleanup del efecto.
- Si el WS se cae y vuelve, el `pomodoro.state` inicial de la reconexión resincroniza solo.

### Ficheros

**`web/src/hooks/useRoomPomodoro.ts`** — nuevo. Recibe el `send` y los mensajes de
`useRoomPresence`; no abre un WebSocket propio. Devuelve:

```typescript
{
  state: PomodoroState | null;
  secondsRemaining: number;
  isRunning: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}
```

Para que este hook vea los mensajes tendrás que **extender `useRoomPresence`** para que exponga
el último mensaje recibido, o mejor: extraer un `useRoomChannel(roomId)` que abra el socket una
sola vez y del que cuelguen presencia y pomodoro. **Prefiere lo segundo** — si cada hook abre su
propio socket vuelves a tener dos conexiones por usuario, justo lo que se acaba de arreglar.

**`web/src/components/rooms/PomodoroPanel.tsx`** — nuevo.

- Cuenta atrás grande y legible en `mm:ss`, tabular (`font-variant-numeric: tabular-nums`) para
  que los dígitos no bailen
- Etiqueta de fase: "Concentración" / "Descanso corto" / "Descanso largo"
- Progreso del ciclo: 8 puntos, el actual marcado
- Botones Iniciar/Parar **solo visibles si `user.id === roomDetail.owner_id`**
- Estado vacío cuando no hay pomodoro activo, con copy distinto para owner y no-owner
- Color por fase, respetando la paleta del portfolio: `#4F46E5` focus, `#7C3AED` descanso corto,
  `#EC4899` descanso largo

**`web/src/pages/RoomDetailPage.tsx`** — el grid pasa de `lg:grid-cols-4` a tres columnas:
vídeo (2), Pomodoro (1), miembros (1). En móvil, el Pomodoro va **arriba del vídeo**: es el
elemento que el usuario mira cada pocos minutos.

**`web/src/services/user.service.ts`** — nuevo, un solo método:
`getStats(): Promise<{ pomodoros_completed: number }>` contra `GET /api/v1/users/me/stats`.
Refresca al recibir `pomodoro.phase_change` con `from_phase === "focus"` — el backend incrementa
el contador justo al terminar una fase de foco.

### Tests (mínimo 8)

1. Renderiza `00:00` y estado vacío sin pomodoro activo
2. Al recibir `pomodoro.state`, muestra la cuenta atrás correcta
3. La cuenta atrás decrementa con timers falsos (`vi.useFakeTimers()`)
4. Llega a `00:00` y **no** salta de fase sola
5. `pomodoro.phase_change` actualiza fase y duración
6. `pomodoro.stopped` vuelve al estado vacío
7. Los botones no se renderizan si el usuario no es el owner
8. Un mensaje `error` del servidor se muestra al usuario

Commit: `feat(web): Pomodoro sincronizado en el detalle de room`

---

## Bloque 2 — Refresh token automático

Deuda del Prompt 6. Hoy `web/src/services/http.ts` hace esto ante un 401:

```typescript
authStorage.clear();
window.dispatchEvent(new CustomEvent("auth:unauthenticated"));
```

Es decir: **te echa a login**. Con `access_token` de vida corta, eso pasa a mitad de una sesión de
estudio. Y hay un refresh token guardado sin usar.

### Implementación

Interceptor de respuesta que, ante un 401 que **no venga de `/auth/refresh` ni de `/auth/login`**:

1. Llama a `authService.refresh(authStorage.getRefreshToken())`
2. Guarda el nuevo access token
3. Reintenta la petición original **una sola vez** (marca `config._retry = true`)
4. Si el refresh falla, entonces sí: `clear()` + evento

**Lo que se rompe si lo haces ingenuo:** con tres peticiones en paralelo caducadas, disparas tres
refresh a la vez y dos fallan. Necesitas una **cola**: la primera lanza el refresh, las demás
esperan a esa misma promesa.

```typescript
let refreshPromise: Promise<string> | null = null;

async function getFreshToken(): Promise<string> {
  refreshPromise ??= authService
    .refresh(authStorage.getRefreshToken()!)
    .then((r) => { /* guardar */ return r.access_token; })
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
}
```

**Ojo con el WebSocket:** `useWebSocket` mete el token en la query al conectar. Un token renovado
no llega al socket ya abierto. No lo resuelvas aquí — anótalo en `BACKLOG.md`: el socket se cerrará
con código 4401 y la reconexión ya cogerá el token nuevo del storage. Verifica que ese camino
funciona antes de darlo por bueno.

### Tests (mínimo 4)

1. Un 401 dispara el refresh y reintenta la original
2. Si el refresh falla, limpia sesión y emite el evento
3. Tres peticiones concurrentes con 401 disparan **un solo** refresh
4. Un 401 del propio `/auth/refresh` no entra en bucle

Commit: `feat(web): refresco automático de access token con cola de peticiones`

---

## Bloque 3 — Notes UI

El backend está completo en `/api/v1/notes`. Contrato:

| Método | Ruta | Notas |
|---|---|---|
| `POST` | `/notes` | **`multipart/form-data`**: `subject`, `title`, `description?`, `room_id?`, `file` |
| `GET` | `/notes` | Query: `subject?`, `room_id?`, `sort`, `page`, `limit` |
| `GET` | `/notes/{id}` | Devuelve `reviews[]`, `rating_avg`, `reviews_count` |
| `DELETE` | `/notes/{id}` | Solo el owner. 204 |
| `POST` | `/notes/{id}/reviews` | `{rating: 1-5, comment?}`. Falla si es tuya o si ya la valoraste |

`sort` acepta `rating_desc`, `created_desc`, `created_asc`. Validaciones del servidor a replicar en
cliente: máximo **10 MB**, mime types `application/pdf`, `image/jpeg`, `image/png`, `image/webp`,
`text/markdown`, `text/plain`. El backend además **comprueba los magic bytes**, así que un `.exe`
renombrado a `.pdf` será rechazado — muestra ese error tal cual, no lo escondas.

### El detalle que se olvida siempre

`http` tiene `headers: {"Content-Type": "application/json"}` fijado en la instancia de axios. Para
el upload hay que **dejar que el navegador ponga el `Content-Type` con el boundary**:

```typescript
await http.post("/api/v1/notes", formData, {
  headers: { "Content-Type": undefined },
});
```

Si lo fuerzas a `multipart/form-data` sin boundary, el backend devuelve 422 y se pierde media hora.

### Ficheros

- `web/src/services/notes.service.ts` — los 5 métodos
- `web/src/types/notes.ts` — regenera con `npm run gen:api-types` y extiende
- `web/src/pages/NotesListPage.tsx` — ruta `/notes`, filtro por asignatura, selector de orden,
  paginación
- `web/src/pages/NoteDetailPage.tsx` — ruta `/notes/:id`, metadatos, botón de descarga, reseñas
- `web/src/components/notes/NoteCard.tsx` — título, asignatura, autor, media en estrellas, nº reseñas
- `web/src/components/notes/UploadNoteDialog.tsx` — formulario con `react-hook-form` + `zod`,
  validando tamaño y tipo **antes** de enviar
- `web/src/components/notes/ReviewForm.tsx` — estrellas 1-5 + comentario opcional
- `web/src/components/ui/StarRating.tsx` — reutilizable, modo lectura y modo edición
- Rutas nuevas en `web/src/router/routes.tsx`, protegidas
- Enlace a `/notes` desde `DashboardPage`

### Estados que hay que cubrir sí o sí

Listado vacío, listado vacío **tras filtrar** (copy distinto), subiendo (con barra o spinner y el
botón deshabilitado), error de subida con el mensaje del servidor, apunte sin reseñas, e intento de
reseñar algo propio (el backend responde 4xx: no muestres el formulario de entrada).

### Tests (mínimo 10)

1. El listado renderiza las notas que devuelve el servicio
2. Estado vacío sin resultados
3. El filtro por asignatura llama al servicio con el parámetro correcto
4. El cambio de orden vuelve a pedir con `sort` nuevo
5. La paginación pide la página siguiente
6. El upload rechaza en cliente un fichero > 10 MB
7. El upload rechaza un mime type no permitido
8. El upload manda `FormData` sin `Content-Type` forzado
9. El detalle pinta reseñas y media
10. El formulario de reseña no aparece en un apunte propio
11. Enviar una reseña recarga el detalle

Commits (uno por unidad, no uno gigante):

- `feat(web): servicio y tipos de notes`
- `feat(web): listado de apuntes con filtro, orden y paginación`
- `feat(web): subida de apuntes con validación en cliente`
- `feat(web): detalle de apunte con reseñas y valoración`

---

## Bloque 4 — Polish y cierre

- **Paleta consistente** con el portfolio: `#4F46E5` primario, `#7C3AED` secundario, `#EC4899`
  acento. Extráelos a variables CSS en `index.css`; nada de hex sueltos por los componentes.
- **Skeletons** en lugar de spinners en listados. Un spinner centrado en una página entera se
  percibe más lento que un skeleton con la forma del contenido.
- **Accesibilidad:** la cuenta atrás con `aria-live="polite"` y `role="timer"`; el cambio de fase
  debe anunciarse. Foco visible en todo lo interactivo. Contraste AA en los tres colores sobre
  blanco — comprueba el rosa `#EC4899`, que se queda corto en texto pequeño.
- **Responsive:** prueba a 375 px de ancho. El grid de tres columnas tiene que apilarse con el
  Pomodoro primero.
- **README:** actualiza las capturas y el estado de las fases.

Commit: `style(web): paleta unificada, skeletons y accesibilidad del Pomodoro`

---

## Definición de terminado

```bash
cd backend && ruff check app/ tests/ && ruff format --check app/ tests/ && pytest tests/ -q
cd web && npm ci && npm run lint && npm run typecheck && npm run test && npm run build
python scripts/e2e/browser_two_users.py   # con el check de vídeo ya crítico
```

Todo en verde, y además:

- Dos usuarios en el mismo room ven **el mismo segundo** en la cuenta atrás
- El contador personal de pomodoros sube al terminar una fase de foco
- Se puede subir un apunte, encontrarlo filtrando y valorarlo desde otra cuenta
- Una sesión larga no expulsa al usuario a login
- ≥ 22 tests nuevos entre backend y web

Cuando esté, escribe `docs/reports/08-e2e-report.md` con el mismo formato que el 07: qué se probó,
comando de reproducción, capturas en `docs/evidence/prompt-08/` y **los bugs que encuentres, sin
maquillar**. El informe del 07 es útil precisamente porque dice que el E2E no pasó limpio.

---

## Si te quedas sin tiempo

Prioridad descendente. Corta por donde haga falta, pero **cierra el bloque en el que estés**:

1. Bloque 0 — LiveKit (bloqueante)
2. Bloque 1 — Pomodoro (es el feature diferencial del MVP; sin esto no hay producto)
3. Bloque 2 — Refresh token (4 tests, media hora, arregla un fallo que se nota mucho)
4. Bloque 3 — Notes (el más grande y el más prescindible para una demo)
5. Bloque 4 — Polish
