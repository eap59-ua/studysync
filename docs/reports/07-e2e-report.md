# Informe E2E — Prompt 7 (Rooms + WebSocket + LiveKit)

**Primera ejecución:** ~2 junio 2026 (según `mtime` de las capturas originales: 2026-06-02 17:30)
**Fecha del informe:** 31 julio 2026 — redactado a posteriori sobre la evidencia conservada
**Reejecución:** 31 julio 2026, tras el Bloque 0 del Prompt 8
**Ejecutado por:** Google Antigravity (junio) · Claude Code (reejecución de julio), en local (Windows)
**Resultado:** ✅ Verde — los tres bugs cerrados. Las capturas de este informe son las de la
reejecución de julio; las de junio, con el vídeo caído, quedan descritas en el BUG 2.

---

## Objetivo

Verificar en navegador real, con dos usuarios simultáneos, que el Prompt 7 entrega:

1. Conexión WebSocket estable a `/ws/rooms/{room_id}` con badge de estado
2. Presencia en tiempo real: cada usuario ve al otro en el `MemberList`
3. `RoomVideoGrid` conecta con LiveKit sin romper la página

## Cómo reproducirlo

```bash
docker compose up -d postgres redis livekit            # Postgres + Redis + LiveKit
cd backend && pip install -e ".[dev]" && uvicorn app.main:app --reload   # :8000
cd web && npm run dev                                  # :5173

pip install playwright httpx && playwright install chromium
python scripts/e2e/seed_two_users.py                   # crea user1/user2 y el room
python scripts/e2e/browser_two_users.py                # el E2E propiamente dicho
```

No uses `docker compose up -d` a secas si vas a levantar el backend con `uvicorn`: el
servicio `backend` del compose publica también el `:8000` y chocan.

`browser_two_users.py` levanta dos contextos aislados de Chromium (localStorage
separado, cámara y micrófono concedidos con dispositivos falsos), loguea a
`user1@test.com` y `user2@test.com`, crea el room, mete a los dos y captura pantalla
de ambos.

## Evidencia

Capturas de la reejecución del 31/07/2026, ya con LiveKit conectado:

| Captura | Qué muestra |
|---|---|
| [`docs/evidence/prompt-07/user1_room.png`](../evidence/prompt-07/user1_room.png) | user1 en "E2E Test Room": dos tiles de vídeo (*User One* y *User Two*), sin toast de error, `Conectados (2)` |
| [`docs/evidence/prompt-07/user2_room.png`](../evidence/prompt-07/user2_room.png) | user2 en el mismo room, con la vista simétrica |

El patrón verde de los tiles es el dispositivo de vídeo falso de Chromium
(`--use-fake-device-for-media-stream`), no un fallo de render.

## Resultados

| Check | Junio 2026 | Julio 2026 |
|---|---|---|
| Badge WS "Conectado" en user1 | ✅ PASS | ✅ PASS |
| Badge WS "Conectado" en user2 | ✅ PASS | ✅ PASS |
| user1 ve a *User Two* en el MemberList | ✅ PASS | ✅ PASS |
| user2 ve a *User One* en el MemberList | ✅ PASS | ✅ PASS |
| Recuento de miembros correcto | 🔴 FAIL — BUG 1 | ✅ PASS — `Conectados (2)` |
| `RoomVideoGrid` conectado a LiveKit (user1) | 🔴 FAIL — BUG 2 | ✅ PASS |
| `RoomVideoGrid` conectado a LiveKit (user2) | 🔴 FAIL — BUG 2 | ✅ PASS |

Exit code de la reejecución: **0**, y ahora significa algo — hasta el Bloque 0 del Prompt 8 el
check de vídeo no afectaba al exit code (BUG 3).

El objetivo principal del Prompt 7 —presencia bidireccional en tiempo real— se
cumple. El WebSocket conecta, autentica por token en query param y propaga
`user_joined` correctamente entre clientes.

---

## BUG 1 — Miembros duplicados en la lista de presencia ✅ CORREGIDO

**Severidad:** Alta
**Estado:** corregido el 31/07/2026 en `c530db5`

En las capturas, con **dos usuarios** conectados:

- user1 ve `Conectados (3)`: *User One*, *User Two*, *User One*
- user2 ve `Conectados (4)`: *User One*, *User Two*, *User Two*, *User One*

**Causa raíz.** Tres factores encadenados:

1. `ConnectionManager` modelaba la presencia como **conexiones**, no como usuarios.
   `presence_state` se construía iterando `active_connections[room_id]`, y `count`
   era `len(active_connections[room_id])`.
2. `web/src/main.tsx` monta la app en `<StrictMode>`. React 19 ejecuta el efecto
   dos veces en desarrollo, así que cada usuario abría **dos WebSockets**.
3. `useRoomPresence` deduplicaba en `user_joined` pero aplicaba `presence_state`
   en bruto con `setMembers(msg.members)`.

Resultado: 2 usuarios × 2 sockets = 4 entradas.

**Corrección aplicada.**

- `get_connected_users()` / `get_connected_user_ids()` devuelven usuarios distintos
- `count_connected_users()` cuenta personas, no sockets
- `user_left` solo se emite si `is_user_connected()` es falso, es decir, cuando al
  usuario no le queda ningún socket abierto en el room
- el cliente deduplica `presence_state` por `id` sin fiarse del servidor

Cubierto por 4 tests de `ConnectionManager` y 2 de `useRoomPresence`.

**Nota:** no se ha tocado `<StrictMode>`. El doble montaje es una herramienta de
diagnóstico deliberada de React y el bug real estaba en asumir 1 socket = 1 persona,
que en producción también se rompe con reconexiones solapadas y con el mismo usuario
en dos pestañas.

---

## BUG 2 — LiveKit muestra "Disconnected" ✅ CORREGIDO

**Severidad:** Alta
**Estado:** corregido el 31/07/2026, Bloque 0 del Prompt 8

En las capturas de junio, ambas pantallas mostraban el toast **"Disconnected"** sobre el
grid de vídeo, y la de user2 además el botón "Start Audio" sin resolver. El componente
renderizaba —no rompía la página, el tile del participante se dibujaba— pero la sala de
LiveKit nunca quedaba conectada.

**Causa raíz: no había ningún servidor LiveKit.**

`backend/.env` apuntaba a `LIVEKIT_URL=http://localhost:7880` con `LIVEKIT_API_KEY=devkey`
y `LIVEKIT_API_SECRET=secret` — los tres valores por defecto de `livekit-server --dev`.
Pero `docker-compose.yml` solo declaraba `postgres`, `redis` y `backend`: **el servidor
al que apuntaba esa configuración no existía en ninguna parte del proyecto**. Mientras
tanto el README, el ADR 001 y `.env.example` documentaban LiveKit Cloud
(`wss://<proyecto>.livekit.cloud`). Alguien dejó a medias una configuración local que
además contradecía la documentada, y nadie levantó nunca ese servidor.

Cadena de fallo medida el 31/07/2026, antes del arreglo:

| Eslabón | Resultado |
|---|---|
| `POST /rooms/{id}/livekit-token` | **200**, token bien formado |
| Firma del JWT | HS256, `iss: devkey` |
| `url` devuelta al cliente | `http://localhost:7880` |
| Conexión TCP a `localhost:7880` | **`ConnectionRefusedError` (WinError 10061)** |

`RoomVideoGrid` pasa esa `url` tal cual a `<LiveKitRoom serverUrl>`, `livekit-client` la
convierte a `ws://localhost:7880` mediante `toWebsocketUrl()` y la conexión se rechaza.

**Por qué sobrevivió dos meses.** `get_livekit_service()` solo comprueba que las tres
variables no estén vacías; nunca valida que el servidor sea alcanzable. El endpoint
respondía 200 y `check_livekit_token.py` imprimía `[PASS] LiveKit token issued
successfully` con el vídeo caído. La herramienta de diagnóstico era ciega a este fallo.

**Nota sobre las hipótesis del plan del Prompt 8.** La hipótesis 1 (credenciales de
LiveKit Cloud caducadas por inactividad) era irrelevante: el proyecto no apuntaba a Cloud.
La hipótesis 2 dio positivo, pero no en la forma prevista — `RoomVideoGrid` **no** lee
ningún `VITE_LIVEKIT_URL`, coge la URL de la respuesta del backend, y el cableado del
cliente era correcto; lo que estaba mal era el destino.

**Corrección aplicada.**

- Servicio `livekit` (`livekit/livekit-server:v1.12.0`) en `docker-compose.yml`, en modo
  dev y con `LIVEKIT_KEYS="devkey: secret"`, que casa con el `backend/.env` existente.
- `NODE_IP=127.0.0.1`. Sin esto el servidor anuncia la IP del contenedor como candidato
  ICE, y Docker Desktop no enruta esa red desde el host: la señalización conectaría pero
  no habría medio.
- `UDP_PORT=7882` para multiplexar WebRTC en un solo puerto. Publicar el rango por
  defecto 50000-60000 en Docker Desktop levanta un `docker-proxy` por puerto y tarda
  minutos en arrancar.

Verificado en dos niveles antes de tocar el frontend: el servidor acepta el token que
emite el backend (`GET /rtc/validate` → **200 `success`**), y el E2E muestra vídeo
bidireccional real — cada usuario ve su tile y el del otro, con el patrón del dispositivo
falso de Chromium. Que el medio fluya en ambos sentidos confirma que los candidatos ICE
son alcanzables, no solo que la señalización conecta.

**Defecto secundario, real pero no causante.** `browser_two_users.py` creaba los contextos
con `new_context()` sin permisos y lanzaba Chromium sin dispositivos falsos, así que
headless denegaba cámara y micrófono. **No era la causa** —no había servidor al que
conectarse—, pero habría bloqueado la publicación de tracks en cuanto lo hubiera. Se
corrigió a la vez: `permissions=["camera", "microphone"]` y
`--use-fake-device-for-media-stream` / `--use-fake-ui-for-media-stream`.

---

## BUG 3 — El E2E puede dar falso verde ✅ CORREGIDO

**Severidad:** Media
**Estado:** corregido el 31/07/2026, Bloque 0 del Prompt 8

`browser_two_users.py` contenía:

```python
else:
    print("  [WARN] RoomVideoGrid: Unknown state")
    results["video_grid_no_error"] = True  # Don't fail for this
```

Todas las ramas del check acababan en `True`, y el `exit code` solo dependía de los cuatro
checks de WS y presencia. Es decir: **el script salió con código 0 en la ejecución de junio
pese al BUG 2.** Un E2E que no falla cuando el vídeo está caído no sirve como puerta de
calidad.

**Corrección aplicada.** El check de vídeo se reescribió y ahora `video_user1` y
`video_user2` entran en `critical_pass`.

Lo importante es *qué* se comprueba. El check anterior miraba el DOM, y eso no vale aquí:
como dice el propio BUG 2, **el tile del participante se dibujaba igual con la sala
desconectada**, así que contar tiles habría vuelto a dar verde con el vídeo roto. El check
nuevo observa el **WebSocket contra el `:7880`** vía `page.on("websocket")` —exactamente
el transporte que fallaba— y exige que se abra, no dé `socketerror` y no se cierre. El
toast de estado y el recuento de tiles quedan como señales secundarias. El WS de presencia
del backend va por el `:8000`, así que filtrar por puerto los distingue.

---

## Incidencias de entorno encontradas en la reejecución

No son bugs de producto, pero costaron tiempo y quien retome el proyecto se los va a
encontrar:

- **`docker compose up -d` no arrancaba.** `docker-compose.override.yml` declaraba un
  servicio `db:` cuando en el compose base se llama `postgres:`, así que Compose intentaba
  crear un servicio sin imagen y abortaba con `service "db" has neither an image nor a
  build context specified`. El fichero está en `.gitignore`, por eso los comandos de
  `CLAUDE.md` sí funcionaban "en un clon limpio" — allí el override no existe. Renombrado
  a `postgres:`.
- **`ModuleNotFoundError: No module named 'pwdlib'`.** El intérprete de la máquina tenía
  el set de dependencias anterior a `5b050ad` (`passlib` + `bcrypt` instalados, `pwdlib` y
  `argon2` no). El código migró a `pwdlib` con Argon2id y el entorno no se resincronizó.
  Se arregla con `pip install -e ".[dev]"` desde `backend/`. Los usuarios seed de junio
  conservan hash bcrypt (`$2b$12$`) y siguen entrando gracias al `BcryptHasher` de la
  tupla, tal como estaba previsto.

---

## Conclusión

El Prompt 7 queda **entregado y en verde**, ya sin reservas. La funcionalidad diferencial
de la fase —presencia en tiempo real por WebSocket— funciona y está cubierta por tests, y
los tres bugs están cerrados: el BUG 1 en `c530db5`, y el BUG 2 y el BUG 3 en el Bloque 0
del Prompt 8.

La lección que conviene no perder es la del BUG 2: el fallo sobrevivió dos meses no porque
fuera sutil, sino porque **la comprobación que debía detectarlo miraba el sitio
equivocado**. El endpoint de token respondía 200 y el script de diagnóstico lo daba por
bueno, cuando lo que estaba roto era la alcanzabilidad del servidor, que nadie comprobaba.
De ahí que el check nuevo observe el transporte y no el DOM.

Con esto, el Bloque 1 del Prompt 8 puede montar la UI del Pomodoro sobre un
`RoomDetailPage` limpio, que era la condición que ponía el plan.
