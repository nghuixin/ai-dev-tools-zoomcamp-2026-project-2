"""Full journeys over real HTTP against the Compose stack (API + Postgres), spec §11.

    make test-integration                 # against a running stack (ATLAS_URL, default :8000)
    make test-all                         # starts a throwaway stack, runs everything, tears it down
"""

import os
import subprocess
import time
from datetime import date, datetime, timedelta, timezone

import httpx
import pytest

pytestmark = pytest.mark.integration

BASE = os.environ.get("ATLAS_URL", "http://localhost:8000")
COMPOSE = os.environ.get("ATLAS_COMPOSE", "")  # e.g. "docker compose -p atlas-test"; enables the restart test
TODAY = date.today()
CHECKIN = dict(hurt=7, hunger=8, hydration=8, hygiene=6, happiness=9, mobility=5, more_good_days=7)


@pytest.fixture(scope="module")
def api():
    with httpx.Client(base_url=BASE, timeout=10) as c:
        wait_healthy(c)
        yield c


def wait_healthy(c: httpx.Client, seconds: int = 60) -> None:
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            if c.get("/healthz").status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(1)
    pytest.fail(f"{BASE}/healthz never became healthy")


def test_ui_and_api_share_one_origin(api):
    assert "<div id=\"root\">" in api.get("/").text
    assert "<div id=\"root\">" in api.get("/report").text  # client-side route
    r = api.get("/api/nope")
    assert r.status_code == 404 and "error" in r.json()


def test_log_records_then_report_shows_them(api):
    assert api.put("/api/dog", json={"name": "Integration Dog", "coat": "tri"}).status_code == 200
    before = api.get("/api/stars").json()["stars_waiting"]

    m = api.post("/api/medications", json=dict(name="Integration med", kind="SUPPLEMENT", dose="1 chew",
                                              per_day=1, quantity=3, started_on=str(TODAY))).json()
    assert m["runs_out_soon"] is True
    given = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    assert api.post(f"/api/medications/{m['id']}/doses", json={"given_at": given}).status_code == 201
    assert api.post("/api/observations", json={"text": "Integration: slow on stairs", "category": "MOBILITY",
                                               "for_vet": True}).status_code == 201
    assert api.post("/api/weights", json={"measured_on": str(TODAY), "kg": 21.5}).status_code == 201
    week = f"{TODAY.isocalendar()[0]}-W{TODAY.isocalendar()[1]:02d}"
    assert api.put(f"/api/checkins/{week}", json=CHECKIN).status_code in (200, 201)
    assert api.get("/api/stars").json()["stars_waiting"] == before + 4

    r = api.get("/api/report", params={"basis": "last_30_days"}).json()
    meds = {x["name"]: x for x in r["current_medications"]}
    assert meds["Integration med"]["doses_given"] >= 1
    assert any(q["text"] == "Integration: slow on stairs" for q in r["questions"])
    assert r["weight"] is not None and r["quality_of_life"] is not None
    assert r["footer"] == "Owner-recorded. Not a diagnosis."


def test_errors_are_json_and_add_no_star(api):
    before = api.get("/api/stars").json()["stars_waiting"]
    r = api.post("/api/weights", json={"measured_on": str(TODAY), "kg": 500})
    assert r.status_code == 422 and "error" in r.json()
    assert api.get("/api/stars").json()["stars_waiting"] == before


@pytest.mark.skipif(not COMPOSE, reason="set ATLAS_COMPOSE to let the test restart the API container")
def test_data_survives_api_restart(api):
    api.post("/api/observations", json={"text": "survives restart marker"})
    subprocess.run([*COMPOSE.split(), "restart", "api"], check=True, capture_output=True)
    wait_healthy(api)
    texts = [o["text"] for o in api.get("/api/observations").json()]
    assert "survives restart marker" in texts
