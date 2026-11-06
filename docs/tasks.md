# Decision log

What was chosen, what was deferred, and why. Newest first. The PM agent adds to this when scope changes.

| Date | Decision | Why | Deferred / rejected |
|---|---|---|---|
| 2026-11-05 | Production metrics come from a **log-based metric** on the JSON request logs, not an OpenTelemetry metrics exporter | Cloud Run can't be scraped by Prometheus without a sidecar; the request log already carries `record_type` and `outcome`, so one source feeds both the alert and the dashboard, and it is content-free by construction | OTel metrics exporter to Cloud Monitoring |
| 2026-11-05 | The API contract is **generated from the backend** (`make openapi`) and a test fails when `openapi.yaml` is stale; the UI was built first against `services/api.ts`, and tests use a scripted fetch rather than a full mock backend | One source of truth that can't drift; a mock backend would duplicate the report logic | Hand-written OpenAPI; an in-browser mock service |
| 2026-11-05 | Added `POST /api/stars/visit` (daily visit star) and `GET /api/doses` (garden's recent doses) | A GET with side effects would be wrong for the visit star; the garden must show recent doses so double doses are visible | — |
| 2026-11-05 | The report takes the owner's `today` and `tz_offset` | Day boundaries and "today" must be in the owner's time zone, not the server's (found by the integration test) | Storing a time zone on the dog |
| 2026-11-05 | Adding a medicine is setup, not a log: it earns no star. Stars come from observations, doses, weights and check-ins | Matches spec §5.7; stops stars being farmed by creating medicines | — |
| 2026-11-05 | Analyze is keyword rules only; the summary restates the owner's first sentence | Runs with no API key, CI needs no secrets, and it can't interpret (spec §8) | Claude adapter behind the same contract (spec §23) |
| 2026-11-05 | The star garden logs **medicine and supplement doses only** | The game stays fun and quick; observations, weight and check-ins belong on the clinical pages | Logging other record types from the garden |
| 2026-11-05 | Deploy on **Google Cloud Run + Neon**, dev automatic and production approved, rollback by moving traffic between revisions | Scale to zero and free tiers; revisions make rollback instant; Neon branches give dev and prod databases | AWS EC2 (more to operate) |
| 2026-11-05 | The on-call agent opens a PR and **never deploys** | A human approves every production change; rollback is the fast mitigation | Agent-run rollbacks |
| 2026-11-05 | Public deployment holds **demo data only** | There is no login in the MVP | Accounts and auth |
| 2026-11-05 | Two layers: a clinical record plus an optional arcade "star garden" | The vet needs a sober record; the owner needs a reason to log daily | Making the whole app game-styled |
