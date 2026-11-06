from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select

from .. import logic
from ..deps import DB, AppSettings, require_dog
from ..models import Checkin, VetVisit, Weight
from ..saves import commit_record
from ..schemas import CheckinIn, CheckinOut, VetVisitIn, VetVisitOut, WeightIn, WeightOut

router = APIRouter(prefix="/api", tags=["measures"])


# ---------- Weight ----------

@router.get("/weights", response_model=list[WeightOut])
def list_weights(db: DB):
    return db.scalars(select(Weight).order_by(Weight.measured_on, Weight.id)).all()


@router.post("/weights", response_model=WeightOut, status_code=201)
def add_weight(body: WeightIn, db: DB, settings: AppSettings):
    require_dog(db)
    w = Weight(**body.model_dump())
    db.add(w)
    commit_record(db, settings)
    return w


# ---------- Weekly check-in ----------

def _week(iso_week: str) -> str:
    try:
        logic.parse_iso_week(iso_week)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    return iso_week


@router.get("/checkins", response_model=list[CheckinOut])
def list_checkins(db: DB):
    return db.scalars(select(Checkin).order_by(Checkin.iso_week)).all()


@router.get("/checkins/{iso_week}", response_model=CheckinOut)
def get_checkin(iso_week: str, db: DB):
    c = db.scalar(select(Checkin).where(Checkin.iso_week == _week(iso_week)))
    if c is None:
        raise HTTPException(404, "No check-in for that week")
    return c


@router.put("/checkins/{iso_week}", response_model=CheckinOut)
def put_checkin(iso_week: str, body: CheckinIn, db: DB, settings: AppSettings, response: Response):
    """One check-in per ISO week. A second PUT replaces the first (the UI confirms before sending)."""
    require_dog(db)
    week = _week(iso_week)
    items = body.model_dump(exclude={"note"})
    c = db.scalar(select(Checkin).where(Checkin.iso_week == week))
    if c is None:
        c = Checkin(iso_week=week)
        db.add(c)
        response.status_code = 201
    for k, v in items.items():
        setattr(c, k, v)
    c.note = body.note
    c.total = logic.checkin_total(items, settings)
    commit_record(db, settings)
    return c


# ---------- Vet visits ----------

@router.get("/vet-visits", response_model=list[VetVisitOut])
def list_visits(db: DB):
    return db.scalars(select(VetVisit).order_by(VetVisit.visited_on.desc(), VetVisit.id.desc())).all()


@router.post("/vet-visits", response_model=VetVisitOut, status_code=201)
def add_visit(body: VetVisitIn, db: DB):
    require_dog(db)
    v = VetVisit(**body.model_dump())
    db.add(v)
    db.commit()
    return v
