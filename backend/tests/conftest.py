import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Base, make_engine
from app.main import create_app


@pytest.fixture
def make_client():
    """Builds an app on a fresh in-memory SQLite database. Pass Settings fields to override."""
    clients = []

    def _make(**overrides) -> TestClient:
        engine = make_engine("sqlite://")
        Base.metadata.create_all(engine)
        app = create_app(Settings(database_url="sqlite://", **overrides), engine=engine)
        c = TestClient(app, raise_server_exceptions=False)
        clients.append(c)
        return c

    yield _make
    for c in clients:
        c.close()


@pytest.fixture
def client(make_client) -> TestClient:
    return make_client()


@pytest.fixture
def dog(client):
    r = client.put("/api/dog", json={"name": "Mochi", "sex": "FEMALE", "breed": "Australian Shepherd", "coat": "blue"})
    assert r.status_code == 200
    return r.json()


def stars(client) -> dict:
    return client.get("/api/stars").json()


CHECKIN = dict(hurt=7, hunger=8, hydration=8, hygiene=6, happiness=9, mobility=5, more_good_days=7)
