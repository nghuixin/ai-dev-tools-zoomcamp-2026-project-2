"""Steady, content-free save traffic for the alert demos (spec §16, §17).

    python scripts/traffic.py --minutes 4            # against ATLAS_URL (default http://localhost:8000)

Prints how many saves failed, so you can watch RecordSaveFailing build up in Grafana.
"""

import argparse
import os
import random
import time
from datetime import date, datetime, timezone

import httpx

URL = os.environ.get("ATLAS_URL", "http://localhost:8000")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--minutes", type=float, default=4)
    p.add_argument("--rate", type=float, default=2.0, help="saves per second")
    a = p.parse_args()

    with httpx.Client(base_url=URL, timeout=10) as c:
        if c.get("/api/dog").status_code == 404:
            c.put("/api/dog", json={"name": "Traffic Dog"})
        meds = [m for m in c.get("/api/medications").json() if m["active"]]
        if not meds:
            meds = [c.post("/api/medications", json=dict(name="Traffic med", kind="SUPPLEMENT", dose="1",
                                                         per_day=1, quantity=30, started_on=str(date.today()))).json()]
        week = "{}-W{:02d}".format(*date.today().isocalendar()[:2])
        saves = [
            lambda: c.post("/api/observations", json={"text": "traffic", "category": "OTHER"}),
            lambda: c.post(f"/api/medications/{random.choice(meds)['id']}/doses",
                           json={"given_at": datetime.now(timezone.utc).isoformat()}),
            lambda: c.post("/api/weights", json={"measured_on": str(date.today()), "kg": round(random.uniform(18, 24), 1)}),
            # Scores include 0s on purpose: real owners score bad days, and the DEMO_BUG path fails on them.
            lambda: c.put(f"/api/checkins/{week}", json={k: random.randint(0, 10) for k in (
                "hurt", "hunger", "hydration", "hygiene", "happiness", "mobility", "more_good_days")}),
        ]
        end, ok, failed = time.time() + a.minutes * 60, 0, 0
        while time.time() < end:
            if random.random() < 0.1:  # the second key journey: opening the vet report
                c.get("/api/report", params={"basis": "last_30_days"})
            r = random.choice(saves)()
            if r.status_code >= 500:
                failed += 1
            else:
                ok += 1
            if (ok + failed) % 20 == 0:
                print(f"saves: {ok} ok, {failed} failed ({failed / (ok + failed):.0%})", flush=True)
            time.sleep(1 / a.rate)
        print(f"done: {ok} ok, {failed} failed")


if __name__ == "__main__":
    main()
