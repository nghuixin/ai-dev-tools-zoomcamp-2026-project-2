# Process

How work moves from a request to production (spec §18). The task tracker is **GitHub Issues** on this repository: labels `feature`, `infra`, `ops`, `bug`; one milestone per build phase.

## Feature loop: PM → SWE → QA → owner

```
request ─► PM: issue with acceptance criteria (scoped against docs/spec.md)
              │
              ▼
          SWE: branch feat/<issue>-<slug> ─► code + tests ─► make test-all ─► PR "Closes #n"
              │
              ▼
          QA: make test-all + every acceptance criterion ─► PR comment PASS / FAIL
              │ FAIL: back to SWE with the repro
              ▼ PASS
          owner merges ─► deploy-dev (auto) ─► owner approves ─► deploy-prod
```

1. **PM** (`.agents/agents/pm.md`) turns a request into one issue: user-facing goal, acceptance criteria as a checklist, label and milestone. If the request isn't in the spec, the PM updates `docs/spec.md` (and records the decision in `docs/tasks.md`) or says it is out of scope.
2. **SWE** (`.agents/agents/swe.md`) implements exactly one issue on a branch, keeps `openapi.yaml` in sync (`make openapi`), runs `make test-all`, and opens a PR whose body says `Closes #n` and ticks the criteria it meets.
3. **QA** (`.agents/agents/qa-engineer.md`) runs `make test-all`, checks every criterion (by test or by hand) and comments a verdict on the PR: `QA: PASS` or `QA: FAIL` with steps to reproduce.
4. **Owner** merges. CI deploys to dev automatically; production waits for the owner's approval.

## On-call loop

```
RecordSaveFailing fires ─► poller (make oncall-watch) ─► brief ─► on-call agent in a new worktree
   ─► failing test ─► fix ─► make test ─► push oncall/<alert>-<time> ─► PR (links the alert)
   ─► owner reviews (rollback first if needed) ─► merge ─► normal pipeline
```

Details: docs/observability.md (runbook and demo) and docs/permissions.md (what the agent can't do).

## Evidence that the process was used

- Every PR links its issue (`Closes #n`).
- QA verdicts are PR comments.
- On-call PRs name the alert and include the trace IDs from the brief.
- `docs/tasks.md` logs each decision: what was chosen, what was deferred, and why.

## Creating the issues

`scripts/create_issues.py` turns spec §5 (one issue per feature, with its checklist) and the infrastructure phases into GitHub Issues with labels and milestones. Run it once, after reviewing its dry run:

```bash
cd backend && uv run python ../scripts/create_issues.py            # dry run: prints what it would create
cd backend && uv run python ../scripts/create_issues.py --create   # creates them on GitHub
```
