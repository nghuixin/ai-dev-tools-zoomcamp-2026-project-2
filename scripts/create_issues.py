"""Creates the public task tracker from the spec (spec §5, §18): one GitHub issue per feature
with its acceptance criteria, plus the infrastructure and operations work, with labels and
milestones. Dry run by default.

    python scripts/create_issues.py            # print what would be created
    python scripts/create_issues.py --create   # create labels, milestones and issues with `gh`
"""

import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = (ROOT / "docs" / "spec.md").read_text(encoding="utf-8")

LABELS = {
    "feature": ("1d76db", "User-facing feature from spec §5"),
    "infra": ("5319e7", "Packaging, CI/CD, deployment"),
    "ops": ("0e8a16", "Observability, alerting, on-call"),
    "bug": ("d73a4a", "Something is broken"),
}
M_APP, M_PACK, M_DEPLOY, M_OBS, M_ONCALL = (
    "Phase 1-2: App", "Phase 3: Packaging and tests", "Phase 4: Deployment and CI/CD",
    "Phase 5: Observability and alerting", "Phase 6: On-call agent and docs",
)

OPS_ISSUES = [
    ("Containers, Compose and one-command test run", "infra", M_PACK, "§11, §12", [
        "One multi-stage Dockerfile: Node builds the UI, a Python image serves API and UI",
        "`make up` runs API + UI + Postgres on http://localhost:8000",
        "Integration tests run over HTTP against Compose (Postgres), incl. data surviving an API restart",
        "`make test-all` starts Compose, runs unit, frontend and integration tests, then tears down",
    ]),
    ("Deploy to Google Cloud Run with Neon", "infra", M_DEPLOY, "§13", [
        "`atlas-dev` and `atlas-prod` on Cloud Run, Neon branches `dev` and `main`",
        "Database URLs in Secret Manager; GitHub authenticates with Workload Identity Federation (no keys)",
        "Migrations run against the target branch before a revision gets traffic",
        "Setup steps documented in docs/deployment.md",
    ]),
    ("CI/CD with manual production approval and rollback", "infra", M_DEPLOY, "§14", [
        "Every PR and push: backend, frontend, Compose validation, `make test-all`",
        "`master`: build once, deploy to dev automatically, health-check",
        "Production waits for the owner's approval, deploys a no-traffic candidate, health-checks it, then moves traffic",
        "A manual `rollback` workflow moves traffic to the previous (or a named) revision",
    ]),
    ("Traces, metrics and logs sharing a trace ID", "ops", M_OBS, "§9, §15", [
        "OpenTelemetry traces for requests and SQL; Tempo locally, Cloud Trace in production",
        "`atlas_record_saves_total{type, outcome}` and request-duration metrics",
        "JSON request logs with trace_id; Loki locally, Cloud Logging in production",
        "No record content in any signal, checked by a test",
        "Grafana dashboard: saves by type and outcome, error rate, p95 of saves and the report",
    ]),
    ("Alert on failing record saves", "ops", M_OBS, "§16", [
        "`RecordSaveFailing`: more than 5% of saves 5xx over 2m, sustained 1m (Prometheus and Cloud Monitoring)",
        "`make alert-demo` makes it fire with FAULT_SAVE_500_RATE",
        "No CPU or memory alerts",
    ]),
    ("On-call agent that opens a fix PR but never deploys", "ops", M_ONCALL, "§17", [
        "Poller wakes the agent once per alert instance, with a content-free brief",
        "Agent works in a new worktree on `oncall/<alert>-<time>`, adds a failing test, fixes, opens a PR",
        "Agent cannot push to master, merge, approve, deploy or roll back (tool permissions + branch protection)",
        "Demo: DEMO_BUG=checkin_total; the PR fixes the code, not the flag",
    ]),
]


def spec_features() -> list[tuple[str, str, str, str, list[str]]]:
    section5 = SPEC.split("## 5.", 1)[1].split("\n## 6.", 1)[0]
    out = []
    for block in re.split(r"\n### ", section5)[1:]:
        heading, body = block.split("\n", 1)
        num, title = heading.split(" ", 1)
        items = [re.sub(r"^- \[ \] ", "", ln).strip() for ln in body.splitlines() if ln.startswith("- [ ]")]
        out.append((title.strip(), "feature", M_APP, f"§{num}", items))
    return out


def body(ref: str, items: list[str]) -> str:
    checks = "\n".join(f"- [ ] {i}" for i in items)
    return (f"From [docs/spec.md]({'../blob/master/docs/spec.md'}) {ref}.\n\n## Acceptance criteria\n\n{checks}\n\n"
            "QA checks each item and comments PASS or FAIL on the PR that closes this issue.")


def gh(*args: str) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True, cwd=ROOT).stdout


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--create", action="store_true")
    a = p.parse_args()
    issues = spec_features() + OPS_ISSUES
    if not a.create:
        for title, label, milestone, ref, items in issues:
            print(f"[{label}] [{milestone}] {title} ({ref}, {len(items)} criteria)")
        print(f"\n{len(issues)} issues. Run with --create to create them on GitHub.")
        return

    for name, (color, desc) in LABELS.items():
        gh("label", "create", name, "--color", color, "--description", desc, "--force")
    existing = {m["title"] for m in json.loads(gh("api", "repos/{owner}/{repo}/milestones?state=all"))}
    for m in (M_APP, M_PACK, M_DEPLOY, M_OBS, M_ONCALL):
        if m not in existing:
            gh("api", "repos/{owner}/{repo}/milestones", "-f", f"title={m}")
    open_titles = {i["title"] for i in json.loads(gh("issue", "list", "--state", "all", "--limit", "200", "--json", "title"))}
    for title, label, milestone, ref, items in issues:
        if title in open_titles:
            print(f"exists: {title}")
            continue
        url = gh("issue", "create", "--title", title, "--body", body(ref, items), "--label", label,
                 "--milestone", milestone).strip()
        print(f"created: {url}")


if __name__ == "__main__":
    main()
