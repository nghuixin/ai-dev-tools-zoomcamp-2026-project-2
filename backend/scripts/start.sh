#!/bin/sh
# Container entrypoint. Locally (Compose) migrations run at start-up. On Cloud Run the deploy
# job runs them once before traffic moves (spec §13), so RUN_MIGRATIONS=0 there.
set -e
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  alembic upgrade head
fi
exec uvicorn --factory app.main:create_app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips='*'
