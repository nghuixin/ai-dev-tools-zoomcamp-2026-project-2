from datetime import date

import pytest

from app import logic
from app.config import Settings


class TestRunsOut:
    def test_from_start_date(self):
        assert logic.runs_out_on(date(2026, 1, 1), None, 30, 1) == date(2026, 1, 31)

    def test_floors_partial_days(self):
        assert logic.runs_out_on(date(2026, 1, 1), None, 5, 2) == date(2026, 1, 3)

    def test_refill_date_replaces_start(self):
        assert logic.runs_out_on(date(2026, 1, 1), date(2026, 3, 1), 10, 1) == date(2026, 3, 11)

    def test_float_noise_does_not_lose_a_day(self):
        assert logic.runs_out_on(date(2026, 1, 1), None, 0.3, 0.1) == date(2026, 1, 4)

    def test_every_other_day(self):
        assert logic.runs_out_on(date(2026, 1, 1), None, 10, 0.5) == date(2026, 1, 21)


def test_doses_expected():
    assert logic.doses_expected(2, date(2026, 1, 1), date(2026, 1, 10)) == 20
    assert logic.doses_expected(1, date(2026, 1, 5), date(2026, 1, 1)) == 0


class TestCheckins:
    def test_total_is_plain_sum(self):
        items = dict(zip(logic.CHECKIN_ITEMS, [7, 8, 8, 6, 9, 5, 7]))
        assert logic.checkin_total(items) == 50

    def test_total_with_zero_item(self):
        items = dict.fromkeys(logic.CHECKIN_ITEMS, 5) | {"mobility": 0}
        assert logic.checkin_total(items, Settings()) == 30

    def test_iso_week(self):
        assert logic.parse_iso_week("2026-W01") == (date(2025, 12, 29), date(2026, 1, 4))
        assert logic.iso_week_of(date(2026, 11, 5)) == "2026-W45"

    @pytest.mark.parametrize("bad", ["2026-45", "2026-W54", "2026-W00", "W45", "2026-W5"])
    def test_bad_iso_week(self, bad):
        with pytest.raises(ValueError):
            logic.parse_iso_week(bad)


def test_weight_change():
    assert logic.weight_change(20.0, 18.5) == (-1.5, -7.5)


class TestAnalyze:
    @pytest.mark.parametrize("text,category", [
        ("Couldn't get up after a nap, slow on the stairs", "MOBILITY"),
        ("Refused her breakfast, only ate treats", "APPETITE"),
        ("Accident indoors, pee on the rug", "TOILETING"),
        ("Scratching her ear and a new lump on the flank", "SKIN_COAT"),
        ("Panting at night and a dry cough", "BREATHING"),
        ("Restless and pacing at 3am", "BEHAVIOUR"),
        ("Went to the groomer", "OTHER"),
    ])
    def test_categories(self, text, category):
        assert logic.suggest(text)["category"] == category

    def test_summary_is_owners_first_sentence(self):
        assert logic.suggest("Slow on the stairs.  Fine later.")["summary"] == "Slow on the stairs."

    def test_summary_is_capped(self):
        s = logic.suggest("word " * 100)["summary"]
        assert len(s) <= 200

    def test_validation(self):
        assert logic.valid_suggestion({"category": "MOBILITY", "summary": "Slow on stairs"})
        assert not logic.valid_suggestion({"category": "ARTHRITIS", "summary": "Slow on stairs"})
        assert not logic.valid_suggestion({"category": "MOBILITY", "summary": "x" * 201})
        assert not logic.valid_suggestion({"category": "MOBILITY", "summary": "Likely diagnosis: arthritis"})
        assert not logic.valid_suggestion({"category": "MOBILITY", "summary": "Severe pain"})
        assert not logic.valid_suggestion("MOBILITY")
