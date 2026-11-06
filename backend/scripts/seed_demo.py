"""Loads the demo dog (spec §12): synthetic records shaped like Kuro's 2025 care, so a fresh
install or the public deployment shows a believable record. Every value here is made up.

    uv run python scripts/seed_demo.py          # refuses if a dog already exists
    uv run python scripts/seed_demo.py --reset  # wipes all records first (demo deployments only)
    uv run python scripts/seed_demo.py --if-empty  # seeds only a fresh database; never an error
"""

import argparse
import random
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import delete, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app import logic  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import make_engine  # noqa: E402
from app.models import Checkin, Dog, DoseLog, Medication, Observation, VetVisit, Weight  # noqa: E402

TABLES = (DoseLog, Medication, Observation, Weight, Checkin, VetVisit, Dog)


def at(d: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(d, time(hour, minute), timezone.utc)


def seed(db: Session, today: date) -> None:
    rnd = random.Random(2025)
    db.add(Dog(name="Mochi", birth_date=date(2012, 4, 18), sex="FEMALE", breed="Australian Shepherd",
               coat="blue", stars_waiting=2, stars_caught=7))
    db.add(VetVisit(visited_on=today - timedelta(days=35), clinic="Harbourside Vets", reason="Six-month senior check"))
    db.add(VetVisit(visited_on=today - timedelta(days=200), clinic="Harbourside Vets", reason="Vaccination"))

    def med(name, kind, dose, per_day, quantity, started_ago, refilled_ago=None, **kw):
        m = Medication(name=name, kind=kind, dose=dose, per_day=per_day, quantity=quantity,
                       started_on=today - timedelta(days=started_ago),
                       refilled_on=today - timedelta(days=refilled_ago) if refilled_ago is not None else None, **kw)
        db.add(m)
        return m

    carprofen = med("Carprofen 50 mg", "DRUG", "1 tablet", 2, 56, 90, 24, prescriber="Dr Tan")
    joint = med("Joint supplement (green-lipped mussel)", "SUPPLEMENT", "1 chew", 1, 30, 120, 26)
    thistle = med("Milk thistle", "HERBAL", "1 capsule", 1, 60, 60, 2)
    fish = med("Fish oil", "SUPPLEMENT", "1 capsule", 1, 90, 15)
    gaba = med("Gabapentin 100 mg", "DRUG", "1 capsule", 2, 0, 70, prescriber="Dr Tan",
               stopped_on=today - timedelta(days=20), stop_reason="Too sedated in the mornings; vet advised stopping")
    db.flush()

    # Doses over the last 60 days, with the occasional missed one, like a real household.
    for d in range(60, -1, -1):
        day = today - timedelta(days=d)
        for m, slots in ((carprofen, (8, 19)), (joint, (8,)), (thistle, (19,)), (fish, (8,)), (gaba, (8, 20))):
            if day < m.started_on or (m.stopped_on and day >= m.stopped_on):
                continue
            for h in slots:
                if d == 0 and h > 9:
                    continue
                if rnd.random() < 0.9:
                    db.add(DoseLog(medication_id=m.id, given_at=at(day, h, rnd.randint(0, 40))))

    # Weight drifting down over ten weeks.
    for i, kg in enumerate((23.0, 22.9, 22.9, 22.6, 22.5, 22.4, 22.1, 22.0, 21.8, 21.6)):
        db.add(Weight(measured_on=today - timedelta(weeks=9 - i), kg=kg))

    # Weekly check-ins: the total stays "acceptable" while mobility and hygiene slide,
    # which is why the chart shows every item (spec §5.5).
    for i in range(10):
        week = logic.iso_week_of(today - timedelta(weeks=9 - i))
        items = dict(hurt=7 - i // 4, hunger=8, hydration=8, hygiene=8 - i // 2, happiness=8 - i // 5,
                     mobility=8 - (i * 2) // 3, more_good_days=8 - i // 3)
        db.add(Checkin(iso_week=week, **items, total=logic.checkin_total(items),
                       note="Quiet week" if i == 3 else None))

    notes = [
        (58, "MOBILITY", "Slow to get up after a nap, fine once moving", False),
        (51, "APPETITE", "Left half her breakfast", False),
        (44, "SKIN_COAT", "Small lump on the left flank, pea-sized", True),
        (37, "MOBILITY", "Hesitated at the stairs to the bedroom", False),
        (33, "BEHAVIOUR", "Restless and pacing around 3am", False),
        (27, "TOILETING", "Accident indoors overnight", False),
        (24, "MOBILITY", "Back legs slipped on the kitchen tiles", False),
        (19, "BREATHING", "Panting at rest in the evening, room was cool", True),
        (15, "APPETITE", "Ate well, finished dinner", False),
        (12, "MOBILITY", "Needed help onto the sofa", False),
        (9, "BEHAVIOUR", "Didn't come to greet visitors", False),
        (6, "TOILETING", "Second overnight accident this month", True),
        (3, "MOBILITY", "Short walk only, stopped twice", False),
        (1, "OTHER", "Groomer said the lump looks the same size", False),
    ]
    for ago, cat, text, for_vet in notes:
        db.add(Observation(observed_at=at(today - timedelta(days=ago), 9, 30), category=cat, text=text,
                           summary=None, for_vet=for_vet))
    db.commit()


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--reset", action="store_true", help="delete every record first")
    p.add_argument("--if-empty", action="store_true", help="do nothing (exit 0) if a dog already exists")
    args = p.parse_args()
    engine = make_engine(get_settings().database_url)
    with Session(engine) as db:
        if args.reset:
            for t in TABLES:
                db.execute(delete(t))
            db.commit()
        elif db.scalar(select(Dog).limit(1)) is not None:
            if args.if_empty:
                print("A dog already exists; leaving the data as it is.")
                return
            sys.exit("A dog already exists; not seeding. Use --reset to replace everything (demo deployments only).")
        seed(db, date.today())
    print("Seeded the demo dog.")


if __name__ == "__main__":
    main()
