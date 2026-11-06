# Agent permissions

What each agent may touch (spec §18). The rule behind all of them: **agents prepare changes; the owner merges and approves deploys.**

| Agent | May | May not | Enforced by |
|---|---|---|---|
| **PM** | Read the repo; create and edit GitHub Issues (`gh issue create/edit`); edit `docs/spec.md` and `docs/tasks.md` | Write code, push, merge | Role instructions; PRs need the owner |
| **SWE** | Edit code and tests on a feature branch; run `make test`, `make test-all`; regenerate `openapi.yaml`; push its branch; `gh pr create` | Change the spec or scope without the PM; push to `master`; merge; deploy | Role instructions; branch protection on `master` |
| **QA** | Check out a PR; run `make test-all`; check each acceptance criterion; comment PASS / FAIL on the PR | Edit code; approve or merge | Role instructions; owner merges |
| **On-call** | Read code, logs and traces; edit `backend/**` and `frontend/src/**`; run `make test`; commit; push **its own `oncall/*` branch**; `gh pr create` | Push to `master`; merge; approve; run the deploy or rollback workflows; touch CI, Docker, `ops/`, `.agents/`, secrets or infrastructure; run `gcloud` or `docker`; delete data | `.agents/oncall-settings.json` (tool allow and deny lists); branch protection on `master`; the `production` environment's required reviewer |

## The on-call agent's guardrails, in layers

1. **Tool permissions.** The poller starts the agent with `claude -p --settings .agents/oncall-settings.json`. In non-interactive mode anything not on the allow list is refused, and the deny list names the dangerous commands explicitly: `gcloud`, `docker`, `gh workflow`, `gh run`, `gh pr merge`, `gh pr review`, `gh api`, `git push origin master`, force pushes, `git merge`, and edits to `.github/`, `ops/`, `.agents/`, `Dockerfile`, `docker-compose.yml` and `Makefile`. Its only allowed pushes are `git push origin oncall/…`.
2. **Its own worktree and branch.** It works in a fresh `git worktree` on `oncall/<alert>-<time>`, never in your checkout.
3. **Branch protection on `master`** (docs/deployment.md §6): nothing reaches `master` without a pull request and green checks, whoever pushes.
4. **Deploys need you.** Merging to `master` only deploys to dev. Production waits for your approval on the `production` environment; so does `rollback`.
5. **No cloud credentials.** The agent runs on your machine without GCP credentials in its allowed commands; GitHub Actions authenticates through Workload Identity Federation only inside the workflows.

`backend/tests/test_oncall.py` checks the settings file keeps these rules (no `gcloud`, merge, workflow or `master` pushes allowed; pushes only to `oncall/`).

## Secrets

No credentials live in the repository. Production database URLs are in Google Secret Manager (`DATABASE_URL_DEV`, `DATABASE_URL_PROD`); the Compose Postgres password is a local-only default.
