#!/usr/bin/env bash
# Deploy tv-hub using a named profile under deploy/profiles/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="${1:-}"

die() { echo "ERROR: $*" >&2; exit 1; }

[[ -n "$PROFILE" ]] || die "Usage: $0 <forest-lan|infra3-standalone|cdo-vpn>"

PROFILE_DIR="$ROOT/deploy/profiles/$PROFILE"
ENV_FILE="$PROFILE_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> No $ENV_FILE — running configure-deploy.sh"
  "$ROOT/scripts/configure-deploy.sh" --profile "$PROFILE" --force
fi

export ENV_FILE
export DEPLOY_PROFILE="$PROFILE"

# shellcheck disable=SC1090
source "$ENV_FILE"

echo "==> Profile: $PROFILE"
echo "    Hub: ${HUB_PUBLIC_URL}"

case "$PROFILE" in
  forest-lan)
    exec "$ROOT/scripts/deploy-forest-home.sh"
    ;;
  infra3-standalone|cdo-vpn)
    ENV_FILE="$ENV_FILE" DEPLOY_PROFILE="$PROFILE" exec "$ROOT/scripts/deploy-local-hub.sh"
    ;;
  *)
    die "Unknown profile: $PROFILE"
    ;;
esac
