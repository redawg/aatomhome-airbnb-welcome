#!/usr/bin/env bash
# Create or update a deploy profile .env — pick profile type and hub listen port.
#
# Usage:
#   ./scripts/configure-deploy.sh --profile infra3-standalone
#   ./scripts/configure-deploy.sh --profile forest-lan --port 8080 --host 172.16.255.250
#   ./scripts/configure-deploy.sh --profile custom --host 10.0.0.5 --port 9090
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/deploy-env.sh
source "$ROOT/scripts/lib/deploy-env.sh"

PROFILE=""
HOST=""
PORT=""
FORCE=0

die() { echo "ERROR: $*" >&2; exit 1; }

usage() {
  sed -n '2,12p' "$0"
  echo ""
  echo "Profiles: forest-lan | infra3-standalone | cdo-vpn | forest-ha | custom"
  echo "Defaults:  forest-lan → 172.16.255.250:8080"
  echo "           infra3-standalone / cdo-vpn → 172.16.1.36:18080 (avoids EcoFlow on :8080)"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown arg: $1 (try --help)" ;;
  esac
done

[[ -n "$PROFILE" ]] || die "Missing --profile"

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
  echo "Current: HUB_PUBLIC_URL=${HUB_PUBLIC_URL:-unset}"
  exit 0
fi

deploy_env_build_urls "$HOST" "$PORT"

mkdir -p "$(dirname "$ENV_PATH")"
cp "$EXAMPLE" "$ENV_PATH"

# shellcheck disable=SC1090
source "$ENV_PATH" 2>/dev/null || true
deploy_env_build_urls "$HOST" "$PORT"

# Update keys in .env (portable sed)
update_kv() {
  local key="$1" val="$2" file="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

update_kv "DEPLOY_PROFILE" "$PROFILE" "$ENV_PATH"
update_kv "HUB_HOST" "$HUB_HOST" "$ENV_PATH"
update_kv "HUB_LISTEN_PORT" "$HUB_LISTEN_PORT" "$ENV_PATH"
update_kv "HUB_PUBLIC_URL" "$HUB_PUBLIC_URL" "$ENV_PATH"
update_kv "HUB_GUEST_URL" "$HUB_GUEST_URL" "$ENV_PATH"

echo "Configured: $ENV_PATH"
echo "  Profile:  $PROFILE"
echo "  Listen:   ${HUB_HOST}:${HUB_LISTEN_PORT}"
echo "  Public:   $HUB_PUBLIC_URL"
echo ""
echo "Next: edit secrets in $ENV_PATH, then:"
echo "  ./scripts/deploy-profile.sh $PROFILE   # or deploy.sh for custom"
