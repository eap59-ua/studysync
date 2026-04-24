.PHONY: dev dev-backend dev-web test test-backend test-web lint migrate seed build clean

# ──────────────────────────────────────────────
# Development
# ──────────────────────────────────────────────

dev: ## Start all services (Postgres + Redis + Backend)
	docker compose up -d

dev-backend: ## Run backend with hot reload (without Docker)
	cd backend && uvicorn app.main:app --reload --port 8000

dev-web: ## Run web PWA dev server
	cd web && npm run dev

# ──────────────────────────────────────────────
# Testing
# ──────────────────────────────────────────────

test: test-backend test-web ## Run all tests

test-backend: ## Run backend tests
	cd backend && python -m pytest tests/ -v

test-web: ## Run web tests
	cd web && npm run test

# ──────────────────────────────────────────────
# Code Quality
# ──────────────────────────────────────────────

lint: ## Lint all code
	cd backend && ruff check app/ tests/
	cd web && npm run lint

format: ## Format all code
	cd backend && ruff format app/ tests/
	cd web && npm run format

# ──────────────────────────────────────────────
# Database
# ──────────────────────────────────────────────

migrate: ## Run Alembic migrations
	cd backend && alembic upgrade head

migrate-new: ## Create new migration (usage: make migrate-new MSG="add rooms table")
	cd backend && alembic revision --autogenerate -m "$(MSG)"

seed: ## Seed database with demo data
	cd backend && python -m app.infrastructure.seed

# ──────────────────────────────────────────────
# Build & Deploy
# ──────────────────────────────────────────────

build: ## Build production artifacts
	docker compose -f docker-compose.yml build
	cd web && npm run build

clean: ## Remove all containers, volumes, and build artifacts
	docker compose down -v
	cd web && rm -rf node_modules dist
	find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
