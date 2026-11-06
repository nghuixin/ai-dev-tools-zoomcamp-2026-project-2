"""Writes the API contract to ../openapi.yaml (spec §7)."""

import json
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

out = Path(__file__).resolve().parents[2] / "openapi.yaml"
spec = json.loads(json.dumps(create_app(Settings(database_url="sqlite://")).openapi()))
out.write_text(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True), encoding="utf-8")
print(f"wrote {out}")
