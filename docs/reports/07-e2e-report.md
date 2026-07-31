# Informe E2E — Prompt 7 (Rooms + WebSocket + LiveKit)

**Fecha de ejecución:** ~2 junio 2026 (según `mtime` de las capturas: 2026-06-02 17:30)
**Fecha del informe:** 31 julio 2026 — redactado a posteriori sobre la evidencia conservada
**Ejecutado por:** Google Antigravity, en local (Windows)
**Resultado:** ⚠️ Parcial — la presencia por WebSocket funciona, pero con dos bugs

---

## Objetivo

Verificar en navegador real, con dos usuarios simultáneos, que el Prompt 7 entrega:

1. Conexión WebSocket estable a `/ws/rooms/{room_id}` con badge de estado
2. Presencia en tiempo real: cada usuario ve al otro en el `MemberList`
3. `RoomVideoGrid` conecta con LiveKit sin romper la página

## Cómo reproducirlo

```bash
docker compose up -d                                   # Postgres + Redis
cd backend && uvicorn app.main:app --reload            # :8000
cd web && npm run dev                                  # :5173

pip install playwright httpx && playwright install chromium
python scripts/e2e/seed_two_users.py                   # crea user1/user2 y el room
python scripts/e2e/browser_two_users.py                # el E2E propiamente dicho
```

`browser_two_users.py` levanta dos contextos aislados de Chromium (localStorage
separado), loguea a `user1@test.com` y `user2@test.com`, crea el room, mete a los
dos y captura pantalla de ambos.

## Evidencia

| Captura | Qué muestra |
|---|---|
| [`docs/evidence/prompt-07/user1_room.png`](../evidence/prompt-07/user1_room.png) | Vista de user1 en "E2E Test Room" |
| [`docs/evidence/prompt-07/user2_room.png`](../evidence/prompt-07/user2_room.png) | Vista de user2 en el mismo room |

## Resultados

| Check | Resultado |
|---|---|
| Badge WS "Conectado" en user1 | ✅ PASS |
| Badge WS "Conectado" en user2 | ✅ PASS |
| user1 ve a *User Two* en el MemberList | ✅ PASS |
| user2 ve a *User One* en el MemberList | ✅ PASS |
| Recuento de miembros correcto | 🔴 **FAIL** — ver BUG 1 |
| `RoomVideoGrid` conectado a LiveKit | 🔴 **FAIL** — ver BUG 2 |

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

## BUG 2 — LiveKit muestra "Disconnected" 🔴 ABIERTO

**Severidad:** Alta
**Estado:** pendiente

Ambas capturas muestran el toast **"Disconnected"** sobre el grid de vídeo. En la de
user2 aparece además el botón "Start Audio" sin resolver. El componente renderiza
—no rompe la página, el tile del participante se dibuja— pero la sala de LiveKit no
queda conectada.

**Hipótesis a descartar, por orden de coste:**

1. Credenciales de LiveKit ausentes o caducadas en `backend/.env`
   (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`)
2. `VITE_LIVEKIT_URL` apuntando a un servidor que no está levantado
3. TTL del token expirado entre que se emite y el cliente lo usa
4. Permisos de cámara/micrófono en Chromium headless — Playwright los deniega por
   defecto; hace falta `permissions=["camera", "microphone"]` en `new_context()`,
   o `--use-fake-device-for-media-stream`

La 4 es la más probable dado que el E2E corre headless, y explicaría por qué el
tile aparece en gris con el icono de avatar. **Descartarla antes de tocar código.**

**Cómo diagnosticarlo:**

```bash
python scripts/e2e/check_livekit_token.py    # ¿el backend emite un token válido?
```

y después reproducir a mano en dos navegadores reales, que sí piden permisos.

---

## BUG 3 — El E2E puede dar falso verde 🟡 ABIERTO

**Severidad:** Media

`browser_two_users.py` contiene:

```python
else:
    print("  [WARN] RoomVideoGrid: Unknown state")
    results["video_grid_no_error"] = True  # Don't fail for this
```

y el `exit code` solo depende de los cuatro checks de WS y presencia:

```python
critical_pass = all([
    results["ws_badge_user1"], results["ws_badge_user2"],
    results["member_list_user1_sees_user2"], results["member_list_user2_sees_user1"],
])
```

Es decir: **el script pudo salir con código 0 en esta misma ejecución pese al BUG 2.**
Un E2E que no falla cuando el vídeo está caído no sirve como puerta de calidad.
Al arreglar el BUG 2, hacer crítico el check de LiveKit.

---

## Conclusión

El Prompt 7 se da por **entregado con reservas**: la funcionalidad diferencial de la
fase (presencia en tiempo real por WebSocket) funciona y está cubierta por tests. El
BUG 1 queda cerrado. El BUG 2 bloquea la parte de vídeo y debe resolverse **antes**
del Prompt 8, porque la UI del Pomodoro sincronizado se monta sobre el mismo
`RoomDetailPage` y conviene no acumular dos capas de fallo en la misma pantalla.
