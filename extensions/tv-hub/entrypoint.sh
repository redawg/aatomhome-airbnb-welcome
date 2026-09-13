#!/bin/sh
# Listen port from HUB_LISTEN_PORT (host network / quadlet env).
set -eu
PORT="${HUB_LISTEN_PORT:-8080}"
exec uvicorn main:app --host 0.0.0.0 --port "${PORT}"
