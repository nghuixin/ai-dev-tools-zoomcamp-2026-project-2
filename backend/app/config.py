"""Settings from environment variables. No secrets have defaults."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./atlas.db"
    # Alembic only. Neon's pooled URL goes through PgBouncer (transaction mode), which
    # migrations should not use, so they take the direct URL when one is given.
    migration_database_url: str = ""
    static_dir: str | None = None
    # Fault injection for the alert demo (spec §16). 0 in every real deployment.
    fault_save_500_rate: float = 0.0
    # Turns on the planted on-call demo bug (spec §17). Empty in every real deployment.
    demo_bug: str = ""
    # none | otlp | gcp
    otel_exporter: str = "none"
    gcp_project: str = ""


def get_settings() -> Settings:
    env = os.environ.get
    database_url = env("DATABASE_URL", Settings.database_url)
    return Settings(
        database_url=database_url,
        migration_database_url=env("DATABASE_URL_UNPOOLED") or database_url,
        static_dir=env("STATIC_DIR") or None,
        fault_save_500_rate=float(env("FAULT_SAVE_500_RATE") or 0),
        demo_bug=env("DEMO_BUG", ""),
        otel_exporter=env("OTEL_EXPORTER", "none"),
        gcp_project=env("GOOGLE_CLOUD_PROJECT", ""),
    )
