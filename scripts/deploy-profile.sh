#!/usr/bin/env bash
# Deploy using a named type under deploy/profiles/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/deploy-env.sh
source "$ROOT/scripts/lib/deploy-env.sh"

PROFILE="${1:-}"
die() { echo "ERROR: $*" >&2; exit 1; }

[[ -n "$PROFILE" ]] || die "Usage: $0 <container|homeassistant>"

PROFILE="$(deploy_env_normalize_profile "$PROFILE")"

PROFILE_DIR="$ROOT/deploy/profiles/$PROFILE"
ENV_FILE="$PROFILE_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> No $ENV_FILE — running configure-deploy.sh"
  "$ROOT/scripts/configure-deploy.sh" --type "$PROFILE" --force
fi

export ENV_FILE
export DEPLOY_PROFILE="$PROFILE"
export DEPLOY_TYPE="$PROFILE"

# shellcheck disable=SC1090
source "$ENV_FILE"

echo "==> Deploy type: $PROFILE"
echo "    Hub: ${HUB_PUBLIC_URL:-n/a}"

case "$PROFILE" in
  container)
    exec "$ROOT/scripts/deploy-container.sh"
    ;;
  homeassistant)
    exec "$ROOT/scripts/deploy-homeassistant.sh"
    ;;
  *)
    die "Unknown deploy type: $PROFILE (use container or homeassistant)"
    ;;
esac
