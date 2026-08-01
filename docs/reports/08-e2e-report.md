# Informe E2E — Prompt 8 (Pomodoro UI, refresh token, Notes UI, polish)

**Fecha de ejecución:** 1-2 agosto 2026
**Ejecutado por:** Claude Code, en local (Windows 11, Docker Desktop)
**Resultado:** ✅ Verde — los cinco bloques cerrados, con tres defectos encontrados
y corregidos por el camino y dos limitaciones que quedan abiertas en el BACKLOG

---

## Objetivo

Verificar que un usuario autenticado puede:

1. Ver y controlar el **Pomodoro sincronizado** dentro de un room
2. Ver su contador personal de pomodoros completados
3. **Subir apuntes** desde el navegador
4. **Listar y filtrar** apuntes por asignatura, ordenados por valoración
5. **Ver el detalle** de un apunte con sus reseñas y dejar la suya
6. Seguir navegando sin que la sesión caduque a mitad

## Cómo reproducirlo

```bash
docker compose up -d postgres redis livekit          # NO `up -d` a secas: el
                                                     # servicio backend también
                                                     # publica el :8000
cd backend && pip install -e ".[dev]"
uvicorn app.main:app --reload                        # :8000
cd web && npm ci && npm run dev                      # :5173

python scripts/e2e/seed_two_users.py                 # user1/user2 y el room
python scripts/e2e/browser_two_users.py              # puerta de calidad
python scripts/e2e/capture_prompt08.py               # capturas del informe
```

## Verificación automática

```
backend   ruff check ............ All checks passed!
backend   pytest ............... 74 passed
web       eslint ............... limpio
web       tsc -b --noEmit ...... limpio
web       vitest ............... 111 passed  (24 al empezar el Prompt 8)
web       vite build ........... OK
E2E       browser_two_users.py . 6/6, exit code 0
```

Los 87 tests nuevos, por bloque:

| Bloque | Tests | Desglose |
|---|---|---|
| 1 — Pomodoro | 35 | `useRoomChannel` 4 · `useRoomPomodoro` 11 · `PomodoroPanel` 14 · `useUserPomodoroStats` 5 · `useRoomPresence` +1 |
| 2 — Refresh token | 9 | `httpRefresh` 9 |
| 3 — Notes | 43 | `notesService` 9 · `NotesListPage` 11 · `NoteDetailPage` 12 · `UploadNoteDialog` 7 · `StarRating` 4 |

El Bloque 4 no añade ficheros de test: sus tres tests nuevos (dos de
accesibilidad del Pomodoro y uno de concordancia del singular) viven en los
ficheros de los bloques 1 y 3, ya contados arriba.

## Evidencia

Capturas del 2 de agosto de 2026, regenerables con `capture_prompt08.py`:

| Captura | Qué muestra |
|---|---|
| [`pomodoro_running.png`](../evidence/prompt-08/pomodoro_running.png) | Pomodoro en marcha: fase "Concentración", 24:59 en tabular, 8 puntos del ciclo con el actual marcado, botón Parar (owner) y contador personal |
| [`notes_list.png`](../evidence/prompt-08/notes_list.png) | Listado con filtro por asignatura, selector de orden, tarjeta con media en estrellas y paginación |
| [`note_detail.png`](../evidence/prompt-08/note_detail.png) | Detalle con metadatos, descarga, borrado (owner) y la reseña de otro usuario |

---

## Resultados

| Check | Resultado |
|---|---|
| Dos usuarios ven el mismo segundo en la cuenta atrás | ✅ PASS — verificado a mano por el autor |
| La cuenta atrás llega a 00:00 y no salta de fase sola | ✅ PASS — cubierto por test |
| Los controles solo aparecen para el owner | ✅ PASS |
| Contador personal visible | ✅ PASS |
| Sesión caducada se recupera sin echar a login | ✅ PASS — ver más abajo |
| Un refresco único con peticiones concurrentes | ✅ PASS — verificado en red real |
| Subida de PDF | ✅ PASS — 201 Created |
| Rechazo de un `.exe` renombrado a `.pdf` | ✅ PASS — 415, mensaje del servidor visible |
| Filtro, orden y paginación | ✅ PASS |
| Reseñar desde otra cuenta | ✅ PASS |
| Foco visible con teclado | 🔴 **FAIL al empezar** — ver BUG 3, corregido |
| Barra de controles de LiveKit | 🔴 **FAIL al empezar** — ver BUG 4, corregido |

---

## El refresco de token, medido en red real

Se saboteó el access token en `localStorage` dejando el refresh válido, y se
recargó la sala. Traza de red:

```
GET  /api/v1/auth/me      → 401
GET  /api/v1/auth/me      → 401     ← dos en paralelo (StrictMode monta dos veces)
POST /api/v1/auth/refresh → 200     ← UNO SOLO
GET  /api/v1/auth/me      → 200
GET  /api/v1/auth/me      → 200     ← ambas reintentadas
```

Todo lo posterior en 200 y el token guardado con 60 minutos de vida. El usuario
no llegó a ver la pantalla de login. La cola de refrescos queda validada bajo
concurrencia real, no simulada.

## La subida, contra el backend real

| Caso | Resultado |
|---|---|
| PDF válido (cabecera `%PDF-`) | `POST /api/v1/notes` → **201 Created**, aparece en el listado |
| Ejecutable PE (cabecera `MZ`) renombrado a `.pdf` con mime `application/pdf` | **415**, la UI muestra `Invalid PDF file signature.` y el diálogo sigue abierto |

El segundo caso es el que importa: pasa la validación de cliente —el mime que
declara el fichero es correcto— y lo tumba el servidor por los magic bytes. Que
el mensaje del servidor llegue literal a la UI es lo que permite entender qué
pasó.

---

## BUG 1 — El cálculo de offset que proponía el plan estaba roto 🟢 EVITADO

**Severidad:** Alta (habría roto la feature diferencial)
**Estado:** no llegó a implementarse

El plan del Prompt 8 proponía recalibrar el reloj en cada `pomodoro.state`:

```typescript
serverOffsetRef.current = new Date(state.started_at).getTime() - Date.now();
const remaining = duration * 1000 - (Date.now() + serverOffsetRef.current - startedAtMs);
```

Sustituyendo, los términos se cancelan y `remaining` sale siempre igual a la
duración completa. Entrar a una sala con 20 minutos de foco consumidos habría
mostrado 25:00 mientras el resto de la sala veía 5:00 — exactamente lo que la
feature promete evitar.

**Corrección.** Solo se calibra con mensajes recién emitidos: `phase_change`
siempre, y `pomodoro.state` salvo el primero de cada conexión, que puede traer
una fase empezada hace rato. Lo fija el test *"calcula la cuenta atrás desde
started_at, no desde que llega el mensaje"*, que falla con la versión del plan.

**Lo que no cubre.** Como el backend solo manda estado al conectar *si hay un
pomodoro activo*, cuando no lo hay el primer `pomodoro.state` sí es fresco pero
se trata como sospechoso y no se calibra hasta el primer cambio de fase. El
error va siempre hacia el lado seguro (offset 0, reloj del cliente), nunca hacia
calibrar mal. Anotado en `BACKLOG.md`; la solución limpia es del backend.

---

## BUG 2 — El WebSocket no ve el token renovado 🟡 ABIERTO

**Severidad:** Media
**Estado:** documentado en `BACKLOG.md`, fuera del alcance del prompt por
indicación expresa del plan

El plan daba por hecho que el socket se cerraría con código 4401 y que la
reconexión cogería el token nuevo del storage, y pedía verificarlo antes de
darlo por bueno. Se verificó y **no es así**, por dos motivos distintos:

1. El token se valida **una sola vez**, en el handshake (`rooms_ws.py:119`). El
   bucle de mensajes no lo revalida, de modo que un socket abierto sobrevive a
   la caducidad de su token. Hoy juega a favor, pero significa que una sesión
   revocada sigue recibiendo eventos del room.
2. Abriendo a mano un WebSocket con un token inválido, el navegador recibe
   **1006**, no 4401: el backend llama a `close(4401)` antes de `accept()`, así
   que se deniega el handshake y el código de aplicación nunca viaja. Ningún
   cliente podría distinguir "token caducado" de "se cayó la red".

Lo que sí funciona: `connect()` relee el token del storage en cada intento, así
que si el refresco por HTTP ya ocurrió, la reconexión entra con el nuevo. El
agujero real es que `useWebSocket` se rinde tras 5 intentos (~31 s de backoff) y
se queda en `closed` para siempre.

---

## BUG 3 — Ningún elemento tenía foco visible 🟢 CORREGIDO

**Severidad:** Alta (accesibilidad)
**Estado:** corregido en el Bloque 4

Los componentes traían `focus:outline-none focus:ring-2 focus:ring-indigo-500`.
Midiendo un botón enfocado en el navegador:

```
outlineStyle: "none"          ← el outline-none sí surte efecto
boxShadow:    "none"
--tw-ring-shadow: "0 0 #0000" ← el anillo de Tailwind no llega a componerse
```

Es decir: **con Tailwind 4 el anillo no se aplica pero el `outline-none` sí**, y
el resultado era que ningún botón, enlace, input o select de la aplicación
mostraba nada al enfocarse. Navegando con teclado no se sabía dónde estabas.

**Corrección.** Una regla `:focus-visible` con outline estándar en `index.css`,
fuera de `@layer` para que gane a las utilidades de Tailwind, y fuera el
`focus:outline-none` del `Button`. Verificado: un elemento enfocado de verdad da
`outline: solid 2px rgb(79, 70, 229)` con 2 px de separación.

---

## BUG 4 — La barra de LiveKit se recortaba 🟢 CORREGIDO

**Severidad:** Media
**Estado:** corregido en el Bloque 4

Regresión propia: al pasar el vídeo de 3/4 a 2/4 del grid para hacer sitio al
Pomodoro, la columna se quedó en unos 596 px mientras los botones de LiveKit
suman unos 950. La barra, centrada y sin envolver, se recortaba por los dos
extremos y el botón de micrófono quedaba cortado.

Se descartaron dos intentos antes de acertar, que es la parte que merece
quedar escrita:

- `flex-wrap: wrap` movía el problema en vez de resolverlo. LiveKit coloca la
  barra en una fila de altura fija, así que la segunda línea se salía del
  contenedor y dejaba **Chat y Leave inalcanzables** — peor que el recorte
  original.
- `justify-content: flex-start` sin cualificar no llegaba a aplicarse: la hoja
  de LiveKit se inyecta después que `index.css` y con el mismo peso su
  `justify-content: center` se imponía. Además, centrado dentro de un contenedor
  desplazable el inicio queda inalcanzable igualmente.

**Corrección.** `[data-lk-theme] .lk-control-bar { justify-content: flex-start;
overflow-x: auto }`. Ningún botón queda fuera de alcance.

---

## BUG 5 — Contraste insuficiente en el acento 🟢 CORREGIDO

**Severidad:** Baja
**Estado:** corregido en el Bloque 4

El plan sospechaba que el rosa `#EC4899` se quedaba corto. Medido:

| Color | Ratio sobre blanco | AA texto normal | AA texto grande |
|---|---|---|---|
| `#4F46E5` primario | 6.29:1 | ✅ | ✅ |
| `#7C3AED` secundario | 5.70:1 | ✅ | ✅ |
| `#EC4899` acento | **3.53:1** | 🔴 | ✅ |
| `#DB2777` variante | 4.60:1 | ✅ | ✅ |

La sospecha era correcta. Se mantiene `#EC4899` donde cumple —la cuenta atrás es
texto grande— y se usa `#DB2777` para textos pequeños, que es donde estaba el
incumplimiento. Ambos como variables CSS en `index.css`.

---

## Incidencias de entorno

No son bugs de producto pero costaron tiempo:

- **`npm run gen:api-types` fallaba con el backend levantado.** Apuntaba a
  `localhost` y Node resuelve ese nombre solo a `::1`, mientras uvicorn escucha
  en `127.0.0.1`. Corregido en el script. Para comprobar que los tipos estaban
  al día sin depender del servidor se volcó el esquema con `app.openapi()` y se
  comparó: idéntico byte a byte al `api.ts` commiteado.
- **El log del E2E volcaba un JWT entero.** El check de vídeo imprimía la URL del
  WebSocket con el access token y el `join_request` completos. Ahora se recorta
  la query.

---

## Desviaciones del plan, y por qué

| El plan pedía | Qué se hizo | Motivo |
|---|---|---|
| Calibrar el reloj en cada `pomodoro.state` | Solo con mensajes recién emitidos | La fórmula del plan se cancela sola (BUG 1) |
| Cuenta atrás con `aria-live="polite"` | `aria-live="off"` + región aparte para la fase | "polite" sobre un número que cambia cada segundo hace que el lector cante cada tick |
| Anotar que el WS se cierra con 4401 | Anotado lo que de verdad pasa | Se verificó y el cliente recibe 1006 (BUG 2) |
| — | Skeletons también en el detalle de sala | El mismo argumento del plan aplica a esa pantalla |

---

## Conclusión

El Prompt 8 se da por **entregado y en verde**. Los seis objetivos del slice se
cumplen y la puerta de calidad es real: desde el Bloque 0 el E2E falla si el
vídeo no conecta, y esta vez pasó con 2 tiles por usuario y WebSocket vivo
contra el `:7880`.

Lo más útil de esta fase no es el código sino dos comprobaciones que
desmintieron al plan: la fórmula del offset, que habría roto justamente la
feature diferencial de forma silenciosa, y el 1006 del WebSocket. En ambos casos
el plan estaba escrito con seguridad y en ambos bastó medir para ver que no. La
lección del Prompt 7 —que el fallo sobrevive cuando la comprobación mira el
sitio equivocado— se repite aquí en otra forma.

Quedan abiertos en `BACKLOG.md`: la calibración de reloj sin round-trip, el
WebSocket ajeno al token renovado, y el `ruff format` de `note_repository.py`,
que viene de antes y sigue incumpliendo la definición de terminado.
