"""Vet report data (spec §5.6). Numbers and the owner's words only, never interpretation."""

from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from .. import logic
from ..deps import DB, require_dog
from ..models import Checkin, DoseLog, Medication, Observation, VetVisit, Weight
from ..schemas import (
    CheckinOut, DogOut, ObservationOut, Report, ReportMedChange, ReportMedication, ReportObsGroup,
    ReportPeriod, ReportQoL, ReportWeight, VetVisitOut, WeightOut,
)
from .observations import day_bounds

router = APIRouter(prefix="/api", tags=["report"])

FOOTER = "Owner-recorded. Not a diagnosis."


def choose_period(
    basis: str | None, d_from: date | None, d_to: date | None, last_visit: VetVisit | None, today: date
) -> tuple[date, date, str]:
    if d_from or d_to or basis == "custom":
        if not d_from:
            raise HTTPException(422, "A custom period needs a from date")
        d_to = d_to or today
        if d_to < d_from:
            raise HTTPException(422, "The period ends before it starts")
        return d_from, d_to, "custom"
    if basis != "last_30_days" and last_visit is not None:
        return last_visit.visited_on, today, "since_last_visit"
    return today - timedelta(days=29), today, "last_30_days"


@router.get("/report", response_model=Report)
def report(
    db: DB,
    basis: Literal["since_last_visit", "last_30_days", "custom"] | None = None,
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = None,
    tz_offset: int = Query(default=0, ge=-900, le=900),
    today: date | None = None,
):
    dog = require_dog(db)
    # "Today" in the owner's time zone, so the period's day boundaries and its end date agree.
    today = today or (datetime.now(timezone.utc) - timedelta(minutes=tz_offset)).date()
    last_visit = db.scalar(
        select(VetVisit).where(VetVisit.visited_on <= today).order_by(VetVisit.visited_on.desc()).limit(1)
    )
    p_from, p_to, used = choose_period(basis, from_, to, last_visit, today)
    start, end = day_bounds(p_from, p_to, tz_offset)

    # 2-3. Medicines
    current, changes = [], []
    for m in db.scalars(select(Medication).order_by(Medication.name)).all():
        if m.started_on <= p_to and (m.stopped_on is None or m.stopped_on > p_to):
            given = db.scalar(
                select(func.count(DoseLog.id)).where(
                    DoseLog.medication_id == m.id, DoseLog.given_at >= start, DoseLog.given_at < end
                )
            )
            current.append(ReportMedication(
                name=m.name, kind=m.kind, dose=m.dose, per_day=m.per_day, started_on=m.started_on,
                doses_given=given or 0,
                doses_expected=logic.doses_expected(m.per_day, max(p_from, m.started_on), p_to),
            ))
        if p_from <= m.started_on <= p_to:
            changes.append(ReportMedChange(name=m.name, kind=m.kind, change="STARTED", on=m.started_on, reason=None))
        if m.stopped_on and p_from <= m.stopped_on <= p_to:
            changes.append(ReportMedChange(
                name=m.name, kind=m.kind, change="STOPPED", on=m.stopped_on, reason=m.stop_reason))
    changes.sort(key=lambda c: (c.on, c.name))

    # 4. Weight
    weights = db.scalars(
        select(Weight).where(Weight.measured_on >= p_from, Weight.measured_on <= p_to)
        .order_by(Weight.measured_on, Weight.id)
    ).all()
    weight = None
    if weights:
        first, last = weights[0], weights[-1]
        kg, pct = logic.weight_change(first.kg, last.kg)
        weight = ReportWeight(first=WeightOut.model_validate(first), last=WeightOut.model_validate(last),
                              change_kg=kg, change_pct=pct)

    # 5. Quality of life: check-ins whose week overlaps the period
    checkins = []
    for c in db.scalars(select(Checkin).order_by(Checkin.iso_week)).all():
        monday, sunday = logic.parse_iso_week(c.iso_week)
        if monday <= p_to and sunday >= p_from:
            checkins.append(c)
    qol = None
    if checkins:
        a, b = checkins[0], checkins[-1]
        keys = (*logic.CHECKIN_ITEMS, "total")
        qol = ReportQoL(first=CheckinOut.model_validate(a), latest=CheckinOut.model_validate(b),
                        change={k: getattr(b, k) - getattr(a, k) for k in keys})

    # 6-7. Observations and the owner's questions
    obs = db.scalars(
        select(Observation).where(Observation.observed_at >= start, Observation.observed_at < end)
        .order_by(Observation.observed_at, Observation.id)
    ).all()
    groups = []
    for cat in logic.CATEGORIES:
        entries = [ObservationOut.model_validate(o) for o in obs if o.category == cat]
        if entries:
            groups.append(ReportObsGroup(category=cat, count=len(entries), entries=entries))
    questions = [ObservationOut.model_validate(o) for o in obs if o.for_vet]

    return Report(
        dog=DogOut.model_validate(dog),
        period=ReportPeriod(from_=p_from, to=p_to, basis=used,
                            last_visit=VetVisitOut.model_validate(last_visit) if last_visit else None),
        generated_at=datetime.now(timezone.utc),
        current_medications=current,
        medication_changes=changes,
        weight=weight,
        quality_of_life=qol,
        observations=groups,
        questions=questions,
        footer=FOOTER,
    )
