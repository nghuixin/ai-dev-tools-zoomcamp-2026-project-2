"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-11-05
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dog",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("birth_date", sa.Date, nullable=True),
        sa.Column("sex", sa.String(10), nullable=False),
        sa.Column("breed", sa.String(80), nullable=False),
        sa.Column("coat", sa.String(20), nullable=False),
        sa.Column("stars_waiting", sa.Integer, nullable=False),
        sa.Column("stars_caught", sa.Integer, nullable=False),
        sa.Column("last_visit_star_on", sa.Date, nullable=True),
    )
    op.create_table(
        "observations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("observed_at", sa.DateTime, nullable=False, index=True),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("summary", sa.String(200), nullable=True),
        sa.Column("for_vet", sa.Boolean, nullable=False),
        sa.Column("ai_suggestion", sa.JSON, nullable=True),
        sa.Column("edited_fields", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_table(
        "medications",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("dose", sa.String(40), nullable=False),
        sa.Column("per_day", sa.Float, nullable=False),
        sa.Column("quantity", sa.Float, nullable=False),
        sa.Column("started_on", sa.Date, nullable=False),
        sa.Column("refilled_on", sa.Date, nullable=True),
        sa.Column("prescriber", sa.String(80), nullable=True),
        sa.Column("stopped_on", sa.Date, nullable=True),
        sa.Column("stop_reason", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_table(
        "dose_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("medication_id", sa.Integer, sa.ForeignKey("medications.id"), nullable=False, index=True),
        sa.Column("given_at", sa.DateTime, nullable=False, index=True),
    )
    op.create_table(
        "weights",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("measured_on", sa.Date, nullable=False, index=True),
        sa.Column("kg", sa.Float, nullable=False),
    )
    op.create_table(
        "checkins",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("iso_week", sa.String(8), nullable=False, unique=True),
        *[sa.Column(c, sa.Integer, nullable=False) for c in
          ("hurt", "hunger", "hydration", "hygiene", "happiness", "mobility", "more_good_days", "total")],
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_table(
        "vet_visits",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("visited_on", sa.Date, nullable=False, index=True),
        sa.Column("clinic", sa.String(120), nullable=False),
        sa.Column("reason", sa.String(300), nullable=False),
    )


def downgrade() -> None:
    for t in ("vet_visits", "checkins", "weights", "dose_logs", "medications", "observations", "dog"):
        op.drop_table(t)
