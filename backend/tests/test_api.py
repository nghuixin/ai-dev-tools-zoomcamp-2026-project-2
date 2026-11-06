from datetime import date, datetime, timedelta, timezone

from conftest import CHECKIN, stars

TODAY = date.today()


def med(client, **kw):
    body = dict(name="Carprofen 50 mg", kind="DRUG", dose="1 tablet", per_day=2, quantity=20,
                started_on=str(TODAY)) | kw
    r = client.post("/api/medications", json=body)
    assert r.status_code == 201, r.text
    return r.json()


class TestDog:
    def test_first_run_has_no_profile(self, client):
        r = client.get("/api/dog")
        assert r.status_code == 404
        assert r.json() == {"error": "No dog profile yet"}

    def test_create_then_edit_keeps_one_dog(self, client, dog):
        r = client.put("/api/dog", json={"name": "Mochi", "coat": "red"})
        assert r.json()["coat"] == "red"
        assert client.get("/api/dog").json()["coat"] == "red"

    def test_records_need_a_profile(self, client):
        r = client.post("/api/weights", json={"measured_on": str(TODAY), "kg": 20})
        assert r.status_code == 409

    def test_errors_are_json_with_error_key(self, client):
        r = client.put("/api/dog", json={"name": ""})
        assert r.status_code == 422
        assert set(r.json()) == {"error"}


class TestObservations:
    def test_create_and_filter(self, client, dog):
        client.post("/api/observations", json={"text": "Slow on the stairs", "category": "MOBILITY"})
        client.post("/api/observations", json={"text": "Ate well", "category": "APPETITE", "for_vet": True})
        assert len(client.get("/api/observations").json()) == 2
        only = client.get("/api/observations", params={"category": "APPETITE"}).json()
        assert [o["text"] for o in only] == ["Ate well"]
        assert only[0]["for_vet"] is True

    def test_date_filter(self, client, dog):
        old = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
        client.post("/api/observations", json={"text": "old", "observed_at": old})
        client.post("/api/observations", json={"text": "new"})
        r = client.get("/api/observations", params={"from": str(TODAY - timedelta(days=2))}).json()
        assert [o["text"] for o in r] == ["new"]

    def test_text_required_and_capped(self, client, dog):
        assert client.post("/api/observations", json={"text": "   "}).status_code == 422
        assert client.post("/api/observations", json={"text": "x" * 2001}).status_code == 422

    def test_category_closed_list(self, client, dog):
        assert client.post("/api/observations", json={"text": "x", "category": "PAIN"}).status_code == 422

    def test_ai_suggestion_stored_and_edits_tracked(self, client, dog):
        sug = client.post("/api/observations/analyze", json={"text": "Limping on the back leg"}).json()
        assert sug["category"] == "MOBILITY"
        r = client.post("/api/observations", json={
            "text": "Limping on the back leg", "category": "MOBILITY", "summary": sug["summary"],
            "ai_suggestion": sug,
        }).json()
        assert r["ai_suggestion"] == sug and r["edited_fields"] is None
        r = client.patch(f"/api/observations/{r['id']}", json={"category": "OTHER"}).json()
        assert r["edited_fields"] == ["category"]
        assert r["ai_suggestion"]["category"] == "MOBILITY"


class TestMedicines:
    def test_runs_out_on(self, client, dog):
        m = med(client, quantity=20, per_day=2)
        assert m["runs_out_on"] == str(TODAY + timedelta(days=10))
        assert m["active"] and not m["runs_out_soon"]

    def test_soon_and_sorted(self, client, dog):
        med(client, name="Later", quantity=100, per_day=1)
        med(client, name="Soon", quantity=3, per_day=1)
        meds = client.get("/api/medications").json()
        assert [m["name"] for m in meds] == ["Soon", "Later"]
        assert meds[0]["runs_out_soon"] is True

    def test_refill_resets(self, client, dog):
        m = med(client, quantity=2, per_day=1, started_on=str(TODAY - timedelta(days=30)))
        r = client.post(f"/api/medications/{m['id']}/refill", json={"quantity": 60}).json()
        assert r["refilled_on"] == str(TODAY) and r["runs_out_on"] == str(TODAY + timedelta(days=60))

    def test_stop_requires_reason(self, client, dog):
        m = med(client)
        assert client.post(f"/api/medications/{m['id']}/stop", json={"reason": " "}).status_code == 422
        assert client.post(f"/api/medications/{m['id']}/stop", json={}).status_code == 422
        r = client.post(f"/api/medications/{m['id']}/stop", json={"reason": "Vet advised"}).json()
        assert r["active"] is False and r["stop_reason"] == "Vet advised" and r["runs_out_on"] is None

    def test_dose_log(self, client, dog):
        m = med(client)
        r = client.post(f"/api/medications/{m['id']}/doses", json={})
        assert r.status_code == 201
        assert r.json()["name"] == "Carprofen 50 mg"
        recent = client.get("/api/doses").json()
        assert [d["dose"] for d in recent] == ["1 tablet"]

    def test_no_dose_for_stopped_or_future(self, client, dog):
        m = med(client)
        future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        assert client.post(f"/api/medications/{m['id']}/doses", json={"given_at": future}).status_code == 422
        client.post(f"/api/medications/{m['id']}/stop", json={"reason": "done"})
        assert client.post(f"/api/medications/{m['id']}/doses", json={}).status_code == 409
        assert client.post("/api/medications/999/doses", json={}).status_code == 404


class TestMeasures:
    def test_weight_bounds(self, client, dog):
        assert client.post("/api/weights", json={"measured_on": str(TODAY), "kg": 0}).status_code == 422
        assert client.post("/api/weights", json={"measured_on": str(TODAY), "kg": 121}).status_code == 422
        assert client.post("/api/weights", json={"measured_on": str(TODAY), "kg": 22.4}).status_code == 201

    def test_checkin_total_and_one_per_week(self, client, dog):
        r = client.put("/api/checkins/2026-W45", json=CHECKIN)
        assert r.status_code == 201 and r.json()["total"] == 50
        r = client.put("/api/checkins/2026-W45", json=CHECKIN | {"mobility": 0})
        assert r.status_code == 200 and r.json()["total"] == 45
        assert len(client.get("/api/checkins").json()) == 1

    def test_checkin_validation(self, client, dog):
        assert client.put("/api/checkins/2026-W45", json=CHECKIN | {"hurt": 11}).status_code == 422
        assert client.put("/api/checkins/2026-45", json=CHECKIN).status_code == 422


class TestStars:
    def test_each_successful_save_adds_one(self, client, dog):
        m = med(client)  # adding a medicine is setup, not a log: no star
        assert stars(client)["stars_waiting"] == 0
        client.post("/api/observations", json={"text": "x"})
        client.post(f"/api/medications/{m['id']}/doses", json={})
        client.post("/api/weights", json={"measured_on": str(TODAY), "kg": 20})
        client.put("/api/checkins/2026-W45", json=CHECKIN)
        assert stars(client)["stars_waiting"] == 4

    def test_failed_save_adds_none(self, client, dog):
        client.post("/api/weights", json={"measured_on": str(TODAY), "kg": -1})
        client.put("/api/checkins/2026-W45", json=CHECKIN | {"hurt": 99})
        assert stars(client)["stars_waiting"] == 0

    def test_independent_of_values(self, client, dog):
        client.put("/api/checkins/2026-W44", json=dict.fromkeys(CHECKIN, 0))
        client.put("/api/checkins/2026-W45", json=dict.fromkeys(CHECKIN, 10))
        assert stars(client)["stars_waiting"] == 2

    def test_catch_and_daily_visit(self, client, dog):
        assert client.post("/api/stars/catch").status_code == 409
        assert client.post("/api/stars/visit").json()["added"] == 1
        assert client.post("/api/stars/visit").json()["added"] == 0
        r = client.post("/api/stars/catch").json()
        assert (r["stars_waiting"], r["stars_caught"]) == (0, 1)

    def test_injected_fault_is_500_and_adds_no_star(self, make_client):
        c = make_client(fault_save_500_rate=1.0)
        c.put("/api/dog", json={"name": "Mochi"})
        r = c.post("/api/weights", json={"measured_on": str(TODAY), "kg": 20})
        assert r.status_code == 500 and set(r.json()) == {"error"}
        assert c.get("/api/weights").json() == []
        assert stars(c)["stars_waiting"] == 0


def test_healthz(client):
    assert client.get("/healthz").json() == {"status": "ok"}
