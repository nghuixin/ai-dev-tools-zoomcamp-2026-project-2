from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base, UTCDateTime


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Dog(Base):
    __tablename__ = "dog"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sex: Mapped[str] = mapped_column(String(10), default="UNKNOWN")
    breed: Mapped[str] = mapped_column(String(80), default="")
    coat: Mapped[str] = mapped_column(String(20), default="blue")
    stars_waiting: Mapped[int] = mapped_column(Integer, default=0)
    stars_caught: Mapped[int] = mapped_column(Integer, default=0)
    last_visit_star_on: Mapped[date | None] = mapped_column(Date, nullable=True)


class Observation(Base):
    __tablename__ = "observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    observed_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    category: Mapped[str] = mapped_column(String(20))
    text: Mapped[str] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(String(200), nullable=True)
    for_vet: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_suggestion: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    edited_fields: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Medication(Base):
    __tablename__ = "medications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(12))
    dose: Mapped[str] = mapped_column(String(40))
    per_day: Mapped[float] = mapped_column(Float)
    quantity: Mapped[float] = mapped_column(Float)
    started_on: Mapped[date] = mapped_column(Date)
    refilled_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    prescriber: Mapped[str | None] = mapped_column(String(80), nullable=True)
    stopped_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    stop_reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class DoseLog(Base):
    __tablename__ = "dose_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    medication_id: Mapped[int] = mapped_column(ForeignKey("medications.id"), index=True)
    given_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)


class Weight(Base):
    __tablename__ = "weights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    measured_on: Mapped[date] = mapped_column(Date, index=True)
    kg: Mapped[float] = mapped_column(Float)


class Checkin(Base):
    __tablename__ = "checkins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    iso_week: Mapped[str] = mapped_column(String(8), unique=True)
    hurt: Mapped[int] = mapped_column(Integer)
    hunger: Mapped[int] = mapped_column(Integer)
    hydration: Mapped[int] = mapped_column(Integer)
    hygiene: Mapped[int] = mapped_column(Integer)
    happiness: Mapped[int] = mapped_column(Integer)
    mobility: Mapped[int] = mapped_column(Integer)
    more_good_days: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class VetVisit(Base):
    __tablename__ = "vet_visits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visited_on: Mapped[date] = mapped_column(Date, index=True)
    clinic: Mapped[str] = mapped_column(String(120))
    reason: Mapped[str] = mapped_column(String(300))
