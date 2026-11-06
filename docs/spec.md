# Canine Health Atlas — Spec

**Version:** MVP (AI Dev Tools Zoomcamp 2026, Project 2)
**Status:** built and tested locally; cloud deployment awaits the one-time setup in [deployment.md](./deployment.md)
**Audience:** the owner of one dog, and the vet they bring the record to
**Background:** [MVP plan](./atlas/mvp-plan.md) · full long-term vision in [os-kuro-archives](https://github.com/nghuixin/os-kuro-archives)

This document is the product and engineering source of truth. Anything not in it is out of scope until it is added here.

---

## 1. Problem

Owners of ageing or chronically ill dogs keep care information in their heads, group chats and photo galleries. When they see the vet, they reconstruct it from memory. Kuro's archive (a 16-year-old dog's last two and a half years, reconstructed after his death) showed three gaps that cost the most:

1. **Supplies ran out unnoticed.** Liver and joint supplements lapsed for months; nobody knew when they would run out.
2. **Nothing measured how the dog felt.** No quality-of-life or pain score was kept at the time, so decline was only visible in hindsight.
3. **Observations were scattered.** Seven group chats held what carers saw; the vet never saw them in one place, and visits relied on recall.

## 2. What the system does

The Canine Health Atlas is a care record for one dog. The owner logs observations, medicines given, weight and weekly quality-of-life scores as they happen. The app turns that into a **vet report**: a one-page, clinical summary of a chosen period that the owner prints or shows at a visit.

A small, optional **star garden** makes everyday logging enjoyable: each successful save drops a star from a rainbow bridge for the owner's dog to catch.

**Feature test (applies to every feature):** it helps the owner *know, measure, remember or ask*. It never diagnoses, interprets, rates severity or recommends treatment.

## 3. Users and constraints

| Constraint | Decision |
|---|---|
| Users | One owner, one dog |
| Authentication | None in the MVP |
| Public deployment | **Demo data only.** Real records are kept by running the app locally, because there is no login |
| Clinical content | Owner-recorded facts only. No diagnosis, interpretation, severity or dosing advice |
| Language | English |

## 4. Design: two layers

| | Clinical record (the app) | Star garden (the fun corner) |
|---|---|---|
| Purpose | Accurate, structured records a vet can read in two minutes | Make daily logging something people want to do |
| Look | White / very light grey background, one muted accent, system font, tables, explicit dates and units, print-friendly | Original 90s-arcade pixel art (`frontend/src/garden/`) |
| Placement | Every page | One collapsible strip at the top of Today only |
| Print and vet report | Included | **Never** shown |
| Data | All records | Logs **medicine and supplement doses only**, as ordinary dose-log records (the same rows the Medicines page creates). Only the star counters are its own |

The arcade fonts, colours and sounds are scoped to the garden component and never leak into clinical pages.

## 5. Features and acceptance criteria

Each feature below becomes one GitHub issue with this checklist. Acceptance criteria are written so QA can check them by hand and in tests.

### 5.1 Dog profile (first run)

- [ ] On first run the owner enters name, birth date, sex, breed (free text) and coat (for the garden sprite).
- [ ] Exactly one dog exists; the profile can be edited later.

### 5.2 Today

- [ ] Shows the star garden strip (collapsible; collapsed state remembered in the browser).
- [ ] Quick-log buttons: **Ate**, **Toileted**, **Note**. Each creates a dated observation of the matching kind. Doses are logged in the star garden's feeding log (or on the Medicines page), so Today has one place to log a dose.
- [ ] Lists medicines that run out within 7 days, soonest first.
- [ ] Lists the 5 most recent observations.

### 5.3 Observations

- [ ] Fields: date/time (defaults to now), category, the owner's words (required, ≤ 2,000 chars), "add to vet questions" flag.
- [ ] Categories (closed list): `MOBILITY`, `APPETITE`, `TOILETING`, `SKIN_COAT`, `BREATHING`, `BEHAVIOUR`, `OTHER`.
- [ ] **Analyze** (optional) suggests a category and a summary of ≤ 200 chars. The form stays editable; fields from Analyze are tagged **AI**, and **EDITED** once changed. The original suggestion is stored beside the saved values.
- [ ] Analyze failure never blocks saving; the UI shows "suggestion unavailable".
- [ ] List view filters by category and date range.

### 5.4 Medicines

- [ ] Fields: name, kind (`DRUG`, `SUPPLEMENT`, `HERBAL`, `OTHER`), dose (text, e.g. "1 tablet"), doses per day, quantity on hand, start date, prescriber (optional).
- [ ] `runs_out_on = refilled_on (or start) + floor(quantity ÷ doses per day)` days. Shown as a date, never as a warning message.
- [ ] Rows within 7 days of running out are highlighted.
- [ ] **Refill** resets quantity and `refilled_on`.
- [ ] **Stop** requires a reason; stopped medicines move to a "Past" section.
- [ ] **Dose log:** "Gave medicine" on the Medicines page records a dose for a chosen medicine at a time. The vet report uses it for adherence.

### 5.5 Measures

- [ ] **Weight:** date and kg (> 0, ≤ 120). Line chart over time.
- [ ] **Weekly check-in:** the 7 HHHHHMM items (Hurt, Hunger, Hydration, Hygiene, Happiness, Mobility, More good days than bad), each 0–10, 10 is best. Total out of 70 is computed.
- [ ] Check-in chart shows **each item as well as the total** (a total alone hid Kuro's collapse in mobility and hygiene).
- [ ] At most one check-in per ISO week; a second one replaces the first after confirmation.

### 5.6 Vet report

- [ ] Period selector: "Since last vet visit" (default), last 30 days, or custom dates.
- [ ] **Vet visits** can be recorded (date, clinic, reason) to set the default period.
- [ ] Sections, in order:
  1. Dog details, report period, date generated.
  2. Current medicines and supplements: name, kind, dose, frequency, start date, **doses given / doses expected** in the period.
  3. Medicines started or stopped in the period, with stop reasons.
  4. Weight: first and last value in the period, change in kg and %.
  5. Quality of life: each HHHHHMM item and the total, first vs latest check-in in the period, with the change.
  6. Observations grouped by category: count, then each entry (date, owner's words).
  7. Owner's questions for the vet (observations flagged "add to vet questions").
  8. Footer: "Owner-recorded. Not a diagnosis."
- [ ] No interpretation anywhere: numbers and the owner's words only.
- [ ] Prints to one or two A4 / Letter pages with the browser's print; no garden, navigation or buttons in print.
- [ ] Empty sections say "Nothing recorded in this period."

### 5.7 Star garden

- [ ] One screen, one player, no levels, no way to fail.
- [ ] Four dogs on a rainbow bridge: Kuro, Attila, Gladys, Lucky. The owner's dog (coat from the profile) walks on the grass: ← → / A D to walk, ↑ / W / Space to jump, tap to walk or tap the dog to jump.
- [ ] **Feeding log, the garden's only form:** the owner picks Medicine or Supplement, then one of the dog's active medicines of that kind (Medicine = `DRUG`, `HERBAL`, `OTHER`; Supplement = `SUPPLEMENT`) with its dose shown, and presses **Gave it**. This calls `POST /api/medications/{id}/doses`, the same endpoint as "Gave medicine", so the dose counts in the vet report's adherence like any other.
- [ ] The time given defaults to now and can be changed (for a dose given earlier).
- [ ] The garden cannot create, edit, refill or stop a medicine. If the list is empty, it links to the Medicines page.
- [ ] Observations, weight and check-ins are never logged from the garden; they use the clinical pages.
- [ ] The garden lists the last few doses logged (time, name, dose) so a double dose is easy to spot.
- [ ] Every **successful** save of an observation, dose, weight or check-in, from the garden or a clinical page, adds one waiting star; one of the bridge dogs drops it, never the same dog twice in a row. The very first star ever comes from Kuro. The first visit each day also adds one.
- [ ] **Stars reward logging, never results:** the number of stars never depends on scores or values.
- [ ] No star is added when a save fails.
- [ ] Catching moves a star from waiting to caught (`POST /api/stars/catch`).
- [ ] Music and sound effects are off until the owner presses a key or clicks; both have toggles.
- [ ] Extras kept from the prototype: Ctrl/Cmd+S drops sakura petals; the dog lies down and sleeps when stopped on its bed.

## 6. Data model

| Table | Columns (key ones) | Rules |
|---|---|---|
| `dog` | `id`, `name`, `birth_date`, `sex`, `breed`, `coat`, `stars_waiting`, `stars_caught`, `last_visit_star_on` | Exactly one row |
| `observations` | `id`, `observed_at`, `category`, `text`, `summary`, `for_vet`, `ai_suggestion` (JSON), `edited_fields` (JSON), `created_at` | `text` required |
| `medications` | `id`, `name`, `kind`, `dose`, `per_day`, `quantity`, `started_on`, `refilled_on`, `prescriber`, `stopped_on`, `stop_reason` | `stop_reason` required when `stopped_on` is set |
| `dose_logs` | `id`, `medication_id`, `given_at` | FK to an active medication |
| `weights` | `id`, `measured_on`, `kg` | `0 < kg ≤ 120` |
| `checkins` | `id`, `iso_week`, `hurt` … `more_good_days`, `total`, `note` | One per `iso_week`; `total` computed |
| `vet_visits` | `id`, `visited_on`, `clinic`, `reason` | |

Schema changes go through **Alembic** migrations. Migrations must be backward compatible with the previous release (add columns, never drop or rename in the same release), so a rollback can run against the migrated database.

## 7. API (contract: `openapi.yaml`)

Frontend first: the client in `frontend/src/services` defines the calls and the backend implements them. `openapi.yaml` is generated from the backend (`make openapi`) and a test fails if it drifts. JSON is snake_case; errors are `{ "error": string }`.

| Method and path | Purpose |
|---|---|
| `GET/PUT /api/dog` | Profile |
| `GET/POST /api/observations`, `PATCH /api/observations/{id}` | Observations (filters: `category`, `from`, `to`) |
| `POST /api/observations/analyze` | Suggest category and summary |
| `GET/POST /api/medications`, `POST /api/medications/{id}/refill`, `POST /api/medications/{id}/stop` | Medicines |
| `POST /api/medications/{id}/doses` | Log a dose |
| `GET/POST /api/weights` | Weight |
| `GET/PUT /api/checkins/{iso_week}`, `GET /api/checkins` | Weekly check-ins |
| `GET/POST /api/vet-visits` | Vet visits |
| `GET /api/report?basis=&from=&to=&today=&tz_offset=` | Vet report data; days are counted in the owner's time zone |
| `GET /api/doses?limit=` | Most recent doses (the garden's list) |
| `GET /api/stars`, `POST /api/stars/visit`, `POST /api/stars/catch` | Star counters; the first visit each day adds one star |
| `GET /healthz` | Liveness and database check (operations; not in the contract) |

## 8. Analyze

- **MVP: keyword rules** (e.g. "limp", "stairs", "couldn't get up" → `MOBILITY`), so the app runs without an API key and CI needs no secrets.
- Server-side validation: category must be in the closed list; summary ≤ 200 chars; otherwise "suggestion unavailable".
- Never returns diagnosis, severity, causes or dosing. A Claude adapter behind the same contract is a later option (see §17).

## 9. Privacy and telemetry rules

- Never log, trace or export: observation text, summaries, the dog's name, medicine names, notes or any request body.
- Telemetry carries route, method, status, duration, record **type** and IDs only.
- A unit test sends a request containing a marker string and asserts the marker never appears in captured logs or span attributes.
- No credentials in the repo; production secrets live in Google Secret Manager.

## 10. Architecture

```
Browser (React + Vite)  ──HTTP /api──►  FastAPI (Python, uv)  ──SQLAlchemy──►  Postgres
        │                                    │                                  (SQLite locally)
        └── StarGarden <canvas> component     └── OpenTelemetry: traces, metrics, JSON logs with trace_id
```

| Choice | Why |
|---|---|
| React + Vite, TypeScript | Same as Project 1; the garden ports as a canvas component |
| FastAPI + Pydantic | Typed validation, generated API docs |
| SQLAlchemy + Alembic; SQLite locally, Postgres (Neon) in the cloud | Zero-setup development, same code in production (`DATABASE_URL`) |
| One container serves the API and the built UI | Same origin, one image to test and deploy |
| Charts: a small chart library (e.g. Recharts) for clinical pages | Plain labelled line charts |

## 11. Testing

| Layer | Tool | Covers |
|---|---|---|
| Backend unit | pytest, in-memory SQLite | Run-out arithmetic (incl. refill and stop), stop-reason rule, HHHHHMM total, one check-in per week, adherence counts, weight % change, report period selection, Analyze validation and failure, stars added only on success and independent of values, telemetry contains no record text |
| Frontend | Vitest + Testing Library | Forms and validation, AI/EDITED tags, "suggestion unavailable" path, report renders every section and empty states, print stylesheet hides the garden, the garden's feeding log offers only active medicines and supplements and calls `POST /api/medications/{id}/doses` |
| Integration | pytest + httpx against Docker Compose (Postgres) | Full journeys over HTTP: create dog → log records → report shows them; data survives an API restart |

**One command:** `make test-all` starts Compose, waits for `/healthz`, runs backend unit, frontend and integration tests, then tears down. CI runs the same target.

## 12. Running locally and containers

| Command | What |
|---|---|
| `make up` | **Whole system in Docker** (API + UI + Postgres) on http://localhost:8000 |
| `make run` + `make dev` | API on :8000 and Vite UI on :5173 for development |
| `make up-obs` | `make up` plus Grafana, Tempo, Loki, Prometheus |
| `make seed-demo` | Load the demo dog (synthetic records shaped like Kuro's 2025 care) |

One multi-stage `Dockerfile`: Node builds the UI, then a Python image serves API and static files.

## 13. Deployment: Google Cloud Run + Neon

| | Dev | Production |
|---|---|---|
| Cloud Run service | `atlas-dev` | `atlas-prod` |
| Neon branch | `dev` | `main` |
| Public URL | `https://atlas-dev-<hash>.a.run.app` | `https://atlas-prod-<hash>.a.run.app` |
| Data | Demo dog, reseeded on deploy | Demo dog only |
| Deployed by | CI, automatically on `master` | CI, after manual approval |

- **Image registry:** Google Artifact Registry, tagged with the commit SHA.
- **Database:** Neon Postgres, pooled connection string with `sslmode=require`, stored in **Secret Manager** as `DATABASE_URL_DEV` / `DATABASE_URL_PROD` and mounted into each service.
- **Auth from GitHub:** Workload Identity Federation (`google-github-actions/auth`); no long-lived service-account keys in GitHub.
- **Scaling:** min instances 0 and max 2 to stay in free tiers; Neon autosuspends. Expect a cold start of a few seconds after idle; document it in the README.
- **Migrations:** the deploy job runs `alembic upgrade head` against the target Neon branch before the new revision gets traffic.

**One-time setup (owner):** create a GCP project; enable Cloud Run, Artifact Registry, Secret Manager; create the Workload Identity pool and a deploy service account; create the Neon project with `main` and `dev` branches; add the GitHub variables (`GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`) and the `development` / `production` environments, with the owner as required reviewer on `production`. Steps go in `docs/deployment.md`.

## 14. CI/CD and rollback

```
PR / push:   unit + frontend tests ─┬─ compose validate ─┬─ make test-all
                                    │                    │
master:      build image ─► Artifact Registry (:sha) ─► deploy-dev (auto) ─► [owner approves] ─► deploy-prod
```

- **Every PR and push:** backend unit tests, frontend tests, Compose validation, `make test-all`.
- **`deploy-dev` (automatic on `master`):** migrate the dev branch → `gcloud run deploy atlas-dev --image …:<sha>` → health check `/healthz`.
- **`deploy-prod` (manual):** the `production` environment pauses for the owner's approval. Then:
  1. migrate the prod branch;
  2. deploy the same `:<sha>` image as a **new revision with no traffic** (`--no-traffic --tag candidate`);
  3. health-check the candidate URL;
  4. if healthy, move 100% of traffic to it; if not, leave traffic on the previous revision and fail the job.
- **Rollback path:** a manual `rollback` workflow (`workflow_dispatch`, input: revision name, default "previous") runs `gcloud run services update-traffic atlas-prod --to-revisions=<rev>=100`. Cloud Run keeps old revisions, so rollback takes seconds and needs no rebuild.

## 15. Observability

**Key user journey:** *save a record* (observation, dose, weight, check-in), the moment the owner's care becomes data. Second: *open the vet report*.

| Signal | What | Local (`make up-obs`) | Production |
|---|---|---|---|
| Traces | OpenTelemetry FastAPI + SQLAlchemy auto-instrumentation; one span per request with DB child spans | Tempo, viewed in Grafana | Cloud Trace |
| Metrics | `atlas_record_saves_total{type, outcome}`, request duration histogram by route, report latency | Prometheus `/metrics`, Grafana dashboard | Log-based metric `atlas_record_saves` built from the JSON request logs (see [tasks.md](./tasks.md)) |
| Logs | One JSON line per request: `trace_id`, `span_id`, route, status, duration, record type. No record content (§9) | Loki, viewed in Grafana | Cloud Logging; the `logging.googleapis.com/trace` field links each line to its trace |

- **Correlation:** every log line carries the trace ID, so a failed save in the logs opens its trace in one click (Grafana locally, Cloud Logging → Cloud Trace in production).
- **Dashboard:** saves per minute by type and outcome, save error rate, p95 latency of saves and of the report.

## 16. Alerting on user impact

| Alert | Condition | Why it matters |
|---|---|---|
| `RecordSaveFailing` (page) | More than 5% of record saves return 5xx over 2 minutes, sustained 1 minute | The owner's care stops being recorded; that is the product's core job |

- **Local:** Prometheus rule in `ops/observability/alerts.yml`. `make alert-demo` restarts the API with `FAULT_SAVE_500_RATE=0.5` (default 0) so the alert fires.
- **Production:** an equivalent Cloud Monitoring alert policy (PromQL) on the `atlas_record_saves` log-based metric (`ops/gcp/setup-monitoring.sh`), with a notification channel (email, plus a Pub/Sub topic the on-call agent can read).
- No CPU or memory alerts: they don't describe user impact.

## 17. On-call agent

**Goal:** an agent wakes up on an alert, finds the cause and prepares a fix. **It never deploys, merges or pushes to `master`.**

**Flow:**

```
alert fires ─► poller (scripts/poll_alerts.py) ─► incident brief ─► on-call agent in a fresh git worktree
                                                                     │
                                                                     ├─ reads logs and traces (by trace ID)
                                                                     ├─ reproduces with a failing test
                                                                     ├─ fixes the code, runs make test
                                                                     └─ pushes a branch oncall/<alert>-<time> and opens a PR
                                                                              │
                                    owner reviews and merges ◄────────────────┘
                                              │
                         normal pipeline: deploy-dev (auto) ─► owner approves ─► deploy-prod
```

- **Trigger:** the poller checks Prometheus (local) or the Pub/Sub notification topic (production) every 30 s; each alert instance is handled once.
- **Incident brief:** alert name, labels, start time, the last 5xx log lines with trace IDs, links to the traces and dashboard. No record content.
- **Agent:** `claude -p` with `.agents/agents/oncall.md` as its instructions, running in a new worktree on branch `oncall/<alert>-<timestamp>`.
- **Allowed:** read code, logs and traces; edit code and tests; run `make test`; `git push` to its own `oncall/*` branch; `gh pr create`.
- **Forbidden:** pushing to `master`, merging, approving, running deploy or rollback workflows, changing CI, secrets or infrastructure, deleting data. Enforced by the agent's tool permissions (`docs/permissions.md`) and branch protection on `master`.
- **PR contents:** what fired, the evidence (trace IDs, log lines), root cause, the fix, the new regression test, and a note that **rollback** is the immediate mitigation if the owner wants one before merging.
- **Demo:** `DEMO_BUG=checkin_total` turns on a real code path with a planted bug (the check-in total fails when an item is 0). The integration test traffic triggers `RecordSaveFailing`; the agent's PR must fix the code, not just turn the flag off.

## 18. Agent team and process

| Role | File | Responsibility | May not |
|---|---|---|---|
| **PM** | `.agents/agents/pm.md` | Turns a request into a GitHub issue scoped against this spec, with acceptance criteria | Write code |
| **SWE** | `.agents/agents/swe.md` | Implements one issue on a branch, keeps `openapi.yaml` in sync, opens a PR that says `Closes #n` | Change scope or the spec without PM |
| **QA** | `.agents/agents/qa-engineer.md` | Runs `make test-all` and checks every acceptance criterion; comments PASS or FAIL on the PR | Fix code |
| **On-call** | `.agents/agents/oncall.md` | §17 | Deploy, merge or push to `master` |

**Loop:** request → PM issue → SWE branch and PR → QA verdict → owner merges. A FAIL goes back to SWE with the repro. Details in `docs/process.md`.

**Task tracker:** public GitHub Issues with labels (`feature`, `infra`, `ops`, `bug`) and milestones per build phase. Evidence of use: every PR links its issue, QA verdicts are PR comments, and the on-call agent's PRs link the alert.

## 19. Project docs (context management)

| File | Contents |
|---|---|
| `AGENTS.md` | Layout, commands, rules, and links to everything below |
| `docs/spec.md` | This document |
| `docs/tasks.md` | Decision log: chose vs deferred, and why |
| `docs/process.md` | PM → SWE → QA loop and the on-call loop |
| `docs/permissions.md` | What each agent may touch |
| `docs/deployment.md` | GCP and Neon setup, environments, rollback |
| `docs/observability.md` | Signals, dashboard, alert, demo steps |
| `docs/criteria-log.md` | Each course criterion with its evidence |

## 20. Course criteria mapping

| Criterion | Evidence |
|---|---|
| Problem description | README: problem, functionality, expected behaviour (§1–2) |
| Product specification | This spec, plus public GitHub Issues with acceptance criteria, linked from PRs (§5, §18) |
| Agent team | PM, SWE, QA, on-call, plus `docs/process.md` (§18) |
| Context management | `AGENTS.md` pointing to modular docs (§19) |
| Application | React → FastAPI → Postgres end to end; `make up` (§10, §12) |
| Testing | Unit, frontend and integration tests; `make test-all` (§11) |
| Containerization | Dockerfile and Compose with Postgres; `make up` (§12) |
| Deployment | Cloud Run public URL (§13) |
| CI/CD | Tests → auto deploy to dev → manual approval to prod, plus rollback (§14) |
| Observability | Traces, metrics and logs sharing a trace ID; no record content; Grafana / Google Cloud UIs (§9, §15) |
| Alerting on user impact | `RecordSaveFailing` (§16) |
| On-call agent | Wakes on the alert, fixes the code, opens a PR; never deploys (§17) |

## 21. Build phases

| Phase | Work | Rough effort |
|---|---|---|
| 0 | Issues with acceptance criteria, `AGENTS.md`, agent and process docs | 2 h |
| 1 | Clinical frontend and the garden component against a mock service; extract `openapi.yaml` | 5 h |
| 2 | Backend, Alembic, unit tests | 4 h |
| 3 | Frontend tests, Docker, Compose, integration tests, `make test-all` | 2.5 h |
| 4 | GCP and Neon setup, CI/CD, rollback workflow | 3 h |
| 5 | Telemetry (local and Google Cloud), dashboard, alert, fault demo | 2 h |
| 6 | On-call agent and demo, README, screenshots, criteria log | 2.5 h |

## 22. Out of scope

Accounts and login, more than one dog, uploading lab reports or PDFs, photos (later), reminders and notifications (run-out dates are shown on screen only), care plans and decision logs, any diagnosis or interpretation, a bigger game (levels, multiplayer, shops, streaks), CPU or memory alerts.

## 23. Open decisions

- [ ] **Analyze:** keyword rules only (assumed in this spec), or also a Claude adapter behind the same contract.
- [ ] **GCP region and Neon region:** choose a Cloud Run region and the nearest Neon region, close to the owner, to keep latency low.
- [ ] **Production alert channel:** email only, or email plus Pub/Sub for the on-call agent in production (local alerting is enough for the demo).
