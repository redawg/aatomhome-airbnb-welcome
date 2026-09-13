#!/usr/bin/env bash
# Create or update deploy profile .env — pick deploy type and hub listen port.
#
# Usage:
#   ./scripts/configure-deploy.sh --type container
#   ./scripts/configure-deploy.sh --type container --host 192.168.1.10 --port 8080
#   ./scripts/configure-deploy.sh --type container --mode remote --deploy-host 10.0.0.5 --port 18080
#   ./scripts/configure-deploy.sh --type homeassistant --host 192.168.1.10 --port 8080
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/deploy-env.sh
source "$ROOT/scripts/lib/deploy-env.sh"

DEPLOY_TYPE=""
PROFILE=""
HOST=""
PORT=""
MODE=""
DEPLOY_HOST_ARG=""
FORCE=0

die() { echo "ERROR: $*" >&2; exit 1; }

usage() {
  sed -n '2,12p' "$0"
  echo ""
  echo "Deploy types:"
  echo "  container      tv-hub Podman quadlet (local or remote SSH)"
  echo "  homeassistant  HA custom integration install only (or use HACS — docs/HACS.md)"
  echo "  custom         ad-hoc deploy/.env from deploy/env.template"
  echo ""
  echo "Options:"
  echo "  --type container|homeassistant|custom   (alias: --profile)"
  echo "  --host HUB_HOST   TVs/HA reach hub at this address"
  echo "  --port PORT       uvicorn listen port (default 8080)"
  echo "  --mode local|remote   container only — where quadlet runs"
  echo "  --deploy-host IP  container remote mode — SSH target for Podman"
  echo "  --force           overwrite existing .env"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --type|--profile) DEPLOY_TYPE="$2"; PROFILE="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    --deploy-host) DEPLOY_HOST_ARG="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown arg: $1 (try --help)" ;;
  esac
done

[[ -n "$DEPLOY_TYPE" ]] || die "Missing --type (container | homeassistant | custom)"

DEPLOY_TYPE="$(deploy_env_normalize_profile "$DEPLOY_TYPE")"
PROFILE="$DEPLOY_TYPE"

read -r DEFAULT_HOST DEFAULT_PORT <<< "$(deploy_env_profile_defaults "$PROFILE")"
HOST="${HOST:-$DEFAULT_HOST}"
PORT="${PORT:-$DEFAULT_PORT}"

if [[ "$PROFILE" == "custom" ]]; then
  ENV_PATH="$ROOT/deploy/.env"
  EXAMPLE="$ROOT/deploy/env.template"
else
  ENV_PATH="$ROOT/deploy/profiles/$PROFILE/.env"
  EXAMPLE="$ROOT/deploy/profiles/$PROFILE/env.example"
fi

[[ -f "$EXAMPLE" ]] || die "Missing example: $EXAMPLE"

if [[ -f "$ENV_PATH" && "$FORCE" != "1" ]]; then
  echo "Exists: $ENV_PATH (use --force to overwrite)"
  deploy_env_sync_urls_from_file "$ENV_PATH" || true
  echo "Current: DEPLOY_TYPE=${DEPLOY_TYPE:-unset} HUB_PUBLIC_URL=${HUB_PUBLIC_URL:-unset}"
  exit 0
fi

deploy_env_build_urls "$HOST" "$PORT"

mkdir -p "$(dirname "$ENV_PATH")"
cp "$EXAMPLE" "$ENV_PATH"

update_kv() {
  local key="$1" val="$2" file="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

update_kv "DEPLOY_TYPE" "$DEPLOY_TYPE" "$ENV_PATH"
update_kv "DEPLOY_PROFILE" "$PROFILE" "$ENV_PATH"
update_kv "HUB_HOST" "$HUB_HOST" "$ENV_PATH"
update_kv "HUB_LISTEN_PORT" "$HUB_LISTEN_PORT" "$ENV_PATH"
update_kv "HUB_PUBLIC_URL" "$HUB_PUBLIC_URL" "$ENV_PATH"
update_kv "HUB_GUEST_URL" "$HUB_GUEST_URL" "$ENV_PATH"

if [[ "$PROFILE" == "container" ]]; then
  MODE="${MODE:-local}"
  update_kv "CONTAINER_DEPLOY_MODE" "$MODE" "$ENV_PATH"
  if [[ -n "$DEPLOY_HOST_ARG" ]]; then
    update_kv "DEPLOY_HOST" "$DEPLOY_HOST_ARG" "$ENV_PATH"
    update_kv "CONTAINER_DEPLOY_MODE" "remote" "$ENV_PATH"
  elif [[ "$MODE" == "remote" && "$HOST" != "127.0.0.1" ]]; then
    update_kv "DEPLOY_HOST" "$HOST" "$ENV_PATH"
  fi
fi

echo "Configured: $ENV_PATH"
echo "  Type:     $DEPLOY_TYPE"
echo "  Listen:   ${HUB_HOST}:${HUB_LISTEN_PORT}"
echo "  Public:   $HUB_PUBLIC_URL"
[[ "$PROFILE" == "container" ]] && echo "  Mode:     $(grep ^CONTAINER_DEPLOY_MODE= "$ENV_PATH" | cut -d= -f2-)"
echo ""
if [[ "$PROFILE" == "homeassistant" ]]; then
  echo "HACS (recommended): Settings → HACS → Integrations → add this repo URL"
  echo "Manual: ./scripts/deploy-profile.sh homeassistant"
else
  echo "Next: edit secrets in $ENV_PATH, then:"
  echo "  ./scripts/deploy-profile.sh container"
fi
