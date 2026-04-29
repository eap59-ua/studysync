# Prompt 6 — Frontend web: setup + auth

> **Precondición:** Backend MVP completo (Prompts 0-5). 67 tests verdes, todos los endpoints REST + WS + Pomodoro Redis + LiveKit tokens + Notes con storage abstraction. Último commit `5b2c498`.
>
> **El trabajo de este prompt vive en `web/`, NO en `backend/`.** El backend solo lo usaremos como API consumida.

## Por qué este prompt es solo setup + auth

Frontend con WebSocket en tiempo real + LiveKit video + Pomodoro UI + Notes upload todo en un prompt sería una pesadilla de ~80 archivos y mil bugs. Lo cortamos en tres:

- **Prompt 6 (este):** scaffolding limpio del web, generación de types desde OpenAPI, auth (login/register), routing protegido, y un dashboard vacío al que aterrizas tras hacer login.
- **Prompt 7:** rooms (lista, crear, detalle) + WebSocket client + presencia + LiveKit video grid en el room.
- **Prompt 8:** Pomodoro UI sincronizado + Notes (upload, listado, reseñas) + polish de la app.

## Objetivo del slice

Al terminar este prompt:

1. El scaffold default de Vite está limpio (sin contadores ni logos de ejemplo)
2. Los tipos del backend se generan automáticamente desde `openapi.json` y viven en `src/types/api.ts` (gitignoreado)
3. Hay un cliente HTTP axios configurado con interceptor de JWT
4. Hay un `AuthContext` + `useAuth()` hook que persiste sesión en `localStorage`
5. Existen páginas `/login`, `/register`, `/dashboard` y un componente `ProtectedRoute`
6. La navegación funciona: si no autenticado y vas a `/dashboard` → redirige a `/login`. Tras login exitoso → redirige a `/dashboard`.
7. Tests pasan: el setup de Vitest funciona, hay al menos 5 tests cubriendo `AuthContext` y un par de páginas

**Fuera de scope:**
- Diseño bonito (será polish de Prompt 8). Por ahora Tailwind básico, formularios funcionales, sin atención a estética.
- Refresh token automático en background (usaremos refresh manual; auto-refresh va en Prompt 8 si hace falta)
- Internacionalización
- Modo oscuro
- Accesibilidad detallada (vendrá con polish)

## Diseño técnico — léelo antes de codificar

### Estructura de carpetas dentro de `web/`

```
web/
├── src/
│   ├── components/                    # UI atómica reutilizable
│   │   ├── ProtectedRoute.tsx
│   │   └── ui/                        # buttons, inputs (shadcn-style propio, sin la lib)
│   │       ├── Button.tsx
│   │       └── Input.tsx
│   ├── pages/                         # vistas que componen, una por ruta
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── DashboardPage.tsx
│   │   └── NotFoundPage.tsx
│   ├── services/                      # clientes API tipados (uno por dominio)
│   │   ├── http.ts                    # instancia axios con interceptors
│   │   └── auth.service.ts            # register, login, me, refresh
│   ├── hooks/
│   │   └── useAuth.ts                 # hook que consume AuthContext
│   ├── context/
│   │   └── AuthContext.tsx            # provider + reducer
│   ├── types/
│   │   ├── api.ts                     # GENERADO automáticamente, NO editar
│   │   └── auth.ts                    # tipos manuales si hace falta
│   ├── router/
│   │   └── routes.tsx                 # config react-router
│   ├── lib/
│   │   └── storage.ts                 # wrapper sobre localStorage tipado
│   ├── App.tsx                        # punto de entrada con providers + router
│   ├── main.tsx                       # bootstrap React
│   └── index.css                      # tailwind directives + globals
├── tests/
│   ├── context/
│   │   └── AuthContext.test.tsx
│   └── pages/
│       ├── LoginPage.test.tsx
│       └── ProtectedRoute.test.tsx
├── vitest.config.ts                   ← NUEVO
└── package.json                       ← AÑADIR scripts y deps
```

### Generación de tipos desde OpenAPI

FastAPI expone `http://localhost:8000/openapi.json`. Usamos `openapi-typescript` para generar TypeScript types automáticamente.

Script en `package.json`:
```json
"gen:api-types": "openapi-typescript http://localhost:8000/openapi.json -o src/types/api.ts"
```

`src/types/api.ts` se añade a `.gitignore` (es generado). El usuario lo regenera tras cambios del backend con `pnpm gen:api-types`.

Para este prompt, **el primer paso será arrancar el backend en local y generar los types**. Los tests tipados dependen de esto. Si no consigues conexión al backend, falla rápido y avisa — no inventes los types.

### Cliente HTTP

`src/services/http.ts`:

```typescript
import axios, { type AxiosInstance } from "axios";
import { authStorage } from "../lib/storage";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const http: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 10_000,
});

http.interceptors.request.use((config) => {
  const token = authStorage.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authStorage.clear();
      window.dispatchEvent(new CustomEvent("auth:unauthenticated"));
    }
    return Promise.reject(error);
  },
);
```

`AuthContext` escucha el event `auth:unauthenticated` y limpia su estado, forzando redirect a `/login`.

### Estado de auth

```typescript
type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; user: User; accessToken: string }
  | { status: "unauthenticated" };
```

Tres estados explícitos (no `user: User | null` que hace ambiguo "todavía no he comprobado" vs "no hay sesión"). Esto evita flashes de la página de login al cargar.

`AuthProvider`:
1. Al montar, lee `accessToken` y `user` de `localStorage`. Si existen, hace `GET /api/v1/auth/me` para validar que el token sigue siendo bueno.
2. Si validación falla, limpia y queda `unauthenticated`.
3. Si validación pasa, queda `authenticated`.
4. Mientras: `loading`.

### Persistencia

`src/lib/storage.ts` wrapper tipado:

```typescript
const ACCESS_TOKEN_KEY = "studysync.accessToken";
const REFRESH_TOKEN_KEY = "studysync.refreshToken";
const USER_KEY = "studysync.user";

export const authStorage = {
  getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  getUser: () => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  set: (params: { accessToken: string; refreshToken: string; user: User }) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, params.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, params.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(params.user));
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};
```

Nota seguridad: `localStorage` es vulnerable a XSS. Para MVP es aceptable porque: (a) no manejamos datos financieros; (b) el alternativo "cookie httpOnly" requiere CORS coordinado con el backend que aún no está configurado para eso. Apuntar al BACKLOG: "Migrar de localStorage a cookies HttpOnly + Secure + SameSite=Strict para producción".

### Forms

Para login/register usamos `react-hook-form` + `zod` + `@hookform/resolvers`.

Schemas en `src/services/auth.schemas.ts`:

```typescript
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Contraseña requerida"),
});

export const registerSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  display_name: z.string().min(1).max(100),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
```

### Routing

`src/router/routes.tsx` con `createBrowserRouter`:

```
/                  → redirect a /dashboard (si auth) o /login
/login             → LoginPage
/register          → RegisterPage
/dashboard         → ProtectedRoute → DashboardPage
*                  → NotFoundPage
```

`ProtectedRoute`:
- Si `auth.status === "loading"` → renderiza `<LoadingSpinner />` (un div simple con "Cargando..." vale)
- Si `unauthenticated` → `<Navigate to="/login" replace state={{ from: location }} />`
- Si `authenticated` → renderiza children/Outlet

Tras login exitoso, `LoginPage` lee `state.from` y redirige ahí (o a `/dashboard` por defecto).

### DashboardPage

Para este prompt es un placeholder mínimo:

```tsx
export function DashboardPage() {
  const { user, logout } = useAuth();
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">¡Hola, {user.display_name}!</h1>
      <p className="text-gray-600 mb-8">Pronto verás tus rooms aquí.</p>
      <Button onClick={logout}>Cerrar sesión</Button>
    </div>
  );
}
```

Nada más. La UI de rooms viene en Prompt 7.

## Dependencias a instalar

```bash
pnpm add react-hook-form @hookform/resolvers zod
pnpm add -D vitest @vitest/ui jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @vitest/coverage-v8 openapi-typescript
```

## Configuración Vitest

`vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

`tests/setup.ts`:

```typescript
import "@testing-library/jest-dom";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());
```

Añadir alias `@` también a `tsconfig.app.json` y `vite.config.ts` para que producción y tests vayan en sincronía.

Scripts en `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"typecheck": "tsc -b --noEmit",
"gen:api-types": "openapi-typescript http://localhost:8000/openapi.json -o src/types/api.ts"
```

## Tests mínimos (5+)

1. `tests/context/AuthContext.test.tsx`
   - `test_initial_state_is_loading`
   - `test_loads_user_from_storage_and_validates_token` (mockea axios; verifica que tras `useEffect` queda `authenticated`)
   - `test_logout_clears_storage_and_state`

2. `tests/pages/LoginPage.test.tsx`
   - `test_shows_validation_errors_for_invalid_email`
   - `test_calls_auth_service_on_submit_and_redirects` (mockea axios)

3. `tests/pages/ProtectedRoute.test.tsx`
   - `test_redirects_to_login_when_unauthenticated`
   - `test_renders_children_when_authenticated`

Total: 7 tests. Si te queda fácil, añade test de RegisterPage.

## Variables de entorno frontend

Crear `web/.env.example`:

```
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_BASE_URL=ws://localhost:8000
```

`web/.env` con valores reales (en `.gitignore`).

## Reglas duras

- **Nunca importes desde `backend/` directamente.** El frontend solo conoce el backend a través del `openapi.json` generado.
- **Nunca llames a `axios` directamente desde un componente.** Siempre vía `services/*.service.ts`. Esto te da un único lugar donde mockear para tests.
- **Nunca pongas lógica de auth en el componente.** Todo va al `AuthContext`. Los componentes hacen `useAuth()` y consumen.
- **Nunca uses `any`.** Si los types generados no cubren un caso, añade un type manual en `src/types/auth.ts` y documenta por qué.
- **Tailwind classes solamente, sin `<style>` ni CSS modules.** Mantenemos la coherencia con el scaffold y simplificamos el bundle.
- **`src/types/api.ts` es generado.** No lo edites. Si quieres extender, crea otro archivo y haz `import type { components } from './api'; export type User = components['schemas']['UserResponse'];` o similar.

## Orden de commits sugerido

1. `chore(web): instalar deps de auth, vitest y openapi-typescript`
2. `chore(web): limpiar scaffold default de Vite`
3. `feat(web): cliente HTTP axios con interceptor JWT y storage tipado`
4. `feat(web): generación de tipos desde OpenAPI del backend`
5. `feat(web): AuthContext con estados loading/auth/unauth y validación inicial`
6. `feat(web): páginas Login y Register con react-hook-form + zod`
7. `feat(web): ProtectedRoute y router con redirección por estado de auth`
8. `feat(web): DashboardPage placeholder con logout funcional`
9. `test(web): cobertura de AuthContext, LoginPage y ProtectedRoute`

Nueve commits. El primero combina varias deps porque van juntas conceptualmente.

## Gates antes de reportar

- `pnpm typecheck` (en `web/`) → 0 errores
- `pnpm lint` → 0 errores
- `pnpm test` → todos verdes (al menos 7)
- `pnpm build` → build exitoso (sin warnings de chunk size por ahora — eso es polish)
- Manualmente: con backend corriendo, `pnpm dev` arranca, vas a `/register`, te creas un usuario, te redirige a `/dashboard`, ves tu nombre, haces logout, vuelves a `/login`. **Verifica este flujo manual y pega un GIF / screenshot / descripción en el reporte.**

## Reporte final

1. Salida de `pnpm typecheck && pnpm lint && pnpm test` (todo verde)
2. `git log --oneline -15` (commits del Prompt 6 + los del backend)
3. Confirmación de que el flujo manual register → dashboard → logout funciona con el backend real corriendo
4. Cualquier bug del backend que descubras al integrar (es probable que aparezca alguno — apunta y resuelve si es trivial, escala si es grande)
5. Lista de pendientes que has dejado para Prompt 7 (rooms UI y LiveKit) o Prompt 8 (pomodoro UI, notes UI, polish)

## Trampas conocidas que el prompt evita

- **Vite + Tailwind 4:** la versión 4 cambió la forma de configurar respecto a la 3. El scaffold ya tiene `@tailwindcss/vite`, no necesitas `tailwind.config.ts` ni `postcss.config.js` para Tailwind 4 si usas el plugin oficial. Documentación: https://tailwindcss.com/docs/installation/using-vite.
- **TypeScript 6 (versión muy reciente):** algunas libs pueden tener tipos no actualizados. Si encuentras `Module not found in types`, prueba downgrade a TypeScript 5.x. Reporta antes de downgrade.
- **CORS:** el backend FastAPI ya tiene CORS configurado (lo añadiste en el Prompt 0). Si te aparece error CORS en el navegador, verifica que `CORS_ORIGINS` en el backend incluye `http://localhost:5173` (Vite default) o lo que sea tu puerto.
- **Tests con `MemoryRouter` o `BrowserRouter`:** para tests de páginas envueltos en Routes, usa `<MemoryRouter initialEntries={["/login"]}>...</MemoryRouter>`. Para tests del `ProtectedRoute`, monta `<MemoryRouter><Routes>...</Routes></MemoryRouter>`.

## No avances al Prompt 7 sin confirmación

Para y reporta cuando termines. El Prompt 7 (rooms + WebSocket + LiveKit video) lo escribiré tras tu reporte.
