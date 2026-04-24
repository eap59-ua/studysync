# 📚 StudySync

> **Study together, stay focused.** — Plataforma de estudio colaborativo con rooms virtuales, Pomodoro sincronizado e intercambio de apuntes verificados.

[![Backend CI](https://github.com/eap59-ua/studysync/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/eap59-ua/studysync/actions/workflows/backend-ci.yml)
[![Web CI](https://github.com/eap59-ua/studysync/actions/workflows/web-ci.yml/badge.svg)](https://github.com/eap59-ua/studysync/actions/workflows/web-ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎥 **Study Rooms** | Virtual rooms with video/audio via LiveKit |
| 🍅 **Synchronized Pomodoro** | Server-authoritative timer — everyone in the room stays in sync |
| 📝 **Notes Exchange** | Upload, discover and peer-review study notes |
| 🤖 **Smart Recommendations** | Rule-based study suggestions based on your history |

## 🏗️ Architecture

```
studysync/
├── backend/     # FastAPI + PostgreSQL + Redis (hexagonal architecture)
├── web/         # PWA — Vite + React + TypeScript + Tailwind CSS
├── mobile/      # Android — Kotlin + Jetpack Compose
├── docs/        # ADRs, diagrams, API schema
└── docker-compose.yml
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.12+, FastAPI, SQLAlchemy 2.0 (async), PostgreSQL 16, Redis 7 |
| **Web** | React 19, TypeScript, Vite, Tailwind CSS, LiveKit Web SDK |
| **Android** | Kotlin, Jetpack Compose, Hilt, Retrofit, LiveKit Android SDK |
| **Video** | LiveKit Cloud (WebRTC SFU) |
| **CI/CD** | GitHub Actions |
| **Deploy** | Fly.io (backend), GitHub Pages (PWA), Google Play (Android) |

### Hexagonal Architecture (Backend)

```
app/
├── domain/          # Pure entities, business rules, ports (interfaces)
├── application/     # Use cases, service layer
├── infrastructure/  # SQLAlchemy models, Redis, LiveKit, repositories
└── presentation/    # FastAPI routers, WebSocket handlers
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Python 3.12+
- Node.js 20+
- (Optional) Android Studio for mobile development

### Development

```bash
# 1. Clone the repo
git clone https://github.com/eap59-ua/studysync.git
cd studysync

# 2. Copy env file
cp backend/.env.example backend/.env

# 3. Start infrastructure (Postgres + Redis + Backend)
docker compose up -d

# 4. Run migrations
make migrate

# 5. Start web dev server
make dev-web

# Backend API:    http://localhost:8000
# Swagger UI:     http://localhost:8000/docs
# Web PWA:        http://localhost:5173
```

### Testing

```bash
make test           # Run all tests
make test-backend   # Backend only
make test-web       # Web only
make lint           # Lint all code
```

## 📋 Roadmap (12 weeks — Summer 2026)

| Phase | Weeks | Status | Description |
|-------|-------|--------|-------------|
| 0 | 1 | 🟢 Done | Scaffolding & infrastructure |
| 1 | 1-2 | ⬜ | Auth JWT + CI/CD |
| 2 | 3-4 | ⬜ | Rooms CRUD + WebSocket presence |
| 3 | 5-6 | ⬜ | **Synchronized Pomodoro** (core feature) |
| 4 | 7-8 | ⬜ | LiveKit video/audio integration |
| 5 | 9-10 | ⬜ | Notes exchange + peer reviews |
| 6 | 11-12 | ⬜ | Recommendations + production deploy |

## 👤 Author

**Erardo Aldana Pessoa** — Full-Stack Developer
- GitHub: [@eap59-ua](https://github.com/eap59-ua)
- Email: eap59@alu.ua.es
- Portfolio: [eap59-ua.github.io/eap-portfolio](https://eap59-ua.github.io/eap-portfolio/)

## 📄 License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
