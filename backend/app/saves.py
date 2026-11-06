"""Committing a record save. One place decides stars and fault injection, so the rules hold
for every record type:

* a star is added in the same transaction as the record, so a failed save never adds one;
* the star never depends on the record's values (spec §5.7).
"""

import random

from sqlalchemy import update
from sqlalchemy.orm import Session

from .config import Settings
from .models import Dog


class InjectedFault(RuntimeError):
    """Raised on purpose by FAULT_SAVE_500_RATE for the alert demo (spec §16)."""


def commit_record(db: Session, settings: Settings) -> None:
    db.execute(update(Dog).values(stars_waiting=Dog.stars_waiting + 1))
    if settings.fault_save_500_rate and random.random() < settings.fault_save_500_rate:
        db.rollback()
        raise InjectedFault("injected save fault (FAULT_SAVE_500_RATE)")
    db.commit()
