"""Migrations build the same schema as the models, so `alembic upgrade head` is what production runs."""

import json
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext

from app.db import Base, make_engine
from app.main import create_app
from app.config import Settings

BACKEND = Path(__file__).resolve().parents[1]


def test_upgrade_head_matches_models(tmp_path, monkeypatch):
    url = f"sqlite:///{(tmp_path / 'm.db').as_posix()}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.chdir(BACKEND)
    command.upgrade(Config(str(BACKEND / "alembic.ini")), "head")
    with make_engine(url).connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    # Only index/type noise is tolerated; no missing tables or columns.
    structural = [d for d in diff if d[0] in ("add_table", "remove_table", "add_column", "remove_column")]
    assert structural == []


def test_openapi_contract_is_up_to_date():
    """openapi.yaml at the repo root is the contract (spec §7). Regenerate with `make openapi`."""
    import yaml

    committed = yaml.safe_load((BACKEND.parent / "openapi.yaml").read_text(encoding="utf-8"))
    current = json.loads(json.dumps(create_app(Settings(database_url="sqlite://")).openapi()))
    assert committed == current, "openapi.yaml is stale: run `make openapi`"
