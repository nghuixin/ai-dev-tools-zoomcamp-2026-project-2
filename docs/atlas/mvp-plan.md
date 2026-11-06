# Canine Health Atlas: an MVP plan

> **Superseded by the [spec](../spec.md)**, which makes the app clinical (with a printable vet report), keeps the star garden as an optional corner, and adds deployment on Google Cloud Run + Neon. This plan is kept as the record of how the idea was narrowed down.

A much simpler first version of the full [Canine Health Atlas spec](https://github.com/nghuixin/os-kuro-archives), for someone who already has a dog. It's built on the same shape as [Project 1](https://github.com/nghuixin/ai-dev-tools-zoomcamp-2026-project-1) (site issue triage).

## The idea

The full Atlas spec is a records platform: PDF extraction, source grounding, care plans and decision logs. That's far too much for an MVP.

The MVP keeps the three gaps from Kuro's care that someone with a dog **today** can fix without uploading any records:

- **Supplies ran out unnoticed** (Samylin, YuMove, Antinol).
- **Nothing measured how he felt**, so every quality-of-life score had to be reconstructed after his death.
- **Observations were scattered** across seven group chats, and the vet never saw them in one place.

**The one-line pitch:** a log for one dog that shows when each medicine runs out, how the dog is doing week by week, and what to tell the vet. Logging is rewarded with a small cozy scene, the **star garden**, so that keeping the record feels like something to look forward to.

**The feature test, kept from the Atlas spec:** it helps the owner *know, measure, remember or ask*. It never diagnoses, interprets or recommends treatment.

## The star garden

The top of the Today screen is a small cozy scene, not a separate game: one screen, one player, no levels, no way to fail. A single-file prototype was built first; it has since been retired in favour of `frontend/src/garden/`.

**Look:** an original 90s-arcade pixel style. The scene is drawn at 320×180 and scaled up with crisp pixels: outlined pixel sprites, a bright saturated palette, a 3×5 bitmap font, chiptune sounds and faint CRT scanlines. The rest of the app's pages use the same chunky arcade panels and buttons, with a pixel display font for headings and a readable terminal font for text.

- **Your dog** walks on the grass. The owner sets its name and coat colour when setting up the app. Move with ← → (or A / D), or tap where it should go.
- **Four dogs sit on a rainbow bridge** above the garden, each with a halo: **Kuro** (fluffy black spitz mix), **Attila** (black with a white belly), **Gladys** (golden retriever) and **Lucky** (cocker spaniel).
- **Every successful save drops a star:** an observation, a medicine given or refilled, or a weekly check-in. One of the four dogs hops and drops it, never the same dog twice in a row, and a line says who it was ("Gladys dropped a star for your check-in"). The first visit each day also drops a star. The very first star the app ever gives comes from Kuro.
- **Catching:** walk your dog under the star. Stars that land wait on the grass, so there's no rush. Caught stars go into a jar by the dog bed, with a soft chime (which can be muted).

**Rules that keep it honest:**

- **Stars reward logging, never results.** A bad check-in score earns the same star as a good one. Otherwise the app would teach owners to hide bad days, the opposite of what Kuro's archive shows is needed.
- **No star without a save.** The star drops only after the API confirms the save, so a failed save is visible rather than rewarded.
- **No streaks, no penalties, no nagging.** Missing a day costs nothing.

## How it maps onto Project 1

| Project 1 (site issue triage) | Canine Health Atlas MVP |
|---|---|
| **Log** an issue in plain language | **Log** an observation ("couldn't get up after a nap") |
| **Analyze** pre-fills category, severity, summary; never blocks save | **Analyze** pre-fills a category (mobility, eating, toileting, skin, behaviour, other) and a one-line summary, and offers "add to vet questions?"; never blocks save |
| Due dates from severity; overdue in red | Run-out date from quantity ÷ daily use; red within 7 days |
| List sorted by severity, then oldest | Medicines sorted by run-out date, soonest first |
| Resolve requires a note | Stopping a medicine requires a reason |
| CSV export | **Vet brief:** a printable page of current medicines, the last 4 weekly scores, recent observations and open questions |
| Store the AI suggestion beside the saved values | Same: AI and EDITED tags on observation fields |

## Screens (4)

1. **Today** (`/`): the star garden at the top, then a box to log an observation, with Analyze as an option. Below it, recent observations and medicines running out soon.
2. **Medicines** (`/meds`): add a medicine with name, kind (drug, supplement, herbal), dose, how many per day, quantity and date started, and the app works out the run-out date. Refilling resets it. Stopping one asks for a reason.
3. **Weekly check-in** (`/checkin`): seven 0–10 sliders on the HHHHHMM scale, plus "more good days than bad?" It shows the total out of 70 and a trend chart. The anchors come from the [os-kuro-archives README](https://github.com/nghuixin/os-kuro-archives#reading-the-quality-of-life-scores).
   - **Required:** the chart shows each item as well as the total. Kuro's total stayed "acceptable" while mobility and hygiene collapsed, so a total-only chart would repeat that blind spot.
4. **Vet brief** (`/brief`): one printable page, linked from the header.

Saving on the Medicines and Check-in screens shows the star drop as a small overlay of the bridge, then returns to the screen.

## Data model (4 tables)

| Table | Key fields |
|---|---|
| `dog` | name, coat, birth date, weight, `stars_caught`, `stars_waiting` (one row, set up on first run) |
| `observations` | text, category, summary, `for_vet` flag, `ai_suggestion` JSON, `edited_fields`, created_at |
| `medications` | name, kind, dose, `per_day`, quantity, `started_on`, `refilled_on`, `runs_out_on` (computed), `stopped_on`, `stop_reason` |
| `checkins` | week, 7 item scores, `good_days_outnumber_bad`, total (computed), note |

`stars_waiting` goes up by one on each successful save and on the first visit of the day; catching a star moves one from `stars_waiting` to `stars_caught` (`POST /api/stars/catch`). The four bridge dogs are fixed in the frontend, not stored.

## AI

- **Start like Project 1:** keyword rules, so the app works with no API key and CI needs no secrets.
- **Optional Claude adapter later,** behind the same contract.
- **Guardrails, enforced by server-side validation as in Project 1:** output has to be a category from the closed list plus a summary of 200 characters or fewer. No diagnosis, no "this means", no dosing. If either check fails, the app shows "suggestion unavailable".

## Seed data

- **Demo dog:** a synthetic dog whose medicines and scores follow Kuro's 2025 pattern, built from `data/processed/clinical/prescriptions.csv` and `data/quality_of_life/hhhhhmm_kuro.csv` in os-kuro-archives. A fresh clone shows a believable dashboard straight away, and the demo shows the problems the app was built for.
- **Kuro mode, as a second seed:** load Kuro's actual 2024–26 medicine list and scores and see how many run-outs the app would have flagged. That gives a ready-made "it would have helped" metric.

## Reused from Project 1 almost unchanged

- **Stack:** React + Vite → `openapi.yaml` → FastAPI + SQLAlchemy (SQLite locally, Postgres in Compose). The star garden is a `<canvas>` component with no extra libraries.
- **Packaging and pipeline:** one Docker image, dev and prod Compose stacks, `make test-all`, and the CI pipeline (tests → GHCR → dev → approved prod)
- **Observability:** `telemetry.py`, the observability stack, and the alert-to-agent poller. The alert becomes "failed saves on `POST /api/checkins` or `/api/observations`".
- **Agent pack:** `.agents/` (PM/SWE/QA), `docs/process.md`, `docs/permissions.md`

## Build order, following Project 1's frontend-first process

1. **Spec:** `docs/spec.md` and `docs/tasks.md`, plus GitHub issues with acceptance criteria, one per screen and one for the star garden.
2. **Frontend with a mock service:** the four screens, with data stored in the browser. Port the star garden prototype into a React component on Today.
3. **Contract:** extract `openapi.yaml` from the HTTP client.
4. **Backend and tests:**
   - endpoint CRUD
   - run-out arithmetic, including refill and stop
   - the stop-reason rule
   - the HHHHHMM total
   - an Analyze failure doesn't block save
   - a star is added on every successful save and never on a failed one; the star count doesn't depend on check-in scores
5. **Packaging:** Docker, Compose and integration tests (`make test-all`).
6. **Pipeline and deploy:** CI/CD, then EC2.
7. **Observability:** traces, logs, metrics and one alert.

## Success measures, using Kuro as the baseline

| Measure | Kuro (reconstructed) | MVP target |
|---|---|---|
| Medicines with a known run-out date | none | 100% |
| Weeks with a quality-of-life score | 0 | ≥ 80% of weeks in a 4-week pilot |
| Time to log an observation | — | ≤ 1 minute median |
| AI category saved unchanged | — | ≥ 70% |

## Out of scope

Lab PDF extraction and charts, uploading records, more than one dog, accounts, push or email reminders (run-out dates appear on screen only), care plans, decision logs, any diagnosis or interpretation, and anything that turns the star garden into a bigger game (levels, multiplayer, shops, streaks). The records features stay in the full Atlas spec as later steps.

## Open decisions

1. **Deployment and privacy:** Project 1 runs on a public URL with no login. That's fine for clinical-trial site issues, but not for a real dog's records. Recommendation: run the public deployment with **demo data only**, and run it locally for real use.
