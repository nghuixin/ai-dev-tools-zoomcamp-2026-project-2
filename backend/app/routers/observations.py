from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from .. import logic
from ..deps import DB, AppSettings, not_found, require_dog
from ..models import Observation
from ..saves import commit_record
from ..schemas import AnalyzeIn, AISuggestion, Category, ObservationIn, ObservationOut, ObservationPatch

router = APIRouter(prefix="/api", tags=["observations"])


def day_bounds(d_from: date | None, d_to: date | None, tz_offset: int) -> tuple[datetime | None, datetime | None]:
    """Local calendar days -> UTC instants. tz_offset is JavaScript's getTimezoneOffset() (minutes)."""
    shift = timedelta(minutes=tz_offset)
    start = datetime.combine(d_from, time.min, timezone.utc) + shift if d_from else None
    end = datetime.combine(d_to + timedelta(days=1), time.min, timezone.utc) + shift if d_to else None
    return start, end


@router.get("/observations", response_model=list[ObservationOut])
def list_observations(
    db: DB,
    category: Category | None = None,
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = None,
    tz_offset: int = Query(default=0, ge=-900, le=900),
    limit: int = Query(default=200, ge=1, le=1000),
):
    q = select(Observation).order_by(Observation.observed_at.desc(), Observation.id.desc()).limit(limit)
    if category:
        q = q.where(Observation.category == category)
    start, end = day_bounds(from_, to, tz_offset)
    if start:
        q = q.where(Observation.observed_at >= start)
    if end:
        q = q.where(Observation.observed_at < end)
    return db.scalars(q).all()


@router.post("/observations", response_model=ObservationOut, status_code=201)
def create_observation(body: ObservationIn, db: DB, settings: AppSettings):
    require_dog(db)
    data = body.model_dump()
    data["observed_at"] = body.observed_at or datetime.now(timezone.utc)
    data["edited_fields"] = body.edited_fields or None
    obs = Observation(**data)
    db.add(obs)
    commit_record(db, settings)
    return obs


@router.patch("/observations/{obs_id}", response_model=ObservationOut)
def patch_observation(obs_id: int, body: ObservationPatch, db: DB):
    obs = db.get(Observation, obs_id)
    if obs is None:
        raise not_found("Observation")
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is None and k in ("observed_at", "category", "text", "for_vet"):
            raise HTTPException(422, f"{k} cannot be empty")
        setattr(obs, k, v)
    if obs.ai_suggestion:
        edited = set(obs.edited_fields or [])
        for field in ("category", "summary"):
            if getattr(obs, field) != obs.ai_suggestion.get(field):
                edited.add(field)
        obs.edited_fields = sorted(edited) or None
    db.commit()
    return obs


@router.post("/observations/analyze", response_model=AISuggestion)
def analyze(body: AnalyzeIn):
    """Keyword rules (spec §8). Anything that fails validation is reported as unavailable,
    and the client still lets the owner save."""
    s = logic.suggest(body.text)
    if not logic.valid_suggestion(s):
        raise HTTPException(503, "suggestion unavailable")
    return s
