from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from .. import logic
from ..deps import DB, AppSettings, not_found, require_dog
from ..models import DoseLog, Medication
from ..saves import commit_record
from ..schemas import DoseIn, DoseOut, MedicationIn, MedicationOut, RefillIn, StopIn

router = APIRouter(prefix="/api", tags=["medications"])


def med_out(m: Medication, today: date | None = None) -> MedicationOut:
    today = today or date.today()
    active = m.stopped_on is None
    out = logic.runs_out_on(m.started_on, m.refilled_on, m.quantity, m.per_day) if active else None
    return MedicationOut.model_validate(
        {
            **{c: getattr(m, c) for c in MedicationOut.model_fields if hasattr(m, c)},
            "active": active,
            "runs_out_on": out,
            "runs_out_soon": out is not None and out <= today + timedelta(days=logic.SOON_DAYS),
        }
    )


@router.get("/medications", response_model=list[MedicationOut])
def list_medications(db: DB):
    meds = [med_out(m) for m in db.scalars(select(Medication)).all()]
    # Active first, soonest to run out first; then past ones, most recently stopped first.
    active = sorted((m for m in meds if m.active), key=lambda m: (m.runs_out_on, m.name.lower()))
    past = sorted((m for m in meds if not m.active), key=lambda m: m.stopped_on, reverse=True)
    return active + past


@router.post("/medications", response_model=MedicationOut, status_code=201)
def create_medication(body: MedicationIn, db: DB):
    require_dog(db)
    m = Medication(**body.model_dump())
    db.add(m)
    db.commit()
    return med_out(m)


def _active(db: DB, med_id: int) -> Medication:
    m = db.get(Medication, med_id)
    if m is None:
        raise not_found("Medicine")
    if m.stopped_on is not None:
        raise HTTPException(409, "This medicine has been stopped")
    return m


@router.post("/medications/{med_id}/refill", response_model=MedicationOut)
def refill(med_id: int, body: RefillIn, db: DB):
    m = _active(db, med_id)
    m.quantity = body.quantity
    m.refilled_on = body.refilled_on or date.today()
    db.commit()
    return med_out(m)


@router.post("/medications/{med_id}/stop", response_model=MedicationOut)
def stop(med_id: int, body: StopIn, db: DB):
    m = _active(db, med_id)
    stopped_on = body.stopped_on or date.today()
    if stopped_on < m.started_on:
        raise HTTPException(422, "A medicine can't stop before it started")
    m.stopped_on = stopped_on
    m.stop_reason = body.reason
    db.commit()
    return med_out(m)


@router.post("/medications/{med_id}/doses", response_model=DoseOut, status_code=201)
def log_dose(med_id: int, body: DoseIn, db: DB, settings: AppSettings):
    m = _active(db, med_id)
    now = datetime.now(timezone.utc)
    given_at = body.given_at or now
    if given_at.tzinfo is None:
        given_at = given_at.replace(tzinfo=timezone.utc)
    if given_at > now + timedelta(minutes=1):
        raise HTTPException(422, "A dose can't be logged in the future")
    d = DoseLog(medication_id=m.id, given_at=given_at)
    db.add(d)
    commit_record(db, settings)
    return DoseOut(id=d.id, medication_id=m.id, name=m.name, kind=m.kind, dose=m.dose, given_at=d.given_at)


@router.get("/doses", response_model=list[DoseOut])
def recent_doses(db: DB, limit: int = Query(default=5, ge=1, le=100)):
    rows = db.execute(
        select(DoseLog, Medication)
        .join(Medication, DoseLog.medication_id == Medication.id)
        .order_by(DoseLog.given_at.desc(), DoseLog.id.desc())
        .limit(limit)
    ).all()
    return [
        DoseOut(id=d.id, medication_id=m.id, name=m.name, kind=m.kind, dose=m.dose, given_at=d.given_at)
        for d, m in rows
    ]
