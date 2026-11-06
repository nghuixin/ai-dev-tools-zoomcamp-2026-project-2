"""Traces, metrics and JSON logs (spec §15), under the privacy rules of spec §9.

Only route templates, methods, status codes, durations, record types and IDs are recorded.
Never request bodies, observation text, names or notes, and never exception messages
(database errors can echo parameter values); only the exception class name.
"""

import json
import logging
import sys
import time
from datetime import datetime, timezone

from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from prometheus_client import Counter, Histogram

from .config import Settings

SERVICE = "atlas-api"

# Record saves are the key user journey (spec §15). Labels are low-cardinality and content-free.
RECORD_SAVES = Counter("atlas_record_saves_total", "Record saves by type and outcome", ["type", "outcome"])
REQUEST_SECONDS = Histogram(
    "atlas_http_request_duration_seconds", "Request duration by route", ["route", "method"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
)

SAVE_ROUTES = {
    ("POST", "/api/observations"): "observation",
    ("POST", "/api/medications/{med_id}/doses"): "dose",
    ("POST", "/api/weights"): "weight",
    ("PUT", "/api/checkins/{iso_week}"): "checkin",
}

log = logging.getLogger("atlas.request")
_configured = False


class JsonFormatter(logging.Formatter):
    FIELDS = ("route", "method", "status", "duration_ms", "record_type", "outcome", "error_type",
              "trace_id", "span_id")

    def __init__(self, gcp_project: str = ""):
        super().__init__()
        self.gcp_project = gcp_project

    def format(self, record: logging.LogRecord) -> str:
        out = {
            "time": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "severity": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for f in self.FIELDS:
            v = getattr(record, f, None)
            if v is not None:
                out[f] = v
        if not out.get("trace_id"):
            ctx = trace.get_current_span().get_span_context()
            if ctx.is_valid:
                out["trace_id"], out["span_id"] = f"{ctx.trace_id:032x}", f"{ctx.span_id:016x}"
        if self.gcp_project and out.get("trace_id"):
            # Lets Cloud Logging link each line to its trace in Cloud Trace.
            out["logging.googleapis.com/trace"] = f"projects/{self.gcp_project}/traces/{out['trace_id']}"
            out["logging.googleapis.com/spanId"] = out.get("span_id")
        return json.dumps(out)


def configure(settings: Settings) -> None:
    """Process-wide setup: logging and the tracer provider. Safe to call more than once."""
    global _configured
    if _configured:
        return
    _configured = True

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter(settings.gcp_project))
    root = logging.getLogger()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").disabled = True  # replaced by the request log below

    provider = TracerProvider(resource=Resource.create({"service.name": SERVICE}))
    if settings.otel_exporter == "otlp":
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    elif settings.otel_exporter == "gcp":
        from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter

        provider.add_span_processor(BatchSpanProcessor(CloudTraceSpanExporter(project_id=settings.gcp_project or None)))
    trace.set_tracer_provider(provider)


def instrument(app, engine) -> None:
    app.add_middleware(RequestTelemetry)
    FastAPIInstrumentor.instrument_app(app, excluded_urls="healthz,metrics")
    SQLAlchemyInstrumentor().instrument(engine=engine)


class RequestTelemetry:
    """Pure ASGI middleware: one JSON log line, a duration observation and, for record saves,
    one atlas_record_saves_total increment per request."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        start = time.perf_counter()
        status = {"code": 500}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
            await send(message)

        error_type = None
        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as e:  # recorded, then handled by the app's error handler
            status["code"] = 500
            error_type = type(e).__name__
            raise
        finally:
            self._record(scope, status["code"], time.perf_counter() - start, error_type)

    @staticmethod
    def _record(scope, code: int, seconds: float, error_type: str | None) -> None:
        route_obj = scope.get("route")
        route = getattr(route_obj, "path", None) or "unmatched"
        method = scope["method"]
        if route in ("/healthz", "/metrics") or not route.startswith("/api"):
            return
        REQUEST_SECONDS.labels(route, method).observe(seconds)
        record_type = SAVE_ROUTES.get((method, route))
        ctx = trace.get_current_span().get_span_context()
        ids = {"trace_id": f"{ctx.trace_id:032x}", "span_id": f"{ctx.span_id:016x}"} if ctx.is_valid else {}
        outcome = "success" if code < 400 else "client_error" if code < 500 else "server_error"
        if record_type:
            RECORD_SAVES.labels(record_type, outcome).inc()
        log.log(
            logging.ERROR if code >= 500 else logging.INFO,
            "request",
            extra={
                "route": route, "method": method, "status": code, "duration_ms": round(seconds * 1000, 1),
                "record_type": record_type, "outcome": outcome if record_type else None,
                "error_type": error_type, **ids,
            },
        )
