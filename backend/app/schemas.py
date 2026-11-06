from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Category = Literal["MOBILITY", "APPETITE", "TOILETING", "SKIN_COAT", "BREATHING", "BEHAVIOUR", "OTHER"]
Kind = Literal["DRUG", "SUPPLEMENT", "HERBAL", "OTHER"]
Sex = Literal["FEMALE", "MALE", "UNKNOWN"]
Coat = Literal["blue", "red", "tri", "saddle", "golden", "black", "brown", "cream", "grey"]
Score = Field(ge=0, le=10)


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _strip(v: object) -> object:
    return v.strip() if isinstance(v, str) else v


# ---------- Dog ----------

class DogIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    birth_date: date | None = None
    sex: Sex = "UNKNOWN"
    breed: str = Field(default="", max_length=80)
    coat: Coat = "blue"

    _s = field_validator("name", "breed", mode="before")(_strip)


class DogOut(ORM):
    name: str
    birth_date: date | None
    sex: Sex
    breed: str
    coat: Coat


# ---------- Observations ----------

class AISuggestion(BaseModel):
    category: Category
    summary: str = Field(max_length=200)


class ObservationIn(BaseModel):
    observed_at: datetime | None = None
    category: Category = "OTHER"
    text: str = Field(min_length=1, max_length=2000)
    summary: str | None = Field(default=None, max_length=200)
    for_vet: bool = False
    ai_suggestion: AISuggestion | None = None
    edited_fields: list[Literal["category", "summary"]] = []

    _s = field_validator("text", mode="before")(_strip)


class ObservationPatch(BaseModel):
    observed_at: datetime | None = None
    category: Category | None = None
    text: str | None = Field(default=None, min_length=1, max_length=2000)
    summary: str | None = Field(default=None, max_length=200)
    for_vet: bool | None = None


class ObservationOut(ORM):
    id: int
    observed_at: datetime
    category: Category
    text: str
    summary: str | None
    for_vet: bool
    ai_suggestion: AISuggestion | None
    edited_fields: list[str] | None
    created_at: datetime


class AnalyzeIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


# ---------- Medicines ----------

class MedicationIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: Kind
    dose: str = Field(min_length=1, max_length=40)
    per_day: float = Field(gt=0, le=24)
    quantity: float = Field(ge=0, le=10000)
    started_on: date
    prescriber: str | None = Field(default=None, max_length=80)

    _s = field_validator("name", "dose", "prescriber", mode="before")(_strip)


class RefillIn(BaseModel):
    quantity: float = Field(ge=0, le=10000)
    refilled_on: date | None = None


class StopIn(BaseModel):
    reason: str = Field(min_length=1, max_length=300)
    stopped_on: date | None = None

    _s = field_validator("reason", mode="before")(_strip)


class MedicationOut(ORM):
    id: int
    name: str
    kind: Kind
    dose: str
    per_day: float
    quantity: float
    started_on: date
    refilled_on: date | None
    prescriber: str | None
    stopped_on: date | None
    stop_reason: str | None
    active: bool
    runs_out_on: date | None
    runs_out_soon: bool


class DoseIn(BaseModel):
    given_at: datetime | None = None


class DoseOut(BaseModel):
    id: int
    medication_id: int
    name: str
    kind: Kind
    dose: str
    given_at: datetime


# ---------- Measures ----------

class WeightIn(BaseModel):
    measured_on: date
    kg: float = Field(gt=0, le=120)


class WeightOut(ORM):
    id: int
    measured_on: date
    kg: float


class CheckinIn(BaseModel):
    hurt: int = Score
    hunger: int = Score
    hydration: int = Score
    hygiene: int = Score
    happiness: int = Score
    mobility: int = Score
    more_good_days: int = Score
    note: str | None = Field(default=None, max_length=1000)


class CheckinOut(ORM):
    iso_week: str
    hurt: int
    hunger: int
    hydration: int
    hygiene: int
    happiness: int
    mobility: int
    more_good_days: int
    total: int
    note: str | None


# ---------- Vet visits ----------

class VetVisitIn(BaseModel):
    visited_on: date
    clinic: str = Field(min_length=1, max_length=120)
    reason: str = Field(default="", max_length=300)


class VetVisitOut(ORM):
    id: int
    visited_on: date
    clinic: str
    reason: str


# ---------- Stars ----------

class StarsOut(ORM):
    stars_waiting: int
    stars_caught: int
    added: int = 0


# ---------- Report ----------

class ReportPeriod(BaseModel):
    from_: date = Field(serialization_alias="from")
    to: date
    basis: Literal["since_last_visit", "last_30_days", "custom"]
    last_visit: VetVisitOut | None


class ReportMedication(BaseModel):
    name: str
    kind: Kind
    dose: str
    per_day: float
    started_on: date
    doses_given: int
    doses_expected: int


class ReportMedChange(BaseModel):
    name: str
    kind: Kind
    change: Literal["STARTED", "STOPPED"]
    on: date
    reason: str | None


class ReportWeight(BaseModel):
    first: WeightOut
    last: WeightOut
    change_kg: float
    change_pct: float


class ReportQoL(BaseModel):
    first: CheckinOut
    latest: CheckinOut
    change: dict[str, int]


class ReportObsGroup(BaseModel):
    category: Category
    count: int
    entries: list[ObservationOut]


class Report(BaseModel):
    dog: DogOut
    period: ReportPeriod
    generated_at: datetime
    current_medications: list[ReportMedication]
    medication_changes: list[ReportMedChange]
    weight: ReportWeight | None
    quality_of_life: ReportQoL | None
    observations: list[ReportObsGroup]
    questions: list[ObservationOut]
    footer: str
