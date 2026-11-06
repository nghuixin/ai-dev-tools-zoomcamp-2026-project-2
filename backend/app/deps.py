from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .db import get_db
from .models import Dog

DB = Annotated[Session, Depends(get_db)]


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


AppSettings = Annotated[Settings, Depends(get_settings_dep)]


def require_dog(db: Session) -> Dog:
    dog = db.scalar(select(Dog).limit(1))
    if dog is None:
        raise HTTPException(409, "Set up the dog's profile first")
    return dog


def not_found(what: str) -> HTTPException:
    return HTTPException(404, f"{what} not found")
