# Canine Health Atlas: every command the README and AGENTS.md mention.
SHELL := bash
.DEFAULT_GOAL := help

# Host ports. Override in a git-ignored .env (see .env.example) if they clash with other
# projects; Compose reads the same file.
-include .env
ATLAS_PORT   ?= 8000
GRAFANA_PORT ?= 3000
PROM_PORT    ?= 9090
LOKI_PORT    ?= 3100
TEMPO_PORT   ?= 3200
export ATLAS_PORT GRAFANA_PORT PROM_PORT LOKI_PORT TEMPO_PORT

COMPOSE      := docker compose
TEST_COMPOSE := docker compose -p atlas-test
TEST_PORT    := 8099

.PHONY: help install run dev test test-backend test-frontend test-integration test-all \
        up down logs up-obs traffic alert-demo alert-demo-off seed-demo openapi build oncall-watch

help: ## List commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-18s %s\n", $$1, $$2}'

install: ## Install backend (uv) and frontend (npm) dependencies
	cd backend && uv sync
	cd frontend && npm ci

# ---------- Development ----------
run: ## API on :8000 with a local SQLite file (migrates first)
	cd backend && uv run alembic upgrade head && uv run uvicorn --factory app.main:create_app --reload --port 8000

dev: ## Vite UI on :5173, proxying /api to :8000
	cd frontend && npm run dev

seed-demo: ## Load the demo dog into the running Compose stack (or the local DB with LOCAL=1)
ifeq ($(LOCAL),1)
	cd backend && uv run python scripts/seed_demo.py
else
	$(COMPOSE) exec api python scripts/seed_demo.py
endif

openapi: ## Regenerate openapi.yaml (the API contract)
	cd backend && uv run python scripts/export_openapi.py

# ---------- Tests ----------
test-backend: ## Backend unit tests (pytest, in-memory SQLite)
	cd backend && uv run pytest -q

test-frontend: ## Frontend tests (Vitest) and type check
	cd frontend && npm run typecheck && npm test

test: test-backend test-frontend ## Unit + frontend tests

test-integration: ## Integration tests against a running stack (ATLAS_URL, default :8000)
	cd backend && ATLAS_URL=$${ATLAS_URL:-http://localhost:$(ATLAS_PORT)} uv run pytest -q -m integration tests/integration

test-all: ## Everything, against a throwaway Compose stack (Postgres), then tear down
	ATLAS_PORT=$(TEST_PORT) $(TEST_COMPOSE) up -d --build --wait
	status=0; \
	$(MAKE) --no-print-directory test || status=$$?; \
	if [ $$status -eq 0 ]; then \
	  cd backend && ATLAS_URL=http://localhost:$(TEST_PORT) ATLAS_COMPOSE="$(TEST_COMPOSE)" \
	    uv run pytest -q -m integration tests/integration || status=$$?; cd ..; \
	fi; \
	ATLAS_PORT=$(TEST_PORT) $(TEST_COMPOSE) down -v; \
	exit $$status

# ---------- Containers ----------
build: ## Build the image
	$(COMPOSE) build api

up: ## Whole system in Docker on http://localhost:8000
	$(COMPOSE) up -d --build --wait
	@echo "Canine Health Atlas: http://localhost:$(ATLAS_PORT)  (first run? 'make seed-demo' loads a demo dog)"

down: ## Stop the stack (data is kept; 'docker compose down -v' deletes it)
	$(COMPOSE) --profile obs down

logs: ## Follow API logs
	$(COMPOSE) logs -f api

# ---------- Observability and the alert demo ----------
up-obs: ## Stack plus Grafana (:3000), Prometheus (:9090), Tempo, Loki
	OTEL_EXPORTER=otlp $(COMPOSE) --profile obs up -d --build --wait
	@echo "App http://localhost:$(ATLAS_PORT) · Grafana http://localhost:$(GRAFANA_PORT) · Prometheus http://localhost:$(PROM_PORT)"

traffic: ## Send a few minutes of normal save traffic (MINUTES=3)
	cd backend && ATLAS_URL=http://localhost:$(ATLAS_PORT) uv run python ../scripts/traffic.py --minutes $${MINUTES:-3}

alert-demo: ## Restart the API failing half of all saves, and send traffic, so RecordSaveFailing fires
	OTEL_EXPORTER=otlp FAULT_SAVE_500_RATE=0.5 $(COMPOSE) --profile obs up -d --wait api
	cd backend && ATLAS_URL=http://localhost:$(ATLAS_PORT) uv run python ../scripts/traffic.py --minutes 4

alert-demo-off: ## Back to normal
	OTEL_EXPORTER=otlp FAULT_SAVE_500_RATE=0 $(COMPOSE) --profile obs up -d --wait api

oncall-watch: ## Run the alert poller that wakes the on-call agent (spec §17)
	cd backend && PROM_URL=http://localhost:$(PROM_PORT) LOKI_URL=http://localhost:$(LOKI_PORT) \
	  GRAFANA_URL=http://localhost:$(GRAFANA_PORT) uv run python ../scripts/poll_alerts.py
