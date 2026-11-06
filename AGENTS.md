# AGENTS.md

Start here. The Canine Health Atlas is a care record for one dog that turns everyday logs into a clinical vet report, with an optional pixel-art "star garden" for logging doses. **`docs/spec.md` is the source of truth**; if code and spec disagree, the spec wins or gets changed first.

## Layout

```
backend/               FastAPI + SQLAlchemy + Alembic (Python 3.12, uv)
  app/main.py          app factory, error format, /healthz, /metrics, serves the built UI
  app/routers/         dog + stars, observations, medications + doses, measures + vet visits, report
  app/logic.py         pure rules: run-out dates, check-in totals, ISO weeks, Analyze keyword rules
  app/saves.py         committing a record save: stars and fault injection in one place
  app/telemetry.py     OpenTelemetry, JSON logs with trace_id, Prometheus metrics (privacy rules, spec §9)
  alembic/versions/    migrations (backward compatible only)
  scripts/             seed_demo.py, export_openapi.py, start.sh
  tests/               pytest; tests/integration/ runs against Compose
frontend/              React + Vite + TypeScript
  src/services/        api.ts (the only HTTP client), types.ts
  src/pages/           Today, Observations, Medicines, Measures, Report, Profile
  src/garden/          the star garden: engine.js (canvas), StarGarden.tsx, FeedingLog.tsx
  src/test/            Vitest + Testing Library
openapi.yaml           the API contract, generated (make openapi), checked by a test
ops/observability/     Prometheus (+ alert rule), Tempo, Loki, Promtail, Grafana
ops/gcp/               Cloud Monitoring alert setup
scripts/               poll_alerts.py (on-call), traffic.py, healthcheck.sh, create_issues.py
.github/workflows/     ci-cd.yml (tests, dev deploy, approved prod deploy), rollback.yml
.agents/               role instructions (agents/*.md) and the on-call agent's tool permissions
```

## Commands

| | |
|---|---|
| `make install` | backend and frontend dependencies |
| `make run` + `make dev` | API on :8000 (SQLite) and UI on :5173 |
| `make up` / `make down` | whole system in Docker (API + UI + Postgres) on :8000 |
| `make seed-demo` | demo dog (`LOCAL=1` for the SQLite dev database) |
| `make test` | backend unit + frontend tests |
| `make test-all` | everything, including integration tests against a throwaway Compose stack |
| `make openapi` | regenerate the contract after an API change |
| `make up-obs` / `make traffic` / `make alert-demo` | observability stack / normal save traffic / make the alert fire |
| `make oncall-watch` | the alert poller that wakes the on-call agent |

Host ports (8000, 3000, 9090, 3100, 3200) can be moved in a git-ignored `.env`; see `.env.example`.

## Rules

1. **Clinical honesty.** Owner-recorded facts only. Nothing diagnoses, interprets, rates severity or advises dosing (spec §2, §3).
2. **Privacy.** Never put request bodies, observation text, the dog's name, medicine names or notes into logs, traces, metrics, commits or PRs (spec §9).
3. **Two layers.** Arcade styles live only in `src/garden/`. The garden logs medicine and supplement doses only, through the normal dose endpoint, and never appears in print or the report.
4. **Stars reward logging, never results**, and only after a successful save (`app/saves.py`).
5. **Migrations are backward compatible** so Cloud Run rollback works.
6. **Contract first.** API changes update `services/api.ts`, `types.ts` and `openapi.yaml` together.
7. **Agents never deploy or merge.** See docs/permissions.md.

## More context

| Doc | |
|---|---|
| [docs/spec.md](docs/spec.md) | product and engineering spec |
| [docs/tasks.md](docs/tasks.md) | decision log |
| [docs/process.md](docs/process.md) | PM → SWE → QA loop, on-call loop, issues |
| [docs/permissions.md](docs/permissions.md) | what each agent may touch |
| [docs/deployment.md](docs/deployment.md) | Google Cloud Run + Neon setup, rollback |
| [docs/observability.md](docs/observability.md) | signals, dashboard, alert, runbook, demos |
| [docs/criteria-log.md](docs/criteria-log.md) | course criteria and their evidence |
