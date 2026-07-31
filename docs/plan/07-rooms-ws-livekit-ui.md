# Prompt 7 — Rooms UI + WebSocket presencia + LiveKit video

> **Precondición:** Prompt 6 completado. Auth funciona end-to-end (probado en navegador con browser_subagent). Dashboard muestra "¡Hola, {user}!" como placeholder.
>
> **Tres bloques en este prompt** que conviene ejecutar EN ESTE ORDEN: (A) Rooms UI básica → (B) WebSocket de presencia → (C) LiveKit video grid. No saltes adelante. Es probable que descubras integraciones que no anticipo y tener cada bloque cerrado antes de avanzar reduce el blast radius.

## Por qué este prompt es denso

Estos tres bloques van juntos porque sin uno los otros pierden sentido: rooms sin presencia es estático, presencia sin rooms no tiene contenedor, y video sin rooms no tiene a quién agruparlo. Ejecutarlos en prompts separados duplicaría el trabajo de "instalar contexto" en Antigravity tres veces.

Estimación realista: este prompt te llevará 2-3 sesiones de trabajo. Si te ves agotado a mitad de B, cierra y reanudas. Antigravity puede continuar leyendo el plan donde se quedó.

## Objetivo del slice

Al terminar este prompt, un usuario autenticado puede:

1. Ver una lista de rooms públicos en `/rooms`
2. Crear un room nuevo con un formulario y aparecer en él
3. Entrar a un room por su URL `/rooms/:id`
4. Ver en tiempo real cómo otros usuarios entran/salen del room (WebSocket)
5. Verse en cámara junto a los demás miembros del room (LiveKit video grid)
6. Mute/unmute audio, on/off cam, salir del room

**Fuera de scope:**
- Pomodoro UI (Prompt 8)
- Notes UI (Prompt 8)
- Refresh token automático (Prompt 8)
- Polish visual (Prompt 8)
- Compartir pantalla (post-MVP)
- Chat de texto (post-MVP)

## Diseño técnico — léelo entero antes de codificar

### Bloque preliminar — limpieza y types generados

Antes de empezar el bloque A:

1. **Eliminar `socket.io-client` de deps.** El backend usa WebSocket nativo de FastAPI/Starlette, no Socket.IO. La librería está instalada por error y mantiene confusión.

2. **Generar types desde OpenAPI.** El backend tiene 6 endpoints nuevos (rooms + livekit-token) que valen mucho tipados. Comando:

   ```bash
   cd web
   pnpm gen:api-types
   ```

   Antes, asegúrate de que el backend está corriendo en `localhost:8000`. Si la generación crea conflictos con los tipos manuales que ya hiciste para auth en Prompt 6, **adapta los tipos manuales** para extender los generados:

   ```typescript
   // src/types/auth.ts
   import type { components } from "./api";
   export type User = components["schemas"]["UserResponse"];
   export type LoginResponse = components["schemas"]["TokenResponse"];
   ```

   Mantén los manuales que sigan siendo necesarios; reemplaza los que ya cubre OpenAPI.

3. **Verifica que `pnpm typecheck && pnpm lint && pnpm test` siguen verdes.** Si la regeneración rompe algo, arréglalo antes de tocar features nuevas.

Commit puente: `chore(web): limpiar socket.io-client y generar types desde OpenAPI`.

---

### Bloque A — Rooms UI

#### Servicio

`web/src/services/rooms.service.ts`:

```typescript
import { http } from "./http";
import type { components } from "../types/api";

export type Room = components["schemas"]["RoomResponse"];
export type RoomDetail = components["schemas"]["RoomDetailResponse"];
export type CreateRoomInput = components["schemas"]["RoomCreate"];

export const roomsService = {
  listPublic: async (params: { skip?: number; limit?: number } = {}) => {
    const { data } = await http.get<{ items: Room[]; total: number }>("/api/v1/rooms/public", { params });
    return data;
  },
  create: async (input: CreateRoomInput) => {
    const { data } = await http.post<Room>("/api/v1/rooms", input);
    return data;
  },
  getById: async (roomId: string) => {
    const { data } = await http.get<RoomDetail>(`/api/v1/rooms/${roomId}`);
    return data;
  },
  join: async (roomId: string) => {
    const { data } = await http.post<RoomDetail>(`/api/v1/rooms/${roomId}/join`);
    return data;
  },
  leave: async (roomId: string) => {
    await http.post(`/api/v1/rooms/${roomId}/leave`);
  },
};
```

Nota: los tipos generados pueden estar bajo otro path (`paths` en lugar de `components`). Adapta según lo que devuelva `openapi-typescript`. Si el shape generado no encaja, fallback a tipos manuales y documenta el por qué en un comentario.

#### Páginas

```
src/pages/
├── RoomsListPage.tsx        # /rooms
├── RoomDetailPage.tsx       # /rooms/:id
src/components/rooms/
├── RoomCard.tsx             # tarjeta clicable en la lista
├── CreateRoomDialog.tsx     # modal/dialog con form de creación
├── MemberList.tsx           # avatares + nombres de miembros conectados
└── (LiveKitVideoGrid lo añade el bloque C)
```

`RoomsListPage`:
- `useEffect` carga `roomsService.listPublic()` al montar
- Estado: `loading | error | rooms[]`
- Muestra grid de `RoomCard`
- Botón flotante "Crear room" abre `CreateRoomDialog`

`CreateRoomDialog`:
- Form react-hook-form + zod (campos: `name`, `subject`, `max_members` int 2-20, `is_public` bool)
- Submit llama `roomsService.create()`, en éxito navega a `/rooms/{id}`
- Maneja error mostrando mensaje (ej. error de validación del backend)

`RoomDetailPage`:
- Lee `roomId` de la URL con `useParams`
- Estado: `loading | error | { room, isMember }`
- Si no es miembro, llama `roomsService.join()` automáticamente al entrar (decisión: navegar a un room te une si no lo eres)
- Muestra: nombre del room + asignatura + `MemberList` (estático por ahora; el WebSocket lo añade el bloque B)
- Botón "Salir del room" llama `roomsService.leave()` y redirige a `/rooms`

#### Routing

Añadir en `src/router/routes.tsx`:

```
/rooms             → ProtectedRoute → RoomsListPage
/rooms/:id         → ProtectedRoute → RoomDetailPage
/dashboard         → ProtectedRoute → DashboardPage  (cambia: añade botón "Ver rooms" → /rooms)
```

`DashboardPage` actualizada: además del saludo, un botón grande "Ver rooms" que navega a `/rooms`.

#### Tests bloque A

- `RoomsListPage.test.tsx`: muestra rooms del mock, click en card navega
- `CreateRoomDialog.test.tsx`: validación de campos, submit llama al servicio, redirige
- `RoomDetailPage.test.tsx`: carga room por ID, llama join si no es miembro

3-5 tests aquí.

**Cierra bloque A con commits:**
- `feat(web): servicio de rooms y types desde OpenAPI`
- `feat(web): RoomsListPage con grid y carga del backend`
- `feat(web): CreateRoomDialog con react-hook-form y zod`
- `feat(web): RoomDetailPage con join automático al entrar`
- `test(web): cobertura de rooms list, create dialog y detail`

---

### Bloque B — WebSocket de presencia

#### Decisión: cliente WebSocket nativo + reconexión

El backend usa WebSocket de Starlette (no Socket.IO). Usaremos:
- **`partysocket`** (5KB, auto-reconnect) o
- WebSocket nativo del navegador con un wrapper propio en `src/lib/ws.ts` para reconexión simple (5 reintentos con backoff exponencial)

Recomendación: **`partysocket`**. Más probado que el wrapper propio. Comando:

```bash
pnpm add partysocket
```

#### Hook genérico

`src/hooks/useWebSocket.ts`:

```typescript
import PartySocket from "partysocket";
import { useEffect, useRef, useState } from "react";
import { authStorage } from "../lib/storage";

export type WSMessage = { type: string; [key: string]: unknown };
export type WSStatus = "connecting" | "open" | "closed" | "reconnecting";

export function useWebSocket(url: string, onMessage: (msg: WSMessage) => void) {
  const [status, setStatus] = useState<WSStatus>("connecting");
  const wsRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    const token = authStorage.getAccessToken();
    if (!token) { setStatus("closed"); return; }

    const ws = new PartySocket({ host: new URL(url).host, room: url, query: { token } });
    wsRef.current = ws;

    ws.addEventListener("open", () => setStatus("open"));
    ws.addEventListener("close", () => setStatus("closed"));
    ws.addEventListener("message", (e) => {
      try { onMessage(JSON.parse(e.data)); }
      catch { /* mensaje no JSON, ignorar */ }
    });

    return () => { ws.close(); };
  }, [url]);

  const send = (msg: WSMessage) => wsRef.current?.send(JSON.stringify(msg));

  return { status, send };
}
```

Nota: `partysocket` puede tener API ligeramente distinta a la de WebSocket nativo. Lee la doc oficial (https://github.com/partykit/partykit/tree/main/packages/partysocket) y adapta. Si encuentras fricción, fallback a WebSocket nativo + `useEffect` manual.

#### Hook específico de room

`src/hooks/useRoomPresence.ts`:

```typescript
import { useState } from "react";
import { useWebSocket } from "./useWebSocket";
import type { User } from "../types/auth";

export function useRoomPresence(roomId: string) {
  const [members, setMembers] = useState<User[]>([]);
  const [memberCount, setMemberCount] = useState(0);

  const wsUrl = `${import.meta.env.VITE_WS_BASE_URL}/ws/rooms/${roomId}`;
  const { status, send } = useWebSocket(wsUrl, (msg) => {
    if (msg.type === "user_joined") {
      setMembers((m) => [...m, msg.user as User]);
      setMemberCount(msg.count as number);
    } else if (msg.type === "user_left") {
      setMembers((m) => m.filter((u) => u.id !== (msg.user as User).id));
      setMemberCount(msg.count as number);
    }
    // futuros: pomodoro.* → bloque del Prompt 8
  });

  return { status, members, memberCount, send };
}
```

#### Integración con `RoomDetailPage`

Sustituye el `MemberList` estático por uno que consume `useRoomPresence(roomId)`. Muestra:
- Estado de conexión WS (badge: "Conectado" verde, "Reconectando..." amarillo, "Desconectado" rojo)
- Lista de miembros conectados con avatares (puedes usar iniciales del display_name como avatar — sin fotos por ahora)

#### Tests bloque B

Mockear WebSocket es delicado. Usa una de estas dos vías:

1. **Mock global de `WebSocket`** en `tests/setup.ts`:
   ```typescript
   class MockWebSocket extends EventTarget {
     readyState = 0;
     send = vi.fn();
     close = vi.fn();
   }
   global.WebSocket = MockWebSocket as any;
   ```
   Tests instancian, llaman `dispatchEvent(new MessageEvent("message", { data: JSON.stringify({...}) }))` y verifican el estado.

2. **Mock de `partysocket`** con `vi.mock("partysocket")`. Más limpio si decides usar partysocket.

Tests mínimos:
- `useRoomPresence` añade miembro al recibir `user_joined`
- `useRoomPresence` quita miembro al recibir `user_left`
- Mensajes con tipo desconocido se ignoran sin romper

3 tests aquí.

**Cierra bloque B con commits:**
- `chore(web): instalar partysocket para WebSocket con auto-reconexión`
- `feat(web): hook useWebSocket genérico con autenticación por token`
- `feat(web): hook useRoomPresence sobre el WS del backend`
- `feat(web): RoomDetailPage muestra presencia en tiempo real`
- `test(web): cobertura de useRoomPresence con mock de WebSocket`

---

### Bloque C — LiveKit video grid

#### Decisión: usar `@livekit/components-react`

Ya está instalado `livekit-client` (vanilla). Para MVP añadimos también `@livekit/components-react` y `@livekit/components-styles` que nos da componentes prefabricados (VideoConference, ParticipantTile, ControlBar). Justificación: nos ahorra ~3 días de UI custom y los componentes son accesibles por defecto.

```bash
pnpm add @livekit/components-react @livekit/components-styles
```

Si en algún momento queremos UI 100% propia, podremos reescribir con `livekit-client` directo. Decisión reversible.

#### Servicio para token

`src/services/livekit.service.ts`:

```typescript
import { http } from "./http";

export type LiveKitTokenResponse = {
  token: string;
  url: string;
  room_name: string;
};

export const livekitService = {
  getJoinToken: async (roomId: string): Promise<LiveKitTokenResponse> => {
    const { data } = await http.post<LiveKitTokenResponse>(`/api/v1/rooms/${roomId}/livekit-token`);
    return data;
  },
};
```

#### Componente VideoGrid

`src/components/rooms/RoomVideoGrid.tsx`:

```tsx
import { useEffect, useState } from "react";
import { LiveKitRoom, VideoConference, ControlBar, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { livekitService } from "../../services/livekit.service";

export function RoomVideoGrid({ roomId }: { roomId: string }) {
  const [conn, setConn] = useState<{ token: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    livekitService.getJoinToken(roomId)
      .then((res) => setConn({ token: res.token, url: res.url }))
      .catch((e) => setError(e.message ?? "Error obteniendo token"));
  }, [roomId]);

  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!conn) return <div className="p-4 text-gray-500">Conectando vídeo…</div>;

  return (
    <LiveKitRoom
      token={conn.token}
      serverUrl={conn.url}
      connect
      video
      audio
      data-lk-theme="default"
      style={{ height: "60vh" }}
    >
      <VideoConference />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
```

Nota: el shape de `serverUrl` en `LiveKitRoom` puede esperar `wss://...`. Verifica que el backend devuelve eso.

#### Integración en `RoomDetailPage`

Layout sugerido (sin diseño bonito, eso es Prompt 8):

```
┌────────────────────────────────┐
│ Nombre del room — Asignatura   │  título y meta
├──────────────────┬─────────────┤
│                  │             │
│   VideoGrid      │  Members    │  cuerpo: 3/4 video, 1/4 lista
│                  │  (presencia)│
│                  │             │
├──────────────────┴─────────────┤
│ Botón "Salir del room"         │  footer
└────────────────────────────────┘
```

Tailwind CSS Grid o Flexbox. Sin shadcn ni librerías de layout — clases nativas de Tailwind.

#### Tests bloque C

LiveKit es difícil de testear en jsdom (intenta abrir conexiones de red reales). Vías:

- Mock `@livekit/components-react` en tests:
  ```typescript
  vi.mock("@livekit/components-react", () => ({
    LiveKitRoom: ({ children }: any) => <div data-testid="lk-room">{children}</div>,
    VideoConference: () => <div>video</div>,
    RoomAudioRenderer: () => null,
    ControlBar: () => <div>controls</div>,
  }));
  ```
- Test de `RoomVideoGrid`: pide token al montar, muestra "Conectando vídeo..." hasta resolver, después renderiza el LiveKitRoom mockeado. Si pide token y falla, muestra error.

Para verificación E2E real con vídeo, usa el `browser_subagent` en dos perfiles distintos (dos pestañas, dos usuarios) y verifica que se ven mutuamente. Si tu navegador headless no permite cámara real, mockéalo a un canvas con `getUserMedia` falso o sáltatelo y documenta.

2 tests unitarios + 1 E2E manual.

**Cierra bloque C con commits:**
- `chore(web): instalar @livekit/components-react para video grid prefabricado`
- `feat(web): servicio para pedir token de LiveKit al backend`
- `feat(web): RoomVideoGrid con LiveKit components react`
- `feat(web): RoomDetailPage integra video grid junto a presence list`
- `test(web): cobertura de RoomVideoGrid con LiveKit mockeado`

---

## Variables de entorno

Verificar que `web/.env` y `web/.env.example` tienen:

```
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_BASE_URL=ws://localhost:8000
```

`VITE_WS_BASE_URL` es nuevo en este prompt. Asegúrate de añadirlo al `.env.example`.

## Reglas duras

- **No metas la lógica de WebSocket en el componente.** Todo va al hook. Componentes solo consumen `useRoomPresence(roomId)` y renderizan.
- **No instancies `LiveKitRoom` en `RoomDetailPage` directamente.** Va a través de `RoomVideoGrid` para encapsular el lifecycle del token.
- **El servicio de LiveKit nunca expone el token al componente.** El componente recibe el `token` como prop, sí, pero el `getJoinToken` se llama desde el `useEffect` del wrapper, no desde el RoomDetailPage.
- **Cero `any`.** Si los types generados no cubren un evento WS o un shape de LiveKit, define el type manual en `src/types/ws.ts` o similar.
- **No uses `console.log` en producción** — `console.error` para errores sí, pero limpia los `console.log` de debug antes de commit.
- **`partysocket` o WebSocket nativo, NO ambos.** Decide y mantén la consistencia.

## Orden de commits global del Prompt 7

Es mucho. Para que el git log sea legible, mantén commits atómicos y prefijados con `feat(web)`, `chore(web)`, `test(web)`. Aproximadamente 14-16 commits totales:

- 1 puente (limpieza + types)
- 5 del bloque A
- 5 del bloque B
- 5 del bloque C

## Gates antes de reportar

- `pnpm typecheck` → 0 errores
- `pnpm lint` → 0 errores
- `pnpm test` → todos verdes (bases del Prompt 6 + ~10 nuevos)
- `pnpm build` → exitoso
- **E2E manual con browser_subagent** (igual que Prompt 6):
  - Crear room "Cálculo II", verificar que apareces en la lista
  - Entrar al room, verificar el badge "Conectado"
  - Abrir una segunda pestaña con otro usuario, verificar que ambos se ven en la lista de presencia
  - Verificar que el video grid de LiveKit conecta y muestra al menos al usuario local
  - Salir del room → vuelve a `/rooms`

Si el navegador headless no permite cámara, está bien que LiveKit conecte sin video — solo verifica que NO hay errores en la consola.

## Reporte final

1. Salida de `pnpm typecheck && pnpm lint && pnpm test`
2. `git log --oneline -20`
3. Resumen del E2E con browser_subagent (incluye GIF/screenshot/descripción)
4. Bugs descubiertos en backend al integrar (apunta y resuelve si trivial; escala si grande)
5. Pendientes para Prompt 8 (Pomodoro UI, Notes UI, refresh token automático, polish)
6. Decisión de qué librería WS terminaste usando (partysocket vs nativo) y por qué
7. Cualquier sorpresa con LiveKit components-react que merezca documentarse

## Trampas conocidas

- **CORS para WebSocket:** el backend FastAPI puede no haber configurado CORS para WS específicamente. Si encuentras error de "WebSocket connection failed" con motivo CORS, revisa el middleware CORS del backend — es probable que `allow_origins` esté correcto pero falten otras cabeceras para WS upgrade. Reporta y lo arreglamos.
- **`http://` vs `ws://` en URLs:** asegúrate de que `VITE_WS_BASE_URL` empieza con `ws://` (dev) o `wss://` (prod). Si pegas `http://`, partysocket fallará silenciosamente.
- **LiveKit URL en local:** LiveKit Cloud da una URL pública `wss://<project>.livekit.cloud`. Funciona desde dev sin más. Si más adelante self-hosteas, deberás coordinar TURN servers.
- **Memoria con dos LiveKit rooms abiertos:** si tu E2E abre dos pestañas con el mismo usuario, LiveKit kickea una. Usa dos cuentas distintas (`user1@test.com`, `user2@test.com`).

## No avances al Prompt 8 sin confirmación

El Prompt 8 será el cierre del MVP: Pomodoro UI sincronizado + Notes UI + polish + refresh token automático. Para y reporta cuando termines este.
