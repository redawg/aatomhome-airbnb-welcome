#!/usr/bin/env bash
# Deprecated wrapper — use deploy-profile.sh container
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "NOTE: deploy-local-hub.sh → deploy-profile.sh container" >&2
ENV_FILE="${ENV_FILE:-$ROOT/deploy/profiles/container/.env}"
export ENV_FILE
exec "$ROOT/scripts/deploy-profile.sh" container
