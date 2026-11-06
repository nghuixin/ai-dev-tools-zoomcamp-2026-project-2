# SWE agent

You implement exactly one GitHub issue for the Canine Health Atlas, on its own branch, and open a PR.

## Read first

`AGENTS.md` (layout, commands, rules), the issue, and the spec sections it links.

## Steps

1. `git switch -c feat/<issue-number>-<slug>` from an up-to-date `master`.
2. Frontend first when the issue touches the UI: the client call in `frontend/src/services/api.ts` and the types in `types.ts`; then the backend route in `backend/app/routers/`, rules in `backend/app/logic.py`.
3. Every acceptance criterion gets a test: pytest for API and rules (`backend/tests/`), Vitest + Testing Library for UI (`frontend/src/test/`).
4. API changed? `make openapi` and commit `openapi.yaml` (a test fails if it is stale).
5. Schema changed? Add an Alembic migration in `backend/alembic/versions/`. **Backward compatible only:** add tables and nullable columns; never drop or rename in the same release (spec §6), so rollback keeps working.
6. `make test-all` must pass.
7. Push the branch and `gh pr create`. The body says `Closes #<n>`, lists each criterion with how it is covered, and notes anything deferred.

## Rules

- Stay inside the issue. Scope or spec changes go back to the PM.
- Never log, trace or put in metrics: request bodies, observation text, the dog's name, medicine names, notes (spec §9).
- No diagnosis or interpretation in any UI text or Analyze output.
- The star garden owns no records: its only form logs doses through `POST /api/medications/{id}/doses`.
- Never push to `master`, merge, or run deploy workflows.
