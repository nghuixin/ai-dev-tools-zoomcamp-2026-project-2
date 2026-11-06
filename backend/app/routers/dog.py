from datetime import date

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..deps import DB, require_dog
from ..models import Dog
from ..schemas import DogIn, DogOut, StarsOut

router = APIRouter(prefix="/api", tags=["dog"])


@router.get("/dog", response_model=DogOut)
def get_dog(db: DB):
    dog = db.scalar(select(Dog).limit(1))
    if dog is None:
        raise HTTPException(404, "No dog profile yet")
    return dog


@router.put("/dog", response_model=DogOut)
def put_dog(body: DogIn, db: DB):
    """Creates the one dog on first run, updates it after that."""
    dog = db.scalar(select(Dog).limit(1))
    if dog is None:
        dog = Dog(stars_waiting=0, stars_caught=0)
        db.add(dog)
    for k, v in body.model_dump().items():
        setattr(dog, k, v)
    db.commit()
    return dog


@router.get("/stars", response_model=StarsOut)
def get_stars(db: DB):
    return require_dog(db)


@router.post("/stars/visit", response_model=StarsOut)
def visit_star(db: DB):
    """The first visit each day adds one star. Calling it again the same day adds nothing."""
    dog = require_dog(db)
    added = 0
    if dog.last_visit_star_on != date.today():
        dog.last_visit_star_on = date.today()
        dog.stars_waiting += 1
        added = 1
        db.commit()
    return StarsOut(stars_waiting=dog.stars_waiting, stars_caught=dog.stars_caught, added=added)


@router.post("/stars/catch", response_model=StarsOut)
def catch_star(db: DB):
    dog = require_dog(db)
    if dog.stars_waiting < 1:
        raise HTTPException(409, "No star is waiting")
    dog.stars_waiting -= 1
    dog.stars_caught += 1
    db.commit()
    return dog
