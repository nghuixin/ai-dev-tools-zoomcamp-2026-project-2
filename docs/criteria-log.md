# Course criteria and evidence

AI Dev Tools Zoomcamp 2026, final project. Status: **built and verified locally in Docker (2026-11-05); cloud deployment pending the one-time setup in docs/deployment.md.**

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 1 | Problem description | README (problem, what it does, expected behaviour); spec §1–2 | Done |
| 2 | Product specification and task tracker | `docs/spec.md` with acceptance criteria per feature (§5); GitHub Issues created from it by `scripts/create_issues.py`, with labels and milestones; PRs say `Closes #n` | Spec done; issues to be created |
| 3 | Agent team | `.agents/agents/` PM, SWE, QA, on-call; `docs/process.md`; `docs/permissions.md` | Done |
| 4 | Context management | `AGENTS.md` (layout, commands, rules) linking modular docs; `CLAUDE.md` imports it; `docs/tasks.md` decision log | Done |
| 5 | Application end to end | React UI → FastAPI → SQLAlchemy → Postgres/SQLite; one image serves UI and API; `make up` | Done (verified in Docker with Postgres) |
| 6 | Testing | 63 backend unit tests (rules, API, report, stars, telemetry privacy, migrations, contract, on-call); 14 frontend tests (forms, AI/EDITED tags, "suggestion unavailable", feeding log, report sections and print rules); integration tests over HTTP; `make test-all` | Done (`make test-all` green: 63 + 14 + 4 integration, incl. data surviving an API restart) |
| 7 | Containerization | Multi-stage `Dockerfile`; `docker-compose.yml` with Postgres; `make up` | Done (`make up`, `make test-all`) |
| 8 | Deployment | Cloud Run `atlas-dev` / `atlas-prod` with Neon (docs/deployment.md) | Pending owner setup |
| 9 | CI/CD | `.github/workflows/ci-cd.yml`: tests on every push and PR → build → auto deploy to dev → owner approval → no-traffic candidate → health check → traffic; `rollback.yml` | Written; deploy jobs activate once GCP variables are set |
| 10 | Observability | OpenTelemetry traces (FastAPI + SQL), Prometheus metrics, JSON logs with `trace_id`; Grafana with Tempo↔Loki links; Cloud Trace/Logging in production; no record content (tested) | Done locally (`make up-obs`): metrics scraped, logs in Loki, log trace_id opens the Tempo trace with SQL spans; [dashboard screenshot](images/grafana-alert-demo.png) |
| 11 | Alerting on user impact | `RecordSaveFailing` (Prometheus rule and Cloud Monitoring policy); `make alert-demo` | Done: `make alert-demo` took the alert to firing at 56% failed saves; resolved after `make alert-demo-off` |
| 12 | On-call agent | `scripts/poll_alerts.py` wakes `claude -p` in a worktree with restricted permissions; planted `DEMO_BUG=checkin_total`; agent opens a PR, never deploys | Poller verified against the firing alert (dry run builds the brief from Loki with trace IDs); live agent run pending the first push to master |
