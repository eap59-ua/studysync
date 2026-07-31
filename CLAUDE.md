# StudySync

Plataforma colaborativa de estudio en tiempo real. El feature diferencial es el **Pomodoro
sincronizado server-authoritative**: el estado vive en Redis y todos los miembros de una sala ven
el mismo segundo. Alrededor hay salas con vídeo (LiveKit), presencia por WebSocket e intercambio
de apuntes con reseñas.

Proyecto personal de portfolio. Autor: Erardo Aldana Pessoa.

---

## Comandos

Todos verificados el 31/07/2026 en un clon limpio.

```bash
# Infraestructura (los puertos locales se sobrescriben en docker-compose.override.yml)
# Postgres + Redis + LiveKit. NO uses `docker compose up -d` a secas si vas a levantar
# el backend con uvicorn: el servicio `backend` publica también el :8000 y chocan.
docker compose up -d postgres redis livekit

# Backend
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload          # :8000, docs en /docs
pytest tests/ -q                       # 74 tests
ruff check app/ tests/                 # tiene que salir "All checks passed!"
ruff format app/ tests/

# Frontend  — es npm, NO pnpm (hay package-lock.json)
cd web
npm ci
npm run dev                            # :5173
npm run test                           # 24 tests (vitest)
npm run lint                           # eslint
npm run typecheck                      # tsc -b --noEmit
npm run build
npm run gen:api-types                  # requiere el backend levantado

# E2E manual (requiere stack levantada + credenciales LiveKit)
python scripts/e2e/seed_two_users.py
python scripts/e2e/browser_two_users.py
```

---

## Arquitectura

Hexagonal estricta en el backend. La regla de dependencia no se negocia:

```
domain/         Entidades y lógica pura. NO importa nada externo:
                ni FastAPI, ni SQLAlchemy, ni Redis, ni pydantic.
application/    Casos de uso. Depende de domain y de puertos (protocolos), nunca
                de implementaciones concretas.
infrastructure/ Adapters: repositorios SQLAlchemy, cliente Redis, storage en disco.
presentation/   Routers FastAPI y endpoints WebSocket. Solo orquesta.
```

Si un import de `infrastructure` aparece en `domain` o en `application`, está mal, aunque funcione.

**Stack:** FastAPI · SQLAlchemy 2.0 async · PostgreSQL · Redis · LiveKit · Alembic ·
Vite + React 19 + TypeScript + Tailwind 4 · `mobile/` existe pero está sin arrancar.

---

## Reglas duras

- **TDD en `domain` y `application`.** Test primero. Cobertura ≥ 80 %.
- **RED y GREEN en el mismo commit.** Nunca un commit con el test rojo y otro con el fix. La
  unidad de commit es lógica, no la fase del ciclo.
- **Commits atómicos en español**, Conventional Commits. Cuerpo explicando el *porqué*, no el qué.
- **Nombres de clases y funciones en inglés**; comentarios, docstrings largos y commits en español.
- **Reloj inyectado.** Nada de `datetime.now()` desperdigado: se pasa como dependencia para poder
  testear el paso del tiempo. Ver `PomodoroService(clock_fn=...)`.
- **El Pomodoro es server-authoritative.** El estado vive en Redis y solo ahí. El cliente renderiza
  y hace la cuenta atrás visual; no calcula fases ni decide transiciones. Nunca dupliques el estado
  en memoria del backend.
- **Zero-retention** para contenido sensible: emails y tokens OAuth no se persisten.

---

## Estado actual (31 julio 2026)

Prompts 0-7 completados. El detalle de cada fase está en `docs/plan/`.

| Fase | Alcance |
|---|---|
| 0-5 | Backend completo: auth JWT, rooms + WS, Pomodoro, LiveKit, notas con reseñas |
| 6-7 | Frontend: auth, rooms UI, presencia por WebSocket, grid de vídeo |

**Siguiente:** `docs/plan/08-pomodoro-notes-ui.md` — Pomodoro UI, Notes UI, refresh token, polish.
Empieza por el bloque 0, que es un bloqueo real.

Lecturas obligatorias antes de tocar nada:

- `docs/plan/08-pomodoro-notes-ui.md` — el trabajo en curso
- `BACKLOG.md` — deuda técnica conocida y limitaciones asumidas
- `docs/reports/07-e2e-report.md` — qué falla hoy y por qué
- `docs/adr/001-architecture.md` — por qué el stack es este

---

## Trampas conocidas

Cosas que ya han costado tiempo. No las redescubras.

**El router de WebSockets se monta sin prefijo.** En `main.py`, los cinco routers REST llevan
`prefix="/api/v1"` pero `rooms_ws_router` no. La URL correcta es `ws://host/ws/rooms/{id}`,
sin `/api/v1`.

**La presencia se cuenta por usuario, no por socket.** Una persona puede tener varios WebSockets
abiertos: React StrictMode monta el efecto dos veces en desarrollo, y una reconexión solapa
brevemente con el socket que reemplaza. Usa `count_connected_users()` e `is_user_connected()`,
nunca `len(active_connections[room_id])`. Esto ya causó un bug de miembros duplicados.

**LiveKit en local es un servicio del compose, no LiveKit Cloud.** El ADR y el README
describen Cloud para el despliegue, pero en desarrollo y en el E2E se usa
`livekit/livekit-server` del `docker-compose.yml`, con `devkey`/`secret` en el `:7880`
para que case con `backend/.env`. Dos cosas que no se tocan: `NODE_IP=127.0.0.1` —sin él
el servidor anuncia la IP del contenedor como candidato ICE y Docker Desktop no la enruta
desde el host, así que conecta la señalización pero no hay vídeo— y `UDP_PORT=7882`, que
multiplexa WebRTC en un puerto en vez de publicar el rango 50000-60000, que en Docker
Desktop tarda minutos. Y la `LIVEKIT_URL` del backend viaja al navegador dentro de la
respuesta del token: tiene que ser alcanzable desde el host, nunca `http://livekit:7880`.

**El upload de notas necesita `Content-Type: undefined`.** La instancia de axios en
`services/http.ts` fija `application/json`. Para `multipart/form-data` hay que anularlo y dejar
que el navegador ponga el boundary, o el backend devuelve 422.

**`openapi-typescript` no es una dependencia.** Su peer `typescript@^5` choca con el `~6.0.2` del
proyecto y rompía `npm ci`. Se invoca con `npx` desde el script `gen:api-types`. No lo reinstales.

**El hashing de contraseñas es `pwdlib`, no `passlib`.** Argon2id para las nuevas y `BcryptHasher`
en la tupla para verificar las cuentas antiguas. Si quitas ese hasher, los usuarios registrados
antes de julio de 2026 no pueden entrar — hay un test que lo guarda.

**El lock de npm resuelve contra `registry.npmmirror.com`.** Está anotado en `BACKLOG.md`. Si
regeneras el lock entero, cambiarás las 388 URLs; para quitar un paquete usa
`npm uninstall <pkg> --package-lock-only`.

---

## Cómo trabajar aquí

- Verifica antes de afirmar. Si dices "los tests pasan", ejecútalos y enseña la salida.
- Pregunta cuando dudes en vez de suponer.
- Español por defecto; comandos, código y nombres técnicos en inglés.
- Sin preámbulos motivacionales. Pasos concretos y decisiones fundamentadas.
- Los bugs se documentan como son. El informe del Prompt 7 vale precisamente porque dice que el
  E2E no pasó limpio.
