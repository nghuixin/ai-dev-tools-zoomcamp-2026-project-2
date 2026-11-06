"""Pure rules from the spec, kept free of the web and database layers so they are easy to test."""

import math
import re
from datetime import date, timedelta

from .config import Settings

CATEGORIES = ("MOBILITY", "APPETITE", "TOILETING", "SKIN_COAT", "BREATHING", "BEHAVIOUR", "OTHER")
CHECKIN_ITEMS = ("hurt", "hunger", "hydration", "hygiene", "happiness", "mobility", "more_good_days")
SOON_DAYS = 7


# ---------- Medicines (spec §5.4) ----------

def runs_out_on(started_on: date, refilled_on: date | None, quantity: float, per_day: float) -> date:
    """runs_out_on = refilled_on (or start) + floor(quantity / doses per day) days."""
    base = refilled_on or started_on
    # The small epsilon stops float noise turning 3.0 into 2.999… and losing a day.
    return base + timedelta(days=math.floor(quantity / per_day + 1e-9))


def doses_expected(per_day: float, start: date, end: date) -> int:
    """Doses expected over an inclusive date range; 0 when the range is empty."""
    days = (end - start).days + 1
    return 0 if days <= 0 else round(per_day * days)


# ---------- Check-ins (spec §5.5) ----------

ISO_WEEK = re.compile(r"^(\d{4})-W(\d{2})$")


def parse_iso_week(value: str) -> tuple[date, date]:
    """'2026-W45' -> (Monday, Sunday). Raises ValueError for anything else."""
    m = ISO_WEEK.match(value)
    if not m:
        raise ValueError("iso_week must look like 2026-W45")
    monday = date.fromisocalendar(int(m.group(1)), int(m.group(2)), 1)
    return monday, monday + timedelta(days=6)


def iso_week_of(d: date) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def checkin_total(items: dict[str, int], settings: Settings | None = None) -> int:
    """Total out of 70: the plain sum of the seven 0-10 items."""
    if settings is not None and settings.demo_bug == "checkin_total":
        return _weighted_total(items)
    return sum(items[k] for k in CHECKIN_ITEMS)


def _weighted_total(items: dict[str, int]) -> int:
    # On-call demo (spec §17): a "refactor" that rescales each item by its share of the
    # largest score. Planted bug: it divides by each item, so any item scored 0 crashes.
    top = max(items[k] for k in CHECKIN_ITEMS)
    return round(sum(top / (top / items[k]) for k in CHECKIN_ITEMS))


# ---------- Weight (spec §5.6, report section 4) ----------

def weight_change(first_kg: float, last_kg: float) -> tuple[float, float]:
    """(change in kg, change in %), both rounded to 1 decimal place."""
    diff = last_kg - first_kg
    return round(diff, 1), round(diff / first_kg * 100, 1)


# ---------- Analyze (spec §8): keyword rules ----------

_RULES: list[tuple[str, list[str]]] = [
    ("MOBILITY", [r"\blimp", r"\bstairs?\b", r"(couldn'?t|could not|can'?t|cannot) (get|stand) up",
                  r"\bstiff", r"\bwobbl", r"\bslipp", r"\bfell\b", r"\blame\b", r"\bback legs?\b", r"\bwalk"]),
    ("APPETITE", [r"\bate\b", r"\beat", r"\bfood\b", r"\bmeals?\b", r"\bappetite", r"\bhungry",
                  r"\btreats?\b", r"\bdrink", r"\bwater\b", r"\brefused\b"]),
    ("TOILETING", [r"\bpoo", r"\bpee", r"\burin", r"\bstool", r"\bdiarrh", r"\bconstipat",
                   r"\baccident", r"\btoilet"]),
    ("SKIN_COAT", [r"\bitch", r"\bscratch", r"\brash", r"\blump", r"\bhot spot", r"\bskin\b",
                   r"\bcoat\b", r"\bfur\b", r"\bhair loss", r"\blick"]),
    ("BREATHING", [r"\bcough", r"\bpant", r"\bbreath", r"\bwheez", r"\bsneez"]),
    ("BEHAVIOUR", [r"\banxious", r"\brestless", r"\bbark", r"\bwhin", r"\bhid(ing|e)?\b", r"\bconfus",
                   r"\bpacing\b", r"\bsleep", r"\baggress", r"\bclingy", r"\bwander"]),
]
_COMPILED = [(cat, [re.compile(p, re.IGNORECASE) for p in pats]) for cat, pats in _RULES]

# The suggestion may only restate; anything that reads as a judgement is rejected (spec §8).
_FORBIDDEN = re.compile(r"diagnos|\bsevere\b|\bseverity\b|\bcaused by\b|\bmg/kg\b|\bprescribe|\btreat with\b",
                        re.IGNORECASE)
SUMMARY_MAX = 200


def suggest(text: str) -> dict[str, str]:
    scores = {cat: sum(1 for p in pats if p.search(text)) for cat, pats in _COMPILED}
    best = max(scores.values())
    category = next(c for c, _ in _COMPILED if scores[c] == best) if best > 0 else "OTHER"
    return {"category": category, "summary": _summarise(text)}


def _summarise(text: str) -> str:
    """The owner's own words, first sentence, trimmed. Restating only, never interpreting."""
    clean = " ".join(text.split())
    first = re.split(r"(?<=[.!?])\s", clean, maxsplit=1)[0]
    return first if len(first) <= SUMMARY_MAX else first[: SUMMARY_MAX - 1].rstrip() + "…"


def valid_suggestion(s: object) -> bool:
    if not isinstance(s, dict):
        return False
    cat, summary = s.get("category"), s.get("summary")
    return (
        cat in CATEGORIES
        and isinstance(summary, str)
        and 0 < len(summary) <= SUMMARY_MAX
        and not _FORBIDDEN.search(summary)
    )
