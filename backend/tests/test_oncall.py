"""The on-call trigger (spec §17): briefs carry no record content; each alert is handled once;
the agent's settings cannot deploy, merge or push to master."""

import importlib.util
import json
from pathlib import Path

from conftest import CHECKIN

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("poll_alerts", ROOT / "scripts" / "poll_alerts.py")
poll = importlib.util.module_from_spec(spec)
spec.loader.exec_module(poll)

ALERT = {"name": "RecordSaveFailing", "labels": {"alertname": "RecordSaveFailing", "severity": "page"},
         "started": "2026-11-05T10:00:00Z", "summary": "More than 5% of record saves are failing"}


def test_brief_keeps_only_safe_log_fields():
    line = json.dumps({"time": "t", "route": "/api/observations", "method": "POST", "status": 500,
                       "error_type": "ZeroDivisionError", "trace_id": "ab" * 16,
                       "text": "PRIVATE owner words", "name": "PRIVATE dog"})
    fields = poll.safe_fields(line)
    assert "PRIVATE" not in json.dumps(fields)
    text = poll.brief(ALERT, [fields])
    assert "RecordSaveFailing" in text and "ab" * 16 in text and "ZeroDivisionError" in text
    assert "PRIVATE" not in text


def test_each_alert_instance_handled_once(tmp_path, monkeypatch):
    monkeypatch.setattr(poll, "STATE", tmp_path / "handled.json")
    monkeypatch.setattr(poll, "firing_from_prometheus", lambda: [ALERT])
    monkeypatch.setattr(poll, "recent_errors_from_loki", lambda: [])
    started = []
    def fake_start(a, text, dry, on_worktree):
        started.append(a["name"])
        on_worktree()

    monkeypatch.setattr(poll, "start_agent", fake_start)
    assert poll.poll_once(dry_run=False) == 1
    assert poll.poll_once(dry_run=False) == 0
    assert started == ["RecordSaveFailing"]


def test_alert_stays_handled_when_the_agent_fails_to_start(tmp_path, monkeypatch):
    # The worktree exists, then starting the agent fails: the next poll must not make another worktree.
    monkeypatch.setattr(poll, "STATE", tmp_path / "handled.json")
    monkeypatch.setattr(poll, "firing_from_prometheus", lambda: [ALERT])
    monkeypatch.setattr(poll, "recent_errors_from_loki", lambda: [])
    worktrees = []

    def failing_start(a, text, dry, on_worktree):
        worktrees.append(a["name"])
        on_worktree()
        raise FileNotFoundError("claude")

    monkeypatch.setattr(poll, "start_agent", failing_start)
    try:
        poll.poll_once(dry_run=False)
    except FileNotFoundError:
        pass
    assert poll.poll_once(dry_run=False) == 0
    assert worktrees == ["RecordSaveFailing"]


def test_evidence_endpoints_follow_moved_ports(monkeypatch):
    monkeypatch.setattr(poll, "LOKI", "http://localhost:3102")
    monkeypatch.setattr(poll, "TEMPO", "http://localhost:3202")
    monkeypatch.setattr(poll, "PROM", "http://localhost:9092")
    allow = poll.agent_settings()["permissions"]["allow"]
    curls = [r for r in allow if r.startswith("Bash(curl")]
    assert curls and not any(p in r for r in curls for p in (":3100/", ":3200/", ":9090/"))
    assert any("localhost:3102/" in r for r in curls) and any("localhost:9092/" in r for r in curls)
    assert 'Bash(curl -s "http://localhost:3102/*)' in allow  # Loki queries are quoted
    text = poll.brief(ALERT, [])
    assert "npm --prefix frontend ci" in text
    assert "http://localhost:3102" in text and "http://localhost:3202" in text and "http://localhost:9092" in text


def test_edit_rules_are_pinned_to_the_worktree(tmp_path):
    # Relative rules follow the agent's working directory; after `cd backend` they stop matching.
    s = poll.agent_settings(tmp_path)["permissions"]
    root = poll.absolute_rule_root(tmp_path)
    assert root.startswith("//") and ":" not in root
    assert f"Edit({root}/backend/**)" in s["allow"] and "Edit(backend/**)" in s["allow"]
    assert f"Edit({root}/.github/**)" in s["deny"] and f"Edit({root}/backend/**)" not in s["deny"]


def test_absolute_rule_root_on_windows_and_posix():
    assert poll.absolute_rule_root(Path("C:/work/tree")).endswith("/work/tree")
    if Path("C:/work/tree").resolve().as_posix().startswith("C:"):
        assert poll.absolute_rule_root(Path("C:/work/tree")) == "//c/work/tree"


def test_branch_and_url_rules_use_wildcards():
    # `:*` only matches at a word boundary, so `oncall/:*` never matched `oncall/<alert>-<time>`
    # and `localhost:3100/:*` never matched a real URL. `/*` does.
    s = json.loads((ROOT / ".agents" / "oncall-settings.json").read_text())
    allow, deny = s["permissions"]["allow"], s["permissions"]["deny"]
    assert not any(r.endswith("/:*)") for r in allow)
    assert "Bash(git push -u origin oncall/*)" in allow
    assert all(r.endswith("/*)") for r in allow if r.startswith("Bash(curl"))
    # A wildcard branch rule must not let a push name master or main as well.
    assert "Bash(git push *master*)" in deny and "Bash(git push *main*)" in deny


def test_agent_settings_use_edit_rules_only():
    # The CLI ignores Write(path) rules; Edit(path) covers every file-writing tool.
    s = json.loads((ROOT / ".agents" / "oncall-settings.json").read_text())
    rules = s["permissions"]["allow"] + s["permissions"]["deny"]
    assert not any(r.startswith("Write(") for r in rules)
    assert "Edit(docs/incidents/**)" in s["permissions"]["allow"]
    assert "Edit(.github/**)" in s["permissions"]["deny"]


def test_agent_settings_forbid_deploying_merging_and_master():
    s = json.loads((ROOT / ".agents" / "oncall-settings.json").read_text())
    allow, deny = s["permissions"]["allow"], s["permissions"]["deny"]
    for forbidden in ("Bash(gcloud:*)", "Bash(gh pr merge:*)", "Bash(gh workflow:*)", "Bash(git push origin master:*)"):
        assert forbidden in deny
    pushes = [a for a in allow if "git push" in a]
    assert pushes and all("oncall/" in a for a in pushes)
    assert not any(a.startswith(("Bash(gcloud", "Bash(docker", "Bash(gh workflow", "Bash(gh pr merge")) for a in allow)


def test_demo_bug_path_matches_the_plain_total_for_non_zero_scores(make_client):
    # The planted bug (DEMO_BUG=checkin_total) only shows on a 0 score; the on-call agent finds it from
    # the alert and adds the regression test. This test holds both before and after that fix.
    c = make_client(demo_bug="checkin_total")
    c.put("/api/dog", json={"name": "Mochi"})
    assert c.put("/api/checkins/2026-W45", json=CHECKIN).json()["total"] == 50
