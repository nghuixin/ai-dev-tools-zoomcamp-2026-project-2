"""Spec §9: record content never reaches logs, spans or metrics."""

import logging
from datetime import date

import pytest
from opentelemetry import trace
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from prometheus_client import generate_latest

MARKER = "ZZ-PRIVATE-7f3a"


@pytest.fixture
def spans():
    exporter = InMemorySpanExporter()
    trace.get_tracer_provider().add_span_processor(SimpleSpanProcessor(exporter))
    return exporter


def test_no_record_content_in_logs_spans_or_metrics(client, spans, caplog):
    caplog.set_level(logging.INFO)
    client.put("/api/dog", json={"name": f"Dog {MARKER}"})
    client.post("/api/observations", json={"text": f"Text {MARKER}", "summary": MARKER})
    m = client.post("/api/medications", json=dict(name=f"Med {MARKER}", kind="DRUG", dose=MARKER, per_day=1,
                                                  quantity=5, started_on=str(date.today()))).json()
    client.post(f"/api/medications/{m['id']}/stop", json={"reason": MARKER})
    client.post("/api/observations", json={"text": MARKER, "category": MARKER})  # 422 path
    client.post("/api/observations/analyze", json={"text": MARKER})

    assert caplog.records, "expected request logs"
    for rec in caplog.records:
        assert MARKER not in rec.getMessage()
        assert MARKER not in str(rec.__dict__)
    finished = spans.get_finished_spans()
    assert finished, "expected spans"
    for s in finished:
        assert MARKER not in s.name
        assert MARKER not in str(dict(s.attributes or {}))
        for e in s.events:
            assert MARKER not in str(dict(e.attributes or {}))
    assert MARKER not in generate_latest().decode()


def test_request_log_has_trace_id_and_record_type(client, dog, caplog):
    caplog.set_level(logging.INFO)
    client.post("/api/observations", json={"text": "x"})
    rec = [r for r in caplog.records if getattr(r, "record_type", None) == "observation"][-1]
    assert rec.route == "/api/observations" and rec.status == 201 and rec.outcome == "success"
    from app.telemetry import JsonFormatter
    import json
    line = json.loads(JsonFormatter("demo-project").format(rec))
    assert len(line["trace_id"]) == 32
    assert line["logging.googleapis.com/trace"] == f"projects/demo-project/traces/{line['trace_id']}"


def test_save_counter_counts_outcomes(make_client):
    from app.telemetry import RECORD_SAVES

    def value(outcome):
        return RECORD_SAVES.labels("weight", outcome)._value.get()

    c = make_client(fault_save_500_rate=1.0)
    c.put("/api/dog", json={"name": "Mochi"})
    before_err, before_bad = value("server_error"), value("client_error")
    c.post("/api/weights", json={"measured_on": str(date.today()), "kg": 20})
    c.post("/api/weights", json={"measured_on": str(date.today()), "kg": -5})
    assert value("server_error") == before_err + 1
    assert value("client_error") == before_bad + 1
