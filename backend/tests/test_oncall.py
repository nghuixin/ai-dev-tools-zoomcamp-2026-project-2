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
    monkeypatch.setattr(poll, "start_agent", lambda a, text, dry: started.append(a["name"]))
    assert poll.poll_once(dry_run=False) == 1
    assert poll.poll_once(dry_run=False) == 0
    assert started == ["RecordSaveFailing"]


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


def test_checkin_with_a_zero_score_saves_on_the_demo_bug_path(make_client):
    # Regression for RecordSaveFailing: PUT /api/checkins/{iso_week} returned 500 (ZeroDivisionError)
    # whenever an item was scored 0, because the weighted total divided by each item.
    c = make_client(demo_bug="checkin_total")
    c.put("/api/dog", json={"name": "Mochi"})
    scores = [k for k in CHECKIN if k != "note"]
    one_zero = {**CHECKIN, scores[0]: 0}
    r = c.put("/api/checkins/2026-W47", json=one_zero)
    assert r.status_code in (200, 201)
    assert r.json()["total"] == sum(one_zero[k] for k in scores)
    all_zero = {**CHECKIN, **{k: 0 for k in scores}}
    r = c.put("/api/checkins/2026-W48", json=all_zero)
    assert r.status_code in (200, 201)
    assert r.json()["total"] == 0
