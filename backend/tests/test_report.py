from datetime import date, datetime, timezone

from conftest import CHECKIN

TODAY = date(2026, 11, 5)  # a Thursday in ISO week 2026-W45


def at(d: str) -> str:
    return datetime.fromisoformat(d).replace(tzinfo=timezone.utc).isoformat()


def report(client, **params):
    r = client.get("/api/report", params={"today": str(TODAY)} | params)
    assert r.status_code == 200, r.text
    return r.json()


def test_empty_report_has_every_section(client, dog):
    r = report(client)
    assert r["period"] == {"from": "2026-10-07", "to": "2026-11-05", "basis": "last_30_days", "last_visit": None}
    assert r["current_medications"] == [] and r["medication_changes"] == []
    assert r["weight"] is None and r["quality_of_life"] is None
    assert r["observations"] == [] and r["questions"] == []
    assert r["footer"] == "Owner-recorded. Not a diagnosis."


def test_period_defaults_to_last_vet_visit(client, dog):
    client.post("/api/vet-visits", json={"visited_on": "2026-10-20", "clinic": "Harbour Vets", "reason": "Recheck"})
    client.post("/api/vet-visits", json={"visited_on": "2026-12-01", "clinic": "Future booking"})
    r = report(client)
    assert r["period"]["from"] == "2026-10-20" and r["period"]["basis"] == "since_last_visit"
    assert report(client, basis="last_30_days")["period"]["from"] == "2026-10-07"
    custom = report(client, **{"from": "2026-11-01", "to": "2026-11-03"})["period"]
    assert (custom["from"], custom["to"], custom["basis"]) == ("2026-11-01", "2026-11-03", "custom")


def test_bad_custom_period(client, dog):
    r = client.get("/api/report", params={"from": "2026-11-05", "to": "2026-11-01"})
    assert r.status_code == 422


def test_full_report(client, dog):
    period = {"from": "2026-11-01", "to": "2026-11-05"}
    # Medicines: one started before, one started in the period, one stopped in the period
    a = client.post("/api/medications", json=dict(name="Carprofen", kind="DRUG", dose="1 tablet", per_day=2,
                                                  quantity=60, started_on="2026-10-01")).json()
    client.post("/api/medications", json=dict(name="Fish oil", kind="SUPPLEMENT", dose="1 capsule", per_day=1,
                                              quantity=30, started_on="2026-11-03"))
    c = client.post("/api/medications", json=dict(name="Gabapentin", kind="DRUG", dose="100 mg", per_day=1,
                                                  quantity=30, started_on="2026-10-01")).json()
    client.post(f"/api/medications/{c['id']}/stop", json={"reason": "Vet advised", "stopped_on": "2026-11-02"})
    for d in ("2026-10-31T08:00:00", "2026-11-01T08:00:00", "2026-11-01T20:00:00", "2026-11-04T08:00:00"):
        client.post(f"/api/medications/{a['id']}/doses", json={"given_at": at(d)})
    # Weight, check-ins, observations
    for d, kg in (("2026-10-25", 21.0), ("2026-11-01", 20.0), ("2026-11-05", 19.5)):
        client.post("/api/weights", json={"measured_on": d, "kg": kg})
    client.put("/api/checkins/2026-W44", json=CHECKIN)  # Mon 26 Oct - Sun 1 Nov: overlaps
    client.put("/api/checkins/2026-W45", json=CHECKIN | {"mobility": 2, "hygiene": 3})
    client.post("/api/observations", json={"text": "Slow on stairs", "category": "MOBILITY",
                                           "observed_at": at("2026-11-02T09:00:00")})
    client.post("/api/observations", json={"text": "Ask about stiffness?", "category": "MOBILITY", "for_vet": True,
                                           "observed_at": at("2026-11-03T09:00:00")})
    client.post("/api/observations", json={"text": "Off food", "category": "APPETITE",
                                           "observed_at": at("2026-11-04T09:00:00")})
    client.post("/api/observations", json={"text": "Before period", "observed_at": at("2026-10-20T09:00:00")})

    r = report(client, **period)

    meds = {m["name"]: m for m in r["current_medications"]}
    assert set(meds) == {"Carprofen", "Fish oil"}
    assert (meds["Carprofen"]["doses_given"], meds["Carprofen"]["doses_expected"]) == (3, 10)
    assert (meds["Fish oil"]["doses_given"], meds["Fish oil"]["doses_expected"]) == (0, 3)
    assert [(x["name"], x["change"], x["reason"]) for x in r["medication_changes"]] == [
        ("Gabapentin", "STOPPED", "Vet advised"), ("Fish oil", "STARTED", None)]

    assert (r["weight"]["first"]["kg"], r["weight"]["last"]["kg"]) == (20.0, 19.5)
    assert (r["weight"]["change_kg"], r["weight"]["change_pct"]) == (-0.5, -2.5)

    qol = r["quality_of_life"]
    assert qol["first"]["iso_week"] == "2026-W44" and qol["latest"]["iso_week"] == "2026-W45"
    assert qol["change"]["mobility"] == -3 and qol["change"]["hygiene"] == -3 and qol["change"]["total"] == -6

    groups = {g["category"]: g for g in r["observations"]}
    assert [g["category"] for g in r["observations"]] == ["MOBILITY", "APPETITE"]
    assert groups["MOBILITY"]["count"] == 2
    assert [q["text"] for q in r["questions"]] == ["Ask about stiffness?"]


def test_timezone_offset_moves_day_boundaries(client, dog):
    # 23:30 UTC on 1 Nov is 2 Nov in Singapore (UTC+8, getTimezoneOffset() = -480)
    client.post("/api/observations", json={"text": "late", "observed_at": at("2026-11-01T23:30:00")})
    utc = report(client, **{"from": "2026-11-02", "to": "2026-11-02"})
    sg = report(client, **{"from": "2026-11-02", "to": "2026-11-02", "tz_offset": -480})
    assert utc["observations"] == [] and sg["observations"][0]["count"] == 1
