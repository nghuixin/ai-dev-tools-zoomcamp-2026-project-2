from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import Engine, text
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import telemetry
from .config import Settings, get_settings
from .db import make_engine, make_sessionmaker
from .routers import dog, measures, medications, observations, report


def create_app(settings: Settings | None = None, engine: Engine | None = None) -> FastAPI:
    settings = settings or get_settings()
    engine = engine or make_engine(settings.database_url)
    telemetry.configure(settings)

    app = FastAPI(title="Canine Health Atlas API", version="0.1.0")
    app.state.settings = settings
    app.state.sessionmaker = make_sessionmaker(engine)

    for r in (dog, observations, medications, measures, report):
        app.include_router(r.router)

    # Errors are always {"error": "..."} (spec §7).
    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException):
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        first = exc.errors()[0]
        where = ".".join(str(p) for p in first["loc"] if p != "body")
        return JSONResponse({"error": f"{where}: {first['msg']}" if where else first["msg"]}, status_code=422)

    @app.exception_handler(Exception)
    async def server_error(_: Request, __: Exception):
        return JSONResponse({"error": "Something went wrong saving this. Please try again."}, status_code=500)

    @app.get("/healthz", include_in_schema=False)
    def healthz():
        try:
            with engine.connect() as c:
                c.execute(text("SELECT 1"))
        except Exception:
            raise HTTPException(503, "database unavailable") from None
        return {"status": "ok"}

    @app.get("/metrics", include_in_schema=False)
    def metrics():
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    if settings.static_dir and Path(settings.static_dir, "index.html").exists():
        _mount_ui(app, Path(settings.static_dir))

    telemetry.instrument(app, engine)
    return app


def _mount_ui(app: FastAPI, root: Path) -> None:
    """Serves the built React app from the same origin. Unknown paths get index.html so
    client-side routes like /report work on reload."""
    root = root.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    def ui(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        f = (root / path).resolve()
        if path and f.is_file() and root in f.parents:
            return FileResponse(f)
        return FileResponse(root / "index.html")
