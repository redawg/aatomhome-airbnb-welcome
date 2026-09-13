#!/usr/bin/env bash
# Deprecated wrapper — use configure-deploy.sh --type container --mode remote
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "NOTE: deploy-sample-property.sh → container profile with CONTAINER_DEPLOY_MODE=remote" >&2
ENV_FILE="${ENV_FILE:-$ROOT/deploy/profiles/container/.env}"
export ENV_FILE
exec "$ROOT/scripts/deploy-profile.sh" container
