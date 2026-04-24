# ADR-001: Arquitectura de StudySync

**Status:** Proposed
**Date:** 2026-04-24
**Deciders:** Erardo Aldana Pessoa

## Contexto

StudySync es el proyecto estrella que vamos a construir este verano (2026) como hito de portfolio. Es una plataforma de estudio colaborativo con los siguientes requisitos:

- **Rooms virtuales de estudio** donde N usuarios se ven/escuchan mientras estudian (estilo Discord/StudyStream)
- **Pomodoro grupal sincronizado** — todos los miembros del room arrancan y acaban el mismo temporizador
- **Intercambio de apuntes** con verificación (reputación simple, NO blockchain — eso es overkill)
- **IA de recomendaciones** de estudio básica: qué repasar según tu historial

**Constraints reales:**
- Desarrollador solo (tú), 1 verano (~12 semanas)
- Presupuesto tendente a 0€/mes (hosting gratis tipo Fly.io, Supabase free tier, Vercel free)
- Stack estrella del usuario: **Java/Android, Python, MySQL/PostgreSQL**
- Debe funcionar en Android y web
- Portfolio ambicioso pero **entregable** — mejor MVP sólido que súper-app rota

**Fuerzas en juego:**
- Maximizar reutilización de stack ya dominado (menos curva de aprendizaje)
- Arquitectura que se pueda mostrar en entrevistas (microservicios = demasiado, monolito modular = perfecto)
- Tiempo real para rooms → WebSockets (nativo) o WebRTC (peer-to-peer)
- Ganar puntos de "arquitectura" sin sobreingeniería

## Decisión

**Monolito modular con FastAPI como backend, PostgreSQL (+ Redis para estado efímero), cliente Android nativo (Kotlin + Jetpack Compose) y PWA en React/TS como segundo frontend.**

Rooms con WebSockets (broadcast server-authoritative). Video/audio con LiveKit Cloud (generoso en free tier, 50 horas/mes gratis). No WebRTC a pelo — complicado de debuggear y la feature diferencial de StudySync es la **sincronización de Pomodoro**, no ser mejor que Google Meet.

## Opciones consideradas

### Opción A: Monolito modular FastAPI + Kotlin/Android + PWA React/TS (ELEGIDA)

| Dimensión | Valoración |
|---|---|
| Complejidad | Media |
| Coste | ~0€/mes (Fly.io free + Supabase free + LiveKit free) |
| Escalabilidad | Suficiente para 1K usuarios concurrentes |
| Familiaridad del dev | Alta — Python + Kotlin + React ya dominados |
| Tiempo a MVP | 8 semanas |

**Pros:**
- Stack 100% conocido — cero tiempo de ramp-up
- FastAPI da Swagger gratis → proyecto "pro" visualmente
- Kotlin/Compose demuestra Android nativo moderno en el portfolio
- PWA React/TS cubre iOS sin Apple Developer Account
- LiveKit elimina el dolor de WebRTC a pelo
- Arquitectura hexagonal (como ya hiciste en `food-donation-backend`) da puntos en entrevistas

**Cons:**
- Dos clientes (Android + PWA) duplican esfuerzo de UI
- LiveKit es dependencia externa (vendor lock-in mitigable)

### Opción B: Flutter full-stack + FastAPI

| Dimensión | Valoración |
|---|---|
| Complejidad | Media-Alta |
| Coste | ~0€/mes |
| Escalabilidad | Igual que A |
| Familiaridad del dev | Media — dijo que NO es un especialista Flutter |
| Tiempo a MVP | 10 semanas (más curva) |

**Pros:** Un solo codebase para móvil + web.
**Cons:** Flutter no es tu estrella. Prefieres Kotlin nativo + React web. Descartado para no falsear el portfolio otra vez.

### Opción C: Microservicios (auth, rooms, notes, recomendaciones)

| Dimensión | Valoración |
|---|---|
| Complejidad | Alta |
| Coste | Alto (4 servicios = 4 deploys) |
| Escalabilidad | Excesiva para el caso |
| Familiaridad del dev | Media |
| Tiempo a MVP | 14+ semanas |

**Pros:** Suena "enterprise". **Cons:** Sobreingeniería clásica. Para 0 usuarios reales es un tiro al pie. Descartado.

## Análisis de trade-offs

El principal dilema es **Android nativo (Kotlin) vs Flutter**. Flutter ahorraría tiempo de UI, pero tu prompt inicial deja claro que quieres ser **honesto con el stack**. Si el portfolio dice "Kotlin + Android" y tienes StudySync Android en Kotlin, eso es consistente. Si pones Flutter y no lo dominas, repetimos el error del portfolio anterior.

Segundo dilema: **WebSockets vs WebRTC a pelo para video**. WebRTC es más "impresionante" técnicamente, pero LiveKit es lo que usan todas las startups reales (incluidas ClassDojo, ChatGPT Voice, etc.) y te permite enfocarte en lo que diferencia a StudySync: el Pomodoro sincronizado y los apuntes verificados, no en reimplementar ICE/STUN/TURN.

## Consecuencias

**Qué se hace más fácil:**
- Dev loop: docker-compose up → app corriendo en 30 segundos
- Testing: Pytest para backend, JUnit + Espresso para Android, Vitest + Playwright para PWA
- Deploy: Fly.io para backend, Google Play + GitHub Pages para clientes
- Demos a reclutadores: mostrar arquitectura hexagonal + Swagger auto-generado

**Qué se hace más difícil:**
- Mantener dos UIs (Android + PWA) sincronizadas — hay que mover iteraciones de UI a la vez
- Si crece más allá de 1K usuarios concurrentes, habría que romper el monolito (ok: "cuando tengamos ese problema, lo tendremos")

**A revisar si:**
- El coste de tener 2 UIs es alto → caerse a solo PWA en el MVP, Android en fase 2
- LiveKit free se queda corto → evaluar Jitsi self-hosted en Fly.io

## Action Items (backlog de las 12 semanas)

### Fase 1 — Semanas 1-2: Fundación
1. [ ] Scaffolding backend FastAPI con arquitectura hexagonal (reutilizar patrón de food-donation-backend)
2. [ ] Setup docker-compose con Postgres + Redis
3. [ ] Auth JWT (registro, login, perfil)
4. [ ] CI/CD con GitHub Actions (tests + lint)
5. [ ] Scaffolding Android (Kotlin + Compose) y PWA (Vite + React + TS + Tailwind)
6. [ ] Diseño de schema en Postgres: `users`, `rooms`, `room_members`, `notes`, `note_reviews`

### Fase 2 — Semanas 3-4: Rooms básicos
7. [ ] CRUD rooms (crear, listar, join/leave)
8. [ ] WebSocket para presencia en room (quién está conectado)
9. [ ] UI lista de rooms en Android + PWA
10. [ ] UI dentro del room (sin video aún, solo lista de miembros)

### Fase 3 — Semanas 5-6: Pomodoro sincronizado (feature diferencial)
11. [ ] Estado de Pomodoro server-authoritative en Redis (timestamp de inicio, duración, fase)
12. [ ] Broadcast por WebSocket a todo el room cuando cambia estado
13. [ ] UI de temporizador + barra de progreso sincronizada
14. [ ] Stats: cuántos Pomodoros ha completado el usuario
15. [ ] Tests de sincronización (critical path)

### Fase 4 — Semanas 7-8: Video/audio con LiveKit
16. [ ] Integrar LiveKit server-side (generar tokens)
17. [ ] Android SDK de LiveKit en Compose
18. [ ] Web SDK de LiveKit en PWA
19. [ ] Mute/unmute y on/off cámara

### Fase 5 — Semanas 9-10: Notes exchange
20. [ ] Subir apunte (PDF/imagen) a Supabase Storage
21. [ ] Feed de apuntes en la asignatura del room
22. [ ] Reviews de compañeros (stars + comentario)
23. [ ] Cálculo de reputación (promedio de reviews)

### Fase 6 — Semanas 11-12: ML de recomendaciones + polish
24. [ ] Endpoint `/recommendations/daily` con un modelo básico: "repasa lo que menos viste" (no ML complejo, scikit-learn simple o reglas)
25. [ ] Landing page del producto en GitHub Pages
26. [ ] Demo deploy a producción (Fly.io + Google Play closed testing + PWA en GitHub Pages)
27. [ ] Actualizar portfolio con StudySync como proyecto estrella
28. [ ] Grabar video de demo de 90 segundos para el CV / LinkedIn

## Métricas de éxito del proyecto (realistas)

- ✅ MVP funcional en 10 semanas (margen de 2 para imprevistos)
- ✅ 50 beta testers (amigos/compañeros de universidad) al final de fase 4
- ✅ 10+ Pomodoros completados en producción por usuarios reales
- ✅ Proyecto en el portfolio con demo live + video + repo público
- 🎯 Si algo de esto ocurre, genial: 500 usuarios reales, mencionado en Product Hunt, etc.

**NO son objetivos de este proyecto:**
- MRR / monetización — el proyecto es portfolio primero, negocio segundo
- Millones de usuarios — sobreingeniería
- Crypto / blockchain — rotundamente no
