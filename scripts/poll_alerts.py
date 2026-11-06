"""On-call trigger (spec §17): wake the on-call agent when RecordSaveFailing fires.

Every 30 s it reads firing alerts (Prometheus locally, or a Pub/Sub subscription fed by
Cloud Monitoring in production), handles each alert instance once, writes a content-free
incident brief, and starts `claude -p` in a fresh git worktree on branch oncall/<alert>-<time>.

The agent can edit code, run tests, push its own oncall/* branch and open a PR. It can never
deploy, merge or push to master: see .agents/oncall-settings.json and docs/permissions.md.

    python scripts/poll_alerts.py                 # poll forever (make oncall-watch)
    python scripts/poll_alerts.py --once --dry-run  # one pass; print the brief and command only
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".oncall" / "handled.json"
PROM = os.environ.get("PROM_URL", "http://localhost:9090")
LOKI = os.environ.get("LOKI_URL", "http://localhost:3100")
GRAFANA = os.environ.get("GRAFANA_URL", "http://localhost:3000")
SOURCE = os.environ.get("ONCALL_SOURCE", "prometheus")  # prometheus | pubsub
SUBSCRIPTION = os.environ.get("ONCALL_SUBSCRIPTION", "")  # projects/<p>/subscriptions/<s>
WATCHED = {"RecordSaveFailing"}

# Only these log fields may reach the brief (spec §9): no record content can leak through it.
LOG_FIELDS = ("time", "route", "method", "status", "record_type", "outcome", "error_type", "trace_id")


# ---------- Reading alerts ----------

def get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.load(r)


def firing_from_prometheus() -> list[dict]:
    data = get_json(f"{PROM}/api/v1/alerts")["data"]["alerts"]
    return [
        {"name": a["labels"]["alertname"], "labels": a["labels"], "started": a["activeAt"],
         "summary": a.get("annotations", {}).get("summary", "")}
        for a in data
        if a["state"] == "firing" and a["labels"].get("alertname") in WATCHED
    ]


def firing_from_pubsub() -> list[dict]:
    out = subprocess.run(
        ["gcloud", "pubsub", "subscriptions", "pull", SUBSCRIPTION, "--auto-ack", "--limit=10", "--format=json"],
        check=True, capture_output=True, text=True,
    ).stdout
    alerts = []
    for msg in json.loads(out or "[]"):
        import base64

        body = json.loads(base64.b64decode(msg["message"]["data"]))
        inc = body.get("incident", {})
        if inc.get("state") == "open" and inc.get("policy_name") in WATCHED:
            started = datetime.fromtimestamp(inc.get("started_at", time.time()), timezone.utc).isoformat()
            alerts.append({"name": inc["policy_name"], "labels": {"incident_id": inc.get("incident_id", "")},
                           "started": started, "summary": inc.get("summary", "")})
    return alerts


def alert_key(a: dict) -> str:
    return f"{a['name']}@{a['started']}"


def load_handled() -> set[str]:
    try:
        return set(json.loads(STATE.read_text()))
    except (FileNotFoundError, ValueError):
        return set()


def save_handled(keys: set[str]) -> None:
    STATE.parent.mkdir(exist_ok=True)
    STATE.write_text(json.dumps(sorted(keys)))


# ---------- Evidence ----------

def recent_errors_from_loki(limit: int = 5) -> list[dict]:
    end = datetime.now(timezone.utc)
    q = urllib.parse.urlencode({
        "query": '{service="api", severity="ERROR"}', "limit": limit, "direction": "backward",
        "start": int((end - timedelta(minutes=15)).timestamp() * 1e9), "end": int(end.timestamp() * 1e9),
    })
    lines = []
    for stream in get_json(f"{LOKI}/loki/api/v1/query_range?{q}")["data"]["result"]:
        for _, line in stream["values"]:
            lines.append(line)
    # Lines come grouped by stream; newest first across all of them.
    rows = sorted((safe_fields(line) for line in lines), key=lambda r: r.get("time", ""), reverse=True)
    return rows[:limit]


def recent_errors_from_cloud_logging(limit: int = 5) -> list[dict]:
    out = subprocess.run(
        ["gcloud", "logging", "read",
         'resource.type="cloud_run_revision" AND resource.labels.service_name="atlas-prod" AND jsonPayload.status>=500',
         f"--limit={limit}", "--freshness=15m", "--format=json(jsonPayload)"],
        check=True, capture_output=True, text=True,
    ).stdout
    return [safe_fields(json.dumps(e.get("jsonPayload", {}))) for e in json.loads(out or "[]")]


def safe_fields(line: str) -> dict:
    try:
        d = json.loads(line)
    except ValueError:
        return {}
    return {k: d[k] for k in LOG_FIELDS if k in d}


def trace_link(trace_id: str) -> str:
    left = json.dumps({"datasource": "tempo", "queries": [{"refId": "A", "queryType": "traceql", "query": trace_id}]})
    return f"{GRAFANA}/explore?orgId=1&left={urllib.parse.quote(left)}"


def brief(alert: dict, errors: list[dict]) -> str:
    rows = "\n".join(
        f"| {e.get('time', '')} | {e.get('method', '')} {e.get('route', '')} | {e.get('status', '')} "
        f"| {e.get('error_type', '')} | [{e.get('trace_id', '')}]({trace_link(e['trace_id']) if e.get('trace_id') else ''}) |"
        for e in errors
    ) or "| (no error lines found) | | | | |"
    labels = ", ".join(f"{k}={v}" for k, v in sorted(alert["labels"].items()))
    return f"""# Incident: {alert['name']}

- **Started:** {alert['started']}
- **Labels:** {labels}
- **Summary:** {alert['summary']}
- **Dashboard:** {GRAFANA}/d/atlas-saves
- **Immediate mitigation (owner only):** the `rollback` workflow. You must not run it.

## Last failing requests (content-free, spec §9)

| Time | Request | Status | Error type | Trace |
|---|---|---|---|---|
{rows}

## Your task

Follow `.agents/agents/oncall.md`. Find the root cause, reproduce it with a failing test, fix the
code, run `make test`, push this branch and open a PR. Never deploy, merge or push to master.
"""


# ---------- Waking the agent ----------

def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def start_agent(alert: dict, text: str, dry_run: bool) -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    branch = f"oncall/{slug(alert['name'])}-{stamp}"
    tree = ROOT.parent / f"{ROOT.name}-{branch.replace('/', '-')}"
    prompt = (
        "You are the on-call agent. Read .agents/agents/oncall.md and follow it exactly. "
        "The incident brief is in .oncall/brief.md."
    )
    cmd = ["claude", "-p", prompt, "--settings", str(ROOT / ".agents" / "oncall-settings.json"),
           "--append-system-prompt", (ROOT / ".agents" / "agents" / "oncall.md").read_text(encoding="utf-8"),
           "--max-turns", "60"]
    if dry_run:
        print(f"[dry-run] would create worktree {tree} on {branch}")
        print(f"[dry-run] would run: {' '.join(cmd[:2])} ... (in {tree})")
        print(text)
        return
    subprocess.run(["git", "-C", str(ROOT), "fetch", "origin", "master"], check=True)
    subprocess.run(["git", "-C", str(ROOT), "worktree", "add", "-b", branch, str(tree), "origin/master"], check=True)
    (tree / ".oncall").mkdir(exist_ok=True)
    (tree / ".oncall" / "brief.md").write_text(text, encoding="utf-8")
    log = (tree / ".oncall" / "agent.log").open("w", encoding="utf-8")
    print(f"waking the on-call agent in {tree} ({branch}); log: {log.name}", flush=True)
    subprocess.Popen(cmd, cwd=tree, stdout=log, stderr=subprocess.STDOUT)


def poll_once(dry_run: bool) -> int:
    handled = load_handled()
    alerts = firing_from_pubsub() if SOURCE == "pubsub" else firing_from_prometheus()
    new = [a for a in alerts if alert_key(a) not in handled]
    for a in new:
        try:
            errors = recent_errors_from_cloud_logging() if SOURCE == "pubsub" else recent_errors_from_loki()
        except Exception as e:  # evidence is best effort; the agent can still read logs itself
            print(f"could not read logs: {type(e).__name__}", file=sys.stderr)
            errors = []
        start_agent(a, brief(a, errors), dry_run)
        if not dry_run:
            handled.add(alert_key(a))
    if not dry_run:
        save_handled(handled)
    return len(new)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--once", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--interval", type=int, default=30)
    a = p.parse_args()
    if not a.dry_run and shutil.which("claude") is None:
        sys.exit("The `claude` CLI is not on PATH.")
    print(f"on-call poller: source={SOURCE}, watching {', '.join(sorted(WATCHED))}", flush=True)
    while True:
        try:
            n = poll_once(a.dry_run)
            if n:
                print(f"handled {n} new alert(s)", flush=True)
        except Exception as e:
            print(f"poll failed: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
        if a.once:
            return
        time.sleep(a.interval)


if __name__ == "__main__":
    main()
