# Prompt 9 — Despliegue a producción

> **Precondición:** Prompt 8 cerrado. Verificado el 02/08/2026 en clon limpio: backend 74 tests +
> `ruff check`/`format` limpios, web 111 tests + lint + typecheck + build limpios.
>
> **Por qué esta fase va antes del rediseño:** hoy StudySync no está ni subido a GitHub. Nadie
> puede verlo. Una URL que se abre y funciona, aunque sea fea, vale más en un portfolio que una
> app bonita en `localhost`. Y cuando llegue el rediseño (Prompt 10), tendrás un sitio donde ver
> los cambios en real en vez de solo en capturas.

---

## Objetivo

Una URL pública que un reclutador pueda abrir desde tu CV, entrar **sin registrarse**, y ver el
Pomodoro sincronizado funcionando en menos de un minuto.

Ese último punto es el que decide si esta fase sirve para algo. Si el enlace lleva a una pantalla
de login, el 90 % cierra la pestaña.

---

## Decisión de infraestructura

Precios y límites consultados el 2 de agosto de 2026. **Verifícalos antes de registrarte**, que
cambian cada pocos meses.

| Pieza | Servicio | Plan | Límite relevante |
|---|---|---|---|
| Frontend (SPA) | Vercel o Cloudflare Pages | Free | Sobra de largo para un build de Vite |
| Backend (FastAPI) | Render | Free o Starter | Free: 512 MB, 750 h/mes, **duerme a los 15 min** |
| PostgreSQL | **Neon** | Free | 0,5 GB, scale-to-zero, **no caduca** |
| Redis | **Upstash** | Free | 256 MB, 500 K comandos/mes |
| Vídeo | **LiveKit Cloud** | Build ($0) | 5.000 min WebRTC/mes, 100 conexiones simultáneas |

### Tres decisiones que conviene entender, no solo copiar

**No uses el PostgreSQL gratuito de Render.** Caduca a los 30 días de crearlo, con 14 días de
gracia antes de que borren los datos. Para un portfolio que quieres tener vivo un año, eso es una
bomba de relojería. Neon no caduca y se duerme sola cuando nadie la usa.

**Tampoco Supabase para esto.** Su free tier pausa el proyecto entero tras una semana sin
actividad y hay que despausarlo a mano desde el panel. Un proyecto de portfolio pasa semanas sin
visitas por definición: te arriesgas a que el reclutador entre justo el día que está pausado.
Neon con scale-to-zero despierta sola.

**LiveKit Cloud, no el `livekit-server` del compose.** El servidor local del Bloque 0 del Prompt 8
está bien para desarrollo, pero un SFU en producción necesita UDP, IP pública y ancho de banda.
El free tier de Cloud cubre de sobra una demo. Ojo: los límites son **tope duro**, no facturación
por exceso — al llegar a 5.000 minutos el servicio deja de responder hasta el ciclo siguiente.

### El problema del arranque en frío — decídelo tú

El plan gratuito de Render **duerme el servicio a los 15 minutos sin tráfico**. El primer visitante
del día espera entre 30 y 60 segundos mirando una pantalla en blanco.

Y hay un efecto secundario específico de esta app que no es obvio: **al dormirse mueren las tareas
asyncio que rotan las fases del Pomodoro**. Está documentado en `BACKLOG.md` como limitación
conocida desde el Prompt 3 — el estado sobrevive en Redis, pero el temporizador se queda
congelado hasta que alguien vuelva a darle a Iniciar. En local casi nunca pasa. En Render free
pasa todos los días.

Tres salidas, de menos a más trabajo:

1. **Render Starter, unos 7 $/mes.** No duerme. Es la solución de una línea.
2. **Implementar la recuperación desde Redis** que ya está descrita en `BACKLOG.md`: al arrancar,
   escanear las claves `pomodoro:*` y reprogramar las rotaciones calculando el retardo restante
   desde `started_at + duration - now`. Gratis, y además arregla deuda real que quedaría bien
   explicada en una entrevista.
3. **Aceptarlo** y poner un aviso honesto en la landing: "el backend puede tardar un minuto en
   despertar". Menos profesional, pero cero coste y cero trabajo.

**Mi recomendación es la 2 y, si el dinero no es problema, la 2 + la 1.** La opción 2 convierte
un problema de infraestructura en una historia que contar: "detecté que el free tier mataba las
tareas en memoria y añadí recuperación de estado desde Redis al arrancar". Eso es exactamente lo
que un entrevistador quiere oír.

---

## Bloque 0 — Subir el repositorio

Hay **33 commits sin subir**. Antes de nada:

```bash
git push origin main
```

Después, en GitHub:

- Comprueba que los tres workflows pasan en remoto. Es la primera vez que se ejecutan desde que
  arreglamos el lint y las dependencias: si algo falla, será de entorno, no de código.
- Repasa que no se ha colado ningún secreto: `git log -p -- backend/.env` debe salir vacío.
- Pon descripción, temas y enlace en el repo. Es lo primero que se ve.

---

## Bloque 1 — Preparar la app para producción

Nada de esto se puede hacer después; si lo dejas para el final, desplegarás tres veces.

**Configuración por entorno.** Repasa `backend/app/config.py`: todo lo que hoy tenga un valor por
defecto de desarrollo (`localhost`, `devkey`, `secret`) debe venir de variables de entorno y
**fallar al arrancar si falta en producción**. Un `JWT_SECRET` con valor por defecto en producción
es una vulnerabilidad, no un descuido.

**CORS.** Hoy seguramente esté abierto o apuntando a `localhost:5173`. En producción, lista
explícita con el dominio del frontend. Sin comodín.

**Healthcheck.** `GET /health` que devuelva 200 sin tocar base de datos. Render lo usa para saber
si el servicio está vivo, y te sirve para el ping de despertar.

**Migraciones.** Alembic tiene que ejecutarse en cada despliegue, antes de arrancar el servidor.
En Render es el *pre-deploy command*: `alembic upgrade head`. Verifica antes que las migraciones
corren de cero contra una base vacía — es habitual que un proyecto lleve meses funcionando sobre
una base creada con `create_all()` y las migraciones estén rotas sin que nadie lo sepa.

**Dockerfile del backend.** Ya existe uno en `backend/Dockerfile`. Revísalo para producción:
multi-stage, sin dependencias de desarrollo, usuario no root, y `uvicorn` sin `--reload`.

**Variables del frontend.** `VITE_API_BASE_URL` y `VITE_WS_BASE_URL` se compilan dentro del bundle.
En producción: `https://` y `wss://`, nunca `http`/`ws`. Un `ws://` contra una página servida por
HTTPS lo bloquea el navegador sin dar un error claro.

Commit: `feat(backend): configuración por entorno y healthcheck para producción`

---

## Bloque 2 — Aprovisionar los servicios gestionados

En este orden, porque cada uno da credenciales que necesita el siguiente:

1. **Neon** → proyecto nuevo → copia la connection string. Ojo: SQLAlchemy async necesita
   `postgresql+asyncpg://`, y Neon te la da como `postgresql://`. Hay que reescribir el esquema.
   Neon exige TLS; comprueba que `asyncpg` se conecta con `ssl=require`.
2. **Upstash** → base Redis → usa la URL `rediss://` (con dos eses, es TLS). `redis-py` la
   soporta, pero si tu `redis_client.py` construye la URL a mano, revísalo.
3. **LiveKit Cloud** → proyecto → apunta `LIVEKIT_URL` (`wss://<proyecto>.livekit.cloud`),
   `LIVEKIT_API_KEY` y `LIVEKIT_API_SECRET`.

**Verifica cada uno por separado antes de desplegar nada.** Un script que se conecte a los tres y
haga una operación trivial te ahorra horas de depurar a ciegas contra los logs de Render.

Commit: `docs: documentar variables de entorno de producción` — y actualiza `.env.example`.

---

## Bloque 3 — Desplegar

**Backend en Render.** Servicio web desde el Dockerfile, región Frankfurt (la más cercana a
España; con la de Oregón añades 150 ms a cada petición). Variables de entorno de los tres
servicios del bloque anterior. Pre-deploy: `alembic upgrade head`.

**Frontend en Vercel.** Root directory `web`, build `npm run build`, output `dist`. Las variables
`VITE_*` se definen en el panel, no en `.env`.

**Reescritura de SPA obligatoria.** React Router usa rutas del lado del cliente: si alguien entra
directo a `/rooms/abc` o recarga la página, el servidor busca un fichero que no existe y devuelve
404. Necesitas un `vercel.json` que reescriba todo a `/index.html`. Este fallo aparece siempre,
siempre después de desplegar, y siempre pilla por sorpresa.

**CD.** Ambas plataformas despliegan solas en cada push a `main`. Configúralo para que solo
despliegue si el CI está verde.

Cuando esté arriba, prueba **el WebSocket** explícitamente. Es lo que más se rompe al pasar a
producción: proxies que cortan conexiones inactivas, `wss://` mal configurado, o el token en la
query string filtrándose a los logs de acceso (anótalo en `BACKLOG.md` si no vas a moverlo al
subprotocolo ahora).

Commit: `ci: despliegue automático de backend y frontend`

---

## Bloque 4 — Modo demo

**Este es el bloque que hace que la fase valga la pena.** Todo lo anterior es fontanería.

Hoy la app exige registrarse para ver absolutamente nada. Un reclutador con veinte CVs encima no
va a crear una cuenta.

Lo que hace falta:

- **Botón "Entrar como invitado"** en el login, bien visible, que loguee con una cuenta
  `demo@studysync.app` de credenciales conocidas
- **Datos sembrados**: una sala pública con nombre creíble, tres o cuatro apuntes con reseñas de
  varios autores, y algún pomodoro completado en el contador. Una app vacía parece rota aunque
  funcione perfectamente
- **Un script de reseteo** que devuelva la demo a su estado inicial, para poder ejecutarlo cuando
  alguien deje basura
- **Que la sala de demo aguante a dos personas a la vez** sin que se pisen

Piensa en qué ve alguien que entra 45 segundos: tiene que toparse con el Pomodoro sincronizado
—lo diferencial— sin buscarlo.

Commit: `feat(backend): cuenta de demostración y datos de ejemplo`

---

## Bloque 5 — Cierre

**README.** Es la portada del proyecto. Lo que importa, por orden: enlace a la demo arriba del
todo, un GIF de 10-15 segundos del Pomodoro sincronizándose entre dos ventanas, y una explicación
corta de por qué el diseño es server-authoritative. Los badges de CI van después, no antes.

**El GIF importa más que el enlace.** Se ve sin salir de GitHub y sin esperar arranques en frío.

**Portfolio y LinkedIn.** Actualiza con la URL y una descripción centrada en las decisiones
técnicas, no en la lista de tecnologías.

**Informe.** `docs/reports/09-deploy-report.md` con el mismo formato de siempre: qué se desplegó,
dónde, qué costó, qué se rompió al pasar a producción y qué limitaciones quedan vivas.

---

## Definición de terminado

- La URL abre y se puede usar sin registrarse
- Dos ventanas en la misma sala ven el mismo segundo del Pomodoro
- Se puede subir un apunte y valorarlo
- Recargar en `/rooms/:id` no da 404
- El CI pasa en GitHub y un push a `main` despliega solo
- Coste mensual conocido y anotado en el README
- Ningún secreto en el repositorio

---

## Sobre el Prompt 10 (rediseño)

Dirección elegida: **académico con carácter** — claro pero con color, ilustraciones simples en los
estados vacíos, gamificación visible.

Cuando cerremos el despliegue lo escribo, pero adelanto el orden, que no es el que suele
recomendarse:

1. **App shell y navegación.** Hoy no existe: cada pantalla es contenido flotando sobre blanco y
   no se puede ir de `/rooms` a `/notes` sin escribir la URL. Es el problema más grave y no es
   estético.
2. **Densidad y layout.** La página de apuntes usa el 45 % superior y deja el resto vacío.
3. **Sistema de componentes.** Los tokens salen solos una vez sabes qué formas necesitas.
4. **Micro-interacciones y estados vacíos**, que es donde entra el carácter.

Empezar por los tokens de color, como se suele aconsejar, es pulir los muebles de una casa sin
paredes.

**Buena noticia medida:** los 111 tests del frontend no usan ni un `toHaveClass` ni un
`querySelector` — todo es `getByRole` y `getByText`. Puedes rehacer el marcado entero sin romper
un solo test. Eso convierte el rediseño en una fase mucho menos arriesgada de lo normal.
